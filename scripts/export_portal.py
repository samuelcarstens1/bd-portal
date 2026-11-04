#!/usr/bin/env python3
"""Snapshot the BD Progress Portal artifact's database into data/portal.json for the GitHub Pages copy.

Usage: python3 -I scripts/export_portal.py <export dir> data/portal.json

<export dir> holds the artifact database as ArtifactData list/get writes it with out_dir:
  kv/<key>.json            {n, rev, len, at}   one per portal data key
  kvc/<key>@<i>.json       {s}                 the key's value, in chunks (doc id <key>~<i>)
  linkedin/<id>.json       {url, ...}          BusDev Map: saved LinkedIn links
  outreach/<id>.json       {entries, ...}      BusDev Map: calls, emails, meetings
  addedPeople/<id>.json    {name, company, ...} BusDev Map: people added by hand

The map's "personal" collection (family, birthdays, how you met) is deliberately NOT exported:
the GitHub site is public and those are private notes about other people.
"""
import glob, json, os, sys
from datetime import datetime, timezone

SYNC = ["bdp-opps", "bdp-contacts", "bdp-expenses", "bdp-expmeta", "bdp-goals", "bdp-kpis", "bdp-reports",
        "bdp-weeks", "bdp-aop", "ib-ramp-plan-v1", "bdp-seed-ftp-v1"]


def load(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    # tolerate either the bare document or a {id, data} wrapper
    return d.get("data", d) if isinstance(d, dict) and "data" in d and isinstance(d["data"], dict) else d


def docs(src, coll):
    out = {}
    for p in sorted(glob.glob(os.path.join(src, coll, "*.json"))):
        out[os.path.splitext(os.path.basename(p))[0]] = load(p)
    return out


def main():
    src, dest = sys.argv[1], sys.argv[2]
    kv, chunks = docs(src, "kv"), docs(src, "kvc")
    values, missing = {}, []
    for key, meta in kv.items():
        if key not in SYNC:
            continue
        parts = []
        for i in range(int(meta.get("n", 1))):
            c = chunks.get(f"{key}~{i}") or chunks.get(f"{key}@{i}")  # out_dir spells "~" as "@"
            if c is None:
                missing.append(f"{key}~{i}")
                break
            parts.append(c.get("s", ""))
        else:
            val = "".join(parts)
            if meta.get("len") not in (None, len(val)):
                missing.append(f"{key} (length {len(val)} != {meta.get('len')})")
                continue
            values[key] = val
    if missing:
        sys.exit("incomplete export, nothing written: " + ", ".join(missing))
    if not values:
        sys.exit("no portal data found in " + src)

    linkedin = {k: v["url"] for k, v in docs(src, "linkedin").items() if isinstance(v.get("url"), str) and v["url"]}
    outreach = {k: v["entries"] for k, v in docs(src, "outreach").items() if isinstance(v.get("entries"), list)}
    added = {k: v for k, v in docs(src, "addedPeople").items() if v.get("name") and v.get("company")}

    payload = {
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "https://claude.ai/artifact/FEzobZ9xk13cSxy9tqibfq",
        "kv": values,
        "map": {"linkedin": linkedin, "outreach": outreach, "addedPeople": added},
    }
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(values)} portal keys ({', '.join(sorted(values))}), {len(linkedin)} LinkedIn links, "
          f"{len(outreach)} outreach logs, {len(added)} added people -> {dest} ({os.path.getsize(dest):,} bytes)")


if __name__ == "__main__":
    main()
