"""Runs food_thumb.py unchanged, but makes os.replace wait out a brief 'Access is denied'.

Why: food_thumb writes progress.json and every image as <name>.tmp followed by os.replace(). On Windows
that rename fails with WinError 5 when anything has the file open at that instant (an editor's file
watcher, antivirus, the search indexer). Inside the repo that happened to roughly 1 replace in 120, so a
bulk encode of 229 chunks died part way, and generating thousands of images would too.

Usage:  python food_thumb_retry.py <path to food_thumb.py> <food_thumb arguments...>
Used by thumb_studio.py for the batch and tokens commands.
"""
from __future__ import annotations

import os
import runpy
import sys
import time
from pathlib import Path

TRIES, DELAY = 100, 0.1          # up to about 10 seconds
_real_replace = os.replace
_noted = False


def replace_retry(src, dst, *args, **kwargs):
    global _noted
    for attempt in range(TRIES):
        try:
            return _real_replace(src, dst, *args, **kwargs)
        except PermissionError:
            if attempt == TRIES - 1:
                raise
            if not _noted:
                _noted = True
                print("[retry] os.replace was denied by a file lock; retrying (further retries are not logged)", flush=True)
            time.sleep(DELAY)


if __name__ == "__main__":
    script = Path(sys.argv[1]).resolve()
    os.replace = replace_retry
    sys.path.insert(0, str(script.parent))
    sys.argv = [str(script)] + sys.argv[2:]
    runpy.run_path(str(script), run_name="__main__")
