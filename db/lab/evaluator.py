"""Search evaluator for the nutrition lab.

    python db/lab/evaluator.py

A local model checks the lab's search and names, and proposes fixes. Three
pipelines, picked in the window (Mixed takes turns between them):

  Search check   It thinks up everyday food names (and works through the names we
                 already own) and runs each through the resolver. "Ideas from"
                 picks the topic at random: a built-in list, the lab's food
                 categories, our arbitrated nouns ("cheese" -> cheddar,
                 grated parmesan...), or a mix. For each it
                 first says what the searcher most likely wants, without seeing
                 any results, then judges the top result against that. If the
                 top result is wrong, each runner-up is judged on its own; the
                 first that passes (in the resolver's order) is proposed.
  Reachability   The other way round: a random food, what would a shopper type
                 to find it, and does that search land somewhere sensible?
                 Finds foods that no search reaches.
  Synonym audit  Each food_synonym row (made by an earlier GLM run): is it really
                 a name for that food? Only a synonym that fails two differently
                 worded questions is proposed for removal.
  Second opinion Reviews pending proposals with differently worded questions:
                 a search fix is approved only if the proposed food passes and
                 the current one fails; a synonym removal is asked two more
                 ways. Gives approve / reject / unsure per model; nothing is
                 applied. A different model from the proposer checks best.

Everything it writes goes to the eval schema (db/lab/10_eval.sql). The worker
sees its own corrections straight away, but the lab only changes when you
accept them on the Review tab and press Commit: search corrections go into
search_pin, removed synonyms are copied to food_synonym_removed first.

Two ways to run it, both only while this window is open:
  Manual  Start and Stop.
  Auto    tick "Run when the GPU is idle": the worker starts after the GPU has
          been idle for two minutes and stops as soon as something else uses it.

Safeguards: nothing is judged twice by the same model on the same resolver; a
run stops itself if most of its recent answers say something is wrong (a broken
model or prompt looks like that), or once it has proposed MAX_PENDING changes.
With EVAL_DATABASE_URL set (script/setup-evaluator-db.ps1) the worker logs in
as a role that cannot write anything outside the eval schema.
"""

from __future__ import annotations

import json
import os
import queue
import random
import re
import subprocess
import threading
import time
import tkinter as tk
import urllib.request
from collections import deque
from pathlib import Path
from tkinter import messagebox, ttk

import psycopg

ROOT = Path(__file__).resolve().parents[2]
LAB_DB = os.environ.get("LAB_DATABASE", "nutrition_lab")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
LMSTUDIO = os.environ.get("LMSTUDIO_URL", "http://localhost:1234")
NAMING_STATUS = ROOT / "db" / "lab" / "out" / "naming-status.json"

CANDIDATES = 15  # results shown to the model when the top one is wrong
CANDIDATES_SHOWN = 10  # runners-up judged when the top result is wrong
SEARCH_BATCH = 20  # searches judged per batch
METHOD = "-m2"  # bump when the judging method changes, so everything is judged again
BATCH = 25  # synonyms per audit call
MAX_PENDING = 300  # a run stops after proposing this many changes
BREAKER_WINDOW = 40  # the circuit breaker looks at this many recent search verdicts
BREAKER_WRONG = 0.7  # and stops the run if this share of them were not "correct"
SYN_BREAKER = 0.6  # or if this share of the last 100 synonyms audited were flagged
IDLE_UTIL = 10  # % GPU use below which the card counts as idle
IDLE_POLLS = 8  # polls in a row (15 s apart) before Auto starts the worker
BUSY_UTIL = 25  # % GPU use, measured while the worker pauses, that means someone else wants it
MIN_FREE_MB = 9000  # free VRAM Auto needs before it starts

PIPELINES = {"Search check": "search", "Reachability": "reach", "Synonym audit": "syn",
             "Second opinion": "review", "Mixed (take turns)": "mixed"}
# Where the search check gets its ideas for names to try.
IDEAS = {"General list": "general", "Database categories": "category", "Our nouns": "noun", "Mix": "mix"}
NOT_BRANDS = {"usda", "usa", "nfs", "ns", "bbq", "uht", "rtd", "cla"}
CATEGORIES = [
    "fruit", "vegetables", "dairy and eggs", "beef, pork and lamb cuts", "poultry", "fish and seafood",
    "bread and baking", "breakfast foods", "snacks", "drinks", "condiments and sauces", "grains and pasta",
    "beans, lentils and nuts", "herbs and spices", "frozen foods", "canned foods", "deli and cured meats",
    "sweets and desserts", "oils and fats", "takeaway and restaurant dishes",
]


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf8").splitlines():
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def connect(worker: bool = False) -> psycopg.Connection:
    """The lab database. The worker uses EVAL_DATABASE_URL when it is set."""
    url = os.environ.get("EVAL_DATABASE_URL") if worker else None
    if url:
        return psycopg.connect(url, autocommit=True)
    return psycopg.connect(os.environ["NUTRITION_DATABASE_URL"], dbname=LAB_DB, autocommit=True)


def strip_brands(description: str) -> str:
    """ALL-CAPS words are brands in this data; the model judges the food, not the label."""
    out = re.sub(r"\b[A-Z][A-Z'&.-]{2,}\b",
                 lambda m: m.group() if re.sub(r"[^a-z]", "", m.group().lower()) in NOT_BRANDS else " ", description)
    return re.sub(r"\s+", " ", re.sub(r"\s+,", ",", out)).strip(" ,")


# --------------------------------------------------------------------- models


