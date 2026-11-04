"""Build the night-jobsite draft of the BusDev Map: draft/out/index.html + bdmap-night.js.
Usage: python3 draft/build_draft.py <original map index.html>"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
src = open(sys.argv[1], encoding="utf-8").read()
css = max(re.findall(r"<style>(.*?)</style>", src, re.S), key=len)
js = max(re.findall(r"<script>(.*?)</script>", src, re.S), key=len)
def one(a, b, s):
    assert s.count(a) == 1, (a[:70], s.count(a)); return s.replace(a, b)
# swap the focus-and-drill renderer for the hub-and-spoke one
a = js.index("function scene() {"); b = js.index("let jumpFrom = null;")
js = js[:a] + open(os.path.join(HERE, "hub_renderer.js"), encoding="utf-8").read() + "\n" + js[b:]
js = one('if (tag === "input" || tag === "textarea") return;', 'if (tag === "input" || tag === "textarea" || tag === "select") return;', js)
js = one('"Meeting set", "Not interested"', '"Meeting set", "Proposal sent", "Not interested"', js)
# the old hover-wobble loop has nothing to animate now
js = js.replace('document.addEventListener("visibilitychange", () => { if (!document.hidden) kickWander(); });', "")
open(os.path.join(OUT, "bdmap-night.js"), "w", encoding="utf-8").write(js.strip() + "\n")
body = src[src.index('<div class="pw-map">'):]; body = body[:body.index("<script>")]
grab = lambda pat: re.search(pat, body, re.S).group(0)
toolbar = body[body.index('<div class="toolbar">'):body.index('<section class="fu" id="pwFU"')].strip()
fu = grab(r'<section class="fu" id="pwFU".*?</section>'); pr = grab(r'<section class="fu pr" id="pwPR".*?</section>')
panel = grab(r'<aside class="panel" id="pwPanel".*?</aside>')
panel = panel.replace('<div class="body" id="pwPBody"></div>', '<button type="button" class="btn primary nj-center" id="pwCenter" hidden>Center on this ›</button><div class="body" id="pwPBody"></div>')
foot = body[body.index('<div class="foot">'):body.index('<div class="tip"')].strip()
assert foot.endswith('</div>'); foot = foot[:-len('</div>')].strip()
page = f"""<meta charset="utf-8">
<title>BusDev Map — Night Jobsite</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&family=Roboto:wght@400;500;700&display=swap">
<style>{css}</style>
<style>{open(os.path.join(HERE, "night.css"), encoding="utf-8").read()}</style>
<div class="pw-map"><div class="nj">
  <aside class="nj-side" aria-label="Map tools and details">
    <div class="nj-title"><span class="eyebrow">IB Group Worldwide · BusDev Map <span class="nj-draft">DRAFT</span></span><h1>Who we know, and where</h1><p>Clients and targets · click a circle to open it, a person for their card</p></div>
    {toolbar}
    <nav class="crumbs" id="pwCrumbs" aria-label="Path"></nav>
    {fu}
    {pr}
    {panel}
    {foot}
  </aside>
  <div class="nj-stagewrap">
    <div class="nj-mtitle nj-title"><span class="eyebrow">BusDev Map <span class="nj-draft">DRAFT</span></span><h1>Who we know, and where</h1></div>
    <div class="main" id="pwMain">
      <div class="stage" id="pwStage">
        <svg id="pwSvg" aria-hidden="true"><g id="pwLines"></g></svg>
        <div id="pwNodes" role="group" aria-label="Network map of IB Group clients and targets"></div>
        <button type="button" id="pwUp" hidden></button>
        <div id="pwPager" hidden></div>
      </div>
    </div>
  </div>
</div>
<div class="tip" id="pwTip" hidden></div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="bdmap-night.js" charset="utf-8"></script>
"""
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
print("built", OUT, len(js))
