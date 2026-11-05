#!/usr/bin/env python3
"""5 PM roll-up: put the day's logged contacts into that day's Daily Report.

Usage: python3 -I scripts/daily_contacts.py <export dir> <YYYY-MM-DD> <out dir>

<export dir> is the portal database as ArtifactData writes it with out_dir:
  kv/<key>.json, kvc/<key>@<i>.json      portal keys (bdp-reports, bdp-cnet-logs) in chunks
  outreach/<id>.json                      BusDev Map outreach log ({person, title, companyName, entries[]})
Writes into <out dir>:
  writes.json      the ArtifactData batch entries to apply (kv meta + chunks), without if_version
  report.txt       the text block that went into "What happened"
Safe to run more than once a day: the auto block and auto counts are replaced, never added twice.
"""
import glob, json, os, sys, time, random, string
from datetime import datetime, timezone

CHUNK = 180000
HEAD = "Contacts logged today (added automatically at 5 PM)"
MEET = {"In-person meeting", "Lunch / coffee", "Site visit", "Golf / event", "In person"}
FEEL = {2: "very positive", 1: "positive", 0: "neutral", -1: "negative", -2: "very negative"}
DUR = {"u5": "under 5 min", "5-15": "5–15 min", "15-30": "15–30 min", "30-60": "30–60 min", "60p": "60+ min"}
CO_NAME = {"acousti": "Acousti", "circle": "The Circle Group"}


def load(p):
    d = json.load(open(p, encoding="utf-8"))
    return d.get("data", d) if isinstance(d, dict) and isinstance(d.get("data"), dict) else d


def docs(src, coll):
    return {os.path.splitext(os.path.basename(p))[0]: load(p) for p in sorted(glob.glob(os.path.join(src, coll, "*.json")))}


def read_key(src, key):
    kv = docs(src, "kv").get(key)
    if not kv:
        return None, 0
    chunks = docs(src, "kvc")
    parts = []
    for i in range(int(kv.get("n", 1))):
        c = chunks.get(f"{key}~{i}") or chunks.get(f"{key}@{i}")
        if c is None:
            sys.exit(f"missing chunk {key}~{i}; nothing written")
        parts.append(c.get("s", ""))
    val = "".join(parts)
    if kv.get("len") not in (None, len(val)):
        sys.exit(f"{key}: length {len(val)} != {kv.get('len')}; nothing written")
    return val, int(kv.get("n", 1))


def pretty_id(pid):
    return " ".join(w.capitalize() for w in pid.replace("p-", "").split("-"))


