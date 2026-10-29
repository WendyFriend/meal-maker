"""Unattended refinement of nutrition_lab with deepseek flash (Ollama cloud), within a token budget.

  1. Synonym audit   every synonym is checked twice with differently worded prompts; it is removed only
                     when both say it is wrong. Removed rows go to food_synonym_removed (the evaluator's
                     convention). Hand-added synonyms (origin 'manual') and ones whose removal was rejected
                     in the evaluator are never touched. If more than 14% would go, nothing is removed.
  2. Missing terms   deepseek proposes common names missing for each core/review food; deterministic
                     guards drop collisions, owned or pinned names, generic terms on a variant food, and
                     terms the resolver already answers with that food; a second pass verifies the rest.
                     Added rows get origin 'deepseek-refine'.
  3. Confidence      ~2,000 new realistic queries plus the evaluator's, resolved after steps 1-2, labelled
                     twice (a third pass breaks ties) with a prompt that agreed with hand labels 50/60 on hard
                     cases; train_confidence.py retrains with variant signals; the new model replaces
                     confidence_model.json only if it is at least as good on the hand-labelled hold-out and
                     confidence.mjs reproduces it exactly.

Every change is in refine_log (see 17_refine_log.sql for how to undo a run). Output: db/lab/out/refine/<run>/.
Resumable: re-run with the same run id and finished stages are skipped.

  python db\\lab\\refine_deepseek.py [run_id]
"""
from __future__ import annotations

import json
import math
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import thumb_studio as ts  # noqa: E402  (load_env / connect)

MODEL = "deepseek-v4.1-flash:cloud"
OLLAMA = "http://localhost:11434/api/chat"
BUDGET = 1_780_000                       # stop starting new calls here (user budget 2M, ~190k spent on tests and a stopped first run)
WORKERS = 4
VENV_PY = r"C:\Users\Kieran\icon-studio\.venv\Scripts\python.exe"
SCRATCH = Path(r"C:\Users\Kieran\AppData\Local\Temp\claude\c--Users-Kieran-mealmaker\94a08a08-f097-44e2-958d-7b27d832905c\scratchpad")
RUN_ID = sys.argv[1] if len(sys.argv) > 1 else "deepseek-refine-" + time.strftime("%Y%m%d-%H%M")
WORK = HERE / "out" / "refine" / RUN_ID
WORK.mkdir(parents=True, exist_ok=True)
REMOVAL_CAP = 0.14
MODS = {"fortified", "imitation", "meatless", "vegetarian", "vegan", "substitute", "replacement", "analog",
        "reduced", "low", "lite", "light", "free", "nonfat", "diet", "flavored", "flavor", "sweetened",
        "unsweetened", "protein", "edible", "podded", "babyfood", "infant", "toddler", "junior", "strained",
        "mix", "powder", "powdered", "instant", "dehydrated", "concentrate", "decaffeinated"}


