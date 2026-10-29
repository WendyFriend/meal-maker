"""Food thumbnail studio: gemma writes an image prompt per food, klein/Flux draws it.

Nothing starts by itself. Everything is a manual Load / Start:

  1. Prompts        Load the prompt model (gemma4:12b in Ollama), then Start. Writes one prompt
                    per food that has none into food_thumbnail_prompt (template:
                    db/lab/thumb_prompt_template.txt). Foods are sent to gemma in batches
                    (default 15 per call, JSON out).
  2. Bulk encode    Freezes every prompt that has no thumbnail into a job and runs
                    `food_thumb batch` (klein) until all prompts are encoded to disk, then stops.
  3. Bulk generate  Resumes the same job: the text encoder is gone, so the GPU only draws.
                    Finished images are filed under db/lab/thumbnails/<fdc_id>.webp and recorded
                    in food_thumbnail (with prompt_id) as they appear.
  Live tab          The old one-image-at-a-time route through the food_thumb server (slow).

The 16 GB GPU holds one thing at a time: the prompt model, the image server, or a bulk job.
Unhandled errors go to db/lab/thumb_studio.log (pythonw has no console).

Run:  python db\\lab\\thumb_studio.py
Schema: db/lab/11_thumbnail.sql, 13_thumbnail_qa.sql, 14_thumbnail_prompts.sql, 15_prompt_batch.sql.
"""
from __future__ import annotations

import io
import json
import math
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import tkinter as tk
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from tkinter import messagebox, ttk

import psycopg
from PIL import Image, ImageTk

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
THUMB_DIR = HERE / "thumbnails"
THUMB_DIR.mkdir(exist_ok=True)
BULK_DIR = HERE / "bulk"
TEMPLATE_FILE = HERE / "thumb_prompt_template.txt"
TEMPLATE_NAME = "v4 flux isometric"
LOG_FILE = HERE / "thumb_studio.log"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

FOOD_THUMB_SCRIPT = Path(r"C:\Users\Kieran\icon-studio\food_thumb.py")
FOOD_THUMB_PY = Path(r"C:\Users\Kieran\icon-studio\.venv\Scripts\python.exe")
FOOD_THUMB_RETRY = HERE / "food_thumb_retry.py"       # runs food_thumb unchanged, retrying renames that Windows denies
FOOD_THUMB_URL = f"http://127.0.0.1:{os.environ.get('FOOD_THUMB_PORT', '8767')}"
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PROMPT_MODEL = "gemma4:12b"
KEEP_ALIVE = "30m"

QUALITY = 90
SIZE = 256
BULK_MODEL = "klein"                                   # batch mode is klein-only
BULK_SETTINGS = {"size": SIZE, "quality": QUALITY, "steps": 4, "cfg": 1.0, "max_tokens": 160}
LIVE_MODELS = {"klein": (4, 1.0), "flux": (4, 0.0)}     # model -> (steps, cfg) for the one-at-a-time server
SCOPES = ("core", "review", "excluded")
BATCH = 20
PROMPT_CTX = 8192          # one context size for every call to the prompt model: Ollama reloads the model when it changes
DEFAULT_PROMPT_BATCH = 15

# Pieces of the template that are rewritten when several foods share one gemma call.
HEAD_OLD = 'The current item is:"{food name}"'
ASK_OLD = "Please write a detailed prompt to generate an image of this item."
TAIL_OLD = ("Return the positive prompt only, as a single paragraph of 40 to 70 words, with no headings, labels, "
            "negative prompt or commentary.")


def log_error(text: str) -> None:
    try:
        with LOG_FILE.open("a", encoding="utf8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {text}\n")
    except OSError:
        pass


sys.excepthook = lambda *a: log_error("".join(traceback.format_exception(*a)))


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf8").splitlines():
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def connect() -> psycopg.Connection:
    return psycopg.connect(os.environ["NUTRITION_DATABASE_URL"], dbname="nutrition_lab", autocommit=True)


# ------------------------------------------------------------------- database


def register_template(db: psycopg.Connection, body: str) -> int:
    row = db.execute("SELECT id FROM thumbnail_prompt_template WHERE body = %s", (body,)).fetchone()
    if row:
        return row[0]
    return db.execute("INSERT INTO thumbnail_prompt_template (name, body) VALUES (%s, %s) RETURNING id",
                      (TEMPLATE_NAME, body)).fetchone()[0]


def foods_without_prompt(db, scopes, skip, limit):
    return db.execute(
        """SELECT f.fdc_id, f.description FROM food f
           WHERE f.scope = ANY(%s) AND NOT (f.fdc_id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM food_thumbnail_prompt p WHERE p.fdc_id = f.fdc_id)
           ORDER BY f.fdc_id LIMIT %s""", (list(scopes), list(skip), limit)).fetchall()


