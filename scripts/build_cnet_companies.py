#!/usr/bin/env python3
"""Build Client Networks data for more companies from Apollo results + BusDev Map research.

Usage: python3 -I scripts/build_cnet_companies.py <matches.json> <search.json> <mapdump.json> <config.json> <out.js>
  matches.json  {apollo_id: enriched person}      (people_bulk_match results)
  search.json   {apollo_id: search person}        (mixed_people_api_search results, partly masked names)
  mapdump.json  [BusDev Map company entries]      (window.BDMAP.COMPANIES filtered to these keys)
  config.json   [{key, short, orgIds: [...], enriched: [apollo ids], asOf}]
Writes one JS file that adds every company to window.CNET_COMPANIES.
"""
import json, re, sys
from datetime import date

LEAD = re.compile(r"\b(chief|ceo|coo|cfo|cso|president|vice president|vp|svp|evp|director|managing|general manager|partner|owner|founder|chairman|head of|division manager|department manager|operations manager)\b", re.I)
PM = re.compile(r"project manager|estimat|engineer|precon|project director|project executive|purchasing|procurement", re.I)
FIELD = re.compile(r"super|foreman|field|production|supervisor|installation|site", re.I)
SKIP = re.compile(r"intern|warehouse|painter|finisher|carpenter|real estate|orchardist|common desk|associate$|^construction$|accounting|payroll|\bhr\b|human resources|talent|it manager|it director|system admin|developer|education|logistics|receivable|floor care|maintenance|technician|sheetrock|mechanical ceiling|construction assistant|^painting$|acoustical ceilings$|master carpenter", re.I)
TOP = [r"\bceo\b|chief executive", r"^president\b|\bpresident$|^president|division president", r"\bcoo\b|chief operating"]

METRO = [
    (r"houston|katy|\bspring\b|cypress|tomball|magnolia|waller|sugar land|the woodlands|pearland|humble|conroe|channelview|baytown", "Houston"),
    (r"dallas|coppell|fort worth|arlington|plano|irving|frisco|denton|grapevine|mckinney|springtown|keller|southlake|mesquite|richardson", "Dallas–Fort Worth"),
    (r"fort myers|cape coral|naples|bonita|estero", "Southwest Florida"),
    (r"san antonio|new braunfels", "San Antonio"), (r"austin|buda|round rock", "Austin"),
    (r"harlingen|mcallen|brownsville|edinburg|los fresnos|rgv|rio grande", "Rio Grande Valley"),
    (r"atlanta|marietta|alpharetta|kennesaw|norcross|savannah|augusta", "Georgia"),
    (r"nashville|gallatin|knoxville|memphis|chattanooga|franklin", "Tennessee"),
    (r"charlotte|concord|huntersville|matthews|steele creek", "Charlotte"),
    (r"raleigh|garner|durham|cary|high point|greensboro|winston|apex|wake forest", "Raleigh / Triad"),
    (r"greenville|spartanburg|charleston|columbia|hilton head|lexington county|myrtle", "South Carolina"),
    (r"new orleans|metairie|baton rouge|lafayette|kenner", "Louisiana"),
    (r"west palm|palm beach|boca|lake worth|jupiter|delray|boynton|loxahatchee|wellington|royal palm", "Palm Beach"),
    (r"fort lauderdale|lauderdale|pompano|miami|hollywood|davie|plantation|sunrise|coral|doral|hialeah|deerfield", "South Florida"),
    (r"tampa|palmetto|sarasota|st\.? pete|clearwater|bradenton", "Tampa Bay"),
    (r"orlando|kissimmee|sanford", "Central Florida"),
    (r"richmond|roanoke|virginia|beltsville|maryland", "Mid-Atlantic"),
]
METRO_STATE = {"Houston": "Texas", "Dallas–Fort Worth": "Texas", "San Antonio": "Texas", "Austin": "Texas", "Rio Grande Valley": "Texas",
               "Georgia": "Georgia", "Tennessee": "Tennessee", "Charlotte": "North Carolina", "Raleigh / Triad": "North Carolina", "South Carolina": "South Carolina",
               "Louisiana": "Louisiana", "Palm Beach": "Florida", "South Florida": "Florida", "Tampa Bay": "Florida", "Central Florida": "Florida", "Southwest Florida": "Florida"}
