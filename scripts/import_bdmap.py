"""Import the Business Development Map artifact (single index.html) into the portal.
Usage: python3 scripts/import_bdmap.py <map index.html>
Writes bdmap.js and bdmap.css; index.html inlines bdmap.css between BDMAP CSS markers."""
import re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(sys.argv[1], encoding="utf-8").read()

styles = re.findall(r"<style>(.*?)</style>", src, re.S)
css = max(styles, key=len)
scripts = [m for m in re.finditer(r"<script>(.*?)</script>", src, re.S)]
js = max((m.group(1) for m in scripts), key=len)

# ---------- JS ----------
def sub1(old, new, s):
    assert s.count(old) == 1, ("expected once", old[:60], s.count(old))
    return s.replace(old, new)
# Esc/Backspace only steers the map while the Lead Gen tab is on screen
js = sub1('if (tag === "input" || tag === "textarea") return;',
          'if (tag === "input" || tag === "textarea" || tag === "select") return;\n  if (!stage.offsetParent) return;', js)
# proposals are tracked too (they feed the daily report)
js = sub1('"Meeting set", "Not interested"', '"Meeting set", "Proposal sent", "Not interested"', js)
# the portal's stage is narrower than the standalone map's, so keep side labels inside it
js = sub1('const margin = phone ? 78 : 118;', 'const margin = phone ? 78 : 170;', js)
# long one-line notes under ring circles get cut at the stage edge; shorten them (the tooltip keeps the full text)
js = sub1('const badgeText = d.n.badge && (d.role !== "parent") && !(d.role === "focus" && items.some(i => i.dense)) ? d.n.badge : "";',
          'let badgeText = d.n.badge && (d.role !== "parent") && !(d.role === "focus" && items.some(i => i.dense)) ? d.n.badge : "";\n    const bMax = d.role === "ring" ? (phone ? 24 : 28) : 70; if (badgeText.length > bMax) badgeText = badgeText.slice(0, bMax - 1).trim() + "…";', js)
# tag each circle with its type so the portal's night-jobsite styling can color it
js = sub1('.attr("class", d => `node ${d.role}${d.n.group ? " grp" : " leaf"}${d.role === "focus" && items.some(i => i.dense) ? " dense" : ""}`)',
          '.attr("class", d => `node ${d.role}${d.n.group ? " grp" : " leaf"} t-${d.n.type}${d.role === "focus" && items.some(i => i.dense) ? " dense" : ""}`)', js)
# let the rest of the portal (contacts, company researcher, heat map) read the map's data and live edits
js = sub1('function liRefresh() {\n  liBadges();', 'function liRefresh() {\n  liBadges();\n  try { window.dispatchEvent(new Event("bdmap:change")); } catch (e) {}', js)
js = js.rstrip()
assert js.endswith("})();"), js[-40:]
js = js[:-5] + """
window.BDMAP = { COMPANIES, CATEGORIES, STATES, BRANCH_METRO, OUR_WORK, DC_DATA, isClient, LI, OUT, ADDED, PERSONAL, lastTouch,
  key: (companyKey, personId) => companyKey + "__" + personId,
  openCompany: k => { const i = (INSTANCES[k] || [])[0]; if (i) { navigateTo(i.node); openPanel(i.node); } } };
try { window.dispatchEvent(new Event("bdmap:ready")); } catch (e) {}
})();"""
open(os.path.join(ROOT, "bdmap.js"), "w", encoding="utf-8").write("/* Business Development Map — imported from the claude.ai map by scripts/import_bdmap.py. */\n" + js.strip() + "\n")