def _post(url: str, body: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def _get(url: str, timeout: int = 5) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as res:
        return json.loads(res.read())


def list_models() -> list[str]:
    """Every model the two local servers offer, as 'endpoint: model'."""
    found = []
    try:
        found += [f"ollama: {m['name']}" for m in _get(f"{OLLAMA}/api/tags")["models"]]
    except OSError:
        pass
    try:
        found += [f"lmstudio: {m['id']}" for m in _get(f"{LMSTUDIO}/v1/models")["data"]]
    except OSError:
        pass
    return found


class Model:
    def __init__(self, choice: str):
        self.endpoint, self.name = choice.split(": ", 1)

    def ask(self, prompt: str, temperature: float = 0) -> str:
        if self.endpoint == "lmstudio":
            out = _post(f"{LMSTUDIO}/v1/chat/completions", {
                "model": self.name, "temperature": temperature, "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            })
            return out["choices"][0]["message"].get("content") or ""
        out = _post(f"{OLLAMA}/api/chat", {
            "model": self.name, "stream": False, "think": False, "keep_alive": "2m",
            "options": {"temperature": temperature, "num_ctx": 8192},
            "messages": [{"role": "user", "content": prompt}],
        })
        return out.get("message", {}).get("content") or ""

    def ask_lines(self, items: list, prompt_for) -> list[str]:
        """One numbered answer per item. A batch the model miscounts is split until it answers."""
        text = self.ask(prompt_for(items))
        lines = [re.sub(r"^\s*\d+\.\s*", "", l).strip() for l in text.splitlines() if re.match(r"^\s*\d+\.", l)]
        if len(lines) == len(items):
            return lines
        if len(items) == 1:
            return [""]
        half = (len(items) + 1) // 2
        return self.ask_lines(items[:half], prompt_for) + self.ask_lines(items[half:], prompt_for)


# ------------------------------------------------------------------------ gpu


def gpu() -> tuple[int, int] | None:
    """(utilisation %, free VRAM MB), or None without nvidia-smi."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).stdout
        util, free = out.strip().splitlines()[0].split(",")
        return int(util), int(free)
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def naming_running() -> bool:
    """The naming pipeline shares the GPU; Auto stays out of its way."""
    try:
        status = json.loads(NAMING_STATUS.read_text(encoding="utf8"))
    except (OSError, ValueError):
        return False
    if status.get("phase") in ("done", "paused", "error"):
        return False
    out = subprocess.run(["tasklist", "/FI", f"PID eq {status.get('pid')}", "/NH"], capture_output=True, text=True,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    return str(status.get("pid")) in out


# --------------------------------------------------------------------- prompts


def noun_ideas_prompt(noun: str) -> str:
    return (f"List up to 10 things people commonly type into a nutrition app's search box when looking for a "
            f"kind of {noun}: well-known varieties, cuts, forms and preparations, plus the plain word itself if "
            "people search for it. Only realistic searches; fewer is fine. Plain common names of one to three "
            "words, lowercase, no brands.\n\n"
            "One per line, nothing else.")


def generate_prompt(category: str, letter: str) -> str:
    return (f"List 20 different everyday foods or ingredients in the category \"{category}\" that a person might "
            f"type into a nutrition app's search box. Prefer ones starting with the letter {letter.upper()} where "
            "you can. Plain common names of one to three words, lowercase, no brands.\n\n"
            "One per line, nothing else.")


def reach_prompt(description: str) -> str:
    return (f"A shopper wants this food from a nutrition database:\n{strip_brands(description)}\n\n"
            "What would they most likely type into the search box to find it? One to four words, lowercase, "
            "no brand, no cooking or lab details unless they matter.\n\nReply with the search words only.")


def synonym_prompt(rows: list[dict]) -> str:
    listing = "\n".join(f'{i + 1}. is "{r["term"]}" a synonym for: {strip_brands(r["description"])}'
                        for i, r in enumerate(rows))
    return (f"Each line gives a name and a food database entry.\n{listing}\n\nFor each line answer yes or no.\n\n"
            "Reply with a numbered list, yes or no on each line, in the same order, nothing else:\n1. yes")


def happy_prompt(rows: list[dict]) -> str:
    listing = "\n".join(f'{i + 1}. searched "{r["term"]}" and got: {strip_brands(r["description"])}'
                        for i, r in enumerate(rows))
    return (f"Each line gives what someone typed into a food search box and a food database entry.\n{listing}\n\n"
            "For each line: would this person be happy with this result? Answer yes if it is the food they asked "
            "for, or an ordinary version of it.\n\n"
            "Reply with a numbered list, yes or no on each line, in the same order, nothing else:\n1. yes")


def ideal_many_prompt(items: list[dict]) -> str:
    listing = "\n".join(f'{i + 1}. "{x["query"]}"' for i, x in enumerate(items))
    return ("Each line is what someone typed, on its own, into a nutrition database's search box.\n"
            f"{listing}\n\n"
            "For each one: what food do they most likely want? Give the food's plain, everyday name and, only if "
            "the search itself implies one, its preparation (e.g. 'cooked rice', 'canned beans'). If the search is "
            "just the plain food name, don't guess a cooked/raw/dry/canned state -- any of those are fine.\n\n"
            "Reply with a numbered list, one short line each, in the same order, nothing else:\n1. food - description")


def match_many_prompt(items: list[dict]) -> str:
    listing = "\n".join(f'{i + 1}. searched "{x["query"]}" (most likely wants: {x["want"]})\n'
                        f'   result: {strip_brands(x["description"])}' for i, x in enumerate(items))
    return ("Each item is a search in a nutrition database, what the person most likely wants, and one result.\n"
            f"{listing}\n\n"
            "For each item: is this result the food they want? Count it as a match if it is a plain, ordinary "
            "version of that food, in ANY common preparation state (raw, dry, cooked, canned, frozen), salted or "
            "unsalted, unless the search itself asked for a specific one. It is NOT a match if the result is a "
            "different food; a dish, product or drink that only contains it; or the plain food specially "
            "manufactured or modified -- reduced-sodium or low-sodium (not merely unsalted), fortified, flavoured, "
            "sweetened, diet or light, injected with a solution or brine, or similar.\n\n"
            "Reply with a numbered list, yes or no on each item, in the same order, nothing else:\n1. yes")


def reach_many_prompt(foods: list[dict]) -> str:
    listing = "\n".join(f"{i + 1}. {strip_brands(f['description'])}" for i, f in enumerate(foods))
    return ("Each line is a food from a nutrition database.\n"
            f"{listing}\n\n"
            "For each food: what would a shopper most likely type into the search box to find it? One to four "
            "words, lowercase, no brand, no cooking or lab details unless they matter.\n\n"
            "Reply with a numbered list, the search words only, in the same order, nothing else:\n1. search words")


def name_used_prompt(rows: list[dict]) -> str:
    listing = "\n".join(f'{i + 1}. "{r["term"]}" for: {strip_brands(r["description"])}' for i, r in enumerate(rows))
    return ("Each line gives a name and a food database entry.\n"
            f"{listing}\n\n"
            "For each line: do people really use this name for this food, so that someone typing it would expect "
            "to find this food? Answer yes or no.\n\n"
            "Reply with a numbered list, yes or no on each line, in the same order, nothing else:\n1. yes")


# ---------------------------------------------------------------------- worker


class Worker(threading.Thread):
    """Runs the chosen pipeline until stopped. Talks to the window only through `events`."""

    def __init__(self, choice: str, pipeline: str, mode: str, events: queue.Queue, ideas: str = "general"):
        super().__init__(daemon=True)
        self.model = Model(choice)
        self.choice = choice
        self.pipeline = pipeline
        self.ideas = ideas
        self.mode = mode
        self.events = events
        self.stop_event = threading.Event()
        self.reason = "stopped"
        self.recent = deque(maxlen=BREAKER_WINDOW)
        self.recent_syn = deque(maxlen=100)
        self.buffer: list[tuple[str, str]] = []
        self.generated_round = 0
        self.exhausted: set[str] = set()
        self.taken: set[str] = set()

    def say(self, kind: str, text: str) -> None:
        self.events.put((kind, text))

    def stop(self, reason: str = "stopped") -> None:
        self.reason = reason
        self.stop_event.set()

    def run(self) -> None:
        try:
            self.db = connect(worker=True)
            self.version = self.db.execute(
                "SELECT md5(pg_get_functiondef('resolve_food(text,integer)'::regprocedure))").fetchone()[0][:12] + METHOD
            self.run_id = self.db.execute(
                "INSERT INTO eval.run (model, endpoint, mode) VALUES (%s, %s, %s) RETURNING id",
                (self.model.name, self.model.endpoint, self.mode)).fetchone()[0]
            self.say("log", f"run {self.run_id}: {self.choice}, {self.pipeline}, {self.mode}, resolver {self.version}")
            steps = 0
            order = ["search", "reach", "syn", "review"] if self.pipeline == "mixed" else [self.pipeline]
            while not self.stop_event.is_set():
                live = [p for p in order if p not in self.exhausted]
                if not live:
                    self.stop("nothing left to judge")
                    break
                step = live[steps % len(live)]
                worked = {"search": self.search_step, "reach": self.reach_step, "syn": self.syn_step,
                          "review": self.review_step}[step]()
                # In Mixed, the second opinion often has nothing to do yet; it only
                # counts as finished once the other pipelines are.
                waiting = step == "review" and len(live) > 1
                if not worked and not waiting and not self.stop_event.is_set():
                    self.exhausted.add(step)
                    self.say("log", f"{step}: nothing left for this model")
                steps += 1
                if self.tripped():
                    break
                if self.mode == "auto" and steps % 10 == 0 and self.gpu_wanted():
                    self.stop("GPU in use by something else")
            self.db.execute("UPDATE eval.run SET ended_at = now(), stop_reason = %s WHERE id = %s",
                            (self.reason, self.run_id))
        except Exception as error:  # noqa: BLE001 - shown in the window, the app keeps going
            self.reason = f"error: {error}"
        self.say("stopped", self.reason)

    # -- shared

    def search(self, query: str) -> list[dict]:
        """The resolver with this evaluator's own open corrections laid over it."""
        rows = [{"fdc_id": r[0], "description": r[1], "via": "overlay"} for r in self.db.execute(
            """SELECT c.fdc_id, f.description FROM eval.correction c JOIN food f USING (fdc_id)
               WHERE c.kind = 'pin' AND c.key = name_key(%s)
                 AND (c.status = 'accepted' OR (c.status = 'pending' AND c.method = %s)) LIMIT 1""",
            (query, METHOD))]
        seen = {r["fdc_id"] for r in rows}
        for fdc_id, description, via in self.db.execute(
                "SELECT fdc_id, description, matched_via FROM resolve_food(%s, %s)", (query, CANDIDATES + 1)):
            if fdc_id not in seen:
                rows.append({"fdc_id": fdc_id, "description": description, "via": via})
                seen.add(fdc_id)
        return rows[:CANDIDATES + 1]

    def record(self, key: str, query: str, source: str, pipeline: str, verdict: str,
               resolved: int | None, chosen: int | None, target: int | None = None) -> None:
        self.db.execute(
            """INSERT INTO eval.judged (key, query, source, model, resolver_version, verdict, resolved_fdc, chosen_fdc,
                                        run_id, pipeline, target_fdc)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
            (key, query, source, self.model.name, self.version, verdict, resolved, chosen, self.run_id, pipeline,
             target))

    def done(self, key: str) -> bool:
        return self.db.execute(
            "SELECT 1 FROM eval.judged WHERE key = %s AND model = %s AND resolver_version = %s",
            (key, self.model.name, self.version)).fetchone() is not None

    def propose_pin(self, query: str, food: dict, was: dict) -> None:
        self.propose("pin", self.db.execute("SELECT name_key(%s)", (query,)).fetchone()[0], query, food["fdc_id"],
                     was["fdc_id"])

    def propose(self, kind: str, key: str, query: str, fdc_id: int, was: int | None, term: str | None = None) -> None:
        open_row = self.db.execute(
            "SELECT id, fdc_id, models FROM eval.correction WHERE key = %s AND status IN ('pending', 'accepted')",
            (key,)).fetchone()
        if open_row is None:
            self.db.execute(
                """INSERT INTO eval.correction (kind, key, query, term, fdc_id, was_fdc, models, run_id, method)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (kind, key, query, term, fdc_id, was, [self.model.name], self.run_id, METHOD))
        elif open_row[1] == fdc_id:
            if self.model.name not in open_row[2]:
                self.db.execute("UPDATE eval.correction SET models = models || %s WHERE id = %s",
                                ([self.model.name], open_row[0]))
        else:
            self.db.execute("UPDATE eval.correction SET conflict = true WHERE id = %s", (open_row[0],))

    def assess_many(self, items: list[dict]) -> None:
        """Judge a batch of searches. Each item has 'query' (and 'target' for
        reachability); this fills in 'rows', 'verdict' and 'chosen', and proposes
        a fix when the top result is wrong and a runner-up is right.

        The model is never asked to pick from a list: offered one, it picks
        something even when nothing fits ("hibiscus" -> hibiscus tea). It first
        says what the searcher most likely wants, without seeing any results,
        then each result is judged on its own against that. When several
        runners-up pass, the resolver's own order decides."""
        for it in items:
            it["rows"] = self.search(it["query"])
            it["chosen"] = None
        live = []
        for it in items:
            rows = it["rows"]
            if not rows:
                it["verdict"] = "empty"
            elif it.get("target") is not None and rows[0]["fdc_id"] == it["target"]:
                it["verdict"], it["chosen"] = "correct", rows[0]
            else:
                live.append(it)
        if not live:
            return

        self.say("status", f"Working out what {len(live)} searches are after...")
        wants = self.model.ask_lines([{"query": it["query"]} for it in live], ideal_many_prompt)
        for it, want in zip(live, wants):
            it["want"] = want or it["query"]

        # The top result of every search, in one call.
        self.say("status", f"Judging {len(live)} search results...")
        tops = self.model.ask_lines(
            [{"query": it["query"], "want": it["want"], "description": it["rows"][0]["description"]} for it in live],
            match_many_prompt)
        wrong = []
        for it, answer in zip(live, tops):
            if answer.lower().startswith("y"):
                it["verdict"], it["chosen"] = "correct", it["rows"][0]
            elif len(it["rows"]) > 1:
                wrong.append(it)
            else:
                it["verdict"] = "none"
        if not wrong:
            return

        # Every runner-up of the wrong ones, each judged on its own.
        lines = [{"it": it, "row": row, "query": it["query"], "want": it["want"], "description": row["description"]}
                 for it in wrong for row in it["rows"][1:CANDIDATES_SHOWN + 1]]
        self.say("status", f"Checking runners-up for {len(wrong)} searches...")
        answers = []
        for g in range(0, len(lines), BATCH):
            if self.stop_event.is_set():
                for it in wrong:
                    it["verdict"] = "none"
                return
            answers += self.model.ask_lines(lines[g:g + BATCH], match_many_prompt)
        passed: dict[int, dict] = {}
        for line, answer in zip(lines, answers):
            if answer.lower().startswith("y") and id(line["it"]) not in passed:
                passed[id(line["it"])] = line["row"]  # lines are in resolver order: first pass wins
        for it in wrong:
            better = passed.get(id(it))
            if better is None:
                it["verdict"] = "none"
            else:
                it["verdict"], it["chosen"] = "corrected", better
                self.propose_pin(it["query"], better, it["rows"][0])

    # -- search check

    def next_query(self) -> tuple[str, str] | None:
        for _ in range(60):
            if self.stop_event.is_set():
                return None
            while self.buffer:
                query, source = self.buffer.pop(0)
                key = self.db.execute("SELECT name_key(%s)", (query,)).fetchone()[0]
                if key and key not in self.taken and not self.done(key):
                    self.taken.add(key)
                    return query, source
            # Alternate: names the model comes up with, then names we already own.
            self.generated_round += 1
            if self.generated_round % 2:
                kind, topic = self.pick_topic()
                self.say("status", f"Thinking of searches for {topic}...")
                prompt = (noun_ideas_prompt(topic) if kind == "noun"
                          else generate_prompt(topic, random.choice("abcdefghiklmnoprstw")))
                text = self.model.ask(prompt, temperature=0.9)
                category = f"{kind} {topic}"
                # Drop list markers and any note in brackets ("date syrup (fats)").
                names = [re.sub(r"\s*\(.*?\)\s*", " ", re.sub(r"^[\s\-*\d.)]+", "", line)).strip().lower()
                         for line in text.splitlines()]
                self.buffer = [(n, f"generated: {category}") for n in names if 1 < len(n) <= 40]
            else:
                rows = self.db.execute(
                    """SELECT n.name FROM food_name n
                       WHERE NOT EXISTS (SELECT 1 FROM eval.judged j
                                         WHERE j.key = n.key AND j.model = %s AND j.resolver_version = %s)
                       ORDER BY random() LIMIT 20""", (self.model.name, self.version)).fetchall()
                self.buffer = [(r[0], "owned name") for r in rows]
        return None

    def pick_topic(self) -> tuple[str, str]:
        """A random topic for new search ideas: the built-in list, one of the
        lab's food categories, or one of our arbitrated nouns."""
        source = random.choice(["general", "category", "noun"]) if self.ideas == "mix" else self.ideas
        if source == "category":
            row = self.db.execute(
                """SELECT c.description FROM food_category c
                   WHERE EXISTS (SELECT 1 FROM food f WHERE f.food_category_id = c.id)
                   ORDER BY random() LIMIT 1""").fetchone()
            if row:
                return "category", row[0]
        if source == "noun":
            row = self.db.execute("SELECT name FROM food_name WHERE kind = 'noun' ORDER BY random() LIMIT 1").fetchone()
            if row:
                return "noun", row[0]
        return "general", random.choice(CATEGORIES)

    def search_step(self) -> bool:
        items = []
        while len(items) < SEARCH_BATCH:
            item = self.next_query()
            if item is None:
                break
            items.append({"query": item[0], "source": item[1]})
        if not items:
            return False
        self.assess_many(items)
        for it in items:
            key = self.db.execute("SELECT name_key(%s)", (it["query"],)).fetchone()[0]
            rows = it["rows"]
            self.record(key, it["query"], it["source"], "search", it["verdict"], rows[0]["fdc_id"] if rows else None,
                        it["chosen"]["fdc_id"] if it["chosen"] else None)
            self.recent.append(it["verdict"])
            self.log_verdict("search", it["verdict"], it["query"], rows, it["chosen"])
        return True

    # -- reachability

    def reach_step(self) -> bool:
        foods = [{"fdc_id": r[0], "description": r[1]} for r in self.db.execute(
            """SELECT f.fdc_id, f.description FROM food f
               WHERE NOT EXISTS (SELECT 1 FROM eval.judged j WHERE j.key = 'reach:' || f.fdc_id
                                 AND j.model = %s AND j.resolver_version = %s)
               ORDER BY random() LIMIT %s""", (self.model.name, self.version, SEARCH_BATCH))]
        if not foods:
            return False
        self.say("status", f"Reachability: what would a shopper type for {len(foods)} foods?")
        queries = self.model.ask_lines(foods, reach_many_prompt)
        items = []
        for food, q in zip(foods, queries):
            q = re.sub(r"[\"'`*.]", "", q.split("->")[-1]).strip().lower()[:60]
            if q:
                items.append({"query": q, "target": food["fdc_id"], "food": food})
            else:
                self.record(f"reach:{food['fdc_id']}", "", "reachability", "reach", "none", None, None, food["fdc_id"])
        self.assess_many(items)
        for it in items:
            rows, food = it["rows"], it["food"]
            self.record(f"reach:{food['fdc_id']}", it["query"], "reachability", "reach", it["verdict"],
                        rows[0]["fdc_id"] if rows else None, it["chosen"]["fdc_id"] if it["chosen"] else None,
                        food["fdc_id"])
            self.recent.append(it["verdict"])
            self.log_verdict("reach", it["verdict"], f"{it['query']}  (for {food['description'][:40]})", rows,
                             it["chosen"])
        return True

    # -- synonym audit

    def syn_step(self) -> bool:
        rows = [{"fdc_id": r[0], "term": r[1], "description": r[2]} for r in self.db.execute(
            """SELECT s.fdc_id, s.term, f.description FROM food_synonym s JOIN food f USING (fdc_id)
               WHERE NOT EXISTS (SELECT 1 FROM eval.judged j WHERE j.key = 'syn:' || s.fdc_id || ':' || lower(s.term)
                                 AND j.model = %s AND j.resolver_version = %s)
               ORDER BY random() LIMIT %s""", (self.model.name, self.version, BATCH))]
        if not rows:
            return False
        self.say("status", f"Synonym audit: {len(rows)} synonyms")
        first = self.model.ask_lines(rows, synonym_prompt)
        doubtful = [r for r, a in zip(rows, first) if not a.lower().startswith("y")]
        second = self.model.ask_lines(doubtful, happy_prompt) if doubtful else []
        flagged = {id(r) for r, a in zip(doubtful, second) if not a.lower().startswith("y")}
        for r in rows:
            verdict = "flagged" if id(r) in flagged else "kept"
            key = f"syn:{r['fdc_id']}:{r['term'].lower()}"
            self.record(key, r["term"], "synonym", "syn", verdict, r["fdc_id"], None, r["fdc_id"])
            self.recent_syn.append(verdict)
            if verdict == "flagged":
                self.propose("drop_synonym", key, r["term"], r["fdc_id"], None, r["term"])
                self.say("log", f"flagged   {r['term'][:30]:30} | not a name for {r['description'][:60]}")
        self.say("log", f"synonyms: {len(rows)} audited, {len(flagged)} flagged")
        return True

    # -- second opinion

    def review_step(self) -> bool:
        """Reviews pending proposals this model has not reviewed yet. Search fixes
        are a blind A/B choice asked twice with the sides swapped; synonym
        removals are asked two different ways."""
        rows = self.db.execute(
            """SELECT c.id, c.kind, c.query, c.term, f.description, w.description
               FROM eval.correction c JOIN food f ON f.fdc_id = c.fdc_id LEFT JOIN food w ON w.fdc_id = c.was_fdc
               WHERE c.status = 'pending'
                 AND NOT EXISTS (SELECT 1 FROM eval.review r WHERE r.correction_id = c.id AND r.model = %s)
               ORDER BY c.id LIMIT %s""", (self.model.name, SEARCH_BATCH)).fetchall()
        if not rows:
            return False
        self.say("status", f"Second opinion on {len(rows)} proposals...")
        verdicts: dict[int, str] = {}

        pins = [{"id": r[0], "query": r[2], "new": r[4], "now": r[5]} for r in rows if r[1] == "pin"]
        if pins:
            # A fresh call that never saw the candidate list: the reviewer says
            # what the searcher wants, then judges the proposed and the current
            # food on their own. The proposed one must pass and the current fail.
            wants = self.model.ask_lines([{"query": p["query"]} for p in pins], ideal_many_prompt)
            want = {p["id"]: w or p["query"] for p, w in zip(pins, wants)}
            lines = [{"query": p["query"], "want": want[p["id"]], "description": p["new"]} for p in pins]
            lines += [{"query": p["query"], "want": want[p["id"]], "description": p["now"]} for p in pins if p["now"]]
            answers = self.model.ask_lines(lines, match_many_prompt)
            new_ok = {p["id"]: a.lower().startswith("y") for p, a in zip(pins, answers)}
            rest = iter(answers[len(pins):])
            now_ok = {p["id"]: (next(rest).lower().startswith("y") if p["now"] else False) for p in pins}
            for p in pins:
                if new_ok[p["id"]] and not now_ok[p["id"]]:
                    verdicts[p["id"]] = "approve"
                elif not new_ok[p["id"]]:
                    verdicts[p["id"]] = "reject"
                else:
                    verdicts[p["id"]] = "not_needed"  # both pass: a wash, nothing to fix

        drops = [{"id": r[0], "term": r[3] or r[2], "description": r[4]} for r in rows if r[1] == "drop_synonym"]
        if drops:
            first = self.model.ask_lines(drops, name_used_prompt)
            second = self.model.ask_lines(drops, happy_prompt)
            for d, a, b in zip(drops, first, second):
                still_used = [a.lower().startswith("y"), b.lower().startswith("y")]
                verdicts[d["id"]] = "reject" if all(still_used) else "approve" if not any(still_used) else "unsure"

        for cid, verdict in verdicts.items():
            self.db.execute(
                """INSERT INTO eval.review (correction_id, model, verdict, run_id) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (correction_id, model) DO UPDATE SET verdict = EXCLUDED.verdict, run_id = EXCLUDED.run_id,
                                                                    reviewed_at = now()""",
                (cid, self.model.name, verdict, self.run_id))
        for r in rows:
            label = r[2] if r[1] == "pin" else f'synonym "{r[3] or r[2]}"'
            target = r[4][:55] if r[1] == "pin" else f"remove from {r[4][:45]}"
            self.say("log", f"review {verdicts.get(r[0], 'unsure'):9} {label[:34]:34} | {target}")
        return True

    # -- safeguards

    def log_verdict(self, pipeline: str, verdict: str, query: str, rows: list[dict], chosen: dict | None) -> None:
        top = rows[0]["description"][:55] if rows else "-"
        extra = f" -> {chosen['description'][:55]}" if verdict == "corrected" else ""
        self.say("log", f"{pipeline:6} {verdict:9} {query[:34]:34} | {top}{extra}")

    def tripped(self) -> bool:
        if len(self.recent) == BREAKER_WINDOW:
            wrong = sum(v != "correct" for v in self.recent) / BREAKER_WINDOW
            if wrong >= BREAKER_WRONG:
                self.stop(f"circuit breaker: {wrong:.0%} of the last {BREAKER_WINDOW} searches judged wrong")
                return True
        if len(self.recent_syn) == self.recent_syn.maxlen:
            flagged = sum(v == "flagged" for v in self.recent_syn) / len(self.recent_syn)
            if flagged >= SYN_BREAKER:
                self.stop(f"circuit breaker: {flagged:.0%} of the last {len(self.recent_syn)} synonyms flagged")
                return True
        pending = self.db.execute("SELECT count(*) FROM eval.correction WHERE run_id = %s", (self.run_id,)).fetchone()[0]
        if pending >= MAX_PENDING:
            self.stop(f"{MAX_PENDING} changes proposed this run: review them first")
            return True
        return False

    def gpu_wanted(self) -> bool:
        """Pause a few seconds and see whether the GPU stays busy without us."""
        self.say("status", "Checking whether anything else wants the GPU...")
        time.sleep(5)
        reading = gpu()
        return reading is not None and reading[0] >= BUSY_UTIL


# ------------------------------------------------------------------------- app


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Nutrition lab: evaluator")
        self.geometry("1350x780")
        self.db = connect()
        self.events: queue.Queue = queue.Queue()
        self.worker: Worker | None = None
        self.idle_polls = 0

        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")
        ttk.Label(top, text="Model").pack(side="left")
        self.model_var = tk.StringVar()
        self.model_box = ttk.Combobox(top, textvariable=self.model_var, width=36, state="readonly")
        self.model_box.pack(side="left", padx=6)
        ttk.Button(top, text="Refresh", command=self.load_models).pack(side="left")
        ttk.Label(top, text="Pipeline").pack(side="left", padx=(16, 0))
        self.pipeline_var = tk.StringVar(value="Search check")
        self.pipeline_box = ttk.Combobox(top, textvariable=self.pipeline_var, values=list(PIPELINES), width=18,
                                         state="readonly")
        self.pipeline_box.pack(side="left", padx=6)
        ttk.Label(top, text="Ideas from").pack(side="left", padx=(8, 0))
        self.ideas_var = tk.StringVar(value="Mix")
        self.ideas_box = ttk.Combobox(top, textvariable=self.ideas_var, values=list(IDEAS), width=18, state="readonly")
        self.ideas_box.pack(side="left", padx=6)
        self.start_btn = ttk.Button(top, text="Start", command=lambda: self.start("manual"))
        self.start_btn.pack(side="left", padx=(16, 4))
        self.stop_btn = ttk.Button(top, text="Stop", command=self.stop, state="disabled")
        self.stop_btn.pack(side="left")
        self.auto_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(top, text="Run when the GPU is idle", variable=self.auto_var,
                        command=self.auto_changed).pack(side="left", padx=16)

        self.status_var = tk.StringVar(value="Idle.")
        ttk.Label(self, textvariable=self.status_var, padding=(8, 0)).pack(fill="x")
        safeguard = ("Worker login: lab_evaluator (can only write to the eval schema)"
                     if os.environ.get("EVAL_DATABASE_URL")
                     else "Worker login: your normal login. Run script/setup-evaluator-db.ps1 for a write-protected one.")
        ttk.Label(self, text=safeguard, foreground="#666", padding=(8, 0)).pack(fill="x")

        self.stats = ttk.Frame(self, padding=8)
        self.stats.pack(fill="x")
        self.stat_vars: dict[str, tk.StringVar] = {}
        for i, (key, label) in enumerate([
            ("foods", "Foods evaluated"), ("names", "Owned names evaluated"), ("synonyms", "Synonyms audited"),
            ("queries", "Searches judged"), ("accuracy", "Search right first time"), ("nomatch", "No match found"),
            ("overlay", "Overlay (not yet in the lab)"), ("committed", "Committed to the lab"), ("gpu", "GPU"),
        ]):
            ttk.Label(self.stats, text=label + ":", font=("Segoe UI", 9, "bold")).grid(
                row=i // 5 * 2, column=i % 5, sticky="w", padx=(0, 24))
            var = tk.StringVar(value="...")
            self.stat_vars[key] = var
            ttk.Label(self.stats, textvariable=var).grid(row=i // 5 * 2 + 1, column=i % 5, sticky="w",
                                                         padx=(0, 24), pady=(0, 6))

        tabs = ttk.Notebook(self)
        tabs.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.review = self.make_review(tabs)
        self.nomatch = self.make_table(tabs, "Unresolved", [("searched for", 240), ("pipeline", 80), ("result", 90),
                                                            ("search returns", 420), ("model", 160)])
        self.runs = self.make_table(tabs, "Runs", [("run", 50), ("model", 200), ("mode", 70), ("started", 140),
                                                   ("judged", 70), ("proposed", 80), ("stopped because", 460)])
        log_frame = ttk.Frame(tabs)
        tabs.add(log_frame, text="Log")
        self.log = tk.Text(log_frame, font=("Consolas", 9), wrap="none")
        self.log.pack(fill="both", expand=True)

        self.load_models()
        self.refresh()
        self.after(300, self.pump)
        self.after(1000, self.watch_gpu)
        self.protocol("WM_DELETE_WINDOW", self.close)

    # -- layout helpers

    def make_table(self, tabs: ttk.Notebook, title: str, cols: list[tuple[str, int]]) -> ttk.Treeview:
        frame = ttk.Frame(tabs)
        tabs.add(frame, text=title)
        tree = ttk.Treeview(frame, columns=[c for c, _ in cols], show="headings")
        for c, w in cols:
            tree.heading(c, text=c)
            tree.column(c, width=w, anchor="w")
        bar = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=bar.set)
        tree.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")
        return tree

    def make_review(self, tabs: ttk.Notebook) -> ttk.Treeview:
        frame = ttk.Frame(tabs)
        tabs.add(frame, text="Review")
        buttons = ttk.Frame(frame)
        buttons.pack(fill="x", pady=4)
        ttk.Button(buttons, text="Accept selected", command=lambda: self.set_status("accepted")).pack(side="left")
        ttk.Button(buttons, text="Reject selected", command=lambda: self.set_status("rejected")).pack(side="left", padx=4)
        ttk.Button(buttons, text="Accept all pending", command=self.accept_all).pack(side="left", padx=(16, 4))
        ttk.Button(buttons, text="Reject all pending", command=self.reject_all).pack(side="left")
        ttk.Button(buttons, text="Accept what the second opinion approved",
                   command=lambda: self.by_second_opinion("approve", "accepted")).pack(side="left", padx=(16, 4))
        ttk.Button(buttons, text="Reject what it rejected or found not needed",
                   command=lambda: self.by_second_opinion("reject", "rejected")).pack(side="left")
        ttk.Button(buttons, text="Commit accepted to the lab", command=self.commit).pack(side="right")
        inner = ttk.Frame(frame)
        inner.pack(fill="both", expand=True)
        ttk.Label(frame, foreground="#555", wraplength=1100, text=(
            "Search fix: someone searching the first column gets the food in \"search returns now\"; the evaluator "
            "thinks they should get \"should return instead\". Synonym: the evaluator thinks this synonym is not a "
            "name for that food. Nothing changes in the lab until you accept and commit.")).pack(fill="x", pady=(0, 4))
        cols = [("kind", 80), ("searched for / synonym", 170), ("search returns now", 300),
                ("should return instead", 300), ("suggested by", 110), ("second opinion", 160), ("status", 70)]
        tree = ttk.Treeview(inner, columns=[c for c, _ in cols], show="headings", selectmode="extended")
        for c, w in cols:
            tree.heading(c, text=c)
            tree.column(c, width=w, anchor="w")
        tree.tag_configure("conflict", background="#fde2e2")
        tree.tag_configure("accepted", background="#e3f4e1")
        tree.tag_configure("second_reject", foreground="#a33")
        bar = ttk.Scrollbar(inner, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=bar.set)
        tree.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")
        return tree

    # -- models and running

    def load_models(self) -> None:
        models = list_models()
        self.model_box["values"] = models
        if models and self.model_var.get() not in models:
            preferred = [m for m in models if m.endswith("gemma4:12b")]
            self.model_var.set(preferred[0] if preferred else models[0])

    def set_running(self, running: bool) -> None:
        self.start_btn.state(["disabled" if running else "!disabled"])
        self.stop_btn.state(["!disabled" if running else "disabled"])
        self.model_box.state(["disabled" if running else "!disabled"])
        self.pipeline_box.state(["disabled" if running else "!disabled"])
        self.ideas_box.state(["disabled" if running else "!disabled"])

    def start(self, mode: str) -> None:
        if self.worker and self.worker.is_alive():
            return
        if not self.model_var.get():
            messagebox.showwarning("No model", "Pick a model first. Is Ollama or LM Studio running?")
            return
        self.worker = Worker(self.model_var.get(), PIPELINES[self.pipeline_var.get()], mode, self.events,
                             IDEAS[self.ideas_var.get()])
        self.worker.start()
        self.set_running(True)
        self.status_var.set(f"Running ({mode}, {self.pipeline_var.get()}).")

    def stop(self) -> None:
        if self.worker and self.worker.is_alive():
            self.worker.stop("stopped by you")
            self.status_var.set("Stopping after the current question...")

    def auto_changed(self) -> None:
        self.idle_polls = 0
        if not self.auto_var.get() and self.worker and self.worker.is_alive() and self.worker.mode == "auto":
            self.worker.stop("Auto switched off")

    def watch_gpu(self) -> None:
        """Every 15 s: show the GPU, and in Auto start the worker once it has been idle long enough."""
        reading = gpu()
        running = self.worker is not None and self.worker.is_alive()
        if reading:
            util, free = reading
            self.stat_vars["gpu"].set(f"{util}% busy, {free:,} MB free")
            if self.auto_var.get() and not running:
                if util < IDLE_UTIL and free >= MIN_FREE_MB and not naming_running():
                    self.idle_polls += 1
                    self.status_var.set(f"Auto: GPU idle, starting in {(IDLE_POLLS - self.idle_polls) * 15} s.")
                else:
                    self.idle_polls = 0
                    self.status_var.set("Auto: waiting for the GPU to be idle.")
                if self.idle_polls >= IDLE_POLLS:
                    self.idle_polls = 0
                    self.start("auto")
        else:
            self.stat_vars["gpu"].set("nvidia-smi not found")
        self.after(15000, self.watch_gpu)

    def pump(self) -> None:
        """Messages from the worker thread."""
        try:
            while True:
                kind, text = self.events.get_nowait()
                if kind == "log":
                    self.log.insert("end", time.strftime("%H:%M:%S  ") + text + "\n")
                    self.log.see("end")
                elif kind == "status":
                    self.status_var.set(text)
                elif kind == "stopped":
                    self.log.insert("end", time.strftime("%H:%M:%S  ") + f"stopped: {text}\n")
                    self.set_running(False)
                    self.status_var.set(f"Stopped: {text}")
                    self.refresh_tables()
        except queue.Empty:
            pass
        self.after(300, self.pump)

    # -- stats and tables

    def refresh(self) -> None:
        try:
            s = self.db.execute("""SELECT json_build_object(
                'foods', (SELECT count(*) FROM food),
                'touched', (SELECT count(DISTINCT x) FROM (
                    SELECT resolved_fdc AS x FROM eval.judged WHERE verdict = 'correct' AND pipeline <> 'syn'
                    UNION SELECT chosen_fdc FROM eval.judged WHERE verdict = 'corrected'
                    UNION SELECT target_fdc FROM eval.judged WHERE pipeline = 'reach') t),
                'names', (SELECT count(*) FROM food_name),
                'names_judged', (SELECT count(DISTINCT n.key) FROM food_name n JOIN eval.judged j USING (key)),
                'syn_total', (SELECT count(*) FROM food_synonym),
                'syn_done', (SELECT count(DISTINCT key) FROM eval.judged WHERE pipeline = 'syn'),
                'syn_flagged', (SELECT count(DISTINCT key) FROM eval.judged WHERE pipeline = 'syn' AND verdict = 'flagged'),
                'queries', (SELECT count(DISTINCT key) FROM eval.judged WHERE pipeline <> 'syn'),
                'correct', (SELECT count(*) FROM eval.judged WHERE pipeline <> 'syn' AND verdict = 'correct'),
                'scored', (SELECT count(*) FROM eval.judged WHERE pipeline <> 'syn' AND verdict <> 'empty'),
                'disputed', (SELECT count(*) FROM eval.judged WHERE verdict = 'disputed'),
                'nomatch', (SELECT count(DISTINCT key) FROM eval.judged WHERE verdict IN ('none', 'empty')),
                'pins', (SELECT count(*) FROM eval.correction WHERE kind = 'pin' AND status = 'pending'),
                'drops', (SELECT count(*) FROM eval.correction WHERE kind = 'drop_synonym' AND status = 'pending'),
                'accepted', (SELECT count(*) FROM eval.correction WHERE status = 'accepted'),
                'rejected', (SELECT count(*) FROM eval.correction WHERE status = 'rejected'),
                'conflicts', (SELECT count(*) FROM eval.correction WHERE conflict AND status IN ('pending', 'accepted')),
                'committed_pins', (SELECT count(*) FROM search_pin),
                'committed_drops', (SELECT count(*) FROM food_synonym_removed))""").fetchone()[0]
            pct = lambda a, b: f"{a / b:.1%}" if b else "-"  # noqa: E731
            v = self.stat_vars
            v["foods"].set(f"{s['touched']:,} of {s['foods']:,} ({pct(s['touched'], s['foods'])})")
            v["names"].set(f"{s['names_judged']:,} of {s['names']:,} ({pct(s['names_judged'], s['names'])})")
            v["synonyms"].set(f"{s['syn_done']:,} of {s['syn_total']:,} ({pct(s['syn_done'], s['syn_total'])}), "
                              f"{s['syn_flagged']:,} flagged")
            v["queries"].set(f"{s['queries']:,}")
            v["accuracy"].set(f"{pct(s['correct'], s['scored'])} ({s['disputed']:,} unsure, no fix proposed)")
            v["nomatch"].set(f"{s['nomatch']:,} searches (Unresolved tab)")
            v["overlay"].set(f"{s['pins']:,} search fixes and {s['drops']:,} synonym removals pending, "
                             f"{s['accepted']:,} accepted, {s['rejected']:,} rejected"
                             + (f", {s['conflicts']} conflicts" if s["conflicts"] else ""))
            v["committed"].set(f"{s['committed_pins']:,} search fixes, {s['committed_drops']:,} synonyms removed")
        except psycopg.Error as error:
            self.status_var.set(f"Database: {error}")
        if not getattr(self, "_tables_loaded", False) or not (self.worker and self.worker.is_alive()):
            self.refresh_tables()
            self._tables_loaded = True
        self.after(5000, self.refresh)

    def refresh_tables(self) -> None:
        selected = set(self.review.selection())
        self.review.delete(*self.review.get_children())
        for cid, kind, query, was, now, models, status, conflict, second, rejected in self.db.execute(
                """SELECT c.id, c.kind, c.query,
                          CASE c.kind WHEN 'pin' THEN coalesce(w.description, '-') ELSE 'synonym of: ' || f.description END,
                          CASE c.kind WHEN 'pin' THEN f.description ELSE '(remove the synonym)' END,
                          array_to_string(c.models, ', ') || CASE WHEN c.method IS DISTINCT FROM %s THEN ' (old method)' ELSE '' END,
                          c.status, c.conflict,
                          coalesce((SELECT string_agg(replace(r.verdict, '_', ' ') || ' (' || r.model || ')', ', ' ORDER BY r.model)
                                    FROM eval.review r WHERE r.correction_id = c.id), '-'),
                          EXISTS (SELECT 1 FROM eval.review r WHERE r.correction_id = c.id
                                  AND r.verdict IN ('reject', 'not_needed'))
                   FROM eval.correction c JOIN food f ON f.fdc_id = c.fdc_id LEFT JOIN food w ON w.fdc_id = c.was_fdc
                   WHERE c.status IN ('pending', 'accepted') ORDER BY c.conflict DESC, c.kind, c.status, c.query""", (METHOD,)):
            tags = ["conflict" if conflict else ("accepted" if status == "accepted" else "")]
            if rejected:
                tags.append("second_reject")
            label = "search fix" if kind == "pin" else "synonym"
            self.review.insert("", "end", iid=str(cid), values=(label, query, was, now, models, second, status),
                               tags=tuple(t for t in tags if t))
        for iid in selected & set(self.review.get_children()):
            self.review.selection_add(iid)
        self.nomatch.delete(*self.nomatch.get_children())
        for row in self.db.execute(
                """SELECT DISTINCT ON (j.key) j.query, j.pipeline, j.verdict, coalesce(f.description, '-'), j.model
                   FROM eval.judged j LEFT JOIN food f ON f.fdc_id = coalesce(j.target_fdc, j.resolved_fdc)
                   WHERE j.verdict IN ('none', 'empty', 'disputed') ORDER BY j.key, j.judged_at DESC"""):
            self.nomatch.insert("", "end", values=row)
        self.runs.delete(*self.runs.get_children())
        for row in self.db.execute(
                """SELECT r.id, r.endpoint || ': ' || r.model, r.mode, to_char(r.started_at, 'YYYY-MM-DD HH24:MI'),
                          (SELECT count(*) FROM eval.judged j WHERE j.run_id = r.id),
                          (SELECT count(*) FROM eval.correction c WHERE c.run_id = r.id),
                          coalesce(r.stop_reason, CASE WHEN r.ended_at IS NULL THEN 'running' END)
                   FROM eval.run r ORDER BY r.id DESC"""):
            self.runs.insert("", "end", values=row)

    # -- review

    def set_status(self, status: str) -> None:
        ids = [int(i) for i in self.review.selection()]
        if ids:
            self.db.execute("UPDATE eval.correction SET status = %s, reviewed_at = now() WHERE id = ANY(%s)",
                            (status, ids))
            self.refresh_tables()

    def accept_all(self) -> None:
        if messagebox.askyesno("Accept all", "Accept every pending change (conflicts excluded)?"):
            self.db.execute("UPDATE eval.correction SET status = 'accepted', reviewed_at = now() "
                            "WHERE status = 'pending' AND NOT conflict")
            self.refresh_tables()

    def reject_all(self) -> None:
        if messagebox.askyesno("Reject all", "Reject every pending change?"):
            self.db.execute("UPDATE eval.correction SET status = 'rejected', reviewed_at = now() WHERE status = 'pending'")
            self.refresh_tables()

    def by_second_opinion(self, verdict: str, status: str) -> None:
        """Accept every pending change a second opinion approved (and none rejected),
        or reject every one a second opinion rejected."""
        if verdict == "approve":
            where = """EXISTS (SELECT 1 FROM eval.review r WHERE r.correction_id = c.id AND r.verdict = 'approve')
                       AND NOT EXISTS (SELECT 1 FROM eval.review r WHERE r.correction_id = c.id AND r.verdict <> 'approve')
                       AND NOT c.conflict"""
        else:
            where = ("EXISTS (SELECT 1 FROM eval.review r WHERE r.correction_id = c.id "
                     "AND r.verdict IN ('reject', 'not_needed'))")
        n = self.db.execute(f"SELECT count(*) FROM eval.correction c WHERE c.status = 'pending' AND {where}").fetchone()[0]
        if not n:
            messagebox.showinfo("Second opinion", "Nothing pending matches.")
            return
        if messagebox.askyesno("Second opinion", f"Mark {n} pending changes as {status}?"):
            self.db.execute(f"UPDATE eval.correction c SET status = %s, reviewed_at = now() "
                            f"WHERE c.status = 'pending' AND {where}", (status,))
            self.refresh_tables()

    def commit(self) -> None:
        pins, drops = self.db.execute(
            """SELECT count(*) FILTER (WHERE kind = 'pin'), count(*) FILTER (WHERE kind = 'drop_synonym')
               FROM eval.correction WHERE status = 'accepted'""").fetchone()
        if not pins and not drops:
            messagebox.showinfo("Commit", "Nothing accepted to commit.")
            return
        if not messagebox.askyesno("Commit", f"Apply to the lab: {pins} search fixes and {drops} synonym removals?\n\n"
                                             "Removed synonyms are kept in food_synonym_removed."):
            return
        with self.db.transaction():
            self.db.execute(
                """INSERT INTO search_pin (key, query, fdc_id, source)
                   SELECT key, query, fdc_id, 'evaluator: ' || array_to_string(models, ', ')
                   FROM eval.correction WHERE status = 'accepted' AND kind = 'pin'
                   ON CONFLICT (key) DO UPDATE SET fdc_id = EXCLUDED.fdc_id, query = EXCLUDED.query,
                                                   source = EXCLUDED.source, committed_at = now()""")
            self.db.execute(
                """WITH gone AS (
                       DELETE FROM food_synonym s USING eval.correction c
                       WHERE c.status = 'accepted' AND c.kind = 'drop_synonym'
                         AND s.fdc_id = c.fdc_id AND lower(s.term) = lower(c.term)
                       RETURNING s.*)
                   INSERT INTO food_synonym_removed SELECT gone.*, now() FROM gone""")
            self.db.execute("UPDATE eval.correction SET status = 'committed', reviewed_at = now() WHERE status = 'accepted'")
        self.refresh_tables()
        messagebox.showinfo("Commit", f"Done: {pins} search fixes and {drops} synonym removals are now in the lab.")

    def close(self) -> None:
        if self.worker and self.worker.is_alive():
            self.worker.stop("window closed")
            self.worker.join(timeout=5)
        self.destroy()


if __name__ == "__main__":
    load_env()
    App().mainloop()