def main():
    src, day, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    rows = []  # (sort key, kind, person, who-line, detail)
    earlier = set()  # people with a logged contact before this day (so "new contacts" counts first-timers only)

    # Client Networks contact log
    raw, _ = read_key(src, "bdp-cnet-logs")
    for t in json.loads(raw) if raw else []:
        if (t.get("date") or "9") < day:
            earlier.add((t.get("name") or pretty_id(t.get("contact", "?"))).lower())
        if t.get("date") != day:
            continue
        co = t.get("companyName") or CO_NAME.get(t.get("company") or "acousti", t.get("company") or "")
        name = t.get("name") or pretty_id(t.get("contact", "?"))
        who = name + (f" ({t['title']}, {co})" if t.get("title") else f" ({co})")
        bits = [t.get("type", "Contact")]
        if t.get("duration"):
            bits.append(DUR.get(t["duration"], t["duration"]))
        if t.get("feel") is not None:
            bits.append("felt " + FEEL.get(int(t["feel"]), "neutral"))
        rows.append((t.get("created", 0), t.get("type", ""), name.lower(), who, " · ".join(bits), "Client Networks"))

    # BusDev Map outreach log
    for key, d in docs(src, "outreach").items():
        for e in d.get("entries") or []:
            if (e.get("at") or "9") < day:
                earlier.add((d.get("person") or pretty_id(key.split("__")[-1])).lower())
            if e.get("at") != day:
                continue
            co = d.get("companyName") or d.get("company") or key.split("__")[0]
            name = d.get("person") or pretty_id(key.split("__")[-1])
            who = name + (f" ({d['title']}, {co})" if d.get("title") else f" ({co})")
            bits = [e.get("channel", "Contact"), e.get("outcome", "")]
            if e.get("note"):
                bits.append(e["note"])
            if e.get("next"):
                bits.append("follow up " + e["next"])
            rows.append((0, e.get("channel", "") + "|" + e.get("outcome", ""), name.lower(), who, " · ".join(b for b in bits if b), "BusDev Map"))

    calls = sum(1 for r in rows if r[1].startswith("Call"))
    meetings = sum(1 for r in rows if r[1].split("|")[0] in MEET or r[1].endswith("|Meeting set"))
    proposals = sum(1 for r in rows if r[1].endswith("|Proposal sent"))
    people = len({r[2] for r in rows})
    new_people = len({r[2] for r in rows} - earlier)
    auto = {"calls": calls, "meetings": meetings, "contacts": new_people, "proposals": proposals}

    raw, old_n = read_key(src, "bdp-reports")
    rpt = json.loads(raw) if raw else {"days": {}, "weeks": {}}
    r = rpt.setdefault("days", {}).setdefault(day, {})
    happened = r.get("happened") or ""
    old_block = r.get("autoBlock") or ""
    if old_block and old_block in happened:
        happened = happened.replace(old_block, "").strip()
    block = ""
    if rows:
        lines = [f"- {who}: {detail}" for _, _, _, who, detail, _ in sorted(rows, key=lambda x: (x[5], x[0], x[3]))]
        block = (f"{HEAD}: {len(rows)} contact{'s' if len(rows) != 1 else ''} with {people} "
                 f"{'person' if people == 1 else 'people'}{f' ({new_people} new)' if new_people else ''} · {calls} call{'s' if calls != 1 else ''}"
                 f"{f' · {meetings} meeting' + ('s' if meetings != 1 else '') if meetings else ''}"
                 f"{f' · {proposals} proposal' + ('s' if proposals != 1 else '') if proposals else ''}\n" + "\n".join(lines))
    r["happened"] = (happened + ("\n\n" if happened and block else "") + block).strip()
    prev = r.get("auto") or {}
    for k, v in auto.items():
        manual = max(0, int(r.get(k) or 0) - int(prev.get(k) or 0))
        r[k] = manual + v
    r["autoBlock"] = block
    r["auto"] = dict(auto, at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    if rows and r.get("status") in (None, "", "none"):
        r["status"] = "draft"
        r["savedAt"] = day

    val = json.dumps(rpt, ensure_ascii=False, separators=(",", ":"))
    n = max(1, -(-len(val) // CHUNK))
    writes = [{"op": "set", "collection": "kvc", "doc_id": f"bdp-reports~{i}", "data": {"s": val[i * CHUNK:(i + 1) * CHUNK]}} for i in range(n)]
    rev = f"{int(time.time() * 1000)}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=6))}"
    writes.append({"op": "set", "collection": "kv", "doc_id": "bdp-reports",
                   "data": {"n": n, "rev": rev, "len": len(val), "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}})
    writes += [{"op": "delete", "collection": "kvc", "doc_id": f"bdp-reports~{i}"} for i in range(n, old_n)]
    json.dump(writes, open(os.path.join(out, "writes.json"), "w", encoding="utf-8"), ensure_ascii=False)
    open(os.path.join(out, "report.txt"), "w", encoding="utf-8").write(block or "No contacts logged today.")
    print(f"{day}: {len(rows)} contacts ({calls} calls, {meetings} meetings, {proposals} proposals, {people} people); "
          f"report {len(val):,} chars in {n} chunk(s){' (new key)' if not old_n else ''}")


if __name__ == "__main__":
    main()
