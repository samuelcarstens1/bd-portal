/* BD Progress Portal — Labor Demand Radar tab.
   Reads data/leads.json, which the daily "Labor Demand Radar → portal sync" task rebuilds each morning
   from Samuel's lead tracker (scripts/export_leads.py). Read-only here: status is logged in the tracker. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var L=window.BDP_LOCALE||'en-US';
  var ES=(L||'').toLowerCase().indexOf('es')===0;
  var S={leads:[],companies:[],run:{},tab:'call',state:'',type:'',sort:'score',q:''};
  try{ var t=localStorage.getItem('bdp-lr-tab'); if(t==='call'||t==='pipeline'||t==='all'||t==='companies') S.tab=t; }catch(e){}
  var TOUCHED={'Left voicemail':1,'Spoke – interested':1,'Meeting set':1,'Proposal sent':1,'Won – placement':1,'Lost':1,'Not a fit':1};
  var tx=function(en,es){return ES?es:en};

  function el(tag,cls,text){var e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e;}
  function day(iso){ if(!iso)return null; var d=new Date(String(iso).length===10?iso+'T12:00:00':iso); return isNaN(d)?null:d; }
  function daysSince(iso){ var d=day(iso); return d?Math.floor((Date.now()-d.getTime())/864e5):999; }
  function fmtDate(iso,opts){ var d=day(iso); return d?d.toLocaleDateString(L,opts||{month:'short',day:'numeric'}):''; }
  function fmtTime(iso){ var d=day(iso); return d?d.toLocaleString(L,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''; }
  function tier(s){ return s>=75?'t1':s>50?'t2':s>=35?'t3':'t4'; }
  function active(){ return S.leads.filter(function(l){return l.active!==false}); }

  function filtered(){
    var arr=S.leads.filter(function(l){ return S.tab==='all' || (l.active!==false && l.list===S.tab); });
    if(S.state) arr=arr.filter(function(l){return l.state===S.state});
    if(S.type) arr=arr.filter(function(l){return l.ptype===S.type});
    if(S.q){ var q=S.q.toLowerCase(); arr=arr.filter(function(l){ return [l.project,l.gc,l.metro,l.who,l.ptype,l.sub,l.state].join(' ').toLowerCase().indexOf(q)>=0; }); }
    var sc=function(l){return l.score||0};
    var mv=function(l){return l.prevScore==null?0:Math.abs(sc(l)-l.prevScore)};
    if(S.sort==='new') arr.sort(function(a,b){ return String(b.firstSeen||'').localeCompare(String(a.firstSeen||''))||sc(b)-sc(a); });
    else if(S.sort==='move') arr.sort(function(a,b){ return mv(b)-mv(a)||sc(b)-sc(a); });
    else arr.sort(function(a,b){ return sc(b)-sc(a)||(b.h||0)-(a.h||0)||(b.t||0)-(a.t||0)||(b.s||0)-(a.s||0); });
    return arr;
  }

  function fillSelect(sel,values,allLabel){
    var cur=sel.value; sel.length=0;
    var o=document.createElement('option'); o.value=''; o.textContent=allLabel; sel.appendChild(o);
    values.forEach(function(v){ var x=document.createElement('option'); x.value=v; x.textContent=v; sel.appendChild(x); });
    sel.value=values.indexOf(cur)>=0?cur:'';
  }

  function renderSummary(){
    var a=active();
    var call=a.filter(function(l){return l.list==='call'});
    var nw=a.filter(function(l){return daysSince(l.firstSeen)<=7});
    var hire=a.filter(function(l){return (l.h||0)>0});
    var touched=a.filter(function(l){return TOUCHED[l.status]});
    $('lrCall').textContent=call.length; $('lrNew').textContent=nw.length; $('lrHire').textContent=hire.length; $('lrTouch').textContent=touched.length;
    $('lrCallSub').textContent=tx('of ','de ')+a.length+tx(' active projects',' proyectos activos');
    var run=S.run||{};
    $('lrEyebrow').textContent=a.length+tx(' active projects · ',' proyectos activos · ')+nw.length+tx(' new this week',' nuevos esta semana');
    var fresh=$('lrFresh');
    if(run.lastRun){
      var age=Math.floor((Date.now()-day(run.lastRun).getTime())/36e5);
      fresh.lastChild.textContent=tx('Updated ','Actualizado ')+fmtTime(run.lastRun);
      fresh.querySelector('.dot').style.background=age<=30?'var(--good)':'var(--warn)';
    }
    if(run.summary){
      $('lrRunCard').hidden=false;
      $('lrRunDate').textContent=fmtTime(run.lastRun);
      $('lrRunSummary').textContent=run.summary;
      var ul=$('lrHist'); ul.textContent='';
      (run.history||[]).slice(1,14).forEach(function(h){ ul.appendChild(el('li',null,fmtDate(h.date,{weekday:'short',month:'short',day:'numeric'})+' — '+(h.summary||''))); });
      $('lrHist').parentNode.hidden=!ul.children.length;
    }
    var states=[], types=[];
    a.forEach(function(l){ if(l.state&&states.indexOf(l.state)<0)states.push(l.state); if(l.ptype&&types.indexOf(l.ptype)<0)types.push(l.ptype); });
    fillSelect($('lrState'),states.sort(),tx('All states','Todos los estados'));
    fillSelect($('lrType'),types.sort(),tx('All project types','Todos los tipos'));
    // Overview + Lead Gen hub cards
    var ov=$('ovLeadsBig'); if(ov){ ov.textContent=call.length; }
    var ovs=$('ovLeadsSub'); if(ovs){ ovs.textContent=tx('on the call list · ','en la lista de llamadas · ')+hire.length+tx(' hiring now',' contratando ahora'); }
    ['ovLeadsMeta','lgLeadsMeta'].forEach(function(id){ var m=$(id); if(m) m.textContent=nw.length+tx(' new this week · ',' nuevos esta semana · ')+call.length+tx(' to call',' por llamar'); });
  }

  function reasons(l){
    var t=l.t||0,s=l.s||0,h=l.h||0,p=l.p||0,c=l.c||0, late=/finish|punch|late/i.test((l.window||'')+' '+(l.stage||''));
    return [
      [tx('Timing','Tiempo'),t,40,tx('Labor need: ','Necesidad de mano de obra: ')+(l.window||'—')+'. '+
        (t>=40?tx('Inside the 0–3 month window.','Dentro de 0–3 meses.'):t>=30?(late?tx('Late stage: finish and punch crews only.','Etapa final: solo cuadrillas de acabado.'):tx('3–6 months out.','A 3–6 meses.')):t>=15?tx('6–12 months out: build the relationship now.','A 6–12 meses: construir la relación ahora.'):tx('12+ months out: pipeline only.','A más de 12 meses: solo pipeline.'))+
        (l.stage?tx(' Based on: ',' Basado en: ')+l.stage+'.':'')],
      [tx('Size','Tamaño'),s,25,(l.size||tx('Size not published','Tamaño no publicado'))+'. '+(s>=25?tx('Very large interiors scope.','Alcance de interiores muy grande.'):s>=20?tx('Large ($200–500M range).','Grande ($200–500M).'):s>=15?tx('Mid-size ($100–200M range).','Mediano ($100–200M).'):s>=10?tx('Smaller or size unknown.','Más pequeño o tamaño desconocido.'):tx('Under ~$50M.','Menos de ~$50M.'))],
      [tx('Hiring','Contratando'),h,20,h?tx('Active job posting for our trades.','Oferta de empleo activa para nuestros oficios.'):tx('No job posting for our trades found yet.','Aún no hay ofertas de empleo para nuestros oficios.')],
      [tx('Fit','Encaje'),p,10,(l.ptype||'—')+' — '+(p>=10?tx('top-priority project type.','tipo de proyecto prioritario.'):p>=7?tx('multifamily, second priority.','multifamiliar, segunda prioridad.'):tx('third-priority project type.','tipo de proyecto de tercera prioridad.'))],
      [tx('Contact','Contacto'),c,5,c?tx('Named person: ','Persona identificada: ')+(l.who||''):tx('No named person at the GC yet.','Aún no hay una persona identificada en el GC.')]
    ];
  }

  function card(l){
    var s=l.score||0;
    var a=el('article','card lr-lead'); a.id='lead-'+l.id;
    var sc=el('div','lr-score'); sc.appendChild(el('div','n '+tier(s),String(s)));
    if(l.prevScore!=null && l.prevScore!==s){ var d=s-l.prevScore; sc.appendChild(el('div','d '+(d>0?'up':'dn'),(d>0?'▲':'▼')+Math.abs(d))); }
    else sc.appendChild(el('div','d','—'));
    sc.setAttribute('aria-label',tx('Score ','Puntaje ')+s); a.appendChild(sc);

    var b=el('div','lr-body');
    var t=el('div','lr-title'); t.appendChild(el('h3',null,l.project||'—'));
    if(daysSince(l.firstSeen)<=7) t.appendChild(el('span','lr-tag new',tx('New','Nuevo')));
    if((l.h||0)>0) t.appendChild(el('span','lr-tag hire',tx('Hiring','Contratando')));
    if(l.status && l.status!=='Not contacted') t.appendChild(el('span','lr-tag st',l.status));
    if(l.active===false) t.appendChild(el('span','lr-tag',tx('Closed out','Cerrado')));
    if(l.ptype) t.appendChild(el('span','lr-tag',l.ptype));
    b.appendChild(t);
    b.appendChild(el('div','lr-meta',[l.metro,l.state,l.size].filter(Boolean).join(' · ')));
    var w=el('div','lr-window'); w.appendChild(el('b',null,tx('Labor need','Necesidad'))); w.appendChild(document.createTextNode(l.window||'—')); b.appendChild(w);
    if(l.changeNote) b.appendChild(el('div','lr-change',tx('Latest: ','Último: ')+l.changeNote));
    var kv=el('dl','lr-kv');
    [[tx('GC','GC'),l.gc||tx('Not identified','Sin identificar')],[tx('Who to call','A quién llamar'),l.who||'—'],[tx('Contact','Contacto'),l.web||'—']].forEach(function(r){ kv.appendChild(el('dt',null,r[0])); kv.appendChild(el('dd',null,r[1])); });
    b.appendChild(kv);

    var det=el('details','lr-more'); det.appendChild(el('summary',null,tx('Why it scored '+s+', pitch and sources','Por qué obtuvo '+s+', propuesta y fuentes')));
    var inner=el('div','lr-inner');
    var kv2=el('dl','lr-kv');
    [[tx('Stage','Etapa'),l.stage],[tx('Signal','Señal'),(l.signal||'')+(l.sdate?' ('+l.sdate+')':'')],[tx('Drywall sub','Sub de drywall'),l.sub||tx('Unknown','Desconocido')],[tx('First seen','Detectado'),fmtDate(l.firstSeen,{month:'short',day:'numeric',year:'numeric'})],[tx('Last checked','Revisado'),fmtDate(l.lastChecked,{month:'short',day:'numeric',year:'numeric'})]].forEach(function(r){ if(r[1]){ kv2.appendChild(el('dt',null,r[0])); kv2.appendChild(el('dd',null,r[1])); } });
    inner.appendChild(kv2);
    if(l.line){
      var ln=el('div','lr-line'); var txt=el('span',null,l.line); ln.appendChild(txt);
      var cb=el('button',null,tx('Copy','Copiar')); cb.type='button';
      cb.addEventListener('click',function(){
        var done=function(){ cb.textContent=tx('Copied','Copiado'); setTimeout(function(){cb.textContent=tx('Copy','Copiar')},1500); };
        var sel=function(){ var r=document.createRange(); r.selectNodeContents(txt); var g=getSelection(); g.removeAllRanges(); g.addRange(r); };
        try{ navigator.clipboard.writeText(l.line).then(done,sel); }catch(e){ sel(); }
      });
      ln.appendChild(cb); inner.appendChild(ln);
    }
    var why=el('div','lr-why'); why.appendChild(el('div','lr-why-h',tx('Why it scored ','Por qué obtuvo ')+s));
    reasons(l).forEach(function(r){
      var row=el('div','lr-why-row'); var lab=el('div','lr-why-l'); lab.appendChild(document.createTextNode(r[0]+' ')); lab.appendChild(el('b',null,r[1]+'/'+r[2]));
      var tr=el('div','lr-track'); var f=el('div','lr-fill'); f.style.width=Math.round(r[1]/r[2]*100)+'%'; tr.appendChild(f); lab.appendChild(tr);
      row.appendChild(lab); row.appendChild(el('div','lr-why-t',r[3])); why.appendChild(row);
    });
    inner.appendChild(why);
    if(l.src && l.src.length){
      var sd=el('div','lr-src'); sd.appendChild(el('span','label',tx('Sources','Fuentes')));
      l.src.forEach(function(u){ if(/^https?:\/\//.test(u)){ var x=el('a',null,u.replace(/^https?:\/\/(www\.)?/,'')); x.href=u; x.target='_blank'; x.rel='noopener'; sd.appendChild(x); } });
      inner.appendChild(sd);
    }
    det.appendChild(inner); b.appendChild(det);
    a.appendChild(b);
    return a;
  }

  /* ---------- Companies (GCs, subs and developers behind the leads) ---------- */
  var leadById={};
  function link(u,label){ if(!u||!/^https?:\/\//.test(u)) return document.createTextNode(label); var a=el('a',null,label); a.href=u; a.target='_blank'; a.rel='noopener'; return a; }
  function coFiltered(){
    var arr=S.companies.slice();
    if(S.state) arr=arr.filter(function(c){ return (c.states||[]).indexOf(S.state)>=0 || (c.offices||[]).some(function(o){return o.state===S.state}); });
    if(S.q){ var q=S.q.toLowerCase(); arr=arr.filter(function(c){ return [c.name,(c.aka||[]).join(' '),c.type,c.hq,c.notes,(c.offices||[]).map(function(o){return o.metro}).join(' ')].join(' ').toLowerCase().indexOf(q)>=0; }); }
    arr.sort(function(a,b){ return (b.leadIds||[]).length-(a.leadIds||[]).length || String(a.name).localeCompare(String(b.name)); });
    return arr;
  }
  function eventsTable(cos){
    var rows=[];
    cos.forEach(function(c){ (c.events||[]).forEach(function(e){ rows.push({c:c,e:e}); }); });
    var card=el('section','card lr-co');
    card.appendChild(el('h3',null,tx('Events','Eventos')));
    var today=Date.now(), soon=today+60*864e5;
    var up=rows.filter(function(r){ var d=day(r.e.date); return d&&d.getTime()>=today-864e5&&d.getTime()<=soon; });
    card.appendChild(el('div','sub13',up.length?up.length+tx(' in the next 60 days',' en los próximos 60 días'):tx('Nothing dated in the next 60 days yet. Recent events are listed for context.','Nada programado en los próximos 60 días. Se muestran eventos recientes como contexto.')));
    if(!rows.length) return card;
    rows.sort(function(a,b){ return String(b.e.date||'').localeCompare(String(a.e.date||'')); });
    var wrap=el('div','lr-ev-wrap'), t=el('table','lr-ev'), hd=el('tr');
    [tx('Date','Fecha'),tx('Company','Empresa'),tx('Event','Evento'),tx('Where','Dónde'),tx('Role','Rol')].forEach(function(h){ hd.appendChild(el('th',null,h)); });
    var th=el('thead'); th.appendChild(hd); t.appendChild(th);
    var tb=el('tbody');
    rows.forEach(function(r){
      var e=r.e, d=day(e.date), tr=el('tr', d&&d.getTime()<today-864e5?'past':null);
      tr.appendChild(el('td',null,d?fmtDate(e.date,{month:'short',day:'numeric',year:'numeric'}):tx('Date TBA','Fecha por anunciar')));
      tr.appendChild(el('td',null,r.c.name));
      var n=el('td'); n.appendChild(link(e.url,e.name||'—')); if(e.kind) n.appendChild(el('div','sub13',e.kind)); tr.appendChild(n);
      tr.appendChild(el('td',null,[e.venue,e.city,e.state].filter(Boolean).join(', ')||'—'));
      tr.appendChild(el('td',null,e.role||'—'));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap);
    return card;
  }
  function coSection(title,items,fmt){
    if(!items||!items.length) return null;
    var s=el('div','lr-co-sec'); s.appendChild(el('h4',null,title)); var ul=el('ul');
    items.forEach(function(x){ var li=el('li'); fmt(li,x); ul.appendChild(li); }); s.appendChild(ul); return s;
  }
  function coCard(c){
    var a=el('article','card lr-co'); a.id='co-'+c.id;
    var t=el('div','lr-title'); t.appendChild(el('h3',null,c.name||c.id));
    if(c.type) t.appendChild(el('span','lr-tag',c.type));
    var n=(c.leadIds||[]).length; if(n) t.appendChild(el('span','lr-tag new',n+(n===1?tx(' project',' proyecto'):tx(' projects',' proyectos'))));
    if(daysSince(c.firstSeen)<=7) t.appendChild(el('span','lr-tag',tx('New','Nuevo')));
    a.appendChild(t);
    var meta=[]; if(c.hq) meta.push(tx('HQ ','Sede ')+c.hq); if(c.states&&c.states.length) meta.push(tx('Lead states: ','Estados con leads: ')+c.states.join(', ')); if(c.aka&&c.aka.length) meta.push(tx('Also: ','También: ')+c.aka.join(', '));
    if(meta.length) a.appendChild(el('div','lr-meta',meta.join(' · ')));
    if(c.notes) a.appendChild(el('div',null,c.notes));
    if(c.changeNote) a.appendChild(el('div','lr-change',tx('Latest: ','Último: ')+c.changeNote));
    var det=el('details','lr-more'); det.appendChild(el('summary',null,tx('Offices, events, associations, charities, sports and projects','Oficinas, eventos, asociaciones, beneficencia, deportes y proyectos')));
    var inner=el('div','lr-inner'), any=false;
    [
      coSection(tx('Offices in territory','Oficinas en el territorio'),c.offices,function(li,o){ li.textContent=[o.metro,o.state].filter(Boolean).join(', '); }),
      coSection(tx('Events','Eventos'),c.events,function(li,e){ li.appendChild(link(e.url,e.name||'—')); li.appendChild(document.createTextNode(' — '+[e.date?fmtDate(e.date,{month:'short',day:'numeric',year:'numeric'}):tx('date TBA','fecha por anunciar'),[e.venue,e.city,e.state].filter(Boolean).join(', '),e.role].filter(Boolean).join(' · '))); }),
      coSection(tx('Associations','Asociaciones'),c.associations,function(li,x){ li.appendChild(link(x.url,[x.org,x.chapter].filter(Boolean).join(' – '))); if(x.role) li.appendChild(document.createTextNode(' — '+x.role)); }),
      coSection(tx('Charities','Beneficencia'),c.charities,function(li,x){ li.appendChild(link(x.url,x.name||'—')); if(x.how) li.appendChild(document.createTextNode(' — '+x.how)); }),
      coSection(tx('Sports','Deportes'),c.sports,function(li,x){ li.appendChild(link(x.url,x.team||'—')); var r=[x.league,x.relationship].filter(Boolean).join(' · '); if(r) li.appendChild(document.createTextNode(' — '+r)); })
    ].forEach(function(s){ if(s){ inner.appendChild(s); any=true; } });
    if(n){
      var s=el('div','lr-co-sec'); s.appendChild(el('h4',null,tx('Projects on the radar','Proyectos en el radar'))); var p=el('div','lr-proj');
      c.leadIds.forEach(function(id){ var l=leadById[id]; var b=el('button',null,l?(l.project+(l.score!=null?' · '+l.score:'')):id); b.type='button';
        if(l){ b.addEventListener('click',function(){ S.tab='all'; S.state=''; S.type=''; S.q=''; $('lrState').value=''; $('lrType').value=''; $('lrQ').value=''; renderList(); var x=$('lead-'+id); if(x){ x.querySelector('details').open=true; x.scrollIntoView({behavior:'smooth',block:'start'}); } }); }
        else b.disabled=true;
        p.appendChild(b); });
      s.appendChild(p); inner.appendChild(s); any=true;
    }
    if(!any) inner.appendChild(el('div','sub13',tx('Nothing public found yet for this company.','Aún no hay información pública sobre esta empresa.')));
    det.appendChild(inner); a.appendChild(det);
    return a;
  }
  function renderCompanies(){
    var list=$('lrList'); var arr=coFiltered(); list.textContent='';
    $('lrCount').textContent=arr.length+(arr.length===1?tx(' company shown',' empresa mostrada'):tx(' companies shown',' empresas mostradas'));
    if(!S.companies.length){ list.appendChild(el('div','card lr-empty',tx('No company research yet. It fills in as the daily run checks each GC and sub.','Aún no hay investigación de empresas. Se completa con la revisión diaria de cada GC y sub.'))); return; }
    var frag=document.createDocumentFragment();
    frag.appendChild(eventsTable(arr));
    if(!arr.length) frag.appendChild(el('div','card lr-empty',tx('No companies match. Try another state or search.','Ninguna empresa coincide. Pruebe otro estado o búsqueda.')));
    arr.forEach(function(c){ frag.appendChild(coCard(c)); });
    list.appendChild(frag);
  }

  function renderList(){
    document.querySelectorAll('[data-lrtab]').forEach(function(btn){ btn.setAttribute('aria-pressed',String(btn.dataset.lrtab===S.tab)); });
    var co=S.tab==='companies'; $('lrType').hidden=co; $('lrSort').hidden=co;
    $('lrQ').placeholder=co?tx('Search company, HQ, office','Buscar empresa, sede, oficina'):tx('Search project, GC, metro','Buscar proyecto, GC, ciudad');
    if(co){ renderCompanies(); return; }
    var list=$('lrList'); var open={};
    list.querySelectorAll('details[open]').forEach(function(d){ var a=d.closest('article'); if(a)open[a.id]=1; });
    var arr=filtered(); list.textContent='';
    $('lrCount').textContent=arr.length+(arr.length===1?tx(' lead shown',' lead mostrado'):tx(' leads shown',' leads mostrados'));
    if(!arr.length){ list.appendChild(el('div','card lr-empty',tx('No leads match. Try another tab, state or type.','Ningún lead coincide. Pruebe otra pestaña, estado o tipo.'))); return; }
    var frag=document.createDocumentFragment();
    arr.forEach(function(l){ var c=card(l); if(open[c.id]) c.querySelector('details').open=true; frag.appendChild(c); });
    list.appendChild(frag);
  }

  function render(){ renderSummary(); renderList(); }

  document.querySelectorAll('[data-lrtab]').forEach(function(btn){ btn.addEventListener('click',function(){ S.tab=btn.dataset.lrtab; try{localStorage.setItem('bdp-lr-tab',S.tab)}catch(e){} renderList(); }); });
  $('lrState').addEventListener('change',function(e){ S.state=e.target.value; renderList(); });
  $('lrType').addEventListener('change',function(e){ S.type=e.target.value; renderList(); });
  $('lrSort').addEventListener('change',function(e){ S.sort=e.target.value; renderList(); });
  var qt; $('lrQ').addEventListener('input',function(e){ clearTimeout(qt); qt=setTimeout(function(){ S.q=e.target.value.trim(); renderList(); },200); });

  fetch('data/leads.json',{cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }).then(function(d){
    S.leads=Array.isArray(d.leads)?d.leads:[]; S.run=d.run||{}; S.companies=Array.isArray(d.companies)?d.companies:[];
    S.leads.forEach(function(l){ leadById[l.id]=l; }); render();
  }).catch(function(){
    $('lrEyebrow').textContent=tx('Lead list unavailable','Lista de leads no disponible');
    var list=$('lrList'); list.textContent='';
    list.appendChild(el('div','card lr-empty',tx('The lead list could not be loaded. It refreshes every morning; try again later.','No se pudo cargar la lista de leads. Se actualiza cada mañana; intente más tarde.')));
  });
})();
