/* Overview: Monday follow-ups. Built from the BusDev Map's outreach log (people you spoke with and wrote a note about).
   Each name opens that person's card on the BusDev Map. */
(function(){
  'use strict';
  var L=window.BDP_LOCALE||'en-US', ES=(L||'').toLowerCase().indexOf('es')===0, tx=function(en,es){return ES?es:en};
  var BUCKETS_ES=['Seguimiento pendiente','Hablamos esta semana','Enfriándose: sin contacto en 3+ semanas','Conversaciones anteriores'];
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function nice(iso){ if(!iso) return ''; var d=new Date(iso+'T12:00:00'); return isNaN(d)?iso:d.toLocaleDateString(L,{weekday:'short',month:'short',day:'numeric'}); }
  function $(id){ return document.getElementById(id); }
  function render(){
    var body=$('ovFUBody'); if(!body) return;
    var M=window.BDMAP;
    if(!M||!M.followups){ body.innerHTML='<p class="sub13">'+tx('Loading the BusDev Map…','Cargando el mapa BusDev…')+'</p>'; return; }
    var rows=M.followups(), mon=M.monday();
    var due=rows.filter(function(r){return r.bucket===0}).length;
    $('ovFUFor').textContent=tx('For Monday ','Para el lunes ')+nice(mon)+' · '+rows.length+' '+(rows.length===1?tx('person','persona'):tx('people','personas'))+(due?' · '+due+tx(' due',' pendientes'):'');
    if(!rows.length){ body.innerHTML='<p class="sub13">'+tx("Nobody yet. On the BusDev Map, log a conversation on a person's card and fill in the Note box; that puts them on this list.","Nadie todavía. En el mapa BusDev, registre una conversación en la ficha de una persona y llene la Nota; eso los pone en esta lista.")+'</p>'; return; }
    body.innerHTML=M.FU_BUCKETS.map(function(title,bi){
      var rs=rows.filter(function(r){return r.bucket===bi}); if(!rs.length) return '';
      return '<h3'+(bi===0?' class="due"':'')+'>'+esc(ES?BUCKETS_ES[bi]:title)+' <span class="n">'+rs.length+'</span></h3><ol>'+rs.map(function(r){
        var meta=tx('Talked ','Hablamos ')+esc(nice(r.lastTalk.at))+(r.next?' · <b>'+tx('follow up ','seguimiento ')+esc(nice(r.next))+'</b>':'')+(r.lastAny>r.lastTalk.at?' · '+tx('last touch ','último contacto ')+esc(nice(r.lastAny)):'');
        var name=r.onMap?'<a class="name" href="#leadgen" data-fu="'+esc(r.key)+'">'+esc(r.person)+'</a>':'<span class="name" style="font-weight:700">'+esc(r.person)+'</span>';
        var links=(r.onMap?'<a href="#leadgen" data-fu="'+esc(r.key)+'">'+tx('Open card & log the call →','Abrir ficha y registrar la llamada →')+'</a>':'')+(r.linkedin?'<a href="'+esc(r.linkedin)+'" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>':'');
        return '<li'+(bi===0?' class="due"':'')+'><div class="who">'+(r.client?'<span class="star" aria-label="IB Group client">★</span>':'')+name+'<span class="fu-co">'+esc(r.company)+'</span></div>'+
          (r.title?'<span class="t">'+esc(r.title)+'</span>':'')+'<span class="meta">'+meta+'</span>'+(r.lastTalk.note?'<span class="note2">'+esc(r.lastTalk.note)+'</span>':'')+
          (links?'<div class="links">'+links+'</div>':'')+'</li>';
      }).join('')+'</ol>';
    }).join('');
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('#ovFU [data-fu]'); if(!a) return;
    e.preventDefault();
    var key=a.getAttribute('data-fu');
    if(location.hash!=='#leadgen') location.hash='#leadgen';
    // wait for the map tab to be on screen so the circles lay out at full size
    setTimeout(function(){ if(window.BDMAP&&window.BDMAP.openPerson) window.BDMAP.openPerson(key); var v=$('view-leadgen'); if(v&&v.scrollIntoView) v.scrollIntoView({block:'start'}); },80);
  });
  var t; function later(){ clearTimeout(t); t=setTimeout(render,120); }
  window.addEventListener('bdmap:ready',later); window.addEventListener('bdmap:change',later);
  window.addEventListener('hashchange',function(){ if(location.hash==='#overview'||location.hash==='') later(); });
  var copy=$('ovFUCopy');
  if(copy) copy.addEventListener('click',async function(){
    var M=window.BDMAP; if(!M||!M.fuText) return;
    try{ await navigator.clipboard.writeText(M.fuText()); copy.textContent=tx('Copied','Copiado'); }catch(e){ copy.textContent=tx('Copy failed','Falló la copia'); }
    setTimeout(function(){ copy.textContent=tx('Copy list','Copiar lista'); },1500);
  });
  render();
})();