STATE_REGION = {"Texas": "Texas", "Florida": "Florida", "Georgia": "Georgia", "Tennessee": "Tennessee", "North Carolina": "North Carolina",
                "South Carolina": "South Carolina", "Louisiana": "Louisiana", "Alabama": "Alabama", "Mississippi": "Mississippi",
                "Virginia": "Mid-Atlantic", "Maryland": "Mid-Atlantic"}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def norm_name(s):
    s = re.sub(r"\(.*?\)", " ", s or "").lower()
    return [w for w in re.sub(r"[^a-z' -]", " ", s).split() if w not in ("jr", "sr", "ii", "iii")]


def same_person(a, b):
    A, B = norm_name(a), norm_name(b)
    if not A or not B:
        return False
    if A[0] == B[0] or (A[0][:3] == B[0][:3] and len(A[0]) > 2):
        la, lb = " ".join(A[1:]), " ".join(B[1:])
        return bool(la and lb and (la in lb or lb in la))
    # reversed first/last ("Dilorenzo Justin")
    return set(A) == set(B)


def region_for(city, state, title, hq_metro):
    t = f"{city or ''} {state or ''}".lower()
    for rx, name in METRO:
        if re.search(rx, t):
            if state and METRO_STATE.get(name) and METRO_STATE[name] != state:
                continue  # e.g. Dallas, GA is not Dallas-Fort Worth
            return name
    if state in STATE_REGION:
        return STATE_REGION[state]
    return "Office not confirmed"


def group_for(title):
    if LEAD.search(title or ""):
        return "leadership"
    if FIELD.search(title or ""):
        return "field"
    if PM.search(title or ""):
        return "pm"
    return "staff"


def yr(d):
    return (d or "")[:4]


