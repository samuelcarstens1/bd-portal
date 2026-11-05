function scene() {
  const w = stage.clientWidth, h = stage.clientHeight, phone = isPhone();
  const cx = w / 2, cy = h / 2 + (phone ? 6 : 0);
  const focus = path[path.length - 1], parent = path.length > 1 ? path[path.length - 2] : null;
  const items = [], sedges = [];
  const showRing = opened && focus.group && focus.children.length;
  if (!showRing) {
    items.push({ n: focus, role: "focus", x: cx, y: cy, r: Math.max(56, Math.min(phone ? 92 : 118, Math.min(w, h) / 2 - 60)), inside: true });
  }
  if (parent) items.push({ n: parent, role: "parent", x: phone ? 40 : 58, y: phone ? 40 : 52, r: phone ? 14 : 18 });
  if (!showRing) return { items, sedges, cx, cy, phone };

  const kids = focus.children, n = kids.length, s = Math.sin(Math.PI / Math.max(n, 2));
  const Dy = h / 2 - 14, Dx = w / 2 - 14;
  const SR = phone ? 15 : 21, GAP = phone ? 8 : 12, ROW = 2 * SR + 8;
  const fit = E => { const ry = (Dy - E + 8) / (1 + s); return { ry, br: Math.min(phone ? 52 : 84, ry * s - 8) }; };
  let mode = "sats", E = 2 * SR + GAP + ROW, f = fit(E);
  if (f.br < (phone ? 30 : 38) || n > 16) { mode = "inside"; E = 0; f = fit(0); }
  if (f.br < (phone ? 26 : 30) || n > 16) mode = "outside";

  if (mode === "outside") {
    // Many circles (e.g. ~45 companies): the original layout with labels beside or along each spoke.
    items.push({ n: focus, role: "focus", x: cx, y: cy, r: phone ? 34 : 46, inside: false });
    const margin = phone ? 78 : 170, dense = n > 12;
    const Rmax = Math.max(phone ? 80 : 110, Math.min(w / 2 - (dense ? (phone ? 110 : 210) : margin), h / 2 - (dense ? (phone ? 110 : 190) : margin)));
    const rr = dense ? Math.max(phone ? 5 : 7, Math.min(phone ? 9 : 12, (2 * Math.PI * Rmax) / n / 2.6))
                     : Math.max(phone ? 11 : 14, Math.min(phone ? 18 : 24, (2 * Math.PI * Rmax) / n / 3.2));
    kids.forEach((k, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      items.push({ n: k, role: "ring", x: cx + Rmax * Math.cos(a), y: cy + Rmax * Math.sin(a), r: rr, a, dense });
    });
    return { items, sedges, cx, cy, phone };
  }

  const ry = f.ry;
  const fr = Math.max(phone ? 40 : 60, Math.min(phone ? 74 : 118, ry * 0.42));
  const br = Math.max(26, Math.min(f.br, fr * 0.72, ry - fr - (phone ? 22 : 44)));
  const rx = Math.max(ry, Math.min(Dx - br - E, ry * 1.3));
  items.push({ n: focus, role: "focus", x: cx, y: cy, r: fr, inside: true });
  const half = Math.PI / Math.max(n, 2);
  kids.forEach((k, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const bx = cx + rx * Math.cos(a), by = cy + ry * Math.sin(a);
    items.push({ n: k, role: "ring", x: bx, y: by, r: br, a, inside: true });
    if (mode !== "sats" || !k.group || !k.children.length) return;
    // Satellites: this branch's own children, fanned outward in two staggered rows, kept inside the branch's wedge.
    const hubA = Math.atan2(by - cy, bx - cx);
    const d1 = br + GAP + SR, d2 = d1 + ROW * 0.87;
    const slots = [];
    [[d1, 0], [d2, 0.5]].forEach(([d, off]) => {
      const step = (2 * SR + 7) / d;
      for (let j = -12; j <= 12; j++) {
        const t = (j + off) * step;
        if (Math.abs(t) > 1.1) continue;
        const th = hubA + t, px = bx + d * Math.cos(th), py = by + d * Math.sin(th);
        if (px < SR + 2 || px > w - SR - 2 || py < SR + 2 || py > h - SR - 2) continue;
        const dist = Math.hypot(px - cx, py - cy);
        let da = Math.atan2(py - cy, px - cx) - hubA; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) + Math.asin(Math.min(1, (SR + 3) / dist)) > half - 0.005) continue;
        slots.push({ x: px, y: py, t, d });
      }
    });
    if (!slots.length) return;
    slots.sort((p, q) => Math.abs(p.t) - Math.abs(q.t) || p.d - q.d);
    const ch = k.children, take = slots.slice(0, Math.min(slots.length, ch.length)).sort((p, q) => p.t - q.t || p.d - q.d);
    const more = ch.length > take.length;
    const shown = more ? take.length - 1 : take.length;
    // the "+N" goes on the outermost-right slot so it reads last
    let moreSlot = -1; if (more) moreSlot = take.length - 1;
    let ci = 0;
    take.forEach((p, j) => {
      let sn;
      if (j === moreSlot) sn = { id: k.id + "__more", name: "+" + (ch.length - shown), type: k.type, group: false, children: [], fields: [], links: [], moreOf: k, tip: (ch.length - shown) + " more in " + k.name };
      else sn = ch[ci++];
      items.push({ n: sn, role: j === moreSlot ? "more" : "sat", x: p.x, y: p.y, r: SR, a: hubA, host: k });
      const L = Math.hypot(p.x - bx, p.y - by) || 1;
      sedges.push({ id: k.id + ">" + sn.id, x1: bx + (p.x - bx) * br / L, y1: by + (p.y - by) * br / L, x2: p.x - (p.x - bx) * SR / L, y2: p.y - (p.y - by) * SR / L });
    });
  });
  return { items, sedges, cx, cy, phone };
}