def say(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    with (WORK / "run.log").open("a", encoding="utf8") as f:
        f.write(line + "\n")


def save(name, obj):
    tmp = WORK / (name + ".tmp")
    tmp.write_text(json.dumps(obj), encoding="utf8")
    ts.replace_retry(tmp, WORK / name)


def load(name):
    p = WORK / name
    return json.loads(p.read_text(encoding="utf8")) if p.exists() else None


# ----------------------------------------------------------------------------------- tokens


class BudgetExhausted(Exception):
    pass


class Budget:
    def __init__(self):
        self.lock = threading.Lock()
        prev = load("tokens.json") or {}
        self.inp, self.out, self.calls = prev.get("in", 0), prev.get("out", 0), prev.get("calls", 0)

    @property
    def used(self):
        return self.inp + self.out

    def add(self, i, o):
        with self.lock:
            self.inp += i
            self.out += o
            self.calls += 1
            save("tokens.json", {"in": self.inp, "out": self.out, "calls": self.calls})


budget = Budget()


def chat(prompt: str) -> str:
    if budget.used >= BUDGET:
        raise BudgetExhausted()
    body = json.dumps({"model": MODEL, "stream": False, "think": False, "options": {"temperature": 0},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    for attempt in range(5):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(OLLAMA, body, {"Content-Type": "application/json"}),
                                                  timeout=300).read())
            budget.add(d.get("prompt_eval_count", 0), d.get("eval_count", 0))
            return d["message"]["content"]
        except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
            say(f"call failed ({e}); retry {attempt + 1}")
            time.sleep(10 * (attempt + 1))
    return ""


def run_parallel(prompts, parse):
    """Ask every prompt (WORKERS at a time), return parsed answers in order; None where unusable or out of budget."""
    def one(p):
        try:
            return parse(chat(p))
        except BudgetExhausted:
            return "BUDGET"
    with ThreadPoolExecutor(WORKERS) as ex:
        out = list(ex.map(one, prompts))
    exhausted = any(o == "BUDGET" for o in out)
    return [None if o == "BUDGET" else o for o in out], exhausted


def numbered(text, pattern):
    """{line number: the pattern's groups} for replies shaped like '3. ok' or '3. bad - reason'."""
    return {int(m.group(1)): m.groups()[1:] for m in re.finditer(r"^[ \t]*\**(\d+)[.)]\**[ \t]*" + pattern, text, re.M | re.I)}


_local = threading.local()


def tdb():
    if getattr(_local, "db", None) is None:
        _local.db = ts.connect()
    return _local.db


def tokens(s):
    return [w for w in re.split(r"[^a-z0-9]+", s.lower()) if w]


# ----------------------------------------------------------------------------------- 1. audit

AUDIT = ("Each line is a food in a nutrition database and a search term attached to it, so that searching the term finds that food.\n"
         "{listing}\n\nFor each line: should a search for that term return this food? Answer ok if the term names this food: its "
         "everyday name, a common alternative, regional or foreign name used in English cooking, a natural shorter or longer way "
         "to say it, or a broad term that still correctly describes it. Answer bad only if the term is wrong for this food: it "
         "names a different food, a dish or product the food is only part of, a different preparation or variant that would "
         "clearly look up the wrong nutrition (for example 'cooked' on a raw food, 'nuggets' on plain fish), or is not a real "
         "search term.\n\nReply one line per item, in order, exactly: <number>. ok   or   <number>. bad - <reason in under 8 words>")
CONFIRM = ("In a nutrition app, each search term below is attached to a food, so typing the term returns that food and its "
           "nutrition.\n{listing}\n\nFor each line, think of someone typing exactly that term. Would getting this food be a "
           "mistake, giving them nutrition for the wrong thing? A broad term that still fits the food is fine. A different food, "
           "a dish the food is only part of, or a clearly different preparation or variant is a mistake. If you are not sure, "
           "answer fine.\n\n"
           "Reply one line per item, in order, exactly: <number>. fine   or   <number>. mistake - <reason in under 8 words>")


def stage_audit():
    if load("stage1_done.json"):
        say("stage 1 already done")
        return
    db = ts.connect()
    rows = db.execute("""SELECT s.id, s.fdc_id, s.term, s.origin, f.description FROM food_synonym s JOIN food f USING (fdc_id)
                         WHERE coalesce(s.origin, '') <> 'manual'
                           AND NOT EXISTS (SELECT 1 FROM eval.correction c WHERE c.kind = 'drop_synonym' AND c.status = 'rejected'
                                           AND c.fdc_id = s.fdc_id AND lower(c.term) = lower(s.term))
                         ORDER BY s.id""").fetchall()
    say(f"stage 1: auditing {len(rows):,} synonyms")
    first = load("stage1_first.json") or {}
    todo = [r for r in rows if str(r[0]) not in first]
    # Shuffled: in id order a batch is mostly one food's near-identical synonyms and the model waves them
    # all through (0.6% flagged against ~4% on a shuffled sample).
    random.Random(7).shuffle(todo)
    B = 20
    chunks = [todo[i:i + B] for i in range(0, len(todo), B)]
    for k in range(0, len(chunks), 20):
        group = chunks[k:k + 20]
        prompts = [AUDIT.replace("{listing}", "\n".join(f'{i + 1}. food: {r[4][:85]} | term: "{r[2]}"' for i, r in enumerate(c))) for c in group]
        answers, exhausted = run_parallel(prompts, lambda t: numbered(t, r"(ok|bad)\b[ \t]*[-:]?[ \t]*(.*)$"))
        for c, a in zip(group, answers):
            if a is None:
                continue
            for i, r in enumerate(c):
                m = a.get(i + 1)
                if m:
                    first[str(r[0])] = [m[0].lower(), (m[1] or "").strip()[:80]]
        save("stage1_first.json", first)
        say(f"  audit {len(first):,}/{len(rows):,} judged, {sum(v[0] == 'bad' for v in first.values()):,} flagged; tokens {budget.used:,}")
        if exhausted:
            say("  budget reached during audit")
            break
    by_id = {r[0]: r for r in rows}
    flagged = [by_id[int(k)] for k, v in first.items() if v[0] == "bad" and int(k) in by_id]
    second = load("stage1_second.json") or {}
    todo2 = [r for r in flagged if str(r[0]) not in second]
    chunks = [todo2[i:i + 20] for i in range(0, len(todo2), 20)]
    prompts = [CONFIRM.replace("{listing}", "\n".join(f'{i + 1}. term: "{r[2]}" -> food: {r[4][:85]}' for i, r in enumerate(c))) for c in chunks]
    answers, _ = run_parallel(prompts, lambda t: numbered(t, r"(fine|mistake)\b[ \t]*[-:]?[ \t]*(.*)$"))
    for c, a in zip(chunks, answers):
        if a is None:
            continue
        for i, r in enumerate(c):
            m = a.get(i + 1)
            if m:
                second[str(r[0])] = [m[0].lower(), (m[1] or "").strip()[:80]]
    save("stage1_second.json", second)
    confirmed = [r for r in flagged if second.get(str(r[0]), [""])[0] == "mistake"]
    say(f"stage 1: flagged {len(flagged):,}, confirmed by the second pass {len(confirmed):,}")
    with db.transaction():
        if len(confirmed) > REMOVAL_CAP * len(rows):
            db.execute("INSERT INTO refine_log (run_id, action, detail) VALUES (%s, 'note', %s)",
                       (RUN_ID, json.dumps({"stage": 1, "msg": f"removal cap hit: {len(confirmed)} of {len(rows)}; nothing removed"})))
            say("  REMOVAL CAP HIT: nothing removed; see stage1 files")
        elif confirmed:
            ids = [r[0] for r in confirmed]
            db.execute("""WITH gone AS (DELETE FROM food_synonym WHERE id = ANY(%s) RETURNING *)
                          INSERT INTO food_synonym_removed SELECT gone.*, now() FROM gone""", (ids,))
            for r in confirmed:
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'remove_synonym', %s, %s, %s)",
                           (RUN_ID, r[1], r[2], json.dumps({"synonym_id": r[0], "origin": r[3], "food": r[4],
                                                             "audit": first[str(r[0])][1], "confirm": second[str(r[0])][1]})))
    say(f"stage 1: removed {len(confirmed) if len(confirmed) <= REMOVAL_CAP * len(rows) else 0:,} synonyms")
    save("stage1_done.json", {"audited": len(first), "flagged": len(flagged), "confirmed": len(confirmed), "of": len(rows)})


