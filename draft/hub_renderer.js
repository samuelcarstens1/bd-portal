/* ---------------------------------------------------------------------
   Hub-and-spoke renderer ("night jobsite" draft).
   Hub = the focused circle (center, 230px). Its children are the branch circles
   (diagonals; up to 8 per page, split left/right). Each branch's children are the
   satellites (56px) in a straight column on the branch's outer side.
   Click a branch to make it the hub; click a satellite or the hub for its detail card.
   --------------------------------------------------------------------- */
const NODES = $("pwNodes"), LINES = $("pwLines");
let selected = null, pageOf = new Map(), lastHub = null, lastFocus = null;
const nm = d => (d.n.pastClient && d.role === "ring" ? "★ " : "") + d.n.name;
function initials(s) {
  const w = String(s).replace(/\(.*?\)/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/)
    .filter(x => x && !/^(inc|llc|lp|co|corp|the|of|and|company|group)$/i.test(x));
  return ((w[0] || "?")[0] + (w[1] ? w[1][0] : (w[0] || "").slice(1, 2))).toUpperCase();
}
const kidsOf = n => (n && n.group && n.children) ? n.children : [];
const truncate = (s, n) => (s = String(s || "")).length > n ? s.slice(0, n - 1).trim() + "…" : s;
const isClientNode = n => { const ce = n.companyKey ? COMPANIES.find(e => e.key === n.companyKey) : null; return (n.isCompanyRoot && ce && isClient(ce)) || !!n.pastClient; };

function hubOf() {
  if (!path.length || !path[path.length - 1]) path = [ROOT];
  const f = path[path.length - 1];
  if (kidsOf(f).length || path.length === 1) return f;
  return path[path.length - 2];   // a leaf is shown selected on its parent's map
}

function scene() {
  const W = stage.clientWidth, H = stage.clientHeight, phone = W < 720;
  const hub = hubOf(), all = kidsOf(hub);
  const per = phone ? 4 : 8, pages = Math.max(1, Math.ceil(all.length / per));
  let pg = Math.min(pageOf.get(hub.id) || 0, pages - 1);
  const kids = all.slice(pg * per, pg * per + per);
  const cx = W / 2, cy = phone ? 110 : H / 2;
  const hubR = phone ? 72 : Math.min(115, H * 0.16);
  const items = [{ n: hub, role: "hub", x: cx, y: cy, r: hubR }];
  if (phone) {
    // phone: hub on top, branches fanned in a half circle below it (straight lines never cross); no satellites
    const bR = 46, R = hubR + bR + 36, n = kids.length;
    kids.forEach((k, i) => {
      const th = (n === 1 ? 90 : 155 - i * (130 / (n - 1))) * Math.PI / 180;
      items.push({ n: k, role: "branch", x: cx + R * Math.cos(th), y: cy + R * Math.sin(th), r: bR, side: Math.cos(th) < 0 ? -1 : 1 });
    });
    return { items, cx, cy, hubR, pages, pg, phone, H: cy + R + bR + 70 };
  }
  const left = kids.filter((_, i) => i % 2 === 0), right = kids.filter((_, i) => i % 2 === 1);
  const avail = W / 2 - 14, maxSide = Math.max(left.length, right.length, 2);
  const slotAll = (H - 24) / maxSide;
  const bR = Math.max(48, Math.min(88, slotAll / 2.6, avail * 0.18));
  const gap = 50, sR = 28, nameHalf = 62, catW = 96;
  // branches as far out as the labels allow, never closer than the hub's edge
  const minBx = hubR + bR * 0.9 + 26;
  const bx = Math.max(minBx, Math.min(250, avail - (bR + gap + sR + nameHalf)));
  const colOff = bR + gap + sR;
  const plural = t => ({ Person: "People", City: "Cities", "GC / Owner": "GCs & owners", "Warm path": "Warm paths", "Our work": "Our work", "Sub list": "Lists" }[t] || (/y$/.test(t) ? t.slice(0, -1) + "ies" : /(ch|sh|s|x)$/.test(t) ? t + "es" : t + "s"));
  [[left, -1], [right, 1]].forEach(([list, side]) => {
    const n = list.length; if (!n) return;
    const slot = (H - 24) / Math.max(n, 2);
    list.forEach((k, i) => {
      const b = { n: k, role: "branch", x: cx + side * bx, y: 12 + slot * (i + 0.5), r: bR, side, slotTop: 12 + slot * i, slotH: slot };
      if (n === 1) {
        b.slotTop = 12; b.slotH = H - 24;
        b.y = kids.length === 1 ? cy : kids.length === 2 ? (side < 0 ? 12 + (H - 24) * 0.27 : 12 + (H - 24) * 0.73) : cy;
      }
      const need = Math.sqrt(Math.max(0, Math.pow(hubR + bR + 70, 2) - Math.pow(b.y - cy, 2)));
      if (need > bx) b.x = cx + side * need;
      items.push(b);
      const sk = kidsOf(k); if (!sk.length) return;
      const step = 2 * sR + 26, head = 34, fit = Math.max(1, Math.floor((b.slotH - 14 - head) / step));
      const show = sk.length > fit ? sk.slice(0, fit - 1) : sk.slice(0, fit);
      const more = sk.length - show.length;
      const colX = b.x + side * colOff;
      const cnt = show.length + (more > 0 ? 1 : 0);
      let y0 = b.y - (cnt - 1) * step / 2;
      y0 = Math.max(b.slotTop + sR + 4 + head, Math.min(y0, b.slotTop + b.slotH - (cnt - 1) * step - sR - 22));
      show.forEach((s2, j) => items.push({ n: s2, role: "sat", x: colX, y: y0 + j * step, r: sR, side, parent: k }));
      if (more > 0) items.push({ n: k, role: "more", x: colX, y: y0 + show.length * step, r: sR, side, parent: k, more });
      b.cat = { x: colX, y: y0 - sR - 30, top: y0 - sR - 4, text: plural((TYPES[sk[0].type] || TYPES.root).label) };
    });
  });
  return { items, cx, cy, hubR, pages, pg, phone, H };
}