def main():
    matches = json.load(open(sys.argv[1]))
    search = json.load(open(sys.argv[2]))
    mapd = {e["key"]: e for e in json.load(open(sys.argv[3]))}
    cfg = json.load(open(sys.argv[4]))
    out = {}
    for c in cfg:
        key, short = c["key"], c["short"]
        M = mapd[key]
        co = M["company"]
        names_co = {short.lower(), (co.get("name") or "").lower()}
        roster, rich, seen = [], {}, []

        def add(p):
            roster.append(p); seen.append(p["name"])

        # 1. enriched people
        for aid in c["enriched"]:
            if aid in (c.get("drop") or []):
                continue
            m = matches.get(aid)
            if not m:
                continue
            name = m.get("name") or ""
            # Apollo sometimes stores "Last First"; the map research has the real order
            mp = next((p for p in M["people"] if same_person(p["name"], name)), None)
            if mp and len(mp["name"]) >= len(name):
                name = mp["name"]
            hist = sorted(m.get("employment_history") or [], key=lambda h: h.get("start_date") or "", reverse=True)
            mine = [h for h in hist if h.get("organization_id") in c["orgIds"] or short.split()[0].lower() in (h.get("organization_name") or "").lower()]
            since = min((yr(h.get("start_date")) for h in mine if h.get("start_date")), default="")
            prior, career = [], []
            for h in hist:
                when = f"{yr(h.get('start_date'))}–{yr(h.get('end_date'))}" if h.get("end_date") else (f"{yr(h.get('start_date'))} – now" if h.get("start_date") else "now")
                career.append([when.replace("–", " – ") if "now" not in when else when, h.get("title") or "", h.get("organization_name") or ""])
                if h not in mine:
                    prior.append(f"{h.get('title') or ''} @ {h.get('organization_name') or ''} ({when})")
            city = ", ".join(x for x in [m.get("city"), {"Texas": "TX", "Florida": "FL", "Georgia": "GA", "Tennessee": "TN", "North Carolina": "NC", "South Carolina": "SC", "Louisiana": "LA", "Alabama": "AL", "Mississippi": "MS", "Virginia": "VA", "Maryland": "MD"}.get(m.get("state"), m.get("state"))] if x)
            title = m.get("title") or (mp or {}).get("title") or ""
            if mp and re.search(r"chief executive|\bceo\b|founder", mp.get("title") or "", re.I) and not re.search(r"chief executive|\bceo\b", title, re.I):
                title = mp["title"]
            p = {"id": slug(name), "name": name, "title": title, "city": city, "region": "", "group": group_for(title),
                 "li": m.get("linkedin_url") or "", "email": m.get("email") if m.get("email_status") == "verified" else "",
                 "since": since, "conf": "Confirmed (Apollo)", "prior": prior[:4],
                 "_state": m.get("state") or "", "_city": m.get("city") or ""}
            add(p)
            prev = [x for x in prior[:2]]
            note = (f"At {short} since {since}." if since else f"At {short}.") + (f" Before that: {prev[0].split(' (')[0]}." if prev else "")
            rich[p["id"]] = {"career": career[:7], "note": note, "insights": []}

        # 2. people from the BusDev Map research not already covered
        branches = {b["id"]: b for b in M.get("branches") or []}
        for mp in M["people"]:
            if any(same_person(mp["name"], s) for s in seen):
                continue
            b = branches.get(mp.get("branchId")) or {}
            bname = b.get("name") or ""
            p = {"id": slug(mp["name"]), "name": mp["name"], "title": mp.get("title") or "",
                 "city": "", "region": "", "group": group_for(mp.get("title")), "li": "", "email": "", "since": "",
                 "conf": "From BusDev Map research" + (f" ({mp['evidence']})" if mp.get("evidence") else ""), "prior": [],
                 "_city": bname, "_state": ""}
            m_li = re.search(r"https?://(?:www\.)?linkedin\.com/in/[^\s\"')]+", (mp.get("note") or "") + " " + (mp.get("link") or ""))
            if m_li:
                p["li"] = m_li.group(0)
            if mp.get("note"):
                rich[p["id"]] = {"career": [], "note": mp["note"][:240], "insights": []}
                rich[p["id"]]["career"] = [["Now", p["title"], short]]
            add(p)

        # 3. everyone else Apollo lists (names partly masked) in roles that buy or run labor
        for aid, sp in search.items():
            org = (sp.get("organization") or {}).get("name") or ""
            if org not in c["orgNames"] or aid in c["enriched"]:
                continue
            t = sp.get("title") or ""
            if SKIP.search(t) or not (LEAD.search(t) or PM.search(t) or FIELD.search(t) or re.search(r"manager|sales|business development|operations", t, re.I)):
                continue
            first = sp.get("first_name") or ""
            last = (sp.get("last_name_obfuscated") or "")[:1]
            if not first or first.lower() in names_co or first.lower() == short.split()[0].lower():
                continue
            nm = f"{first} {last}." if last else first
            if any(norm_name(s) and norm_name(s)[0] == first.lower() and (not last or (len(norm_name(s)) > 1 and norm_name(s)[-1][:1] == last.lower())) for s in seen):
                continue
            add({"id": f"{key}-a-{aid[-6:]}", "name": nm, "title": t, "city": "", "region": "", "group": group_for(t), "li": "", "email": "",
                 "since": "", "conf": "Apollo search · full name not unlocked", "prior": [], "_city": "", "_state": ""})

        # keep only people we can reach or verify: a verified email or a LinkedIn link
        roster[:] = [p for p in roster if (p.get("email") or "").strip() or (p.get("li") or "").strip()]
        # regions: geography when people sit in several metros, else by function
        top_rx = re.compile(r"\b(chief|ceo|coo|cfo|cso|chairman|founder|owner)\b|^president|^co-founder|executive vice president|^evp", re.I)
        for p in roster:
            p["region"] = "Corporate" if top_rx.search(p["title"]) else region_for(p["_city"], p["_state"], p["title"], None)
        geo = {p["region"] for p in roster if p["region"] not in ("Corporate", "Office not confirmed")}
        if len(geo) < 2:
            for p in roster:
                if p["region"] == "Corporate":
                    continue
                p["region"] = {"leadership": "Leadership", "pm": "Project Management & Estimating", "field": "Field Operations"}.get(p["group"], "Office & Support")
        for p in roster:
            p.pop("_city", None); p.pop("_state", None)
            o = (c.get("override") or {}).get(p["name"])
            if o:
                p.update({k: v for k, v in o.items() if k != "note"})
                if o.get("note"):
                    r = rich.setdefault(p["id"], {"career": [["Now", p["title"], short]], "note": "", "insights": []})
                    r["note"] = (r.get("note") + " " + o["note"]).strip()
        # unique ids
        ids = set()
        for p in roster:
            while p["id"] in ids:
                p["id"] += "-2"
            ids.add(p["id"])

        def pick(rxs):
            for rx in rxs:
                hit = next((p for p in roster if re.search(rx, p["title"], re.I) and not p["conf"].startswith("Apollo search")), None)
                if hit:
                    return hit["id"]
            return None
        top = pick([r"\bceo\b|chief executive", r"^president$|^president\b(?!.*division)", r"co-founder|founder|owner"])
        ops = pick([r"\bcoo\b|chief operating", r"^president$|^president\b", r"director of operations|vp.*operations|vice president.*operations", r"general manager"])
        top = c.get("top") or top
        ops = c.get("ops") or ops
        if ops == top and not c.get("ops"):
            ops = pick([r"\bcoo\b|chief operating", r"director of operations|vice president.*operations", r"general manager"]) or top
        order = ["Corporate"] + sorted({p["region"] for p in roster} - {"Corporate", "Office not confirmed"}) + ["Office not confirmed"]

        brs = [b for b in M.get("branches") or [] if b.get("group") == "territory"]
        projects = []
        for pr in (M.get("projects") or [])[:9]:
            gc = pr.get("gc") or ""
            projects.append([pr.get("name") or "", pr.get("metro") or "", ("GC: " + gc) if gc else (pr.get("scope") or "")[:60], str(pr.get("year") or "Completed")])
        signals = [[s.get("date") or s.get("when") or "Recent", s.get("name") or "", s.get("note") or ""] for s in (M.get("signals") or [])[:7]]
        trades = co.get("trades")
        company = {
            "name": co.get("name") or short, "dba": "", "hq": (co.get("hq") or "").split(" (")[0].split(". ")[0][:90],
            "founded": re.split(r"[;(]", str(co.get("founded") or ""))[0].strip()[:60],
            "employees": re.split(r"[;(]", str(co.get("size") or ""))[0].strip()[:70],
            "revenue": re.split(r"[;]", str(co.get("revenue") or ""))[0].strip()[:90],
            "owner": re.split(r"[;]", str(co.get("ownership") or ""))[0].strip()[:90],
            "phone": co.get("phone") or "", "web": co.get("website") or "", "li": "",
            "trades": ", ".join(trades) if isinstance(trades, list) else (trades or ""),
            "offices": "; ".join(b["name"] for b in brs)[:160],
            "projects": projects, "signals": signals}
        for nm, ins in (c.get("insights") or {}).items():
            pp = next((p for p in roster if p["name"] == nm), None)
            if pp:
                rich.setdefault(pp["id"], {"career": [["Now", pp["title"], short]], "note": "", "insights": []})["insights"] += ins
        n_en = sum(1 for p in roster if p["conf"].startswith("Confirmed"))
        n_map = sum(1 for p in roster if p["conf"].startswith("From BusDev"))
        n_part = sum(1 for p in roster if p["conf"].startswith("Apollo search"))
        out[key] = {"roster": roster, "rich": rich, "company": company, "short": short, "logo": "", "mono": c.get("mono") or "",
                    "top": top, "ops": ops, "hr": None,
                    "exec": list(dict.fromkeys(x for x in [top, ops] + [p["id"] for p in roster if p["region"] == "Corporate"] if x))[:5],
                    "mapTitle": f"{short} · Org Map", "mapTab": "Org Map",
                    "scope": f"{n_en} enriched in Apollo, {n_map} from the BusDev Map research, {n_part} with names only partly unlocked",
                    "regions": order, "asOf": c.get("asOf") or str(date.today())}
        print(f"{key:10s} {len(roster):3d} people ({n_en} enriched, {n_map} map, {n_part} partial) · regions: {', '.join(r for r in order if any(p['region']==r for p in roster))} · top={top} ops={ops}")
    js = "/* Client Networks: more companies (Apollo, Nov 4 2026, plus BusDev Map research). Built by scripts/build_cnet_companies.py */\n"
    js += "window.CNET_COMPANIES=Object.assign(window.CNET_COMPANIES||{}," + json.dumps(out, ensure_ascii=False) + ");\n"
    open(sys.argv[5], "w", encoding="utf-8").write(js)


if __name__ == "__main__":
    main()
