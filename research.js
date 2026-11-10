/* Apollo research card on a project. "Research with Apollo" runs FREE lookups only: it finds each company on the
   project team in Apollo and lists the people there who run field labor or buyout, nearest the job first. Nothing
   costs credits until you tick people and press "Get names + LinkedIn", which shows the credit count first.
   Enriched people join that company on the project team with their LinkedIn, email and city. Companies that are not
   in Client Networks yet are listed for Claude to research and add (ask in chat: "add my queued companies"). */
(function(){
  'use strict';
  const SERVER = 'Apollo.io', PKEY = 'bdp-projects';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const STATES = { AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DC:'District of Columbia', DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming' };
  // who buys or schedules field labor
  const TITLES = ['superintendent', 'general superintendent', 'project manager', 'senior project manager', 'project executive', 'construction manager', 'procurement', 'buyer', 'purchasing', 'vendor manager', 'operations manager', 'vice president operations', 'director of construction', 'self perform'];
  const MAX_COS = 8, PER_CO = 12;

  let MCP = null, MCP_STATE = 'checking';
  const RUN = {}; // project id -> { busy, msg, pick:Set }

  if (window.claude && typeof window.claude.use === 'function') window.claude.use('mcp').then((m) => { MCP = m || null; MCP_STATE = m ? 'ready' : 'none'; refresh(); }, () => { MCP_STATE = 'none'; refresh(); });
  else MCP_STATE = 'none';

  function load(){ try { const v = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function mutate(id, fn){
    const list = load(), p = list.find((x) => x && x.id === id); if (!p) return null;
    fn(p); p.edited = Date.now();
    try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch (e) { return null; }
    try { window.dispatchEvent(new Event('bdp:projects')); } catch (e) {}
    return p;
  }
  function refresh(){ if (window.BDP_PROJECTS && window.BDP_PROJECTS.refresh) window.BDP_PROJECTS.refresh(); }
  const st = (id) => RUN[id] || (RUN[id] = { busy: false, msg: '', pick: new Set() });
  const inCN = (k) => !!(k && window.CNET && window.CNET.hasCompany && window.CNET.hasCompany(k));

  // one clear sentence per failure, with the fix
  function why(e){
    const c = e && e.code;
    if (c === 'server_not_connected' || c === 'selection_required') return 'Apollo isn’t connected for this page. Add Apollo.io in claude.ai Settings → Connectors, then try again.';
    if (c === 'needs_reauth') return 'Apollo needs to be reconnected. Reconnect Apollo.io in claude.ai Settings → Connectors.';
    if (c === 'not_in_manifest' || c === 'consent_required') return 'Apollo wasn’t allowed for this page. Allow it from the artifact’s Permissions menu, then try again.';
    if (c === 'blocked_by_policy') return 'Your organization blocks this Apollo tool.';
    if (c === 'server_unavailable' || c === 'rate_limited') return 'Apollo didn’t answer. Wait a minute and try again.';
    if (c === 'tool_error') return 'Apollo reported an error: ' + (e.message || 'unknown') + '.';
    return 'Apollo research failed (' + (c || 'error') + '). Try again in a moment.';
  }
  async function call(tool, input){ const r = await MCP.callTool(SERVER, tool, input); return r && r.payload; }

  // ---------- free research ----------
  async function research(id){
    const s = st(id); if (s.busy || !MCP) return;
    const p0 = load().find((x) => x.id === id); if (!p0) return;
    const team = (p0.team || []).slice(0, MAX_COS);
    if (!team.length){ s.msg = 'Add at least one company to the project team first.'; refresh(); return; }
    s.busy = true; s.msg = 'Looking up ' + team.length + ' compan' + (team.length === 1 ? 'y' : 'ies') + ' in Apollo (free)…'; refresh();
    const stateName = STATES[String(p0.state || '').toUpperCase()] || '';
    const out = [];
    try {
      for (const t of team){
        const row = { team: t.id || t.name, name: t.name, orgId: '', orgName: '', domain: '', total: 0, near: !!stateName, people: [] };
        const look = await call('apollo_organizations_lookup', { q_organization_fuzzy_name: t.name, per_page: 5, display_mode: 'fuzzy_select_mode' });
        const orgs = (look && look.organizations) || [];
        const org = orgs.find((o) => norm(o.name) === norm(t.name)) || orgs[0];
        if (!org){ out.push(row); continue; }
        Object.assign(row, { orgId: org.id, orgName: org.name, domain: org.domain || '' });
        const base = { organization_ids: [org.id], person_titles: TITLES, per_page: PER_CO };
        let res = stateName ? await call('apollo_mixed_people_api_search', Object.assign({ person_locations: [stateName + ', US'] }, base)) : null;
        if (!res || !(res.people || []).length){ row.near = false; res = await call('apollo_mixed_people_api_search', base); }
        row.total = (res && res.total_entries) || 0;
        row.people = ((res && res.people) || []).map((x) => ({ id: x.id, first: x.first_name || '', last: x.last_name_obfuscated || '', title: x.title || '', email: !!x.has_email }));
        out.push(row);
        s.msg = 'Researched ' + out.length + ' of ' + team.length + '…'; refresh();
      }
      mutate(id, (p) => {
        p.research = Object.assign({}, p.research, { status: 'done', at: new Date().toISOString(), companies: out });
        if (p.stage === 'Spotted') p.stage = 'Researching';
        if (p.next === 'Research with Apollo') p.next = 'Pick the people to reach and get their LinkedIn';
      });
      const n = out.reduce((a, r) => a + r.people.length, 0);
      s.msg = 'Found ' + n + ' people across ' + out.filter((r) => r.orgId).length + ' compan' + (out.length === 1 ? 'y' : 'ies') + '. No credits used. Tick the ones you want and get their names + LinkedIn.';
    } catch (e) {
      console.warn('apollo research', e); s.msg = why(e);
      if (out.length) mutate(id, (p) => { p.research = Object.assign({}, p.research, { status: 'partial', at: new Date().toISOString(), companies: out }); });
    }
    s.busy = false; refresh();
  }

  // ---------- paid step: only the people you picked ----------
  async function enrich(id){
    const s = st(id); if (s.busy || !MCP || !s.pick.size) return;
    const ids = Array.from(s.pick);
    s.busy = true; s.msg = 'Getting names and LinkedIn for ' + ids.length + ' people…'; refresh();
    const got = [];
    try {
      for (let i = 0; i < ids.length; i += 10){
        const res = await call('apollo_people_bulk_match', { details: ids.slice(i, i + 10).map((x) => ({ id: x })) });
        ((res && res.matches) || []).forEach((m) => { if (m && m.id) got.push(m); });
      }
    } catch (e) { console.warn('apollo enrich', e); s.msg = why(e) + (got.length ? ' (' + got.length + ' came back before it stopped.)' : ''); }
    if (got.length){
      mutate(id, (p) => {
        const R = p.research || {};
        got.forEach((m) => {
          const row = (R.companies || []).find((r) => (r.people || []).some((x) => x.id === m.id)); if (!row) return;
          const rp = row.people.find((x) => x.id === m.id); rp.done = true; rp.name = m.name;
          const t = (p.team || []).find((x) => (x.id || x.name) === row.team || x.name === row.name); if (!t) return;
          t.people = t.people || [];
          if (t.people.some((q) => norm(q.name) === norm(m.name))) return;
          t.people.push({ name: m.name, title: m.title || rp.title, linkedin: m.linkedin_url ? String(m.linkedin_url).replace(/^http:/, 'https:') : '', email: m.email || '',
            emailStatus: m.email_status || '', city: [m.city, m.state].filter(Boolean).join(', '), src: 'apollo', apolloId: m.id, pid: '' });
        });
        R.credits = (R.credits || 0) + got.length; p.research = R;
      });
      s.pick.clear();
      s.msg = 'Added ' + got.length + ' people to the project team (' + got.length + ' credit' + (got.length === 1 ? '' : 's') + ').';
    }
    s.busy = false; refresh();
  }

  function queueCN(id, name){
    mutate(id, (p) => { const R = p.research || (p.research = {}); R.cnQueue = R.cnQueue || []; if (!R.cnQueue.includes(name)) R.cnQueue.push(name); });
    st(id).msg = name + ' is queued. Ask Claude in chat to “add my queued companies to Client Networks”.'; refresh();
  }

  // ---------- card ----------
  function card(p){
    const s = st(p.id), R = p.research || {}, rows = R.companies || [];
    const ready = MCP_STATE === 'ready';
    const btnLabel = s.busy ? 'Working…' : rows.length ? 'Run research again' : 'Research with Apollo';
    const runBtn = ready ? '<button type="button" class="btn' + (rows.length ? '' : ' primary') + '" data-rs="run" data-id="' + esc(p.id) + '"' + (s.busy ? ' disabled' : '') + '>' + btnLabel + '</button>' : '';
    const need = R.status === 'needed' && !rows.length;
    const intro = !ready
      ? '<p class="sub13">' + (MCP_STATE === 'checking' ? 'Connecting to Apollo…' : 'Apollo research runs in the portal on claude.ai, with Apollo.io connected.') + '</p>'
      : rows.length ? '<p class="sub13">Last run ' + esc(new Date(R.at).toLocaleString(window.BDP_LOCALE || 'en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })) + '. Searching is free; only “Get names + LinkedIn” uses credits' + (R.credits ? ' (' + R.credits + ' used on this project so far)' : '') + '.</p>'
      : '<p class="sub13">Finds each company on the team in Apollo and lists its superintendents, PMs and buyers' + (p.state ? ' in ' + esc(STATES[String(p.state).toUpperCase()] || p.state) + ' first' : '') + '. Free: no credits until you pick people.</p>';
    const body = rows.map((r) => {
      const t = (p.team || []).find((x) => (x.id || x.name) === r.team || x.name === r.name);
      const cn = t && inCN(t.co);
      const queued = (R.cnQueue || []).includes(r.name);
      const cnTag = cn ? '<span class="rs-tag ok">In Client Networks</span>' : queued ? '<span class="rs-tag">Queued for Client Networks</span>' : '<button type="button" class="pj-mini" data-rs="queue" data-id="' + esc(p.id) + '" data-name="' + esc(r.name) + '">Queue for Client Networks</button>';
      if (!r.orgId) return '<div class="rs-co"><div class="rs-cohead"><b>' + esc(r.name) + '</b><span class="pj-dim">Not found in Apollo</span></div></div>';
      const ppl = r.people.length ? '<ul class="rs-ppl">' + r.people.map((x) => {
        const on = s.pick.has(x.id);
        return '<li><label class="rs-pick' + (x.done ? ' done' : '') + '"><input type="checkbox" data-rs="pick" data-id="' + esc(p.id) + '" value="' + esc(x.id) + '"' + (on ? ' checked' : '') + (x.done || s.busy ? ' disabled' : '') + '>' +
          '<span class="rs-n">' + esc(x.done ? x.name : x.first + ' ' + x.last) + '</span><span class="pj-dim">' + esc(x.title) + '</span>' + (x.done ? '<span class="rs-tag ok">On team</span>' : '') + '</label></li>';
      }).join('') + '</ul>' : '<p class="sub13">No superintendents, PMs or buyers listed in Apollo.</p>';
      return '<div class="rs-co"><div class="rs-cohead"><b>' + esc(r.orgName || r.name) + '</b>' + (r.domain ? '<span class="pj-dim">' + esc(r.domain) + '</span>' : '') +
        '<span class="pj-dim">' + (r.near ? 'near the job' : 'company-wide') + ' · ' + r.total + ' match' + (r.total === 1 ? '' : 'es') + '</span>' + cnTag + '</div>' + ppl + '</div>';
    }).join('');
    const n = s.pick.size;
    const pay = rows.length && ready ? '<div class="rs-pay"><button type="button" class="btn primary" data-rs="enrich" data-id="' + esc(p.id) + '"' + (!n || s.busy ? ' disabled' : '') + '>Get names + LinkedIn' + (n ? ' for ' + n : '') + '</button><span class="sub13">' + (n ? 'Uses about ' + n + ' Apollo credit' + (n === 1 ? '' : 's') + '.' : 'Tick people above first.') + '</span></div>' : '';
    return '<div class="card rs-card' + (need ? ' rs-need' : '') + '"><div class="card-head"><h2>Research' + (need ? ' <span class="rs-tag warn">Needs research</span>' : '') + '</h2>' + runBtn + '</div>' +
      intro + body + pay + (s.msg ? '<p class="pj-msg" role="status">' + esc(s.msg) + '</p>' : '') + '</div>';
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-rs]'); if (!el) return;
    const a = el.dataset.rs, id = el.dataset.id;
    if (a === 'run') research(id);
    else if (a === 'enrich') enrich(id);
    else if (a === 'queue') queueCN(id, el.dataset.name);
  });
  document.addEventListener('change', (e) => {
    const el = e.target; if (!el.dataset || el.dataset.rs !== 'pick') return;
    const s = st(el.dataset.id); if (el.checked) s.pick.add(el.value); else s.pick.delete(el.value);
    const btn = document.querySelector('[data-rs="enrich"][data-id="' + CSS.escape(el.dataset.id) + '"]'), note = btn && btn.nextElementSibling, n = s.pick.size;
    if (btn){ btn.disabled = !n || s.busy; btn.textContent = 'Get names + LinkedIn' + (n ? ' for ' + n : ''); }
    if (note) note.textContent = n ? 'Uses about ' + n + ' Apollo credit' + (n === 1 ? '' : 's') + '.' : 'Tick people above first.';
  });

  window.BDP_RESEARCH = { card };
  refresh();
})();
