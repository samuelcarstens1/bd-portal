#!/usr/bin/env python3
"""Build the claude.ai artifact copy of the portal from the repo: same files, page without its own html/head/body skeleton."""
import os, re, shutil, sys
src = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
os.makedirs(os.path.join(out, "data"), exist_ok=True)
h = open(os.path.join(src, "index.html"), encoding="utf-8").read()
head = h[h.index("<head>") + 6:h.index("</head>")]
body = h[h.index("<body>") + 6:h.rindex("</body>")]
head = re.sub(r'<meta charset[^>]*>\s*', "", head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
head = re.sub(r'<style>img\{max-width:100%\}\[hidden\]\{display:none!important\}</style>\s*', "", head)
t = re.search(r"<title>.*?</title>", head, re.S).group(0)
head = t + "\n" + head.replace(t, "", 1).strip()
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(head + "\n" + body.strip() + "\n")
for f in ["sync.js", "i18n.js", "portal.js", "leads.js", "seed-opps.json", "data/leads.json", "data/market.json", "bdmap.js", "classify.js", "insights.js", "fu-overview.js", "rpt-auto.js"]:
    shutil.copy(os.path.join(src, f), os.path.join(out, f))
print("built", out)
