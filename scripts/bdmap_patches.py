"""Portal-side changes to the Business Development Map code. Each patch is applied once (safe to re-run).
Used by import_bdmap.py, and directly on an existing bdmap.js:  python3 scripts/bdmap_patches.py bdmap.js"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))


def _once(js, marker, old, new):
    if marker in js:
        return js
    assert js.count(old) == 1, ("patch anchor not found exactly once", old[:70], js.count(old))
    return js.replace(old, new)


def apply(js):
    # 1. hub-and-spoke renderer (Client Networks look)
    a = js.index("function scene() {"); b = js.index("let jumpFrom = null;")
    js = js[:a] + open(os.path.join(HERE, "bdmap_hub.js"), encoding="utf-8").read() + js[b:]
    js = _once(js, 'd.role === "more" ? "click to see all"',
               'd.role === "ring" ? (d.n.group && d.n.children.length ? "click to open" : "click for details")',
               '(d.role === "ring" || d.role === "sat") ? (d.n.group && d.n.children.length ? "click to open" : "click for details") : d.role === "more" ? "click to see all"')

    # 2. company-first drill order: Category -> Company -> State -> City (the city opens that company's office there)
    js = _once(js, "arguments[2] || scope",
               'const K = scope + ":" + DATA.key + ":";',
               'const K = (arguments[2] || scope) + ":" + DATA.key + ":";')
    js = _once(js, "buildCompanyFirst(catNode",
               """        if (isClient(entry)) { co.badge = "IB Group client · " + co.badge; co.pastClient = true; }
      });
    }
  });
""",
               """        if (isClient(entry)) { co.badge = "IB Group client · " + co.badge; co.pastClient = true; }
      });
    }
    buildCompanyFirst(catNode, cat, catName, inCat);
  });
""")
    js = _once(js, "function buildCompanyFirst(", "function buildCompany(DATA, scope) {", COMPANY_FIRST + "\nfunction buildCompany(DATA, scope) {")
    js = _once(js, "function applyOrder(", "const ROOT = buildTree();\n", "const ROOT = buildTree();\n" + ORDER_JS)
    # people you added by hand also show up in the company-first copies
    js = _once(js, 'rawScope = root.id.split(":")[0]',
               'const scope = root.id.split(":")[0], K = scope + ":" + ck + ":";',
               'const rawScope = root.id.split(":")[0], scope = rawScope.replace(/~cf$/, ""), K = rawScope + ":" + ck + ":";')
    js = _once(js, "!root.cf && !INDEX.some(",
               "if (!INDEX.some(i => i.n.injected && i.n.person.docId === p.id)",
               "if (!root.cf && !INDEX.some(i => i.n.injected && i.n.person.docId === p.id)")
    # search lists each place once (the state-first copy)
    js = _once(js, "if (n.cf) return;\n  const hay",
               "byId.forEach(n => {\n  const hay = [n.name, n.tip,",
               "byId.forEach(n => {\n  if (n.cf) return;\n  const hay = [n.name, n.tip,")
    # the panel names the company, not just the city, for company-first copies
    js = _once(js, "esc(n.panelName || n.name)",
               '''$("pwPTitle").innerHTML = (clientHere ? '<span class="star" aria-label="IB Group client">★</span>' : "") + esc(n.name);''',
               '''$("pwPTitle").innerHTML = (clientHere ? '<span class="star" aria-label="IB Group client">★</span>' : "") + esc(n.panelName || n.name);''')

    # 3. Monday follow-ups live on the Overview page now: expose the list and a way to open a person
    js = _once(js, "followups:", "  key: (companyKey, personId) => companyKey + \"__\" + personId,",
               """  key: (companyKey, personId) => companyKey + "__" + personId,
  followups: () => fuRows().map(r => ({ key: r.key, bucket: r.bucket, person: r.person, title: r.title, company: r.company, client: r.client,
    lastTalk: r.lastTalk, lastAny: r.lastAny, next: r.next, onMap: !!r.n, linkedin: r.n ? liUrl(r.n) : (LI[r.key] || "") })),
  FU_BUCKETS, monday: mondayISO, fuText,
  openPerson: k => { const n = personNodeFor(k); if (n) { navigateTo(n); openPanel(n); return true; } return false; },""")
    # Client Networks hook (added by the portal): works for every company that has a network, not only Acousti
    if 'n.companyKey === "acousti" && (n.isCompanyRoot' in js:
        js = js.replace('window.CNET && n.companyKey === "acousti" && (n.isCompanyRoot || (n.person && window.CNET.hasPerson(n.name)))',
                        'window.CNET && (window.CNET.hasCompany ? window.CNET.hasCompany(n.companyKey) : n.companyKey === "acousti") && (n.isCompanyRoot || (n.person && window.CNET.hasPerson(n.name, n.companyKey)))')
        js = js.replace('"Open Acousti relationship network →"', '"Open " + ((COMPANIES.find(e => e.key === n.companyKey) || { company: { name: "the" } }).company.name) + " relationship network →"')
        js = js.replace('window.CNET.open("acousti", b.dataset.cnet || null)', 'window.CNET.open(n.companyKey, b.dataset.cnet || null)')
    return js


COMPANY_FIRST = r"""/* Company-first copy of a category: Company -> State -> City. Each city opens that company's office there
   (its own copy of the company card, so the path bar reads Company > State > City). Logs and LinkedIn links
   are keyed by company + person, so both orders show the same history. */