# ----------------------------------------------------------------------------------- 2. additions

PROPOSE = ("Each line is a food in a nutrition database with the search terms that already find it.\n{listing}\n\n"
           "For each food, list up to 3 more search terms that ordinary people commonly type to mean exactly this food and that "
           "are missing from its list: its everyday name when the database name is technical, well-known alternative names "
           "(garbanzo for chickpea, aubergine for eggplant, courgette for zucchini), or regional names used in English cooking. "
           "Keep the food's state: do not offer 'cooked' terms for a raw food or the reverse. Do not give broad categories, "
           "different foods, dishes, brand names (unless the food is a branded product), misspellings, or anything already "
           "listed. Most foods need nothing new; say none when nothing obvious is missing.\n\n"
           "Reply one line per food, in order, exactly: <number>. term; term   or   <number>. none")
VERIFY = ("Each line is a food in a nutrition database and a proposed search term for it.\n{listing}\n\n"
          "For each line: is the term a name people commonly use for exactly this food, so that a search for the term should "
          "return it? Answer no if it is a different food or variety, a broader category, a different preparation, or not a "
          "common term.\n\nReply one line per item, in order, exactly: <number>. yes or <number>. no")


def clean_term(t):
    t = re.sub(r"\s+", " ", t.strip().strip("\"'`.*").lower())
    t = re.sub(r"^(and|or)\s+", "", t)
    if not (2 <= len(t) <= 40) or len(t.split()) > 6 or not re.search(r"[a-z]", t):
        return None
    return t


