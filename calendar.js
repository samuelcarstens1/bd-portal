/* Calendar tab: one place to see what is coming up. Three kinds of things land on it:
   - Meetings you add here (phone calls, video calls, in-person meetings), stored under "bdp-calendar" and synced by sync.js.
     Each meeting carries a call sheet: background, things to do first, questions to ask (with room for the answers) and the outcome.
   - Project dates from the Projects tab (next step, bid due, construction and interiors dates). Read-only here.
   - Follow-up dates set in the Client Networks contact log. Read-only here.
   The next meeting sits at the top of the tab and on the Overview; on the day of the meeting its call sheet opens by itself. */
(function(){
  'use strict';
  var root = document.getElementById('calendar'); if (!root) return;
  var KEY = 'bdp-calendar';
  var L = window.BDP_LOCALE || 'en-US', ES = String(L).toLowerCase().indexOf('es') === 0;
  function tx(en, es){ return ES ? es : en; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function nm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function uid(){ return 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var KINDS = [
    { k:'call', l:tx('Phone call', 'Llamada'), group:'scheduled' },
    { k:'video', l:tx('Video call', 'Videollamada'), group:'scheduled' },
    { k:'inperson', l:tx('In person', 'En persona'), group:'inperson' }];
  function kindOf(k){ for (var i = 0; i < KINDS.length; i++) if (KINDS[i].k === k) return KINDS[i]; return KINDS[0]; }
  var GROUPS = [
    { k:'scheduled', l:tx('Scheduled calls', 'Llamadas programadas') },
    { k:'inperson', l:tx('In person', 'En persona') },
    { k:'project', l:tx('Projects', 'Proyectos') },
    { k:'followup', l:tx('Follow-ups', 'Seguimientos') }];
  var GLABEL = { scheduled:tx('Scheduled', 'Programada'), inperson:tx('In person', 'En persona'), project:tx('Project', 'Proyecto'), followup:tx('Follow-up', 'Seguimiento') };

  // ---------- dates ----------
  function pad(n){ return String(n).padStart(2, '0'); }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO(){ return iso(new Date()); }
  function isDay(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v || ''); }
  function isMonth(v){ return /^\d{4}-\d{2}$/.test(v || ''); }
  function toDate(v){ var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1), 12); }
  function dayDiff(a, b){ return Math.round((toDate(a) - toDate(b)) / 864e5); }
  function fmtLong(v){ return toDate(v).toLocaleDateString(L, { weekday:'long', month:'short', day:'numeric' }); }
  function fmtShort(v){ return toDate(v).toLocaleDateString(L, { weekday:'short', month:'short', day:'numeric' }); }
  function fmtMonth(y, m){ return new Date(y, m, 1, 12).toLocaleDateString(L, { month:'long', year:'numeric' }); }
  function fmtTime(t){ if (!/^\d{1,2}:\d{2}$/.test(t || '')) return ''; var p = t.split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function rel(v){
    var n = dayDiff(v, todayISO());
    if (n === 0) return tx('Today', 'Hoy');
    if (n === 1) return tx('Tomorrow', 'Mañana');
    if (n === -1) return tx('Yesterday', 'Ayer');
    if (n > 1) return tx('In ' + n + ' days', 'En ' + n + ' días');
    return tx(-n + ' days ago', 'Hace ' + (-n) + ' días');
  }

  // ---------- storage ----------
  function load(){ try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(function(e){ return e && e.id && isDay(e.date); }) : []; } catch (x) { return []; } }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(EV)); } catch (x) { S.msg = tx('Could not save. Try again.', 'No se pudo guardar. Intente de nuevo.'); return false; } try { window.dispatchEvent(new Event('bdp:calendar')); } catch (x) {} return true; }
  function byId(id){ for (var i = 0; i < EV.length; i++) if (EV[i].id === id) return EV[i]; return null; }
  // Change one meeting against the latest saved copy, so an edit never writes back an older version of the others.
  function mutate(id, fn){ EV = load(); var e = byId(id); if (!e) return null; fn(e); e.edited = Date.now(); save(); return e; }
  function readJSON(key, fallback){ try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (x) { return fallback; } }

  var now = new Date();
  var S = { y: now.getFullYear(), m: now.getMonth(), day: todayISO(), f: { scheduled:true, inperson:true, project:true, followup:true }, open:null, form:null, armed:null, msg:'', auto:'' };
  var EV = load();

  // ---------- everything that lands on the calendar ----------
  function sortItems(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0; }
  function items(){
    var out = [], mine = {};
    EV.forEach(function(e){
      var k = kindOf(e.kind);
      out.push({ date:e.date, time:e.time || '', group:k.group, label:e.title || k.l, sub:[e.who, e.company].filter(Boolean).join(', '), ev:e.id, done:!!e.done, kind:k.l });
      if (e.who) mine[nm(e.who) + '|' + e.date] = 1;
    });
    var pj = readJSON('bdp-projects', []);
    (Array.isArray(pj) ? pj : []).forEach(function(p){
      if (!p || !p.id || p.stage === 'Lost' || p.stage === 'Passed') return;
      function add(date, what, sub){ out.push({ date:date, time:'', group:'project', label:p.name, sub:what + (sub ? ': ' + sub : ''), pj:p.id }); }
      if (isDay(p.nextDate)) add(p.nextDate, tx('Next step', 'Próximo paso'), p.next || '');
      if (isDay(p.bidDate)) add(p.bidDate, tx('Bid due', 'Entrega de oferta'), '');
      if (isDay(p.start)) add(p.start, tx('Construction starts', 'Inicio de obra'), '');
      if (isDay(p.finish)) add(p.finish, tx('Construction finishes', 'Fin de obra'), '');
      if (isMonth(p.intStart)) add(p.intStart + '-01', tx('Interiors start this month', 'Interiores inician este mes'), '');
      if (isMonth(p.intEnd)) add(p.intEnd + '-01', tx('Interiors wrap up this month', 'Interiores terminan este mes'), '');
    });
    // follow-ups: the date set on each person's most recent contact-log entry
    var logs = readJSON('bdp-cnet-logs', []), last = {};
    (Array.isArray(logs) ? logs : []).forEach(function(t){
      if (!t || !t.contact || !t.date) return;
      var k = (t.company || '') + '|' + t.contact, c = last[k];
      if (!c || t.date > c.date || (t.date === c.date && (t.created || 0) > (c.created || 0))) last[k] = t;
    });
    Object.keys(last).forEach(function(k){
      var t = last[k]; if (!isDay(t.next) || mine[nm(t.name) + '|' + t.next]) return;
      out.push({ date:t.next, time:'', group:'followup', label:tx('Follow up with ', 'Dar seguimiento a ') + (t.name || ''), sub:[t.title, t.companyName].filter(Boolean).join(', '), co:t.company, person:t.name });
    });
    return out.sort(sortItems);
  }
  function nextMeeting(){
    var t = todayISO(), list = EV.filter(function(e){ return !e.done && e.date >= t; }).sort(sortItems);
    return list[0] || null;
  }

  // ---------- pieces ----------
  function phoneLinks(e){
    return (e.phones || []).filter(function(p){ return p && p.n; }).map(function(p){
      return '<a class="cal-phone" href="tel:' + esc(String(p.n).replace(/[^\d+]/g, '')) + '"><span>' + esc(p.l || tx('Phone', 'Teléfono')) + '</span>' + esc(p.n) + '</a>';
    }).join('');
  }
  function whenLine(e){ return [fmtLong(e.date), fmtTime(e.time), kindOf(e.kind).l].filter(Boolean).join(' · '); }
  function whoLine(e){ return [e.who, e.role, e.company].filter(Boolean).join(', '); }
  function prep(e){ var c = e.checklist || [], d = c.filter(function(x){ return x.done; }).length; return c.length ? { done:d, all:c.length } : null; }

  function upNext(){
    var e = nextMeeting();
    if (!e) return '<div class="card cal-next cal-next-empty"><span class="eyebrow">' + tx('Up next', 'Próxima') + '</span><p>' + tx('No meetings scheduled. Add a call or an in-person meeting and it will sit here with its notes.', 'No hay reuniones programadas. Agregue una llamada o una reunión en persona y aparecerá aquí con sus notas.') + '</p></div>';
    var p = prep(e);
    return '<div class="card dark cal-next">' +
      '<span class="eyebrow">' + tx('Up next', 'Próxima') + ' · ' + esc(rel(e.date)) + '</span>' +
      '<h2>' + esc(e.title) + '</h2>' +
      '<p class="cal-next-when">' + esc(whenLine(e)) + '</p>' +
      (whoLine(e) ? '<p class="cal-next-who">' + esc(whoLine(e)) + '</p>' : '') +
      (e.where ? '<p class="cal-next-who">' + esc(e.where) + '</p>' : '') +
      '<div class="cal-next-row">' + phoneLinks(e) +
      (p ? '<span class="cal-next-prep">' + tx(p.done + ' of ' + p.all + ' done before the call', p.done + ' de ' + p.all + ' listos antes de la llamada') + '</span>' : '') + '</div>' +
      (S.open === e.id ? '' : '<button type="button" class="btn cal-open" data-open="' + esc(e.id) + '">' + tx('Open call sheet', 'Abrir hoja de llamada') + '</button>') +
      '</div>';
  }

  function sheet(e){
    var k = kindOf(e.kind), p = e.projectId ? (readJSON('bdp-projects', []) || []).filter(function(x){ return x && x.id === e.projectId; })[0] : null;
    var h = '<div class="card cal-sheet" data-sheet="' + esc(e.id) + '">' +
      '<div class="cal-sheet-top"><button type="button" class="btn" data-back>‹ ' + tx('Calendar', 'Calendario') + '</button>' +
      '<div class="cal-sheet-acts"><button type="button" class="btn" data-edit="' + esc(e.id) + '">' + tx('Edit', 'Editar') + '</button>' +
      '<button type="button" class="btn' + (e.done ? '' : ' primary') + '" data-done="' + esc(e.id) + '">' + (e.done ? tx('Reopen', 'Reabrir') : tx('Mark done', 'Marcar hecha')) + '</button></div></div>' +
      '<div class="cal-sheet-head"><span class="eyebrow">' + esc(k.l) + ' · ' + esc(rel(e.date)) + (e.done ? ' · ' + tx('Done', 'Hecha') : '') + '</span>' +
      '<h2>' + esc(e.title) + '</h2>' +
      '<p class="cal-sheet-when">' + esc([fmtLong(e.date), fmtTime(e.time)].filter(Boolean).join(' · ')) + (e.where ? ' · ' + esc(e.where) : '') + '</p>' +
      (whoLine(e) ? '<p class="cal-sheet-who">' + esc(whoLine(e)) + '</p>' : '') +
      '<div class="cal-sheet-links">' + phoneLinks(e) +
      (e.companyKey && e.who ? '<button type="button" class="cal-link" data-person="' + esc(e.who) + '" data-co="' + esc(e.companyKey) + '">' + tx('Open profile', 'Abrir perfil') + '</button>' : '') +
      (p ? '<button type="button" class="cal-link" data-pj="' + esc(p.id) + '">' + tx('Project: ', 'Proyecto: ') + esc(p.name) + '</button>' : '') + '</div></div>';
    if (e.background) h += '<section><h3>' + tx('Background', 'Contexto') + '</h3><p class="cal-pre">' + esc(e.background) + '</p></section>';
    if ((e.checklist || []).length) h += '<section><h3>' + tx('Before the call', 'Antes de la llamada') + '</h3><ul class="cal-check">' + e.checklist.map(function(c, i){
      return '<li><label><input type="checkbox" data-check="' + i + '"' + (c.done ? ' checked' : '') + '><span>' + esc(c.t) + '</span></label></li>'; }).join('') + '</ul></section>';
    if ((e.questions || []).length) h += '<section><h3>' + tx('Questions to ask', 'Preguntas') + '</h3><ol class="cal-qs">' + e.questions.map(function(q, i){
      return '<li><label for="calq' + i + '">' + esc(q.q) + '</label><textarea id="calq' + i + '" data-answer="' + i + '" rows="2" placeholder="' + tx('What he said', 'Lo que dijo') + '">' + esc(q.a || '') + '</textarea></li>'; }).join('') + '</ol></section>';
    h += '<section><h3><label for="calOutcome">' + tx('Outcome and next step', 'Resultado y próximo paso') + '</label></h3>' +
      '<textarea id="calOutcome" data-outcome rows="4" placeholder="' + tx('How it went, what was agreed, what happens next', 'Cómo salió, qué se acordó, qué sigue') + '">' + esc(e.outcome || '') + '</textarea>' +
      '<div class="cal-sheet-foot"><button type="button" class="btn" data-copy="' + esc(e.id) + '">' + tx('Copy notes', 'Copiar notas') + '</button>' +
      (e.companyKey && e.who ? '<button type="button" class="btn" data-log="' + esc(e.id) + '">' + tx('Copy notes and open contact log', 'Copiar notas y abrir registro de contactos') + '</button>' : '') +
      '<span class="sub13" id="calSaved" role="status"></span></div></section></div>';
    return h;
  }
  function notesText(e){
    var out = [e.title + ' · ' + [fmtLong(e.date), fmtTime(e.time)].filter(Boolean).join(' · ')];
    (e.questions || []).forEach(function(q){ if (q.a && q.a.trim()) out.push('- ' + q.q + ' ' + q.a.trim()); });
    if (e.outcome && e.outcome.trim()) out.push('', e.outcome.trim());
    return out.join('\n');
  }

  function formHTML(){
    var d = S.form, pj = readJSON('bdp-projects', []);
    function f(id, label, input){ return '<div class="cal-f"><label for="' + id + '">' + label + '</label>' + input + '</div>'; }
    function inp(id, key, type, extra){ return '<input id="' + id + '" data-k="' + key + '" type="' + (type || 'text') + '" value="' + esc(d[key] || '') + '"' + (extra || '') + '>'; }
    return '<form class="card cal-form" novalidate>' +
      '<div class="cal-sheet-top"><h2>' + (d.id ? tx('Edit meeting', 'Editar reunión') : tx('Add a meeting', 'Agregar reunión')) + '</h2></div>' +
      (S.msg ? '<p class="cal-msg" role="alert">' + esc(S.msg) + '</p>' : '') +
      '<div class="cal-fgrid">' +
      f('calT', tx('What is it', 'Qué es'), inp('calT', 'title', 'text', ' required placeholder="' + tx('Call with Mark Shepard', 'Llamada con Mark Shepard') + '"')) +
      f('calK', tx('Type', 'Tipo'), '<select id="calK" data-k="kind">' + KINDS.map(function(k){ return '<option value="' + k.k + '"' + (d.kind === k.k ? ' selected' : '') + '>' + esc(k.l) + '</option>'; }).join('') + '</select>') +
      f('calD', tx('Date', 'Fecha'), inp('calD', 'date', 'date', ' required')) +
      f('calTi', tx('Time', 'Hora'), inp('calTi', 'time', 'time')) +
      f('calW', tx('Who', 'Con quién'), inp('calW', 'who')) +
      f('calR', tx('Their title', 'Su cargo'), inp('calR', 'role')) +
      f('calC', tx('Company', 'Empresa'), inp('calC', 'company')) +
      f('calP', tx('Phone', 'Teléfono'), inp('calP', 'phone', 'tel')) +
      f('calWh', tx('Where', 'Dónde'), inp('calWh', 'where', 'text', ' placeholder="' + tx('Address, restaurant or meeting link', 'Dirección, restaurante o enlace') + '"')) +
      f('calPj', tx('Project', 'Proyecto'), '<select id="calPj" data-k="projectId"><option value="">' + tx('None', 'Ninguno') + '</option>' + (Array.isArray(pj) ? pj : []).map(function(p){ return '<option value="' + esc(p.id) + '"' + (d.projectId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>') +
      '</div>' +
      f('calB', tx('Background', 'Contexto'), '<textarea id="calB" data-k="background" rows="4">' + esc(d.background || '') + '</textarea>') +
      f('calCh', tx('Things to do first, one per line', 'Qué hacer antes, uno por línea'), '<textarea id="calCh" data-k="checkText" rows="4">' + esc(d.checkText || '') + '</textarea>') +
      f('calQ', tx('Questions to ask, one per line', 'Preguntas, una por línea'), '<textarea id="calQ" data-k="qText" rows="6">' + esc(d.qText || '') + '</textarea>') +
      '<div class="cal-sheet-foot"><button type="submit" class="btn primary">' + tx('Save', 'Guardar') + '</button><button type="button" class="btn" data-cancel>' + tx('Cancel', 'Cancelar') + '</button>' +
      (d.id ? '<button type="button" class="btn cal-del" data-del="' + esc(d.id) + '">' + (S.armed === d.id ? tx('Tap again to delete', 'Toque otra vez para borrar') : tx('Delete', 'Borrar')) + '</button>' : '') + '</div></form>';
  }
  function startForm(e, date){
    S.msg = ''; S.armed = null;
    S.form = e ? { id:e.id, title:e.title || '', kind:e.kind || 'call', date:e.date, time:e.time || '', who:e.who || '', role:e.role || '', company:e.company || '', phone:((e.phones || [])[0] || {}).n || '', where:e.where || '', projectId:e.projectId || '', background:e.background || '',
        checkText:(e.checklist || []).map(function(c){ return c.t; }).join('\n'), qText:(e.questions || []).map(function(q){ return q.q; }).join('\n') }
      : { id:'', title:'', kind:'call', date:date || S.day || todayISO(), time:'', who:'', role:'', company:'', phone:'', where:'', projectId:'', background:'', checkText:'', qText:'' };
    S.open = null; render();
    var t = document.getElementById('calT'); if (t) t.focus();
  }
  function lines(s){ return String(s || '').split('\n').map(function(x){ return x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim(); }).filter(Boolean); }
  function saveForm(){
    var d = S.form; root.querySelectorAll('.cal-form [data-k]').forEach(function(el){ d[el.getAttribute('data-k')] = el.value; });
    if (!d.title.trim() || !isDay(d.date)){ S.msg = tx('Give it a name and a date.', 'Póngale un nombre y una fecha.'); render(); return; }
    EV = load();
    var e = d.id ? byId(d.id) : null, fresh = !e;
    if (fresh){ e = { id:uid(), created:Date.now(), checklist:[], questions:[], outcome:'', done:false }; EV.push(e); }
    var oldC = {}, oldQ = {}; (e.checklist || []).forEach(function(c){ oldC[c.t] = c.done; }); (e.questions || []).forEach(function(q){ oldQ[q.q] = q.a; });
    e.title = d.title.trim(); e.kind = d.kind; e.date = d.date; e.time = d.time || ''; e.who = d.who.trim(); e.role = d.role.trim(); e.company = d.company.trim(); e.where = d.where.trim(); e.projectId = d.projectId || ''; e.background = d.background.trim();
    var rest = (e.phones || []).slice(1); e.phones = d.phone.trim() ? [{ l:((e.phones || [])[0] || {}).l || '', n:d.phone.trim() }].concat(rest) : rest;
    // link to the Client Networks profile when the company and person are there
    if (!e.companyKey || fresh){ var C = window.CNET, hit = ''; if (C && C.companies && e.company) C.companies().forEach(function(c){ if (nm(c.name) === nm(e.company) || c.key === nm(e.company)) hit = c.key; }); e.companyKey = hit || e.companyKey || ''; }
    e.checklist = lines(d.checkText).map(function(t){ return { t:t, done:!!oldC[t] }; });
    e.questions = lines(d.qText).map(function(q){ return { q:q, a:oldQ[q] || '' }; });
    e.edited = Date.now();
    if (!save()){ render(); return; }
    S.form = null; S.msg = ''; S.day = e.date; var dt = toDate(e.date); S.y = dt.getFullYear(); S.m = dt.getMonth(); S.open = e.id; render();
  }

  function pill(it){
    var attrs = it.ev ? ' data-open="' + esc(it.ev) + '"' : it.pj ? ' data-pj="' + esc(it.pj) + '"' : ' data-person="' + esc(it.person || '') + '" data-co="' + esc(it.co || '') + '"';
    return '<button type="button" class="cal-item cal-g-' + it.group + (it.done ? ' is-done' : '') + '"' + attrs + '>' +
      '<span class="cal-item-k">' + esc(it.ev ? it.kind : GLABEL[it.group]) + (it.time ? ' · ' + esc(fmtTime(it.time)) : '') + (it.done ? ' · ' + tx('Done', 'Hecha') : '') + '</span>' +
      '<span class="cal-item-l">' + esc(it.label) + '</span>' + (it.sub ? '<span class="cal-item-s">' + esc(it.sub) + '</span>' : '') + '</button>';
  }
  function grid(all){
    var first = new Date(S.y, S.m, 1, 12), start = new Date(S.y, S.m, 1 - first.getDay(), 12), t = todayISO(), by = {};
    all.forEach(function(it){ (by[it.date] = by[it.date] || []).push(it); });
    var dow = []; for (var i = 0; i < 7; i++) dow.push(new Date(2026, 10, 1 + i, 12).toLocaleDateString(L, { weekday:'short' }));
    var h = '<div class="cal-grid" role="grid" aria-label="' + esc(fmtMonth(S.y, S.m)) + '"><div class="cal-dow" role="row">' + dow.map(function(d){ return '<span role="columnheader">' + esc(d) + '</span>'; }).join('') + '</div>';
    var weeks = Math.ceil((first.getDay() + new Date(S.y, S.m + 1, 0).getDate()) / 7);
    for (var w = 0; w < weeks; w++){
      h += '<div class="cal-week" role="row">';
      for (var d = 0; d < 7; d++){
        var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d, 12), v = iso(day), list = by[v] || [], out = day.getMonth() !== S.m;
        h += '<button type="button" role="gridcell" class="cal-cell' + (out ? ' is-out' : '') + (v === t ? ' is-today' : '') + (v === S.day ? ' is-sel' : '') + '" data-day="' + v + '" aria-pressed="' + (v === S.day) + '" aria-label="' + esc(fmtLong(v)) + (list.length ? ', ' + list.length + ' ' + tx(list.length === 1 ? 'item' : 'items', list.length === 1 ? 'elemento' : 'elementos') : '') + '">' +
          '<span class="cal-num">' + day.getDate() + '</span>' +
          '<span class="cal-chips">' + list.slice(0, 3).map(function(it){ return '<span class="cal-chip cal-g-' + it.group + (it.done ? ' is-done' : '') + '">' + esc((it.time ? fmtTime(it.time).replace(':00', '').replace(' ', '').toLowerCase() + ' ' : '') + it.label) + '</span>'; }).join('') +
          (list.length > 3 ? '<span class="cal-more">+' + (list.length - 3) + ' ' + tx('more', 'más') + '</span>' : '') + '</span>' +
          '<span class="cal-dots" aria-hidden="true">' + list.slice(0, 4).map(function(it){ return '<i class="cal-g-' + it.group + '"></i>'; }).join('') + '</span></button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function side(all){
    var t = todayISO(), dayList = all.filter(function(it){ return it.date === S.day; });
    var soon = all.filter(function(it){ return it.date > S.day && it.date >= t && dayDiff(it.date, t) <= 30 && !it.done; }).slice(0, 12);
    var late = all.filter(function(it){ return it.date < t && !it.done && dayDiff(t, it.date) <= 30 && it.date !== S.day; });
    var h = '<aside class="cal-side"><div class="card"><div class="cal-side-head"><div><span class="eyebrow">' + esc(rel(S.day)) + '</span><h2>' + esc(fmtLong(S.day)) + '</h2></div>' +
      '<button type="button" class="btn" data-add="' + S.day + '">' + tx('Add', 'Agregar') + '</button></div>' +
      (dayList.length ? '<div class="cal-list">' + dayList.map(pill).join('') + '</div>' : '<p class="sub13">' + tx('Nothing on this day.', 'Nada este día.') + '</p>') + '</div>';
    if (late.length) h += '<div class="card"><h2>' + tx('Past due', 'Atrasado') + '</h2><div class="cal-list">' + late.map(function(it){ return '<div class="cal-dated"><span class="cal-date">' + esc(fmtShort(it.date)) + '</span>' + pill(it) + '</div>'; }).join('') + '</div></div>';
    h += '<div class="card"><h2>' + tx('Coming up', 'Lo que viene') + '</h2>' + (soon.length ? '<div class="cal-list">' + soon.map(function(it){ return '<div class="cal-dated"><span class="cal-date">' + esc(fmtShort(it.date)) + '</span>' + pill(it) + '</div>'; }).join('') + '</div>' : '<p class="sub13">' + tx('Nothing else in the next 30 days.', 'Nada más en los próximos 30 días.') + '</p>') + '</div></aside>';
    return h;
  }

  function render(){
    var nx = nextMeeting(), t = todayISO();
    // on the day of the meeting, its call sheet opens by itself, once
    if (nx && nx.date === t && S.auto !== nx.id + t && !S.form){ S.auto = nx.id + t; if (!S.open) S.open = nx.id; }
    var h = upNext();
    if (S.form) h += formHTML();
    else if (S.open && byId(S.open)) h += sheet(byId(S.open));
    else {
      S.open = null;
      var all = items().filter(function(it){ return S.f[it.group]; });
      h += '<div class="cal-bar"><div class="cal-nav"><button type="button" class="btn" data-mv="-1" aria-label="' + tx('Previous month', 'Mes anterior') + '">‹</button>' +
        '<h2 aria-live="polite">' + esc(fmtMonth(S.y, S.m)) + '</h2>' +
        '<button type="button" class="btn" data-mv="1" aria-label="' + tx('Next month', 'Mes siguiente') + '">›</button>' +
        '<button type="button" class="btn" data-today>' + tx('Today', 'Hoy') + '</button></div>' +
        '<div class="cal-filters" role="group" aria-label="' + tx('Show', 'Mostrar') + '">' + GROUPS.map(function(g){ return '<button type="button" class="cal-fbtn cal-g-' + g.k + (S.f[g.k] ? ' on' : '') + '" data-f="' + g.k + '" aria-pressed="' + !!S.f[g.k] + '"><i></i>' + esc(g.l) + '</button>'; }).join('') + '</div>' +
        '<button type="button" class="btn primary" data-add="">' + tx('Add a meeting', 'Agregar reunión') + '</button></div>' +
        '<div class="cal-main">' + grid(all) + side(all) + '</div>';
    }
    root.innerHTML = h;
    overview();
  }

  // ---------- Overview: the next meeting, one tap from its call sheet ----------
  function overview(){
    var view = document.getElementById('view-overview'); if (!view) return;
    var el = document.getElementById('ovCalNext'), e = nextMeeting();
    if (!e || dayDiff(e.date, todayISO()) > 7){ if (el) el.remove(); return; }
    if (!el){ el = document.createElement('a'); el.id = 'ovCalNext'; el.className = 'cal-ov'; el.href = '#calendar'; var head = view.querySelector('.head'); if (head && head.nextSibling) view.insertBefore(el, head.nextSibling); else view.appendChild(el); }
    el.setAttribute('data-ov', e.id);
    el.innerHTML = '<span class="cal-ov-k">' + tx('Up next', 'Próxima') + ' · ' + esc(rel(e.date)) + '</span><span class="cal-ov-t">' + esc(e.title) + '</span>' +
      '<span class="cal-ov-s">' + esc([fmtShort(e.date), fmtTime(e.time), whoLine(e)].filter(Boolean).join(' · ')) + '</span><span class="cal-ov-go">' + tx('Open call sheet', 'Abrir hoja de llamada') + ' ›</span>';
  }
  document.addEventListener('click', function(ev){ var a = ev.target.closest && ev.target.closest('#ovCalNext'); if (!a) return; S.form = null; S.open = a.getAttribute('data-ov'); render(); });

  // ---------- events ----------
  var saveT;
  function saved(){ var s = document.getElementById('calSaved'); if (!s) return; s.textContent = tx('Saved', 'Guardado'); clearTimeout(saved.t); saved.t = setTimeout(function(){ s.textContent = ''; }, 1500); }
  root.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('button'); if (!b || !root.contains(b)) return;
    var a = function(n){ return b.getAttribute(n); };
    if (b.hasAttribute('data-open')){ S.open = a('data-open'); render(); window.scrollTo(0, 0); }
    else if (b.hasAttribute('data-back')){ S.open = null; render(); }
    else if (b.hasAttribute('data-edit')){ startForm(byId(a('data-edit'))); }
    else if (b.hasAttribute('data-add')){ startForm(null, a('data-add') || S.day); }
    else if (b.hasAttribute('data-cancel')){ var id = S.form && S.form.id; S.form = null; S.msg = ''; S.open = id || null; render(); }
    else if (b.hasAttribute('data-del')){ var did = a('data-del'); if (S.armed !== did){ S.armed = did; root.querySelectorAll('.cal-form [data-k]').forEach(function(el){ S.form[el.getAttribute('data-k')] = el.value; }); render(); return; } EV = load().filter(function(e){ return e.id !== did; }); save(); S.form = null; S.armed = null; S.open = null; render(); }
    else if (b.hasAttribute('data-done')){ mutate(a('data-done'), function(e){ e.done = !e.done; }); render(); }
    else if (b.hasAttribute('data-mv')){ var d = new Date(S.y, S.m + (+a('data-mv')), 1); S.y = d.getFullYear(); S.m = d.getMonth(); render(); }
    else if (b.hasAttribute('data-today')){ var n = new Date(); S.y = n.getFullYear(); S.m = n.getMonth(); S.day = todayISO(); render(); }
    else if (b.hasAttribute('data-day')){ S.day = a('data-day'); var dd = toDate(S.day); S.y = dd.getFullYear(); S.m = dd.getMonth(); render(); var c = root.querySelector('.cal-cell.is-sel'); if (c) c.focus(); }
    else if (b.hasAttribute('data-f')){ S.f[a('data-f')] = !S.f[a('data-f')]; render(); }
    else if (b.hasAttribute('data-pj')){ if (window.BDP_PROJECTS && window.BDP_PROJECTS.open) window.BDP_PROJECTS.open(a('data-pj')); else location.hash = '#projects'; }
    else if (b.hasAttribute('data-person')){ if (window.CNET && window.CNET.open && a('data-co') && window.CNET.hasCompany(a('data-co'))) window.CNET.open(a('data-co'), a('data-person'), 'log'); else location.hash = '#network'; }
    else if (b.hasAttribute('data-copy') || b.hasAttribute('data-log')){
      var e = byId(a('data-copy') || a('data-log')); if (!e) return;
      var done = function(ok){ var s = document.getElementById('calSaved'); if (s) s.textContent = ok ? tx('Notes copied', 'Notas copiadas') : tx('Could not copy', 'No se pudo copiar');
        if (b.hasAttribute('data-log') && window.CNET && window.CNET.open) setTimeout(function(){ window.CNET.open(e.companyKey, e.who, 'log'); }, ok ? 500 : 1200); };
      try { navigator.clipboard.writeText(notesText(e)).then(function(){ done(true); }, function(){ done(false); }); } catch (x) { done(false); }
    }
  });
  root.addEventListener('change', function(ev){
    var el = ev.target, card = el.closest && el.closest('[data-sheet]'); if (!card) return;
    if (el.hasAttribute('data-check')){ mutate(card.getAttribute('data-sheet'), function(e){ var c = (e.checklist || [])[+el.getAttribute('data-check')]; if (c) c.done = el.checked; }); saved(); var top = root.querySelector('.cal-next-prep'), e2 = nextMeeting(), p = e2 && prep(e2); if (top && p && e2.id === card.getAttribute('data-sheet')) top.textContent = tx(p.done + ' of ' + p.all + ' done before the call', p.done + ' de ' + p.all + ' listos antes de la llamada'); }
  });
  root.addEventListener('input', function(ev){
    var el = ev.target, card = el.closest && el.closest('[data-sheet]'); if (!card) return;
    if (!el.hasAttribute('data-answer') && !el.hasAttribute('data-outcome')) return;
    clearTimeout(saveT); saveT = setTimeout(function(){ flush(card); saved(); }, 500);
  });
  function flush(card){
    if (!card || !card.isConnected) return;
    mutate(card.getAttribute('data-sheet'), function(e){
      card.querySelectorAll('[data-answer]').forEach(function(t){ var q = (e.questions || [])[+t.getAttribute('data-answer')]; if (q) q.a = t.value; });
      var o = card.querySelector('[data-outcome]'); if (o) e.outcome = o.value;
    });
  }
  root.addEventListener('focusout', function(ev){ var card = ev.target.closest && ev.target.closest('[data-sheet]'); if (card && (ev.target.hasAttribute('data-answer') || ev.target.hasAttribute('data-outcome'))){ clearTimeout(saveT); flush(card); } });
  root.addEventListener('submit', function(ev){ ev.preventDefault(); saveForm(); });

  function typing(){ var a = document.activeElement; return !!(a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
  function refresh(){ if (typing() || S.form) return; EV = load(); render(); }
  if (window.BDP_SYNC && window.BDP_SYNC.onRemote) window.BDP_SYNC.onRemote(KEY, function(){ if (typing() || S.form) return; EV = load(); render(); });
  window.addEventListener('hashchange', function(){ if (location.hash === '#calendar') refresh(); else if (location.hash === '#overview' || location.hash === '') { EV = load(); overview(); } });
  window.addEventListener('bdp:projects', function(){ if (location.hash === '#calendar') refresh(); });
  window.addEventListener('cnet:logs', function(){ if (location.hash === '#calendar') refresh(); });
  window.BDP_CAL = { open:function(id){ S.form = null; S.open = id; location.hash = '#calendar'; render(); } };
  render();
})();