// Past clients get a star in front of their name wherever they show as a circle in a ring (city view).
const nm = d => (d.n.pastClient && d.role === "ring" ? "★ " : "") + d.n.name;
const ST_CODE = Object.fromEntries(STATES.map(s => [s.name, s.id]));
function hubIni(d) {
  if (d.role === "more") return d.n.name;
  if (d.n.type === "state" && ST_CODE[d.n.name]) return ST_CODE[d.n.name];
  const words = String(d.n.name).replace(/\(.*?\)/g, " ").replace(/[^A-Za-z0-9&' ]+/g, " ").trim().split(/\s+/)
    .filter(x => x && !/^(of|the|and|&|inc|llc|co)$/i.test(x));
  if (!words.length) return "•";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
function hubCount(n) { return n.order ? "#" + n.order : (n.group && n.children.length ? String(n.children.length) : ""); }

function render() {
  const { items, sedges, cx, cy, phone } = scene();
  const T = motion();
  const t = svg.transition().duration(T);
  const focusItem = items.find(i => i.role === "focus");

  // Edges (hub -> branch)
  const ringItems = items.filter(i => i.role === "ring");
  const edge = gEdges.selectAll("line.edge").data(ringItems, d => d.n.id);
  edge.enter().append("line").attr("class", "edge")
      .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).style("opacity", 0)
    .merge(edge).transition(t)
      .attr("x1", d => cx + (d.x - cx) * (focusItem.r / Math.hypot(d.x - cx, d.y - cy)))
      .attr("y1", d => cy + (d.y - cy) * (focusItem.r / Math.hypot(d.x - cx, d.y - cy)))
      .attr("x2", d => d.x - (d.x - cx) * (d.r / Math.hypot(d.x - cx, d.y - cy)))
      .attr("y2", d => d.y - (d.y - cy) * (d.r / Math.hypot(d.x - cx, d.y - cy)))
      .style("opacity", 1);
  edge.exit().transition(t).style("opacity", 0).remove();
  // Edges (branch -> satellite)
  const se = gEdges.selectAll("line.sedge").data(sedges, d => d.id);
  se.enter().append("line").attr("class", "sedge").style("opacity", 0)
      .attr("x1", d => d.x1).attr("y1", d => d.y1).attr("x2", d => d.x1).attr("y2", d => d.y1)
    .merge(se).transition(t)
      .attr("x1", d => d.x1).attr("y1", d => d.y1).attr("x2", d => d.x2).attr("y2", d => d.y2).style("opacity", 1);
  se.exit().transition(t).style("opacity", 0).remove();

  // Nodes
  const sel = gNodes.selectAll("g.node").data(items, d => d.n.id);
  const enter = sel.enter().append("g").attr("class", "node")
    .attr("tabindex", 0).attr("role", "button")
    .attr("transform", d => { const p = lastPos.get(d.n.id) || (d.host && lastPos.get(d.host.id)) || { x: cx, y: cy }; return `translate(${p.x},${p.y})`; })
    .style("opacity", 0)
    .on("click", (ev, d) => onClick(d))
    .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick(d); } })
    .on("pointerenter", (ev, d) => { showTip(ev, d); hoverId = d.n.id; kickWander(); })
    .on("pointermove", moveTip)
    .on("pointerleave", (ev, d) => { hideTip(); if (hoverId === d.n.id) hoverId = null; kickWander(); })
    .on("focus", (ev, d) => { hoverId = d.n.id; kickWander(); })
    .on("blur", () => { hoverId = null; kickWander(); });
  const wob = enter.append("g").attr("class", "wob");
  wob.append("circle").attr("class", "body").attr("r", 1e-6);
  wob.append("text").attr("class", "mark").attr("text-anchor", "middle").attr("dy", "0.35em");
  wob.append("text").attr("class", "label");
  wob.append("text").attr("class", "badge");
  wob.append("text").attr("class", "hint");
  enter.append("title");

  const merged = enter.merge(sel)
    .attr("class", d => `node ${d.role}${d.n.group ? " grp" : " leaf"} t-${d.n.type}${d.inside ? " inside" : ""}${d.role === "focus" && items.some(i => i.dense) ? " dense" : ""}`)
    .attr("aria-label", d => `${d.n.name}${d.role === "parent" ? " (go back)" : (d.role === "ring" || d.role === "sat" || d.role === "more") ? " (open)" : ""}`);
  merged.select("title").text(d => d.n.tip && d.role === "more" ? d.n.tip : d.n.name);
  merged.transition(t).attr("transform", d => `translate(${d.x},${d.y})`).style("opacity", 1);
  merged.select("circle.body").attr("fill", d => TYPES[d.n.type].color).transition(t).attr("r", d => d.r);

  merged.select("text.mark")
    .style("font-size", d => (d.role === "sat" || d.role === "more") ? Math.round(d.r * 0.62) + "px" : d.role === "focus" ? "16px" : "11px")
    .text(d => {
      if (d.role === "sat" || d.role === "more") return hubIni(d);
      if (d.inside) return "";
      return d.role === "parent" ? "↖" : (d.role === "ring" && d.n.jump) ? "↗" : d.n.order ? String(d.n.order) : (d.role === "ring" && d.n.group) ? "+" : "";
    });

  // Labels
  merged.each(function (d) {
    const g = d3.select(this);
    const label = g.select("text.label"), badge = g.select("text.badge"), hint = g.select("text.hint");
    label.selectAll("tspan").remove();
    label.attr("transform", null).style("font-size", null);
    badge.style("font-size", null); hint.style("font-size", null);
    if (d.role === "sat" || d.role === "more") { badge.text(""); hint.text(""); return; }
    if (d.inside) {
      // Name (and for branches an orange count) sit inside the circle.
      const fs = d.role === "focus" ? Math.max(14, Math.min(22, d.r * 0.19)) : Math.max(11, Math.min(18, d.r * 0.235));
      const chars = Math.max(6, Math.floor((d.r * 1.55) / (fs * 0.5)));
      const lines = wrap(nm(d), chars);
      const count = d.role === "ring" ? hubCount(d.n) + (d.n.jump ? " ↗" : "") : "";
      let sub = d.role === "focus" ? (d.n.badge || "") : "";
      const subFs = Math.max(10, Math.min(13, fs * 0.62));
      const subMax = Math.floor((d.r * 1.6) / (subFs * 0.52)); if (sub.length > subMax) sub = sub.slice(0, subMax - 1).trim() + "…";
      const hintText = d.role === "focus" && !opened ? "Click to open" : "";
      const lh = fs * 1.08, cfs = fs * 1.35;
      const block = lines.length * lh + (count ? cfs * 1.05 : 0) + (sub ? subFs * 1.5 : 0) + (hintText ? subFs * 1.5 : 0);
      let y = -block / 2 + fs * 0.8;
      label.attr("text-anchor", "middle").attr("x", 0).attr("y", y).style("font-size", fs + "px");
      lines.forEach((ln, i) => label.append("tspan").attr("x", 0).attr("dy", i ? lh : 0).text(ln));
      y += (lines.length - 1) * lh;
      if (count) { y += cfs * 1.05; label.append("tspan").attr("class", "count").attr("x", 0).attr("y", y).style("font-size", cfs + "px").text(count); }
      if (sub) y += subFs * 1.5;
      badge.attr("text-anchor", "middle").attr("x", 0).attr("y", y).style("font-size", subFs + "px").text(sub);
      if (hintText) y += subFs * 1.5;
      hint.attr("text-anchor", "middle").attr("x", 0).attr("y", y).style("font-size", subFs + "px").text(hintText);
      return;
    }
    let lines, anchor, x, y;
    if (d.role === "focus") {
      lines = wrap(nm(d), phone ? 22 : 28); anchor = "middle"; x = 0; y = d.r + (phone ? 20 : 26);
      if (items.some(i => i.dense)) { y = -(lines.length - 1) * 7 - 4; label.style("font-size", phone ? "13px" : "15px"); }
    } else if (d.role === "parent") {
      lines = wrap(nm(d), 20); anchor = "start"; x = d.r + 8; y = 0 - (lines.length - 1) * 7;
    } else if (d.dense) {
      const deg = d.a * 180 / Math.PI, flip = Math.cos(d.a) < 0;
      const name = nm(d).length > (phone ? 22 : 30) ? nm(d).slice(0, phone ? 21 : 29).trim() + "…" : nm(d);
      lines = [name]; anchor = flip ? "end" : "start"; x = (d.r + 6) * (flip ? -1 : 1); y = 0;
      label.attr("transform", `rotate(${flip ? deg + 180 : deg})`).style("font-size", phone ? "11px" : "12px");
      badge.text(""); hint.text("");
      label.attr("text-anchor", anchor).attr("x", x).attr("y", y);
      label.append("tspan").attr("x", x).attr("dy", "0.32em").text(name);
      return;
    } else {
      const c = Math.cos(d.a), s = Math.sin(d.a);
      const horiz = Math.abs(c) > 0.35;
      lines = wrap(nm(d), phone ? 16 : 20);
      if (horiz) { anchor = c > 0 ? "start" : "end"; x = (d.r + 8) * (c > 0 ? 1 : -1); y = 0 - (lines.length - 1) * 7 + (s * 6); }
      else { anchor = "middle"; x = 0; y = s < 0 ? -(d.r + 8 + (lines.length - 1) * 14) : d.r + 16; }
    }
    label.attr("text-anchor", anchor).attr("x", x).attr("y", y);
    lines.forEach((ln, i) => label.append("tspan").attr("x", x).attr("dy", i ? 14 : 0).text(ln));
    let badgeText = d.n.badge && (d.role !== "parent") && !(d.role === "focus" && items.some(i => i.dense)) ? d.n.badge : "";
    const bMax = d.role === "ring" ? (phone ? 24 : 28) : 70; if (badgeText.length > bMax) badgeText = badgeText.slice(0, bMax - 1).trim() + "…";
    badge.attr("text-anchor", anchor).attr("x", x).attr("y", y + lines.length * 14 + (d.role === "focus" ? 2 : 0)).text(badgeText);
    hint.attr("text-anchor", "middle").attr("x", 0).attr("y", y + lines.length * 14 + (badgeText ? 18 : 2)).text(d.role === "focus" && !opened ? "Click to open" : "");
  });

  sel.exit().transition(t)
    .attr("transform", d => { const p = (d.host && lastPos.get(d.host.id)) || (d.role === "ring" ? { x: cx, y: cy } : { x: d.x, y: d.y }); return `translate(${p.x},${p.y})`; })
    .style("opacity", 0).remove();

  items.forEach(i => lastPos.set(i.n.id, { x: i.x, y: i.y }));
  sceneNow = { items, cx, cy, focusR: focusItem.r }; renderedAt = performance.now(); kickWander();
  renderCrumbs();
  renderSources();
  $("pwBack").disabled = path.length === 1 && !opened && !HISTORY.length;
  const f = path[path.length - 1];
  if (opened && (f.fields.length || f.links.length)) openPanel(f); else closePanel();
}

function onClick(d) {
  hideTip();
  if (d.role === "parent") { goUp(); return; }
  if (d.role === "focus") {
    if (!opened) { opened = true; render(); }
    return;
  }
  if (d.role === "more") { navigateTo(d.n.moreOf); return; }
  if (d.n.jump) { jumpFrom = { path: path.slice(), label: path[path.length - 1].name }; navigateTo(byId.get(d.n.jump)); return; }
  navigateTo(d.n);
}