def guard(item):
    """Deterministic checks for one proposal; returns None to keep or a skip reason."""
    fdc, term, desc = item
    variant = (set(tokens(desc)) & MODS) - set(tokens(term))
    if variant:
        return "skip_variant"
    db = tdb()
    r = db.execute("""SELECT
          EXISTS (SELECT 1 FROM food_synonym s WHERE s.fdc_id = %(f)s AND lower(s.term) = %(t)s),
          EXISTS (SELECT 1 FROM food_name_any a WHERE a.fdc_id = %(f)s AND a.key = name_key(%(t)s)),
          EXISTS (SELECT 1 FROM food_name n WHERE n.key = name_key(%(t)s) AND n.fdc_id <> %(f)s),
          EXISTS (SELECT 1 FROM food_synonym s WHERE lower(s.term) = %(t)s AND s.fdc_id <> %(f)s),
          EXISTS (SELECT 1 FROM search_pin p WHERE p.key = name_key(%(t)s)),
          (SELECT r.fdc_id FROM resolve_food(%(t)s, 1) r LIMIT 1),
          EXISTS (SELECT 1 FROM food_synonym_removed x WHERE x.fdc_id = %(f)s AND lower(x.term) = %(t)s)""", {"f": fdc, "t": term}).fetchone()
    has_syn, has_name, owned, syn_else, pinned, top, removed_before = r
    if removed_before:
        return "skip_previously_removed"     # never undo a removal (yours in the evaluator, or an earlier run's)
    if has_syn or has_name:
        return "skip_exists"
    if owned:
        return "skip_owned_elsewhere"
    if syn_else:
        return "skip_collision"
    if pinned:
        return "skip_pinned"
    if top == fdc:
        return "skip_already_found"
    return None