def save_prompt(db, fdc_id, template_id, name, prompt, raw, batch_size=1) -> int:
    return db.execute(
        """INSERT INTO food_thumbnail_prompt (fdc_id, template_id, llm_model, food_name, prompt, raw_response, batch_size)
           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (fdc_id, template_id, PROMPT_MODEL, name, prompt, raw, batch_size)).fetchone()[0]


def prompts_without_thumbnail(db, skip, limit):
    return db.execute(
        """SELECT p.id, p.fdc_id, p.food_name, p.prompt FROM food_thumbnail_prompt_current p
           WHERE NOT (p.id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM food_thumbnail_current t WHERE t.fdc_id = p.fdc_id)
           ORDER BY p.fdc_id LIMIT %s""", (list(skip), limit)).fetchall()


def save_thumbnail(db, prompt_id, fdc_id, name, prompt, seed, nbytes, ok, error=None, *,
                   model, steps, cfg, size=SIZE) -> None:
    db.execute(
        """INSERT INTO food_thumbnail (fdc_id, label, source, model, prompt, negative, seed, steps, cfg, size,
                                       bytes, ok, error, prompt_id)
           VALUES (%s,%s,'gemma_prompt',%s,%s,'',%s,%s,%s,%s,%s,%s,%s,%s)""",
        (fdc_id, name, model, prompt, seed, steps, cfg, size, nbytes, ok, error, prompt_id))


def counts(db, scopes) -> tuple[int, int, int, int, int]:
    return db.execute(
        """SELECT (SELECT count(*) FROM food WHERE scope = ANY(%(s)s)),
                  (SELECT count(*) FROM food_thumbnail_prompt_current),
                  (SELECT count(*) FROM food_thumbnail_current),
                  (SELECT count(*) FROM food f WHERE f.scope = ANY(%(s)s) AND NOT EXISTS
                       (SELECT 1 FROM food_thumbnail_prompt p WHERE p.fdc_id = f.fdc_id)),
                  (SELECT count(*) FROM food_thumbnail_prompt_current p WHERE NOT EXISTS
                       (SELECT 1 FROM food_thumbnail_current t WHERE t.fdc_id = p.fdc_id))""",
        {"s": list(scopes)}).fetchone()


# ------------------------------------------------------------------- models


def http_json(url: str, body: dict | None = None, timeout: float = 10):
    req = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None,
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def prompt_model_loaded() -> bool:
    try:
        return any(m.get("name") == PROMPT_MODEL for m in http_json(f"{OLLAMA}/api/ps", timeout=3).get("models", []))
    except (urllib.error.URLError, OSError, ValueError):
        return False


def image_server_state() -> tuple[bool, str | None]:
    """(ready, model) of the food_thumb server, or (False, None) when it is not running."""
    try:
        h = http_json(f"{FOOD_THUMB_URL}/health", timeout=3)
        return bool(h.get("ready")), h.get("model")
    except (urllib.error.URLError, OSError, ValueError):
        return False, None


def parse_prompt(raw: str) -> str:
    text = re.split(r"\n\s*\W*negative prompt", raw, flags=re.I)[0]
    text = re.sub(r"^\W*positive prompt\W*", "", text.strip(), flags=re.I)
    return re.sub(r"\s+", " ", text).strip().strip('"*').strip()


def ask_prompt_model(template: str, name: str) -> tuple[str, str]:
    d = http_json(f"{OLLAMA}/api/chat", {
        "model": PROMPT_MODEL, "stream": False, "think": False, "keep_alive": KEEP_ALIVE,
        "options": {"temperature": 0, "num_ctx": PROMPT_CTX},
        "messages": [{"role": "user", "content": template.replace("{food name}", name)}]}, timeout=600)
    raw = d["message"]["content"].strip()
    return raw, parse_prompt(raw)


def template_supports_batching(template: str) -> bool:
    return all(s in template for s in (HEAD_OLD, ASK_OLD, TAIL_OLD))


def batch_instruction(template: str, names: list[str]) -> str:
    listing = "\n".join(f'{k}. "{n}"' for k, n in enumerate(names, 1))
    t = template.replace(HEAD_OLD, f"The items are (numbered):\n{listing}")
    t = t.replace(ASK_OLD, "Please write a detailed prompt to generate an image of EACH item, one independent prompt per "
                           "item, applying every rule below to each item separately.")
    return t.replace(TAIL_OLD, f'Return JSON with a "prompts" array of exactly {len(names)} strings, in the same order '
                               'as the items. Each string is a single paragraph of 40 to 70 words with no headings, '
                               'labels, negative prompt or commentary.')


def ask_prompt_batch(template: str, names: list[str]) -> list[str] | None:
    """Prompts for several foods in one call, or None when the reply is unusable."""
    schema = {"type": "object", "properties": {"prompts": {"type": "array", "items": {"type": "string"}}},
              "required": ["prompts"]}
    d = http_json(f"{OLLAMA}/api/chat", {
        "model": PROMPT_MODEL, "stream": False, "think": False, "keep_alive": KEEP_ALIVE, "format": schema,
        "options": {"temperature": 0, "num_ctx": PROMPT_CTX},
        "messages": [{"role": "user", "content": batch_instruction(template, names)}]}, timeout=1800)
    try:
        arr = json.loads(d["message"]["content"])["prompts"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(arr, list) or len(arr) != len(names) or not all(isinstance(a, str) for a in arr):
        return None
    return [parse_prompt(a) for a in arr]


def live_generate(prompt: str, seed: int, steps: int, cfg: float) -> bytes:
    body = json.dumps({"prompt": prompt, "negative_prompt": "", "seed": seed, "size": SIZE,
                       "quality": QUALITY, "steps": steps, "cfg": cfg}).encode()
    req = urllib.request.Request(f"{FOOD_THUMB_URL}/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


# ------------------------------------------------------------------- bulk job


def replace_retry(src, dst, tries: int = 100, delay: float = 0.1) -> None:
    """os.replace that waits out a brief 'Access is denied': on Windows an editor's file watcher, antivirus or the
    indexer can hold a file open for a moment, and a rename onto an open file then fails."""
    for attempt in range(tries):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == tries - 1:
                raise
            time.sleep(delay)


class BulkJob:
    """A frozen snapshot of prompts that still need images, run through `food_thumb batch`.

    The batch folder is tied to its exact prompts, so the job never changes after creation:
    encode and generate are two runs of the same command, the second one reusing the
    embeddings the first one saved."""

    def __init__(self, folder: Path):
        self.dir = folder
        self.out = folder / "out"
        self.manifest_file = folder / "manifest.json"
        self.items_file = folder / "items.json"
        self.prompts_file = folder / "prompts.jsonl"
        self.log_file = folder / "batch.log"
        self._items: list[dict] | None = None

    # -- manifest
    def exists(self) -> bool:
        return self.manifest_file.exists()

    @property
    def manifest(self) -> dict:
        return json.loads(self.manifest_file.read_text(encoding="utf8"))

    @property
    def items(self) -> list[dict]:
        if self._items is None:
            self._items = json.loads(self.items_file.read_text(encoding="utf8"))
        return self._items

    def update(self, **kw) -> None:
        m = self.manifest
        m.update(kw)
        tmp = self.manifest_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(m, ensure_ascii=False), encoding="utf8")
        replace_retry(tmp, self.manifest_file)

    @classmethod
    def create(cls, folder: Path, rows) -> "BulkJob":
        if folder.exists():
            shutil.rmtree(folder)
        job = cls(folder)
        job.out.mkdir(parents=True)
        items = [{"id": str(fdc_id), "fdc_id": fdc_id, "prompt_id": pid, "name": name, "prompt": prompt,
                  "seed": fdc_id % 2_147_483_647} for pid, fdc_id, name, prompt in rows]
        with job.prompts_file.open("w", encoding="utf8") as f:
            for it in items:
                f.write(json.dumps({"id": it["id"], "prompt": it["prompt"], "seed": it["seed"]}, ensure_ascii=False) + "\n")
        job.items_file.write_text(json.dumps(items, ensure_ascii=False), encoding="utf8")
        job.manifest_file.write_text(json.dumps({
            "created": time.strftime("%Y-%m-%d %H:%M:%S"), "n": len(items), "settings": BULK_SETTINGS,
            "model": BULK_MODEL, "encoded": False, "finished": False}, ensure_ascii=False), encoding="utf8")
        return job

    # -- state: none | incomplete (not fully encoded) | encoded (ready to generate) | finished
    def state(self) -> str:
        if not self.exists():
            return "none"
        m = self.manifest
        return "finished" if m.get("finished") else "encoded" if m.get("encoded") else "incomplete"

    # -- the food_thumb command
    def command(self) -> list[str]:
        s = self.manifest["settings"]
        py = str(FOOD_THUMB_PY) if FOOD_THUMB_PY.exists() else sys.executable
        return [py, str(FOOD_THUMB_RETRY), str(FOOD_THUMB_SCRIPT), "batch", str(self.prompts_file), "--out", str(self.out),
                "--max-tokens", str(s["max_tokens"]), "--size", str(s["size"]), "--quality", str(s["quality"]),
                "--steps", str(s["steps"])]

    def tokens_command(self) -> list[str]:
        py = str(FOOD_THUMB_PY) if FOOD_THUMB_PY.exists() else sys.executable
        return [py, str(FOOD_THUMB_RETRY), str(FOOD_THUMB_SCRIPT), "tokens", str(self.prompts_file),
                "--max-tokens", str(self.manifest["settings"]["max_tokens"])]

    def progress(self) -> dict:
        try:
            return json.loads((self.out / "progress.json").read_text(encoding="utf8"))
        except (OSError, ValueError):
            return {}

    # -- encoding bookkeeping
    def encoding_complete(self, prog: dict) -> bool:
        phase = prog.get("phase")
        if phase in ("generating", "done", "done_with_failures"):
            return True
        return phase == "encoding" and prog.get("chunks_total") is not None \
            and prog.get("encoded_chunks", 0) >= prog["chunks_total"]

    def all_chunks_on_disk(self) -> bool:
        try:
            chunk = json.loads((self.out / "_work" / "job.json").read_text(encoding="utf8"))["chunk"]
        except (OSError, ValueError, KeyError):
            return False
        n = self.manifest["n"]
        return all((self.out / "_work" / f"chunk-{c:05d}.safetensors").exists() for c in range(math.ceil(n / chunk)))

    def log_tail(self, n=6) -> str:
        try:
            return "\n".join(self.log_file.read_text(encoding="utf8", errors="replace").splitlines()[-n:])
        except OSError:
            return ""


def register_new_images(db, job: BulkJob, registered: set[int], thumb_dir: Path = THUMB_DIR):
    """File every finished image of the job under thumb_dir and record it. Returns [(fdc_id, item, bytes)]."""
    try:
        done = {e.name[:-5] for e in os.scandir(job.out) if e.name.endswith(".webp")}
    except OSError:
        return []
    m = job.manifest
    s = m["settings"]
    new = []
    for it in job.items:
        fdc = it["fdc_id"]
        if fdc in registered or it["id"] not in done:
            continue
        data = (job.out / f"{it['id']}.webp").read_bytes()
        tmp = thumb_dir / f"{fdc}.tmp"
        tmp.write_bytes(data)
        replace_retry(tmp, thumb_dir / f"{fdc}.webp")
        save_thumbnail(db, it["prompt_id"], fdc, it["name"], it["prompt"], it["seed"], len(data), True,
                       model=m["model"], steps=s["steps"], cfg=s["cfg"], size=s["size"])
        registered.add(fdc)
        new.append((fdc, it, data))
    return new


def stop_process(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(20)
        except subprocess.TimeoutExpired:
            proc.kill()


# ------------------------------------------------------------------- workers


class Worker(threading.Thread):
    done_kind = ""

    def __init__(self, events: queue.Queue):
        super().__init__(daemon=True)
        self.events = events
        self.stop_event = threading.Event()

    def say(self, kind: str, payload=None) -> None:
        self.events.put((kind, payload))

    def run(self) -> None:
        try:
            self.work()
        except Exception:  # noqa: BLE001 - surface anything, the window has no console
            log_error(traceback.format_exc())
            self.say("log", "Crashed: " + traceback.format_exc().strip().splitlines()[-1])
            self.say(self.done_kind, "Crashed (see thumb_studio.log).")

    def work(self) -> None:
        raise NotImplementedError


class PromptWorker(Worker):
    done_kind = "pdone"

    def __init__(self, events, scopes, batch_size):
        super().__init__(events)
        self.scopes = scopes
        self.batch_size = max(1, batch_size)

    def work(self) -> None:
        db = connect()
        template = TEMPLATE_FILE.read_text(encoding="utf8").strip()
        template_id = register_template(db, template)
        batching = self.batch_size > 1
        if batching and not template_supports_batching(template):
            self.say("log", "The template no longer has the lines the batch rewrite looks for; writing one prompt per call.")
            batching = False
        skipped: set[int] = set()
        self.made = self.skipped_n = 0
        self.t0 = time.time()
        try:
            while not self.stop_event.is_set():
                rows = foods_without_prompt(db, self.scopes, skipped, self.batch_size if batching else BATCH)
                if not rows:
                    self.say("pdone", "Every food in the selected scopes has a prompt.")
                    return
                try:
                    if batching and len(rows) > 1:
                        t0 = time.time()
                        self.say("log", f"Asking {PROMPT_MODEL} for {len(rows)} prompts (fdc {rows[0][0]} to {rows[-1][0]})...")
                        got = ask_prompt_batch(template, [n for _, n in rows])
                        if got is None:
                            skipped.update(r[0] for r in rows)
                            self.skipped_n += len(rows)
                            self.say("log", f"The reply was not exactly {len(rows)} prompts, so these foods are skipped this run.")
                            continue
                        self.say("log", f"Got {len(got)} prompts in {time.time() - t0:.1f} s.")
                        for (fdc_id, name), prompt in zip(rows, got):
                            self.keep(db, template_id, skipped, fdc_id, name, prompt, prompt, len(rows))
                        self.report()
                    else:
                        for fdc_id, name in rows:
                            if self.stop_event.is_set():
                                break
                            raw, prompt = ask_prompt_model(template, name)
                            self.keep(db, template_id, skipped, fdc_id, name, prompt, raw, 1)
                            self.report()
                except (urllib.error.URLError, OSError, KeyError, ValueError) as e:
                    self.say("log", f"Prompt model call failed: {e}")
                    self.say("pdone", "Prompt model not reachable; stopped. Load it again and Start.")
                    return
        finally:
            db.close()
        self.say("pdone", f"Stopped. {self.made} prompts written, {self.skipped_n} foods skipped.")

    def keep(self, db, template_id, skipped, fdc_id, name, prompt, raw, batch_size) -> None:
        if not prompt:                       # nothing to store (an empty reply); not a quality check
            skipped.add(fdc_id)
            self.skipped_n += 1
            self.say("log", f"Empty reply for fdc {fdc_id}; skipped this run.")
            return
        save_prompt(db, fdc_id, template_id, name, prompt, raw, batch_size)
        self.made += 1
        self.say("prompt", (fdc_id, name, prompt))

    def report(self) -> None:
        self.say("pstats", (self.made, self.skipped_n, self.made / max(time.time() - self.t0, 0.001) * 60))


class BulkRunner(Worker):
    """Runs `food_thumb batch` for a job. mode 'encode' stops it as soon as every prompt is encoded;
    mode 'generate' lets it finish, filing images as they appear."""
    done_kind = "bdone"

    def __init__(self, events, job: BulkJob, mode: str):
        super().__init__(events)
        self.job = job
        self.mode = mode
        self.proc: subprocess.Popen | None = None

    def work(self) -> None:
        job = self.job
        logf = job.log_file.open("ab")
        logf.write(f"\n--- {time.strftime('%H:%M:%S')} {self.mode} ---\n".encode())
        logf.flush()
        db = connect()
        registered = {r[0] for r in db.execute("SELECT fdc_id FROM food_thumbnail_current").fetchall()}
        status = "failed"
        (job.out / "progress.json").unlink(missing_ok=True)
        try:
            self.proc = subprocess.Popen(job.command(), stdout=logf, stderr=subprocess.STDOUT, creationflags=NO_WINDOW,
                                         cwd=str(FOOD_THUMB_SCRIPT.parent))
            last_reg = 0.0
            while True:
                code = self.proc.poll()
                prog = job.progress()
                if self.mode == "generate" and (code is not None or time.time() - last_reg > 3):
                    self.file_new(db, registered)
                    last_reg = time.time()
                if code is not None:
                    break
                if self.stop_event.is_set():
                    stop_process(self.proc)
                    status = "stopped"
                    break
                if self.mode == "encode" and job.encoding_complete(prog):
                    stop_process(self.proc)
                    status = "encode-finished"
                    break
                time.sleep(1)
            if self.mode == "generate":
                self.file_new(db, registered)
            prog = job.progress()
            if status == "encode-finished":
                if job.all_chunks_on_disk():
                    job.update(encoded=True)
                    status = "encoded"
                else:
                    status = "failed"
            elif status != "stopped":
                if self.mode == "generate" and prog.get("phase") == "done":
                    job.update(encoded=True, finished=True)
                    status = "finished"
                elif self.mode == "generate" and prog.get("phase") == "done_with_failures":
                    job.update(encoded=True)
                    status = "partial"
                elif self.mode == "encode" and prog.get("phase") == "done":
                    job.update(encoded=True, finished=True)
                    status = "finished"
        finally:
            if self.proc is not None:
                stop_process(self.proc)
            logf.close()
            db.close()
        self.say("bdone", (self.mode, status))

    def file_new(self, db, registered) -> None:
        new = register_new_images(db, self.job, registered)
        if new:
            fdc, it, data = new[-1]
            self.say("bimage", (len(new), fdc, it["name"], it["prompt"], data))


class ThumbWorker(Worker):
    """The old route: one image at a time through the food_thumb server."""
    done_kind = "tdone"

    def __init__(self, events, model):
        super().__init__(events)
        self.model = model

    def work(self) -> None:
        steps, cfg = LIVE_MODELS[self.model]
        db = connect()
        failed: set[int] = set()
        made = errors = consecutive = 0
        t0 = time.time()
        try:
            while not self.stop_event.is_set():
                rows = prompts_without_thumbnail(db, failed, BATCH)
                if not rows:
                    self.say("tdone", "Every prompt has a thumbnail.")
                    return
                for prompt_id, fdc_id, name, prompt in rows:
                    if self.stop_event.is_set():
                        break
                    seed = fdc_id % 2_147_483_647
                    try:
                        data = live_generate(prompt, seed, steps, cfg)
                        (THUMB_DIR / f"{fdc_id}.webp").write_bytes(data)
                        save_thumbnail(db, prompt_id, fdc_id, name, prompt, seed, len(data), True,
                                       model=self.model, steps=steps, cfg=cfg)
                        made += 1
                        consecutive = 0
                        self.say("image", (fdc_id, name, prompt, data))
                    except (urllib.error.URLError, OSError, psycopg.Error) as e:
                        errors += 1
                        consecutive += 1
                        failed.add(prompt_id)
                        save_thumbnail(db, prompt_id, fdc_id, name, prompt, seed, 0, False, str(e),
                                       model=self.model, steps=steps, cfg=cfg)
                        self.say("log", f"FAILED fdc {fdc_id} ({name}): {e}")
                        if consecutive >= 3:
                            self.say("tdone", "3 failures in a row; stopped. Check the image model.")
                            return
                    self.say("tstats", (made, errors, made / max(time.time() - t0, 0.001) * 60))
        finally:
            db.close()
        self.say("tdone", f"Stopped. {made} generated, {errors} failed.")


# ------------------------------------------------------------------- app


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Food thumbnail studio")
        self.geometry("1260x900")
        self.events: queue.Queue = queue.Queue()
        self.pworker: PromptWorker | None = None
        self.tworker: ThumbWorker | None = None
        self.bworker: BulkRunner | None = None
        self.job = BulkJob(BULK_DIR / "current")
        self.prompt_loaded = False
        self.image_model: str | None = None
        self.image_ready = False
        self.loading: str | None = None            # "prompt" / "image" while a load is in flight
        self.need_thumb = 0
        self._photo = None
        self._bphoto = None
        self.scope_vars = {s: tk.BooleanVar(value=True) for s in SCOPES}
        self.live_model = tk.StringVar(value="klein")
        self.prompt_batch = tk.IntVar(value=DEFAULT_PROMPT_BATCH)
        self.report_callback_exception = lambda *a: (log_error("".join(traceback.format_exception(*a))),
                                                      self.say_log("UI error: " + str(a[1])))

        ttk.Label(self, text="Nothing runs until you press a button. The GPU holds one thing at a time: the prompt model, "
                             "the image server, or a bulk job. Order: prompts, then bulk encode, then bulk generate.",
                  padding=(8, 6), foreground="#555").pack(fill="x")
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        main, live, review = ttk.Frame(nb), ttk.Frame(nb), ttk.Frame(nb)
        nb.add(main, text="Pipelines")
        nb.add(live, text="Live (one at a time)")
        nb.add(review, text="Prompts")
        self.build_pipelines(main)
        self.build_live(live)
        self.build_review(review)

        self.protocol("WM_DELETE_WINDOW", self.close)
        self.refresh_counts()
        self.after(200, self.pump_events)
        self.after(500, self.poll_states)
        self.after(1000, self.refresh_bulk)

    # ---------------------------------------------------------------- layout
    def build_pipelines(self, f: ttk.Frame) -> None:
        cols = ttk.Frame(f)
        cols.pack(fill="x", padx=4, pady=4)

        pf = ttk.LabelFrame(cols, text=f"1. Prompts  ({PROMPT_MODEL} via Ollama)", padding=8)
        pf.pack(side="left", fill="both", expand=True, padx=(0, 4))
        self.p_state = tk.StringVar(value="Prompt model: checking...")
        ttk.Label(pf, textvariable=self.p_state, font=("Segoe UI", 10, "bold")).pack(anchor="w")
        row = ttk.Frame(pf)
        row.pack(anchor="w", pady=4)
        self.p_load = ttk.Button(row, text="Load prompt model", command=self.load_prompt_model)
        self.p_unload = ttk.Button(row, text="Unload", command=self.unload_prompt_model)
        self.p_start = ttk.Button(row, text="Start prompting", command=self.start_prompts)
        self.p_stop = ttk.Button(row, text="Stop", command=self.stop_prompts)
        for b in (self.p_load, self.p_unload, self.p_start, self.p_stop):
            b.pack(side="left", padx=(0, 4))
        opts = ttk.Frame(pf)
        opts.pack(anchor="w")
        ttk.Label(opts, text="Foods per call:").pack(side="left")
        ttk.Spinbox(opts, from_=1, to=20, width=4, textvariable=self.prompt_batch).pack(side="left", padx=(4, 12))
        ttk.Label(opts, text="(1 = one food per call)", foreground="#666").pack(side="left")
        sc = ttk.Frame(pf)
        sc.pack(anchor="w", pady=(4, 0))
        ttk.Label(sc, text="Foods in scope:").pack(side="left")
        for s in SCOPES:
            ttk.Checkbutton(sc, text=s, variable=self.scope_vars[s], command=self.refresh_counts).pack(side="left", padx=4)
        ttk.Button(pf, text="View prompt template", command=self.show_template).pack(anchor="w", pady=(4, 0))
        self.p_stats = tk.StringVar(value="-")
        ttk.Label(pf, textvariable=self.p_stats, wraplength=540, justify="left").pack(anchor="w", pady=(6, 0))
        self.p_rate = tk.StringVar(value="")
        ttk.Label(pf, textvariable=self.p_rate, foreground="#555").pack(anchor="w")
        self.p_last = tk.Text(pf, height=7, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat")
        self.p_last.pack(fill="x", pady=(6, 0))

        bf = ttk.LabelFrame(cols, text=f"2. Bulk images  ({BULK_MODEL} batch: encode all prompts, then draw)", padding=8)
        bf.pack(side="left", fill="both", expand=True, padx=(4, 0))
        self.b_state = tk.StringVar(value="No bulk job.")
        ttk.Label(bf, textvariable=self.b_state, font=("Segoe UI", 10, "bold"), wraplength=540, justify="left").pack(anchor="w")
        row = ttk.Frame(bf)
        row.pack(anchor="w", pady=4)
        self.b_encode = ttk.Button(row, text="Bulk encode", command=self.start_encode)
        self.b_gen = ttk.Button(row, text="Bulk generate", command=self.start_generate)
        self.b_stop = ttk.Button(row, text="Stop", command=self.stop_bulk)
        self.b_discard = ttk.Button(row, text="Discard job", command=self.discard_job)
        for b in (self.b_encode, self.b_gen, self.b_stop, self.b_discard):
            b.pack(side="left", padx=(0, 4))
        self.b_bar = ttk.Progressbar(bf, mode="determinate")
        self.b_bar.pack(fill="x", pady=(4, 0))
        self.b_prog = tk.StringVar(value="-")
        ttk.Label(bf, textvariable=self.b_prog, wraplength=540, justify="left").pack(anchor="w", pady=(4, 0))
        pv = ttk.Frame(bf)
        pv.pack(fill="x", pady=(6, 0))
        self.b_preview = ttk.Label(pv)
        self.b_preview.pack(side="left")
        self.b_last = tk.Text(pv, height=10, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat", width=34)
        self.b_last.pack(side="left", fill="both", expand=True, padx=(8, 0))
        self.b_log = tk.Text(bf, height=4, wrap="none", font=("Consolas", 8), bg="#fafafa", relief="flat")
        self.b_log.pack(fill="x", pady=(6, 0))

        lf = ttk.LabelFrame(f, text="Log", padding=4)
        lf.pack(fill="both", expand=True, padx=4, pady=4)
        self.log = tk.Text(lf, state="disabled", wrap="word", height=10, font=("Consolas", 9))
        self.log.pack(fill="both", expand=True)

    def build_live(self, f: ttk.Frame) -> None:
        ttk.Label(f, text="The slow route: loads the model into the food_thumb server and draws prompts one at a time "
                          "(about 8 s each; the bulk route is about 3x faster). Works through the same waiting prompts.",
                  wraplength=900, foreground="#555", padding=8).pack(anchor="w")
        tf = ttk.LabelFrame(f, text="Image server", padding=8)
        tf.pack(fill="x", padx=8, pady=4)
        self.t_state = tk.StringVar(value="Image model: checking...")
        ttk.Label(tf, textvariable=self.t_state, font=("Segoe UI", 10, "bold")).pack(anchor="w")
        row = ttk.Frame(tf)
        row.pack(anchor="w", pady=4)
        ttk.Label(row, text="Model:").pack(side="left")
        self.t_model_box = ttk.Combobox(row, textvariable=self.live_model, values=list(LIVE_MODELS), width=8, state="readonly")
        self.t_model_box.pack(side="left", padx=(4, 12))
        self.t_load = ttk.Button(row, text="Load image model", command=self.load_image_model)
        self.t_unload = ttk.Button(row, text="Unload", command=self.unload_image_model)
        self.t_start = ttk.Button(row, text="Start generating", command=self.start_thumbs)
        self.t_stop = ttk.Button(row, text="Stop", command=self.stop_thumbs)
        for b in (self.t_load, self.t_unload, self.t_start, self.t_stop):
            b.pack(side="left", padx=(0, 4))
        self.t_stats = tk.StringVar(value="-")
        ttk.Label(tf, textvariable=self.t_stats, wraplength=800, justify="left").pack(anchor="w", pady=(6, 0))
        pv = ttk.Frame(tf)
        pv.pack(fill="x", pady=(6, 0))
        self.preview = ttk.Label(pv)
        self.preview.pack(side="left")
        self.t_last = tk.Text(pv, height=12, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat", width=70)
        self.t_last.pack(side="left", fill="both", expand=True, padx=(8, 0))
        self.apply_states()

    def build_review(self, f: ttk.Frame) -> None:
        bar = ttk.Frame(f, padding=6)
        bar.pack(fill="x")
        ttk.Label(bar, text="search:").pack(side="left")
        self.r_search = tk.StringVar()
        e = ttk.Entry(bar, textvariable=self.r_search, width=28)
        e.pack(side="left", padx=4)
        e.bind("<Return>", lambda _e: self.load_review(0))
        ttk.Button(bar, text="< Prev", command=lambda: self.load_review(self.r_page - 1)).pack(side="left")
        ttk.Button(bar, text="Next >", command=lambda: self.load_review(self.r_page + 1)).pack(side="left", padx=2)
        ttk.Button(bar, text="Refresh", command=lambda: self.load_review(self.r_page)).pack(side="left", padx=4)
        ttk.Button(bar, text="Remove selected prompts", command=self.remove_selected).pack(side="left", padx=(16, 0))
        self.r_info = ttk.Label(bar, text="")
        self.r_info.pack(side="left", padx=8)
        ttk.Label(f, text="Removing a prompt only works for foods with no thumbnail yet; the prompt pipeline will write "
                          "a fresh one next time it runs. A bulk job already created keeps its own copy of the prompts.",
                  foreground="#666", padding=(6, 0)).pack(anchor="w")
        self.tree = ttk.Treeview(f, columns=("fdc", "name", "prompt", "thumb"), show="headings", selectmode="extended")
        for c, w, t in (("fdc", 80, "fdc_id"), ("name", 300, "Food name"), ("prompt", 740, "Prompt"), ("thumb", 60, "Image")):
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor="w")
        self.tree.pack(fill="both", expand=True, padx=6, pady=4)
        self.tree.bind("<<TreeviewSelect>>", self.show_selected)
        self.r_detail = tk.Text(f, height=6, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat")
        self.r_detail.pack(fill="x", padx=6, pady=(0, 6))
        self.r_page = 0
        self.r_ids: dict[str, tuple[int, bool]] = {}
        self.after(800, lambda: self.load_review(0))

    # ----------------------------------------------------------------- helpers
    def say_log(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", time.strftime("%H:%M:%S ") + text + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def scopes(self) -> list[str]:
        return [s for s, v in self.scope_vars.items() if v.get()]

    def set_text(self, widget: tk.Text, text: str) -> None:
        widget.delete("1.0", "end")
        widget.insert("1.0", text)

    def show_template(self) -> None:
        win = tk.Toplevel(self)
        win.title(f"Prompt template ({TEMPLATE_NAME})")
        win.geometry("860x560")
        t = tk.Text(win, wrap="word", font=("Segoe UI", 10))
        t.pack(fill="both", expand=True)
        t.insert("1.0", TEMPLATE_FILE.read_text(encoding="utf8"))
        t.configure(state="disabled")

    def close(self) -> None:
        for w in (self.pworker, self.tworker, self.bworker):
            if w is not None and w.is_alive():
                w.stop_event.set()
        if self.bworker is not None and self.bworker.is_alive():
            self.bworker.join(timeout=30)          # stops the batch process; it resumes next time
        self.destroy()

    # ------------------------------------------------------------------ states
    def poll_once(self) -> None:
        def work() -> None:
            ready, model = image_server_state()
            self.events.put(("state", (prompt_model_loaded(), model, ready)))
        threading.Thread(target=work, daemon=True).start()

    def poll_states(self) -> None:
        self.poll_once()
        self.after(3000, self.poll_states)

    def alive(self, w) -> bool:
        return w is not None and w.is_alive()

    def apply_states(self) -> None:
        pr, tr, br = self.alive(self.pworker), self.alive(self.tworker), self.alive(self.bworker)
        busy = self.loading is not None
        if self.loading == "prompt":
            self.p_state.set("Prompt model: loading...")
        else:
            self.p_state.set("Prompt model: LOADED" if self.prompt_loaded else "Prompt model: not loaded")
        model = self.live_model.get()
        if self.loading == "image":
            self.t_state.set("Image model: loading (about 20 s)...")
        elif self.image_model:
            self.t_state.set(f"Image model: {self.image_model} " + ("LOADED" if self.image_ready else "starting"))
        else:
            self.t_state.set("Image model: not loaded")

        def en(btn, on):
            btn.state(["!disabled"] if on else ["disabled"])
        gpu_free = not self.prompt_loaded and self.image_model is None and not br and not busy
        st = self.job.state()
        en(self.p_load, gpu_free)
        en(self.p_unload, self.prompt_loaded and not pr and not busy)
        en(self.p_start, self.prompt_loaded and not pr and not busy)
        en(self.p_stop, pr)
        en(self.t_load, gpu_free)
        en(self.t_unload, self.image_model is not None and not tr and not busy)
        en(self.t_start, self.image_model == model and self.image_ready and not tr and not busy)
        en(self.t_stop, tr)
        en(self.t_model_box, self.image_model is None and not tr)
        en(self.b_encode, gpu_free and (st == "incomplete" or (st in ("none", "finished") and self.need_thumb > 0)))
        en(self.b_gen, gpu_free and st == "encoded")
        en(self.b_stop, br)
        en(self.b_discard, st != "none" and not br)

    # ---------------------------------------------------------- load / unload
    def load_prompt_model(self) -> None:
        self.loading = "prompt"
        self.apply_states()
        self.say_log(f"Loading {PROMPT_MODEL}...")

        def work() -> None:
            try:
                http_json(f"{OLLAMA}/api/generate", {"model": PROMPT_MODEL, "keep_alive": KEEP_ALIVE, "stream": False,
                                                       "options": {"num_ctx": PROMPT_CTX}}, timeout=300)
                self.events.put(("log", f"{PROMPT_MODEL} loaded."))
            except (urllib.error.URLError, OSError, ValueError) as e:
                self.events.put(("log", f"Could not load {PROMPT_MODEL}: {e}"))
            self.events.put(("loaded", "prompt"))
        threading.Thread(target=work, daemon=True).start()

    def unload_prompt_model(self) -> None:
        def work() -> None:
            try:
                http_json(f"{OLLAMA}/api/generate", {"model": PROMPT_MODEL, "keep_alive": 0, "stream": False}, timeout=30)
                self.events.put(("log", f"{PROMPT_MODEL} unloaded."))
            except (urllib.error.URLError, OSError, ValueError) as e:
                self.events.put(("log", f"Unload failed: {e}"))
            self.events.put(("loaded", "prompt"))
        threading.Thread(target=work, daemon=True).start()

    def load_image_model(self) -> None:
        model = self.live_model.get()
        self.loading = "image"
        self.apply_states()
        self.say_log(f"Loading the image model ({model})...")

        def work() -> None:
            py = str(FOOD_THUMB_PY) if FOOD_THUMB_PY.exists() else sys.executable
            try:
                out = subprocess.run([py, str(FOOD_THUMB_SCRIPT), "start", "--model", model, "--headless"],
                                     capture_output=True, text=True, timeout=300, creationflags=NO_WINDOW)
                msg = (out.stdout.strip() or out.stderr.strip()) if out.returncode == 0 else f"start failed: {out.stderr.strip() or out.stdout.strip()}"
            except (OSError, subprocess.TimeoutExpired) as e:
                msg = f"start failed: {e}"
            self.events.put(("log", msg))
            self.events.put(("loaded", "image"))
        threading.Thread(target=work, daemon=True).start()

    def unload_image_model(self) -> None:
        def work() -> None:
            try:
                urllib.request.urlopen(urllib.request.Request(f"{FOOD_THUMB_URL}/shutdown", method="POST"), timeout=15)
                self.events.put(("log", "Image model unloaded."))
            except (urllib.error.URLError, OSError) as e:
                self.events.put(("log", f"Unload request failed (maybe already stopped): {e}"))
            self.events.put(("loaded", "image"))
        threading.Thread(target=work, daemon=True).start()

    # ----------------------------------------------------------- start / stop
    def start_prompts(self) -> None:
        if not self.scopes():
            messagebox.showinfo("No scope", "Tick at least one scope of foods to prompt.")
            return
        try:
            batch = int(self.prompt_batch.get())
        except (tk.TclError, ValueError):
            batch = DEFAULT_PROMPT_BATCH
        self.pworker = PromptWorker(self.events, self.scopes(), min(max(batch, 1), 20))
        self.pworker.start()
        self.say_log(f"Prompting started ({self.pworker.batch_size} foods per call).")
        self.apply_states()

    def stop_prompts(self) -> None:
        if self.pworker:
            self.pworker.stop_event.set()
            self.say_log("Stopping the prompt pipeline after the current call...")

    def start_thumbs(self) -> None:
        self.tworker = ThumbWorker(self.events, self.live_model.get())
        self.tworker.start()
        self.say_log("Live thumbnail generation started.")
        self.apply_states()

    def stop_thumbs(self) -> None:
        if self.tworker:
            self.tworker.stop_event.set()
            self.say_log("Stopping live generation after the current image...")

    # -------------------------------------------------------------------- bulk
    def start_encode(self) -> None:
        st = self.job.state()
        if st in ("none", "finished"):
            try:
                with connect() as db:
                    rows = prompts_without_thumbnail(db, set(), 10_000_000)
            except psycopg.Error as e:
                self.say_log(f"Could not read the waiting prompts: {e}")
                return
            if not rows:
                messagebox.showinfo("Nothing to do", "No prompts are waiting for an image.")
                return
            self.job = BulkJob.create(BULK_DIR / "current", rows)
            self.say_log(f"Bulk job created: {len(rows):,} prompts frozen into {self.job.dir}.")
        else:
            self.say_log("Resuming the encode of the existing bulk job.")
        threading.Thread(target=self.token_report, daemon=True).start()
        self.bworker = BulkRunner(self.events, self.job, "encode")
        self.bworker.start()
        self.apply_states()

    def token_report(self) -> None:
        try:
            out = subprocess.run(self.job.tokens_command(), capture_output=True, text=True, timeout=600, creationflags=NO_WINDOW)
            self.events.put(("log", "Token check: " + " ".join(out.stdout.split("\n")[:2]).strip()))
        except (OSError, subprocess.TimeoutExpired) as e:
            self.events.put(("log", f"Token check failed: {e}"))

    def start_generate(self) -> None:
        self.bworker = BulkRunner(self.events, self.job, "generate")
        self.bworker.start()
        self.say_log("Bulk generation started.")
        self.apply_states()

    def stop_bulk(self) -> None:
        if self.alive(self.bworker):
            self.bworker.stop_event.set()
            self.say_log("Stopping the bulk run (progress is kept; start the same step again to resume)...")

    def discard_job(self) -> None:
        if not messagebox.askyesno("Discard job", "Delete the bulk job's frozen prompts and saved encodings? Images already "
                                   "made are kept. Prompts still without an image will be picked up by the next job."):
            return
        try:
            if self.job.state() in ("encoded", "incomplete"):
                with connect() as db:
                    done = {r[0] for r in db.execute("SELECT fdc_id FROM food_thumbnail_current").fetchall()}
                    new = register_new_images(db, self.job, done)
                if new:
                    self.say_log(f"Filed {len(new)} finished image(s) before discarding.")
            shutil.rmtree(self.job.dir, ignore_errors=True)
        except (psycopg.Error, OSError) as e:
            self.say_log(f"Discard failed: {e}")
            return
        self.say_log("Bulk job discarded.")
        self.refresh_counts()
        self.apply_states()

    def refresh_bulk(self) -> None:
        st = self.job.state()
        if st == "none":
            self.b_state.set("No bulk job. 'Bulk encode' freezes every prompt that has no image into a job and encodes it.")
            self.b_bar.configure(value=0)
            self.b_prog.set("-")
        else:
            m = self.job.manifest
            prog = self.job.progress()
            n = m["n"]
            running = self.alive(self.bworker)
            label = {"incomplete": "encoding not finished", "encoded": "encoded, ready to generate", "finished": "finished"}[st]
            self.b_state.set(f"Bulk job: {n:,} prompts, {label}" + (" (running)" if running else "") + f"   created {m['created']}")
            phase = prog.get("phase", "-")
            if phase == "encoding":
                total = max(prog.get("chunks_total") or 1, 1)
                self.b_bar.configure(maximum=total, value=prog.get("encoded_chunks", 0))
                self.b_prog.set(f"Encoding prompts: chunk {prog.get('encoded_chunks', 0)} of {total}")
            else:
                done = prog.get("done", 0)
                self.b_bar.configure(maximum=max(n, 1), value=done if st != "finished" else n)
                eta = prog.get("eta_s")
                self.b_prog.set(f"Phase: {phase}   images {done:,} / {n:,}"
                                + (f"   {prog['rate_img_per_s']:.2f}/s   ETA {eta / 3600:.1f} h" if eta and prog.get("rate_img_per_s") else "")
                                + (f"   failed {prog.get('failed')}" if prog.get("failed") else ""))
            self.set_text(self.b_log, self.job.log_tail())
        self.apply_states()
        self.after(2000, self.refresh_bulk)

    # ------------------------------------------------------------------ counts
    def maybe_refresh_counts(self) -> None:
        if time.time() - getattr(self, "_counts_at", 0) > 2:
            self.refresh_counts()

    def maybe_refresh_review(self) -> None:
        """Keep the Prompts tab current while prompts are being written (newest first, page 1, nothing selected)."""
        if time.time() - getattr(self, "_review_at", 0) < 3:
            return
        self._review_at = time.time()
        if self.r_page == 0 and not self.r_search.get().strip() and not self.tree.selection():
            self.load_review(0)

    def refresh_counts(self) -> None:
        self._counts_at = time.time()
        try:
            load_env()
            with connect() as db:
                foods, prompts, thumbs, need_prompt, need_thumb = counts(db, self.scopes())
        except psycopg.Error as e:
            self.p_stats.set(f"db error: {e}")
            return
        self.need_thumb = need_thumb
        self.p_stats.set(f"Foods in scope {foods:,}   with a prompt {prompts:,}   still need a prompt {need_prompt:,}")
        self.t_stats.set(f"Thumbnails {thumbs:,}   prompts waiting for an image {need_thumb:,}")

    # ------------------------------------------------------------------ events
    def show_image(self, label: ttk.Label, data: bytes, attr: str) -> None:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((220, 220))
        photo = ImageTk.PhotoImage(img)
        setattr(self, attr, photo)
        label.configure(image=photo)

    def pump_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "log":
                    self.say_log(payload)
                elif kind == "state":
                    self.prompt_loaded, self.image_model, self.image_ready = payload
                    self.apply_states()
                elif kind == "loaded":
                    self.loading = None
                    self.poll_once()
                    self.apply_states()
                elif kind == "prompt":
                    fdc_id, name, prompt = payload
                    self.set_text(self.p_last, f'fdc {fdc_id}  "{name}"\n\n{prompt}')
                    self.say_log(f"prompt fdc {fdc_id:<8} {name[:60]}")
                    self.maybe_refresh_counts()
                    self.maybe_refresh_review()
                elif kind == "pstats":
                    made, skipped_n, per_min = payload
                    self.p_rate.set(f"This run: {made:,} prompts written, {per_min:.0f}/min"
                                    + (f", {skipped_n} skipped" if skipped_n else ""))
                elif kind == "image":
                    fdc_id, name, prompt, data = payload
                    self.show_image(self.preview, data, "_photo")
                    self.set_text(self.t_last, f'fdc {fdc_id}  "{name}"\n\n{prompt}')
                    self.say_log(f"ok   fdc {fdc_id:<8} {name[:60]}")
                elif kind == "tstats":
                    made, errors, per_min = payload
                    self.maybe_refresh_counts()
                elif kind == "bimage":
                    n, fdc_id, name, prompt, data = payload
                    self.show_image(self.b_preview, data, "_bphoto")
                    self.set_text(self.b_last, f'+{n} filed, latest fdc {fdc_id}  "{name}"\n\n{prompt}')
                    self.maybe_refresh_counts()
                elif kind == "bdone":
                    mode, status = payload
                    msg = {"encoded": "Encoding finished: every prompt is encoded. Press 'Bulk generate' when ready.",
                           "finished": "Bulk job finished: every image is made and filed.",
                           "partial": "Bulk run ended with some failures; press 'Bulk generate' again to retry them.",
                           "stopped": "Bulk run stopped; start the same step again to resume.",
                           "failed": "Bulk run failed; see the log below and db/lab/bulk/current/batch.log."}[status]
                    self.say_log(msg)
                    self.refresh_counts()
                    self.apply_states()
                elif kind in ("pdone", "tdone"):
                    self.say_log(payload)
                    self.refresh_counts()
                    self.apply_states()
        except queue.Empty:
            pass
        self.after(200, self.pump_events)

    # ------------------------------------------------------------ prompts tab
    PAGE = 200

    def load_review(self, page: int) -> None:
        page = max(page, 0)
        q = f"%{self.r_search.get().strip()}%"
        try:
            load_env()
            with connect() as db:
                total = db.execute("SELECT count(*) FROM food_thumbnail_prompt_current p WHERE p.food_name ILIKE %s OR p.prompt ILIKE %s", (q, q)).fetchone()[0]
                last = max((total - 1) // self.PAGE, 0)
                page = min(page, last)
                rows = db.execute(
                    """SELECT p.id, p.fdc_id, p.food_name, p.prompt,
                              EXISTS (SELECT 1 FROM food_thumbnail_current t WHERE t.fdc_id = p.fdc_id)
                       FROM food_thumbnail_prompt_current p WHERE p.food_name ILIKE %s OR p.prompt ILIKE %s
                       ORDER BY p.created_at DESC, p.id DESC LIMIT %s OFFSET %s""", (q, q, self.PAGE, page * self.PAGE)).fetchall()
        except psycopg.Error as e:
            self.say_log(f"Prompts query failed: {e}")
            return
        self.r_page = page
        self.r_info.config(text=f"page {page + 1} of {last + 1}   ({total:,} prompts)")
        self.tree.delete(*self.tree.get_children())
        self.r_ids = {}
        for pid, fdc_id, name, prompt, has in rows:
            iid = self.tree.insert("", "end", values=(fdc_id, name, prompt, "yes" if has else ""))
            self.r_ids[iid] = (pid, has)

    def show_selected(self, _e=None) -> None:
        sel = self.tree.selection()
        if sel:
            v = self.tree.item(sel[0], "values")
            self.set_text(self.r_detail, f'fdc {v[0]}  "{v[1]}"\n\n{v[2]}')

    def remove_selected(self) -> None:
        ids = [self.r_ids[i][0] for i in self.tree.selection() if i in self.r_ids and not self.r_ids[i][1]]
        skipped = len(self.tree.selection()) - len(ids)
        if not ids:
            messagebox.showinfo("Nothing to remove", "Select prompts that have no thumbnail yet.")
            return
        if not messagebox.askyesno("Remove prompts", f"Remove {len(ids)} prompt(s)? They will be regenerated next time the prompt pipeline runs."
                                   + (f"\n({skipped} selected already have a thumbnail and are kept.)" if skipped else "")):
            return
        try:
            with connect() as db:
                db.execute("DELETE FROM food_thumbnail_prompt WHERE id = ANY(%s)", (ids,))
        except psycopg.Error as e:
            self.say_log(f"Remove failed: {e}")
            return
        self.say_log(f"Removed {len(ids)} prompt(s).")
        self.load_review(self.r_page)
        self.refresh_counts()


if __name__ == "__main__":
    load_env()
    try:
        App().mainloop()
    except Exception:  # noqa: BLE001
        log_error(traceback.format_exc())
        raise
