/* Projects tab: the jobs Samuel is chasing. One record per building or job, stored under "bdp-projects" (synced to the
   portal's database by sync.js; the public GitHub copy does not export it). Companies and people on a project are
   links: their details, phone numbers and contact history stay in Client Networks, so nothing is entered twice. A project can start Pipeline deals; those carry projectId and link back here. */
(function(){
  'use strict';
  const root = document.getElementById('projects'); if (!root) return;
  const KEY = 'bdp-projects';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const STAGES = [
    { k:'Spotted', c:'#9AA6BA', d:'Heard about it' }, { k:'Researching', c:'#5AA9F0', d:'Finding out who is on it' },
    { k:'Reaching out', c:'#E0B23C', d:'Making first contact' }, { k:'In conversation', c:'#F2804A', d:'Talking with the team' },
    { k:'Pricing', c:'#E8452C', d:'Putting numbers together' }, { k:'Won', c:'#2E9E6B', d:'We are on it' },
    { k:'Lost', c:'#8A97AB', d:'Went to someone else' }, { k:'Passed', c:'#8A97AB', d:'Not a fit for us' }];
  const OPEN = ['Spotted', 'Researching', 'Reaching out', 'In conversation', 'Pricing'];
  const stageOf = (k) => STAGES.find((s) => s.k === k) || STAGES[0];
  const ROLES = ['Owner', 'Developer', 'Architect', 'Engineer', 'GC / CM', 'Framing & drywall', 'Acoustical ceilings', 'Insulation', 'Other trade', 'Other'];
  const AWARD = ['Awarded', 'Bidding', 'Not known yet'];
  const OURS = [{ k:'Not contacted', c:'#9AA6BA' }, { k:'Reached out', c:'#E0B23C' }, { k:'Talking', c:'#F2804A' }, { k:'Pricing', c:'#E8452C' }, { k:'On board', c:'#2E9E6B' }, { k:'Not a fit', c:'#8A97AB' }];
  const oursOf = (k) => OURS.find((o) => o.k === k) || OURS[0];
  const TRADES = ['Metal framing', 'Drywall', 'Acoustical ceilings', 'Insulation', 'Finishes'];
  const TYPES = ['Data center', 'Aerospace / spaceport', 'Hospital / healthcare', 'Multifamily', 'Office', 'Hotel / hospitality', 'School / university', 'Retail', 'Industrial / warehouse', 'Lab / pharma', 'Government / military', 'Mixed use', 'Other'];
  const TERR = ['AL', 'FL', 'GA', 'LA', 'MS', 'NC', 'SC', 'TN', 'TX'];
  const OTHER_ST = ['AK','AZ','AR','CA','CO','CT','DC','DE','HI','ID','IL','IN','IA','KS','KY','ME','MD','MA','MI','MN','MO','MT','NE','NV','NH','NJ','NM','NY','ND','OH','OK','OR','PA','RI','SD','UT','VT','VA','WA','WV','WI','WY'];
  const HOURS = 40, RATE_LO = 35, RATE_HI = 40;

  const S = { view:'list', id:null, filter:'open', draft:null, addCo:null, addPer:null, deal:null, armed:null, msg:'', busy:0, more:new Set() };
  const NO_AWARD = ['Owner', 'Developer'];
  const PRIO = { A:0, B:1, C:2 };
  let PJ = load();

  // ---------- storage ----------
  function load(){ try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((p) => p && p.id) : []; } catch (e) { return []; } }
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(PJ)); } catch (e) { S.msg = 'Could not save: ' + (e && e.message || 'storage error'); return false; }
    try { window.dispatchEvent(new Event('bdp:projects')); } catch (e) {}
    return true;
  }
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const byId = (id) => PJ.find((p) => p.id === id);
  // Change one project against the latest saved copy, so an edit never writes back an older version of the others.
  function mutate(id, fn){ PJ = load(); const p = byId(id); if (!p) return null; fn(p); p.edited = Date.now(); save(); return p; }

  // ---------- dates and money ----------
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayNum = (iso) => { const p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +(p[2] || 1)) / 864e5; };
  const isMonth = (v) => /^\d{4}-\d{2}$/.test(v || ''), isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const monthStart = (m) => dayNum(m + '-01');
  const monthEnd = (m) => { const p = m.split('-'); return Date.UTC(+p[0], +p[1], 0) / 864e5; };
  const fmtDay = (iso) => { if (!isDay(iso)) return ''; const p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; };
  const fmtMon = (m) => { if (!isMonth(m)) return ''; const p = m.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; };
  function fmtWindow(a, b){
    if (isMonth(a) && isMonth(b)){ return a.slice(0, 4) === b.slice(0, 4) ? MON[+a.slice(5) - 1] + ' – ' + fmtMon(b) : fmtMon(a) + ' – ' + fmtMon(b); }
    if (isMonth(a)) return 'From ' + fmtMon(a);
    if (isMonth(b)) return 'Until ' + fmtMon(b);
    return '';
  }
  function dueText(iso){
    if (!isDay(iso)) return { t:'', late:false };
    const d = dayNum(iso) - dayNum(todayISO());
    return { t: d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d < 0 ? (-d) + ' days overdue' : 'in ' + d + ' days', late: d < 0, soon: d >= 0 && d <= 7 };
  }
  const money = (n) => { n = +n || 0; return n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); };
  // Labor value = peak manpower × 40-hour weeks × weeks on site × rate (the project's rate, or Samuel's $35–40 range).
  function labor(p){
    const h = +p.heads || 0, w = +p.weeks || 0, r = +p.rate || 0; if (!h || !w) return null;
    return r ? { lo: h * HOURS * w * r, hi: h * HOURS * w * r, mid: h * HOURS * w * r, rate: r } : { lo: h * HOURS * w * RATE_LO, hi: h * HOURS * w * RATE_HI, mid: h * HOURS * w * (RATE_LO + RATE_HI) / 2, rate: 0 };
  }
  const laborText = (l) => !l ? '' : l.lo === l.hi ? money(l.lo) : money(l.lo) + '–' + money(l.hi).slice(1);

  // ---------- the rest of the portal ----------
  const CN = () => window.CNET || null, MAP = () => window.BDMAP || null;
  function directory(){
    const out = {};
    const m = MAP(); ((m && m.COMPANIES) || []).forEach((c) => { out[c.key] = { key:c.key, name:(c.company && c.company.name) || c.key, short:'', map:true, cn:false }; });
    const c = CN(); ((c && c.companies) ? c.companies() : []).forEach((x) => { const o = out[x.key] || (out[x.key] = { key:x.key, name:x.name, map:false }); o.cn = true; o.short = x.name; });
    return out;
  }
  const dirName = (d) => d.short || String(d.name).replace(/\s*\((?:[^)]*)\)\s*(?:-.*)?$/, '').replace(/,?\s+(Inc|LLC|L\.L\.C|LP|L\.P|Co)\.?$/i, '') || d.name;
  function searchCompanies(q){
    const t = norm(q); if (!t) return [];
    const all = Object.values(directory());
    return all.map((d) => { const n = norm(d.short) + ' ' + norm(d.name); const i = Math.min(...[norm(d.short), norm(d.name), norm(d.key)].map((s) => { const j = s.indexOf(t); return j < 0 ? 99 : j; })); return { d, i, n }; })
      .filter((x) => x.i < 99).sort((a, b) => a.i - b.i || dirName(a.d).localeCompare(dirName(b.d))).slice(0, 8).map((x) => x.d);
  }
  function peopleOf(k){
    const list = [], seen = {};
    const c = CN(); if (k && c && c.people) c.people(k).forEach((p) => { seen[norm(p.name)] = 1; list.push({ name:p.name, title:p.title || '', pid:p.id, src:'cn' }); });
    // Client Networks rosters already hold everyone from the old BusDev Map; the map is only a fallback
    if (list.length || (c && c.hasCompany && c.hasCompany(k))) return list;
    const m = MAP(), co = k && m && (m.COMPANIES || []).find((x) => x.key === k);
    ((co && co.people) || []).forEach((p) => { if (!p || !p.name || seen[norm(p.name)]) return; seen[norm(p.name)] = 1; list.push({ name:p.name, title:p.title || '', pid:p.id, src:'map' }); });
    Object.values((m && m.ADDED) || {}).forEach((p) => { if (!p || p.company !== k || !p.name || seen[norm(p.name)]) return; seen[norm(p.name)] = 1; list.push({ name:p.name, title:p.title || '', pid:'added-' + p.id, src:'map' }); });
    return list;
  }
  // Contact history for one person: the Client Networks contact log (with its warmth rating, and old BusDev Map
  // contacts folded in by Client Networks itself). The map lookup below only covers a company Client Networks lacks.
  function history(k, per){
    if (!k || !per) return null;
    const c = CN(), m = MAP();
    const h = (c && c.contact) ? c.contact(k, per.name) : null;
    if (h || (c && c.hasCompany && c.hasCompany(k))) return h ? { count:h.count, last:h.last, how:h.lastType, label:h.label, color:h.color, now:h.now } : { count:0, last:'', how:'', now:null };
    let count = h ? h.count : 0, last = h ? h.last : '', how = h ? h.lastType : '';
    // BusDev Map outreach is keyed by the map's own person id; people picked from Client Networks are matched by name
    let mpid = per.src === 'map' ? per.pid : '';
    if (!mpid && m && m.COMPANIES){ const co = m.COMPANIES.find((x) => x.key === k), hit = co && (co.people || []).find((x) => x && norm(x.name) === norm(per.name)); if (hit) mpid = hit.id; }
    if (m && m.OUT && mpid){ const list = m.OUT[m.key(k, mpid)] || []; list.forEach((e) => { count++; if (e.at && e.at > last){ last = e.at; how = e.channel || ''; } }); }
    return { count, last, how, label: h && h.label, color: h && h.color, now: h ? h.now : null };
  }
  function bestWayIn(k){
    if (!k) return null;
    let best = null;
    peopleOf(k).forEach((p) => { const h = history(k, p); if (!h || !h.count) return; const s = (h.now == null ? 0 : h.now) * 1e6 + dayNum(h.last || '1970-01-01'); if (!best || s > best.s) best = { p, h, s }; });
    return best;
  }
  // Everything opens in Client Networks; the BusDev Map tab is retired and its people live on the Client Networks rosters
  function openCompany(k){ if (CN() && CN().open && CN().hasCompany(k)) CN().open(k, null, 'profile'); }
  function openPerson(k, per, where){ if (CN() && CN().open && CN().hasCompany(k)) CN().open(k, per.name, where === 'log' ? 'log' : null); }

  // ---------- files ----------
  let ASSETS = null;
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('assets').then((a) => { ASSETS = a || null; if (S.view === 'project') render(); }, () => {});
  async function onFiles(input){
    const id = S.id; if (!ASSETS || !input.files || !input.files.length) return;
    const errs = [], added = [];
    S.busy++; S.msg = ''; render();
    for (const file of Array.from(input.files)){
      if (file.size > 20 * 1024 * 1024){ errs.push(file.name + ' is over 20 MB'); continue; }
      try { const r = await ASSETS.upload(file, { type: file.type || 'application/pdf' }); added.push({ id:r.id, name:file.name, size:r.sizeBytes, type:file.type || '' }); }
      catch (err){ const c = err && err.code; errs.push(file.name + ': ' + (c === 'too_large' ? 'over the size limit' : c === 'quota_or_state' ? 'storage is full' : c === 'not_granted' ? 'only the portal\'s editors can attach files' : c === 'unsupported_type' ? 'that file type can\'t be stored' : 'upload failed, try again')); }
    }
    if (added.length) mutate(id, (p) => { p.files = (p.files || []).concat(added); });
    S.busy--; S.msg = errs.length ? errs.join(' · ') : added.length ? 'Attached ' + added.length + (added.length === 1 ? ' file.' : ' files.') : ''; render();
  }

  // ---------- small pieces ----------
  // options carry an explicit value: the Spanish view rewrites option text, and the stored value must stay English
  const opt = (v, on) => '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(v) + '</option>';
  const pill = (st) => '<span class="pj-pill"><i style="background:' + st.c + '"></i>' + esc(st.k) + '</span>';
  const where = (p) => [p.city, p.state].filter(Boolean).join(', ');
  const teamOf = (p) => Array.isArray(p.team) ? p.team : [];
  const roleRank = (r) => { const i = ROLES.indexOf(r); return i < 0 ? 99 : i; };
  function gcName(p){ const g = teamOf(p).filter((t) => t.role === 'GC / CM'); return g.length ? g.map((t) => t.name).join(', ') : ''; }
  function teamLine(p){
    const t = teamOf(p); if (!t.length) return 'No companies added yet';
    const gcs = t.filter((x) => x.role === 'GC / CM').length, subs = t.filter((x) => /Framing|Acoustical|Insulation|Other trade/.test(x.role)).length, other = t.length - gcs - subs;
    return [gcs ? 'GC: ' + gcName(p) : '', subs ? subs + (subs === 1 ? ' sub' : ' subs') : '', other ? other + ' other' : ''].filter(Boolean).join(' · ');
  }
  const opps = () => Array.isArray(window.OPPS) ? window.OPPS : [];
  const dealsOf = (p) => opps().filter((o) => o && o.projectId === p.id);

  // ---------- LIST ----------
  function viewList(){
    const open = PJ.filter((p) => OPEN.includes(p.stage || 'Spotted'));
    const won = PJ.filter((p) => p.stage === 'Won'), closed = PJ.filter((p) => p.stage === 'Lost' || p.stage === 'Passed');
    let lo = 0, hi = 0, heads = 0, due = 0;
    open.forEach((p) => { const l = labor(p); if (l){ lo += l.lo; hi += l.hi; } heads += +p.heads || 0; const d = dueText(p.nextDate); if (d.late || d.soon) due++; });
    const tiles = '<div class="grid g4 pj-tiles">' +
      tile('Active projects', String(open.length), open.length ? OPEN.map((k) => { const n = open.filter((p) => (p.stage || 'Spotted') === k).length; return n ? n + ' ' + k.toLowerCase() : ''; }).filter(Boolean).join(' · ') : 'Add the first one below') +
      tile('Labor value chased', lo ? (lo === hi ? money(lo) : money(lo) + '–' + money(hi).slice(1)) : '—', 'Active projects with manpower and weeks set') +
      tile('Peak manpower', heads ? String(heads) : '—', 'Across active projects') +
      tile('Next steps due', String(due), 'Overdue or due in the next 7 days', due ? 'warn' : '') + '</div>';
    const F = [['open', 'Active', open.length], ['Won', 'Won', won.length], ['closed', 'Lost / passed', closed.length], ['all', 'All', PJ.length]];
    const filt = '<div class="pj-filters" role="group" aria-label="Show projects">' + F.map((f) => '<button type="button" class="pj-fbtn' + (S.filter === f[0] ? ' on' : '') + '" data-act="filter" data-arg="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + f[1] + ' <span>' + f[2] + '</span></button>').join('') + '</div>';
    let list = S.filter === 'open' ? open : S.filter === 'Won' ? won : S.filter === 'closed' ? closed : PJ.slice();
    const key = (p) => isMonth(p.intStart) ? p.intStart : isMonth(p.start) ? p.start : '9999';
    list = list.slice().sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : String(a.name).localeCompare(String(b.name)));
    const head = '<div class="pj-listhead">' + filt + '<button type="button" class="btn primary" data-act="new">+ New project</button></div>';
    if (!PJ.length) return tiles + '<div class="card">' + head + '<div class="empty pj-empty"><b>No projects yet.</b><br>Add the first job you\'re chasing. Only the name is required; fill in the rest as you learn it.</div></div>';
    const rows = list.map((p) => {
      const st = stageOf(p.stage), l = labor(p), d = dueText(p.nextDate), win = fmtWindow(p.intStart, p.intEnd);
      return '<button type="button" class="pj-row" data-act="open" data-arg="' + esc(p.id) + '">' +
        '<span class="pj-r-main"><span class="pj-r-name">' + esc(p.name) + '</span><span class="sub13">' + esc([p.type, where(p)].filter(Boolean).join(' · ') || 'Location not set') + '</span></span>' +
        '<span class="pj-r-st">' + pill(st) + '</span>' +
        '<span class="pj-r-cell"><span class="pj-k">Interiors</span>' + (win ? esc(win) : '<span class="pj-dim">Not set</span>') + '</span>' +
        '<span class="pj-r-cell"><span class="pj-k">Team</span>' + esc(teamLine(p)) + '</span>' +
        '<span class="pj-r-cell"><span class="pj-k">Next step</span>' + (p.next ? esc(p.next) + (d.t ? ' <span class="' + (d.late ? 'pj-late' : 'pj-dim') + '">· ' + esc(d.t) + '</span>' : '') : '<span class="pj-dim">None set</span>') + '</span>' +
        '<span class="pj-r-cell pj-r-val"><span class="pj-k">Labor value</span>' + (l ? esc(laborText(l)) : '<span class="pj-dim">—</span>') + '</span></button>';
    }).join('');
    return tiles + '<div class="card">' + head + (list.length ? '<div class="pj-rows">' + rows + '</div>' : '<div class="empty">No projects here.</div>') + '</div>';
  }
  function tile(label, big, sub, cls){ return '<div class="card tight' + (cls ? ' pj-' + cls : '') + '"><span class="label">' + esc(label) + '</span><span class="big">' + esc(big) + '</span><span class="sub13">' + esc(sub) + '</span></div>'; }

  // ---------- PROJECT ----------
  function viewProject(){
    const p = byId(S.id); if (!p){ S.view = 'list'; return viewList(); }
    const st = stageOf(p.stage), l = labor(p), d = dueText(p.nextDate), win = fmtWindow(p.intStart, p.intEnd);
    const facts = [p.owner ? 'Owner: ' + esc(p.owner) : '', p.source ? 'Lead from: ' + esc(p.source) : '', p.link ? '<a href="' + esc(safeUrl(p.link)) + '" target="_blank" rel="noopener">Project report ↗</a>' : ''].filter(Boolean).join('<span class="pj-sep">·</span>');
    const stepper = '<div class="pj-steps" role="group" aria-label="Where this project stands">' + STAGES.map((s) => '<button type="button" class="pj-step' + (s.k === st.k ? ' on' : '') + (OPEN.includes(s.k) ? '' : ' end') + '" data-act="stage" data-arg="' + esc(s.k) + '" aria-pressed="' + (s.k === st.k) + '" title="' + esc(s.d) + '"><i style="background:' + s.c + '"></i>' + esc(s.k) + '</button>').join('') + '</div>';
    const tiles = '<div class="grid g4 pj-tiles">' +
      tile('Construction value', p.value ? money(p.value) : '—', p.size || 'Size not set') +
      tile('Interiors window', win || 'Not set', 'When framing and drywall run') +
      tile('Peak manpower', p.heads ? String(p.heads) : '—', p.weeks ? p.weeks + ' weeks on site' : 'Weeks not set') +
      tile('Est. labor value', l ? laborText(l) : '—', l ? (l.rate ? '$' + l.rate + '/hr' : 'At your $35–40/hr') + ' · 40-hr weeks' : 'Needs manpower and weeks') + '</div>';
    const next = '<div class="pj-next' + (d.late ? ' late' : '') + '"><span class="pj-k">Next step</span>' + (p.next ? '<b>' + esc(p.next) + '</b>' + (p.nextDate ? ' <span class="' + (d.late ? 'pj-late' : 'pj-dim') + '">· ' + esc(fmtDay(p.nextDate)) + ' (' + esc(d.t) + ')</span>' : '') : '<span class="pj-dim">None set. Add one with Edit details.</span>') + '</div>';
    return '<div class="pj-top"><button type="button" class="btn" data-act="list">◂ All projects</button><button type="button" class="btn" data-act="edit">Edit details</button></div>' +
      '<div class="card pj-hero"><div class="pj-herotop"><span class="eyebrow">' + esc([p.type, where(p)].filter(Boolean).join(' · ') || 'Location and type not set') + '</span>' + (facts ? '<div class="pj-facts">' + facts + '</div>' : '') + '</div>' + stepper + next + '</div>' +
      tiles + teamCard(p) + (window.BDP_RESEARCH ? window.BDP_RESEARCH.card(p) : '') + timelineCard(p) +
      '<div class="grid g2">' + scopeCard(p) + detailsCard(p) + '</div>' +
      '<div class="grid g2">' + filesCard(p) + dealsCard(p) + '</div>' +
      (S.msg ? '<p class="pj-msg" role="status">' + esc(S.msg) + '</p>' : '');
  }
  function linkify(t){
    return esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])|([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, (m, u, e) => u ? '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>' : '<a href="mailto:' + e + '">' + e + '</a>').replace(/\n/g, '<br>');
  }
  function safeUrl(u){ u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) ? 'https://' + u : '#'; }

  function teamCard(p){
    const t = teamOf(p).map((x, i) => ({ x, i })).sort((a, b) => roleRank(a.x.role) - roleRank(b.x.role) || a.i - b.i);
    const dir = directory();
    let html = '', lastRole = null;
    t.forEach(({ x, i }) => {
      if (x.role !== lastRole){ html += '<h3 class="pj-role">' + esc(x.role) + '</h3>'; lastRole = x.role; }
      const d = x.co ? dir[x.co] : null, ours = oursOf(x.ours);
      const star = x.co && CN() && CN().isClient && CN().hasCompany(x.co) && CN().isClient(x.co) ? '<span class="pj-star" role="img" aria-label="IB Group client" title="IB Group client">★</span>' : '';
      const nameHtml = d ? '<button type="button" class="pj-link pj-coname" data-act="opencompany" data-arg="' + i + '">' + star + esc(x.name) + '</button>' : '<span class="pj-coname">' + star + esc(x.name) + '</span>';
      const tags = d && d.cn ? '<button type="button" class="pj-tag" data-act="opencompany" data-arg="' + i + '">Client Networks ↗</button>' : '<span class="pj-tag muted">Not in Client Networks yet</span>';
      const bw = d ? bestWayIn(x.co) : null;
      const best = d ? (bw ? '<div class="pj-best"><span class="pj-k">Best way in</span><button type="button" class="pj-link" data-act="openperson" data-arg="' + i + '" data-src="' + esc(bw.p.src) + '" data-name="' + esc(bw.p.name) + '" data-pid="' + esc(bw.p.pid || '') + '">' + esc(bw.p.name) + '</button>' + (bw.p.title ? ' <span class="pj-dim">' + esc(bw.p.title) + '</span>' : '') + ' · ' + esc(histText(bw.h)) + '</div>' : '<div class="pj-best"><span class="pj-k">Best way in</span><span class="pj-dim">No one at ' + esc(x.name) + ' contacted yet</span></div>') : '';
      const all = (x.people || []).map((per, j) => ({ per, j })).sort((a, b) => ((PRIO[a.per.priority] ?? 3) - (PRIO[b.per.priority] ?? 3)) || a.j - b.j);
      const folded = all.filter((o) => o.per.priority === 'B' || o.per.priority === 'C'), open = S.more.has(x.id || String(i));
      const shown = open || folded.length < 2 ? all : all.filter((o) => !folded.includes(o));
      const people = shown.map(({ per, j }) => {
        const h = d ? history(x.co, per) : null, linked = d && per.src;
        const meta = [per.based ? esc(per.based) : '', per.since ? 'in role since ' + esc(per.since) : '',
          per.li ? '<a href="' + esc(safeUrl(per.li)) + '" target="_blank" rel="noopener">LinkedIn ↗</a>' : '',
          per.email ? '<a href="mailto:' + esc(per.email) + '">' + esc(per.email) + '</a>' + (/guess/i.test(per.emailStatus || '') ? ' <span class="pj-warn-t">(guessed, not verified)</span>' : '') : ''].filter(Boolean).join('<span class="pj-sep">·</span>');
        const more = (meta || per.why || per.pitch) ? '<div class="pj-pmore">' + (meta ? '<div class="pj-pmeta">' + meta + '</div>' : '') +
          (per.why ? '<div class="pj-pnote"><b>Why:</b> ' + esc(per.why) + '</div>' : '') + (per.pitch ? '<div class="pj-pnote"><b>Pitch:</b> ' + esc(per.pitch) + '</div>' : '') + '</div>' : '';
        return '<li class="pj-person">' +
          '<span class="pj-pname">' + (per.priority ? '<span class="pj-prio p' + esc(per.priority) + '" title="Priority ' + esc(per.priority) + '">' + esc(per.priority) + '</span>' : '') + '<span class="pj-pn">' + (linked ? '<button type="button" class="pj-link" data-act="openperson" data-arg="' + i + '" data-src="' + esc(per.src) + '" data-name="' + esc(per.name) + '" data-pid="' + esc(per.pid || '') + '">' + esc(per.name) + '</button>' : '<b>' + esc(per.name) + '</b>') + (per.title ? '<span class="pj-dim">' + esc(per.title) + '</span>' : '') + (per.linkedin ? '<a class="pj-dim pj-li" href="' + esc(safeUrl(per.linkedin)) + '" target="_blank" rel="noopener">LinkedIn ↗</a>' : '') + (per.email ? '<a class="pj-dim pj-li" href="mailto:' + esc(per.email) + '">' + esc(per.email) + '</a>' : '') + '</span></span>' +
          '<span class="pj-phist">' + (h && h.count ? (h.label ? '<i class="pj-dot" style="background:' + esc(h.color || '#9AA6BA') + '"></i>' : '') + esc(histText(h)) : '<span class="pj-dim">' + (linked ? 'No contact yet' : 'Not linked to a profile') + '</span>') + '</span>' +
          '<span class="pj-pact">' + (linked ? '<button type="button" class="pj-mini" data-act="logperson" data-arg="' + i + '" data-src="' + esc(per.src) + '" data-name="' + esc(per.name) + '" data-pid="' + esc(per.pid || '') + '">Log contact</button>' : '') +
          '<button type="button" class="pj-mini' + (S.armed === 'per:' + i + ':' + j ? ' armed' : '') + '" data-act="rmper" data-arg="' + i + ':' + j + '" aria-label="Remove ' + esc(per.name) + ' from this project">' + (S.armed === 'per:' + i + ':' + j ? 'Click again to remove' : 'Remove') + '</button></span>' + more + '</li>';
      }).join('') + (folded.length >= 2 ? '<li class="pj-foldrow"><button type="button" class="pj-mini" data-act="more" data-arg="' + esc(x.id || String(i)) + '" aria-expanded="' + open + '">' + (open ? 'Show priority A only' : 'Show ' + folded.length + ' more (priority B and C)') + '</button></li>' : '');
      const addPer = S.addPer && S.addPer.i === i ? addPersonForm(x, i) : '<button type="button" class="pj-mini pj-addper" data-act="addper" data-arg="' + i + '">+ Add person</button>';
      html += '<div class="pj-co">' +
        '<div class="pj-cohead"><div class="pj-coid">' + nameHtml + '<div class="pj-tags">' + tags + '</div></div>' +
        '<div class="pj-cocontrols">' +
          (NO_AWARD.includes(x.role) ? '' : '<label class="pj-sel"><span>Status on job</span><select data-team="' + i + '" data-tf="award">' + AWARD.map((a) => opt(a, a === (x.award || 'Not known yet'))).join('') + '</select></label>') +
          '<label class="pj-sel"><span>Our status</span><span class="pj-selwrap"><i class="pj-dot" style="background:' + ours.c + '"></i><select data-team="' + i + '" data-tf="ours">' + OURS.map((o) => opt(o.k, o.k === ours.k)).join('') + '</select></span></label>' +
          '<button type="button" class="pj-mini' + (S.armed === 'co:' + i ? ' armed' : '') + '" data-act="rmco" data-arg="' + i + '" aria-label="Remove ' + esc(x.name) + ' from this project">' + (S.armed === 'co:' + i ? 'Click again to remove' : 'Remove') + '</button></div></div>' +
        best + (people ? '<ul class="pj-people">' + people + '</ul>' : '') + addPer + '</div>';
    });
    const add = S.addCo ? addCompanyForm() : '<button type="button" class="btn" data-act="addco">+ Add company</button>';
    return '<div class="card"><div class="card-head"><h2>Project team</h2><span class="note">Click a company or person to open their profile</span></div>' +
      (t.length ? html : '<div class="empty">Add the owner, GC and subs on this job. Pick them from Client Networks so they link to their profiles.</div>') + add + '</div>';
  }
  function histText(h){ if (!h || !h.count) return 'No contact yet'; return [h.label, 'last contact ' + fmtDay(h.last) + (h.how ? ' (' + h.how + ')' : ''), h.count + (h.count === 1 ? ' touch' : ' touches')].filter(Boolean).join(' · '); }

  function addCompanyForm(){
    const a = S.addCo, pick = a.pick ? directory()[a.pick] : null;
    return '<div class="pj-addbox" id="pjAddCo"><h3>Add a company</h3><div class="pj-form pj-form3">' +
      '<label>Role<select data-add="role">' + ROLES.map((r) => opt(r, r === a.role)).join('') + '</select></label>' +
      '<label class="pj-search">Company<input id="pjCoQ" data-add="q" autocomplete="off" placeholder="Search Client Networks" value="' + esc(pick ? dirName(pick) : a.q) + '" role="combobox" aria-expanded="' + (!pick && !!a.q) + '" aria-controls="pjCoSug" aria-autocomplete="list"><div id="pjCoSug" class="pj-sug" role="listbox">' + sugHtml() + '</div></label>' +
      '<label>Status on job<select data-add="award">' + AWARD.map((x) => opt(x, x === a.award)).join('') + '</select></label></div>' +
      '<div class="pj-addnote sub13" id="pjCoNote">' + coNote() + '</div>' +
      '<div class="pj-actions"><button type="button" class="btn primary" data-act="saveco">Add to project</button><button type="button" class="btn" data-act="cancelco">Cancel</button></div></div>';
  }
  function coNote(){
    const a = S.addCo; if (!a) return '';
    if (a.pick){ const d = directory()[a.pick]; return d && d.cn ? 'Links to its Client Networks profile.' : ''; }
    return a.q.trim() ? 'Not picked from the list: it will be saved as a plain name (no profile link).' : 'Start typing a company name.';
  }
  function sugHtml(){
    const a = S.addCo; if (!a || a.pick || !a.q.trim()) return '';
    const hits = searchCompanies(a.q);
    return hits.map((d) => '<button type="button" class="pj-sugitem" role="option" data-act="pickco" data-arg="' + esc(d.key) + '"><b>' + esc(dirName(d)) + '</b><span>' + (d.cn ? 'Client Networks' : 'Research only') + '</span></button>').join('') +
      '<button type="button" class="pj-sugitem new" role="option" data-act="pickfree"><b>Use “' + esc(a.q.trim()) + '”</b><span>New company, not in Client Networks</span></button>';
  }
  function addPersonForm(x, i){
    const a = S.addPer, cands = x.co ? peopleOf(x.co).filter((p) => !(x.people || []).some((q) => norm(q.name) === norm(p.name))) : [];
    const t = norm(a.q), hits = t ? cands.filter((p) => norm(p.name).includes(t) || norm(p.title).includes(t)).slice(0, 8) : cands.slice(0, 8);
    return '<div class="pj-addbox pj-addperbox"><div class="pj-form pj-form2">' +
      '<label class="pj-search">Person<input id="pjPerQ" data-addp="q" autocomplete="off" placeholder="' + (cands.length ? 'Search ' + cands.length + ' people at ' + esc(x.name) : 'Name') + '" value="' + esc(a.q) + '"></label>' +
      '<label>Title<input data-addp="title" autocomplete="off" placeholder="e.g. Senior PM" value="' + esc(a.title) + '"></label></div>' +
      (cands.length ? '<div class="pj-cands" id="pjCands">' + candsHtml(hits) + '</div>' : '') +
      '<div class="pj-actions"><button type="button" class="btn primary" data-act="saveper" data-arg="' + i + '">Add person</button><button type="button" class="btn" data-act="cancelper">Cancel</button><span class="sub13">' + (cands.length ? 'Pick someone from the list to link their profile, or type a new name.' : x.co ? 'No people on file for ' + esc(x.name) + ' yet. Type a name.' : 'Type a name.') + '</span></div></div>';
  }
  function candsHtml(hits){ return hits.map((p) => '<button type="button" class="pj-cand" data-act="pickper" data-name="' + esc(p.name) + '" data-pid="' + esc(p.pid || '') + '" data-src="' + esc(p.src) + '" data-title="' + esc(p.title) + '"><b>' + esc(p.name) + '</b><span>' + esc(p.title || '') + '</span></button>').join(''); }

  function timelineCard(p){
    const marks = [], push = (v) => { if (v != null && !isNaN(v)) marks.push(v); };
    const bid = isDay(p.bidDate) ? dayNum(p.bidDate) : null;
    const cs = isMonth(p.start) ? monthStart(p.start) : null, ce = isMonth(p.finish) ? monthEnd(p.finish) : null;
    const is = isMonth(p.intStart) ? monthStart(p.intStart) : null, ie = isMonth(p.intEnd) ? monthEnd(p.intEnd) : null;
    [bid, cs, ce, is, ie].forEach(push);
    if (marks.length < 2) return '<div class="card"><div class="card-head"><h2>Timeline</h2></div><div class="empty">Add the bid date, construction start and finish, and the interiors window with Edit details to see the timeline.</div></div>';
    const today = dayNum(todayISO()); push(today);
    let a = Math.min(...marks), b = Math.max(...marks); const pad = Math.max(15, (b - a) * 0.04); a -= pad; b += pad;
    const X = (v) => ((v - a) / (b - a) * 100).toFixed(2) + '%', W = (u, v) => (Math.max(0.6, (v - u) / (b - a) * 100)).toFixed(2) + '%';
    const d0 = new Date(a * 864e5), months = (b - a) / 30.4, step = months > 36 ? 12 : months > 18 ? 6 : months > 9 ? 3 : 1;
    let ticks = ''; const t = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
    while (t.getUTCMonth() % step) t.setUTCMonth(t.getUTCMonth() + 1);
    for (let i = 0; i < 40 && t.getTime() / 864e5 < b; i++){ ticks += '<span style="left:' + X(t.getTime() / 864e5) + '">' + MON[t.getUTCMonth()] + (t.getUTCMonth() === 0 || step >= 6 || i === 0 ? ' ' + t.getUTCFullYear() : '') + '</span>'; t.setUTCMonth(t.getUTCMonth() + step); }
    const row = (label, inner, cls) => '<div class="pj-tl-row' + (cls ? ' ' + cls : '') + '"><span class="pj-tl-name">' + label + '</span><span class="pj-tl-track">' + inner + '<i class="pj-tl-today" style="left:' + X(today) + '"></i></span></div>';
    const bar = (u, v, cls, txt) => (u != null || v != null) ? '<b class="pj-tl-bar ' + cls + (u == null ? ' open-l' : '') + (v == null ? ' open-r' : '') + '" style="left:' + X(u == null ? a : u) + ';width:' + W(u == null ? a : u, v == null ? b : v) + '" title="' + esc(txt) + '"></b>' : '';
    return '<div class="card"><div class="card-head"><h2>Timeline</h2><span class="note"><i class="pj-key con"></i>Construction <i class="pj-key int"></i>Interiors (our window) <i class="pj-key now"></i>Today</span></div><div class="pj-tl">' +
      row('', ticks, 'pj-tl-axis') +
      (bid != null ? row('Bid date', '<b class="pj-tl-bid" style="left:' + X(bid) + '" title="Bid ' + esc(fmtDay(p.bidDate)) + '"></b><em class="pj-tl-lab" style="left:' + X(bid) + '">' + esc(fmtDay(p.bidDate)) + '</em>') : '') +
      ((cs != null || ce != null) ? row('Construction', bar(cs, ce, 'con', 'Construction ' + fmtWindow(p.start, p.finish))) : '') +
      ((is != null || ie != null) ? row('Interiors', bar(is, ie, 'int', 'Interiors ' + fmtWindow(p.intStart, p.intEnd))) : '') + '</div></div>';
  }
  function kvRows(rows){ return rows.map((r) => '<div class="kv"><span class="pj-dim">' + esc(r[0]) + '</span><span class="pj-kvv">' + (r[1] ? r[1] : '<span class="pj-dim">—</span>') + '</span></div>').join(''); }
  function scopeCard(p){
    const l = labor(p);
    return '<div class="card"><div class="card-head"><h2>Our scope</h2></div><div>' + kvRows([
      ['Trades', esc((p.trades || []).join(', '))], ['Peak manpower', p.heads ? esc(p.heads) + ' workers' : ''], ['Weeks on site', p.weeks ? esc(p.weeks) : ''],
      ['Labor', esc(p.shop || '')], ['Prevailing wage', esc(p.prevailing || '')], ['Supervision needed', esc(p.supervision || '')],
      ['Est. labor value', l ? esc(laborText(l)) + ' <span class="pj-dim">(' + (l.rate ? '$' + l.rate : '$35–40') + '/hr × 40 hrs × ' + esc(p.weeks) + ' wks × ' + esc(p.heads) + ')</span>' : '']]) + '</div></div>';
  }
  function detailsCard(p){
    return '<div class="card"><div class="card-head"><h2>Project details</h2></div><div>' + kvRows([
      ['Address', esc([p.address, where(p)].filter(Boolean).join(', '))], ['Owner / developer', esc(p.owner || '')], ['Type', esc(p.type || '')], ['Size', esc(p.size || '')],
      ['Construction value', p.value ? esc(money(p.value)) : ''], ['Bid date', esc(fmtDay(p.bidDate))], ['Construction', esc(fmtWindow(p.start, p.finish))],
      ['Lead from', esc(p.source || '')]]) + '</div>' + (p.notes ? '<div class="pj-notes"><span class="pj-k">Notes</span>' + linkify(p.notes) + '</div>' : '') + '</div>';
  }
  function filesCard(p){
    const files = p.files || [];
    const list = files.map((f, i) => '<li class="pj-file"><a href="/_blob/' + esc(f.id) + '" target="_blank" rel="noopener">📎 ' + esc(f.name) + '</a><button type="button" class="pj-mini' + (S.armed === 'file:' + i ? ' armed' : '') + '" data-act="rmfile" data-arg="' + i + '" aria-label="Remove ' + esc(f.name) + '">' + (S.armed === 'file:' + i ? 'Click again to remove' : 'Remove') + '</button></li>').join('');
    const up = ASSETS ? '<button type="button" class="btn" data-act="pickfile"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Uploading…' : 'Attach files') + '</button><input type="file" id="pjFile" accept="application/pdf,image/*" multiple hidden>' : '<span class="sub13">Files can be attached in the portal on claude.ai.</span>';
    return '<div class="card"><div class="card-head"><h2>Files</h2><span class="note">Drawings, Dodge reports, bid invites · PDF or image, up to 20 MB</span></div>' + (list ? '<ul class="pj-files">' + list + '</ul>' : '') + '<div>' + up + '</div></div>';
  }
  function dealsCard(p){
    const deals = dealsOf(p), t = teamOf(p);
    const list = deals.map((o) => '<li class="pj-deal"><span><b>' + esc(o.contact || o.gc || o.project) + '</b><span class="pj-dim"> · ' + esc(o.trade || '') + '</span></span><span>' + esc(o.stage) + (o.value ? ' · ' + esc(money(o.value)) : '') + '</span></li>').join('');
    let form = '';
    if (S.deal){
      form = '<div class="pj-addbox"><div class="pj-form pj-form2"><label>Deal with<select data-deal="i">' + t.map((x, i) => '<option value="' + i + '"' + (String(i) === String(S.deal.i) ? ' selected' : '') + '>' + esc(x.name) + ' (' + esc(x.role) + ')</option>').join('') + '</select></label></div>' +
        '<p class="sub13">Adds a New opportunity to the Pipeline with this project\'s location, dates, trades and manpower' + (labor(p) ? ', valued at ' + esc(money(labor(p).mid)) + (labor(p).rate ? '' : ' ($37.50/hr, the middle of your $35–40 range)') : '') + '. You can change anything there.</p>' +
        '<div class="pj-actions"><button type="button" class="btn primary" data-act="savedeal">Add to Pipeline</button><button type="button" class="btn" data-act="canceldeal">Cancel</button></div></div>';
    }
    return '<div class="card"><div class="card-head"><h2>Pipeline deals</h2><span class="note">From this project</span></div>' +
      (list ? '<ul class="pj-deals">' + list + '</ul><a class="sub13" href="#pipeline">Open the Pipeline ↗</a>' : '<span class="sub13">When you start pricing with a company on this job, add it to the Pipeline from here.</span>') +
      (form || (t.length ? '<div><button type="button" class="btn" data-act="deal">+ Start a pipeline deal</button></div>' : '<span class="sub13">Add a company to the team first.</span>')) + '</div>';
  }

  // ---------- EDIT ----------
  function blank(){ return { id:null, name:'', type:'', owner:'', address:'', city:'', state:'', source:'', link:'', size:'', value:'', bidDate:'', start:'', finish:'', intStart:'', intEnd:'', trades:[], heads:'', weeks:'', rate:'', shop:'', prevailing:'', supervision:'', stage:'Spotted', next:'', nextDate:'', notes:'' }; }
  function viewEdit(){
    const f = S.draft, isNew = !f.id;
    const inp = (k, label, attrs) => '<label' + (attrs && attrs.wide ? ' class="wide"' : '') + '>' + label + '<input data-f="' + k + '" value="' + esc(f[k]) + '"' + (attrs && attrs.type ? ' type="' + attrs.type + '"' : '') + (attrs && attrs.ph ? ' placeholder="' + esc(attrs.ph) + '"' : '') + (attrs && attrs.min != null ? ' min="' + attrs.min + '" step="' + (attrs.step || 1) + '"' : '') + (attrs && attrs.req ? ' required aria-required="true"' : '') + (k === 'name' ? ' id="pjName"' : '') + ' autocomplete="off"></label>';
    const sel = (k, label, opts, wide) => '<label' + (wide ? ' class="wide"' : '') + '>' + label + '<select data-f="' + k + '"><option value="">—</option>' + opts.map((o) => opt(o, o === f[k])).join('') + '</select></label>';
    const stateSel = '<label>State<select data-f="state"><option value="">—</option><optgroup label="Your territory">' + TERR.map((s) => opt(s, s === f.state)).join('') + '</optgroup><optgroup label="Other states">' + OTHER_ST.map((s) => opt(s, s === f.state)).join('') + '</optgroup></select></label>';
    const month = (k, label) => '<label>' + label + '<input type="month" data-f="' + k + '" value="' + esc(f[k]) + '" placeholder="YYYY-MM" pattern="\\d{4}-\\d{2}"></label>';
    const trades = '<fieldset class="pj-trades wide"><legend>Trades we\'d supply</legend>' + TRADES.map((t) => '<label class="pj-check"><input type="checkbox" data-trade="' + esc(t) + '"' + ((f.trades || []).includes(t) ? ' checked' : '') + '> ' + esc(t) + '</label>').join('') + '</fieldset>';
    const grp = (title, note, body) => '<section class="pj-grp"><h3>' + title + (note ? ' <span class="sub13">' + note + '</span>' : '') + '</h3><div class="pj-form">' + body + '</div></section>';
    return '<div class="pj-top"><button type="button" class="btn" data-act="cancel">◂ ' + (isNew ? 'All projects' : 'Back to project') + '</button></div>' +
      '<form class="card pj-edit" id="pjForm" novalidate><div class="card-head"><h2>' + (isNew ? 'New project' : 'Edit project') + '</h2><span class="note">Only the name is required. Blank is fine; fill it in as you learn it.</span></div>' +
      grp('The project', '', inp('name', 'Project name *', { req:1, ph:'e.g. UT Southwestern Cancer Center', wide:1 }) + sel('type', 'Project type', TYPES) + inp('owner', 'Owner / developer', { ph:'Who is paying for it' }) + inp('source', 'Where the lead came from', { ph:'e.g. buddies at Vaughn' }) +
        inp('address', 'Street address', { ph:'If known', wide:1 }) + inp('city', 'City', { ph:'Dallas' }) + stateSel + inp('link', 'Dodge / report link', { ph:'https://' })) +
      grp('Size and value', '', inp('size', 'Size', { ph:'e.g. 450,000 SF · 12 floors' }) + inp('value', 'Construction value ($)', { type:'number', min:0, step:1000, ph:'e.g. 250000000' })) +
      grp('Dates', 'Months are close enough for the schedule.', '<label>Bid date<input type="date" data-f="bidDate" value="' + esc(f.bidDate) + '"></label>' + month('start', 'Construction start') + month('finish', 'Substantial completion') + month('intStart', 'Interiors start (framing / drywall)') + month('intEnd', 'Interiors finish')) +
      grp('Our scope', '', trades + inp('heads', 'Peak manpower', { type:'number', min:0, ph:'e.g. 60' }) + inp('weeks', 'Weeks on site', { type:'number', min:0, ph:'e.g. 26' }) + inp('rate', 'Rate ($/hr)', { type:'number', min:0, step:0.5, ph:'Blank = your $35–40 range' }) +
        sel('shop', 'Labor', ['Open shop', 'Union', 'Not known yet']) + sel('prevailing', 'Prevailing wage', ['Yes', 'No', 'Not known yet']) + sel('supervision', 'Supervision needed', ['Yes', 'No', 'Not known yet'])) +
      grp('Where we stand', '', sel('stage', 'Stage', STAGES.map((s) => s.k)) + '<label>Next step date<input type="date" data-f="nextDate" value="' + esc(f.nextDate) + '"></label>' + inp('next', 'Next step', { ph:'e.g. Call Peyton about the drywall bid', wide:1 }) +
        '<label class="wide">Notes<textarea data-f="notes" rows="4" placeholder="Anything worth remembering">' + esc(f.notes) + '</textarea></label>') +
      (isNew ? '<p class="sub13">You\'ll add the companies and people on this job on the next screen.</p>' : '') +
      (S.msg ? '<p class="pj-msg" role="alert">' + esc(S.msg) + '</p>' : '') +
      '<div class="pj-actions"><button type="submit" class="btn primary">' + (isNew ? 'Create project' : 'Save changes') + '</button><button type="button" class="btn" data-act="cancel">Cancel</button>' +
      (isNew ? '' : '<button type="button" class="btn pj-del' + (S.armed === 'project' ? ' armed' : '') + '" data-act="delete">' + (S.armed === 'project' ? 'Click again to delete this project' : 'Delete project') + '</button>') + '</div></form>';
  }

  // ---------- render + events ----------
  const H1 = document.getElementById('h-projects');
  function render(){
    const html = S.view === 'project' ? viewProject() : S.view === 'edit' ? viewEdit() : viewList();
    root.innerHTML = html;
    if (H1) H1.textContent = S.view === 'project' && byId(S.id) ? byId(S.id).name : S.view === 'edit' ? (S.draft && S.draft.id ? 'Edit project' : 'New project') : 'Projects We\'re Chasing';
    const fi = document.getElementById('pjFile'); if (fi) fi.addEventListener('change', () => onFiles(fi));
  }
  function go(view, id){ S.view = view; S.id = id || null; S.addCo = null; S.addPer = null; S.deal = null; S.armed = null; S.msg = ''; render(); const v = document.getElementById('view-projects'); if (v && v.classList.contains('active')) window.scrollTo(0, 0); }
  let armT = null;
  function arm(k){ S.armed = k; clearTimeout(armT); armT = setTimeout(() => { if (S.armed === k){ S.armed = null; render(); } }, 4000); }
  const focus = (sel) => { const el = root.querySelector(sel); if (el) el.focus(); };

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
    const act = el.dataset.act, arg = el.dataset.arg, p = byId(S.id);
    if (act === 'filter'){ S.filter = arg; render(); }
    else if (act === 'new'){ S.draft = blank(); go('edit'); focus('#pjName'); }
    else if (act === 'open') go('project', arg);
    else if (act === 'list') go('list');
    else if (act === 'edit' && p){ S.draft = Object.assign(blank(), JSON.parse(JSON.stringify(p))); go('edit', p.id); }
    else if (act === 'cancel'){ const id = S.draft && S.draft.id; S.draft = null; if (id && byId(id)) go('project', id); else go('list'); }
    else if (act === 'delete' && S.draft && S.draft.id){
      if (S.armed !== 'project'){ arm('project'); render(); return; }
      PJ = load(); const gone = byId(S.draft.id); PJ = PJ.filter((x) => x.id !== S.draft.id); save();
      if (gone && ASSETS) (gone.files || []).forEach((f) => ASSETS.delete(f.id).catch(() => {}));
      S.draft = null; go('list');
    }
    else if (act === 'stage' && p){ mutate(p.id, (x) => { x.stage = arg; }); render(); }
    else if (act === 'addco'){ S.addCo = { role:'GC / CM', q:'', pick:null, award:'Not known yet' }; S.addPer = null; render(); focus('#pjCoQ'); }
    else if (act === 'cancelco'){ S.addCo = null; render(); }
    else if (act === 'pickco'){ S.addCo.pick = arg; S.addCo.q = ''; render(); focus('[data-act="saveco"]'); }
    else if (act === 'pickfree'){ S.addCo.free = S.addCo.q.trim(); saveCompany(); }
    else if (act === 'saveco') saveCompany();
    else if (act === 'rmco' && p){ if (S.armed !== 'co:' + arg){ arm('co:' + arg); render(); return; } mutate(p.id, (x) => { x.team.splice(+arg, 1); }); S.armed = null; render(); }
    else if (act === 'opencompany' && p){ const t = teamOf(p)[+arg]; if (t && t.co) openCompany(t.co); }
    else if ((act === 'openperson' || act === 'logperson') && p){ const t = teamOf(p)[+arg]; if (t && t.co) openPerson(t.co, { name:el.dataset.name, pid:el.dataset.pid, src:el.dataset.src }, act === 'logperson' ? 'log' : null); }
    else if (act === 'more'){ if (S.more.has(arg)) S.more.delete(arg); else S.more.add(arg); render(); const b = root.querySelector('[data-act="more"][data-arg="' + arg + '"]'); if (b) b.focus(); }
    else if (act === 'addper'){ S.addPer = { i:+arg, q:'', title:'', pick:null }; S.addCo = null; render(); focus('#pjPerQ'); }
    else if (act === 'cancelper'){ S.addPer = null; render(); }
    else if (act === 'pickper' && S.addPer){ S.addPer.pick = { name:el.dataset.name, pid:el.dataset.pid, src:el.dataset.src, title:el.dataset.title }; savePerson(S.addPer.i); }
    else if (act === 'saveper') savePerson(+arg);
    else if (act === 'rmper' && p){ if (S.armed !== 'per:' + arg){ arm('per:' + arg); render(); return; } const [i, j] = arg.split(':').map(Number); mutate(p.id, (x) => { if (x.team[i]) x.team[i].people.splice(j, 1); }); S.armed = null; render(); }
    else if (act === 'pickfile'){ const fi = document.getElementById('pjFile'); if (fi) fi.click(); }
    else if (act === 'rmfile' && p){
      if (S.armed !== 'file:' + arg){ arm('file:' + arg); render(); return; }
      let gone = null; mutate(p.id, (x) => { gone = (x.files || []).splice(+arg, 1)[0]; }); if (gone && ASSETS) ASSETS.delete(gone.id).catch(() => {});
      S.armed = null; render();
    }
    else if (act === 'deal' && p){ const t = teamOf(p); let i = t.findIndex((x) => /Framing|Acoustical|Insulation/.test(x.role)); if (i < 0) i = t.findIndex((x) => x.role === 'GC / CM'); S.deal = { i: Math.max(0, i) }; render(); }
    else if (act === 'canceldeal'){ S.deal = null; render(); }
    else if (act === 'savedeal' && p) saveDeal(p);
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.f && S.draft){ S.draft[t.dataset.f] = t.value; if (S.msg){ S.msg = ''; const m = root.querySelector('.pj-msg'); if (m) m.remove(); } return; }
    if (t.dataset.add === 'q' && S.addCo){ S.addCo.q = t.value; S.addCo.pick = null; S.addCo.free = null; const sg = document.getElementById('pjCoSug'); if (sg) sg.innerHTML = sugHtml(); t.setAttribute('aria-expanded', String(!!t.value.trim())); const nt = document.getElementById('pjCoNote'); if (nt) nt.textContent = coNote(); return; }
    if (t.dataset.addp && S.addPer){ S.addPer[t.dataset.addp] = t.value; if (t.dataset.addp === 'q'){ S.addPer.pick = null; const p = byId(S.id), x = p && teamOf(p)[S.addPer.i]; const box = document.getElementById('pjCands'); if (box && x){ const cands = peopleOf(x.co).filter((c) => !(x.people || []).some((q) => norm(q.name) === norm(c.name))); const q = norm(t.value); box.innerHTML = candsHtml(q ? cands.filter((c) => norm(c.name).includes(q) || norm(c.title).includes(q)).slice(0, 8) : cands.slice(0, 8)); } } }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.trade && S.draft){ const s = new Set(S.draft.trades || []); if (t.checked) s.add(t.dataset.trade); else s.delete(t.dataset.trade); S.draft.trades = TRADES.filter((x) => s.has(x)); return; }
    if (t.dataset.f && S.draft){ S.draft[t.dataset.f] = t.value; return; }
    if (t.dataset.add && S.addCo && t.dataset.add !== 'q'){ S.addCo[t.dataset.add] = t.value; return; }
    if (t.dataset.deal && S.deal){ S.deal.i = +t.value; return; }
    if (t.dataset.team != null && S.id){ const i = +t.dataset.team, k = t.dataset.tf, v = t.value; mutate(S.id, (x) => { if (x.team[i]) x.team[i][k] = v; }); render(); const s = root.querySelector('[data-team="' + i + '"][data-tf="' + k + '"]'); if (s) s.focus(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){ if (S.addCo){ S.addCo = null; render(); focus('[data-act="addco"]'); } else if (S.addPer){ const i = S.addPer.i; S.addPer = null; render(); focus('[data-act="addper"][data-arg="' + i + '"]'); } else if (S.deal){ S.deal = null; render(); } return; }
    if (e.key === 'Enter' && e.target.id === 'pjCoQ'){ e.preventDefault(); const first = root.querySelector('#pjCoSug .pj-sugitem'); if (first) first.click(); return; }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.addp){ e.preventDefault(); if (S.addPer) savePerson(S.addPer.i); return; }
    if (e.key === 'ArrowDown' && e.target.id === 'pjCoQ'){ const first = root.querySelector('#pjCoSug .pj-sugitem'); if (first){ e.preventDefault(); first.focus(); } return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.classList && e.target.classList.contains('pj-sugitem')){ e.preventDefault(); const sib = e.key === 'ArrowDown' ? e.target.nextElementSibling : e.target.previousElementSibling; if (sib) sib.focus(); else if (e.key === 'ArrowUp') focus('#pjCoQ'); }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'pjForm') return; e.preventDefault();
    const f = S.draft; if (!f) return;
    // read every field straight from the form too, in case the browser filled one without an input event
    root.querySelectorAll('#pjForm [data-f]').forEach((el) => { f[el.dataset.f] = el.value; });
    f.name = String(f.name || '').trim();
    if (!f.name){ S.msg = 'Give the project a name.'; render(); focus('#pjName'); return; }
    const badMonth = ['start', 'finish', 'intStart', 'intEnd'].find((k) => f[k] && !isMonth(String(f[k]).trim()));
    if (badMonth){ S.msg = 'Enter months as YYYY-MM, for example 2027-03.'; render(); focus('[data-f="' + badMonth + '"]'); return; }
    const clean = (v) => typeof v === 'string' ? v.trim() : v;
    PJ = load();
    let p = f.id ? byId(f.id) : null;
    if (!p){ p = { id: uid('pj-'), created: Date.now(), team: [], files: [] }; PJ.push(p); }
    Object.keys(blank()).forEach((k) => { if (k !== 'id') p[k] = clean(f[k]); });
    ['value', 'heads', 'weeks', 'rate'].forEach((k) => { p[k] = p[k] === '' || p[k] == null ? '' : Math.max(0, +p[k] || 0) || ''; });
    p.edited = Date.now();
    if (!save()){ render(); return; }
    S.draft = null; go('project', p.id);
  });

  function saveCompany(){
    const a = S.addCo, p = byId(S.id); if (!a || !p) return;
    const d = a.pick ? directory()[a.pick] : null, name = d ? dirName(d) : (a.free || a.q || '').trim();
    if (!name){ const nt = document.getElementById('pjCoNote'); if (nt) nt.textContent = 'Type or pick a company first.'; focus('#pjCoQ'); return; }
    let dup = false;
    mutate(p.id, (x) => { x.team = teamOf(x); dup = x.team.some((t) => t.role === a.role && ((d && t.co === d.key) || norm(t.name) === norm(name))); if (!dup) x.team.push({ id: uid('t-'), role: a.role, co: d ? d.key : null, name, award: a.award, ours: 'Not contacted', people: [] }); });
    S.addCo = null; S.msg = dup ? name + ' is already on this project as ' + a.role + '.' : ''; render();
  }
  function savePerson(i){
    const a = S.addPer, p = byId(S.id); if (!a || !p) return;
    const x = teamOf(p)[i]; if (!x) return;
    let per = a.pick;
    if (!per){
      const q = String(a.q || '').trim(); if (!q){ focus('#pjPerQ'); return; }
      const hit = x.co ? peopleOf(x.co).find((c) => norm(c.name) === norm(q)) : null;
      per = hit ? { name: hit.name, pid: hit.pid, src: hit.src, title: hit.title } : { name: q, pid: '', src: '', title: '' };
    }
    const title = String(a.title || '').trim() || per.title || '';
    mutate(p.id, (y) => { const t = y.team[i]; if (!t) return; t.people = t.people || []; if (!t.people.some((q) => norm(q.name) === norm(per.name))) t.people.push({ name: per.name, title, pid: per.pid || '', src: per.src || '' }); });
    S.addPer = null; render(); focus('[data-act="addper"][data-arg="' + i + '"]');
  }
  function saveDeal(p){
    const t = teamOf(p)[S.deal ? S.deal.i : 0]; if (!t) return;
    const O = window.OPPS; if (!Array.isArray(O)){ S.msg = 'The Pipeline isn\'t loaded yet. Try again in a moment.'; render(); return; }
    const tr = p.trades || [], dw = tr.includes('Drywall') || tr.includes('Metal framing'), act = tr.includes('Acoustical ceilings');
    const trade = dw && act ? 'Drywall / ACT combined' : dw ? 'Drywall & metal framing' : act ? 'Acoustical ceilings' : tr.includes('Insulation') ? 'Insulation' : 'Other';
    const l = labor(p), d = directory()[t.co || ''] || null;
    const o = { id: uid('pj-o-'), projectId: p.id, project: p.name, gc: gcName(p), metro: p.city || '', state: p.state || '', location: [p.address, where(p)].filter(Boolean).join(', '),
      trade, heads: +p.heads || 0, weeks: +p.weeks || 0, value: l ? Math.round(l.mid) : 0, next: p.next || '', stage: 'New', opened: todayISO(), source: 'Projects',
      contact: t.name, projectType: p.type || '', timeline: fmtWindow(p.intStart, p.intEnd) ? 'Interiors ' + fmtWindow(p.intStart, p.intEnd) : '',
      start: isMonth(p.intStart) ? p.intStart + '-01' : '', end: isMonth(p.intEnd) ? new Date(monthEnd(p.intEnd) * 864e5).toISOString().slice(0, 10) : '',
      notes: 'Started from the Projects tab (' + t.role + ': ' + t.name + ').' + (l && !l.rate ? ' Value estimated at $37.50/hr, the middle of the $35–40 range.' : '') };
    if (d && d.cn) o.co = d.key;
    O.push(o);
    try { localStorage.setItem('bdp-opps', JSON.stringify(O)); } catch (e) { O.pop(); S.msg = 'Could not save to the Pipeline.'; render(); return; }
    if (typeof window.renderPipeline === 'function'){ try { window.renderPipeline(); } catch (e) {} }
    S.deal = null; S.msg = 'Added to the Pipeline as a New opportunity with ' + t.name + '.'; render();
  }

  // ---------- links from the rest of the portal ----------
  window.BDP_PROJECTS = {
    list: () => load(),
    forCompany: (k) => load().filter((p) => teamOf(p).some((t) => t.co === k)).map((p) => ({ id: p.id, name: p.name, stage: p.stage || 'Spotted', color: stageOf(p.stage).c, roles: teamOf(p).filter((t) => t.co === k).map((t) => t.role), ours: (teamOf(p).find((t) => t.co === k) || {}).ours || 'Not contacted', where: where(p), window: fmtWindow(p.intStart, p.intEnd) })),
    refresh: () => { PJ = load(); if (S.view !== 'edit' && !S.addCo && !S.addPer && idle()) render(); },
    open: (id) => { if (!byId(id)){ PJ = load(); } location.hash = '#projects'; setTimeout(() => go('project', id), 20); }
  };
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('[data-open-project]'); if (!a) return; e.preventDefault(); window.BDP_PROJECTS.open(a.getAttribute('data-open-project')); });
  const idle = () => { const a = document.activeElement; return !(a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  if (window.BDP_SYNC && window.BDP_SYNC.onRemote){
    window.BDP_SYNC.onRemote(KEY, () => { PJ = load(); if (S.view !== 'edit' && !S.addCo && !S.addPer && idle()) render(); });
    window.BDP_SYNC.onRemote('bdp-opps', () => { if (S.view === 'project' && !S.deal && idle()) render(); });
    window.BDP_SYNC.onRemote('bdp-cnet-logs', () => { if (S.view === 'project' && !S.addCo && !S.addPer && idle()) render(); });
  }
  // contacts logged in Client Networks show here when you come back to the tab
  window.addEventListener('hashchange', () => { if (location.hash === '#projects' && S.view !== 'edit' && !S.addCo && !S.addPer){ PJ = load(); render(); } });
  render();
})();
