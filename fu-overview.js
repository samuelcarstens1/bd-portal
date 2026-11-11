/* Overview: Monday follow-ups, as a plain list: name, company, role. The people come from the Client Networks contact
   log (people you talked with, plus any follow-up dates you set) and the old BusDev Map log, follow-ups due first.
   Each name opens that person's Client Networks profile. */
(function(){
  'use strict';
  var L=window.BDP_LOCALE||'en-US', ES=(L||'').toLowerCase().indexOf('es')===0, tx=function(en,es){return ES?es:en};
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function nice(iso){ if(!iso) return ''; var d=new Date(iso+'T12:00:00'); return isNaN(d)?iso:d.toLocaleDateString(L,{weekday:'short',month:'short',day:'numeric'}); }
  function $(id){ return document.getElementById(id); }
  function rows(){ var M=window.CNET; return M&&M.followups?M.followups():null; }
  function render(){
    var body=$('ovFUBody'); if(!body) return;
    var M=window.CNET, rs=rows();
    if(!rs){ body.innerHTML='<p class="sub13">'+tx('Loading Client Networks…','Cargando redes de clientes…')+'</p>'; return; }
    $('ovFUFor').textContent=tx('For ','Para el ')+nice(M.monday())+' · '+rs.length+' '+(rs.length===1?tx('person','persona'):tx('people','personas'));
    if(!rs.length){ body.innerHTML='<p class="sub13">'+tx("Nobody yet. In Client Networks, log a contact on a person's profile and fill in what was said, or set a follow-up date; that puts them on this list.","Nadie todavía. En Redes de clientes, registre un contacto en el perfil de una persona y anote lo que se habló, o ponga una fecha de seguimiento; eso los pone en esta lista.")+'</p>'; return; }
    body.innerHTML='<table class="table fu-table"><thead><tr><th scope="col">'+tx('Name','Nombre')+'</th><th scope="col">'+tx('Company','Empresa')+'</th><th scope="col">'+tx('Role','Cargo')+'</th></tr></thead><tbody>'+
      rs.map(function(r){
        return '<tr><td class="fu-n"><a class="fu-name" href="#network" data-fu="'+esc(r.companyKey)+'" data-fu-name="'+esc(r.person)+'">'+esc(r.person)+'</a></td>'+
          '<td class="fu-c">'+(r.client?'<span class="star" role="img" aria-label="IB Group client" title="IB Group client">★</span>':'')+esc(r.company)+'</td>'+
          '<td class="fu-r">'+esc(r.title||'—')+'</td></tr>';
      }).join('')+'</tbody></table>';
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('#ovFU [data-fu]'); if(!a) return;
    e.preventDefault();
    if(window.CNET&&window.CNET.open) window.CNET.open(a.getAttribute('data-fu'), a.getAttribute('data-fu-name'));
  });
  var t; function later(){ clearTimeout(t); t=setTimeout(render,120); }
  window.addEventListener('bdmap:ready',later); window.addEventListener('bdmap:change',later); window.addEventListener('cnet:logs',later); window.addEventListener('cnet:clients',later);
  window.addEventListener('hashchange',function(){ if(location.hash==='#overview'||location.hash==='') later(); });
  // The list folds away (closed by default); this browser remembers whether it was left open
  var tog=$('ovFUToggle'), fuBody=$('ovFUBody');
  function setOpen(on){ if(!tog||!fuBody) return; tog.setAttribute('aria-expanded',on?'true':'false'); fuBody.hidden=!on; }
  if(tog){ var open=false; try{ open=localStorage.getItem('bdp-fu-open')==='1'; }catch(e){} setOpen(open);
    tog.addEventListener('click',function(){ var on=tog.getAttribute('aria-expanded')!=='true'; setOpen(on); try{ localStorage.setItem('bdp-fu-open',on?'1':'0'); }catch(e){} }); }
  var copy=$('ovFUCopy');
  if(copy) copy.addEventListener('click',async function(){
    var rs=rows(); if(!rs) return;
    var text=tx('Monday follow-ups, ','Seguimientos del lunes, ')+nice(window.CNET.monday())+'\n\n'+rs.map(function(r){ return '- '+r.person+', '+r.company+(r.title?' ('+r.title+')':''); }).join('\n');
    try{ await navigator.clipboard.writeText(text); copy.textContent=tx('Copied','Copiado'); }catch(e){ copy.textContent=tx('Copy failed','Falló la copia'); }
    setTimeout(function(){ copy.textContent=tx('Copy list','Copiar lista'); },1500);
  });
  render();
})();
