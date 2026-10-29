"""Vision QA pass over the generated food thumbnails.

Asks a local vision model (qwen3-vl:8b, thinking on) three questions about the
image -- recognisable as <name>, the only food in it, presented naturally -- with a
single yes/no answer, and writes the answer to food_thumbnail.qa_rejected on the judged row:
    0 = accepted (yes), 1 = rejected (no), NULL = not tested.
<name> is food.common_name when there is one, otherwise the USDA description
with its qualifier sections stripped (see clean_name).

Run:  python db\\lab\\thumb_qa.py      (starts automatically; Stop/Start to pause)
Tabs: Live (current image, verdict, reasoning, speed and token stats) and
Review (browse rejected/accepted/untested; click an image to flip its verdict).
Needs psycopg + Pillow (same interpreter as thumb_studio.py) and Ollama running.
Schema: db/lab/13_thumbnail_qa.sql.
"""
from __future__ import annotations

import base64
import io
import json
import os
import queue
import re
import threading
import time
import tkinter as tk
import urllib.request
from pathlib import Path
from tkinter import messagebox, ttk

import psycopg
from PIL import Image, ImageTk

ROOT = Path(__file__).resolve().parents[2]
THUMB_DIR = Path(__file__).resolve().parent / "thumbnails"
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = "qwen3-vl:8b"
PROMPT = (
    'This image should be a thumbnail of "{n}" for a nutrition database.\n'
    '1. Is it instantly recognizable as "{n}"?\n'
    '2. Is "{n}" the only food in the picture, with no other foods, vegetables or side dishes taking up space next to it?\n'
    '3. Is it presented naturally, the way that food is normally served or sold, with no strange objects, '
    'empty dishes or odd arrangements?\n'
    'Think, then answer with one word: yes if all three are yes, otherwise no.')
BATCH = 20

# Comma sections that describe how a food was sold, measured or graded rather
# than what it looks like.
QUALIFIER = re.compile(
    r"\b(separable|lean only|lean and fat|trimmed|all grades|choice|select|composite|retail|"
    r"added solution|with salt|without salt|no salt|salt added|without added|not fortified|fortified|"
    r"enriched|unenriched|commercial(ly)?|prepared|unprepared|ready-to-serve|ready-to-eat|ready to|"
    r"shelf stable|imported|domestic|australian|new zealand|fresh|canned|frozen|bottled|"
    r"nfs|ns as to|includes|usda|commodity|proof|boneless|regular pack|solids and liquids|drained|"
    r"heavy syrup|light syrup|juice pack|water pack|low sodium|reduced sodium|vitamin|"
    r"partially|degermed|sulfured|unsulfured|industrial|mature seeds|variety meats|by-products)\b",
    re.I)
# Leading USDA category words that are not the food itself.
CATEGORY_HEADS = {
    "beverages", "alcoholic beverage", "alcoholic beverages", "fast foods", "fast food", "spices",
    "cereals ready-to-eat", "cereals", "nuts", "seeds", "sauce", "sauces", "restaurant", "snacks",
    "babyfood", "soup", "soups", "candies", "cookies", "oil", "fish", "infant formula",
}


def clean_name(common_name: str | None, description: str) -> str:
    if common_name and common_name.strip():
        return common_name.strip()
    text = re.sub(r"\([^)]*\)", "", description)
    parts = [p.strip() for p in text.split(",") if p.strip()]
    kept = []
    for p in parts:
        letters = [c for c in p if c.isalpha()]
        if len(letters) > 1 and sum(c.isupper() for c in letters) / len(letters) > 0.7:
            continue                                    # brand: "MEZZETTA", "BURGER KING"
        if re.search(r"\d", p) or QUALIFIER.search(p):
            continue                                    # "80% diglycerides", "separable lean only"
        kept.append(p)
    if len(kept) > 1 and kept[0].lower() in CATEGORY_HEADS:
        kept = kept[1:]
    kept = kept[:3]                                     # trailing sections are the least visual
    return ", ".join(kept) if kept else (parts[0] if parts else description.strip())


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


