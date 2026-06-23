#!/usr/bin/env python3
"""gitingest_digest.py — thin JSON bridge over gitingest for the remote-git adapter.

Given a repository URL (or local path), runs gitingest.ingest() and emits a single
JSON object on stdout:

  {"ok": true, "repo": "...", "commit": "...", "files": N, "tokens": N,
   "summary": "...", "tree": "...", "content": "..."}

On failure: {"ok": false, "error": "..."} with a non-zero exit code.

The TypeScript adapter (index.ts) shells out to this helper. gitingest is
Python-only, so any faithful use of it needs Python 3.10+ on PATH; the adapter
surfaces a clear error if this script or gitingest is missing.

Usage: python3 gitingest_digest.py <repo-url-or-path> [max_file_size_bytes]

IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
"""
import json
import re
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: gitingest_digest.py <repo> [max_file_size]"}))
        return 2
    source = sys.argv[1]
    max_file_size = int(sys.argv[2]) if len(sys.argv) > 2 else 1_048_576  # 1 MB default

    try:
        from gitingest import ingest
    except ImportError:
        print(json.dumps({
            "ok": False,
            "error": "gitingest is not installed. Install with: pip install gitingest",
        }))
        return 3

    try:
        summary, tree, content = ingest(source, max_file_size=max_file_size)
    except Exception as exc:  # noqa: BLE001 — surface any ingest failure as JSON
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 1

    # Parse the structured fields gitingest puts in the summary header.
    def grab(pattern: str, default: str = "") -> str:
        m = re.search(pattern, summary)
        return m.group(1).strip() if m else default

    repo = grab(r"Repository:\s*(.+)")
    commit = grab(r"Commit:\s*(\S+)")
    files = grab(r"Files analyzed:\s*([\d,]+)").replace(",", "")
    tokens = grab(r"Estimated tokens:\s*([\d.,kKmM]+)")

    print(json.dumps({
        "ok": True,
        "repo": repo,
        "commit": commit,
        "files": int(files) if files.isdigit() else None,
        "tokens": tokens or None,
        "summary": summary,
        "tree": tree,
        "content": content,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