def stage_add():
    if load("stage2_done.json"):
        say("stage 2 already done")
        return
    db = ts.connect()
    foods = db.execute("""SELECT f.fdc_id, f.description,
                                 coalesce((SELECT string_agg(term, '; ' ORDER BY term) FROM food_synonym s WHERE s.fdc_id = f.fdc_id), ''),
                                 coalesce((SELECT string_agg(name, '; ') FROM food_name n WHERE n.fdc_id = f.fdc_id), '')
                          FROM food f WHERE f.scope IN ('core', 'review') ORDER BY f.fdc_id""").fetchall()
    props = load("stage2_props.json") or {}
    todo = [f for f in foods if str(f[0]) not in props]
    random.Random(8).shuffle(todo)          # neighbouring fdc ids are near-identical foods; mixing keeps answers independent
    say(f"stage 2: {len(foods):,} core/review foods, {len(todo):,} still to ask")
    B = 20
    chunks = [todo[i:i + B] for i in range(0, len(todo), B)]
    exhausted = False
    for k in range(0, len(chunks), 20):
        group = chunks[k:k + 20]
        prompts = [PROPOSE.replace("{listing}", "\n".join(
            f"{i + 1}. {d[:90]} | has: {', '.join(x for x in (s, n) if x)[:160] or '(nothing)'}" for i, (_, d, s, n) in enumerate(c))) for c in group]
        answers, exhausted = run_parallel(prompts, lambda t: numbered(t, r"(.+)$"))
        for c, a in zip(group, answers):
            if a is None:
                continue
            for i, (fdc, _, _, _) in enumerate(c):
                m = a.get(i + 1)
                if not m:
                    continue
                rest = m[0].strip()
                terms = [] if rest.lower().startswith("none") else [t for t in (clean_term(x) for x in rest.split(";")) if t]
                props[str(fdc)] = terms[:3]
        save("stage2_props.json", props)
        say(f"  proposals for {len(props):,}/{len(foods):,} foods, {sum(len(v) for v in props.values()):,} terms; tokens {budget.used:,}")
        if exhausted:
            say("  budget reached during proposals")
            break
    desc = {f[0]: f[1] for f in foods}
    items = [(int(fdc), t, desc[int(fdc)]) for fdc, ts_ in props.items() for t in ts_ if int(fdc) in desc]
    # a term proposed for two different foods would be ambiguous: drop all of them
    owners = {}
    for fdc, t, _ in items:
        owners.setdefault(t, set()).add(fdc)
    skips = [(fdc, t, "skip_ambiguous_new") for fdc, t, _ in items if len(owners[t]) > 1]
    items = [x for x in items if len(owners[x[1]]) == 1]
    with ThreadPoolExecutor(WORKERS) as ex:
        verdicts = list(ex.map(guard, items))
    skips += [(fdc, t, v) for (fdc, t, _), v in zip(items, verdicts) if v]
    survivors = [x for x, v in zip(items, verdicts) if not v]
    say(f"stage 2: {len(items) + len([s for s in skips if s[2] == 'skip_ambiguous_new']):,} proposals, {len(survivors):,} pass the guards")
    chunks = [survivors[i:i + 30] for i in range(0, len(survivors), 30)]
    prompts = [VERIFY.replace("{listing}", "\n".join(f'{i + 1}. food: {d[:90]} | term: "{t}"' for i, (_, t, d) in enumerate(c))) for c in chunks]
    answers, _ = run_parallel(prompts, lambda t: numbered(t, r"(yes|no)\b"))
    accepted = []
    for c, a in zip(chunks, answers):
        for i, x in enumerate(c):
            m = a.get(i + 1) if a else None
            if m and m[0].lower() == "yes":
                accepted.append(x)
            else:
                skips.append((x[0], x[1], "skip_not_verified" if m else "skip_unanswered"))
    with db.transaction():
        added = 0
        for fdc, t, d in accepted:
            r = db.execute("""INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun, rated_by, rated_at)
                              VALUES (%s, %s, 'deepseek-refine', 1.0, false, %s, now())
                              ON CONFLICT (fdc_id, term) DO NOTHING RETURNING id""", (fdc, t, f"{MODEL}/{RUN_ID}")).fetchone()
            if r:
                added += 1
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'add_synonym', %s, %s, %s)",
                           (RUN_ID, fdc, t, json.dumps({"synonym_id": r[0], "food": d})))
        for fdc, t, why in skips:
            db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term) VALUES (%s, %s, %s, %s)", (RUN_ID, why, fdc, t))
        db.execute("DELETE FROM food_synonym_key")
        db.execute("INSERT INTO food_synonym_key SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> ''")
    counts = {}
    for _, _, why in skips:
        counts[why] = counts.get(why, 0) + 1
    say(f"stage 2: added {added:,} synonyms; skipped {counts}")
    save("stage2_done.json", {"added": added, "skipped": counts, "proposed": sum(len(v) for v in props.values())})


# ----------------------------------------------------------------------------------- 3. confidence

