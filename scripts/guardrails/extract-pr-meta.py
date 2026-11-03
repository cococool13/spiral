#!/usr/bin/env python3
"""Write pr-title.txt / pr-body.txt / pr-labels.txt into GUARDRAILS_TMP.

Prefers GUARDRAILS_TMP/pr.json (live API dump). Falls back to GITHUB_EVENT_PATH.
"""
import json, os
from pathlib import Path

tmp = Path(os.environ.get("GUARDRAILS_TMP") or os.environ.get("RUNNER_TEMP") or "/tmp")
tmp.mkdir(parents=True, exist_ok=True)
api = tmp / "pr.json"
if api.is_file():
    pr = json.loads(api.read_text())
    labels = [l.get("name", "") if isinstance(l, dict) else str(l) for l in (pr.get("labels") or [])]
else:
    ev = json.load(open(os.environ["GITHUB_EVENT_PATH"]))
    pr = ev.get("pull_request") or {}
    labels = [l.get("name", "") for l in (pr.get("labels") or [])]

(tmp / "pr-title.txt").write_text(pr.get("title") or "")
(tmp / "pr-body.txt").write_text(pr.get("body") or "")
(tmp / "pr-labels.txt").write_text(",".join(labels))
print(tmp)