# ---------- CSS ----------
# drop the map's own :root token blocks and body rule; tokens are re-pointed at the portal's below
css = re.sub(r"/\*.*?\*/\s*", "", css, count=1, flags=re.S)
start = css.index(":root {"); end = css.index("body {")
css = css[:start] + css[end:]
css = re.sub(r"body \{[^}]*\}\s*", "", css, count=1)
tokens = """
.pw-map{
  --pw-bg:var(--bg); --pw-surface:var(--card); --pw-surface-2:var(--line-soft); --pw-fg:var(--fg); --pw-fg-muted:var(--muted);
  --pw-line:var(--line); --pw-accent:var(--accent); --pw-accent-soft:var(--accent-wash); --pw-edge:var(--mute-soft);
  --pw-shadow:0 10px 30px rgba(22,35,58,.14);
  --pw-c-company:#16233A; --pw-c-branch:#5C7496; --pw-c-person:#C44A08; --pw-c-gc:#1E6B3A; --pw-c-project:#6B4FA8;
  --pw-c-signal:#B23A48; --pw-c-warm:#B92D6C; --pw-c-comp:#8A5A2B; --pw-c-ours:#0B7A94; --pw-client:#9A6400; --pw-client-soft:#FBF0D9;
  --pw-font-display:var(--sans); --pw-font-body:var(--sans);
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .pw-map{
  --pw-shadow:0 10px 30px rgba(0,0,0,.5);
  --pw-c-company:#8FA3C4; --pw-c-branch:#7FA0CC; --pw-c-person:#F07A33; --pw-c-gc:#5BC98A; --pw-c-project:#A68BE6;
  --pw-c-signal:#F0707E; --pw-c-warm:#EC5F9C; --pw-c-comp:#D39A5F; --pw-c-ours:#4CC9E0; --pw-client:#D9A93A; --pw-client-soft:#2E2512 } }
:root[data-theme="dark"] .pw-map{
  --pw-shadow:0 10px 30px rgba(0,0,0,.5);
  --pw-c-company:#8FA3C4; --pw-c-branch:#7FA0CC; --pw-c-person:#F07A33; --pw-c-gc:#5BC98A; --pw-c-project:#A68BE6;
  --pw-c-signal:#F0707E; --pw-c-warm:#EC5F9C; --pw-c-comp:#D39A5F; --pw-c-ours:#4CC9E0; --pw-client:#D9A93A; --pw-client-soft:#2E2512 }
"""
fit = """
/* Fit inside the portal: neutralise portal rules that share class names, match its buttons and cards. */
.pw-map{background:transparent;padding:0;font-size:14px;overflow-x:visible}
.pw-map .app{max-width:none}
.pw-map .main{flex:none;padding:0}
.pw-map .stage{display:block;gap:0;border-radius:10px}
.pw-map .label,.pw-map .n{text-transform:none;letter-spacing:normal}
.pw-map .empty{border:0;padding:6px 8px;text-align:left}
.pw-map .tag{background:none}
.pw-map .toolbar,.pw-map .crumbs,.pw-map .foot details{border-radius:10px;padding:10px 12px}
.pw-map .panel,.pw-map .fu{border-radius:10px}
.pw-map .btn{min-height:40px;padding:0 16px;border-radius:6px;font-weight:600;font-size:14px;background:var(--card);border-color:var(--line);color:var(--fg)}
.pw-map .btn:hover{background:var(--line-soft)}
.pw-map .btn.primary,.pw-map .panel .li-row .btn.primary,.pw-map .panel .out-form .btn.primary,.pw-map .panel .em-btns .btn.primary{background:var(--navy);border-color:var(--navy);color:#fff;min-height:36px}
.pw-map .btn.fu-btn{border-color:var(--accent);color:var(--accent)}
.pw-map .btn.fu-btn[aria-expanded="true"],.pw-map .btn.pr-btn[aria-expanded="true"]{background:var(--accent-wash)}
.pw-map .fu{border-color:var(--line)}
.pw-map .search input{min-height:40px;border-radius:6px;background:var(--card)}
.pw-map .panel header h2,.pw-map .fu header h2{font-weight:700;letter-spacing:-.01em}
.pw-map .panel .li h3,.pw-map .panel .email h3,.pw-map .panel .out h3,.pw-map .fu h3{font:600 12px var(--sans);letter-spacing:.1em}
.pw-map .node.focus text.label{font-size:18px;letter-spacing:-.01em}
.pw-map .tip b{font-weight:700}
.pw-map .node:focus:not(:focus-visible){outline:none}
"""
css = tokens + css.strip() + "\n" + fit
open(os.path.join(ROOT, "bdmap.css"), "w", encoding="utf-8").write(css)

# ---------- markup (inner .pw-map, without the map's own title block) ----------
body = src[src.index('<div class="pw-map">'):]
body = body[:body.index("<script>")].strip()
body = re.sub(r'\s*<div class="head">.*?</div>\n', "\n", body, count=1, flags=re.S)
open(os.path.join(ROOT, "bdmap.html"), "w", encoding="utf-8").write(body + "\n")
print("bdmap.js", len(js), "bdmap.css", len(css), "bdmap.html", len(body))
