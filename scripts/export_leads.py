#!/usr/bin/env python3
"""Build data/leads.json for the portal's Lead Generation tab from a Labor Demand Radar export.

Usage: python3 -I scripts/export_leads.py <export_dir> <out_file>
  <export_dir> holds leads/*.json, status/*.json (optional) and meta/run.json, as written by
  ArtifactData list/get with out_dir. Each file is {"id","data",...} or the bare document.

The repo is public, so this keeps only public-source lead fields plus Samuel's status label.
Status notes are never exported.
"""
import glob, json, os, sys
from datetime import datetime, timezone

KEEP = ["state", "metro", "project", "ptype", "size", "stage", "signal", "sdate", "gc", "sub",
        "window", "who", "web", "line", "src", "t", "s", "h", "p", "c", "score", "prevScore",
        "list", "firstSeen", "lastChecked", "active", "changeNote"]
STATUSES = {"Not contacted", "Left voicemail", "Spoke – interested", "Meeting set",
            "Proposal sent", "Won – placement", "Lost", "Not a fit"}


def body(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    doc_id = d.get("id") or os.path.splitext(os.path.basename(path))[0]
    return doc_id, (d["data"] if isinstance(d.get("data"), dict) else d)


def main(src, out):
    status = {}
    for p in glob.glob(os.path.join(src, "status", "*.json")):
        i, d = body(p)
        if d.get("status") in STATUSES:
            status[i] = {"status": d["status"], "updatedAt": d.get("updatedAt", "")}

    leads = []
    for p in sorted(glob.glob(os.path.join(src, "leads", "*.json"))):
        i, d = body(p)
        row = {"id": i}
        for k in KEEP:
            if k in d and d[k] is not None:
                row[k] = d[k]
        row["src"] = [u for u in (row.get("src") or []) if isinstance(u, str) and u.startswith(("http://", "https://"))]
        for k in ("t", "s", "h", "p", "c", "score"):
            row[k] = int(row.get(k) or 0)
        row["score"] = row["t"] + row["s"] + row["h"] + row["p"] + row["c"]
        row["list"] = "call" if row["score"] > 50 else "pipeline"
        if i in status:
            row["status"] = status[i]["status"]
            row["statusAt"] = status[i]["updatedAt"]
        leads.append(row)
    leads.sort(key=lambda r: (-r["score"], -r["h"], -r["t"], -r["s"], r.get("project", "")))

    meta = {}
    mp = os.path.join(src, "meta", "run.json")
    if os.path.exists(mp):
        _, m = body(mp)
        meta = {k: m.get(k) for k in ("lastRun", "summary", "nextRun") if m.get(k)}
        meta["history"] = [h for h in (m.get("history") or [])][:30]

    payload = {"exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "run": meta, "leads": leads}
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    active = [r for r in leads if r.get("active", True)]
    print(f"{len(leads)} leads ({len(active)} active, {sum(r['list']=='call' for r in active)} on call list), "
          f"{len(status)} with status -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