function buildCompanyFirst(catNode, cat, catName, inCat) {
  const markCf = n => { n.cf = true; n.children.forEach(markCf); };
  const sorted = inCat.slice().sort((a, b) => (isClient(b) - isClient(a)) || a.company.name.localeCompare(b.company.name));
  const kids = [];
  sorted.forEach(entry => {
    const locs = [];
    STATES.forEach(st => st.metros.forEach(([mid, mname]) => {
      const br = entry.branches.filter(b => (BRANCH_METRO[b.id] || []).includes(mid) && (b.group === "territory" || (ADDED_METROS.has(mid) && b.address && !/job site|service area|crew/i.test(b.name))));
      if (br.length) locs.push({ st, mid, mname, br });
    }));
    const client = isClient(entry), states = [...new Set(locs.map(l => l.st.id))];
    const coN = node("cf-" + cat + "-" + entry.key, entry.company.name, "company", { group: true, cf: true, pastClient: client,
      tip: catName + (locs.length ? " · " + states.join(", ") : " · outside our markets"),
      badge: (client ? "IB Group client · " : "") + (locs.length ? plural(states.length, "state", "states") + " · " + plural(locs.length, "city", "cities") : "Outside our markets") });
    coN.parent = catNode; kids.push(coN);
    const inst = (mid, label, br, offTip) => {
      const co = buildCompany(entry, mid, mid + "~cf");
      markCf(co);
      co.panelName = entry.company.name + " — " + label; co.name = label;
      if (br) { co.tip = "Here: " + br.map(b => b.name).join("; "); co.fields.unshift({ label: "Office in " + label, value: br.map(b => [b.name, b.address].filter(Boolean).join(" — ")) }); }
      else co.tip = offTip;
      if (client) { co.badge = "IB Group client · " + co.badge; co.pastClient = true; }
      return co;
    };
    if (!locs.length) {
      const stN = add(coN, node("cf-st-" + cat + "-" + entry.key + "-out", "Outside our markets", "state", { group: true, cf: true, tip: "No office in a city on this map", badge: "Other locations" }));
      const offs = entry.branches.filter(b => b.address || b.group === "other");
      add(stN, inst("out", "Other locations", null, offs.length ? "Offices: " + offs.map(b => b.name).join("; ") : "Offices outside our markets"));
      return;
    }
    STATES.forEach(st => {
      const mine = locs.filter(l => l.st === st); if (!mine.length) return;
      const stN = add(coN, node("cf-st-" + cat + "-" + entry.key + "-" + st.id, st.name, "state", { group: true, cf: true,
        tip: entry.company.name + " in " + st.name, badge: plural(mine.length, "city", "cities") }));
      mine.forEach(l => add(stN, inst(l.mid, l.mname, l.br)));
    });
  });
  catNode.kidsByState = catNode.children; catNode.kidsByCompany = kids;
}
"""

ORDER_JS = r"""/* Drill order switch: States first (Category > State > City > Company) or Companies first (Category > Company > State > City). */
let ORDER = "state";
try { ORDER = localStorage.getItem("pwOrder") === "company" ? "company" : "state"; } catch (e) {}
function applyOrder() { byId.forEach(n => { if (n.kidsByState) n.children = ORDER === "company" ? n.kidsByCompany : n.kidsByState; }); }
applyOrder();
function syncOrderUI() {
  const sw = document.getElementById("pwOrder"); if (!sw) return;
  sw.setAttribute("aria-checked", String(ORDER === "company"));
  sw.querySelectorAll("[data-o]").forEach(s => s.classList.toggle("on", s.dataset.o === ORDER));
  const h = document.getElementById("pwOrderHint"); if (h) h.textContent = ORDER === "company" ? "Company › State › City" : "State › City › Company";
}
function setOrder(o) {
  if (o === ORDER) return;
  ORDER = o; try { localStorage.setItem("pwOrder", o); } catch (e) {}
  applyOrder();
  // if you are inside a category, go back to it so the next circles follow the new order
  const i = path.findIndex(n => n.kidsByState);
  if (i >= 0 && path.length > i + 1) { remember(); path = path.slice(0, i + 1); opened = true; }
  syncOrderUI(); render();
}
(function orderSwitch() {
  const main = document.getElementById("pwMain"); if (!main || document.getElementById("pwOrder")) return;
  const row = document.createElement("div"); row.className = "order-row";
  row.innerHTML = '<span class="order-lbl" id="pwOrderLbl">Show first</span>' +
    '<button type="button" class="order-sw" id="pwOrder" role="switch" aria-labelledby="pwOrderLbl" aria-checked="false">' +
    '<span class="knob" aria-hidden="true"></span><span class="opt" data-o="state">States</span><span class="opt" data-o="company">Companies</span></button>' +
    '<span class="order-hint" id="pwOrderHint"></span>';
  main.parentNode.insertBefore(row, main);
  row.querySelector("#pwOrder").addEventListener("click", () => setOrder(ORDER === "company" ? "state" : "company"));
  syncOrderUI();
})();
"""

if __name__ == "__main__":
    p = sys.argv[1]
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(apply(s))
    print("patched", p)
