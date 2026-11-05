/* Daily Reports: live preview of the contacts logged on the selected day (Client Networks + BusDev Map).
   A scheduled run writes the same list into "What happened" and the counters at 5 PM Eastern. */
(function(){
  'use strict';
  var L=window.BDP_LOCALE||'en-US', ES=(L||'').toLowerCase().indexOf('es')===0, tx=function(en,es){return ES?es:en};
  var FEEL={'2':tx('very positive','muy positivo'),'1':tx('positive','positivo'),'0':tx('neutral','neutral'),'-1':tx('negative','negativo'),'-2':tx('very negative','muy negativo')};
  var DUR={'u5':'<5 min','5-15':'5–15 min','15-30':'15–30 min','30-60':'30–60 min','60p':'60+ min'};
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function read(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } }
  function pretty(id){ return String(id||'?').replace(/^p-/,'').split('-').map(function(w){return w.charAt(0).toUpperCase()+w.slice(1)}).join(' '); }
  function todayET(){ try{ return new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}); }catch(e){ return new Date().toISOString().slice(0,10); } }
  function day(){ try{ var d=localStorage.getItem('bdp-rpt-day'); if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; }catch(e){} return todayET(); }
  function rows(d){
    var out=[];
    (read('bdp-cnet-logs',[])||[]).forEach(function(t){ if(t.date!==d) return;
      out.push({who:t.name||pretty(t.contact), co:t.companyName||(t.company==='circle'?'The Circle Group':'Acousti'), what:[t.type,DUR[t.duration]||'',t.feel!=null?tx('felt ','se sintió ')+FEEL[String(t.feel)]:''].filter(Boolean).join(' · '), src:'Client Networks'}); });
    var O=read('pwOutreach',{})||{};
    Object.keys(O).forEach(function(k){ (O[k]||[]).forEach(function(e){ if(e.at!==d) return;
      out.push({who:pretty(k.split('__')[1]), co:k.split('__')[0], what:[e.channel,e.outcome,e.note].filter(Boolean).join(' · '), src:'BusDev Map', key:k}); }); });
    return out;
  }
  function render(){
    var ta=document.getElementById('rptHappened'); if(!ta) return;
    var box=document.getElementById('rptAuto');
    if(!box){ box=document.createElement('div'); box.id='rptAuto'; box.className='rpt-auto'; ta.parentNode.appendChild(box); }
    var d=day(), list=rows(d), M=window.BDMAP;
    list.forEach(function(r){ if(r.key&&M&&M.COMPANIES){ var c=M.COMPANIES.find(function(e){return e.key===r.co}); if(c){ var pid=r.key.split('__')[1], pp=(c.people||[]).find(function(x){return x.id===pid}); if(pp) r.who=pp.name; r.co=c.company.name; } } });
    var past=d<todayET(), now=new Date(), etHour=+now.toLocaleString('en-US',{timeZone:'America/New_York',hour:'numeric',hour12:false});
    var when=past||(d===todayET()&&etHour>=17)?tx('Added to this report at 5 PM.','Agregado a este informe a las 5 PM.'):tx('Will be added to this report at 5 PM Eastern.','Se agregará a este informe a las 5 PM (hora del Este).');
    box.innerHTML='<div class="rpt-auto-h"><b>'+tx('Contacts logged this day','Contactos registrados este día')+' · '+list.length+'</b><span>'+(list.length?when:tx('Nothing logged yet in Client Networks or the BusDev Map.','Nada registrado todavía en Redes de clientes ni en el mapa BusDev.'))+'</span></div>'+
      (list.length?'<ul>'+list.map(function(r){ return '<li><b>'+esc(r.who)+'</b> <span class="co">'+esc(r.co)+'</span><span class="w">'+esc(r.what)+'</span><span class="s">'+esc(r.src)+'</span></li>'; }).join('')+'</ul>':'');
  }
  var t; function later(){ clearTimeout(t); t=setTimeout(render,80); }
  window.addEventListener('hashchange',function(){ if(location.hash==='#reports') later(); });
  window.addEventListener('bdmap:ready',later); window.addEventListener('bdmap:change',later);
  window.addEventListener('storage',later);
  document.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('#view-reports')) later(); });
  var line=document.getElementById('rptDateLine'); if(line&&window.MutationObserver) new MutationObserver(later).observe(line,{childList:true,characterData:true,subtree:true});
  render();
})();