def ask(image: Image.Image, name: str) -> dict:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, "PNG")
    body = {"model": MODEL, "stream": False, "think": True, "keep_alive": "10m",
            "options": {"temperature": 0, "num_ctx": 4096},
            "messages": [{"role": "user", "content": PROMPT.format(n=name),
                          "images": [base64.b64encode(buf.getvalue()).decode()]}]}
    req = urllib.request.Request(f"{OLLAMA}/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read())
    return {"answer": d["message"]["content"].strip(), "thinking": (d["message"].get("thinking") or "").strip(),
            "tok_in": d.get("prompt_eval_count", 0), "tok_out": d.get("eval_count", 0)}


def parse(answer: str) -> int | None:
    a = answer.lower().lstrip("*\"' ")
    if a.startswith("yes"):
        return 0
    if a.startswith("no"):
        return 1
    found = re.findall(r"\b(yes|no)\b", a)
    return None if not found else (0 if found[-1] == "yes" else 1)


class Worker(threading.Thread):
    def __init__(self, events: queue.Queue):
        super().__init__(daemon=True)
        self.events = events
        self.stop_flag = threading.Event()
        self.skipped: set[int] = set()   # unreadable file / unparseable answer: don't loop on them

    def run(self) -> None:
        try:
            db = connect()
        except psycopg.Error as e:
            self.events.put(("log", f"DB connect failed: {e}"))
            self.events.put(("stopped", None))
            return
        while not self.stop_flag.is_set():
            try:
                rows = db.execute(
                    """SELECT t.id, t.fdc_id, f.common_name, f.description
                       FROM food_thumbnail_current t JOIN food f USING (fdc_id)
                       WHERE t.qa_rejected IS NULL AND NOT (t.id = ANY(%s))
                       ORDER BY t.fdc_id LIMIT %s""", (list(self.skipped), BATCH)).fetchall()
            except psycopg.Error as e:
                self.events.put(("log", f"DB error: {e}; retrying in 10 s"))
                time.sleep(10)
                try:
                    db = connect()
                except psycopg.Error:
                    pass
                continue
            if not rows:
                self.events.put(("log", "All current thumbnails have been tested."))
                break
            for tid, fdc_id, common, desc in rows:
                if self.stop_flag.is_set():
                    break
                name = clean_name(common, desc)
                try:
                    img = Image.open(THUMB_DIR / f"{fdc_id}.webp")
                    img.load()
                except OSError:
                    self.skipped.add(tid)
                    self.events.put(("log", f"{fdc_id}: no readable image file, skipped"))
                    continue
                t0 = time.time()
                try:
                    r = ask(img, name)
                except Exception as e:  # Ollama down/restarting: wait and retry this batch
                    self.events.put(("log", f"{fdc_id}: model call failed ({e}); retrying in 15 s"))
                    time.sleep(15)
                    break
                verdict = parse(r["answer"])
                if verdict is None:
                    self.skipped.add(tid)
                    self.events.put(("log", f"{fdc_id}: unclear answer {r['answer'][:60]!r}, left untested"))
                    continue
                db.execute("UPDATE food_thumbnail SET qa_rejected=%s, qa_name=%s, qa_model=%s, qa_note=%s, qa_at=now() "
                           "WHERE id=%s", (verdict, name, MODEL, r["thinking"] or r["answer"], tid))
                self.events.put(("result", dict(fdc_id=fdc_id, name=name, desc=desc, verdict=verdict, img=img.copy(),
                                                secs=time.time() - t0, **r)))
        db.close()
        self.events.put(("stopped", None))


GREEN, RED, GREY = "#2a8a3a", "#c0392b", "#888888"


class App:
    PAGE = 40

    def __init__(self, root: tk.Tk):
        self.root = root
        root.title(f"Thumbnail QA - {MODEL}")
        root.geometry("1180x880")
        self.events: queue.Queue = queue.Queue()
        self.worker: Worker | None = None
        self.secs: list[float] = []
        self.tok_in: list[int] = []
        self.tok_out: list[int] = []
        self.refs: list[ImageTk.PhotoImage] = []

        top = ttk.Frame(root, padding=8)
        top.pack(fill="x")
        self.btn = ttk.Button(top, text="Stop", command=self.toggle, width=10)
        self.btn.pack(side="left")
        self.status = ttk.Label(top, text="starting...", font=("Segoe UI", 11, "bold"))
        self.status.pack(side="left", padx=12)
        self.bar = ttk.Progressbar(root, mode="determinate")
        self.bar.pack(fill="x", padx=8)
        self.stats = ttk.Label(root, text="", font=("Segoe UI", 10), padding=(8, 4, 8, 0))
        self.stats.pack(fill="x")
        self.stats2 = ttk.Label(root, text="", font=("Segoe UI", 9), foreground="#555", padding=(8, 0, 8, 4))
        self.stats2.pack(fill="x")

        tabs = ttk.Notebook(root)
        tabs.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        live = ttk.Frame(tabs, padding=8)
        review = ttk.Frame(tabs, padding=8)
        tabs.add(live, text="Live")
        tabs.add(review, text="Review")
        self.build_live(live)
        self.build_review(review)

        root.protocol("WM_DELETE_WINDOW", self.close)
        self.refresh_counts()
        root.after(200, self.poll)
        root.after(800, self.start)          # starts automatically

    # ---------------------------------------------------------------- live tab
    def build_live(self, f: ttk.Frame) -> None:
        mid = ttk.Frame(f)
        mid.pack(fill="x")
        self.preview = tk.Label(mid, bg="#ddd", width=320, height=320)
        self.preview.pack(side="left")
        info = ttk.Frame(mid, padding=(12, 0))
        info.pack(side="left", fill="both", expand=True)
        self.verdict = tk.Label(info, text="", font=("Segoe UI", 26, "bold"))
        self.verdict.pack(anchor="w")
        self.cur_name = ttk.Label(info, text="", font=("Segoe UI", 12, "bold"), wraplength=760)
        self.cur_name.pack(anchor="w", pady=(4, 0))
        self.cur_desc = ttk.Label(info, text="", foreground="#666", wraplength=760)
        self.cur_desc.pack(anchor="w")
        self.cur_meta = ttk.Label(info, text="", foreground="#666")
        self.cur_meta.pack(anchor="w", pady=(2, 6))
        ttk.Label(info, text="Model reasoning", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.reason = tk.Text(info, height=11, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat")
        self.reason.pack(fill="both", expand=True)

        hist = ttk.Frame(f)
        hist.pack(fill="x", pady=(8, 0))
        ttk.Label(hist, text="Recent (green = accepted, red = rejected, newest on the left)",
                  font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.recent = ttk.Frame(hist)
        self.recent.pack(fill="x")
        self.log = tk.Text(f, height=7, font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, pady=(8, 0))

    def show(self, r: dict) -> None:
        self.secs.append(r["secs"])
        self.tok_in.append(r["tok_in"])
        self.tok_out.append(r["tok_out"])
        ok = r["verdict"] == 0
        colour = GREEN if ok else RED
        big = ImageTk.PhotoImage(r["img"].convert("RGB").resize((320, 320)))
        self.preview.config(image=big, width=320, height=320)
        self.preview.image = big
        self.verdict.config(text="ACCEPTED" if ok else "REJECTED", fg=colour)
        self.cur_name.config(text=f'"{r["name"]}"')
        self.cur_desc.config(text=f'{r["desc"]}   (fdc {r["fdc_id"]})')
        self.cur_meta.config(text=f'{r["secs"]:.1f} s    {r["tok_in"]} tokens in / {r["tok_out"]} out    answer: {r["answer"][:40]!r}')
        self.reason.delete("1.0", "end")
        self.reason.insert("1.0", r["thinking"] or "(no reasoning returned)")
        self.logline(f'{r["fdc_id"]} {"ok " if ok else "REJ"} {r["secs"]:4.1f}s  {r["name"]}')

        cell = tk.Frame(self.recent, bg=colour, padx=3, pady=3)
        small = ImageTk.PhotoImage(r["img"].convert("RGB").resize((88, 88)))
        tk.Label(cell, image=small, bd=0).pack()
        tk.Label(cell, text=r["name"][:14], font=("Segoe UI", 7), bg=colour, fg="white").pack(fill="x")
        cell.image = small
        existing = self.recent.winfo_children()[:-1]
        if existing:
            cell.pack(side="left", padx=2, before=existing[0])
        else:
            cell.pack(side="left", padx=2)
        for old in self.recent.pack_slaves()[11:]:
            old.destroy()

    # -------------------------------------------------------------- review tab
    def build_review(self, f: ttk.Frame) -> None:
        bar = ttk.Frame(f)
        bar.pack(fill="x")
        self.r_filter = tk.StringVar(value="rejected")
        for v in ("rejected", "accepted", "untested"):
            ttk.Radiobutton(bar, text=v.capitalize(), value=v, variable=self.r_filter,
                            command=lambda: self.load_review(0)).pack(side="left")
        ttk.Label(bar, text="   search:").pack(side="left")
        self.r_search = tk.StringVar()
        e = ttk.Entry(bar, textvariable=self.r_search, width=24)
        e.pack(side="left")
        e.bind("<Return>", lambda _e: self.load_review(0))
        ttk.Button(bar, text="< Prev", command=lambda: self.load_review(self.r_page - 1)).pack(side="left", padx=(12, 2))
        ttk.Button(bar, text="Next >", command=lambda: self.load_review(self.r_page + 1)).pack(side="left")
        ttk.Button(bar, text="Refresh", command=lambda: self.load_review(self.r_page)).pack(side="left", padx=6)
        self.r_info = ttk.Label(bar, text="")
        self.r_info.pack(side="left", padx=8)
        ttk.Label(f, text="Click an image to flip its verdict (saved as a manual override, marked *). "
                          "Hover for the full name and the model's reasoning.",
                  foreground="#666").pack(anchor="w", pady=(4, 4))
        self.grid = ttk.Frame(f)
        self.grid.pack(fill="both", expand=True)
        self.r_detail = tk.Text(f, height=6, wrap="word", font=("Segoe UI", 9), bg="#f6f6f6", relief="flat")
        self.r_detail.pack(fill="x", pady=(6, 0))
        self.r_page = 0
        self.root.after(1000, lambda: self.load_review(0))

    def load_review(self, page: int) -> None:
        page = max(page, 0)
        cond = {"rejected": "t.qa_rejected = 1", "accepted": "t.qa_rejected = 0",
                "untested": "t.qa_rejected IS NULL"}[self.r_filter.get()]
        q = f"%{self.r_search.get().strip()}%"
        where = f"WHERE {cond} AND (coalesce(t.qa_name, '') ILIKE %s OR f.description ILIKE %s)"
        try:
            with connect() as db:
                total = db.execute(f"SELECT count(*) FROM food_thumbnail_current t JOIN food f USING (fdc_id) {where}",
                                   (q, q)).fetchone()[0]
                last = max((total - 1) // self.PAGE, 0)
                page = min(page, last)
                rows = db.execute(
                    f"""SELECT t.id, t.fdc_id, coalesce(t.qa_name, f.common_name, f.description), f.description,
                               t.qa_rejected, t.qa_note, t.qa_model
                        FROM food_thumbnail_current t JOIN food f USING (fdc_id) {where}
                        ORDER BY t.qa_at DESC NULLS LAST, t.fdc_id LIMIT %s OFFSET %s""",
                    (q, q, self.PAGE, page * self.PAGE)).fetchall()
        except psycopg.Error as e:
            self.logline(f"review query failed: {e}")
            return
        self.r_page = page
        self.r_info.config(text=f"page {page + 1} of {last + 1}   ({total:,} images)")
        for w in self.grid.winfo_children():
            w.destroy()
        self.refs = []
        for k, (tid, fdc_id, name, desc, rej, note, model) in enumerate(rows):
            colour = GREY if rej is None else (RED if rej else GREEN)
            cell = tk.Frame(self.grid, bg=colour, padx=3, pady=3, cursor="hand2")
            try:
                im = ImageTk.PhotoImage(Image.open(THUMB_DIR / f"{fdc_id}.webp").convert("RGB").resize((118, 118)))
            except OSError:
                im = ImageTk.PhotoImage(Image.new("RGB", (118, 118), "#ccc"))
            self.refs.append(im)
            pic = tk.Label(cell, image=im, bd=0)
            pic.pack()
            cap = tk.Label(cell, text=name[:19] + (" *" if model == "manual" else ""), font=("Segoe UI", 7),
                           bg=colour, fg="white", width=19)
            cap.pack(fill="x")
            cell.grid(row=k // 8, column=k % 8, padx=3, pady=3)
            info = f"{name}   (fdc {fdc_id})\n{desc}\n\n{note or ''}"
            for w in (cell, pic, cap):
                w.bind("<Button-1>", lambda _e, i=tid, r=rej, n=name: self.flip(i, r, n))
                w.bind("<Enter>", lambda _e, s=info: self.set_detail(s))

    def set_detail(self, text: str) -> None:
        self.r_detail.delete("1.0", "end")
        self.r_detail.insert("1.0", text)

    def flip(self, tid: int, rej: int | None, name: str) -> None:
        if rej is None and not messagebox.askyesno("Untested image", f'Mark "{name}" as rejected?'):
            return
        new = 0 if rej == 1 else 1
        try:
            with connect() as db:
                db.execute("UPDATE food_thumbnail SET qa_rejected=%s, qa_model='manual', qa_note='manual override', "
                           "qa_name=coalesce(qa_name, %s), qa_at=now() WHERE id=%s", (new, name, tid))
        except psycopg.Error as e:
            self.logline(f"override failed: {e}")
            return
        self.logline(f'manual: "{name}" -> {"rejected" if new else "accepted"}')
        self.load_review(self.r_page)

    # ------------------------------------------------------------------ shared
    def start(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        self.worker = Worker(self.events)
        self.worker.start()
        self.btn.config(text="Stop")
        self.status.config(text="Running")
        self.logline("Started.")

    def toggle(self) -> None:
        if self.worker and self.worker.is_alive():
            self.worker.stop_flag.set()
            self.status.config(text="Stopping after current image...")
        else:
            self.start()

    def close(self) -> None:
        if self.worker:
            self.worker.stop_flag.set()
        self.root.destroy()

    def logline(self, text: str) -> None:
        self.log.insert("end", time.strftime("%H:%M:%S ") + text + "\n")
        self.log.see("end")

    def refresh_counts(self) -> None:
        try:
            with connect() as db:
                total, tested, rejected, manual = db.execute(
                    "SELECT count(*), count(qa_rejected), coalesce(sum(qa_rejected), 0), "
                    "count(*) FILTER (WHERE qa_model = 'manual') FROM food_thumbnail_current").fetchone()
        except psycopg.Error as e:
            self.logline(f"count query failed: {e}")
        else:
            self.bar.config(maximum=max(total, 1), value=tested)
            recent = self.secs[-50:]
            avg = sum(recent) / len(recent) if recent else 0
            left = total - tested
            self.stats.config(text=(
                f"Tested {tested:,} / {total:,} ({tested / max(total, 1):.1%})     "
                f"Accepted {tested - rejected:,}     Rejected {rejected:,} ({rejected / max(tested, 1):.0%})     "
                f"Manual overrides {manual:,}     {avg:.1f} s/image     ETA {left * avg / 3600:.1f} h"))
            if self.tok_in:
                n = len(self.tok_in)
                ai, ao = sum(self.tok_in) / n, sum(self.tok_out) / n
                self.stats2.config(text=(
                    f"Tokens this session: {sum(self.tok_in):,} in / {sum(self.tok_out):,} out "
                    f"(avg {ai:,.0f} in / {ao:,.0f} out per image)     "
                    f"Projected for the remaining {left:,}: {ai * left / 1e6:.1f}M in / {ao * left / 1e6:.1f}M out"))
        self.root.after(5000, self.refresh_counts)

    def poll(self) -> None:
        try:
            while True:
                kind, data = self.events.get_nowait()
                if kind == "log":
                    self.logline(data)
                elif kind == "stopped":
                    self.btn.config(text="Start")
                    self.status.config(text="Stopped")
                    self.logline("Stopped.")
                elif kind == "result":
                    self.show(data)
        except queue.Empty:
            pass
        self.root.after(200, self.poll)


if __name__ == "__main__":
    load_env()
    root = tk.Tk()
    App(root)
    root.mainloop()