function edgePoint(a, b, ra) { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: a.x + dx * ra / L, y: a.y + dy * ra / L }; }

function render() {
  if (!opened) opened = true;
  const S = scene(), { items } = S;
  const hubItem = items[0];
  const f = path[path.length - 1];
  if (hubItem.n.id !== lastHub || f !== lastFocus) selected = f;
  lastHub = hubItem.n.id; lastFocus = f;
  if (!selected) selected = hubItem.n;
  if (S.phone) NODES.parentElement.style.height = S.H + "px"; else NODES.parentElement.style.height = "";
  // lines
  let svgH = "";
  items.forEach(it => {
    if (it.role === "branch") {
      const a = edgePoint(hubItem, it, hubItem.r + 6), b = edgePoint(it, hubItem, it.r);
      svgH += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="ln main"/><circle cx="${b.x}" cy="${b.y}" r="5" class="ln-dot"/>`;
      if (it.cat) svgH += `<line x1="${it.cat.x}" y1="${it.cat.y + 9}" x2="${it.cat.x}" y2="${it.cat.top}" class="ln cat"/><circle cx="${it.cat.x}" cy="${it.cat.top}" r="3" class="ln-dot"/>`;
    } else if (it.role === "sat" || it.role === "more") {
      const p = items.find(x => x.role === "branch" && x.n === it.parent);
      if (p) { const a = edgePoint(p, it, p.r), b = edgePoint(it, p, it.r + 2); svgH += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="ln sub"/>`; }
    }
  });
  LINES.innerHTML = svgH;
  // nodes (HTML, so text wraps cleanly)
  const keep = new Set();
  items.forEach(it => {
    const key = it.role + ":" + it.n.id + (it.role === "more" ? ":more" : "");
    keep.add(key);
    let el = NODES.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!el) {
      el = document.createElement("button"); el.type = "button"; el.dataset.key = key;
      const p = lastPos.get(it.n.id) || { x: S.cx, y: S.cy };
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(.6)`; el.style.opacity = "0";
      el.addEventListener("click", () => onClick(el._d));
      el.addEventListener("dblclick", () => { const d = el._d; if (d.role === "sat" && (kidsOf(d.n).length || d.n.jump)) drill(d.n); });
      el.addEventListener("pointerenter", ev => showTip(ev, { n: el._d.n, role: el._d.role === "hub" ? "focus" : "ring" }));
      el.addEventListener("pointermove", moveTip);
      el.addEventListener("pointerleave", hideTip);
      NODES.appendChild(el);
    }
    el._d = it;
    const t = TYPES[it.n.type] || TYPES.root, client = isClientNode(it.n);
    el.className = `hn ${it.role}${selected === it.n && it.role !== "more" ? " sel" : ""}${client ? " client" : ""}`;
    el.style.setProperty("--d", (2 * it.r) + "px");
    el.style.setProperty("--tc", t.color);
    if (it.role === "hub") {
      el.setAttribute("aria-label", `${it.n.name}, ${t.label}. Show details`);
      el.innerHTML = `<span class="mono" aria-hidden="true">${esc(initials(it.n.name))}</span><span class="band"><b>${client ? "★ " : ""}${esc(it.n.name)}</b><i>${esc(it.n.badge || t.label)}</i></span>`;
    } else if (it.role === "branch") {
      const lines = [it.n.badge, it.n.tip].filter(Boolean).slice(0, 2);
      const opens = kidsOf(it.n).length || it.n.jump;
      el.setAttribute("aria-label", `${it.n.name}${opens ? " (open)" : " (details)"}`);
      el.innerHTML = `${it.n.group ? "" : `<span class="ty">${esc(t.label)}</span>`}<b>${client ? "★ " : ""}${esc(it.n.name)}</b>${lines.map(l => `<span class="dt">${esc(l)}</span>`).join("")}`;
    } else if (it.role === "more") {
      el.setAttribute("aria-label", `${it.more} more in ${it.n.name} (open)`);
      el.innerHTML = `<span class="ini">+${it.more}</span><span class="nm">more</span>`;
    } else {
      el.setAttribute("aria-label", `${it.n.name} (details)`);
      const st = it.n.type === "state" ? (STATES.find(x => x.name === it.n.name) || {}).id : "";
      el.innerHTML = `<span class="ini">${esc(it.n.order ? String(it.n.order) : st || initials(it.n.name))}</span><span class="nm">${esc(truncate((client ? "★ " : "") + it.n.name, 18))}</span>`;
    }
    requestAnimationFrame(() => { el.style.transform = `translate(${it.x}px,${it.y}px) translate(-50%,-50%)`; el.style.opacity = "1"; });
    lastPos.set(it.n.id, { x: it.x, y: it.y });
  });
  NODES.querySelectorAll(".hn").forEach(el => { if (!keep.has(el.dataset.key)) el.remove(); });
  // category labels
  NODES.querySelectorAll(".cat").forEach(e => e.remove());
  items.filter(i => i.cat).forEach(i => {
    const c = document.createElement("span"); c.className = "cat";
    c.style.left = i.cat.x + "px"; c.style.top = i.cat.y + "px"; c.textContent = i.cat.text;
    NODES.appendChild(c);
  });
  // pager + up chip
  const hub = hubItem.n, pg = $("pwPager");
  if (S.pages > 1) { pg.hidden = false; pg.innerHTML = `<button type="button" data-p="-1" ${S.pg ? "" : "disabled"} aria-label="Previous">‹</button><span>${S.pg * (S.phone ? 4 : 8) + 1}–${Math.min(kidsOf(hub).length, (S.pg + 1) * (S.phone ? 4 : 8))} of ${kidsOf(hub).length}</span><button type="button" data-p="1" ${S.pg < S.pages - 1 ? "" : "disabled"} aria-label="Next">›</button>`; }
  else pg.hidden = true;
  const up = $("pwUp"), hp = pathOf(hub);
  if (hp.length > 1) { up.hidden = false; up.textContent = "↑ " + hp[hp.length - 2].name; } else up.hidden = true;
  renderCrumbs();
  renderSources();
  $("pwBack").disabled = path.length === 1 && !HISTORY.length;
  if (selected && (selected.fields.length || selected.links.length || selected.person || selected.isCompanyRoot)) openPanel(selected); else if (selected) openPanel(selected);
  centerBtn();
}
function centerBtn() {
  const b = $("pwCenter"); if (!b) return;
  const hub = hubOf(), can = selected && selected !== hub && (kidsOf(selected).length || selected.jump);
  b.hidden = !can; if (can) b.textContent = selected.jump ? "Open on the map ›" : "Center on this ›";
}
function drill(n) {
  if (n.jump) { jumpFrom = { path: path.slice(), label: hubOf().name }; navigateTo(byId.get(n.jump)); return; }
  navigateTo(n);
}
function onClick(d) {
  hideTip();
  if (d.role === "hub") { selected = d.n; if (path[path.length - 1] !== d.n) { remember(); path = pathOf(d.n); } render(); return; }
  if (d.role === "branch" || d.role === "more") {
    if (kidsOf(d.n).length || d.n.jump) { drill(d.n); return; }
  }
  // satellites and leaf branches: show their card on this map
  selected = d.n; render();
}
$("pwPager").addEventListener("click", ev => { const b = ev.target.closest("[data-p]"); if (!b) return; const h = hubOf(); pageOf.set(h.id, (pageOf.get(h.id) || 0) + (+b.dataset.p)); render(); });
$("pwUp").addEventListener("click", () => { const hp = pathOf(hubOf()); if (hp.length > 1) navigateTo(hp[hp.length - 2]); });
$("pwCenter").addEventListener("click", () => { if (selected) drill(selected); });
