/* Daily Intel tab: the morning BD market report, read-only. Each report is one document in the portal database's
   "intel" collection (id = the report date), written by the 9 AM scheduled task. Project items carry a "Track this"
   button that starts a Project (stage Spotted, marked for research) with the companies the report named, linked to
   Client Networks where they already exist. Nothing on this tab can be edited. */
(function(){
  'use strict';
  const root = document.getElementById('intel'); if (!root) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(inc|llc|co|corp|corporation|company|construction|group|the)\b/g, '').replace(/[^a-z0-9]/g, '');
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const fmt = (iso) => { const p = String(iso).split('-'); if (p.length < 3) return iso; const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DOW[d.getUTCDay()] + ', ' + MON[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; };
  const short = (iso) => { const p = String(iso).split('-'); return p.length < 3 ? iso : MON[+p[1] - 1] + ' ' + (+p[2]); };
  const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';
  const PKEY = 'bdp-projects';
  const S = { reports: [], date: null, status: 'loading', msg: '', open: null };

  // ---------- data ----------
  async function loadReports(){
    const sync = window.BDP_SYNC, db = sync && sync.db && sync.db();
    if (!db){ S.status = sync && sync.mode && sync.mode() === 'loading' ? 'loading' : 'nodb'; render(); return; }
    try {
      const snap = await db.collection('intel').orderBy('date', 'desc').limit(60).get();
      S.reports = snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((r) => r && r.date && Array.isArray(r.sections));
      if (!S.date || !S.reports.some((r) => r.date === S.date)) S.date = S.reports.length ? S.reports[0].date : null;
      S.status = 'ready';
    } catch (e) { console.warn('intel load', e); S.status = 'error'; }
    render();
  }

  function projects(){ try { const v = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  const trackedProject = (key) => projects().find((p) => p && p.intel && p.intel.key === key);

  // match a company the report named to a Client Networks company
  function matchCompany(name){
    const C = window.CNET; if (!C || !C.companies) return '';
    const n = norm(name); if (!n) return '';
    const list = C.companies();
    const hit = list.find((c) => norm(c.name) === n || norm(c.key) === n) || list.find((c) => { const m = norm(c.name); return m.length > 3 && (n.indexOf(m) === 0 || m.indexOf(n) === 0); });
    return hit ? hit.key : '';
  }

  function track(report, item){
    const key = report.date + ':' + item.id;
    const existing = trackedProject(key); if (existing){ openProject(existing.id); return; }
    const list = projects();
    const id = 'pj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const team = (item.companies || []).map((c) => {
      const name = typeof c === 'string' ? c : c.name, role = (typeof c === 'object' && c.role) || 'Other';
      return { id: 't-' + Math.random().toString(36).slice(2, 8), name, role, co: matchCompany(name), award: 'Not known yet', ours: 'Not contacted', people: [] };
    }).filter((t) => t.name);
    const src = (item.sources || []).filter((s) => s && s.url);
    const notes = [item.summary || '', src.length ? 'Sources:\n' + src.map((s) => '- ' + (s.label || s.url) + ': ' + s.url).join('\n') : ''].filter(Boolean).join('\n\n');
    const p = { id, name: item.project || item.title, type: item.type || '', owner: item.owner || '', address: '', city: item.city || '', state: item.state || '',
      source: 'Daily Intel, ' + short(report.date), link: src.length ? src[0].url : '', size: item.size || '', value: item.value || '', bidDate: '', start: item.start || '', finish: '',
      intStart: '', intEnd: '', trades: [], heads: '', weeks: '', rate: '', shop: '', prevailing: '', supervision: '', stage: 'Spotted',
      next: 'Research with Apollo', nextDate: '', notes, team, files: [], created: Date.now(), edited: Date.now(),
      intel: { key, date: report.date, item: item.id, section: item.section || '' }, research: { status: 'needed' } };
    list.push(p);
    try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch (e) { S.msg = 'Could not save the project. Try again.'; render(); return; }
    try { window.dispatchEvent(new Event('bdp:projects')); } catch (e) {}
    if (window.BDP_PROJECTS && window.BDP_PROJECTS.refresh) window.BDP_PROJECTS.refresh();
    const linked = team.filter((t) => t.co).length;
    S.msg = '“' + p.name + '” added to Projects as Spotted' + (team.length ? ', with ' + team.length + ' compan' + (team.length === 1 ? 'y' : 'ies') + (linked ? ' (' + linked + ' linked to Client Networks)' : '') : '') + '. Open it to research the people with Apollo.';
    S.open = id; render();
  }
  function openProject(id){ if (window.BDP_PROJECTS && window.BDP_PROJECTS.open) window.BDP_PROJECTS.open(id); }

  // ---------- render ----------
  function itemHtml(report, item, sec){
    const key = report.date + ':' + item.id, tp = trackedProject(key);
    const meta = [item.state, item.type, item.value ? (/^\$/.test(String(item.value)) ? item.value : '$' + item.value) : ''].filter(Boolean);
    const cos = (item.companies || []).map((c) => typeof c === 'string' ? { name: c } : c).filter((c) => c && c.name);
    const coHtml = cos.length ? '<div class="in-cos"><span class="in-k">Companies named</span>' + cos.map((c) => { const k = matchCompany(c.name); return '<span class="in-co' + (k ? ' cn' : '') + '" title="' + (k ? 'In Client Networks' : 'Not in Client Networks yet') + '">' + esc(c.name) + (c.role ? ' <i>' + esc(c.role) + '</i>' : '') + '</span>'; }).join('') + '</div>' : '';
    const src = (item.sources || []).filter((s) => s && s.url).map((s) => '<a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.label || 'Source') + ' ↗</a>').join('');
    const can = item.trackable !== false && (sec.trackable !== false);
    const btn = !can ? '' : tp
      ? '<button type="button" class="btn in-tracked" data-in="open" data-arg="' + esc(tp.id) + '">✓ Tracked · ' + esc(tp.stage || 'Spotted') + ' — open ›</button>'
      : '<button type="button" class="btn primary in-track" data-in="track" data-date="' + esc(report.date) + '" data-arg="' + esc(item.id) + '">+ Track this</button>';
    return '<li class="in-item">' +
      '<div class="in-main"><h3>' + esc(item.title) + '</h3>' + (meta.length ? '<div class="in-meta">' + meta.map(esc).join('<span>·</span>') + '</div>' : '') +
      (item.summary ? '<p>' + esc(item.summary) + '</p>' : '') + coHtml + (src ? '<div class="in-src">' + src + '</div>' : '') + '</div>' +
      (btn ? '<div class="in-act">' + btn + '</div>' : '') + '</li>';
  }

  function render(){
    if (S.status === 'loading'){ root.innerHTML = '<div class="card in-empty"><p>Loading reports…</p></div>'; return; }
    if (S.status === 'nodb'){ root.innerHTML = '<div class="card in-empty"><h2>Daily Intel lives in the portal on claude.ai</h2><p>Open the portal artifact to read the morning reports and track projects.</p></div>'; return; }
    if (S.status === 'error'){ root.innerHTML = '<div class="card in-empty"><h2>Could not load the reports</h2><p>Check your connection, then <button type="button" class="btn" data-in="reload">try again</button>.</p></div>'; return; }
    if (!S.reports.length){ root.innerHTML = '<div class="card in-empty"><h2>No reports yet</h2><p>The 9 AM report lands here every weekday morning.</p></div>'; return; }
    const r = S.reports.find((x) => x.date === S.date) || S.reports[0];
    const strip = '<div class="in-days" role="group" aria-label="Pick a report">' + S.reports.slice(0, 10).map((x) => '<button type="button" class="in-day' + (x.date === r.date ? ' on' : '') + '" data-in="day" data-arg="' + esc(x.date) + '" aria-pressed="' + (x.date === r.date) + '">' + esc(short(x.date)) + '</button>').join('') +
      (S.reports.length > 10 ? '<select class="in-older" data-in="pick" aria-label="Older reports"><option value="">Older…</option>' + S.reports.slice(10).map((x) => '<option value="' + esc(x.date) + '"' + (x.date === r.date ? ' selected' : '') + '>' + esc(fmt(x.date)) + '</option>').join('') + '</select>' : '') + '</div>';
    const tracked = r.sections.reduce((n, s) => n + (s.items || []).filter((it) => trackedProject(r.date + ':' + it.id)).length, 0);
    const head = '<div class="card in-head"><div><span class="eyebrow">Report for</span><h2>' + esc(fmt(r.date)) + '</h2>' + (r.lead ? '<p class="in-lead">' + esc(r.lead) + '</p>' : '') + '</div>' +
      '<div class="in-headr">' + (r.docUrl ? '<a class="btn" href="' + esc(safeUrl(r.docUrl)) + '" target="_blank" rel="noopener">Full report doc ↗</a>' : '') + '<span class="sub13">' + tracked + ' tracked from this report</span></div></div>';
    const secs = r.sections.map((s) => '<section class="card in-sec"><div class="card-head"><h2>' + esc(s.name) + '</h2>' + (s.trackable !== false && (s.items || []).some((it) => it.trackable !== false) ? '<span class="note">Track a project to start researching it</span>' : '') + '</div>' +
      ((s.items || []).length ? '<ul class="in-list">' + s.items.map((it) => itemHtml(r, it, s)).join('') + '</ul>' : '<p class="sub13">Nothing new today.</p>') + '</section>').join('');
    const msg = S.msg ? '<p class="pj-msg in-msg" role="status">' + esc(S.msg) + (S.open ? ' <button type="button" class="pj-link" data-in="open" data-arg="' + esc(S.open) + '">Open project ›</button>' : '') + '</p>' : '';
    root.innerHTML = strip + msg + head + secs;
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-in]'); if (!el || !root.contains(el)) return;
    const a = el.dataset.in, arg = el.dataset.arg;
    if (a === 'day'){ S.date = arg; S.msg = ''; S.open = null; render(); }
    else if (a === 'reload'){ S.status = 'loading'; render(); loadReports(); }
    else if (a === 'open') openProject(arg);
    else if (a === 'track'){
      const r = S.reports.find((x) => x.date === el.dataset.date); if (!r) return;
      let item = null, sec = null; r.sections.forEach((s) => (s.items || []).forEach((it) => { if (it.id === arg){ item = it; sec = s; } }));
      if (item) track(r, Object.assign({ section: sec.name }, item));
    }
  });
  root.addEventListener('change', (e) => { const el = e.target; if (el.dataset && el.dataset.in === 'pick' && el.value){ S.date = el.value; S.msg = ''; render(); } });

  window.addEventListener('bdp:projects', () => { if (location.hash === '#intel') render(); });
  if (window.BDP_SYNC && window.BDP_SYNC.onRemote) window.BDP_SYNC.onRemote(PKEY, () => { if (location.hash === '#intel') render(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#intel') loadReports(); });
  // new reports from the morning task show up without a reload
  (function live(){ const db = window.BDP_SYNC && window.BDP_SYNC.db && window.BDP_SYNC.db(); if (!db) return; try { db.collection('intel').onSnapshot(() => loadReports(), () => {}); } catch (e) {} })();
  loadReports();
})();
