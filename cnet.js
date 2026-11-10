(function(){
  'use strict';
  // One entry per client company. Acousti's data still comes from the original CNET_ROSTER / CNET_RICH / CNET_COMPANY.
  const COS = Object.assign({}, window.CNET_COMPANIES || {});
  if (window.CNET_ROSTER && !COS.acousti) COS.acousti = { roster: window.CNET_ROSTER, rich: window.CNET_RICH || {}, company: window.CNET_COMPANY || {},
    short: 'Acousti', logo: 'img/cnet/acousti-logo.png', top: 'jason-taylor', ops: 'bill-carballo', hr: 'stephen-langston',
    exec: ['jason-taylor','bill-carballo','stephan-veilleux','gregg-hunter','sean-cusack'],
    mapTitle: 'Acousti · Southeast Org Map', mapTab: 'SE Org Map', scope: 'leadership + project managers in your 9 states',
    regions: ['Corporate','Central Florida','North Florida','Panhandle','Alabama','Tennessee','Carolinas','Georgia','Tampa Bay','Southwest Florida','South Florida','Florida · office TBD'] };
  const CO_KEYS = Object.keys(COS).sort((a, b) => (a === 'acousti' ? -1 : b === 'acousti' ? 1 : 0));
  let K, C, ROSTER, RICH, CO, P, LOGO, REGIONS, SHORT;

  // ---------- Everyone the BusDev Map knew about is on a Client Networks roster (the map tab is retired). ----------
  // People from the map research join their company here; people added by hand join in mergeAdded(). mapKey
  // ("company__mapPersonId") is how the map keyed saved LinkedIn links, personal notes and its old outreach log.
  const nmx = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z]/g, '');
  const ends = (s) => { const w = String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z\s]/g, ' ').trim().split(/\s+/); return w.length > 1 ? w[0] + '|' + w[w.length - 1] : ''; };
  const samePerson = (a, b) => nmx(a) === nmx(b) || (!!ends(a) && ends(a) === ends(b));
  const slugx = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'person';
  const RX_LEAD = /\b(chief|ceo|coo|cfo|cso|president|vice president|vp|svp|evp|director|managing|general manager|partner|owner|founder|chairman|head of|division manager|department manager|operations manager)\b/i;
  const groupOf = (t) => RX_LEAD.test(t || '') ? 'leadership' : /super|foreman|field|production|supervisor|installation|site/i.test(t || '') ? 'field' : /project manager|estimat|engineer|precon|project director|project executive|purchasing|procurement/i.test(t || '') ? 'pm' : 'staff';
  const METRO_RX = [
    [/houston|katy|\bspring\b|cypress|tomball|sugar land|woodlands|pearland|conroe|baytown/, 'Houston'],
    [/dallas|coppell|fort worth|arlington|plano|irving|frisco|denton|grapevine|mckinney|mesquite|richardson|dfw/, 'Dallas–Fort Worth'],
    [/fort myers|cape coral|naples|bonita|estero/, 'Southwest Florida'], [/san antonio|new braunfels/, 'San Antonio'], [/austin|buda|round rock/, 'Austin'],
    [/harlingen|mcallen|brownsville|edinburg|rio grande/, 'Rio Grande Valley'], [/atlanta|marietta|alpharetta|kennesaw|norcross|savannah|augusta/, 'Georgia'],
    [/nashville|gallatin|knoxville|memphis|chattanooga|franklin/, 'Tennessee'], [/charlotte|concord|huntersville|matthews/, 'Charlotte'],
    [/raleigh|garner|durham|cary|high point|greensboro|winston|apex|wake forest/, 'Raleigh / Triad'], [/greenville|spartanburg|charleston|columbia|hilton head|myrtle/, 'South Carolina'],
    [/new orleans|metairie|baton rouge|lafayette|kenner|lake charles|monroe|shreveport/, 'Louisiana'], [/west palm|palm beach|boca|lake worth|jupiter|delray|boynton/, 'Palm Beach'],
    [/fort lauderdale|lauderdale|pompano|miami|hollywood|davie|plantation|sunrise|coral|doral|hialeah|deerfield/, 'South Florida'],
    [/tampa|palmetto|sarasota|st\.? pete|clearwater|bradenton|lakeland/, 'Tampa Bay'], [/orlando|kissimmee|sanford|winter park/, 'Central Florida'],
    [/jacksonville|gainesville|tallahassee|ocala/, 'North Florida'], [/pensacola|destin|panama city/, 'Panhandle'], [/birmingham|huntsville|mobile|montgomery/, 'Alabama']];
  const ST_FULL = { TX:'Texas', FL:'Florida', GA:'Georgia', AL:'Alabama', MS:'Mississippi', LA:'Louisiana', NC:'North Carolina', SC:'South Carolina', TN:'Tennessee' };
  function regionIn(c, text, title, group){
    const regs = c.regions || (c.regions = []), has = (r) => regs.includes(r), raw = String(text || ''), t = raw.toLowerCase();
    if (/\b(chief|ceo|coo|cfo|chairman|founder|owner)\b|^president|^co-founder|executive vice president|^evp/i.test(title || '') && has('Corporate')) return 'Corporate';
    for (const [rx, name] of METRO_RX){ if (rx.test(t) && has(name)) return name; }
    if (/\bhq\b|headquarters|corporate/i.test(raw) && has('Corporate')) return 'Corporate';
    const st = Object.keys(ST_FULL).find((code) => new RegExp('\\b' + code + '\\b').test(raw) || t.indexOf(ST_FULL[code].toLowerCase()) >= 0);
    if (st && has(ST_FULL[st])) return ST_FULL[st];
    if (st && /Carolina/.test(ST_FULL[st]) && has('Carolinas')) return 'Carolinas';
    const fn = { leadership:'Leadership', pm:'Project Management & Estimating', field:'Field Operations', staff:'Office & Support' }[group];
    if (fn && has(fn)) return fn;
    if (!has('Office not confirmed')) regs.push('Office not confirmed');
    return 'Office not confirmed';
  }
  function uniqId(c, base){ let id = base, n = 2; while ((c.roster || []).some((p) => p.id === id)) id = base + '-' + (n++); return id; }
  (function mergeMapPeople(){
    const B = window.BDMAP; if (!B || !B.COMPANIES) return;
    B.COMPANIES.forEach((e) => {
      const c = COS[e.key]; if (!c) return;
      c.roster = c.roster || []; c.rich = c.rich || {};
      const br = {}; (e.branches || []).forEach((b) => { br[b.id] = b; });
      (e.people || []).forEach((mp) => {
        if (!mp || !mp.name) return;
        const key = e.key + '__' + mp.id, hit = c.roster.find((p) => samePerson(p.name, mp.name));
        if (hit){ if (!hit.mapKey) hit.mapKey = key; return; }
        const b = br[mp.branchId] || {}, g = groupOf(mp.title), id = uniqId(c, slugx(mp.name));
        const li = (String((mp.linkedin || '') + ' ' + (mp.link || '') + ' ' + (mp.note || '')).match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"')]+/) || [])[0] || '';
        c.roster.push({ id, name: mp.name, title: mp.title || '', city: String(b.name || '').replace(/\s*\([^)]*\)/g, '').trim(), group: g,
          region: regionIn(c, [b.name, b.address].filter(Boolean).join(' '), mp.title, g), li, email: '', since: '', prior: [],
          conf: 'From our company research' + (mp.evidence ? ' (' + mp.evidence + ')' : ''), mapKey: key, fromMap: true });
        const note = mp.note || mp.bio || '';
        if (note && !c.rich[id]) c.rich[id] = { career: [['Now', mp.title || '', c.short || '']], note: String(note).slice(0, 240), insights: [] };
      });
    });
  })();
  function useCo(k){
    if (!COS[k]) k = CO_KEYS[0];
    K = k; C = COS[k]; ROSTER = C.roster || []; RICH = C.rich || {}; CO = C.company || {}; LOGO = C.logo || ''; SHORT = C.short || CO.name || k;
    REGIONS = (C.regions || []).filter((r) => ROSTER.some((p) => p.region === r));
    ROSTER.forEach((p) => { if (!REGIONS.includes(p.region)) REGIONS.push(p.region); });
    P = {}; ROSTER.forEach((p) => { P[p.id] = p; });
    const h = document.getElementById('h-network'); if (h) h.textContent = (CO.name ? SHORT : k) + ' Relationship Network';
    const sb = document.querySelector('#view-network .head .sub'); if (sb) sb.textContent = 'Everyone at ' + SHORT + ' in your territory, how they connect, and how warm each relationship is. Click a person to open their contact profile.';
  }
  try { useCo(localStorage.getItem('bdp-cnet-co') || CO_KEYS[0]); } catch (e) { useCo(CO_KEYS[0]); }
  const logoImg = (size, alt) => LOGO ? '<img src="'+LOGO+'" alt="'+(alt ? esc(SHORT)+' logo' : '')+'" style="width:'+size+'px;height:'+size+'px;object-fit:contain">' : '<span class="cn-cond" style="font-size:'+Math.round(size*0.36*Math.min(1, 4/Math.max(1,(C.mono || ini(SHORT)).length)))+'px;color:#13253D">'+esc(C.mono || ini(SHORT))+'</span>';
  const TABS = ['dashboard','network','connect','insights'];
  const nm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

  // ---------- contact model ----------
  const TYPES = ['Call','Email','In-person meeting','Lunch / coffee','Site visit','Golf / event'];
  // Trust value of each channel: how much one contact of this kind moves a relationship.
  const CH = {'Email':0.5,'Call':1.0,'Site visit':1.3,'In-person meeting':1.4,'Lunch / coffee':1.6,'Golf / event':1.8};
  const DURS = [{k:'u5',l:'Under 5 min',w:0.85,m:3},{k:'5-15',l:'5–15 min',w:0.95,m:10},{k:'15-30',l:'15–30 min',w:1,m:22},{k:'30-60',l:'30–60 min',w:1.08,m:45},{k:'60p',l:'60+ min',w:1.15,m:75}];
  const FEELS = [{v:2,l:'Very positive',h:'#E8452C'},{v:1,l:'Positive',h:'#F5A08C'},{v:0,l:'Neutral',h:'#8A97AB'},{v:-1,l:'Negative',h:'#8CC8F5'},{v:-2,l:'Very negative',h:'#2F7FD8'}];
  const STAGES = [{min:80,l:'Champion',c:'#E8452C',t:'var(--cn-champ)'},{min:60,l:'Trusted',c:'#F2804A',t:'var(--cn-trust)'},{min:40,l:'Warm',c:'#F2C14E',t:'var(--cn-warm)'},{min:0,l:'Cold',c:'#5AA9F0',t:'var(--cn-cold)'}];
  const feelOf = (v) => FEELS.find((f) => f.v === v) || FEELS[2];
  const durOf = (k) => DURS.find((d) => d.k === k) || DURS[2];
  const stageOf = (x) => STAGES.find((s) => x >= s.min);
  function score(t){
    const ch = CH[t.type] || 1;
    const dw = t.type === 'Email' ? 1 : durOf(t.duration).w;
    const f = Number(t.feel) || 0;
    const presence = f >= 0 ? 0.12 * Math.max(0, ch - 0.5) : 0; // credit for showing up in person
    return f * ch * dw + presence;
  }
  const dayNum = (iso) => { const p = iso.split('-'); return Date.UTC(+p[0], +p[1]-1, +p[2]) / 86400000; };
  const todayISO = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (iso) => { const p = iso.split('-'); return MON[+p[1]-1]+' '+(+p[2])+', '+p[0]; };
  function sorted(list){ return [...list].sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created||0)-(b.created||0)); }
  // Trust builds up and saturates (max ±3); between contacts it fades toward neutral (60-day half-life).
  function walk(list, until){
    let W = 0, last = null; const pts = [];
    sorted(list).forEach((t) => {
      const d = dayNum(t.date); if (until != null && d > until) return;
      if (last !== null) W *= Math.pow(0.5, Math.max(0, d - last) / 60);
      const s = score(t);
      W = W + 0.35 * s * (1 - Math.sign(s) * W / 3);
      W = Math.max(-3, Math.min(3, W)); last = d;
      pts.push({ d, x: idx(W), t });
    });
    return { W, last, pts };
  }
  const idx = (W) => Math.max(0, Math.min(100, Math.round(50 + W / 3 * 50)));
  function warmthAt(list, day){ const w = walk(list, day); if (!w.pts.length) return null; return idx(w.W * Math.pow(0.5, Math.max(0, day - w.last) / 60)); }
  function summary(id){
    const list = S.logs.filter((t) => t.contact === id && (t.company || 'acousti') === K);
    const today = dayNum(todayISO());
    if (!list.length) return { list, now:null, st:null, trend:'No contacts yet', tc:'var(--dim)', days:null };
    const now = warmthAt(list, today), before = warmthAt(list, today - 30);
    const diff = now - (before == null ? 50 : before);
    const trend = diff > 4 ? '▲ Warming' : diff < -4 ? '▼ Cooling' : '► Steady';
    const tc = diff > 4 ? '#F5A08C' : diff < -4 ? '#8CC8F5' : 'var(--muted)';
    return { list, now, st: stageOf(now), trend, tc, days: Math.round(today - Math.max(...list.map((t) => dayNum(t.date)))) };
  }

  // ---------- org chart inference ----------
  const isLeader = (p) => p.group === 'leadership';
  const isRegionalLeader = (p) => isLeader(p) && p.region !== 'Corporate';
  function bossOf(p){
    const TOP = P[C.top] ? C.top : null, OPS = P[C.ops] ? C.ops : TOP, HEAD = TOP || OPS;
    if (!p || !HEAD || p.id === HEAD || /Chairman/i.test(p.title)) return [];
    if (p.id === OPS) return TOP && TOP !== OPS ? [TOP] : [];
    if (p.region === 'Corporate'){
      if (/Chief Financial|Counsel|Sales|Business Development|Chief Human/i.test(p.title)) return [HEAD];
      if (/Human Resources Director/i.test(p.title)) return P[C.hr] ? [C.hr] : [HEAD];
      return [OPS];
    }
    if (isRegionalLeader(p)) return [OPS];
    const leaders = ROSTER.filter((x) => x.region === p.region && isRegionalLeader(x))
      .sort((a,b) => (/Senior Vice|SVP/i.test(a.title) ? 1 : 0) - (/Senior Vice|SVP/i.test(b.title) ? 1 : 0));
    return leaders.length ? leaders.slice(0,2).map((x) => x.id) : (P[C.ops] ? [C.ops] : P[C.top] ? [C.top] : []);
  }
  const teamOf = (p) => ROSTER.filter((x) => bossOf(x).includes(p.id)).map((x) => x.id);
  function peersOf(p){
    const boss = bossOf(p), team = teamOf(p);
    let pool;
    if (p.region === 'Corporate') pool = ROSTER.filter((x) => x.region === 'Corporate');
    else if (isRegionalLeader(p)) pool = ROSTER.filter((x) => (x.region === p.region) || (isRegionalLeader(x)));
    else pool = ROSTER.filter((x) => x.region === p.region);
    return pool.filter((x) => x.id !== p.id && !boss.includes(x.id) && !team.includes(x.id))
      .sort((a,b) => (a.region === p.region ? 0 : 1) - (b.region === p.region ? 0 : 1) || (isLeader(b)?1:0) - (isLeader(a)?1:0)).map((x) => x.id);
  }
  function chainOf(p){ const out = []; let cur = p; for (let i = 0; i < 3; i++){ const b = bossOf(cur); if (!b.length) break; b.forEach((id) => { if (!out.includes(id)) out.push(id); }); cur = P[b[0]]; } return out; }

  // ---------- state ----------
  const S = { view:'org', pid:null, tab:'dashboard', region:null, logs:[], db:null, canWrite:true, status:'', draft:{ type:'Call', dur:'5-15', feel:null, date:todayISO() }, armed:null, saving:false, msg:'', sel:new Set(), phRegion:null, phMsg:'', photoMsg:'', job:null, jobMsg:'', jobArmed:null, jobBusy:0, stOpen:null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ini = (n) => String(n||'?').replace(/\(.*?\)/g, ' ').replace(/[^A-Za-z0-9' .-]/g, ' ').split(/\s+/).filter(Boolean).slice(0,2).map((w) => w[0].toUpperCase()).join('');
  const GONE = { retired: 'Retired', left: 'No longer with ' };
  const goneTxt = (p) => p && p.status ? (p.status === 'left' ? GONE.left + SHORT : GONE.retired) : '';
  const goneTag = (p) => p && p.status ? ' <span class="cn-gone">'+esc(p.status === 'left' ? 'Left company' : 'Retired')+'</span>' : '';
  const goneCss = (p) => p && p.status ? 'opacity:.5;filter:grayscale(1);' : '';
  const face = (p) => p && p.photo ? '<img src="'+esc(p.photo)+'" alt="">' : esc(ini(p ? p.name : '?'));
  const ring = (id, base) => { const s = summary(id); return s.st ? 'box-shadow:0 0 0 3px var(--bg),0 0 0 7px '+s.st.c+';' : (base || ''); };

  // ---------- in-view navigation (the portal owns the URL hash) ----------
  function go(view, pid){ S.view = view; S.pid = pid || null; S.armed = null; S.msg = ''; render(); const top = document.getElementById('view-network'); if (top && top.classList.contains('active')) window.scrollTo(0, 0); }

  // ---------- geometry helpers ----------
  function lineDiv(x1, y1, x2, y2, h, c, o){
    const dx = x2 - x1, dy = y2 - y1, w = Math.sqrt(dx*dx + dy*dy), a = Math.atan2(dy, dx) * 180 / Math.PI;
    return '<div class="cn-ln" style="left:'+x1+'px;top:'+(y1 - h/2)+'px;width:'+w+'px;height:'+h+'px;background:'+c+';opacity:'+o+';transform:rotate('+a+'deg)"></div>';
  }
  function fitStages(){
    document.querySelectorAll('#cnet .cn-stagewrap').forEach((w) => {
      const st = w.querySelector('.cn-stage'); if (!st) return;
      const W = +st.dataset.w, H = +st.dataset.h; if (!w.clientWidth) return; const s = Math.min(1, w.clientWidth / W);
      st.style.transform = 'scale(' + s + ')'; w.style.height = (H * s) + 'px';
    });
  }
  // ---------- ORG MAP ----------
  function viewOrg(){
    const W = 1080, H = 1000, CX = 540, CY = 520, RB = [330, 300], R1 = [430, 385], R2 = [492, 438];
    const byReg = {}; REGIONS.forEach((r) => { byReg[r] = []; });
    ROSTER.forEach((p) => { (byReg[p.region] = byReg[p.region] || []).push(p); });
    const pt = (r, a) => [CX + r[0]*Math.cos(a), CY + r[1]*Math.sin(a)];
    let lines = '', nodes = '';
    REGIONS.forEach((rn, i) => {
      const a = -Math.PI/2 + i * 2*Math.PI / REGIONS.length;
      const [bx, by] = pt(RB, a); const ppl = byReg[rn] || []; const on = S.region === rn; const dim = S.region && !on;
      lines += lineDiv(CX, CY, bx, by, 3, '#F27A1A', dim ? 0.4 : 1);
      nodes += '<button type="button" class="cn-bub cn-cond" data-act="region" data-arg="'+esc(rn)+'" aria-label="'+esc(rn)+' region, '+ppl.length+' people" style="left:'+(bx-58)+'px;top:'+(by-58)+'px;width:116px;height:116px;flex-direction:column;gap:2px;padding:8px;border:2px solid '+(on?'#F27A1A':'#4A6690')+';background:'+(on?'#1E3556':'#13253D')+';font-size:15px;line-height:1.05">'+esc(rn)+'<span style="font-size:20px;color:#F27A1A">'+ppl.length+'</span></button>';
      const shown = ppl.length > 8 ? ppl.slice(0,7) : ppl.slice(0,8), extra = ppl.length - shown.length;
      const slots = shown.map((p) => ({ p })).concat(extra > 0 ? [{ more: extra }] : []);
      [[slots.slice(0,4), R1], [slots.slice(4), R2]].forEach(([row, R]) => row.forEach((s, k) => {
        const ang = a + (k - (row.length - 1)/2) * 0.115; const [sx, sy] = pt(R, ang);
        lines += lineDiv(bx, by, sx, sy, 1.5, '#F27A1A', dim ? 0.3 : 0.85);
        if (s.more) nodes += '<button type="button" class="cn-bub cn-cond" data-act="region" data-arg="'+esc(rn)+'" title="'+extra+' more in '+esc(rn)+'" style="left:'+(sx-19)+'px;top:'+(sy-19)+'px;width:38px;height:38px;border:2px solid #4A6690;background:#0F1E33;font-size:12px">+'+extra+'</button>';
        else { const p = s.p; nodes += '<button type="button" class="cn-bub cn-cond" data-act="person" data-arg="'+esc(p.id)+'" title="'+esc(p.name+' · '+p.title+(p.status?' · '+goneTxt(p):''))+'" aria-label="Open '+esc(p.name)+(p.status?', '+esc(goneTxt(p)):'')+'" style="left:'+(sx-19)+'px;top:'+(sy-19)+'px;width:38px;height:38px;border:2px solid #FFFFFF;background:'+(p.photo?'#C9580C':(isLeader(p)?'#2B4A75':'#22385A'))+';font-size:12px;'+ring(p.id)+goneCss(p)+'">'+face(p)+'</button>'; }
      }));
    });
    nodes += '<button type="button" class="cn-bub" data-act="company" title="Open '+esc(SHORT)+' company profile" aria-label="Open '+esc(SHORT)+' company profile" style="left:'+(CX-85)+'px;top:'+(CY-85)+'px;width:170px;height:170px;border:10px solid #F27A1A;background:#fff">'+logoImg(112, true)+'</button>';
    const src = S.region ? (byReg[S.region] || []) : ROSTER;
    const logged = ROSTER.filter((p) => summary(p.id).st).length;
    const rows = src.map((p) => { const s = summary(p.id); return '<button type="button" class="cn-li" data-act="person" data-arg="'+esc(p.id)+'"><span class="cn-mini cn-cond" style="'+ring(p.id)+goneCss(p)+'">'+face(p)+'</span><span><span class="cn-cond" style="font-size:15px">'+esc(p.name)+'</span>'+goneTag(p)+'<br><span style="font-size:12px;color:var(--muted)">'+esc(p.title)+'</span></span><span style="text-align:right;font-size:11px;color:var(--dim)">'+esc(p.city||'—')+(s.st?'<br><b style="color:'+s.st.t+'">'+s.st.l+' '+s.now+'</b>':'')+'</span></button>'; }).join('');
    return '<div class="cn-orgwrap"><div class="cn-mapcol"><div class="cn-stagewrap"><div class="cn-stage" data-w="'+W+'" data-h="'+H+'" style="width:'+W+'px;height:'+H+'px">'+lines+nodes+'</div></div></div>'+
      '<aside class="cn-aside"><div><h1 style="font-size:34px">'+starHtml(K, 'cn-hstar')+esc(C.mapTitle || SHORT + ' · Org Map')+'</h1><p class="cn-muted" style="margin:6px 0 0;font-size:13px">'+ROSTER.length+' current people · '+esc(C.scope || 'leadership + project managers')+'. Click a person to open their contact profile, or the logo for the company profile.</p><div style="margin-top:10px">'+clientToggle()+'</div></div>'+
      '<div class="cn-card" style="padding:12px 14px"><div class="cn-lbl" style="margin-bottom:8px">WARMTH RINGS · '+logged+' of '+ROSTER.length+' contacted</div><div class="cn-legend">'+STAGES.slice().reverse().map((s) => '<span><i class="cn-ringdot" style="border-color:'+s.c+'"></i>'+s.l+'</span>').join('')+'<span><i class="cn-ringdot" style="border-color:transparent;background:#22385A"></i>No contacts yet</span></div></div>'+
      '<div class="cn-card" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h2>'+(S.region ? esc(S.region)+' · '+src.length+' people' : 'Everyone · '+ROSTER.length+' people')+'</h2>'+(S.region?'<button type="button" class="cn-del" data-act="region" data-arg="">Show everyone</button>':(S.canWrite && !S.addP?'<button type="button" class="cn-del" data-act="addp">+ Add a person</button>':''))+'</div>'+(S.addP?addForm():'')+'<div class="cn-list">'+rows+'</div></div></aside></div>';
  }

  // ---------- COMPANY ----------
  function viewCompany(){
    const logged = ROSTER.map((p) => ({ p, s: summary(p.id) })).filter((x) => x.s.st).sort((a,b) => b.s.now - a.s.now);
    const avg = logged.length ? Math.round(logged.reduce((a,x) => a + x.s.now, 0) / logged.length) : null;
    const byReg = REGIONS.map((r) => [r, ROSTER.filter((p) => p.region === r).length]).filter((x) => x[1]);
    return '<div class="cn-phead"><button type="button" class="cn-back" data-act="org"><span class="cn-lg">'+logoImg(24)+'</span>◂ '+esc(SHORT)+' org map</button></div>'+
      '<div class="cn-card cn-namecard" style="margin-bottom:16px"><div><h1>'+starHtml(K, 'cn-hstar')+esc(CO.name)+'</h1><div class="cn-cond cn-orange" style="font-size:18px;margin-top:6px">Company Profile'+(CO.dba ? ' · dba '+esc(CO.dba) : '')+'</div><div class="cn-muted" style="margin-top:4px">'+esc(CO.trades)+'</div><div style="margin-top:12px">'+clientToggle()+'</div></div><div class="cn-logo" style="width:110px;height:110px">'+logoImg(100, true)+'</div></div>'+
      '<div class="cn-grid3" style="margin-bottom:16px">'+[['Headquarters',CO.hq],['Founded',CO.founded],['Employees',CO.employees],['Revenue',CO.revenue],['Owner',CO.owner],['Offices',CO.offices]].map((x) => '<div class="cn-card" style="padding:14px"><div class="cn-lbl">'+esc(x[0].toUpperCase())+'</div><div style="font-size:17px;margin-top:6px">'+esc(x[1])+'</div></div>').join('')+'</div>'+
      '<h2 style="font-size:22px;margin:24px 0 12px">PIPELINE · PROJECTS &amp; SIGNALS</h2>'+
      '<div class="cn-row" style="align-items:flex-start"><section class="cn-card" style="flex:1 1 520px;min-width:0"><h2 style="margin-bottom:8px">KNOWN '+esc(SHORT.toUpperCase())+' PROJECTS</h2><div class="cn-tscroll"><table><thead><tr><th>Project</th><th>Location</th><th>Scope</th><th>Status</th></tr></thead><tbody>'+
      (CO.projects || []).map((r) => '<tr><td style="font-weight:500">'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td><td class="cn-cond cn-orange">'+esc(r[3])+'</td></tr>').join('')+'</tbody></table></div><p class="cn-muted" style="font-size:12px;margin:10px 0 0">Active jobs and GC bids aren\'t public yet. Next step: pull open projects from permit and lien records, and ask your contacts which GCs drive their volume.</p></section>'+
      '<section class="cn-card" style="flex:1 1 520px;min-width:0"><h2 style="margin-bottom:8px">COMPANY SIGNALS</h2><div class="cn-tscroll"><table><thead><tr><th>When</th><th>Signal</th><th>What it means for you</th></tr></thead><tbody>'+
      (CO.signals || []).map((r) => '<tr><td class="cn-cond cn-orange" style="white-space:nowrap">'+esc(r[0])+'</td><td style="font-weight:500">'+esc(r[1])+'</td><td style="color:var(--peach)">'+esc(r[2])+'</td></tr>').join('')+'</tbody></table></div></section></div>'+
      mapSections()+
      '<h2 style="font-size:22px;margin:24px 0 12px">RELATIONSHIP COVERAGE</h2><div class="cn-row" style="align-items:flex-start">'+
      '<section class="cn-card" style="flex:1 1 320px"><div class="cn-stats" style="margin:0;grid-template-columns:repeat(2,minmax(0,1fr))"><div class="cn-stat"><span class="cn-lbl">PEOPLE CONTACTED</span><span class="cn-v">'+logged.length+' / '+ROSTER.length+'</span></div><div class="cn-stat"><span class="cn-lbl">AVG WARMTH</span><span class="cn-v" style="color:'+(avg==null?'var(--dim)':stageOf(avg).t)+'">'+(avg==null?'—':avg)+'</span></div></div>'+
      '<div style="margin-top:14px">'+byReg.map((x) => '<button type="button" class="cn-li" data-act="regionmap" data-arg="'+esc(x[0])+'" style="grid-template-columns:1fr auto;width:100%"><span>'+esc(x[0])+'</span><span class="cn-cond cn-orange">'+x[1]+'</span></button>').join('')+'</div></section>'+
      '<section class="cn-card" style="flex:2 1 420px"><h2 style="margin-bottom:8px">WARMEST RELATIONSHIPS</h2>'+(logged.length ? logged.slice(0,10).map((x) => '<button type="button" class="cn-li" data-act="person" data-arg="'+esc(x.p.id)+'" style="width:100%"><span class="cn-mini cn-cond" style="'+ring(x.p.id)+'">'+face(x.p)+'</span><span><span class="cn-cond">'+esc(x.p.name)+'</span><br><span style="font-size:12px;color:var(--muted)">'+esc(x.p.title)+'</span></span><span class="cn-cond" style="color:'+x.s.st.t+'">'+x.s.st.l+' '+x.s.now+'<br><span style="font-size:11px;color:'+x.s.tc+'">'+x.s.trend+'</span></span></button>').join('') : '<div class="cn-empty">No contacts logged yet. Open anyone\'s profile and use the Connect section.</div>')+'</section></div>'+
      '<div style="margin-top:24px">'+projectsBox()+'</div>'+
      '<div style="margin-top:24px">'+jobsBox()+'</div>'+
      '<div style="margin-top:24px">'+compBox()+'</div>';
  }

  // ---------- WARM PATHS · BRANCHES · GCs & OWNERS: the BusDev Map research for this company, in Client Networks form
  const KIND = { gc:'GC', 'gc-likely':'GC (likely)', owner:'Owner', supplier:'Supplier', sister:'Sister company', sub:'Sub', association:'Association', architect:'Architect', other:'Other' };
  const KIND_ORDER = ['gc', 'gc-likely', 'owner', 'architect', 'sub', 'sister', 'supplier', 'association', 'other'];
  function mapPersonLink(me, personId){
    const mp = ((me && me.people) || []).find((x) => x.id === personId); if (!mp) return '';
    const hit = ROSTER.find((x) => nm(x.name) === nm(mp.name));
    return hit ? '<button type="button" class="cn-linkbtn" data-act="person" data-arg="'+esc(hit.id)+'">'+esc(hit.name)+'</button>' : esc(mp.name);
  }
  function foldBtn(key, n, shown){
    if (n <= shown) return '';
    const open = S.fold && S.fold.has(key);
    return '<button type="button" class="cn-chip cn-foldbtn" data-act="fold" data-arg="'+esc(key)+'" aria-expanded="'+!!open+'">'+(open ? 'Show fewer' : 'Show all '+n)+'</button>';
  }
  function mapSections(){
    const me = mapEntry(K); if (!me) return '';
    const warm = (me.warmPaths || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const br = (me.branches || []).slice().sort((a, b) => (a.group === 'territory' ? 0 : 1) - (b.group === 'territory' ? 0 : 1));
    const pa = (me.partners || []).slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    if (!warm.length && !br.length && !pa.length) return '';
    const open = (k) => S.fold && S.fold.has(k);
    const warmHtml = warm.length ? '<section class="cn-card" style="margin-bottom:16px"><h2 style="margin-bottom:10px">WARM PATHS · HOW TO GET IN</h2><ol class="cn-warm">'+
      warm.map((w, i) => '<li><span class="cn-warmn">'+(i + 1)+'</span><div><div class="cn-warmt">'+esc(w.name || '')+'</div><p>'+esc(noteClean(w.text || ''))+'</p>'+(w.personId && mapPersonLink(me, w.personId) ? '<div class="cn-dim" style="font-size:13px">Start with '+mapPersonLink(me, w.personId)+'</div>' : '')+'</div></li>').join('')+'</ol></section>' : '';
    const brShow = open('br:' + K) ? br : br.slice(0, 6);
    const brHtml = br.length ? '<section class="cn-card" style="flex:1 1 400px;min-width:0"><h2 style="margin-bottom:10px">BRANCHES · '+br.filter((b) => b.group === 'territory').length+' IN YOUR TERRITORY</h2><div class="cn-maplist">'+
      brShow.map((b) => '<div class="cn-mapitem"><div class="cn-mapname">'+esc(b.name || '')+(b.group !== 'territory' ? ' <span class="cn-gone">Outside territory</span>' : '')+'</div>'+
        ([b.address, b.phone].filter(Boolean).length ? '<div class="cn-dim">'+esc([b.address, b.phone].filter(Boolean).join(' · '))+'</div>' : '')+
        (b.leaderId && mapPersonLink(me, b.leaderId) ? '<div>Leader: '+mapPersonLink(me, b.leaderId)+'</div>' : '')+
        ((b.hiring || []).length ? '<div class="cn-hiring">Hiring: '+esc(b.hiring.slice(0, 4).join(', '))+(b.hiring.length > 4 ? ' +'+(b.hiring.length - 4)+' more' : '')+'</div>' : '')+
        (b.note ? '<p>'+esc(noteClean(b.note).slice(0, 220))+(b.note.length > 220 ? '…' : '')+'</p>' : '')+'</div>').join('')+'</div>'+foldBtn('br:' + K, br.length, 6)+'</section>' : '';
    const paShow = open('pa:' + K) ? pa : pa.slice(0, 8);
    const paHtml = pa.length ? '<section class="cn-card" style="flex:1 1 480px;min-width:0"><h2 style="margin-bottom:10px">GCs &amp; OWNERS THEY WORK WITH</h2><div class="cn-maplist">'+
      paShow.map((x) => { const k = (x.kind === 'gc' || x.kind === 'gc-likely' || x.kind === 'sub' || x.kind === 'sister') ? compMatch(x.name) : null;
        return '<div class="cn-mapitem"><div class="cn-mapname">'+(k && k !== K ? compLink(k, compClean(x.name)) : esc(compClean(x.name)))+' <span class="cn-kind">'+esc(KIND[x.kind] || 'Other')+'</span></div>'+
          ((x.metros || []).length ? '<div class="cn-dim">'+esc(x.metros.join(' · '))+'</div>' : '')+
          (x.note ? '<p>'+esc(noteClean(x.note).slice(0, 240))+(x.note.length > 240 ? '…' : '')+'</p>' : '')+'</div>'; }).join('')+'</div>'+foldBtn('pa:' + K, pa.length, 8)+'</section>' : '';
    return '<h2 style="font-size:22px;margin:24px 0 12px">WARM PATHS · BRANCHES · GCs &amp; OWNERS</h2>'+warmHtml+
      ((brHtml || paHtml) ? '<div class="cn-row" style="align-items:flex-start;margin-bottom:8px">'+brHtml+paHtml+'</div>' : '');
  }

  // ---------- COMPETITORS: from the BusDev Map research (company.competitors). Names that are companies in the
  // network open their Client Networks profile; the rest are plain text.
  const COMP_ALIAS = { marek:['Marek Brothers'], cotton:['Cotton Companies','Cotton Holdings'], trinity:['Trinity Drywall & Plastering Systems','Trinity DPS'], moinc:['M.O. Incorporated','M.O. Inc','MO Inc'] };
  const COMP_SUFFIX = /\b(the|inc|incorporated|llc|l\.?l\.?c|lp|l\.?p|co|company|corp|corporation|ltd|limited|of florida|of south carolina|usa|us|group|holdings)\b/g;
  const ccompact = (x) => String(x || '').toLowerCase().replace(/&/g, ' and ').replace(/[.,'’]/g, '').replace(COMP_SUFFIX, ' ').replace(/[^a-z0-9]+/g, '');
  const mapEntry = (k) => ((window.BDMAP && window.BDMAP.COMPANIES) || []).find((c) => c.key === k) || null;
  let COMP_IDX = null;
  function compIndex(){
    if (COMP_IDX) return COMP_IDX;
    const idx = {}, add = (n, k, min) => { const c = ccompact(n); if (c.length >= (min || 3) && !idx[c]) idx[c] = k; };
    Object.keys(COMP_ALIAS).forEach((k) => COMP_ALIAS[k].forEach((n) => add(n, k, 2)));
    ((window.BDMAP && window.BDMAP.COMPANIES) || []).forEach((c) => {
      const co = c.company || {}, nmx = String(co.name || '');
      add(nmx, c.key); add(nmx.replace(/\s*\([^)]*\)/g, ''), c.key);
      (nmx.match(/\(([^)]*)\)/g) || []).forEach((p) => p.slice(1, -1).replace(/^(dba|aka)\s+/i, '').split(/\s*\/\s*/).forEach((u) => add(u, c.key)));
      String(co.aka || '').split(/;|\s\/\s/).forEach((a) => { a = a.replace(/\s*\([^)]*\)/g, '').replace(/^\s*(formerly|dba|aka)\s+/i, '').trim(); if (a && a.length <= 45 && !/\b(not|see|site|page|motto|website|handle|marks|brand|founded|calls|presents|counted|legal|owner)\b/i.test(a)) add(a, c.key); });
    });
    CO_KEYS.forEach((k) => { add(COS[k].short, k); add((COS[k].company || {}).name, k); });
    return (COMP_IDX = idx);
  }
  function compMatch(raw){
    const x = String(raw || ''), idx = compIndex();
    const js = x.match(/\b([a-z0-9]+)\.js\b/i); if (js && (COS[js[1].toLowerCase()] || mapEntry(js[1].toLowerCase()))) return js[1].toLowerCase();
    const base = x.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s*\btier 1( list)?\b.*$/i, '').trim();
    const cands = [base].concat(base.split(/\s+\/\s+/));
    (x.match(/\(([^)]*)\)/g) || []).forEach((p) => { const t = p.slice(1, -1); if (!/tier 1|\.js|office|list|see |internal|account map|division|unconfirmed/i.test(t)) cands.push(t); });
    for (const c of cands){ const k = idx[ccompact(c)]; if (k) return k; }
    return null;
  }
  const compClean = (n) => String(n || '').replace(/\s*\((?:[^()]*(?:tier 1|\.js|account map|in map|on account list)[^()]*)\)/gi, '').replace(/\s+-\s+tier 1.*$/i, '').replace(/\s*\btier 1\b.*$/i, '').trim();
  const noteClean = (n) => String(n || '').replace(/\s*\((?:[^()]*\.js[^()]*)\)/g, '').replace(/\b(?:account map file|map file|file)\s+[a-z0-9]+\.js\b/gi, 'its profile').replace(/\b[a-z0-9]+\.js\b/gi, 'its profile');
  function compLink(k, label){
    if (!k || k === K || !COS[k]) return esc(label);
    return '<button type="button" class="cn-linkbtn cn-complink" data-act="compco" data-arg="'+esc(k)+'" title="Open the Client Networks profile">'+esc(label)+'</button>';
  }
  function compBox(){
    const me = mapEntry(K), list = ((me && me.company && me.company.competitors) || []).filter((c) => c && c.name);
    let rows = list.map((c) => {
      const name = compClean(c.name), parts = name.split(/\s+\/\s+/);
      const keys = parts.map((pt) => compMatch(pt)), whole = compMatch(c.name);
      if (!keys.some(Boolean) && whole) keys[0] = whole;
      const inNet = keys.some((k) => k && k !== K);
      const label = parts.map((pt, i) => compLink(keys[i], pt)).join(' / ');
      return { inNet, html: '<div class="cn-compcard'+(inNet ? ' cn-in' : '')+'">'+
        '<div class="cn-compname">'+label+'</div>'+
        '<div class="cn-comptag">'+(inNet ? 'In your network' : 'Not in your network yet')+'</div>'+
        ((c.metros || []).length ? '<div class="cn-compmetros">'+esc((c.metros || []).join(' · '))+'</div>' : '')+
        (c.note ? '<p class="cn-compnote">'+esc(noteClean(c.note))+'</p>' : '')+
        (c.link ? '<a class="cn-compsrc" href="'+esc(c.link)+'" target="_blank" rel="noopener">Source ↗</a>' : '')+'</div>' };
    });
    let note = 'From your company research. Names in orange open that company\'s profile in Client Networks.';
    if (!rows.length){
      // nothing researched yet: same trade, overlapping states, from the companies already in the network
      const cat = (k) => (COS[k] && COS[k].category) || ((mapEntry(k) || {}).company || {}).category || (mapEntry(k) ? 'div9' : '');
      const mine = new Set(Object.keys(coStates(K))), myCat = cat(K);
      const peers = CO_KEYS.filter((k) => k !== K && (!myCat || cat(k) === myCat)).map((k) => ({ k, shared: Object.keys(coStates(k)).filter((s) => mine.has(s)) })).filter((x) => x.shared.length).sort((a, b) => b.shared.length - a.shared.length || coName(a.k).localeCompare(coName(b.k))).slice(0, 8);
      rows = peers.map((x) => ({ inNet:true, html:'<div class="cn-compcard cn-in"><div class="cn-compname">'+compLink(x.k, coName(x.k))+'</div><div class="cn-comptag">In your network</div><div class="cn-compmetros">Same trade · also in '+esc(x.shared.map((s) => ST_NAME[s]).join(', '))+'</div></div>' }));
      note = rows.length ? 'No competitors researched for '+SHORT+' yet. These companies in your network do the same kind of work in the same states.' : '';
    }
    rows.sort((a, b) => (b.inNet ? 1 : 0) - (a.inNet ? 1 : 0));
    return '<section class="cn-card"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:10px"><h2>COMPETITORS</h2><span class="cn-muted" style="font-size:13px">'+esc(note)+'</span></div>'+
      (rows.length ? '<div class="cn-compgrid">'+rows.map((r) => r.html).join('')+'</div>' : '<p class="cn-empty">No competitors on file for '+esc(SHORT)+' yet.</p>')+'</section>';
  }
  // Projects tab: every project this company is on (owner, GC or sub), with where we stand. Click opens the project.
  function projectsBox(){
    const PJ = window.BDP_PROJECTS; if (!PJ) return '';
    const list = PJ.forCompany(K);
    const rows = list.map((p) => '<button type="button" class="cn-li cn-pjrow" data-open-project="'+esc(p.id)+'">'+
      '<span><span style="font-weight:600">'+esc(p.name)+'</span><br><span class="cn-dim" style="font-size:12px">'+esc([p.roles.join(', '), p.where, p.window ? 'Interiors '+p.window : ''].filter(Boolean).join(' · '))+'</span></span>'+
      '<span class="cn-pjst"><span class="cn-pjdot" style="background:'+esc(p.color)+'"></span>'+esc(p.stage)+'<br><span class="cn-dim" style="font-size:12px">Us: '+esc(p.ours)+'</span></span></button>').join('');
    return '<section class="cn-card"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:8px"><h2>PROJECTS WITH '+esc(SHORT.toUpperCase())+'</h2><a href="#projects" class="cn-muted" style="font-size:13px">Open Projects ↗</a></div>'+
      (rows ? '<div>'+rows+'</div>' : '<p class="cn-empty">'+esc(SHORT)+' isn\'t on any project you\'re chasing yet. Add them to a project\'s team in the Projects tab.</p>')+'</section>';
  }


  // ---------- JOBS & PROPOSALS with this company: every entry IS a Pipeline opportunity (window.OPPS, key "bdp-opps") ----------
  const JOB_ST = [
    { k:'upcoming', l:'Upcoming job', stage:'Qualified', c:'#5AA9F0' },
    { k:'proposal', l:'Proposal sent', stage:'Proposal sent', c:'#F2C14E' },
    { k:'awarded', l:'Awarded · starting soon', stage:'Verbal yes', c:'#F2804A' },
    { k:'ongoing', l:'Ongoing · working together', stage:'Won', c:'#E8452C' },
    { k:'lost', l:'Lost', stage:'Lost', c:'#8A97AB' }];
  const STAGE_JOB = { 'New':'upcoming', 'Qualified':'upcoming', 'Meeting set':'upcoming', 'Proposal sent':'proposal', 'Verbal yes':'awarded', 'Won':'ongoing', 'Lost':'lost' };
  const jobSt = (o) => JOB_ST.find((x) => x.k === STAGE_JOB[o.stage]) || JOB_ST[0];
  const JOB_TRADES = ['Drywall & metal framing','Acoustical ceilings','Insulation','Drywall / ACT combined','General labor','Other'];
  const JOB_STATES = ['TX','FL','GA','AL','MS','LA','NC','SC','TN'];
  const opps = () => Array.isArray(window.OPPS) ? window.OPPS : null;
  const jobsOf = (k) => (opps() || []).filter((o) => o && o.co === k);
  const money = (n) => { n = +n || 0; return n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); };
  const weeksBetween = (a, b) => (a && b && b >= a) ? Math.max(1, Math.ceil((dayNum(b) - dayNum(a) + 1) / 7)) : 0;
  const fileLink = (f) => '<a class="cn-file" href="/_blob/'+esc(f.id)+'" target="_blank" rel="noopener">📎 '+esc(f.name)+'</a>';
  let ASSETS = null;
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('assets').then((a) => { ASSETS = a || null; if (S.view === 'company' && S.job) render(); }, () => {});
  function saveOpps(){
    const o = opps(); if (!o) return false;
    try { localStorage.setItem('bdp-opps', JSON.stringify(o)); } catch (e) { return false; }
    if (typeof window.renderPipeline === 'function'){ try { window.renderPipeline(); } catch (e) {} }
    return true;
  }
  function dropAssets(ids){ if (!ASSETS) return; ids.forEach((id) => { ASSETS.delete(id).catch(() => {}); }); }
  function newJob(){ return { id:null, project:'', status:'upcoming', status0:null, value:'', city:'', state:'', heads:'', trade:JOB_TRADES[0], start:'', end:'', next:'', files:[], fresh:[], removed:[] }; }
  function editJob(o){ const st = STAGE_JOB[o.stage] || 'upcoming'; return { id:o.id, project:o.project || '', status:st, status0:st, value:o.value || '', city:o.metro || '', state:String(o.state || '').split(/[,; ]+/)[0] || '', heads:o.heads || '', trade:o.trade || JOB_TRADES[0], start:o.start || '', end:o.end || '', next:o.next || '', files:(o.files || []).slice(), fresh:[], removed:[] }; }

  function jobTimeline(list){
    const js = list.filter((o) => o.start && o.end && o.end >= o.start);
    if (!js.length) return '';
    const p0 = js.reduce((m, o) => o.start < m ? o.start : m, js[0].start), p1 = js.reduce((m, o) => o.end > m ? o.end : m, js[0].end);
    const y0 = +p0.slice(0,4), m0 = +p0.slice(5,7) - 1; let y1 = +p1.slice(0,4), m1 = +p1.slice(5,7) - 1;
    let months = (y1 - y0) * 12 + (m1 - m0) + 1; if (months > 36){ months = 36; }
    const t0 = Date.UTC(y0, m0, 1) / 86400000, t1 = Date.UTC(y0, m0 + months, 1) / 86400000, span = t1 - t0;
    const pct = (iso) => Math.max(0, Math.min(100, (dayNum(iso) - t0) / span * 100));
    const ticks = []; for (let i = 0; i < months; i++){ const d = new Date(Date.UTC(y0, m0 + i, 1)); ticks.push('<span style="left:'+((Date.UTC(y0, m0 + i, 1) / 86400000 - t0) / span * 100)+'%">'+MON[d.getUTCMonth()]+(d.getUTCMonth() === 0 || i === 0 ? ' ’'+String(d.getUTCFullYear()).slice(2) : '')+'</span>'); }
    const today = todayISO(), tp = (dayNum(today) >= t0 && dayNum(today) <= t1) ? '<i class="cn-gt-today" style="left:'+pct(today)+'%" title="Today"></i>' : '';
    const rows = js.sort((a, b) => a.start < b.start ? -1 : 1).map((o) => { const st = jobSt(o), l = pct(o.start), r = pct(o.end); return '<div class="cn-gt-row"><span class="cn-gt-name" title="'+esc(o.project)+'">'+esc(o.project)+'</span><span class="cn-gt-track">'+tp+'<i class="cn-gt-bar" style="left:'+l+'%;width:'+Math.max(1.5, r - l)+'%;background:'+st.c+'" title="'+esc(o.project+' · '+fmt(o.start)+' – '+fmt(o.end))+'"></i></span></div>'; }).join('');
    return '<div class="cn-gantt" aria-label="Project timeline"><div class="cn-gt-row cn-gt-axis"><span class="cn-gt-name"></span><span class="cn-gt-track">'+ticks.join('')+'</span></div>'+rows+'</div>';
  }

  function jobForm(){
    const j = S.job, f = (lbl, html, cls) => '<label class="cn-jf'+(cls ? ' '+cls : '')+'"><span class="cn-lbl">'+lbl+'</span>'+html+'</label>';
    const opt = (v, l, cur) => '<option value="'+esc(v)+'"'+(String(cur) === String(v) ? ' selected' : '')+'>'+esc(l)+'</option>';
    const wk = weeksBetween(j.start, j.end);
    return '<form id="cnJobForm" class="cn-card cn-jobform" novalidate><h2 style="grid-column:1/-1">'+(j.id ? 'EDIT JOB' : 'NEW JOB OR PROPOSAL')+' · '+esc(SHORT.toUpperCase())+'</h2>'+
      f('PROJECT NAME', '<input class="cn-in" data-jf="project" value="'+esc(j.project)+'" placeholder="e.g. Four Seasons Jacksonville" required>', 'wide')+
      f('STATUS', '<select class="cn-in" data-jf="status">'+JOB_ST.map((x) => opt(x.k, x.l, j.status)).join('')+'</select>')+
      f('PROJECT VALUE ($)', '<input class="cn-in" type="number" min="0" step="1000" data-jf="value" value="'+esc(j.value)+'" placeholder="250000">')+
      f('TRADE', '<select class="cn-in" data-jf="trade">'+JOB_TRADES.map((x) => opt(x, x, j.trade)).join('')+'</select>')+
      f('CITY', '<input class="cn-in" data-jf="city" value="'+esc(j.city)+'" placeholder="Jacksonville">')+
      f('STATE', '<select class="cn-in" data-jf="state">'+opt('', 'Pick a state', j.state)+JOB_STATES.map((x) => opt(x, x, j.state)).join('')+(j.state && JOB_STATES.indexOf(j.state) < 0 ? opt(j.state, j.state, j.state) : '')+'</select>')+
      f('EST. MANPOWER (WORKERS)', '<input class="cn-in" type="number" min="0" step="1" data-jf="heads" value="'+esc(j.heads)+'" placeholder="40">')+
      f('START DATE', '<input class="cn-in" type="date" data-jf="start" value="'+esc(j.start)+'">')+
      f('END DATE', '<input class="cn-in" type="date" data-jf="end" value="'+esc(j.end)+'">')+
      '<div class="cn-jf"><span class="cn-lbl">DURATION</span><span id="cnJobWeeks" class="cn-cond" style="font-size:20px;color:var(--accent);padding-top:6px">'+(wk ? wk+' week'+(wk === 1 ? '' : 's') : '—')+'</span></div>'+
      f('NEXT STEP / NOTES', '<input class="cn-in" data-jf="next" value="'+esc(j.next)+'" placeholder="Send revised proposal Monday">', 'wide')+
      '<div class="cn-jf wide"><span class="cn-lbl">PROPOSAL, PLANS OR CONTRACT (PDF)</span><div class="cn-jf-files">'+
        (j.files.length ? j.files.map((x) => '<span class="cn-filechip">'+fileLink(x)+'<button type="button" class="cn-linkbtn" data-act="jobfilerm" data-arg="'+esc(x.id)+'" aria-label="Remove '+esc(x.name)+'">✕</button></span>').join('') : '<span class="cn-dim" style="font-size:13px">No PDF attached yet.</span>')+
        (ASSETS ? '<button type="button" class="cn-chip" data-act="jobpick"'+(S.jobBusy ? ' disabled' : '')+'>'+(S.jobBusy ? 'Uploading…' : 'Attach PDF')+'</button><input type="file" id="cnJobFile" accept="application/pdf,.pdf" multiple hidden>' : '<span class="cn-dim" style="font-size:12px">PDF uploads work in the claude.ai portal for its editors.</span>')+
      '</div></div>'+
      '<div class="cn-jf wide" style="flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap"><button type="submit" class="cn-save"'+(S.jobBusy ? ' disabled' : '')+'>Save to pipeline</button><button type="button" class="cn-del" data-act="jobcancel">Cancel</button>'+(S.jobMsg ? '<span class="cn-status" role="status">'+esc(S.jobMsg)+'</span>' : '')+'</div></form>';
  }

  function jobsBox(){
    const list = jobsOf(K), live = list.filter((o) => o.stage !== 'Lost');
    const tot = live.reduce((a, o) => a + (+o.value || 0), 0);
    const sumBy = (k) => list.filter((o) => STAGE_JOB[o.stage] === k).reduce((a, o) => a + (+o.value || 0), 0);
    const crews = list.filter((o) => STAGE_JOB[o.stage] === 'ongoing').reduce((a, o) => a + (+o.heads || 0), 0);
    const order = { ongoing:0, awarded:1, proposal:2, upcoming:3, lost:4 };
    const rows = list.slice().sort((a, b) => (order[STAGE_JOB[a.stage]] - order[STAGE_JOB[b.stage]]) || String(a.start || '9').localeCompare(String(b.start || '9'))).map((o) => {
      const st = jobSt(o), wk = o.weeks || weeksBetween(o.start, o.end);
      return '<tr><td><span style="font-weight:600">'+esc(o.project)+'</span>'+(o.next ? '<br><span class="cn-dim" style="font-size:12px">'+esc(o.next)+'</span>' : '')+((o.files || []).length ? '<br>'+o.files.map(fileLink).join(' ') : '')+'</td>'+
        '<td><span class="cn-pill" style="background:'+st.c+'">'+esc(st.l)+'</span></td>'+
        '<td>'+esc([o.metro, o.state].filter(Boolean).join(', ') || '—')+'</td>'+
        '<td class="cn-cond" style="text-align:right;white-space:nowrap">'+(o.value ? money(o.value) : '—')+'</td>'+
        '<td class="cn-cond" style="text-align:right">'+(o.heads ? esc(o.heads) : '—')+'</td>'+
        '<td style="white-space:nowrap">'+(o.start ? fmt(o.start) : '—')+(o.end ? ' – '+fmt(o.end) : '')+(wk ? '<br><span class="cn-dim" style="font-size:12px">'+wk+' week'+(wk === 1 ? '' : 's')+'</span>' : '')+'</td>'+
        (S.canWrite ? '<td style="white-space:nowrap"><button type="button" class="cn-del" data-act="jobedit" data-arg="'+esc(o.id)+'">Edit</button> <button type="button" class="cn-del'+(S.jobArmed === o.id ? ' cn-arm' : '')+'" data-act="jobdel" data-arg="'+esc(o.id)+'">'+(S.jobArmed === o.id ? 'Confirm remove' : 'Remove')+'</button></td>' : '')+'</tr>';
    }).join('');
    return '<section class="cn-card" id="cnJobs" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px"><div><h2>OUR JOBS &amp; PROPOSALS WITH '+esc(SHORT.toUpperCase())+'</h2><div class="cn-dim" style="font-size:13px;margin-top:4px">Ongoing work, proposals sent and upcoming jobs. Each one is saved straight into the Pipeline tab.</div></div>'+
      (S.canWrite && !S.job ? '<button type="button" class="cn-save" data-act="jobadd">+ Add job or proposal</button>' : '')+'</div>'+
      (S.job ? jobForm() : (S.jobMsg ? '<div class="cn-status" role="status" style="margin-bottom:8px">'+esc(S.jobMsg)+'</div>' : ''))+
      (list.length ? '<div class="cn-stats" style="margin:4px 0 14px"><div class="cn-stat"><span class="cn-lbl">TOTAL VALUE</span><span class="cn-v">'+money(tot)+'</span></div><div class="cn-stat"><span class="cn-lbl">ONGOING</span><span class="cn-v">'+money(sumBy('ongoing'))+'</span></div><div class="cn-stat"><span class="cn-lbl">PROPOSALS OUT</span><span class="cn-v">'+money(sumBy('proposal'))+'</span></div><div class="cn-stat"><span class="cn-lbl">WORKERS ON SITE</span><span class="cn-v">'+crews+'</span></div></div>'+
        jobTimeline(list)+
        '<div class="cn-tscroll"><table class="cn-jobtable"><thead><tr><th>Project</th><th>Status</th><th>Location</th><th style="text-align:right">Value</th><th style="text-align:right">Workers</th><th>Timeline</th>'+(S.canWrite ? '<th></th>' : '')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'
        : (S.job ? '' : '<div class="cn-empty">No jobs or proposals with '+esc(SHORT)+' yet.'+(S.canWrite ? ' Click "Add job or proposal" to enter the first one.' : '')+'</div>'))+
      '</section>';
  }

  function onJobSave(e){
    e.preventDefault();
    const j = S.job; if (!j || !S.canWrite) return;
    if (!String(j.project).trim()){ S.jobMsg = 'Give the project a name.'; render(); const i = document.querySelector('#cnJobForm [data-jf="project"]'); if (i) i.focus(); return; }
    if (j.start && j.end && j.end < j.start){ S.jobMsg = 'The end date is before the start date.'; render(); return; }
    const list = opps(); if (!list){ S.jobMsg = 'The Pipeline is not loaded yet. Try again in a moment.'; render(); return; }
    const today = todayISO();
    let o = j.id ? list.find((x) => x.id === j.id) : null, isNew = false;
    if (!o){ o = { id:'cn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), co:K, source:'Client Networks', opened:today, stage:'Qualified', qualified:today }; isNew = true; }
    const st = JOB_ST.find((x) => x.k === j.status) || JOB_ST[0];
    if (isNew || j.status !== j.status0){ o.stage = st.stage; if (st.stage === 'Won' || st.stage === 'Lost'){ if (!o.closed) o.closed = today; } else delete o.closed; if (st.stage !== 'New' && !o.qualified) o.qualified = today; }
    const city = String(j.city).trim(), state = String(j.state).trim(), wk = weeksBetween(j.start, j.end);
    Object.assign(o, { co:K, gc:SHORT, project:String(j.project).trim(), value:+j.value || 0, trade:j.trade, projectType:j.trade, heads:+j.heads || 0,
      metro:city, state:state, location:[city, state].filter(Boolean).join(', '), start:j.start || '', end:j.end || '',
      weeks:wk || (+o.weeks || 0), timeline:(j.start ? fmt(j.start) : '')+(j.end ? ' – '+fmt(j.end) : ''), next:String(j.next).trim(), files:j.files.slice(), edited:today });
    if (!o.files.length) delete o.files;
    if (isNew) list.push(o);
    if (!saveOpps()){ S.jobMsg = 'Could not save. Try again.'; render(); return; }
    dropAssets(j.removed);
    S.job = null; S.jobMsg = 'Saved. "'+o.project+'" is in the Pipeline as '+o.stage+'.'; render();
  }
  async function onJobFiles(input){
    const j = S.job; if (!j || !ASSETS || !input.files || !input.files.length) return;
    const files = Array.prototype.slice.call(input.files); input.value = '';
    S.jobBusy++; S.jobMsg = 'Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…'; render();
    const errs = [];
    for (const file of files){
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf'){ errs.push(file.name + ' is not a PDF'); continue; }
      if (file.size > 20 * 1024 * 1024){ errs.push(file.name + ' is over 20 MB'); continue; }
      try { const r = await ASSETS.upload(file, { type:'application/pdf' }); j.files.push({ id:r.id, name:file.name, size:r.sizeBytes }); j.fresh.push(r.id); }
      catch (err){ const c = err && err.code; errs.push(file.name + ': ' + (c === 'too_large' ? 'over the size limit' : c === 'quota_or_state' ? 'storage is full' : c === 'not_granted' ? 'only the portal\'s editors can attach files' : 'upload failed, try again')); }
    }
    S.jobBusy--; if (S.job === j) S.jobMsg = errs.length ? errs.join(' · ') : 'Attached. Click "Save to pipeline" to keep it.'; render();
  }

  // ---------- PERSON ----------
  function viewPerson(){
    const p = P[S.pid]; if (!p) return viewOrg();
    const sec = (id, title, html) => '<section id="sec-'+id+'" style="margin-top:36px;scroll-margin-top:76px"><h2 style="font-size:24px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line)">'+title+'</h2>'+html+'</section>';
    return '<div class="cn-phead"><h1>Contact Profile - '+esc(p.name)+goneTag(p)+'</h1><button type="button" class="cn-back" data-act="org"><span class="cn-lg">'+logoImg(24)+'</span>◂ '+esc(SHORT)+' org map</button></div>'+
      tabDashboard(p) + sec('network','NETWORK',tabNetwork(p)) + sec('connect','CONNECT',tabConnect(p)) + sec('personal','PERSONAL &amp; OPEN THREADS',personalBox(p)) + sec('insights','INSIGHTS',tabInsights(p));
  }

  function tabDashboard(p){
    const s = summary(p.id), r = RICH[p.id];
    const seg = STAGES.slice().reverse().map((st) => { const on = s.st && s.st.l === st.l; return '<div class="'+(on?'cn-on':'')+'" style="'+(on?'background:'+st.c+';--segc:'+st.c:'')+'">'+st.l+'</div>'; }).join('');
    const career = r ? r.career.map((c) => '<div><span class="cn-cond cn-orange">'+esc(c[0])+'</span><span><b style="font-weight:500">'+esc(c[1])+'</b> <span class="cn-muted">· '+esc(c[2])+'</span></span></div>').join('')
      : '<div><span class="cn-cond cn-orange">'+(p.since ? esc(p.since)+' – now' : 'Now')+'</span><span><b style="font-weight:500">'+esc(p.title)+'</b> <span class="cn-muted">· '+esc(SHORT)+'</span></span></div>' + (p.prior || []).map((x) => '<div><span class="cn-cond cn-orange">Before</span><span class="cn-muted">'+esc(x)+'</span></div>').join('');
    return '<div class="cn-dash"><div style="display:flex;flex-direction:column;gap:16px;align-items:center"><div class="cn-photo cn-cond'+(S.canWrite?' cn-photo-edit':'')+'"'+(S.canWrite?' data-act="pickphoto" data-pid="'+esc(p.id)+'" role="button" tabindex="0" aria-label="Change photo for '+esc(p.name)+'. Click to choose a file, or drop an image here." title="Drop a photo here, or click to choose one"':'')+'>'+(p.photo?'<img src="'+esc(p.photo)+'" alt="'+esc(p.name)+'">':'<span>'+esc(ini(p.name))+'</span>')+(S.canWrite?'<em class="cn-photo-hint">Drop a photo or click</em>':'')+'</div>'+
      (S.canWrite?'<input type="file" id="cnPhotoIn" accept="image/*" hidden><div class="cn-dim" style="font-size:13px;text-align:center;min-height:18px" aria-live="polite">'+esc(S.photoMsg)+(PHOTOS[K+'__'+p.id]?' <button type="button" class="cn-linkbtn" data-act="rmphoto" data-pid="'+esc(p.id)+'">Remove photo</button>':'')+'</div>':'')+
      '<button type="button" class="cn-save" data-act="jump" data-arg="connect" style="align-self:stretch">Log a contact ↓</button></div>'+
      '<div style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="cn-card cn-namecard"><div><div class="cn-cond" style="font-size:32px">'+esc(p.name)+'</div><div class="cn-cond cn-orange" style="font-size:18px;margin-top:4px">'+(p.status?'<span style="text-decoration:line-through;text-decoration-thickness:1px">'+esc(p.title)+'</span> <span class="cn-muted">· '+esc(p.status === 'left' ? 'former' : 'retired')+'</span>':esc(p.title))+'</div><div style="font-size:18px;color:var(--fg);margin-top:4px">'+esc(CO.name)+(p.city?' · '+esc(p.city):'')+'</div>'+(r&&r.note?'<div class="cn-muted" style="font-size:13px;margin-top:6px">'+esc(r.note)+'</div>':'')+'</div><div class="cn-logo">'+logoImg(78, true)+'</div></div>'+
      (S.canWrite ? '<div class="cn-statrow" role="group" aria-label="Employment status"><span class="cn-lbl">STATUS</span>'+[['','Still at '+SHORT],['retired','Retired'],['left','Left the company']].map((o) => '<button type="button" class="cn-chip'+((p.status||'')===o[0]?' cn-on':'')+'" data-act="status" data-pid="'+esc(p.id)+'" data-arg="'+o[0]+'" aria-pressed="'+((p.status||'')===o[0])+'">'+esc(o[1])+'</button>').join('')+(p.status?'<span class="cn-dim" style="font-size:13px">Kept on the map so you can still talk about them and log contacts.</span>':'')+(p.handAdded?'<button type="button" class="cn-del'+(S.armed==='rmp:'+p.id?' cn-arm':'')+'" data-act="rmperson" data-pid="'+esc(p.id)+'">'+(S.armed==='rmp:'+p.id?'Click again to remove '+esc(p.name):'Remove this person')+'</button>':'')+'</div>' : (p.status?'<div class="cn-statrow"><span class="cn-lbl">STATUS</span><span>'+esc(goneTxt(p))+'</span></div>':''))+
      '<div class="cn-card cn-kv"><span class="cn-k">Phone</span><span>'+(p.phone?tel(p.phone)+' <span class="cn-dim" style="font-size:13px">direct</span><br>':'')+(regLine(p.region)?tel(regLine(p.region))+' <span class="cn-dim" style="font-size:13px">'+esc(p.region)+' office</span><br>':'')+(CO.phone?tel(CO.phone)+' ':'')+'<span class="cn-dim" style="font-size:13px">'+esc(SHORT)+' main line</span>'+(S.canWrite?' <button type="button" class="cn-linkbtn" data-act="phones">Edit</button>':'')+'</span><span class="cn-k">Email</span><span>'+(p.email?esc(p.email)+' <span class="cn-dim" style="font-size:13px">verified</span>':'<span class="cn-dim">Not verified</span>')+'</span><span class="cn-k">LinkedIn</span><span>'+liCell(p)+'</span><span class="cn-k">Region</span><span>'+esc(p.region)+'</span></div>'+
      '<div><div class="cn-lbl" style="margin-bottom:8px">RELATIONSHIP WARMTH '+(s.st?'· '+s.now+' / 100':'')+'</div><div class="cn-seg">'+seg+'</div>'+(s.st?'':'<div class="cn-dim" style="font-size:13px;margin-top:8px">No contacts logged yet. Warmth fills in from the Connect section below.</div>')+'</div>'+
      '<div class="cn-card" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:6px"><div><div class="cn-lbl">LAST CONTACT</div><div class="cn-big">'+(s.list.length?esc(fmt(sorted(s.list).slice(-1)[0].date)):'None yet')+'</div></div><div><div class="cn-lbl">DAYS SINCE</div><div class="cn-big">'+(s.days==null?'—':s.days)+'</div></div><div><div class="cn-lbl">TREND</div><div class="cn-big" style="color:'+s.tc+'">'+esc(s.trend)+'</div></div></div>'+
      '<div class="cn-card cn-career"><h2 style="margin-bottom:6px">CAREER PATH</h2>'+career+'</div></div></div>';
  }

  // LinkedIn: a link saved by hand (collection "linkedin", same key the BusDev Map used) wins over the researched one
  const pkey = (p) => p.mapKey || (K + '__' + p.id);
  // People from the old map keep a hand-saved link in the shared "linkedin" collection (same key the map used, as before).
  // Everyone else keeps it in the private Client Networks edits, so it never reaches the public GitHub copy.
  const liOf = (p) => (p.mapKey ? (((window.BDMAP && window.BDMAP.LI) || {})[p.mapKey]) : EDITS['li:' + K + ':' + p.id]) || p.li || '';
  function liCell(p){
    const li = liOf(p);
    if (S.liEdit === p.id) return '<form id="liForm" class="cn-liform"><input type="url" id="liIn" class="cn-in" value="'+esc(li)+'" placeholder="https://www.linkedin.com/in/…" aria-label="LinkedIn profile link"><button type="submit" class="cn-chip cn-on">Save</button><button type="button" class="cn-chip" data-act="licancel">Cancel</button>'+(S.liMsg ? '<span class="cn-dim" role="alert" style="flex-basis:100%;font-size:13px">'+esc(S.liMsg)+'</span>' : '')+'</form>';
    return (li ? '<a href="'+esc(li)+'" target="_blank" rel="noopener">'+esc(li.replace(/^https?:\/\/(www\.)?/, ''))+'</a>' : '<span class="cn-dim">Not found</span>')+
      (S.canWrite ? ' <button type="button" class="cn-linkbtn" data-act="liedit" data-pid="'+esc(p.id)+'">'+(li ? 'Change' : 'Add link')+'</button>' : '');
  }
  async function saveLi(p, url){
    url = String(url || '').trim();
    if (url && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(url)){ S.liMsg = 'Paste a LinkedIn profile link (linkedin.com/in/…).'; render(); return; }
    if (!p.mapKey){
      const ek2 = 'li:' + K + ':' + p.id, before = EDITS[ek2];
      if (url) EDITS[ek2] = url; else delete EDITS[ek2];
      if (!saveEdits()){ if (before) EDITS[ek2] = before; else delete EDITS[ek2]; S.liMsg = 'Could not save. Try again.'; render(); return; }
      S.liEdit = null; S.liMsg = ''; render(); return;
    }
    const key = pkey(p), B = window.BDMAP, db = pdb();
    if (B && B.LI){ if (url) B.LI[key] = url; else delete B.LI[key]; }
    S.liEdit = null; S.liMsg = ''; render();
    if (db){ try { if (url) await db.doc('linkedin/' + key).set({ company: K, person: p.name, url, updatedAt: new Date().toISOString() }); else await db.doc('linkedin/' + key).delete(); } catch (e) { S.msg = 'Could not save the LinkedIn link.'; render(); } }
    else { try { const o = JSON.parse(localStorage.getItem('pwLinkedIn') || '{}'); if (url) o[key] = url; else delete o[key]; localStorage.setItem('pwLinkedIn', JSON.stringify(o)); } catch (e) {} }
  }

  function tabNetwork(p){
    const W = 1100, H = 640, CX = 550, CY = 320;
    const chain = chainOf(p), team = teamOf(p), peers = peersOf(p);
    const r = RICH[p.id];
    const past = r ? r.career.filter((c) => !(c[2] === SHORT || c[2] === CO.name || c[2] === 'Civic')).map((c) => ({ label: c[2], sub: c[0] })) : (p.prior || []).map((x) => { const m = x.match(/^(.*) @ (.*?)(?: \((.*)\))?$/); return m ? { label: m[2], sub: m[3] || m[1] } : { label: x, sub: '' }; });
    const uniqPast = []; past.forEach((x) => { if (!uniqPast.find((y) => y.label === x.label)) uniqPast.push(x); });
    const execTeam = team.length ? null : (C.exec || [C.top, C.ops]).filter((id) => P[id] && id !== p.id && !chain.includes(id)).slice(0,4);
    const B = [
      { t:'Reports To', s:'Leadership above (inferred)', ids: chain, x:340, y:180, side:'L' },
      { t: team.length ? 'Their Team' : 'Company Leadership', s: team.length ? team.length + ' people' : 'Executives & sales', ids: team.length ? team : execTeam, x:760, y:180, side:'R' },
      { t: p.region === 'Corporate' ? 'Corporate Peers' : (isRegionalLeader(p) ? 'Peers' : 'Same Region'), s: p.region, ids: peers, x:340, y:470, side:'L' },
      { t:'Past Companies', s: uniqPast.length ? uniqPast.length + ' employers' : 'None listed', past: uniqPast, x:760, y:470, side:'R' }
    ];
    let lines = '', nodes = '';
    B.forEach((b) => {
      lines += lineDiv(CX, CY, b.x, b.y, 3, '#F27A1A', 1);
      const items = b.past ? b.past.slice(0,5) : b.ids.slice(0,5);
      const extra = (b.past ? b.past.length : b.ids.length) - items.length;
      const n = items.length + (extra > 0 ? 1 : 0), sx = b.side === 'L' ? 200 : 900;
      for (let k = 0; k < n; k++){
        const sy = b.y + (k - (n - 1)/2) * 58;
        lines += lineDiv(b.x, b.y, sx, sy, 2, '#F27A1A', 0.85);
        const lx = b.side === 'L' ? 'right:'+(W - sx + 34)+'px;text-align:right' : 'left:'+(sx + 34)+'px';
        if (k === items.length){ nodes += '<div class="cn-bub cn-cond" style="left:'+(sx-24)+'px;top:'+(sy-24)+'px;width:48px;height:48px;border:2px solid #4A6690;background:#0F1E33;font-size:13px;cursor:default">+'+extra+'</div>'; continue; }
        if (b.past){ const c = items[k]; nodes += '<div class="cn-bub cn-cond" style="left:'+(sx-24)+'px;top:'+(sy-24)+'px;width:48px;height:48px;border:2px solid #4A6690;background:#13253D;font-size:13px;cursor:default" title="'+esc(c.label)+'">'+esc(ini(c.label))+'</div><div class="cn-blabel" style="'+lx+';top:'+(sy-15)+'px"><b class="cn-cond" style="color:var(--fg);font-size:13px">'+esc(c.label.length>26?c.label.slice(0,25)+'…':c.label)+'</b><br>'+esc(c.sub)+'</div>'; continue; }
        const q = P[items[k]]; if (!q) continue;
        nodes += '<button type="button" class="cn-bub cn-cond" data-act="person" data-arg="'+esc(q.id)+'" title="Open '+esc(q.name)+(q.status?' ('+esc(goneTxt(q))+')':'')+'" style="left:'+(sx-24)+'px;top:'+(sy-24)+'px;width:48px;height:48px;border:3px solid #FFFFFF;background:'+(q.photo?'#C9580C':'#22385A')+';font-size:14px;'+ring(q.id)+goneCss(q)+'">'+face(q)+'</button><div class="cn-blabel" style="'+lx+';top:'+(sy-15)+'px"><b class="cn-cond" style="color:var(--fg);font-size:13px">'+esc(q.name)+'</b><br>'+esc(q.title.length>26?q.title.slice(0,25)+'…':q.title)+'</div>';
      }
      nodes += '<div class="cn-bub" style="left:'+(b.x-82)+'px;top:'+(b.y-82)+'px;width:164px;height:164px;border:2px solid #4A6690;background:#13253D;flex-direction:column;gap:4px;padding:14px;cursor:default"><span class="cn-cond" style="font-size:20px;line-height:1.05">'+esc(b.t)+'</span><span style="font-size:12px;color:#E6ECF4">'+esc(b.s)+'</span></div>';
    });
    nodes += '<div class="cn-bub" style="left:'+(CX-105)+'px;top:'+(CY-105)+'px;width:210px;height:210px;border:12px solid #FFFFFF;background:radial-gradient(circle at 50% 35%,#2C4466 0%,#15263F 70%);flex-direction:column;justify-content:flex-end;cursor:default;'+(summary(p.id).st?'box-shadow:0 0 0 4px var(--bg),0 0 0 10px '+summary(p.id).st.c:'')+'">'+(p.photo?'<img src="'+esc(p.photo)+'" alt="" style="position:absolute;inset:0">':'<span class="cn-cond" style="position:absolute;top:44px;left:0;right:0;font-size:56px;color:#E6ECF4">'+esc(ini(p.name))+'</span>')+'<span class="cn-cond" style="position:relative;width:100%;background:rgba(8,16,28,0.85);padding:6px 22px 18px;font-size:14px;line-height:1.1">'+esc(p.name)+'</span></div>';
    return '<p class="cn-muted" style="margin:0 0 10px;font-size:14px">Connections come from the org chart: reporting lines are inferred from titles and regions. Click anyone to open their profile.</p><div class="cn-stagewrap"><div class="cn-stage" data-w="'+W+'" data-h="'+H+'" style="width:'+W+'px;height:'+H+'px">'+lines+nodes+'</div></div>';
  }

  function tabConnect(p){
    const s = summary(p.id);
    const avgFeel = s.list.length ? s.list.reduce((a,t) => a + (Number(t.feel)||0), 0) / s.list.length : null;
    const feelWord = avgFeel == null ? '—' : avgFeel >= 1.5 ? 'Very positive' : avgFeel >= 0.5 ? 'Positive' : avgFeel > -0.5 ? 'Neutral' : avgFeel > -1.5 ? 'Negative' : 'Very negative';
    const inPerson = s.list.filter((t) => (CH[t.type]||1) > 1).length;
    const head = '<section class="cn-card"><div class="cn-phead" style="margin:0"><div><h2 style="font-size:22px">CONTACT LOG</h2><div class="cn-muted" style="font-size:14px;margin-top:4px">'+esc(p.name)+' · '+esc(p.title)+'</div></div><div class="cn-gauge"><span class="cn-gnum" style="color:'+(s.st?s.st.t:'var(--dim)')+'">'+(s.now==null?'—':s.now)+'</span><span style="display:flex;flex-direction:column;gap:4px"><span class="cn-cond" style="font-size:22px">'+(s.st?s.st.l:'No data yet')+'</span><span class="cn-cond" style="color:'+s.tc+'">'+esc(s.trend)+'</span><span class="cn-dim" style="font-size:12px">vs. 30 days ago</span></span></div></div>'+
      '<div class="cn-stats"><div class="cn-stat"><span class="cn-lbl">CONTACTS</span><span class="cn-v">'+s.list.length+'</span></div><div class="cn-stat"><span class="cn-lbl">IN PERSON</span><span class="cn-v">'+inPerson+'</span></div><div class="cn-stat"><span class="cn-lbl">DAYS SINCE LAST</span><span class="cn-v">'+(s.days==null?'—':s.days)+'</span></div><div class="cn-stat"><span class="cn-lbl">AVG FEEL</span><span class="cn-v" style="font-size:20px">'+feelWord+'</span></div></div></section>';
    const chart = '<section class="cn-card"><div class="cn-phead" style="margin:0 0 6px"><h2>WARMTH OVER TIME</h2><span class="cn-dim" style="font-size:12px">0–100 · fades toward neutral when you go quiet</span></div>'+chartSVG(s.list)+'<div class="cn-legend" style="margin-top:8px">'+FEELS.map((f) => '<span><i class="cn-dot" style="background:'+f.h+'"></i>'+f.l+'</span>').join('')+'</div></section>';
    const d = S.draft;
    const form = !S.canWrite ? '<section class="cn-card"><div class="cn-muted">View only. Only the owner can log contacts.</div></section>' :
      '<section class="cn-card"><h2 style="margin-bottom:14px">LOG A CONTACT</h2><form id="logForm" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="cn-row" style="gap:16px"><label class="cn-field" style="max-width:220px"><span class="cn-lbl">DATE</span><input type="date" id="fDate" value="'+esc(d.date)+'" required></label>'+
      '<label class="cn-field" style="max-width:260px"><span class="cn-lbl">FOLLOW UP ON <span class="cn-dim" style="letter-spacing:0;text-transform:none;font-weight:400">optional · puts them on Monday follow-ups</span></span><input type="date" id="cnNext" value="'+esc(d.next||'')+'"></label></div>'+
      '<div class="cn-field"><span class="cn-lbl">TYPE</span><div class="cn-chips">'+TYPES.map((t) => '<button type="button" class="cn-chip'+(d.type===t?' cn-on':'')+'" data-act="dtype" data-arg="'+esc(t)+'">'+esc(t)+'</button>').join('')+'</div></div>'+
      (d.type === 'Email' ? '' : '<div class="cn-field"><span class="cn-lbl">HOW LONG?</span><div class="cn-chips">'+DURS.map((x) => '<button type="button" class="cn-chip'+(d.dur===x.k?' cn-on':'')+'" data-act="ddur" data-arg="'+x.k+'">'+x.l+'</button>').join('')+'</div></div>')+
      '<div class="cn-field"><span class="cn-lbl">HOW DID IT FEEL?</span><div class="cn-row" style="gap:8px">'+FEELS.map((f) => { const on = d.feel === f.v; return '<button type="button" class="cn-feel" data-act="dfeel" data-arg="'+f.v+'" aria-pressed="'+on+'" style="border-color:'+f.h+';'+(on?'background:'+f.h+';color:#0A1424':'')+'">'+f.l+'<small>'+(f.v>0?'+':'')+f.v+'</small></button>'; }).join('')+'</div></div>'+
      '<label class="cn-field"><span class="cn-lbl">WHAT WAS SAID? <span class="cn-dim" style="letter-spacing:0;text-transform:none;font-weight:400">optional · goes into your Daily Report</span></span><textarea id="fNote" rows="3" class="cn-in cn-note" placeholder="e.g. Big job starts in January and they need about 40 framers. Sending our W-9 and COI.">'+esc(d.note||'')+'</textarea></label>'+
      '<button type="submit" class="cn-save"'+(S.saving?' disabled':'')+'>Save contact</button><div class="cn-status" role="status">'+esc(S.msg)+'</div>'+
      '<details class="cn-dim" style="font-size:12px"><summary style="cursor:pointer">How the warmth score works</summary><p style="margin:8px 0 0;line-height:1.5">Each contact counts by how it felt, multiplied by how much that kind of contact builds trust: email 0.5×, call 1×, site visit 1.3×, in-person meeting 1.4×, lunch or coffee 1.6×, golf or event 1.8×. Length only nudges it (0.85× for under 5 minutes up to 1.15× for an hour or more), so a short positive call still counts. A neutral contact barely moves the score, but in-person time earns a little credit for showing up. Trust builds with diminishing returns and fades toward neutral when you go quiet (60-day half-life).</p></details></form></section>';
    const hist = sorted(s.list).reverse();
    const ems = EMAILS[K + ':' + p.id] || [], emailDays = new Set(hist.filter((t) => t.type === 'Email').map((t) => t.date)), usedEm = new Set();
    const notesFor = (t) => { const out = []; if (t.note) out.push(esc(t.note)); ems.forEach((m, i) => { if (m.date !== t.date || usedEm.has(i)) return; if (t.type === 'Email' || !emailDays.has(t.date)){ usedEm.add(i); out.push('<b>'+(t.type === 'Email' ? 'Email' : 'Follow-up email')+(m.subject ? ' · '+esc(m.subject) : '')+':</b> '+esc(m.summary)); } }); return out; };
    const old = (((window.BDMAP && window.BDMAP.OUT) || {})[pkey(p)] || []).filter((e) => e && e.at).map((e) => ({ date: e.at, old: e }));
    const rows = hist.concat(old).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.old ? 1 : -1));
    const oldRow = (e) => '<div class="cn-hist"><span class="cn-cond" style="font-size:16px">'+esc(fmt(e.at))+'</span><span><span class="cn-pill" style="background:#C9D1DE">Logged on the old BusDev Map</span> <span class="cn-muted" style="margin-left:8px">'+esc([e.channel, e.outcome].filter(Boolean).join(' · '))+'</span></span><span></span></div>'+
      ((e.note || e.next) ? '<div class="cn-histnote">'+[e.note ? esc(e.note) : '', e.next ? '<b>Follow up '+esc(fmt(e.next))+'</b>' : ''].filter(Boolean).join('<br>')+'</div>' : '');
    const history = '<section class="cn-card"><h2>CONTACT HISTORY</h2>'+(rows.length ? rows.map((r) => { if (r.old) return oldRow(r.old); const t = r, f = feelOf(Number(t.feel)), nn = notesFor(t); if (t.next) nn.push('<b>Follow up '+esc(fmt(t.next))+'</b>'); return '<div class="cn-hist"><span class="cn-cond" style="font-size:16px">'+esc(fmt(t.date))+'</span><span><span class="cn-pill" style="background:'+f.h+'">'+f.l+'</span> <span class="cn-muted" style="margin-left:8px">'+esc(t.type)+(t.type==='Email'?'':' · '+esc(durOf(t.duration).l))+'</span></span>'+(S.canWrite?'<button type="button" class="cn-del'+(S.armed===t.id?' cn-arm':'')+'" data-act="del" data-arg="'+esc(t.id)+'">'+(S.armed===t.id?'Confirm delete':'Delete')+'</button>':'<span></span>')+'</div>'+(nn.length?'<div class="cn-histnote">'+nn.join('<br>')+'</div>':''); }).join('') : '<div class="cn-empty">No contacts logged yet.</div>')+'</section>';
    return '<div style="display:flex;flex-direction:column;gap:16px">'+head+chart+form+history+'</div>';
  }

  // Personal notes (collection "personal", same key the BusDev Map used; not copied to the public GitHub site)
  function personalBox(p){
    const v = (((window.BDMAP && window.BDMAP.PERSONAL) || {})[pkey(p)]) || {};
    if (!S.canWrite) return '<section class="cn-card">'+((v.met || v.details || v.threads) ? [['How we met', v.met], ['Personal', v.details], ['Open threads', v.threads]].filter((x) => x[1]).map((x) => '<p><b>'+x[0]+':</b> '+esc(x[1])+'</p>').join('') : '<div class="cn-empty">Nothing saved yet.</div>')+'</section>';
    return '<section class="cn-card"><form id="perForm" class="cn-perform">'+
      '<label class="cn-field"><span class="cn-lbl">HOW WE MET</span><input class="cn-in" id="perMet" value="'+esc(v.met || '')+'" placeholder="e.g. ABC South Florida mixer, Oct 2026"></label>'+
      '<label class="cn-field"><span class="cn-lbl">PERSONAL</span><textarea class="cn-in cn-note" id="perDetails" rows="3" placeholder="Family, birthdays, interests, where they\'re from">'+esc(v.details || '')+'</textarea></label>'+
      '<label class="cn-field"><span class="cn-lbl">OPEN THREADS</span><textarea class="cn-in cn-note" id="perThreads" rows="2" placeholder="What you owe them, what they owe you, what\'s in play">'+esc(v.threads || '')+'</textarea></label>'+
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="submit" class="cn-save">Save notes</button><span class="cn-status" role="status">'+esc(S.perMsg || '')+'</span>'+(v.updatedAt ? '<span class="cn-dim" style="font-size:12px">Last saved '+esc(String(v.updatedAt).slice(0, 10))+'</span>' : '')+'</div></form></section>';
  }
  async function savePersonal(p){
    const g = (id) => (document.getElementById(id) || {}).value || '';
    const doc = { met: g('perMet').trim(), details: g('perDetails').trim(), threads: g('perThreads').trim(), company: K, person: p.name, updatedAt: new Date().toISOString() };
    const key = pkey(p), B = window.BDMAP, db = pdb();
    if (B && B.PERSONAL) B.PERSONAL[key] = doc;
    S.perMsg = 'Saving…'; render();
    if (db){ try { await db.doc('personal/' + key).set(doc); S.perMsg = 'Saved.'; } catch (e) { S.perMsg = 'Could not save. Try again.'; } }
    else { try { const o = JSON.parse(localStorage.getItem('pwPersonal') || '{}'); o[key] = doc; localStorage.setItem('pwPersonal', JSON.stringify(o)); S.perMsg = 'Saved in this browser.'; } catch (e) { S.perMsg = 'Could not save.'; } }
    if (S.view === 'person') render();
  }

  function chartSVG(list){
    if (!list.length) return '<div class="cn-empty">Log a contact to start the warmth line.</div>';
    const w = walk(list), today = dayNum(todayISO()), nowX = warmthAt(list, today), pts = w.pts;
    const W = 900, H = 260, L = 44, R = 16, T = 14, Bm = 34;
    const d0 = Math.min(pts[0].d, today - 30), d1 = Math.max(today, pts[pts.length-1].d), span = Math.max(1, d1 - d0);
    const X = (d) => L + (d - d0) / span * (W - L - R), Y = (v) => T + (100 - v) / 100 * (H - T - Bm);
    let g = '';
    [[80,100,'Champion'],[60,80,'Trusted'],[40,60,'Warm'],[0,40,'Cold']].forEach((b,i) => { g += '<rect x="'+L+'" y="'+Y(b[1])+'" width="'+(W-L-R)+'" height="'+(Y(b[0])-Y(b[1]))+'" fill="'+(i%2?'rgba(127,140,160,0.05)':'rgba(127,140,160,0.12)')+'"></rect><text x="'+(W-R-6)+'" y="'+(Y(b[1])+14)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+b[2]+'</text>'; });
    [0,40,60,80,100].forEach((v) => { g += '<text x="'+(L-8)+'" y="'+(Y(v)+4)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+v+'</text>'; });
    const months = []; for (let d = d0; d <= d1; d++){ if (new Date(d*86400000).getUTCDate() === 1) months.push(d); }
    const step = Math.max(1, Math.ceil(months.length / 8));
    months.forEach((d,i) => { if (i % step) return; g += '<text x="'+X(d)+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" style="fill:var(--muted)">'+MON[new Date(d*86400000).getUTCMonth()]+'</text>'; });
    let path = 'M'+X(pts[0].d)+' '+Y(pts[0].x); pts.slice(1).forEach((q) => { path += ' L'+X(q.d)+' '+Y(q.x); }); path += ' L'+X(today)+' '+Y(nowX);
    g += '<path d="'+path+'" fill="none" stroke="#F27A1A" stroke-width="2.5" stroke-linejoin="round"></path>';
    pts.forEach((q) => { const f = feelOf(Number(q.t.feel)); g += '<circle cx="'+X(q.d)+'" cy="'+Y(q.x)+'" r="6" fill="'+f.h+'" style="stroke:var(--card)" stroke-width="2"><title>'+esc(fmt(q.t.date)+' · '+q.t.type+' · '+f.l+' · warmth '+q.x)+'</title></circle>'; });
    g += '<circle cx="'+X(today)+'" cy="'+Y(nowX)+'" r="4" style="fill:var(--fg)"><title>Today · warmth '+nowX+'</title></circle>';
    return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Warmth over time, currently '+nowX+' out of 100">'+g+'</svg>';
  }

  function tabInsights(p){
    const r = RICH[p.id], s = summary(p.id);
    let cards = [];
    if (r && p.id === 'bill-carballo') cards = r.insights.map((c) => ({ t:c[0], x:c[1], pct:c[2], src:c[3] }));
    else {
      if (r) cards = r.insights.map((c) => ({ t:c[0], x:c[1], pct:c[2], src:c[3] }));
      const boss = bossOf(p).map((id) => P[id] ? P[id].name : id).join(' and ');
      if (!r) cards.push({ t:'Role & Tenure', x: p.title + (p.since ? ', in this role since ' + p.since + '.' : '. Start date unknown.'), pct: p.since ? 90 : 60, src:'Apollo' });
      cards.push({ t:'Territory', x: (p.city || 'City unknown') + ' · ' + p.region + ' region.', pct: p.city ? 90 : 40, src:'Apollo' });
      if (!r) cards.push({ t:'Career Path', x: (p.prior && p.prior.length) ? p.prior.slice(0,2).join('; ') : 'No prior employers listed.', pct: (p.prior && p.prior.length) ? 80 : 30, src:'Apollo' });
      if (boss) cards.push({ t:'Reports To', x: boss + ' (inferred from title and region).', pct:55, src:'Org chart' });
      cards.push({ t:'Decision Style', x:'Unknown. Ask how they usually vet a new labor partner.', pct:30, src:'Ask them' });
      cards.push({ t:'Communication Preference', x: p.email ? 'Verified work email on file. Ask how they like to be reached.' : 'Unknown. Ask how they like to be reached.', pct:30, src:'Ask them' });
      cards.push({ t:'Trust Builders', x:'Unknown. Watch what they praise and complain about on your first contacts.', pct:30, src:'Ask them' });
    }
    cards.push({ t:'Relationship Warmth', x: s.st ? s.st.l + ' at ' + s.now + ' / 100, ' + s.trend.replace(/^[^ ]+ /,'').toLowerCase() + '. ' + s.list.length + ' contact' + (s.list.length===1?'':'s') + ' logged.' : 'No contacts logged yet.', pct: s.st ? 95 : 0, src:'Contact log', warm: s.st });
    return '<p class="cn-muted" style="margin:0 0 14px;font-size:14px">Signals that point to needs before they say them. Gray badges are guesses to confirm in person.</p><div class="cn-grid3">'+cards.map((c) => '<article class="cn-card cn-ins"><div style="display:flex;flex-direction:column;gap:6px"><h2 style="font-size:19px;letter-spacing:0">'+esc(c.t)+'</h2><p style="margin:0;font-size:14px;line-height:1.45;color:var(--fg)">'+esc(c.x)+'</p><span class="cn-dim" style="font-size:11px">'+esc(c.src)+'</span></div>'+(c.warm ? '<div class="cn-badge" style="background:'+c.warm.c+';color:#0A1424"><b>'+s.now+'</b><small>warmth</small></div>' : c.pct ? '<div class="cn-badge" style="background:'+(c.pct>=50?'#C9580C':'#4A5A72')+'"><b>'+c.pct+'%</b><small>confident</small></div>' : '')+'</article>').join('')+'</div>';
  }

  // ---------- render & events ----------
  // Company picker: one dropdown per territory state. A company is listed under every state where it has its HQ or an
  // office (company profile + Office Map pins) or where someone on its roster is based.
  const ST_NAME = { AL:'Alabama', FL:'Florida', GA:'Georgia', LA:'Louisiana', MS:'Mississippi', NC:'North Carolina', SC:'South Carolina', TN:'Tennessee', TX:'Texas' };
  const ST_RE = /(?:^|[\s,(/])(AL|FL|GA|LA|MS|NC|SC|TN|TX)(?=$|[\s,;)\-.]|\d)/g;
  const CHEV = '<svg class="cn-stchev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const coName = (k) => COS[k].short || (COS[k].company || {}).name || k;
  function stCodes(s){
    const out = new Set();
    String(s || '').split(/;|\n/).forEach((seg) => { if (/no office|job sites only/i.test(seg)) return; let m; ST_RE.lastIndex = 0; while ((m = ST_RE.exec(seg))) out.add(m[1]); });
    return out;
  }
  function coStates(k){
    const c = COS[k], co = c.company || {}, st = {};
    const add = (s, how) => { const o = st[s] || (st[s] = { hq:false, office:false, people:0 }); if (how === 'hq') o.hq = o.office = true; else if (how === 'office') o.office = true; else o.people++; };
    stCodes(co.hq).forEach((s) => add(s, 'hq'));
    stCodes(co.offices).forEach((s) => add(s, 'office'));
    ((window.OFFICEMAP_DATA && window.OFFICEMAP_DATA.pins) || []).forEach((p) => { if (p.k === k && ST_NAME[p.st]) add(p.st, /\bHQ\b|headquarters/i.test(p.o || '') ? 'hq' : 'office'); });
    (c.roster || []).forEach((p) => stCodes(p.city).forEach((s) => add(s, 'person')));
    return st;
  }
  function stateIndex(){
    const idx = {}, of = {};
    CO_KEYS.forEach((k) => { const st = coStates(k); of[k] = Object.keys(ST_NAME).filter((s) => st[s]); of[k].forEach((s) => (idx[s] = idx[s] || []).push(Object.assign({ k }, st[s]))); });
    Object.keys(idx).forEach((s) => idx[s].sort((a, b) => coName(a.k).localeCompare(coName(b.k))));
    return { idx, of };
  }
  function coPicker(){
    if (CO_KEYS.length < 2) return '';
    const { idx, of } = stateIndex(), states = Object.keys(ST_NAME).filter((s) => idx[s]);
    const open = S.stOpen === 'all' || S.stOpen === 'clients' || idx[S.stOpen] ? S.stOpen : null;
    const clients = CO_KEYS.filter(isClient).sort((a, b) => coName(a).localeCompare(coName(b)));
    const pill = (code, label, n) => '<button type="button" class="cn-stpill'+(open === code ? ' cn-on' : '')+(code === 'all' ? ' cn-stall' : '')+(code === 'clients' ? ' cn-stcl' : '')+'" data-act="stpick" data-arg="'+code+'" aria-expanded="'+(open === code)+'"'+(open === code ? ' aria-controls="cnStMenu"' : '')+'>'+(code === 'clients' ? '<span class="cn-star" aria-hidden="true">★</span>' : '')+esc(label)+' <span class="cn-stn">'+n+'</span>'+CHEV+'</button>';
    let menu = '';
    if (open){
      const list = open === 'all' ? CO_KEYS.slice().sort((a, b) => coName(a).localeCompare(coName(b))).map((k) => ({ k, all: true }))
        : open === 'clients' ? clients.map((k) => ({ k, all: true })) : idx[open];
      const head = open === 'all' ? 'All companies' : open === 'clients' ? 'IB Group clients' : ST_NAME[open];
      const ppl = (n) => n + (n === 1 ? ' contact' : ' contacts');
      const meta = (e) => e.all ? [of[e.k].join(', '), ppl((COS[e.k].roster || []).length)].filter(Boolean).join(' · ')
        : e.office ? (e.hq ? 'HQ' : 'Office') + (e.people ? ' · ' + ppl(e.people) : '') : ppl(e.people) + ', no office listed';
      menu = '<div class="cn-stmenu" id="cnStMenu" role="region" aria-label="'+esc(open === 'all' || open === 'clients' ? head : 'Companies in ' + head)+'">' +
        '<div class="cn-stmhead"><span><b>'+esc(head)+'</b> <span class="cn-muted">'+list.length+(list.length === 1 ? ' company' : ' companies')+'</span></span>' +
        '<button type="button" class="cn-stx" data-act="stclose" aria-label="Close list">×</button></div>' +
        '<div class="cn-stlist">' + (list.length ? '' : '<p class="cn-muted" style="margin:6px 12px;font-size:14px">No companies are starred yet. Open a company\'s profile and click Mark as IB Group client.</p>') + list.map((e) => '<button type="button" class="cn-stco'+(e.k === K ? ' cn-on' : '')+'" data-act="co" data-arg="'+esc(e.k)+'"'+(e.k === K ? ' aria-current="true"' : '')+'><span class="cn-stconame">'+starHtml(e.k)+esc(coName(e.k))+'</span><span class="cn-stcometa">'+esc(meta(e))+'</span></button>').join('') + '</div></div>';
    }
    return '<div class="cn-stbar"><span class="eyebrow cn-steb">Companies by state</span><div class="cn-stpills" role="group" aria-label="Companies by state">' +
      states.map((s) => pill(s, ST_NAME[s], idx[s].length)).join('') + pill('clients', 'IB Group clients', clients.length) + pill('all', 'All companies', CO_KEYS.length) + '</div>' + menu + '</div>';
  }
  function closeStates(focusPill){
    const was = S.stOpen; if (!was) return;
    S.stOpen = null;
    const m = document.getElementById('cnStMenu'); if (m) m.remove();
    document.querySelectorAll('#cnet .cn-stpill').forEach((b) => { b.classList.remove('cn-on'); b.setAttribute('aria-expanded', 'false'); b.removeAttribute('aria-controls'); });
    if (focusPill){ const b = document.querySelector('#cnet .cn-stpill[data-arg="'+was+'"]'); if (b) b.focus(); }
  }
  function render(){
    const root = document.getElementById('cnet'); if (!root) return;
    const sub = coPicker() + '<div class="cn-subnav" role="tablist" aria-label="'+esc(SHORT)+' network views"><button type="button" class="cn-subbtn'+(S.view==='org'?' cn-on':'')+'" data-act="org">'+esc(C.mapTab || 'Org Map')+'</button><button type="button" class="cn-subbtn'+(S.view==='company'?' cn-on':'')+'" data-act="company">Company Profile</button>'+(S.canWrite?'<button type="button" class="cn-subbtn'+(S.view==='phones'?' cn-on':'')+'" data-act="phones">Phone Numbers</button>':'')+(S.view==='person'&&P[S.pid]?'<span class="cn-crumb">› '+esc(P[S.pid].name)+'</span>':'')+'</div>';
    const hn = document.getElementById('h-network');
    if (hn){ const st = hn.querySelector('.cn-star'), on = isClient(K); if (on && !st) hn.insertAdjacentHTML('afterbegin', starHtml(K, 'cn-hstar')); else if (!on && st) st.remove(); }
    root.innerHTML = sub + (S.status ? '<div class="cn-status" style="margin:0 0 10px">'+esc(S.status)+'</div>' : '') + (S.view === 'company' ? viewCompany() : S.view === 'phones' ? viewPhones() : S.view === 'person' ? viewPerson() : viewOrg());
    fitStages();
    const f = document.getElementById('logForm'); if (f) f.addEventListener('submit', onSave);
    const jf = document.getElementById('cnJobForm'); if (jf) jf.addEventListener('submit', onJobSave);
    const jfi = document.getElementById('cnJobFile'); if (jfi) jfi.addEventListener('change', () => onJobFiles(jfi));
    const dt = document.getElementById('fDate'); if (dt) dt.addEventListener('change', () => { S.draft.date = dt.value; });
    const nt = document.getElementById('fNote'); if (nt) nt.addEventListener('input', () => { S.draft.note = nt.value; });
    const nx = document.getElementById('cnNext'); if (nx) nx.addEventListener('change', () => { S.draft.next = nx.value; });
    const lf = document.getElementById('liForm'); if (lf) lf.addEventListener('submit', (e) => { e.preventDefault(); const p = P[S.pid]; if (p) saveLi(p, (document.getElementById('liIn') || {}).value); });
    const pf = document.getElementById('perForm'); if (pf) pf.addEventListener('submit', (e) => { e.preventDefault(); const p = P[S.pid]; if (p) savePersonal(p); });
    const af = document.getElementById('addPForm'); if (af) af.addEventListener('submit', onAddPerson);
  }
  // Add a person to this company's roster. Kept in the private edits key, so phone and email never reach the public site.
  function addForm(){
    const a = S.addP || {};
    const f = (id, label, ph, type) => '<label class="cn-field"><span class="cn-lbl">'+label+'</span><input class="cn-in" id="'+id+'"'+(type ? ' type="'+type+'"' : '')+' value="'+esc(a[id] || '')+'" placeholder="'+esc(ph)+'" autocomplete="off"></label>';
    return '<form id="addPForm" class="cn-card cn-addp"><h2>ADD A PERSON AT '+esc(SHORT.toUpperCase())+'</h2>'+
      f('apName', 'NAME *', 'First and last name')+f('apTitle', 'TITLE', 'e.g. Superintendent')+f('apCity', 'CITY', 'e.g. Orlando, FL')+
      f('apPhone', 'PHONE', '(000) 000-0000', 'tel')+f('apEmail', 'EMAIL', 'name@company.com', 'email')+f('apLi', 'LINKEDIN', 'https://www.linkedin.com/in/…', 'url')+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="submit" class="cn-save">Add to '+esc(SHORT)+'</button><button type="button" class="cn-chip" data-act="addpcancel">Cancel</button><span class="cn-status" role="alert">'+esc(S.addMsg || '')+'</span></div></form>';
  }
  function onAddPerson(e){
    e.preventDefault();
    const g = (id) => ((document.getElementById(id) || {}).value || '').trim();
    const a = { name: g('apName'), title: g('apTitle'), city: g('apCity'), phone: g('apPhone'), email: g('apEmail'), li: g('apLi') };
    S.addP = Object.assign({}, { apName: a.name, apTitle: a.title, apCity: a.city, apPhone: a.phone, apEmail: a.email, apLi: a.li });
    if (!a.name){ S.addMsg = 'Type a name first.'; render(); const n = document.getElementById('apName'); if (n) n.focus(); return; }
    if (a.li && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(a.li)){ S.addMsg = 'The LinkedIn link should start with https://www.linkedin.com/'; render(); return; }
    if (ROSTER.some((p) => samePerson(p.name, a.name))){ S.addMsg = a.name + ' is already on the ' + SHORT + ' roster.'; render(); return; }
    const id = 'a-' + Date.now().toString(36);
    const list = Array.isArray(EDITS['add:' + K]) ? EDITS['add:' + K] : [];
    EDITS['add:' + K] = list.concat([{ id, name: a.name, title: a.title, city: a.city, phone: a.phone, email: a.email, li: a.li, added: todayISO() }]);
    if (!saveEdits()){ EDITS['add:' + K] = list; S.addMsg = 'Could not save. Try again.'; render(); return; }
    S.addP = null; S.addMsg = ''; applyEdits(); go('person', id);
  }
  async function removePerson(p){
    if (p.mapDoc){ const db = pdb(); const B = window.BDMAP; if (B && B.ADDED) delete B.ADDED[p.mapDoc]; if (db){ try { await db.doc('addedPeople/' + p.mapDoc).delete(); } catch (e) {} } }
    else { const list = (EDITS['add:' + K] || []).filter((a) => a.id !== p.id); if (list.length) EDITS['add:' + K] = list; else delete EDITS['add:' + K]; saveEdits(); }
    applyEdits(); go('org');
  }

  document.addEventListener('click', (e) => {
    if (S.stOpen && !(e.target.closest && e.target.closest('#cnet .cn-stbar'))) closeStates(false);
    const root = document.getElementById('cnet'); if (!root || !root.contains(e.target)) return;
    const el = e.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
    const act = el.dataset.act, arg = el.dataset.arg;
    if (act === 'client'){ setClient(!isClient(K)); const b = document.querySelector('#cnet [data-act="client"]'); if (b) b.focus(); return; }
    if (act === 'stpick'){
      S.stOpen = S.stOpen === arg ? null : arg; render();
      const t = S.stOpen ? document.querySelector('#cnStMenu .cn-stco.cn-on') || document.querySelector('#cnStMenu .cn-stco') : document.querySelector('#cnet .cn-stpill[data-arg="'+arg+'"]');
      if (t) t.focus({ preventScroll: true });
    }
    else if (act === 'stclose') closeStates(true);
    else if (act === 'liedit'){ S.liEdit = el.dataset.pid; S.liMsg = ''; render(); const i = document.getElementById('liIn'); if (i) i.focus(); }
    else if (act === 'licancel'){ S.liEdit = null; S.liMsg = ''; render(); }
    else if (act === 'addp'){ S.addP = {}; S.addMsg = ''; render(); const i = document.getElementById('apName'); if (i) i.focus(); }
    else if (act === 'addpcancel'){ S.addP = null; S.addMsg = ''; render(); }
    else if (act === 'rmperson'){ const pid = el.dataset.pid; if (S.armed !== 'rmp:' + pid){ S.armed = 'rmp:' + pid; render(); return; } S.armed = null; const p = P[pid]; if (p) removePerson(p); }
    else if (act === 'fold'){ S.fold = S.fold || new Set(); if (S.fold.has(arg)) S.fold.delete(arg); else S.fold.add(arg); render(); const b = document.querySelector('#cnet [data-act="fold"][data-arg="'+arg+'"]'); if (b) b.focus(); }
    else if (act === 'compco'){
      if (COS[arg]){ useCo(arg); S.region = null; S.stOpen = null; try { localStorage.setItem('bdp-cnet-co', K); } catch (x) {} go('company'); }
    }
    else if (act === 'co'){ S.stOpen = null; if (arg !== K){ useCo(arg); S.region = null; try { localStorage.setItem('bdp-cnet-co', K); } catch (x) {} go('org'); } else render(); }
    else if (act === 'org') go('org');
    else if (act === 'company') go('company');
    else if (act === 'person') go('person', arg);
    else if (act === 'jump'){ const t = document.getElementById('sec-' + arg); if (t) t.scrollIntoView({ behavior:'smooth', block:'start' }); }
    else if (act === 'region'){ S.region = arg ? (S.region === arg ? null : arg) : null; render(); }
    else if (act === 'regionmap'){ S.region = arg; go('org'); }
    else if (act === 'dtype'){ S.draft.type = arg; render(); }
    else if (act === 'ddur'){ S.draft.dur = arg; render(); }
    else if (act === 'dfeel'){ S.draft.feel = Number(arg); render(); }
    else if (act === 'del') onDelete(arg);
    else if (act === 'phones'){ S.sel = new Set(); S.phMsg = ''; go('phones'); }
    else if (act === 'status') setStatus(el.dataset.pid, arg || '');
    else if (act === 'pickphoto'){ const i = document.getElementById('cnPhotoIn'); if (i) i.click(); }
    else if (act === 'rmphoto') removePhoto(el.dataset.pid);
    else if (act === 'bulkapply') bulkPhone(false);
    else if (act === 'bulkclear') bulkPhone(true);
    else if (act === 'jobadd'){ S.job = newJob(); S.jobMsg = ''; S.jobArmed = null; render(); const i = document.querySelector('#cnJobForm [data-jf="project"]'); if (i) i.focus(); }
    else if (act === 'jobedit'){ const o = jobsOf(K).find((x) => x.id === arg); if (o){ S.job = editJob(o); S.jobMsg = ''; S.jobArmed = null; render(); const b = document.getElementById('cnJobs'); if (b) b.scrollIntoView({ behavior:'smooth', block:'start' }); } }
    else if (act === 'jobcancel'){ if (S.job) dropAssets(S.job.fresh); S.job = null; S.jobMsg = ''; render(); }
    else if (act === 'jobpick'){ const i = document.getElementById('cnJobFile'); if (i) i.click(); }
    else if (act === 'jobfilerm'){ const j = S.job; if (j){ j.files = j.files.filter((x) => x.id !== arg); if (j.fresh.indexOf(arg) >= 0){ j.fresh = j.fresh.filter((x) => x !== arg); dropAssets([arg]); } else j.removed.push(arg); render(); } }
    else if (act === 'jobdel'){
      if (!S.canWrite) return;
      if (S.jobArmed !== arg){ S.jobArmed = arg; render(); return; }
      const list = opps(), i = list ? list.findIndex((x) => x.id === arg && x.co === K) : -1;
      S.jobArmed = null;
      if (i >= 0){ const gone = list.splice(i, 1)[0]; if (saveOpps()){ dropAssets((gone.files || []).map((x) => x.id)); S.jobMsg = 'Removed "'+gone.project+'" from the Pipeline.'; } else { list.splice(i, 0, gone); S.jobMsg = 'Could not remove. Try again.'; } }
      render();
    }
  });

  // Contact logs live in the portal's own storage key, which sync.js mirrors to the portal database.
  const KEY = 'bdp-cnet-logs';
  function loadLogs(){ try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); S.logs = Array.isArray(v) ? v.filter((t) => t && t.contact && t.date) : []; } catch (e) { S.logs = []; } }
  function saveLogs(){ try { localStorage.setItem(KEY, JSON.stringify(S.logs)); } catch (e) { return false; } try { window.dispatchEvent(new Event('cnet:logs')); } catch (e) {} return true; }

  // ---------- Monday follow-ups (shown on the Overview): everyone you've actually talked with, from the contact log
  // and the old BusDev Map log. "Talked" = a contact with notes on what was said, or an in-person contact.
  const FU_BUCKETS = ['Follow-up due', 'Talked this past week', 'Going cold - no contact in 3+ weeks', 'Earlier conversations'];
  const isoAdd = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const mondayISO = () => { const t = todayISO(), wd = new Date(t + 'T12:00:00').getDay(); return isoAdd(t, wd === 1 ? 0 : (8 - wd) % 7); };
  const IN_PERSON = ['In-person meeting', 'Lunch / coffee', 'Site visit', 'Golf / event'];
  function followups(){
    const mon = mondayISO(), weekStart = isoAdd(mon, -7), today = todayISO(), groups = {};
    S.logs.forEach((t) => { const k = (t.company || 'acousti') + '|' + t.contact; (groups[k] = groups[k] || []).push({ at: t.date, note: t.note || '', type: t.type || '', next: t.next || '', order: t.created || 0 }); });
    const B = window.BDMAP;
    Object.keys((B && B.OUT) || {}).forEach((mk) => {
      const ck = mk.split('__')[0], c = COS[ck]; if (!c) return;
      const p = (c.roster || []).find((x) => x.mapKey === mk); if (!p) return;
      (B.OUT[mk] || []).forEach((e) => { if (e && e.at) (groups[ck + '|' + p.id] = groups[ck + '|' + p.id] || []).push({ at: e.at, note: e.note || '', type: e.channel || '', next: e.next || '', order: 0 }); });
    });
    const rows = [];
    Object.keys(groups).forEach((k) => {
      const all = groups[k], talked = all.filter((x) => x.note.trim() || IN_PERSON.includes(x.type));
      if (!talked.length) return;
      const [ck, pid] = k.split('|'), c = COS[ck], p = c && (c.roster || []).find((x) => x.id === pid); if (!p) return;
      const by = (a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order;
      const lastTalk = talked.slice().sort(by).pop(), latest = all.slice().sort(by).pop(), lastAny = latest.at, next = latest.next || '';
      const ago = Math.round(dayNum(today) - dayNum(lastAny));
      const bucket = next && next <= mon ? 0 : lastTalk.at >= weekStart ? 1 : (!next && ago > 21) ? 2 : 3;
      const client = isClient(ck);
      const liv = (p.mapKey ? (((B && B.LI) || {})[p.mapKey]) : EDITS['li:' + ck + ':' + p.id]) || p.li || '';
      rows.push({ key: ck + '|' + p.id, companyKey: ck, company: c.short || ck, person: p.name, title: p.title || '', client, lastTalk: { at: lastTalk.at, note: lastTalk.note }, lastAny, next, linkedin: liv, onMap: true, bucket });
    });
    return rows.sort((a, b) => a.bucket - b.bucket || (a.next || '9').localeCompare(b.next || '9') || b.lastTalk.at.localeCompare(a.lastTalk.at));
  }
  function fuText(){
    const rows = followups(), nice = (iso) => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); };
    return 'Monday follow-ups, ' + nice(mondayISO()) + '\n\n' + FU_BUCKETS.map((t, bi) => { const rs = rows.filter((r) => r.bucket === bi); if (!rs.length) return '';
      return t + '\n' + rs.map((r) => '- ' + r.person + ', ' + r.company + (r.title ? ' (' + r.title + ')' : '') + ': talked ' + nice(r.lastTalk.at) + (r.next ? ', follow up ' + nice(r.next) : '') + (r.lastTalk.note ? '. ' + r.lastTalk.note.replace(/\s+/g, ' ').slice(0, 200) : '')).join('\n') + '\n'; }).filter(Boolean).join('\n');
  }

  function onSave(e){
    e.preventDefault();
    if (!S.canWrite){ S.msg = 'This copy is view-only.'; render(); return; }
    if (S.draft.feel === null){ S.msg = 'Pick how the contact felt before saving.'; render(); return; }
    const dEl = document.getElementById('fDate'); if (dEl && dEl.value) S.draft.date = dEl.value;
    const body = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), company: K, companyName: SHORT, contact: S.pid, name: P[S.pid] ? P[S.pid].name : '', title: P[S.pid] ? P[S.pid].title : '', date: S.draft.date || todayISO(), type: S.draft.type, duration: S.draft.type === 'Email' ? '' : S.draft.dur, feel: S.draft.feel, created: Date.now() };
    const nEl = document.getElementById('fNote'), note = ((nEl ? nEl.value : S.draft.note) || '').trim().slice(0, 800);
    if (note) body.note = note;
    const xEl = document.getElementById('cnNext'), next = xEl ? xEl.value : (S.draft.next || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(next || '')) body.next = next;
    S.logs.push(body);
    if (saveLogs()){ S.draft.feel = null; S.draft.note = ''; S.draft.next = ''; S.msg = 'Saved.'; } else { S.logs.pop(); S.msg = 'Could not save. Try again.'; }
    render();
  }
  function onDelete(id){
    if (!S.canWrite) return;
    if (S.armed !== id){ S.armed = id; render(); return; }
    S.armed = null; S.logs = S.logs.filter((t) => t.id !== id); saveLogs(); render();
  }


  // ---------- phone numbers: edit one, or set many at once ----------
  // Each phone number in the text becomes its own link; labels and notes around them stay plain text. (Before, a field
  // like "Nashville (615) 394-2280 (Chamber listing) ..." became one tel: link of every digit run together.)
  const PHONE_RX = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext\.?)\s*\d{1,6})?/gi;
  const tel = (n) => {
    const str = String(n == null ? '' : n); let out = '', last = 0, m;
    PHONE_RX.lastIndex = 0;
    while ((m = PHONE_RX.exec(str))){
      const digits = m[0].replace(/(?:x|ext\.?)\s*\d+$/i, '').replace(/[^\d+]/g, '');
      out += esc(str.slice(last, m.index)) + '<a href="tel:'+esc(digits)+'">'+esc(m[0])+'</a>';
      last = m.index + m[0].length;
    }
    return out + esc(str.slice(last));
  };
  function viewPhones(){
    const rows = ROSTER.filter((p) => !S.phRegion || p.region === S.phRegion).sort((a, b) => (REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region)) || a.name.localeCompare(b.name));
    const n = rows.filter((p) => S.sel.has(p.id)).length, all = rows.length && n === rows.length;
    const opts = '<option value="">All regions ('+ROSTER.length+')</option>' + REGIONS.map((r) => '<option value="'+esc(r)+'"'+(S.phRegion===r?' selected':'')+'>'+esc(r)+' ('+ROSTER.filter((p) => p.region === r).length+')</option>').join('');
    const lines = '<div class="cn-card" style="margin-bottom:14px"><h2 style="margin-bottom:4px">OFFICE LINES</h2><div class="cn-dim" style="font-size:13px;margin-bottom:12px">Give each region its own office number. People in that region show it under their direct number. Leave a region blank to use the main line.</div><div class="cn-reglines">'+
      '<label class="cn-phf"><span class="cn-lbl">'+esc(SHORT.toUpperCase())+' MAIN LINE</span><input type="tel" class="cn-in" id="cnMain" value="'+esc(CO.phone || '')+'" placeholder="(000) 000-0000" autocomplete="off"></label>'+
      REGIONS.map((r) => '<label class="cn-phf"><span class="cn-lbl">'+esc(r.toUpperCase())+' <span class="cn-dim" style="font-weight:400">· '+ROSTER.filter((p) => p.region === r).length+'</span></span><input type="tel" class="cn-in cn-regph" data-reg="'+esc(r)+'" value="'+esc(regLine(r))+'" placeholder="'+esc(CO.phone ? 'Main line' : '(000) 000-0000')+'" autocomplete="off"></label>').join('')+'</div></div>';
    return '<div class="cn-phead"><h1>Phone Numbers - '+esc(SHORT)+'</h1></div>'+lines+
      '<div class="cn-card cn-phtools">'+
        '<label class="cn-phf"><span class="cn-lbl">SHOW</span><select class="cn-in" id="cnPhReg">'+opts+'</select></label>'+
        '<div class="cn-phf"><span class="cn-lbl">SET A NUMBER FOR EVERYONE CHECKED</span><div style="display:flex;gap:8px;flex-wrap:wrap"><input type="tel" class="cn-in" id="cnBulk" placeholder="(000) 000-0000" autocomplete="off" style="flex:1;min-width:160px">'+
          '<button type="button" class="cn-save" data-act="bulkapply" id="cnBulkGo"'+(n?'':' disabled')+'>Apply to <span id="cnSelN">'+n+'</span> checked</button><button type="button" class="cn-subbtn" data-act="bulkclear" id="cnBulkClr"'+(n?'':' disabled')+'>Clear their numbers</button></div></div>'+
      '</div>'+
      '<div class="cn-dim" style="font-size:13px;margin:10px 2px;min-height:18px" aria-live="polite">'+esc(S.phMsg || 'Type a number in any row and it saves when you leave the box. Blank means they show their region\'s office line, or the main line.')+'</div>'+
      '<div class="cn-card" style="padding:0;overflow-x:auto"><table class="cn-phtable"><thead><tr><th style="width:44px"><input type="checkbox" id="cnSelAll" aria-label="Check everyone shown"'+(all?' checked':'')+'></th><th>Name</th><th>Title</th><th>Region</th><th>Direct phone</th></tr></thead><tbody>'+
      rows.map((p) => '<tr><td><input type="checkbox" class="cn-selone" data-pid="'+esc(p.id)+'" aria-label="Check '+esc(p.name)+'"'+(S.sel.has(p.id)?' checked':'')+'></td><td><button type="button" class="cn-linkbtn" data-act="person" data-arg="'+esc(p.id)+'">'+esc(p.name)+'</button>'+goneTag(p)+'</td><td class="cn-muted">'+esc(p.title)+'</td><td class="cn-muted">'+esc(p.region)+'</td>'+
        '<td><input type="tel" class="cn-in cn-ph" data-pid="'+esc(p.id)+'" value="'+esc(p.phone || '')+'" placeholder="'+esc(regLine(p.region) ? p.region + ' line' : CO.phone ? 'Main line' : 'No number')+'" aria-label="Direct phone for '+esc(p.name)+'" autocomplete="off"></td></tr>').join('')+
      '</tbody></table></div>';
  }
  const regLine = (r) => ((EDITS[ek(K, '@' + r)] || {}).phone || '');
  const okPhone = (v) => !v || (v.replace(/\D/g, '').length >= 7 && /^[\d\s()+.\-xext]+$/i.test(v));
  function setPhone(pid, v){
    v = String(v || '').trim();
    if (!okPhone(v)) return false;
    const k = ek(K, pid), e = Object.assign({}, EDITS[k]);
    if (v) e.phone = v; else delete e.phone;
    if (Object.keys(e).length) EDITS[k] = e; else delete EDITS[k];
    return true;
  }
  function setStatus(pid, st){
    if (!S.canWrite || !P[pid]) return;
    const k = ek(K, pid), before = EDITS[k], e = Object.assign({}, before);
    if (st) e.status = st; else delete e.status;
    if (Object.keys(e).length) EDITS[k] = e; else delete EDITS[k];
    if (!saveEdits()){ if (before) EDITS[k] = before; else delete EDITS[k]; S.msg = 'Could not save. Try again.'; }
    applyEdits(); render();
  }
  function bulkPhone(clear){
    if (!S.canWrite) return;
    const v = clear ? '' : (document.getElementById('cnBulk') || {}).value || '';
    const ids = ROSTER.filter((p) => S.sel.has(p.id) && (!S.phRegion || p.region === S.phRegion)).map((p) => p.id);
    if (!ids.length){ S.phMsg = 'Check at least one person first.'; render(); return; }
    if (!clear && !v.trim()){ S.phMsg = 'Type the number to apply first.'; render(); return; }
    if (!okPhone(v.trim())){ S.phMsg = 'That does not look like a phone number.'; render(); return; }
    const before = JSON.stringify(EDITS);
    ids.forEach((id) => setPhone(id, v));
    if (saveEdits()){ applyEdits(); S.phMsg = (clear ? 'Cleared the number for ' : 'Set ' + v.trim() + ' for ') + ids.length + (ids.length === 1 ? ' person.' : ' people.'); }
    else { EDITS = JSON.parse(before); S.phMsg = 'Could not save. Try again.'; }
    render();
  }

  // ---------- your edits (phones) live in a portal key that syncs; photos live in their own database collection ----------
  const EKEY = 'bdp-cnet-edits', PKEY = 'bdp-cnet-photos';
  let EDITS = {};
  const PHOTOS = {};
  const ek = (co, pid) => co + ':' + (pid || '');
  function loadEdits(){ try { const v = JSON.parse(localStorage.getItem(EKEY) || '{}'); EDITS = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { EDITS = {}; } }
  function saveEdits(){ try { localStorage.setItem(EKEY, JSON.stringify(EDITS)); return true; } catch (e) { return false; } }
  // IB Group clients (companies we're working with now) get a gold star. The starting list is the client flag from the
  // company research (the old BusDev Map's stars); a star you add or take off on the company's profile wins. Your
  // choices sit in the private edits key as "client:<company>" = true / false.
  let CL_DEF = null;
  function clientDefaults(){
    if (CL_DEF) return CL_DEF;
    const B = window.BDMAP; if (!B || !B.COMPANIES) return {};
    CL_DEF = {}; B.COMPANIES.forEach((e) => { try { if (B.isClient && B.isClient(e)) CL_DEF[e.key] = true; } catch (x) {} });
    return CL_DEF;
  }
  function isClient(k){
    const o = EDITS['client:' + k];
    if (o === true || o === false) return o;
    return !!clientDefaults()[k];
  }
  function starHtml(k, cls){ return isClient(k) ? '<span class="cn-star'+(cls ? ' '+cls : '')+'" role="img" aria-label="IB Group client" title="IB Group client">★</span>' : ''; }
  function clientToggle(){
    const on = isClient(K);
    if (!S.canWrite) return on ? '<span class="cn-clientbadge"><span class="cn-star" aria-hidden="true">★</span>IB Group client</span>' : '';
    return '<button type="button" class="cn-clientbtn'+(on ? ' cn-on' : '')+'" data-act="client" aria-pressed="'+on+'" title="'+(on ? 'Click to take the star off' : 'Star this company as a current IB Group client')+'">'+
      '<span class="cn-star" aria-hidden="true">'+(on ? '★' : '☆')+'</span>'+(on ? 'IB Group client' : 'Mark as IB Group client')+'</button>';
  }
  function setClient(on){
    const key = 'client:' + K, before = EDITS[key];
    if (on === !!clientDefaults()[K]) delete EDITS[key]; else EDITS[key] = on;   // only store choices that differ from the research
    if (!saveEdits()){ if (before === undefined) delete EDITS[key]; else EDITS[key] = before; S.msg = 'Could not save. Try again.'; }
    clientsChanged(); render();
  }
  function clientsChanged(){ try { window.dispatchEvent(new Event('cnet:clients')); } catch (e) {} }
  // People added by hand: in Client Networks (kept in the private edits key "add:<company>") and the ones added on the
  // old BusDev Map (collection "addedPeople"). Rebuilt from scratch each time so removals take effect.
  function metroName(id){
    const B = window.BDMAP; if (!id || !B || !B.STATES) return '';
    for (const st of B.STATES) for (const m of st.metros || []) if (m[0] === id) return m[1] + ', ' + st.name;
    return '';
  }
  function mergeAdded(){
    const B = window.BDMAP, list = [];
    Object.values((B && B.ADDED) || {}).forEach((a) => { if (a && a.company && a.name) list.push({ k: a.company, id: 'added-' + a.id, name: a.name, title: a.title || '', city: metroName(a.metro), phone: a.phone || '', email: a.email || '', li: '', mapKey: a.company + '__added-' + a.id, mapDoc: a.id, when: (a.createdAt || '').slice(0, 10) }); });
    Object.keys(EDITS).forEach((x) => { if (x.indexOf('add:') === 0 && Array.isArray(EDITS[x])) EDITS[x].forEach((a) => { if (a && a.id && a.name) list.push({ k: x.slice(4), id: a.id, name: a.name, title: a.title || '', city: a.city || '', phone: a.phone || '', email: a.email || '', li: a.li || '', mapKey: x.slice(4) + '__' + a.id, mapDoc: '', when: a.added || '' }); }); });
    CO_KEYS.forEach((k) => { const c = COS[k]; if ((c.roster || []).some((p) => p.handAdded)) c.roster = c.roster.filter((p) => !p.handAdded); });
    list.forEach((a) => {
      const c = COS[a.k]; if (!c) return; c.roster = c.roster || [];
      if (c.roster.some((p) => p.id === a.id || samePerson(p.name, a.name))) return;
      const g = groupOf(a.title);
      c.roster.push({ id: a.id, name: a.name, title: a.title, city: a.city, region: regionIn(c, a.city, a.title, g), group: g, li: a.li, email: a.email, phone: a.phone,
        since: '', prior: [], conf: 'Added by you' + (a.when ? ' on ' + a.when : ''), handAdded: true, mapKey: a.mapKey, mapDoc: a.mapDoc });
    });
  }
  function applyEdits(){
    mergeAdded();
    Object.keys(COS).forEach((co) => {
      const c = COS[co]; if (!c.company) c.company = {};
      if (!('_phone0' in c)) c._phone0 = c.company.phone || '';
      const ce = EDITS[ek(co)]; c.company.phone = (ce && ce.phone) || c._phone0;
      (c.roster || []).forEach((p) => {
        if (!('_photo0' in p)) p._photo0 = p.photo || '';
        if (!('_phone0' in p)) p._phone0 = p.phone || '';
        const e = EDITS[ek(co, p.id)];
        p.phone = (e && e.phone) || p._phone0;
        p.status = (e && (e.status === 'retired' || e.status === 'left')) ? e.status : '';
        p.photo = PHOTOS[co + '__' + p.id] || p._photo0;
      });
    });
    useCo(K);
  }
  const pdb = () => (window.BDP_SYNC && window.BDP_SYNC.db && window.BDP_SYNC.db()) || null;
  async function loadPhotos(){
    const db = pdb();
    if (db){ try { const s = await db.collection('cnetPhotos').limit(1000).get(); s.docs.forEach((d) => { const v = d.data(); if (v && v.src) PHOTOS[d.id] = v.src; }); } catch (e) { console.warn('cnet photos', e); } }
    else { try { Object.assign(PHOTOS, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) {} }
  }
  // Email summaries (collection "emails", one doc per email; Claude saves one for every email it drafts with Samuel)
  const EMAILS = {};
  async function loadEmails(){
    const db = pdb(); if (!db) return;
    try { const s = await db.collection('emails').limit(1000).get(); s.docs.forEach((d) => { const v = d.data() || {}; if (!v.contact || !v.summary) return; const k = (v.company || '') + ':' + v.contact; (EMAILS[k] = EMAILS[k] || []).push(v); }); } catch (e) { console.warn('cnet emails', e); }
    window.CNET_EMAILS = [].concat.apply([], Object.values(EMAILS)); window.dispatchEvent(new Event('cnet:emails'));
  }
  async function storePhoto(id, src){
    const db = pdb();
    if (db){ if (src) await db.doc('cnetPhotos/' + id).set({ src: src, at: new Date().toISOString() }); else await db.doc('cnetPhotos/' + id).delete(); return; }
    const all = {}; try { Object.assign(all, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) {}
    if (src) all[id] = src; else delete all[id];
    localStorage.setItem(PKEY, JSON.stringify(all));
  }
  // square crop (biased to the top, where faces are), 320px JPEG: about 20 KB a photo
  function toSquare(file){
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('type'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const N = 320, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const g = cv.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, N, N);
        g.drawImage(img, (w - s) / 2, (h - s) * 0.3, s, s, 0, 0, N, N);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('read')); };
      img.src = url;
    });
  }
  async function setPhoto(pid, file){
    if (!S.canWrite || !P[pid]) return;
    const id = K + '__' + pid, prev = PHOTOS[id];
    S.photoMsg = 'Saving photo…'; render();
    try { const src = await toSquare(file); PHOTOS[id] = src; applyEdits(); render(); await storePhoto(id, src); S.photoMsg = 'Photo saved.'; }
    catch (e) { if (prev) PHOTOS[id] = prev; else delete PHOTOS[id]; applyEdits(); S.photoMsg = e && e.message === 'type' ? 'That file is not an image. Use a JPG or PNG.' : e && e.message === 'read' ? 'Could not read that image. Try a JPG or PNG.' : 'Could not save the photo. Try again.'; }
    render();
  }
  async function removePhoto(pid){
    if (!S.canWrite) return;
    const id = K + '__' + pid, prev = PHOTOS[id];
    delete PHOTOS[id]; applyEdits(); S.photoMsg = 'Removing…'; render();
    try { await storePhoto(id, ''); S.photoMsg = 'Photo removed.'; } catch (e) { PHOTOS[id] = prev; applyEdits(); S.photoMsg = 'Could not remove the photo. Try again.'; }
    render();
  }
  const dropZone = (e) => e.target && e.target.closest ? e.target.closest('#cnet .cn-photo[data-pid]') : null;
  document.addEventListener('dragover', (e) => { const z = dropZone(e); if (!z || !S.canWrite) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('cn-drop'); });
  document.addEventListener('dragleave', (e) => { const z = dropZone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('cn-drop'); });
  document.addEventListener('drop', (e) => {
    const z = dropZone(e); if (!z || !S.canWrite) return;
    e.preventDefault(); z.classList.remove('cn-drop');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setPhoto(z.dataset.pid, f);
    else { S.photoMsg = 'Drop an image file from your computer. If the picture is on a website, save it first.'; render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.stOpen){ const inBar = e.target && e.target.closest && e.target.closest('#cnet .cn-stbar'); closeStates(!!inBar); } });
  document.addEventListener('keydown', (e) => { const z = e.target && e.target.closest && e.target.closest('#cnet .cn-photo[data-act=pickphoto]'); if (z && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); z.click(); } });
  document.addEventListener('change', (e) => {
    const root = document.getElementById('cnet'); if (!root || !root.contains(e.target)) return;
    const t = e.target;
    if (t.id === 'cnPhotoIn'){ const f = t.files && t.files[0]; const z = root.querySelector('.cn-photo[data-pid]'); if (f && z) setPhoto(z.dataset.pid, f); return; }
    if (t.id === 'cnPhReg'){ S.phRegion = t.value || null; S.sel = new Set(); S.phMsg = ''; render(); return; }
    if (t.id === 'cnMain'){
      const v = t.value.trim();
      if (!okPhone(v)){ S.phMsg = 'The main line does not look like a phone number.'; render(); return; }
      const k = ek(K); if (v && v !== COS[K]._phone0) EDITS[k] = { phone: v }; else delete EDITS[k];
      S.phMsg = saveEdits() ? 'Main line saved.' : 'Could not save. Try again.'; applyEdits(); render(); return;
    }
    if (t.classList.contains('cn-regph')){
      const v = t.value.trim(), r = t.dataset.reg;
      if (!okPhone(v)){ S.phMsg = 'The ' + r + ' line does not look like a phone number. It was not saved.'; render(); return; }
      const k = ek(K, '@' + r); if (v) EDITS[k] = { phone: v }; else delete EDITS[k];
      S.phMsg = saveEdits() ? (v ? r + ' office line saved.' : r + ' now uses the main line.') : 'Could not save. Try again.'; render(); return;
    }
    if (t.classList.contains('cn-ph')){
      const ok = setPhone(t.dataset.pid, t.value);
      S.phMsg = !ok ? 'That does not look like a phone number. It was not saved.' : saveEdits() ? 'Saved ' + (P[t.dataset.pid] ? P[t.dataset.pid].name : '') + '.' : 'Could not save. Try again.';
      applyEdits(); render(); return;
    }
    if (t.id === 'cnSelAll' || t.classList.contains('cn-selone')){
      if (t.id === 'cnSelAll') root.querySelectorAll('.cn-selone').forEach((c) => { c.checked = t.checked; });
      S.sel = new Set([...root.querySelectorAll('.cn-selone')].filter((c) => c.checked).map((c) => c.dataset.pid));
      const all = root.querySelectorAll('.cn-selone'), sa = document.getElementById('cnSelAll');
      if (sa) sa.checked = all.length > 0 && S.sel.size === all.length;
      const n = document.getElementById('cnSelN'); if (n) n.textContent = S.sel.size;
      ['cnBulkGo', 'cnBulkClr'].forEach((id) => { const b = document.getElementById(id); if (b) b.disabled = !S.sel.size; });
    }
  });

  // job form fields: keep the draft in S.job so re-renders (uploads, messages) never lose typing
  function jobField(e){
    const t = e.target; if (!S.job || !t || !t.dataset || !t.dataset.jf) return;
    S.job[t.dataset.jf] = t.value;
    if (t.dataset.jf === 'start' || t.dataset.jf === 'end'){ const w = weeksBetween(S.job.start, S.job.end), el = document.getElementById('cnJobWeeks'); if (el) el.textContent = w ? w + ' week' + (w === 1 ? '' : 's') : '—'; }
  }
  document.addEventListener('input', jobField);
  document.addEventListener('change', jobField);
  // the Pipeline tab can change these jobs too: refresh the company view when the portal's pipeline re-renders
  window.addEventListener('hashchange', () => { if (location.hash === '#network' && S.view === 'company' && !S.job) render(); });

  // another device or a scheduled run changed these: reload them here (never re-render under someone typing)
  const idle = () => { const r = document.getElementById('cnet'), a = document.activeElement; return !(r && a && r.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  if (window.BDP_SYNC && window.BDP_SYNC.onRemote){
    window.BDP_SYNC.onRemote(KEY, () => { loadLogs(); try { window.dispatchEvent(new Event('cnet:logs')); } catch (e) {} if (idle()) render(); });
    window.BDP_SYNC.onRemote('bdp-cnet-edits', () => { loadEdits(); applyEdits(); clientsChanged(); if (idle()) render(); });
    window.BDP_SYNC.onRemote('bdp-opps', () => { if (S.view === 'company' && !S.job && idle()) render(); });
    window.BDP_SYNC.onRemote('bdp-projects', () => { if (S.view === 'company' && !S.job && idle()) render(); });
  }

  // ---------- boot ----------
  loadLogs();
  S.canWrite = !(window.BDP_SYNC && window.BDP_SYNC.mode && window.BDP_SYNC.mode() === 'snapshot');
  if (!S.canWrite) S.status = 'View-only copy. Contacts are logged in the portal on claude.ai.';
  loadEdits(); applyEdits();
  render();
  loadEmails().then(() => { if (S.view === 'person' && (!document.activeElement || !document.getElementById('cnet') || !document.getElementById('cnet').contains(document.activeElement))) render(); });
  loadPhotos().then(() => { applyEdits(); if (!document.activeElement || !document.getElementById('cnet') || !document.getElementById('cnet').contains(document.activeElement)) render(); });
  window.addEventListener('resize', fitStages);
  window.addEventListener('hashchange', () => { if (location.hash === '#network') setTimeout(fitStages, 0); });
  // saved LinkedIn links, people added on the old map and its outreach log arrive from the database after load
  window.addEventListener('bdmap:change', () => { applyEdits(); const a = document.activeElement, r = document.getElementById('cnet'); if (!(r && a && r.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) render(); });
  window.addEventListener('bdp:projects', () => { if (S.view === 'company' && !S.job) render(); });
  window.CNET = {
    // where: 'profile' opens the Company Profile, 'log' opens the person at their contact log; otherwise the org map / person
    open(companyKey, personName, where){
      if (companyKey && COS[companyKey] && companyKey !== K){ useCo(companyKey); S.region = null; try { localStorage.setItem('bdp-cnet-co', K); } catch (x) {} }
      S.stOpen = null;
      let pid = null;
      if (personName){ const n = nm(personName); const hit = ROSTER.find((p) => nm(p.name) === n); if (hit) pid = hit.id; }
      location.hash = '#network';
      setTimeout(() => {
        if (pid) go('person', pid); else go(where === 'profile' ? 'company' : 'org'); fitStages();
        if (pid && where === 'log') setTimeout(() => { const s = document.getElementById('sec-connect'); if (s) s.scrollIntoView({ block:'start' }); }, 60);
      }, 30);
    },
    followups, fuText, monday: mondayISO, FU_BUCKETS,
    people(companyKey){ const c = COS[companyKey]; return c ? (c.roster || []).map((p) => ({ id:p.id, name:p.name, title:p.title || '', city:p.city || '' })) : []; },
    // contact history with one person at a company: number of logged contacts, last one, and current warmth
    contact(companyKey, name){
      const c = COS[companyKey]; if (!c) return null;
      const p = (c.roster || []).find((x) => nm(x.name) === nm(name)); if (!p) return null;
      const list = S.logs.filter((t) => t.contact === p.id && (t.company || 'acousti') === companyKey);
      // contacts logged on the old BusDev Map count too
      const B = window.BDMAP, old = (B && B.OUT && p.mapKey && B.OUT[p.mapKey]) || [];
      if (!list.length && !old.length) return { count:0, last:'', lastType:'', now:null, label:'', color:'' };
      let lastAt = '', lastType = '';
      if (list.length){ const l = sorted(list)[list.length - 1]; lastAt = l.date; lastType = l.type || ''; }
      old.forEach((e) => { const d = String(e.at || '').slice(0, 10); if (d && d > lastAt){ lastAt = d; lastType = e.channel || ''; } });
      const now = list.length ? warmthAt(list, dayNum(todayISO())) : null, st = now == null ? null : stageOf(now);
      return { count:list.length + old.length, last:lastAt, lastType, now, label: st ? st.l : '', color: st ? st.c : '' };
    },
    hasCompany(companyKey){ return !!COS[companyKey]; },
    // IB Group client (gold star): research flag unless you changed it on the company profile
    isClient(companyKey){ return isClient(companyKey); },
    clients(){ return CO_KEYS.filter(isClient); },
    hasPerson(name, companyKey){ const n = String(name || '').toLowerCase().replace(/[^a-z]/g, ''); const list = COS[companyKey || 'acousti'] ? COS[companyKey || 'acousti'].roster || [] : ROSTER; return list.some((p) => p.name.toLowerCase().replace(/[^a-z]/g, '') === n); },
    companies(){ return CO_KEYS.map((k) => ({ key: k, name: COS[k].short || k, people: (COS[k].roster || []).length })); }
  };
  try { window.dispatchEvent(new Event('cnet:logs')); } catch (e) {}  // the Overview's follow-ups can draw now
  clientsChanged();  // Contacts, Office Map and the Company researcher pick up the client stars
})();
