/* BD Progress Portal — Company researcher, Who's Working Where heat map, and the Overview tool counts.
   Reads the BusDev Map's data (window.BDMAP, from bdmap.js), the Labor Radar export (data/leads.json)
   and outside market indicators (data/market.json). Nothing here is typed in by hand: every company,
   project and figure traces back to one of those three sources. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var L=window.BDP_LOCALE||'en-US', ES=(L||'').toLowerCase().indexOf('es')===0, tx=function(en,es){return ES?es:en};
  var TERR=['TX','FL','GA','AL','MS','LA','NC','SC','TN'];
  var ST_NAME={TX:'Texas',FL:'Florida',GA:'Georgia',AL:'Alabama',MS:'Mississippi',LA:'Louisiana',NC:'North Carolina',SC:'South Carolina',TN:'Tennessee'};
  var NAME_ST={}; Object.keys(ST_NAME).forEach(function(k){ NAME_ST[ST_NAME[k].toLowerCase()]=k; });
  var classify=window.BDP_CLASSIFY;
  var R={leads:[],companies:[],run:{}}, MK=null, haveRadar=false, haveMap=false;
  var link=function(u,label){ return /^https?:\/\//.test(u||'')?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(label||u.replace(/^https?:\/\/(www\.)?/,'').slice(0,60))+'</a>':esc(label||''); };
  var plural=function(n,a,b){ return n+' '+(n===1?a:b); };

  function norm(name){
    return String(name||'').toLowerCase().replace(/\(.*?\)/g,' ').replace(/&/g,' and ').replace(/[^a-z0-9 ]+/g,' ')
      .replace(/\b(the|inc|llc|lp|co|company|corp|corporation|construction|contractors?|contracting|group|services|of florida|us|usa|ltd|and associates|associates)\b/g,' ').replace(/\s+/g,' ').trim();
  }
  function statesIn(text){
    var out=[], t=String(text||'');
    (t.match(/\b[A-Z]{2}\b/g)||[]).forEach(function(x){ if(ST_NAME[x]&&out.indexOf(x)<0) out.push(x); });
    Object.keys(NAME_ST).forEach(function(n){ if(t.toLowerCase().indexOf(n)>=0&&out.indexOf(NAME_ST[n])<0) out.push(NAME_ST[n]); });
    return out;
  }

  /* ---------- one merged company list ---------- */
  var CO=[], byNorm={};
  function getCo(name){ var k=norm(name)||String(name).toLowerCase(); if(!byNorm[k]){ byNorm[k]={id:'c'+CO.length,name:name,norm:k,src:{},types:[],states:[],people:[],offices:[],projects:[],leads:[],signals:[],warm:[],partners:[],competitors:[],events:[],associations:[],charities:[],sports:[],notes:[],sources:[],dc:[]}; CO.push(byNorm[k]); } return byNorm[k]; }
  function addState(c,s){ if(s&&ST_NAME[s]&&c.states.indexOf(s)<0) c.states.push(s); }
  function addType(c,t){ if(t&&c.types.indexOf(t)<0) c.types.push(t); }
  var CAT_TYPE={div9:'Drywall & framing sub',gc:'General contractor',restoration:'Restoration',specialty:'Specialty trade'};
  var RADAR_TYPE={'GC':'General contractor','Drywall/interiors sub':'Drywall & framing sub','Developer':'Owner / developer','Other':'Other'};
  var DC_ROLE={gc:'General contractor',div9_sub:'Drywall & framing sub',hyperscaler:'Owner / developer',developer:'Owner / developer'};

  function metroState(M){ var m={}; (M.STATES||[]).forEach(function(st){ st.metros.forEach(function(x){ m[x[0]]={name:x[1],st:st.id}; }); }); return m; }

  function build(){
    CO=[]; byNorm={};
    var M=window.BDMAP;
    if(M){
      var MS=metroState(M);
      M.COMPANIES.forEach(function(e){
        var co=e.company||{}, c=getCo(co.name||e.key);
        c.mapKey=e.key; c.src.map=1; c.client=c.client||M.isClient(e); c.data=co;
        addType(c,CAT_TYPE[co.category||'div9']);
        (e.branches||[]).forEach(function(b){ var m=(M.BRANCH_METRO[b.id]||[])[0]; var st=m&&MS[m]?MS[m].st:(statesIn(b.address)[0]||''); if(b.group==='territory') addState(c,st);
          c.offices.push({name:b.name,where:m&&MS[m]?MS[m].name+', '+MS[m].st:(b.address||''),phone:b.phone||'',note:b.note||'',hiring:b.hiring||[],link:b.link||'',src:'map'}); });
        statesIn(co.hq).forEach(function(s){ addState(c,s); });
        (e.people||[]).forEach(function(p){ var k=M.key(e.key,p.id); var b=(e.branches||[]).find(function(x){return x.id===p.branchId}); c.people.push({name:p.name,title:p.title||'',where:p.branchId==='hq'?co.hq:(b?b.name:''),linkedin:M.LI[k]||p.linkedin||'',evidence:p.evidence||'',link:p.link||'',note:p.note||p.bio||'',touch:M.lastTouch(k)||''}); });
        (e.projects||[]).forEach(function(p){ var m=(M.BRANCH_METRO[p.branchId]||[])[0]; var st=m&&MS[m]?MS[m].st:(statesIn(p.metro)[0]||'');
          c.projects.push({name:p.name,where:p.metro||(m&&MS[m]?MS[m].name:''),st:st,gc:p.gc||'',scope:p.scope||'',value:p.value||'',year:p.year||'',status:p.status||'',sector:p.sector||'',note:p.note||'',link:p.link||'',type:classify([p.name,p.sector,p.note].join(' '))}); });
        (e.signals||[]).forEach(function(s){ c.signals.push({name:s.name,note:s.note||'',link:s.link||'',source:s.source||''}); });
        (e.warmPaths||[]).slice().sort(function(a,b){return (a.order||0)-(b.order||0)}).forEach(function(w){ c.warm.push({name:w.name,text:w.text||''}); });
        (e.partners||[]).forEach(function(p){ c.partners.push({name:p.name,kind:p.kind||'',note:p.note||'',link:p.link||''}); });
        (co.competitors||[]).forEach(function(p){ c.competitors.push({name:p.name,note:p.note||'',link:p.link||''}); });
        (co.associations||[]).forEach(function(a){ c.associations.push({org:a,role:'',link:''}); });
        (co.pitchNotes||[]).forEach(function(n){ c.notes.push(n); });
        (co.getInFront||[]).forEach(function(n){ c.notes.push(n); });
        (co.sources||[]).forEach(function(s){ c.sources.push(s); });
      });
      (M.DC_DATA&&['builders','subs','pipeline']||[]).forEach(function(k){ (M.DC_DATA[k]||[]).forEach(function(d){
        var c=getCo(d.name); c.src.dc=1; addType(c,DC_ROLE[d.role]||'Other'); statesIn(d.territory_presence).forEach(function(s){ addState(c,s); });
        c.dc.push({presence:d.territory_presence||'',evidence:d.dc_evidence||'',scale:d.scale_signal||'',angle:d.labor_angle||'',contact:d.named_contact||'',sources:d.sources||[]});
        if(!c.data) c.hqText=d.hq||'';
      }); });
    }
    var leadById={}; R.leads.forEach(function(l){ leadById[l.id]=l; });
    R.companies.forEach(function(rc){
      var c=getCo(rc.name); c.src.radar=1; c.radar=rc; addType(c,RADAR_TYPE[rc.type]||rc.type);
      (rc.states||[]).forEach(function(s){ addState(c,s); }); statesIn(rc.hq).forEach(function(s){ addState(c,s); });
      if(!c.data&&!c.hqText) c.hqText=rc.hq||'';
      (rc.offices||[]).forEach(function(o){ c.offices.push({name:o.metro,where:[o.metro,o.state].filter(Boolean).join(', '),src:'radar'}); });
      (rc.leadIds||[]).forEach(function(id){ var l=leadById[id]; if(l&&c.leads.indexOf(l)<0) c.leads.push(l); });
      ['events','associations','charities','sports'].forEach(function(k){ (rc[k]||[]).forEach(function(x){ c[k].push(x); }); });
      if(rc.notes) c.notes.push(rc.notes);
    });
    CO.forEach(function(c){ c.projects.forEach(function(p){ addState(c,p.st); }); c.leads.forEach(function(l){ addState(c,l.state); }); c.offices.forEach(function(o){ statesIn(o.where).forEach(function(x){ addState(c,x); }); }); c.states.sort(function(a,b){return TERR.indexOf(a)-TERR.indexOf(b)}); });
    CO.forEach(function(c){ c.hay=[c.name,c.data&&c.data.aka,c.radar&&(c.radar.aka||[]).join(' '),c.types.join(' '),c.data&&c.data.hq,c.hqText,c.offices.map(function(o){return o.where}).join(' '),c.people.map(function(p){return p.name+' '+p.title}).join(' '),c.projects.map(function(p){return p.name}).join(' '),c.leads.map(function(l){return l.project}).join(' ')].join(' ').toLowerCase(); });
    CO.sort(function(a,b){ return (b.client?1:0)-(a.client?1:0)||score(b)-score(a)||a.name.localeCompare(b.name); });
  }
  function score(c){ return c.people.length+c.projects.length+c.leads.length*3+c.events.length; }

  /* ---------- Company researcher ---------- */
  var RS={q:'',src:'',type:'',state:'',clients:false,open:null}; try{ RS.state=localStorage.getItem('bdp-rs-state')||''; }catch(e){}
  function rsFill(){
    var types={}, sts={}; CO.forEach(function(c){ c.types.forEach(function(t){types[t]=1}); c.states.forEach(function(s){sts[s]=1}); });
    var ft=$('rsType'); if(!ft)return;
    var keep=function(sel,vals,lab){ var cur=sel.value; sel.length=1; vals.forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=lab?lab(v):v; sel.appendChild(o); }); sel.value=vals.indexOf(cur)>=0?cur:''; };
    keep(ft,Object.keys(types).sort());
  }
  function rsRender(){
    var rows=$('rsRows'); if(!rows)return;
    var q=RS.q.toLowerCase();
    var list=CO.filter(function(c){ return (!q||c.hay.indexOf(q)>=0)&&(!RS.src||c.src[RS.src])&&(!RS.type||c.types.indexOf(RS.type)>=0)&&(!RS.state||c.states.indexOf(RS.state)>=0)&&(!RS.clients||c.client); });
    var sb=$('rsStates'); if(sb){ var base=CO.filter(function(c){ return (!q||c.hay.indexOf(q)>=0)&&(!RS.src||c.src[RS.src])&&(!RS.type||c.types.indexOf(RS.type)>=0)&&(!RS.clients||c.client); });
      var n=function(s){ return base.filter(function(c){return c.states.indexOf(s)>=0}).length; };
      sb.innerHTML='<button type="button" data-rst="" aria-pressed="'+(!RS.state)+'">'+tx('All states','Todos los estados')+' <span class="n">'+base.length+'</span></button>'+TERR.map(function(s){ return '<button type="button" data-rst="'+s+'" aria-pressed="'+(RS.state===s)+'" title="'+esc(ST_NAME[s])+'">'+s+' <span class="n">'+n(s)+'</span></button>'; }).join(''); }
    $('rsEyebrow').textContent=CO.length+tx(' companies · ',' empresas · ')+CO.filter(function(c){return c.client}).length+tx(' IB Group clients',' clientes de IB Group');
    $('rsCount').textContent=list.length+(list.length===1?tx(' company shown',' empresa mostrada'):tx(' companies shown',' empresas mostradas'));
    if(!CO.length){ rows.innerHTML='<div class="card lr-empty">'+tx('Loading company research…','Cargando empresas…')+'</div>'; return; }
    if(!list.length){ rows.innerHTML='<div class="card lr-empty">'+tx('No companies match. Try another search or filter.','Ninguna empresa coincide.')+'</div>'; return; }
    if(q) list.sort(function(a,b){ var an=a.name.toLowerCase().indexOf(q)>=0?0:1, bn=b.name.toLowerCase().indexOf(q)>=0?0:1; return an-bn; });
    rows.innerHTML=list.slice(0,300).map(function(c){
      var srcs=[c.src.map?'BusDev Map':'',c.src.radar?'Labor Radar':'',c.src.dc?'Data centers':''].filter(Boolean).join(' · ');
      var counts=[c.people.length?plural(c.people.length,'person','people'):'',c.projects.length?plural(c.projects.length,'past project','past projects'):'',c.leads.length?plural(c.leads.length,'radar lead','radar leads'):'',c.events.length?plural(c.events.length,'event','events'):''].filter(Boolean).join(' · ');
      return '<button type="button" class="card rs-row" data-co="'+c.id+'"><span class="rs-name">'+(c.client?'<span class="rs-star" title="IB Group client">★</span> ':'')+esc(c.name)+'</span>'+
        '<span class="rs-meta">'+esc([c.types.join(' / '),(c.data&&c.data.hq)||c.hqText,c.states.length?c.states.join(', '):''].filter(Boolean).join(' · '))+'</span>'+
        '<span class="rs-counts">'+esc(counts||tx('Profile only','Solo perfil'))+'</span><span class="rs-src">'+esc(srcs)+'</span></button>';
    }).join('')+(list.length>300?'<div class="sub13">'+tx('Showing the first 300. Search to narrow.','Mostrando las primeras 300.')+'</div>':'');
  }
  function sec(title,body){ return body?'<section class="card rs-sec"><h2>'+esc(title)+'</h2>'+body+'</section>':''; }
  function ul(items){ return items.length?'<ul class="rs-ul">'+items.join('')+'</ul>':''; }
  function rsProfile(c){
    var d=c.data||{}, h='';
    var facts=[['HQ',d.hq||c.hqText],['Phone',d.phone],['Website',d.website?link(/^https?:/.test(d.website)?d.website:'https://'+d.website,d.website.replace(/^https?:\/\/(www\.)?/,'')):''],['Founded',d.founded],['Ownership',d.ownership],['Size',d.size],['Revenue',d.revenue],['Trades',(d.trades||[]).join(', ')],['Markets',(d.markets||[]).join(', ')],['Licenses',(d.licenses||[]).join(', ')],['Service area',d.serviceArea],['Also known as',d.aka||(c.radar&&(c.radar.aka||[]).join(', '))],['LinkedIn',d.linkedin?link(d.linkedin,'Company page'):''],['Apollo',d.apollo?link(d.apollo,'Open in Apollo'):''],['Research as of',d.asOf||(c.radar&&c.radar.lastChecked)]];
    var factHtml='<dl class="rs-facts">'+facts.filter(function(f){return f[1]}).map(function(f){ return '<dt>'+esc(f[0])+'</dt><dd>'+(/<a /.test(f[1])?f[1]:esc(f[1]))+'</dd>'; }).join('')+'</dl>';
    h+='<div><button type="button" class="btn" id="rsBack">‹ '+tx('All companies','Todas las empresas')+'</button></div>';
    h+='<header class="head"><div class="head-left"><span class="eyebrow">'+esc(c.types.join(' · ')||tx('Company','Empresa'))+(c.states.length?' · '+esc(c.states.join(', ')):'')+'</span><h1>'+(c.client?'<span class="rs-star" title="IB Group client">★</span> ':'')+esc(c.name)+'</h1>'+
      '<span class="sub">'+esc([c.client?tx('IB Group client','Cliente de IB Group'):'',c.src.map?'BusDev Map':'',c.src.radar?'Labor Radar':'',c.src.dc?tx('Data center research','Investigación de centros de datos'):''].filter(Boolean).join(' · '))+'</span></div>'+
      '<div class="head-right">'+(c.mapKey?'<button type="button" class="btn primary" data-mapopen="'+esc(c.mapKey)+'">'+tx('Open on BusDev Map','Abrir en el mapa')+'</button>':'')+(c.leads.length?'<a class="btn" href="#leads">'+tx('Labor Radar','Radar Laboral')+'</a>':'')+'</div></header>';
    h+='<div class="grid g2 rs-top">'+sec(tx('Company facts','Datos de la empresa'),factHtml)+sec(tx('Why it matters / way in','Por qué importa / cómo entrar'),ul(c.notes.map(function(n){return '<li>'+esc(n)+'</li>'}))+(c.warm.length?'<h3>'+tx('Warm paths','Caminos cálidos')+'</h3>'+'<ol class="rs-ul">'+c.warm.map(function(w){return '<li><b>'+esc(w.name)+'</b> — '+esc(w.text)+'</li>'}).join('')+'</ol>':''))+'</div>';
    if(c.leads.length) h+=sec(tx('On the Labor Radar now','En el Radar Laboral ahora'),'<div class="rs-table"><table><thead><tr><th>'+tx('Project','Proyecto')+'</th><th>'+tx('Where','Dónde')+'</th><th>'+tx('Labor need','Necesidad')+'</th><th>'+tx('Score','Puntaje')+'</th></tr></thead><tbody>'+c.leads.slice().sort(function(a,b){return (b.score||0)-(a.score||0)}).map(function(l){return '<tr><td><b>'+esc(l.project)+'</b><br><span class="sub13">'+esc([l.ptype,l.size].filter(Boolean).join(' · '))+'</span></td><td>'+esc([l.metro,l.state].filter(Boolean).join(', '))+'</td><td>'+esc(l.window||'')+'</td><td class="mono">'+esc(l.score)+'</td></tr>'}).join('')+'</tbody></table></div>');
    if(c.people.length) h+=sec(tx('People','Personas')+' · '+c.people.length,'<div class="rs-table"><table><thead><tr><th>'+tx('Name','Nombre')+'</th><th>'+tx('Title','Cargo')+'</th><th>'+tx('Based','Ubicación')+'</th><th>LinkedIn</th><th>'+tx('Last touch','Último contacto')+'</th></tr></thead><tbody>'+c.people.map(function(p){return '<tr><td><b>'+esc(p.name)+'</b>'+(p.evidence?'<br><span class="sub13">'+(p.link?link(p.link,p.evidence):esc(p.evidence))+'</span>':'')+'</td><td>'+esc(p.title)+'</td><td>'+esc(p.where||'')+'</td><td>'+(p.linkedin?link(p.linkedin,'Profile ↗'):'<span class="tag">None</span>')+'</td><td class="mono">'+esc(p.touch)+'</td></tr>'}).join('')+'</tbody></table></div>');
    var offs=c.offices.filter(function(o,i,a){ return a.findIndex(function(x){return (x.where||x.name)===(o.where||o.name)})===i; });
    if(offs.length) h+=sec(tx('Offices','Oficinas')+' · '+offs.length,ul(offs.map(function(o){ return '<li><b>'+esc(o.name||o.where)+'</b>'+(o.where&&o.where!==o.name?' — '+esc(o.where):'')+(o.phone?' · '+esc(o.phone):'')+((o.hiring||[]).length?' · <span class="rs-hire">'+tx('Hiring: ','Contratando: ')+esc(o.hiring.join(', '))+'</span>':'')+(o.note?'<br><span class="sub13">'+esc(o.note)+'</span>':'')+'</li>'; })));
    if(c.signals.length) h+=sec(tx('Signals','Señales'),ul(c.signals.map(function(s){return '<li><b>'+(s.link?link(s.link,s.name):esc(s.name))+'</b>'+(s.note?' — '+esc(s.note):'')+'</li>'})));
    if(c.dc.length) h+=sec(tx('Data center work','Trabajo en centros de datos'),c.dc.map(function(x){return '<dl class="rs-facts">'+[['Territory',x.presence],['Evidence',x.evidence],['Scale',x.scale],['Labor angle',x.angle],['Named contact',x.contact]].filter(function(f){return f[1]}).map(function(f){return '<dt>'+esc(f[0])+'</dt><dd>'+esc(f[1])+'</dd>'}).join('')+'</dl>'+(x.sources.length?'<div class="rs-links">'+x.sources.map(function(u){return link(u)}).join('')+'</div>':'')}).join(''));
    if(c.projects.length) h+=sec(tx('Project history','Historial de proyectos')+' · '+c.projects.length,'<div class="rs-table"><table><thead><tr><th>'+tx('Project','Proyecto')+'</th><th>'+tx('Type','Tipo')+'</th><th>'+tx('Where','Dónde')+'</th><th>GC</th><th>'+tx('Scope','Alcance')+'</th></tr></thead><tbody>'+c.projects.map(function(p){return '<tr><td><b>'+(p.link?link(p.link,p.name):esc(p.name))+'</b>'+([p.value,p.year,p.status].filter(Boolean).length?'<br><span class="sub13">'+esc([p.value,p.year,p.status].filter(Boolean).join(' · '))+'</span>':'')+'</td><td>'+esc(p.type)+'</td><td>'+esc(p.where)+'</td><td>'+esc(p.gc)+'</td><td>'+esc(p.scope)+'</td></tr>'}).join('')+'</tbody></table></div>');
    if(c.partners.length) h+=sec(tx('GCs, owners and partners','GCs, dueños y socios'),ul(c.partners.map(function(p){return '<li><b>'+(p.link?link(p.link,p.name):esc(p.name))+'</b>'+(p.kind?' <span class="tag">'+esc(p.kind)+'</span>':'')+(p.note?' — '+esc(p.note):'')+'</li>'})));
    if(c.competitors.length) h+=sec(tx('Competitors','Competidores'),ul(c.competitors.map(function(p){return '<li><b>'+(p.link?link(p.link,p.name):esc(p.name))+'</b>'+(p.note?' — '+esc(p.note):'')+'</li>'})));
    var ev=c.events.map(function(e){return '<li>'+(e.url?link(e.url,e.name):esc(e.name))+' — '+esc([e.date||tx('date TBA','fecha por anunciar'),[e.venue,e.city,e.state].filter(Boolean).join(', '),e.role].filter(Boolean).join(' · '))+'</li>'});
    var as=c.associations.map(function(a){return '<li>'+(a.url?link(a.url,[a.org,a.chapter].filter(Boolean).join(' – ')):esc([a.org,a.chapter].filter(Boolean).join(' – ')))+(a.role?' — '+esc(a.role):'')+'</li>'});
    var ch=c.charities.map(function(x){return '<li>'+(x.url?link(x.url,x.name):esc(x.name))+(x.how?' — '+esc(x.how):'')+'</li>'});
    var sp=c.sports.map(function(x){return '<li>'+(x.url?link(x.url,x.team):esc(x.team))+' — '+esc([x.league,x.relationship].filter(Boolean).join(' · '))+'</li>'});
    if(ev.length||as.length||ch.length||sp.length) h+=sec(tx('Where to meet them','Dónde conocerlos'),(ev.length?'<h3>'+tx('Events','Eventos')+'</h3>'+ul(ev):'')+(as.length?'<h3>'+tx('Associations','Asociaciones')+'</h3>'+ul(as):'')+(ch.length?'<h3>'+tx('Charities','Beneficencia')+'</h3>'+ul(ch):'')+(sp.length?'<h3>'+tx('Sports','Deportes')+'</h3>'+ul(sp):''));
    if(c.sources.length) h+=sec(tx('Sources','Fuentes'),'<div class="rs-links">'+c.sources.map(function(s){return s.url?link(s.url,s.label):esc(s.label)}).join('')+'</div>');
    return h;
  }
  function rsOpen(id,push){
    var c=CO.find(function(x){return x.id===id}); if(!c)return;
    RS.open=id; $('rsList').hidden=true; $('rsTop').hidden=true; var p=$('rsProfile'); p.hidden=false; p.innerHTML=rsProfile(c); window.scrollTo(0,0);
    if(push!==false) try{ history.pushState({rs:id},'','#research'); }catch(e){}
  }
  function rsClose(){ RS.open=null; $('rsTop').hidden=false; $('rsProfile').hidden=true; $('rsList').hidden=false; }
  function rsWire(){
    if(!$('rsRows'))return;
    $('rsRows').addEventListener('click',function(e){ var b=e.target.closest('[data-co]'); if(b) rsOpen(b.dataset.co); });
    $('rsProfile').addEventListener('click',function(e){
      if(e.target.closest('#rsBack')){ if(history.state&&history.state.rs) history.back(); else rsClose(); return; }
      var m=e.target.closest('[data-mapopen]'); if(m&&window.BDMAP){ location.hash='#leadgen'; setTimeout(function(){ window.BDMAP.openCompany(m.dataset.mapopen); },60); }
    });
    window.addEventListener('popstate',function(e){ if(location.hash!=='#research')return; var s=e.state||{}; if(s.rs) rsOpen(s.rs,false); else rsClose(); });
    var qt; $('rsQ').addEventListener('input',function(e){ clearTimeout(qt); qt=setTimeout(function(){ RS.q=e.target.value.trim(); rsRender(); },150); });
    $('rsSrc').addEventListener('change',function(e){ RS.src=e.target.value; rsRender(); });
    $('rsType').addEventListener('change',function(e){ RS.type=e.target.value; rsRender(); });
    $('rsStates').addEventListener('click',function(e){ var b=e.target.closest('[data-rst]'); if(!b)return; RS.state=b.dataset.rst; try{localStorage.setItem('bdp-rs-state',RS.state)}catch(x){} rsRender(); });
    $('rsClients').addEventListener('change',function(e){ RS.clients=e.target.checked; rsRender(); });
  }

  /* ---------- Who's Working Where heat map ---------- */
  var CT=[['all',tx('All companies','Todas')],['General contractor',tx('GCs','GCs')],['Drywall & framing sub',tx('Drywall & framing subs','Subs de drywall y framing')],['Restoration',tx('Restoration','Restauración')],['Specialty trade',tx('Specialty trades','Oficios especiales')],['Owner / developer',tx('Owners & developers','Dueños y desarrolladores')]];
  var HM={type:'all',measure:'projects',sel:null}, REC=[];
  try{ var hs=JSON.parse(localStorage.getItem('bdp-hm')||'{}'); if(hs.type)HM.type=hs.type; if(hs.measure)HM.measure=hs.measure; }catch(e){}
  function gcNames(s){ s=String(s||''); if(!s||/not (named|identified|listed)|unconfirmed|unknown|^tbd|^n\/a|builder not named/i.test(s)) return []; return s.replace(/\(.*?\)/g,'').split(/\s*\/\s*|\s*;\s*|\bJV\b|\bjoint venture\b/i).map(function(x){return x.replace(/^\s*(GC|CM|CMAR|CMc)[:\s]+/i,'').trim()}).filter(function(x){return x.length>2&&!/^(and|with|the)$/i.test(x)}); }
  function records(){
    var out=[], M=window.BDMAP;
    var add=function(company,ctype,ptype,st,project,src,url){ if(!ST_NAME[st])return; out.push({co:company,ct:ctype,pt:ptype,st:st,pj:project,pk:st+'|'+norm(project).slice(0,40),src:src,url:url||''}); };
    CO.forEach(function(c){
      if(!c.src.map) return;
      var ct=c.types[0];
      c.projects.forEach(function(p){ add(c.name,ct,p.type,p.st,p.name,'BusDev Map',p.link);
        gcNames(p.gc).forEach(function(g){ add(g,'General contractor',p.type,p.st,p.name,'BusDev Map',p.link); }); });
    });
    var leadCos={}; R.companies.forEach(function(rc){ (rc.leadIds||[]).forEach(function(id){ (leadCos[id]=leadCos[id]||[]).push(rc); }); });
    R.leads.forEach(function(l){ if(l.active===false)return; var pt=classify(l.project,l.ptype), src=(l.src||[])[0];
      var cos=leadCos[l.id]||[];
      if(cos.length) cos.forEach(function(rc){ add(rc.name,RADAR_TYPE[rc.type]||'Other',pt,l.state,l.project,'Labor Radar',src); });
      else { var g=gcNames(l.gc); g.forEach(function(n){ add(n,'General contractor',pt,l.state,l.project,'Labor Radar',src); }); if(l.sub&&!/:/.test(l.sub)) add(l.sub,'Drywall & framing sub',pt,l.state,l.project,'Labor Radar',src); if(!g.length&&!l.sub) add('',null,pt,l.state,l.project,'Labor Radar',src); }
    });
    if(M&&M.DC_DATA) ['builders','subs','pipeline'].forEach(function(k){ (M.DC_DATA[k]||[]).forEach(function(d){ statesIn(d.territory_presence).forEach(function(st){ add(d.name,DC_ROLE[d.role]||'Other','Data center',st,d.name+' – data center work ('+st+')','Data center research',(d.sources||[])[0]); }); }); });
    return out;
  }
  function cellKey(pt,st){ return pt+'|'+st; }
  function hmData(){
    var recs=REC.filter(function(r){ return HM.type==='all'?true:r.ct===HM.type; });
    var cells={}, rowT={}, colT={}, max=0;
    recs.forEach(function(r){ var k=cellKey(r.pt,r.st); var c=cells[k]=cells[k]||{p:{},c:{},recs:[]}; c.p[r.pk]=1; if(r.co)c.c[norm(r.co)||r.co]=r.co; c.recs.push(r); });
    Object.keys(cells).forEach(function(k){ var c=cells[k]; c.np=Object.keys(c.p).length; c.nc=Object.keys(c.c).length; c.v=HM.measure==='projects'?c.np:c.nc; if(c.v>max)max=c.v; var pt=k.split('|')[0], st=k.split('|')[1]; rowT[pt]=(rowT[pt]||0)+c.v; colT[st]=(colT[st]||0)+c.v; });
    return {recs:recs,cells:cells,max:max,rowT:rowT,colT:colT};
  }
  function heat(v,max){ if(!v)return ''; var t=Math.sqrt(v/max); return 'background:color-mix(in srgb, var(--accent) '+Math.round(12+t*78)+'%, var(--card));color:'+(t>0.55?'#fff':'var(--fg)'); }
  function hmRender(){
    var tb=$('hmTable'); if(!tb)return;
    $('hmTypes').innerHTML=CT.map(function(t){ return '<button type="button" data-t="'+esc(t[0])+'" aria-pressed="'+(HM.type===t[0])+'">'+esc(t[1])+'</button>'; }).join('');
    document.querySelectorAll('#hmMeasure [data-m]').forEach(function(b){ b.setAttribute('aria-pressed',String(b.dataset.m===HM.measure)); });
    var D=hmData();
    var types=(classify&&classify.TYPES||[]).filter(function(t){ return D.rowT[t]; });
    types.sort(function(a,b){ return a==='Other'?1:b==='Other'?-1:(D.rowT[b]-D.rowT[a]); });
    var allP={}; D.recs.forEach(function(r){allP[r.pk]=1});
    $('hmEyebrow').textContent=tx('Heat map · ','Mapa de calor · ')+Object.keys(allP).length+tx(' projects · ',' proyectos · ')+Object.keys(D.recs.reduce(function(m,r){ if(r.co)m[norm(r.co)]=1; return m; },{})).length+tx(' companies',' empresas');
    if(!types.length){ tb.innerHTML='<tbody><tr><td class="lr-empty">'+tx('Loading activity…','Cargando…')+'</td></tr></tbody>'; return; }
    var h='<thead><tr><th scope="col">'+tx('Project type','Tipo de proyecto')+'</th>'+TERR.map(function(s){return '<th scope="col" title="'+esc(ST_NAME[s])+'">'+s+'</th>'}).join('')+'<th scope="col">'+tx('Total','Total')+'</th></tr></thead><tbody>';
    types.forEach(function(pt){
      h+='<tr><th scope="row">'+esc(pt)+'</th>'+TERR.map(function(st){ var c=D.cells[cellKey(pt,st)], v=c?c.v:0, on=HM.sel===cellKey(pt,st);
        return '<td>'+(v?'<button type="button" class="hm-c'+(on?' on':'')+'" data-k="'+esc(cellKey(pt,st))+'" style="'+heat(v,D.max)+'" aria-label="'+esc(pt+' in '+ST_NAME[st]+': '+v+' '+HM.measure)+'">'+v+'</button>':'<span class="hm-z">·</span>')+'</td>'; }).join('')+'<td class="mono hm-t">'+(D.rowT[pt]||0)+'</td></tr>';
    });
    h+='<tr class="hm-tot"><th scope="row">'+tx('Total','Total')+'</th>'+TERR.map(function(s){return '<td class="mono">'+(D.colT[s]||0)+'</td>'}).join('')+'<td></td></tr></tbody>';
    tb.innerHTML=h;
    // takeaways: the five hottest cells, said plainly
    var top=Object.keys(D.cells).filter(function(k){return k.split('|')[0]!=='Other'}).sort(function(a,b){return D.cells[b].v-D.cells[a].v}).slice(0,5);
    var who=CT.find(function(t){return t[0]===HM.type})[1];
    $('hmTake').innerHTML=top.length?'<span class="label">'+tx('Hottest','Más activo')+'</span>'+top.map(function(k){ var p=k.split('|'); return '<button type="button" class="hm-pill" data-k="'+esc(k)+'">'+esc((HM.type==='all'?'':who+' · ')+p[0]+' in '+ST_NAME[p[1]])+' <b>'+D.cells[k].v+'</b></button>'; }).join(''):'';
    $('hmFoot').textContent=tx('Counting ','Contando ')+(HM.measure==='projects'?tx('distinct projects','proyectos distintos'):tx('distinct companies','empresas distintas'))+tx(' from the BusDev Map, the Labor Radar and data center research. Click a cell for the companies and projects behind it.',' del mapa, el radar y la investigación de centros de datos. Haga clic en una celda para ver detalles.');
    hmDetail(D);
  }
  function hmDetail(D){
    var box=$('hmDetail'); if(!box)return;
    if(!HM.sel||!D.cells[HM.sel]){ box.hidden=true; return; }
    var p=HM.sel.split('|'), c=D.cells[HM.sel];
    var byCo={}; c.recs.forEach(function(r){ if(!r.co)return; var k=norm(r.co)||r.co; var x=byCo[k]=byCo[k]||{name:r.co,ct:r.ct,pj:{}}; x.pj[r.pk]=r; });
    var cos=Object.keys(byCo).map(function(k){return byCo[k]}).sort(function(a,b){return Object.keys(b.pj).length-Object.keys(a.pj).length||a.name.localeCompare(b.name)});
    var pj={}; c.recs.forEach(function(r){ pj[r.pk]=pj[r.pk]||r; });
    var who=CT.find(function(t){return t[0]===HM.type})[1];
    box.hidden=false;
    box.innerHTML='<div class="card-head"><h2>'+esc((HM.type==='all'?'':who+' · ')+p[0]+' in '+ST_NAME[p[1]])+'</h2><button type="button" class="btn" id="hmClose">'+tx('Close','Cerrar')+'</button></div>'+
      '<div class="sub13">'+plural(c.np,'project','projects')+' · '+plural(c.nc,'company','companies')+'</div>'+
      '<div class="grid g2"><div><h3 class="label">'+tx('Companies','Empresas')+'</h3><ul class="rs-ul">'+(cos.length?cos.map(function(x){ var co=byNorm[norm(x.name)]; return '<li>'+(co?'<button type="button" class="linklike" data-rsopen="'+co.id+'">'+(co.client?'★ ':'')+esc(x.name)+'</button>':esc(x.name))+' <span class="sub13">'+esc(x.ct||'')+' · '+plural(Object.keys(x.pj).length,'project','projects')+'</span></li>'; }).join(''):'<li class="sub13">'+tx('No company named yet on these projects.','Aún no hay empresas nombradas.')+'</li>')+'</ul></div>'+
      '<div><h3 class="label">'+tx('Projects','Proyectos')+'</h3><ul class="rs-ul">'+Object.keys(pj).map(function(k){ var r=pj[k]; return '<li>'+(r.url?link(r.url,r.pj):esc(r.pj))+' <span class="sub13">'+esc(r.src)+'</span></li>'; }).join('')+'</ul></div></div>';
  }
  function hmMarket(){
    var box=$('hmMarket'); if(!box||!MK||!(MK.indicators||[]).length){ if(box)box.hidden=true; return; }
    var inds=MK.indicators;
    var fmt=function(v,u){ if(v==null)return '—'; if(typeof v!=='number')return esc(v); if(/\$|usd|dollar/i.test(u||'')) return v>=1e9?'$'+(v/1e9).toFixed(1)+'B':v>=1e6?'$'+(v/1e6).toFixed(0)+'M':'$'+v.toLocaleString(L); return v.toLocaleString(L); };
    var h='<div class="card-head"><h2>'+tx('Market context (outside data)','Contexto de mercado (datos externos)')+'</h2><span class="note">'+tx('Public sources, to check our picture against','Fuentes públicas')+'</span></div>';
    h+='<div class="hm-wrap"><table class="hm hm-mk"><thead><tr><th scope="col">'+tx('Indicator','Indicador')+'</th>'+TERR.map(function(s){return '<th scope="col">'+s+'</th>'}).join('')+'</tr></thead><tbody>';
    inds.forEach(function(ind){ var vals=TERR.map(function(s){return (ind.values||{})[s]}).filter(function(v){return typeof v==='number'}); var mx=Math.max.apply(null,vals.concat([0]));
      h+='<tr><th scope="row">'+esc(ES&&ind.label_es||ind.label)+'<br><span class="sub13">'+esc(ES&&ind.period_es||ind.period||'')+(ind.source&&ind.source.url?' · '+link(ind.source.url,ind.source.title||'source'):'')+'</span></th>'+TERR.map(function(s){ var v=(ind.values||{})[s]; return '<td><span class="hm-v" style="'+(typeof v==='number'&&mx?heat(v,mx):'')+'">'+fmt(v,ind.unit)+'</span></td>'; }).join('')+'</tr>'; });
    h+='</tbody></table></div>';
    var notes=(MK.notes||[]).filter(function(n){return n.text});
    if(notes.length) h+='<ul class="rs-ul hm-notes">'+notes.map(function(n){ return '<li><b>'+esc(n.state)+(n.projectType?' · '+esc(n.projectType):'')+'</b> — '+esc(ES&&n.text_es||n.text)+(n.url?' '+link(n.url,'source'):'')+'</li>'; }).join('')+'</ul>';
    if(MK.asOf) h+='<div class="sub13">'+tx('Gathered ','Recopilado ')+esc(ES&&MK.asOf_es||MK.asOf)+'</div>';
    box.hidden=false; box.innerHTML=h;
  }
  function hmWire(){
    if(!$('hmTable'))return;
    var save=function(){ try{ localStorage.setItem('bdp-hm',JSON.stringify({type:HM.type,measure:HM.measure})); }catch(e){} };
    $('hmTypes').addEventListener('click',function(e){ var b=e.target.closest('[data-t]'); if(!b)return; HM.type=b.dataset.t; HM.sel=null; save(); hmRender(); });
    $('hmMeasure').addEventListener('click',function(e){ var b=e.target.closest('[data-m]'); if(!b)return; HM.measure=b.dataset.m; save(); hmRender(); });
    var pick=function(e){ var b=e.target.closest('[data-k]'); if(!b)return; HM.sel=HM.sel===b.dataset.k?null:b.dataset.k; hmRender(); if(HM.sel) $('hmDetail').scrollIntoView({behavior:'smooth',block:'nearest'}); };
    $('hmTable').addEventListener('click',pick); $('hmTake').addEventListener('click',pick);
    $('hmDetail').addEventListener('click',function(e){ if(e.target.closest('#hmClose')){ HM.sel=null; hmRender(); return; } var b=e.target.closest('[data-rsopen]'); if(b){ location.hash='#research'; setTimeout(function(){ rsOpen(b.dataset.rsopen); },30); } });
  }

  /* ---------- Overview tool counts ---------- */
  function overview(){
    var con=0, cos=0; var M=window.BDMAP;
    if(M){ var cl=M.COMPANIES.filter(M.isClient); cos=cl.length; cl.forEach(function(e){ con+=(e.people||[]).length; }); }
    try{ con+=JSON.parse(localStorage.getItem('bdp-contacts')||'[]').length; }catch(e){}
    var set=function(id,t){ var e=$(id); if(e)e.textContent=t; };
    if(M) set('ovConMeta',con+tx(' contacts · ',' contactos · ')+cos+tx(' client companies',' empresas cliente'));
    if(REC.length){ var p={}; REC.forEach(function(r){p[r.pk]=1}); set('ovFlowMeta',Object.keys(p).length+tx(' projects in 9 states',' proyectos en 9 estados')); }
    if(CO.length) set('ovResMeta',CO.length+tx(' companies researched',' empresas investigadas'));
  }

  /* ---------- boot ---------- */
  var t; function refresh(){ clearTimeout(t); t=setTimeout(function(){ build(); REC=records(); rsFill(); rsRender(); hmRender(); overview(); if(RS.open){ var c=CO.find(function(x){return x.id===RS.open}); if(!c) rsClose(); } },80); }
  rsWire(); hmWire();
  window.addEventListener('bdmap:ready',function(){ haveMap=true; refresh(); });
  window.addEventListener('bdmap:change',refresh);
  if(window.BDMAP){ haveMap=true; }
  fetch('data/leads.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){ if(d){ R.leads=d.leads||[]; R.companies=d.companies||[]; R.run=d.run||{}; } haveRadar=true; refresh(); }).catch(function(){ haveRadar=true; refresh(); });
  fetch('data/market.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){ MK=d; hmMarket(); }).catch(function(){});
  refresh();
})();