SEEDS = ["breakfast foods", "baking ingredients", "Indian cooking", "Chinese cooking", "Japanese cooking", "Mexican cooking",
         "Italian cooking", "Middle Eastern cooking", "Thai and Vietnamese cooking", "fast food meals", "snacks and chips",
         "candy and chocolate", "beef cuts", "pork and ham", "chicken and turkey", "seafood and fish", "game meats",
         "vegetables", "leafy greens and herbs", "fruit", "dried fruit and nuts", "beans and lentils", "grains and rice",
         "pasta and noodles", "bread and baked goods", "breakfast cereal", "cheese", "milk, cream and yogurt", "eggs",
         "oils and fats", "sauces and condiments", "spices", "soups and stews", "frozen meals", "baby food",
         "soft drinks and juice", "coffee and tea", "beer, wine and spirits", "desserts and ice cream", "salads and sandwiches",
         "vegetarian and vegan foods", "sports and diet products", "pizza and takeaway", "pickles and preserves"]
GEN = ("Write 45 different things people type into the ingredient search box of a recipe and nutrition app, all about {seed}. "
       "Mix plain ingredient names, everyday phrasing with a preparation or form (like 'boiled eggs' or 'canned tuna'), some "
       "dish or brand names, and a few with typos. One per line, no numbering, no explanations.")
LABEL = ("Each item is a search typed into a nutrition app and the top result it returned.\n{listing}\n\n"
         "For each item, is the result what the person most likely meant?\n"
         "yes: the result is that food, or an ordinary version of it in any preparation (raw, cooked, canned, dried, frozen, "
         "salted or not); or, when the search names a dish, product, brand or a variant (beef taco, big mac, granola bar, diet "
         "soda, low fat yogurt), the result is that dish, product, brand or variant. For an ambiguous search, one common meaning "
         "is fine.\n"
         "no: the result is a different food; contains the searched food only as an ingredient; is a variant the search did not "
         "ask for (fortified, imitation, meatless, flavoured, sweetened, reduced fat, baby food, a different cut or kind); or "
         "matches only some of the words of a multi-word search.\n\n"
         "Reply with one line per item, in order, exactly: <number>. yes or <number>. no")
COLS = ("fdc_id", "description", "scope", "score", "matched_via", "tier", "n_routes", "coverage", "desc_words")


def resolve_one(q):
    try:
        rows = tdb().execute("SELECT fdc_id, description, scope, score, matched_via, tier, n_routes, coverage, desc_words "
                             "FROM resolve_food_conf(%s, 8)", (q,)).fetchall()
        return [dict(zip(COLS, r)) for r in rows]
    except Exception as e:  # noqa: BLE001
        say(f"resolve failed for {q!r}: {e}")
        _local.db = None
        return []


def label_pass(items, seed):
    order = list(range(len(items)))
    random.Random(seed).shuffle(order)
    chunks = [order[i:i + 30] for i in range(0, len(order), 30)]
    prompts = [LABEL.replace("{listing}", "\n".join(f'{i + 1}. search "{items[j]["query"]}" -> result: {items[j]["rows"][0]["description"][:90]}'
                                                    for i, j in enumerate(c))) for c in chunks]
    answers, exhausted = run_parallel(prompts, lambda t: numbered(t, r"(yes|no)\b"))
    out = [None] * len(items)
    for c, a in zip(chunks, answers):
        if not a:
            continue
        for i, j in enumerate(c):
            m = a.get(i + 1)
            if m:
                out[j] = 1 if m[0].lower() == "yes" else 0
    return out, exhausted


