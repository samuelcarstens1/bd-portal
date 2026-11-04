/* BD Progress Portal — storage sync + boot.
   In the claude.ai artifact: every portal data key is mirrored to the artifact's database (collection "kv",
   chunked into "kvc"), loaded before the portal starts and written back on every change, so the data lives
   with the artifact and Claude can read it. Elsewhere (GitHub Pages, local file) the portal runs off this
   browser's storage exactly as before. UI preferences (language, last tab) stay per-browser. */
(function(){
  'use strict';
  var SYNC=['bdp-opps','bdp-contacts','bdp-expenses','bdp-expmeta','bdp-goals','bdp-kpis','bdp-reports','bdp-weeks','bdp-aop','ib-ramp-plan-v1','bdp-seed-ftp-v1'];
  var CHUNK=180000;
  var LS=window.localStorage, P=Storage.prototype, rawSet=P.setItem, rawGet=P.getItem, rawRemove=P.removeItem;
  var snapAt='', db=null, mode='local', known={}, timers={}, writing={}, again={}, pending=0, failed=false, mine={};
  window.BDP_SYNC={mode:function(){return mode}};

  /* ---------- status pill ---------- */
  function pill(){
    var el=document.getElementById('syncPill');
    if(!el){ var side=document.querySelector('.side-foot')||document.querySelector('.side'); if(!side)return; el=document.createElement('div'); el.id='syncPill'; el.className='syncpill'; side.insertBefore(el,side.firstChild); }
    var t,c;
    if(mode==='loading'){t='Loading portal data…';c='wait';}
    else if(mode==='db'){ if(failed){t='Not saved — check connection';c='bad';} else if(pending){t='Saving…';c='wait';} else {t='Saved to portal';c='ok';} }
    else if(mode==='snapshot'){ var d=new Date(snapAt); t='View-only copy · updated '+(isNaN(d)?'':d.toLocaleString(window.BDP_LOCALE||'en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})); c='ok'; }
    else if(failed){t='Could not load portal data — refresh';c='bad';}
    else {t='Saved in this browser only';c='local';}
    el.innerHTML='<span class="dot '+c+'"></span><span>'+t+'</span>';
  }
  function banner(){
    if(document.getElementById('syncBanner'))return;
    var b=document.createElement('div'); b.id='syncBanner'; b.className='syncbanner';
    b.innerHTML='<span>Portal data was updated on another device.</span><button type="button" class="btn primary">Refresh</button>';
    b.querySelector('button').onclick=function(){ location.reload(); };
    document.body.appendChild(b);
  }

  /* ---------- db helpers ---------- */
  function sleep(ms){ return new Promise(function(r){setTimeout(r,ms)}); }
  async function retry(fn){ try{ return await fn(); }catch(e){ if(e&&e.code==='unavailable'){ await sleep(400+Math.random()*800); return fn(); } throw e; } }
  async function readKey(key,meta){
    var parts=[];
    for(var i=0;i<meta.n;i++){ var s=await retry(function(){return db.doc('kvc/'+key+'~'+i).get();}); if(!s.exists)throw new Error('missing chunk '+key+'~'+i); parts.push(s.data().s||''); }
    return parts.join('');
  }
  async function push(key){
    if(writing[key]){ again[key]=true; return; }
    writing[key]=true; pending++; pill();
    try{
      var val=rawGet.call(LS,key);
      if(val==null){ var m=known[key]; await retry(function(){return db.doc('kv/'+key).delete();}); if(m) for(var j=0;j<m.n;j++) await db.doc('kvc/'+key+'~'+j).delete(); delete known[key]; }
      else{
        var n=Math.max(1,Math.ceil(val.length/CHUNK)), old=known[key]?known[key].n:0;
        for(var i=0;i<n;i++){ var piece=val.slice(i*CHUNK,(i+1)*CHUNK); await retry(function(){return db.doc('kvc/'+key+'~'+i).set({s:piece});}); }
        var rev=Date.now()+'-'+Math.random().toString(36).slice(2,8); mine[rev]=1;
        await retry(function(){return db.doc('kv/'+key).set({n:n,rev:rev,len:val.length,at:new Date().toISOString()});});
        known[key]={n:n,rev:rev};
        for(var k=n;k<old;k++) await db.doc('kvc/'+key+'~'+k).delete();
      }
      failed=false;
    }catch(e){ failed=true; console.error('BDP sync',key,e); if(e&&e.code==='quota_exceeded') failed=true; }
    writing[key]=false; pending--; pill();
    if(again[key]){ again[key]=false; push(key); }
  }
  function schedule(key){ clearTimeout(timers[key]); timers[key]=setTimeout(function(){push(key)},700); }

  /* ---------- storage patch ---------- */
  P.setItem=function(k,v){ rawSet.call(this,k,v); if(this===LS&&mode==='db'&&SYNC.indexOf(k)>=0)schedule(k); };
  P.removeItem=function(k){ rawRemove.call(this,k); if(this===LS&&mode==='db'&&SYNC.indexOf(k)>=0)schedule(k); };

  /* ---------- hydrate ---------- */
  async function hydrate(){
    var snap=await retry(function(){return db.collection('kv').limit(100).get();});
    // the artifact's database is the record: clear local copies first so stale browser data never wins
    SYNC.forEach(function(k){ rawRemove.call(LS,k); });
    for(var i=0;i<snap.docs.length;i++){ var d=snap.docs[i], m=d.data(); if(SYNC.indexOf(d.id)<0)continue; var v=await readKey(d.id,m); rawSet.call(LS,d.id,v); known[d.id]={n:m.n,rev:m.rev}; }
    db.collection('kv').onSnapshot(function(s){
      s.docChanges().forEach(function(ch){ var id=ch.doc.id, m=ch.doc.data()||{}; if(SYNC.indexOf(id)<0)return;
        if(ch.type==='removed'){ if(known[id])banner(); return; }
        if(mine[m.rev]||(known[id]&&known[id].rev===m.rev))return; banner(); });
    },function(){});
  }

  /* ---------- boot: run the portal's scripts in their original order ---------- */
  function runInline(){ document.querySelectorAll('script[type="text/x-bdp"]').forEach(function(s){ var n=document.createElement('script'); n.textContent=s.textContent; s.parentNode.insertBefore(n,s); s.remove(); }); }
  function load(src){ return new Promise(function(res){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=function(){ console.warn('failed to load',src); res(); }; document.body.appendChild(s); }); }
  async function boot(){
    runInline();
    await load('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    load('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    await load('portal.js'); await load('leads.js');
    await load('https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'); await load('bdmap.js'); await load('classify.js'); await load('insights.js');
    patchDownloads();
    pill();
  }

  /* ---------- file saving that works inside the artifact ---------- */
  var dl=null;
  window.BDP_SAVE=async function(name,data,mime){
    if(dl){ try{ await dl.save({filename:name,data:data}); return true; }catch(e){ return false; } }
    var blob=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},1000); return true;
  };
  function patchDownloads(){
    if(!dl||!window.XLSX)return;
    XLSX.writeFile=function(wb,name){ var out=XLSX.write(wb,{type:'array',bookType:'xlsx'}); window.BDP_SAVE(name,new Uint8Array(out)); };
    var open=window.open; window.open=function(){ var w=open.apply(window,arguments); if(w)return w;
      // popups are blocked in the artifact: hand back a stand-in document whose HTML is saved as a file instead
      var buf=''; return {document:{open:function(){},write:function(h){buf+=h;},close:function(){ var m=buf.match(/<title>([^<]*)<\/title>/); window.BDP_SAVE(((m?m[1]:'BD Portal')+'').replace(/[^\w .-]+/g,' ').trim()+'.html',new TextEncoder().encode(buf.replace(/<script>window\.addEventListener\("load".*?<\/script>/,''))); }}}; };
  }

  /* ---------- backup export / import (moves data from the GitHub site into the artifact) ---------- */
  function tools(){
    var foot=document.querySelector('.side-foot'); if(!foot||document.getElementById('bkTools'))return;
    var w=document.createElement('div'); w.id='bkTools'; w.className='bktools';
    w.innerHTML='<button type="button" id="bkExport">Export data</button><label>Import data<input type="file" id="bkImport" accept=".json" hidden></label>';
    foot.appendChild(w);
    document.getElementById('bkExport').onclick=function(){ var o={portal:'bd-progress-portal',exportedAt:new Date().toISOString(),data:{}}; SYNC.forEach(function(k){ var v=rawGet.call(LS,k); if(v!=null)o.data[k]=v; }); window.BDP_SAVE('bd-portal-backup-'+new Date().toISOString().slice(0,10)+'.json',new TextEncoder().encode(JSON.stringify(o)),'application/json'); };
    document.getElementById('bkImport').onchange=function(e){ var f=e.target.files[0]; if(!f)return; var r=new FileReader(); r.onload=async function(){
      var o; try{ o=JSON.parse(r.result); }catch(x){ return; } if(!o||!o.data)return;
      var keys=Object.keys(o.data).filter(function(k){return SYNC.indexOf(k)>=0});
      keys.forEach(function(k){ rawSet.call(LS,k,o.data[k]); });
      if(mode==='db'){ for(var i=0;i<keys.length;i++) await push(keys[i]); }
      location.reload(); }; r.readAsText(f); };
  }

  /* ---------- GitHub Pages copy: load the daily snapshot of the artifact's data (data/portal.json) ---------- */
  async function loadSnapshot(){
    try{
      var r=await fetch('data/portal.json',{cache:'no-store'}); if(!r.ok) return;
      var d=await r.json(); if(!d||!d.kv) return;
      SYNC.forEach(function(k){ rawRemove.call(LS,k); });
      Object.keys(d.kv).forEach(function(k){ if(SYNC.indexOf(k)>=0) rawSet.call(LS,k,d.kv[k]); });
      var m=d.map||{};
      rawSet.call(LS,'pwLinkedIn',JSON.stringify(m.linkedin||{}));
      rawSet.call(LS,'pwOutreach',JSON.stringify(m.outreach||{}));
      rawSet.call(LS,'pwAddedPeople',JSON.stringify(m.addedPeople||{}));
      rawRemove.call(LS,'pwPersonal');
      mode='snapshot'; snapAt=d.exportedAt||'';
    }catch(e){ console.warn('BDP snapshot',e); }
  }

  /* ---------- start ---------- */
  async function start(){
    var c=window.claude;
    if(c&&typeof c.use==='function'){
      mode='loading'; pill();
      try{ var res=await Promise.all([c.use('db'),c.use('downloads')]); db=res[0]; dl=res[1]; }catch(e){ db=null; }
      if(db){ try{ await hydrate(); mode='db'; }catch(e){ console.error('BDP hydrate',e); mode='local'; db=null; failed=true; } }
      else mode='local';
    }
    else await loadSnapshot();
    await boot(); tools(); pill();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
