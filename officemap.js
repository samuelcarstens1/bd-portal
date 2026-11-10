/* Office Map: every office address in the company research as a pin on a map of the Southeast.
   Hover shows the company name; click opens that company's Client Networks profile
   when it has no Client Networks profile yet. Data: officemap-data.js (window.OFFICEMAP_DATA). */
(function(){
  'use strict';
  const DATA = window.OFFICEMAP_DATA; if (!DATA || !window.d3) return;
  const root = document.getElementById('omap'); if (!root) return;
  const d3 = window.d3;
  const CAT = { div9: 'Drywall / framing / ACT', gc: 'General contractors', restoration: 'Restoration', specialty: 'Specialty trades' };
  const S = { who: 'all', cats: new Set(Object.keys(CAT)), built: false, k: 1 };
  const hasCN = (k) => !!(window.CNET && window.CNET.hasCompany && window.CNET.hasCompany(k));
  // IB Group client = the gold star in Client Networks (falls back to the research flag baked into the pin data)
  const isCl = (p) => hasCN(p.k) && window.CNET.isClient ? window.CNET.isClient(p.k) : !!p.c;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIN = 'M0,0 C-2.2,-5.2 -7,-8.6 -7,-14 A7,7 0 1,1 7,-14 C7,-8.6 2.2,-5.2 0,0 Z';

  root.innerHTML =
    '<div class="om-bar">' +
      '<div class="om-chips" role="group" aria-label="Show companies">' +
        [['all', 'All'], ['prospect', 'Prospects'], ['client', 'IB Group clients']].map(([v, l]) => '<button type="button" class="om-chip" data-who="' + v + '" aria-pressed="false">' + l + '</button>').join('') +
      '</div>' +
      '<div class="om-chips" role="group" aria-label="Company type">' +
        Object.entries(CAT).map(([v, l]) => '<button type="button" class="om-chip" data-cat="' + v + '" aria-pressed="true">' + l + '</button>').join('') +
      '</div>' +
      '<span class="om-count" id="omCount" aria-live="polite"></span>' +
    '</div>' +
    '<div class="om-stage" id="omStage">' +
      '<svg id="omSvg" role="img" aria-label="Map of the Southeast with a pin for every office we have researched"></svg>' +
      '<div class="om-zoom"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Reset map">⟲</button></div>' +
      '<div class="om-legend">' +
        '<span><svg width="14" height="18" viewBox="-8 -22 16 23" aria-hidden="true"><path d="' + PIN + '" class="om-p-prospect"/></svg>Prospect</span>' +
        '<span><svg width="14" height="18" viewBox="-8 -22 16 23" aria-hidden="true"><path d="' + PIN + '" class="om-p-client"/></svg>IB Group client</span>' +
        '<span><svg width="14" height="18" viewBox="-8 -22 16 23" aria-hidden="true"><path d="' + PIN + '" class="om-p-prospect"/><circle cy="-14" r="2.8" fill="#fff"/></svg>Opens Client Networks</span>' +
        '<span class="om-dim">Scroll or pinch to zoom</span>' +
      '</div>' +
      '<div class="om-tip" id="omTip" role="tooltip" hidden></div>' +
    '</div>' +
    '<p class="om-note">Pins are placed by each office\'s ZIP code (within a mile or two of the building); ' + DATA.pins.filter((p) => p.g === 'city').length + ' offices with only a city listed sit at the city center. Offices without an address in our research are not shown.</p>';

  const stage = document.getElementById('omStage'), svg = d3.select('#omSvg'), tip = document.getElementById('omTip');
  let proj, path, zoom, gMap, gPins, W = 0, H = 0;

  function visible(p){
    if (S.who === 'client' && !isCl(p)) return false;
    if (S.who === 'prospect' && isCl(p)) return false;
    return S.cats.has(CAT[p.cat] ? p.cat : 'specialty');
  }
  function syncUI(){
    root.querySelectorAll('[data-who]').forEach((b) => { const on = b.dataset.who === S.who; b.classList.toggle('om-on', on); b.setAttribute('aria-pressed', String(on)); });
    root.querySelectorAll('[data-cat]').forEach((b) => { const on = S.cats.has(b.dataset.cat); b.classList.toggle('om-on', on); b.setAttribute('aria-pressed', String(on)); });
    const shown = DATA.pins.filter(visible);
    document.getElementById('omCount').textContent = shown.length + ' offices · ' + new Set(shown.map((p) => p.k)).size + ' companies';
    if (gPins) gPins.selectAll('g.om-pin').attr('display', (p) => visible(p) ? null : 'none');
  }

  function build(){
    const r = stage.getBoundingClientRect(); W = Math.max(320, r.width); H = Math.max(360, Math.round(W * 0.58));
    svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H).selectAll('*').remove();
    const terr = { type: 'FeatureCollection', features: DATA.states.features.filter((f) => f.properties.terr) };
    proj = d3.geoConicConformal().parallels([28, 36]).rotate([89, 0]).fitExtent([[18, 18], [W - 18, H - 18]], terr);
    path = d3.geoPath(proj);
    const g = svg.append('g'); gMap = g.append('g');
    gMap.append('rect').attr('class', 'om-sea').attr('x', -W * 4).attr('y', -H * 4).attr('width', W * 9).attr('height', H * 9);
    gMap.selectAll('path.om-st').data(DATA.states.features).join('path')
      .attr('class', (f) => 'om-st' + (f.properties.terr ? ' om-terr' : '')).attr('d', path);
    gMap.selectAll('text.om-lbl').data(terr.features).join('text').attr('class', 'om-lbl')
      .attr('transform', (f) => { const c = path.centroid(f); const fix = { FL: [28, 30], LA: [-12, -8], TX: [0, 10], NC: [10, 4] }[f.id] || [0, 0]; return 'translate(' + (c[0] + fix[0]) + ',' + (c[1] + fix[1]) + ')'; })
      .style('font-size', '15px').text((f) => f.id);
    gPins = g.append('g');
    const pins = DATA.pins.slice().sort((a, b) => a.lat === b.lat ? 0 : b.lat - a.lat);
    const sel = gPins.selectAll('g.om-pin').data(pins).join('g')
      .attr('class', 'om-pin').attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (p) => p.n + (hasCN(p.k) ? ', open Client Networks' : ''));
    sel.append('path').attr('d', PIN).attr('class', (p) => isCl(p) ? 'om-p-client' : 'om-p-prospect');
    sel.filter((p) => hasCN(p.k)).append('circle').attr('cy', -14).attr('r', 2.8).attr('class', 'om-dot');
    sel.on('mouseenter', (e, p) => showTip(e, p)).on('mousemove', (e, p) => showTip(e, p)).on('mouseleave', hideTip)
      .on('focus', function(e, p){ const b = this.getBoundingClientRect(); showTip({ clientX: b.left + b.width / 2, clientY: b.top }, p); }).on('blur', hideTip)
      .on('click', (e, p) => openCo(p))
      .on('keydown', (e, p) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openCo(p); } });
    zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[-W * 0.25, -H * 0.25], [W * 1.25, H * 1.25]])
      .on('zoom', (e) => { S.k = e.transform.k; g.attr('transform', e.transform); place(); gMap.selectAll('text.om-lbl').style('font-size', (15 / S.k) + 'px'); });
    svg.call(zoom).on('dblclick.zoom', null);
    place(); syncUI(); S.built = true;
  }
  function place(){
    if (!gPins) return;
    const s = 1 / S.k;
    gPins.selectAll('g.om-pin').attr('transform', (p) => { const xy = proj([p.lon, p.lat]); return 'translate(' + xy[0] + ',' + xy[1] + ') scale(' + (s * 0.9) + ')'; });
  }
  function showTip(e, p){
    const r = stage.getBoundingClientRect();
    tip.textContent = p.n; tip.hidden = false;
    let x = e.clientX - r.left + 12, y = e.clientY - r.top - 34;
    x = Math.min(x, r.width - tip.offsetWidth - 6); y = Math.max(4, y);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip(){ tip.hidden = true; }
  function openCo(p){
    hideTip();
    if (hasCN(p.k)) window.CNET.open(p.k);
  }

  root.addEventListener('click', (e) => {
    const w = e.target.closest('[data-who]'), c = e.target.closest('[data-cat]'), z = e.target.closest('[data-z]');
    if (w){ S.who = w.dataset.who; syncUI(); }
    else if (c){ const k = c.dataset.cat; if (S.cats.has(k) && S.cats.size > 1) S.cats.delete(k); else S.cats.add(k); syncUI(); }
    else if (z && zoom){
      if (z.dataset.z === 'reset') svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
      else svg.transition().duration(250).call(zoom.scaleBy, z.dataset.z === 'in' ? 1.8 : 1 / 1.8);
    }
  });
  function ensure(){ if (location.hash === '#officemap' && (!S.built || Math.abs(stage.getBoundingClientRect().width - W) > 40)) build(); }
  window.addEventListener('hashchange', () => setTimeout(ensure, 0));
  window.addEventListener('cnet:clients', () => { if (!gPins) return; gPins.selectAll('g.om-pin path').attr('class', (p) => isCl(p) ? 'om-p-client' : 'om-p-prospect'); syncUI(); });
  window.addEventListener('resize', () => { if (location.hash === '#officemap') { clearTimeout(S.rt); S.rt = setTimeout(ensure, 150); } });
  ensure();
  window.OFFICEMAP = { rebuild: build };
})();