def stage_confidence():
    if load("stage3_done.json"):
        say("stage 3 already done")
        return
    db = ts.connect()
    hand = json.loads((SCRATCH / "hand_data.json").read_text(encoding="utf8"))
    zeros = {8, 11, 22, 26, 27, 30, 76, 78, 79, 84, 85, 93, 94}
    blind = json.loads((SCRATCH / "blind_sample.json").read_text(encoding="utf8"))
    mine = json.loads((SCRATCH / "blind_mine.json").read_text(encoding="utf8"))
    holdq = [(h["query"], 0 if (i + 1) in zeros else 1, h["cand"][0]["fdc"]) for i, h in enumerate(hand)]
    holdq += [(b["query"], m, b["cand"][0]["fdc"]) for b, m in zip(blind, mine)]
    held = {q.lower() for q, _, _ in holdq}

    queries = load("stage3_queries.json")
    if queries is None:
        ev = [r[0] for r in db.execute("SELECT DISTINCT query FROM eval.judged WHERE pipeline = 'search'").fetchall()]
        gen, _ = run_parallel([GEN.replace("{seed}", s) for s in SEEDS],
                              lambda t: [re.sub(r"^\s*[-*\d.)]+\s*", "", l).strip().strip('"') for l in t.splitlines() if l.strip()])
        new = [q for g in gen if g for q in g if 2 <= len(q) <= 60]
        seen, queries = set(), []
        for q in ev + new:
            k = q.lower().strip()
            if k and k not in seen and k not in held:
                seen.add(k)
                queries.append(q.strip())
        save("stage3_queries.json", queries)
        say(f"stage 3: {len(ev):,} evaluator queries + {len(new):,} generated -> {len(queries):,} unique (hold-out excluded)")
    items = load("stage3_items.json")
    if items is None:
        with ThreadPoolExecutor(WORKERS) as ex:
            rows = list(ex.map(resolve_one, queries))
        items = [{"query": q, "rows": r} for q, r in zip(queries, rows) if r]
        save("stage3_items.json", items)
        say(f"stage 3: resolved {len(items):,} queries with results")
    labels = load("stage3_labels.json") or {}
    for name, seed in (("a", 11), ("b", 22)):
        if name not in labels:
            labels[name], ex_ = label_pass(items, seed)
            save("stage3_labels.json", labels)
            say(f"  label pass {name}: {sum(x is not None for x in labels[name]):,} labelled; tokens {budget.used:,}")
    split = [i for i, (a, b) in enumerate(zip(labels["a"], labels["b"])) if a is not None and b is not None and a != b]
    if "c" not in labels and split:
        sub = [items[i] for i in split]
        c, _ = label_pass(sub, 33)
        labels["c"] = {str(i): v for i, v in zip(split, c)}
        save("stage3_labels.json", labels)
    final = []
    for i, it in enumerate(items):
        a, b = labels["a"][i], labels["b"][i]
        if a is not None and a == b:
            final.append(dict(it, label=a))
        elif a is not None and b is not None:
            c = labels.get("c", {}).get(str(i))
            if c is not None:
                final.append(dict(it, label=c))
    agree = sum(1 for a, b in zip(labels["a"], labels["b"]) if a is not None and a == b)
    both = sum(1 for a, b in zip(labels["a"], labels["b"]) if a is not None and b is not None)
    say(f"stage 3: labels for {len(final):,} queries; passes a and b agreed on {agree:,}/{both:,}")
    save("stage3_dataset.json", final)
    with ThreadPoolExecutor(WORKERS) as ex:
        hrows = list(ex.map(resolve_one, [q for q, _, _ in holdq]))
    save("stage3_holdout.json", [{"query": q, "label": l, "old_top": t, "rows": r} for (q, l, t), r in zip(holdq, hrows) if r])
    current = HERE / "confidence_model.json"
    cand = WORK / "confidence_model.candidate.json"
    parity = WORK / "parity_cases.json"
    tr = subprocess.run([VENV_PY, str(HERE / "train_confidence.py"), str(WORK / "stage3_dataset.json"), str(WORK / "stage3_holdout.json"),
                         str(current), str(cand), str(parity)], capture_output=True, text=True, timeout=3600)
    (WORK / "train_report.json").write_text(tr.stdout + ("\n" + tr.stderr if tr.returncode else ""), encoding="utf8")
    if tr.returncode != 0:
        say("training failed; model unchanged: " + tr.stderr[-300:])
        save("stage3_done.json", {"installed": False, "why": "training failed"})
        return
    rep = json.loads(tr.stdout)
    pr = subprocess.run(["node", str(HERE / "confidence_parity.mjs"), str(cand), str(parity)], capture_output=True, text=True, timeout=600)
    parity_ok = pr.returncode == 0
    new_h = rep["base + variant features"]["holdout_auc"]
    cur_h = rep["current_model"]["holdout_auc"]
    install = parity_ok and new_h is not None and cur_h is not None and new_h >= cur_h - 0.005 and len(final) >= 1000
    why = f"candidate hold-out AUC {new_h} vs current {cur_h}; parity {'ok' if parity_ok else 'FAILED ' + pr.stdout.strip()}; {len(final)} training labels"
    if install:
        shutil.copy2(current, HERE / "confidence_model.prev.json")
        shutil.copy2(cand, current)
    with db.transaction():
        db.execute("INSERT INTO refine_log (run_id, action, detail) VALUES (%s, 'note', %s)",
                   (RUN_ID, json.dumps({"stage": 3, "installed": install, "why": why, "report": rep})))
    say(f"stage 3: model {'INSTALLED' if install else 'kept as it was'} ({why})")
    save("stage3_done.json", {"installed": install, "why": why})


# ----------------------------------------------------------------------------------- report


def report():
    db = ts.connect()
    s1, s2, s3 = load("stage1_done.json") or {}, load("stage2_done.json") or {}, load("stage3_done.json") or {}
    rem = db.execute("SELECT term, detail->>'food', detail->>'confirm' FROM refine_log WHERE run_id = %s AND action = 'remove_synonym' ORDER BY random() LIMIT 40", (RUN_ID,)).fetchall()
    add = db.execute("SELECT term, detail->>'food' FROM refine_log WHERE run_id = %s AND action = 'add_synonym' ORDER BY random() LIMIT 40", (RUN_ID,)).fetchall()
    tr = (WORK / "train_report.json").read_text(encoding="utf8") if (WORK / "train_report.json").exists() else "(none)"
    lines = [f"# deepseek refinement {RUN_ID}", "",
             f"Tokens: {budget.used:,} ({budget.inp:,} in, {budget.out:,} out) over {budget.calls:,} calls; budget {BUDGET:,}.", "",
             "## 1. Synonym audit", json.dumps(s1), "", "Sample of removals (term | food | why):"]
    lines += [f"- {t} | {f[:70]} | {w}" for t, f, w in rem]
    lines += ["", "## 2. Added synonyms", json.dumps(s2), "", "Sample of additions (term | food):"]
    lines += [f"- {t} | {f[:80]}" for t, f in add]
    lines += ["", "## 3. Confidence model", json.dumps(s3), "", "```", tr.strip()[:6000], "```", "",
              "Every change is in the refine_log table (run_id = this run). 17_refine_log.sql shows how to undo it.",
              "The previous model, if replaced, is db/lab/confidence_model.prev.json."]
    (WORK / "report.md").write_text("\n".join(lines), encoding="utf8")
    (HERE / "out" / "refine" / "LATEST.txt").write_text(str(WORK), encoding="utf8")


def main():
    ts.load_env()
    say(f"run {RUN_ID} starting; tokens already used {budget.used:,}")
    with ts.connect() as db:
        db.execute((HERE / "17_refine_log.sql").read_text(encoding="utf8"))
    for stage in (stage_audit, stage_add, stage_confidence):
        try:
            stage()
        except BudgetExhausted:
            say(f"{stage.__name__}: budget exhausted")
        except Exception:  # noqa: BLE001
            say(f"{stage.__name__} CRASHED:\n{traceback.format_exc()}")
    try:
        report()
    except Exception:  # noqa: BLE001
        say("report CRASHED:\n" + traceback.format_exc())
    say(f"run finished; tokens {budget.used:,}")
    (WORK / "DONE").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf8")


if __name__ == "__main__":
    main()
