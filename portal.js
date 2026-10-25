/* BD Progress Portal — imports, receipts, expenses, contacts.
   Everything here runs in the browser and saves to localStorage until the shared database is connected. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  function money(n){ n=+n||0; return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function moneyK(n){ if(n>=1e6)return '$'+(n/1e6).toFixed(n>=1e7?0:1)+'M'; if(n>=1e3)return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function load(k,def){ try{var v=JSON.parse(localStorage.getItem(k)); return v==null?def:v;}catch(e){return def} }
  function save(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){ alert('Could not save — browser storage is full or blocked. Receipts are the usual cause; try a smaller photo.'); } }
  function toggle(btn,card,open){ card.hidden=!open; btn.setAttribute('aria-expanded',open?'true':'false'); }

  /* ======================= FILE READING ======================= */
  function readSheet(file,cb){
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    var r=new FileReader();
    if(ext==='csv'||ext==='txt'){ r.onload=function(){ var wb=XLSX.read(r.result,{type:'string'}); cb(sheetRows(wb)); }; r.readAsText(file); }
    else { r.onload=function(){ var wb=XLSX.read(new Uint8Array(r.result),{type:'array'}); cb(sheetRows(wb)); }; r.readAsArrayBuffer(file); }
  }
  function sheetRows(wb){
    var ws=wb.Sheets[wb.SheetNames[0]]; var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    aoa=aoa.filter(function(r){return r.some(function(c){return String(c).trim()!==''})});
    if(!aoa.length)return {headers:[],rows:[]};
    // header row = first row with >=2 non-empty cells
    var hi=0; for(var i=0;i<aoa.length;i++){ if(aoa[i].filter(function(c){return String(c).trim()!==''}).length>=2){hi=i;break;} }
    var headers=aoa[hi].map(function(c){return String(c).trim()});
    var rows=aoa.slice(hi+1).map(function(r){ var o={}; headers.forEach(function(hd,k){ o[hd]=String(r[k]==null?'':r[k]).trim(); }); return o; });
    return {headers:headers,rows:rows};
  }
  // guess which header matches a field
  function guess(headers,aliases){
    var norm=function(s){return String(s).toLowerCase().replace(/[^a-z0-9]/g,'')};
    for(var a=0;a<aliases.length;a++){ var al=norm(aliases[a]); for(var i=0;i<headers.length;i++){ var hn=norm(headers[i]); if(hn===al)return headers[i]; } }
    for(var a2=0;a2<aliases.length;a2++){ var al2=norm(aliases[a2]); for(var i2=0;i2<headers.length;i2++){ var hn2=norm(headers[i2]); if(hn2.indexOf(al2)>=0||al2.indexOf(hn2)>=0&&hn2.length>2)return headers[i2]; } }
    return '';
  }
  function mappingUI(container,headers,fields,rows,onImport,label){
    var html='<div class="sub13"><strong>'+rows.length+' row'+(rows.length===1?'':'s')+' found.</strong> Check which column fills each field, then import.</div><div class="maprow">';
    fields.forEach(function(f){ var g=guess(headers,f.aliases); html+='<span>'+esc(f.label)+(f.required?' <span style="color:var(--accent)">*</span>':'')+'</span><select data-field="'+f.key+'"><option value="">— not in file —</option>'+headers.map(function(hd){return '<option'+(hd===g?' selected':'')+'>'+esc(hd)+'</option>'}).join('')+'</select>'; });
    html+='</div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" type="button" data-do="import">'+esc(label)+'</button><button class="btn" type="button" data-do="cancel">Cancel</button></div>';
    container.innerHTML=html; container.hidden=false;
    container.onclick=function(e){ var b=e.target.closest('button[data-do]'); if(!b)return;
      if(b.dataset.do==='cancel'){ container.hidden=true; container.innerHTML=''; return; }
      var map={}; container.querySelectorAll('select[data-field]').forEach(function(s){ map[s.dataset.field]=s.value; });
      var out=rows.map(function(r){ var o={}; fields.forEach(function(f){ o[f.key]=map[f.key]?r[map[f.key]]:''; }); return o; }).filter(function(o){ return fields.some(function(f){return f.required&&String(o[f.key]).trim()!==''}); });
      container.hidden=true; container.innerHTML=''; onImport(out);
    };
  }
  function num(s){ var n=parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; }

  /* ======================= PIPELINE IMPORT ======================= */
  var OPP_FIELDS=[
    {key:'project',label:'Project',required:true,aliases:['project','job','opportunity','name','project name','site']},
    {key:'gc',label:'General contractor',aliases:['gc','general contractor','contractor','client','company','customer','account']},
    {key:'metro',label:'Metro',aliases:['metro','city','market','location','region','area']},
    {key:'trade',label:'Trade',aliases:['trade','scope','service','work type','package']},
    {key:'heads',label:'Heads',aliases:['heads','headcount','workers','crew','crew size','manpower','people']},
    {key:'weeks',label:'Weeks',aliases:['weeks','duration','length','weeks on site']},
    {key:'value',label:'Value ($)',aliases:['value','amount','revenue','contract value','estimated value','size','opportunity size','total']},
    {key:'next',label:'Next step',aliases:['next step','next action','next','notes','status note','follow up']}
  ];
  var of=$('oppImportFile'); if(of) of.addEventListener('change',function(){
    var f=of.files[0]; if(!f)return; var pv=$('oppImportPreview'); pv.hidden=false; pv.innerHTML='<span class="sub13">Reading '+esc(f.name)+'…</span>';
    try{ readSheet(f,function(data){
      if(!data.rows.length){ pv.innerHTML='<span class="sub13">No rows found in that file.</span>'; return; }
      mappingUI(pv,data.headers,OPP_FIELDS,data.rows,function(list){
        if(list.length===1){ var o=list[0]; $('fProject').value=o.project; $('fGc').value=o.gc; $('fMetro').value=o.metro; if(o.trade){var sel=$('fTrade'); var opt=[].slice.call(sel.options).find(function(x){return x.text.toLowerCase().indexOf(String(o.trade).toLowerCase().slice(0,5))>=0}); if(opt)sel.value=opt.text;} $('fHeads').value=num(o.heads)||''; $('fWeeks').value=num(o.weeks)||''; $('fValue').value=num(o.value)||''; $('fNext').value=o.next; $('fProject').focus(); return; }
        if(!window.OPPS)return; list.forEach(function(o){ window.OPPS.push({project:o.project,gc:o.gc,metro:o.metro,trade:o.trade||'Other',heads:num(o.heads),weeks:num(o.weeks),value:num(o.value),next:o.next,stage:'New',opened:today()}); });
        try{localStorage.setItem('bdp-opps',JSON.stringify(window.OPPS))}catch(e){}
        location.reload();
      },'Import');
    }); }catch(e){ pv.innerHTML='<span class="sub13">Could not read that file: '+esc(e.message)+'</span>'; }
    of.value='';
  });

  /* ======================= CONTACTS ======================= */
  var CON=load('bdp-contacts',[]);
  var CON_FIELDS=[
    {key:'name',label:'Name',required:true,aliases:['name','full name','contact','contact name','person']},
    {key:'first',label:'First name (if split)',aliases:['first name','first','given name']},
    {key:'last',label:'Last name (if split)',aliases:['last name','last','surname','family name']},
    {key:'title',label:'Title',aliases:['title','job title','position','role']},
    {key:'company',label:'Company',required:true,aliases:['company','organization','organisation','employer','firm','account']},
    {key:'metro',label:'Metro',aliases:['metro','city','location','market','region','address']},
    {key:'email',label:'Email',aliases:['email','e-mail','email address','e-mail address']},
    {key:'phone',label:'Phone',aliases:['phone','mobile','cell','telephone','phone number','mobile phone','business phone']},
    {key:'linkedin',label:'LinkedIn URL',aliases:['linkedin','linkedin url','profile','url','website']},
    {key:'touch',label:'Last touch (date)',aliases:['last touch','last contact','connected on','date','last contacted']},
    {key:'notes',label:'Notes',aliases:['notes','comments','note','remarks']}
  ];
  function parseVcf(text){
    var cards=text.split(/BEGIN:VCARD/i).slice(1), rows=[];
    cards.forEach(function(c){ var o={name:'',title:'',company:'',metro:'',email:'',phone:'',linkedin:'',touch:'',notes:''};
      c.replace(/\r/g,'').split('\n').forEach(function(l){ var m=l.match(/^([A-Z\-]+)(;[^:]*)?:(.*)$/i); if(!m)return; var k=m[1].toUpperCase(), v=m[3].replace(/\\,/g,',').replace(/\\n/g,' ');
        if(k==='FN')o.name=v; else if(k==='N'&&!o.name){var p=v.split(';');o.name=(p[1]+' '+p[0]).trim();} else if(k==='ORG')o.company=v.split(';')[0]; else if(k==='TITLE')o.title=v; else if(k==='EMAIL'&&!o.email)o.email=v; else if(k==='TEL'&&!o.phone)o.phone=v; else if(k==='URL'&&/linkedin/i.test(v))o.linkedin=v; else if(k==='ADR'&&!o.metro){var a=v.split(';');o.metro=(a[3]||'').trim();} else if(k==='NOTE')o.notes=v; });
      if(o.name)rows.push(o); });
    return rows;
  }
  function saveCon(){ save('bdp-contacts',CON); }
  function renderCon(){
    var q=($('searchContacts')&&$('searchContacts').value||'').toLowerCase().trim();
    var list=CON.map(function(c,i){c._i=i;return c}).filter(function(c){ return !q||[c.name,c.title,c.company,c.metro,c.email,c.notes].join(' ').toLowerCase().indexOf(q)>=0; }).sort(function(a,b){return (a.company||'').localeCompare(b.company||'')||(a.name||'').localeCompare(b.name||'')});
    var tb=$('conRows'); if(!tb)return;
    if(!CON.length) tb.innerHTML='<tr><td colspan="9"><div class="empty" style="margin:16px 0">No contacts yet. Add one, or import a spreadsheet or vCard.</div></td></tr>';
    else if(!list.length) tb.innerHTML='<tr><td colspan="9"><div class="empty" style="margin:16px 0">No contacts match "'+esc(q)+'".</div></td></tr>';
    else tb.innerHTML=list.map(function(c){ return '<tr><td><strong>'+esc(c.name)+'</strong>'+(c.notes?'<br><span class="sub13">'+esc(c.notes)+'</span>':'')+'</td><td>'+esc(c.title)+'</td><td>'+esc(c.company)+'</td><td>'+esc(c.metro)+'</td><td>'+(c.email?'<a href="mailto:'+esc(c.email)+'" style="color:var(--accent)">'+esc(c.email)+'</a>':'')+'</td><td class="mono">'+esc(c.phone)+'</td><td>'+(c.linkedin?'<a href="'+esc(c.linkedin)+'" target="_blank" rel="noopener"><span class="tag ok">Profile ↗</span></a>':'<span class="tag">None</span>')+'</td><td class="mono">'+esc(c.touch)+'</td><td><button class="sbtn quiet" data-delc="'+c._i+'" aria-label="Remove contact">✕</button></td></tr>'; }).join('');
    var set=function(id,t){var e=$(id);if(e)e.textContent=t};
    var cos={}; CON.forEach(function(c){cos[(c.company||'').toLowerCase()]=1});
    set('conEyebrow',CON.length+' contact'+(CON.length===1?'':'s')+' · '+Object.keys(cos).filter(Boolean).length+' companies');
    set('conFoot',CON.length?(list.length+' shown · '+CON.filter(function(c){return c.linkedin}).length+' with LinkedIn · saved in this browser'):'Saved in this browser until the shared database is connected.');
  }
  var addConBtn=$('addConBtn'), addConCard=$('addConCard'), conForm=$('conForm'), conImportBtn=$('conImportBtn'), conImportCard=$('conImportCard');
  if(addConBtn){ addConBtn.addEventListener('click',function(){ toggle(addConBtn,addConCard,addConCard.hidden); if(!addConCard.hidden){ toggle(conImportBtn,conImportCard,false); $('cName').focus(); } });
    $('cancelCon').addEventListener('click',function(){conForm.reset();toggle(addConBtn,addConCard,false)});
    conImportBtn.addEventListener('click',function(){ toggle(conImportBtn,conImportCard,conImportCard.hidden); if(!conImportCard.hidden)toggle(addConBtn,addConCard,false); });
    conForm.addEventListener('submit',function(e){ e.preventDefault(); CON.push({name:$('cName').value.trim(),title:$('cTitle').value.trim(),company:$('cCompany').value.trim(),metro:$('cMetro').value.trim(),email:$('cEmail').value.trim(),phone:$('cPhone').value.trim(),linkedin:$('cLinkedin').value.trim(),touch:$('cTouch').value,notes:$('cNotes').value.trim(),added:today()}); saveCon(); conForm.reset(); toggle(addConBtn,addConCard,false); renderCon(); });
    $('conRows').addEventListener('click',function(e){ var b=e.target.closest('button[data-delc]'); if(!b)return; if(!b.dataset.confirm){b.dataset.confirm='1';b.textContent='Remove?';b.style.color='var(--accent)';return;} CON.splice(+b.dataset.delc,1); saveCon(); renderCon(); });
    $('searchContacts').addEventListener('input',renderCon);
    var cf=$('conImportFile'); cf.addEventListener('change',function(){
      var f=cf.files[0]; if(!f)return; var pv=$('conImportPreview'); pv.hidden=false; pv.innerHTML='<span class="sub13">Reading '+esc(f.name)+'…</span>';
      var ext=(f.name.split('.').pop()||'').toLowerCase();
      var finish=function(list){ var n=0; list.forEach(function(o){ var name=(o.name||((o.first||'')+' '+(o.last||''))).trim(); if(!name)return; if(CON.some(function(c){return c.name.toLowerCase()===name.toLowerCase()&&(c.company||'').toLowerCase()===(o.company||'').toLowerCase()}))return; CON.push({name:name,title:o.title||'',company:o.company||'',metro:o.metro||'',email:o.email||'',phone:o.phone||'',linkedin:o.linkedin||'',touch:o.touch||'',notes:o.notes||'',added:today()}); n++; }); saveCon(); renderCon(); toggle(conImportBtn,conImportCard,false); $('conFoot').textContent='Imported '+n+' new contact'+(n===1?'':'s')+' ('+(list.length-n)+' skipped as duplicates or blank).'; };
      if(ext==='vcf'){ var r=new FileReader(); r.onload=function(){ var rows=parseVcf(r.result); pv.innerHTML='<div class="sub13"><strong>'+rows.length+' contacts found in the vCard.</strong></div><div style="display:flex;gap:10px"><button class="btn primary" type="button" id="vcfGo">Import '+rows.length+'</button><button class="btn" type="button" id="vcfNo">Cancel</button></div>'; $('vcfGo').onclick=function(){pv.hidden=true;finish(rows)}; $('vcfNo').onclick=function(){pv.hidden=true;pv.innerHTML=''}; }; r.readAsText(f); }
      else { try{ readSheet(f,function(data){ if(!data.rows.length){pv.innerHTML='<span class="sub13">No rows found in that file.</span>';return;} mappingUI(pv,data.headers,CON_FIELDS,data.rows,finish,'Import contacts'); }); }catch(e){ pv.innerHTML='<span class="sub13">Could not read that file: '+esc(e.message)+'</span>'; } }
      cf.value='';
    });
    renderCon();
  }

  /* ======================= EXPENSES ======================= */
  var CATS={
    'TRANSPORTATION':['Miles Driven','Miles Reimbursement','Parking And Tolls','Auto Rental','Taxi / Limo','Fuel','Airfare'],
    'LODGING & MEALS':['Lodging','Breakfast','Lunch','Dinner','Snack'],
    'MISCELLANEOUS':['Supplies','Equipment','Phone, Fax, Internet','Other*','Entertainment*']
  };
  var EXP=load('bdp-expenses',[]), EXPMETA=load('bdp-expmeta',{rate:0.70,weeks:{}});
  var DAYS=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
  function weekEndingOf(dstr){ var d=new Date(dstr+'T12:00:00'); var dow=(d.getDay()+6)%7; d.setDate(d.getDate()+(6-dow)); return d.toISOString().slice(0,10); }
  var curWeek=weekEndingOf(today());
  function addDays(s,n){ var d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function fmtD(s,o){ return new Date(s+'T12:00:00').toLocaleDateString('en-US',o||{month:'short',day:'numeric'}); }
  function amountOf(e){ return e.cat==='Miles Driven'?(+e.miles||0)*(+EXPMETA.rate||0):(+e.amount||0); }
  function saveExp(){ save('bdp-expenses',EXP); save('bdp-expmeta',EXPMETA); }

  function renderExp(){
    var set=function(id,t){var e=$(id);if(e)e.textContent=t};
    if(!$('expGrid'))return;
    var days=[]; for(var i=6;i>=0;i--)days.push(addDays(curWeek,-i));
    var wk=EXP.filter(function(e){return e.date>=days[0]&&e.date<=days[6]});
    var cell={}; CATS.TRANSPORTATION.concat(CATS['LODGING & MEALS'],CATS.MISCELLANEOUS).forEach(function(c){cell[c]=[0,0,0,0,0,0,0]});
    wk.forEach(function(e){ var di=days.indexOf(e.date); if(di<0)return; if(e.cat==='Miles Driven'){ cell['Miles Driven'][di]+=(+e.miles||0); cell['Miles Reimbursement'][di]+=amountOf(e); } else if(cell[e.cat]) cell[e.cat][di]+=(+e.amount||0); });
    set('expWeekEnding',fmtD(curWeek,{month:'short',day:'numeric',year:'numeric'}));
    set('expEyebrow','Week of '+fmtD(days[0])+' – '+fmtD(curWeek,{month:'short',day:'numeric',year:'numeric'}));
    var html='<thead><tr><th>Category</th>'+DAYS.map(function(d,i){return '<th style="text-align:right">'+d.slice(0,3)+'<br><span class="mono" style="font-weight:400">'+fmtD(days[i],{month:'numeric',day:'numeric'})+'</span></th>'}).join('')+'<th style="text-align:right">Total</th></tr></thead><tbody>';
    var secTot={}, grand=[0,0,0,0,0,0,0];
    Object.keys(CATS).forEach(function(sec){
      html+='<tr class="sec"><td colspan="9">'+esc(sec)+'</td></tr>'; var st=[0,0,0,0,0,0,0];
      CATS[sec].forEach(function(c){ var row=cell[c], isMiles=c==='Miles Driven', t=row.reduce(function(a,b){return a+b},0);
        html+='<tr><td>'+esc(c)+'</td>'+row.map(function(v,di){ return '<td class="n'+(v?'':' zero')+(isMiles?'':' hit')+'" data-cat="'+esc(c)+'" data-date="'+days[di]+'">'+(isMiles?(v?v.toFixed(1)+' mi':'—'):(v?money(v):'—'))+'</td>'; }).join('')+'<td class="n">'+(isMiles?t.toFixed(1)+' mi':money(t))+'</td></tr>';
        if(!isMiles) row.forEach(function(v,di){st[di]+=v}); });
      secTot[sec]=st; var stt=st.reduce(function(a,b){return a+b},0);
      html+='<tr class="tot"><td>TOTAL</td>'+st.map(function(v){return '<td class="n">'+money(v)+'</td>'}).join('')+'<td class="n">'+money(stt)+'</td></tr>';
      st.forEach(function(v,di){grand[di]+=v});
    });
    var g=grand.reduce(function(a,b){return a+b},0);
    html+='<tr class="grand"><td>GRAND TOTALS</td>'+grand.map(function(v){return '<td class="n">'+money(v)+'</td>'}).join('')+'<td class="n">'+money(g)+'</td></tr></tbody>';
    $('expGrid').innerHTML=html;
    var wmeta=EXPMETA.weeks[curWeek]||{adv:0,comments:''}; $('expAdv').value=wmeta.adv||0; $('expComments').value=wmeta.comments||''; $('expRate').value=EXPMETA.rate;
    set('expGrand',money(g)); set('expReimb',money(g-(+wmeta.adv||0)));
    var sum=function(sec){return secTot[sec].reduce(function(a,b){return a+b},0)};
    set('kExpTotal',wk.length?money(g):'—'); set('kExpSub',wk.length+' expense'+(wk.length===1?'':'s')+' · '+wk.filter(function(e){return e.receipt}).length+' with receipts');
    set('kExpT',money(sum('TRANSPORTATION'))); set('kExpL',money(sum('LODGING & MEALS'))); set('kExpM',money(sum('MISCELLANEOUS')));
    var rows=wk.map(function(e){e._i=EXP.indexOf(e);return e}).sort(function(a,b){return a.date.localeCompare(b.date)});
    $('expRows').innerHTML=rows.length?rows.map(function(e){ return '<tr><td class="mono">'+fmtD(e.date)+'</td><td>'+esc(e.cat)+(e.cat==='Miles Driven'?' <span class="sub13">('+(+e.miles||0)+' mi)</span>':'')+'</td><td>'+esc(e.vendor)+'</td><td>'+esc(e.purpose)+(e.notes?'<br><span class="sub13">'+esc(e.notes)+'</span>':'')+'</td><td class="mono" style="text-align:right">'+money(amountOf(e))+'</td><td>'+(e.receipt?'<img class="thumb" src="'+e.receipt+'" alt="Receipt" data-zoom="'+e._i+'">':'<span class="tag">Missing</span>')+'</td><td><button class="sbtn quiet" data-dele="'+e._i+'" aria-label="Remove expense">✕</button></td></tr>'; }).join('')
      :'<tr><td colspan="7"><div class="empty" style="margin:16px 0">No expenses this week. Click "Add expense" and upload the receipt.</div></td></tr>';
    set('expCount',rows.length+' item'+(rows.length===1?'':'s'));
    // Overview card: current month
    var m=today().slice(0,7), mon=EXP.filter(function(e){return e.date.slice(0,7)===m}), mt=0, byc={};
    mon.forEach(function(e){var a=amountOf(e);mt+=a;byc[e.cat]=(byc[e.cat]||0)+a});
    set('ovExpMonth',new Date().toLocaleDateString('en-US',{month:'long'})); set('ovExpTotal',mon.length?money(mt):'—');
    var top=Object.keys(byc).sort(function(a,b){return byc[b]-byc[a]}).slice(0,4);
    if($('ovExpRows'))$('ovExpRows').innerHTML=top.map(function(c){return '<div class="kv"><span>'+esc(c.replace('*',''))+'</span><span class="v">'+money(byc[c])+'</span></div>'}).join('');
    set('ovExpFoot',mon.length?(mon.length+' expenses · '+mon.filter(function(e){return e.receipt}).length+' receipts attached'):'No expenses logged yet');
  }

  var addExpBtn=$('addExpBtn'), addExpCard=$('addExpCard'), expForm=$('expForm');
  if(addExpBtn){
    addExpBtn.addEventListener('click',function(){ toggle(addExpBtn,addExpCard,addExpCard.hidden); if(!addExpCard.hidden){ if(!$('eDate').value)$('eDate').value=today(); $('eDate').focus(); } });
    $('cancelExp').addEventListener('click',function(){ resetExpForm(); toggle(addExpBtn,addExpCard,false); });
    $('eCat').addEventListener('change',function(){ var mi=$('eCat').value==='Miles Driven'; $('eMilesLabel').hidden=!mi; $('eAmountLabel').hidden=mi; });
    $('expPrev').addEventListener('click',function(){curWeek=addDays(curWeek,-7);renderExp()});
    $('expNext').addEventListener('click',function(){curWeek=addDays(curWeek,7);renderExp()});
    $('expRate').addEventListener('change',function(){EXPMETA.rate=+$('expRate').value||0;saveExp();renderExp()});
    $('expAdv').addEventListener('change',function(){EXPMETA.weeks[curWeek]=EXPMETA.weeks[curWeek]||{};EXPMETA.weeks[curWeek].adv=+$('expAdv').value||0;saveExp();renderExp()});
    $('expComments').addEventListener('change',function(){EXPMETA.weeks[curWeek]=EXPMETA.weeks[curWeek]||{};EXPMETA.weeks[curWeek].comments=$('expComments').value;saveExp()});
    $('expRows').addEventListener('click',function(e){ var b=e.target.closest('button[data-dele]'); if(b){ if(!b.dataset.confirm){b.dataset.confirm='1';b.textContent='Remove?';b.style.color='var(--accent)';return;} EXP.splice(+b.dataset.dele,1); saveExp(); renderExp(); return; }
      var im=e.target.closest('img[data-zoom]'); if(im){ var w=window.open(); if(w){ w.document.write('<img src="'+im.src+'" style="max-width:100%">'); } } });
    $('expGrid').addEventListener('click',function(e){ var td=e.target.closest('td.hit'); if(!td)return; toggle(addExpBtn,addExpCard,true); $('eDate').value=td.dataset.date; $('eCat').value=td.dataset.cat; $('eCat').dispatchEvent(new Event('change')); $('eVendor').focus(); });
    var pendingReceipt=null;
    function resetExpForm(){ expForm.reset(); pendingReceipt=null; $('receiptPreviewWrap').hidden=true; $('receiptStatus').hidden=true; $('eMilesLabel').hidden=true; $('eAmountLabel').hidden=false; }
    expForm.addEventListener('submit',function(e){ e.preventDefault();
      EXP.push({date:$('eDate').value,cat:$('eCat').value,vendor:$('eVendor').value.trim(),amount:+$('eAmount').value||0,miles:+$('eMiles').value||0,purpose:$('ePurpose').value.trim(),notes:$('eNotes').value.trim(),receipt:pendingReceipt,added:today()});
      saveExp(); curWeek=weekEndingOf($('eDate').value); resetExpForm(); toggle(addExpBtn,addExpCard,false); renderExp(); });

    // ---- receipt OCR
    var rf=$('receiptFile'); rf.addEventListener('change',function(){
      var f=rf.files[0]; if(!f)return; var st=$('receiptStatus'); st.hidden=false; st.innerHTML='Preparing image…';
      shrink(f,1600,0.85,function(big){ shrink(f,520,0.6,function(small){ pendingReceipt=small; $('receiptPreview').src=small; $('receiptPreviewWrap').hidden=false;
        if(!window.Tesseract){ st.textContent='Receipt attached. Text reading is unavailable offline — fill the fields in by hand.'; return; }
        st.innerHTML='Reading receipt… <div class="ocrbar"><div id="ocrP" style="width:0%"></div></div>';
        Tesseract.recognize(big,'eng',{logger:function(m){ if(m.status==='recognizing text'&&$('ocrP'))$('ocrP').style.width=Math.round(m.progress*100)+'%'; }}).then(function(res){
          var text=res.data.text||''; $('receiptText').textContent=text.trim()||'(no text found)';
          var p=parseReceipt(text); var filled=[];
          if(p.vendor&&!$('eVendor').value){$('eVendor').value=p.vendor;filled.push('vendor');}
          if(p.date){$('eDate').value=p.date;filled.push('date');}
          if(p.amount){$('eAmount').value=p.amount.toFixed(2);filled.push('amount');}
          if(p.cat){$('eCat').value=p.cat;$('eCat').dispatchEvent(new Event('change'));filled.push('category');}
          st.textContent=filled.length?('Pulled '+filled.join(', ')+' from the receipt — check them before you add it.'):'Receipt attached, but nothing recognizable was found — fill the fields in by hand.';
        }).catch(function(err){ st.textContent='Receipt attached. Could not read text ('+err.message+') — fill the fields in by hand.'; });
      }); });
      rf.value='';
    });
  }
  function shrink(file,max,q,cb){ var img=new Image(); var url=URL.createObjectURL(file); img.onload=function(){ var s=Math.min(1,max/Math.max(img.width,img.height)); var c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg',q)); }; img.onerror=function(){ cb(null); }; img.src=url; }
  function parseReceipt(text){
    var lines=text.split('\n').map(function(l){return l.trim()}).filter(Boolean), out={vendor:'',date:'',amount:0,cat:''};
    var moneyRe=/(?:\$|USD)?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g;
    function amts(l){ var a=[],m; moneyRe.lastIndex=0; while((m=moneyRe.exec(l))){ a.push(parseFloat(m[1].replace(/,/g,'')+'.'+m[2])); } return a; }
    var totalLines=lines.filter(function(l){return /\b(grand\s*total|total|amount\s*due|balance\s*due|amount)\b/i.test(l)&&!/sub\s*total|subtotal|tax|tip|savings|discount/i.test(l)});
    var cands=[]; totalLines.forEach(function(l){cands=cands.concat(amts(l))});
    if(!cands.length){ lines.forEach(function(l){ if(!/sub\s*total|tax|tip|change|cash|tender/i.test(l))cands=cands.concat(amts(l)); }); }
    if(cands.length) out.amount=Math.max.apply(null,cands);
    var dm=text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/); var iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); var mon=text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i)||text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/i);
    var pad=function(n){return String(n).padStart(2,'0')};
    if(iso) out.date=iso[0];
    else if(dm){ var y=dm[3].length===2?'20'+dm[3]:dm[3]; var mo=+dm[1], da=+dm[2]; if(mo>12){var t=mo;mo=da;da=t;} if(mo>=1&&mo<=12&&da>=1&&da<=31) out.date=y+'-'+pad(mo)+'-'+pad(da); }
    else if(mon){ var months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}; var mname=(isNaN(+mon[1])?mon[1]:mon[2]).slice(0,3).toLowerCase(), dday=isNaN(+mon[1])?mon[2]:mon[1]; out.date=mon[3]+'-'+pad(months[mname])+'-'+pad(dday); }
    for(var i=0;i<Math.min(lines.length,6);i++){ var l=lines[i]; if(/[A-Za-z]{3,}/.test(l)&&!/receipt|invoice|order|thank|welcome|tel|phone|www|http|\d{3}[-.)\s]\d{3}/i.test(l)&&l.replace(/[^A-Za-z]/g,'').length>=3){ out.vendor=l.replace(/[^A-Za-z0-9&'.,\- ]/g,'').trim().slice(0,40); break; } }
    var t=text.toLowerCase();
    var rules=[[/uber|lyft|taxi|cab\b|limo/,'Taxi / Limo'],[/delta|american airlines|united|southwest|jetblue|spirit|frontier|airline|airways|boarding/,'Airfare'],[/shell|chevron|exxon|mobil|wawa|racetrac|bp\b|sunoco|marathon|gallon|unleaded|fuel|gas station/,'Fuel'],[/parking|toll|sunpass|e-?zpass|garage/,'Parking And Tolls'],[/hertz|avis|enterprise|budget rent|national car|rental car|car rental/,'Auto Rental'],[/marriott|hilton|hyatt|holiday inn|hampton|courtyard|hotel|inn\b|suites|resort|lodging|check-?out/,'Lodging'],[/starbucks|dunkin|bagel|breakfast|cafe|coffee/,'Breakfast'],[/steak|grill|bar\b|restaurant|bistro|cantina|kitchen|tavern|brewing|dinner/,'Dinner'],[/lunch|chipotle|subway|panera|deli|pizza|taco|burger|chick-?fil|wendy|sandwich/,'Lunch'],[/office depot|staples|home depot|lowe|amazon|supplies/,'Supplies'],[/verizon|at&t|t-mobile|comcast|xfinity|internet|wireless/,'Phone, Fax, Internet'],[/golf|tickets|topgolf|stadium|arena|club/,'Entertainment*']];
    for(var r=0;r<rules.length;r++){ if(rules[r][0].test(t)){ out.cat=rules[r][1]; break; } }
    if(!out.cat&&/\b(1[1-2]|0?[1-9]):\d{2}\s*(am|pm)?/i.test(text)){ var hm=text.match(/\b(\d{1,2}):\d{2}\s*(am|pm)?/i); var hr=+hm[1]; if(/pm/i.test(hm[2]||'')&&hr<12)hr+=12; if(/dinner|restaurant/.test(t)||hr>=17)out.cat='Dinner'; else if(hr>=11)out.cat='Lunch'; else if(hr>=5)out.cat='Breakfast'; }
    return out;
  }

  // ---- export week as .xlsx in the form's layout
  var ex=$('expExport'); if(ex) ex.addEventListener('click',function(){
    if(!window.XLSX){ alert('Spreadsheet library did not load.'); return; }
    var days=[]; for(var i=6;i>=0;i--)days.push(addDays(curWeek,-i));
    var wk=EXP.filter(function(e){return e.date>=days[0]&&e.date<=days[6]});
    var cell={}; CATS.TRANSPORTATION.concat(CATS['LODGING & MEALS'],CATS.MISCELLANEOUS).forEach(function(c){cell[c]=[0,0,0,0,0,0,0]});
    wk.forEach(function(e){ var di=days.indexOf(e.date); if(di<0)return; if(e.cat==='Miles Driven'){cell['Miles Driven'][di]+=(+e.miles||0);cell['Miles Reimbursement'][di]+=amountOf(e);} else if(cell[e.cat])cell[e.cat][di]+=(+e.amount||0); });
    var aoa=[['IB Group Worldwide, Inc.'],['EXPENSE REPORT'],[],['','EMPLOYEE:','Samuel R. Carstens','','','','AUTHORIZED BY:'],['','DEPARTMENT:','Business Development'],['','WEEK ENDING:',curWeek,'','','','DATE:'],['','MILEAGE RATE:',EXPMETA.rate],[],['','',].concat(DAYS)];
    var grand=0, grandRow=[0,0,0,0,0,0,0];
    Object.keys(CATS).forEach(function(sec){ aoa.push(['',sec].concat(days).concat(['TOTAL'])); var st=[0,0,0,0,0,0,0];
      CATS[sec].forEach(function(c){ var row=cell[c]; var t=row.reduce(function(a,b){return a+b},0); aoa.push(['',c].concat(row).concat([t])); if(c!=='Miles Driven')row.forEach(function(v,di){st[di]+=v}); });
      var stt=st.reduce(function(a,b){return a+b},0); aoa.push(['','TOTAL'].concat(st).concat([stt])); aoa.push([]); st.forEach(function(v,di){grandRow[di]+=v}); grand+=stt; });
    var wm=EXPMETA.weeks[curWeek]||{adv:0,comments:''};
    aoa.push(['','GRAND TOTALS'].concat(grandRow).concat([grand])); aoa.push([]); aoa.push(['','','','','','','','','','TOTAL EXPENSES',grand]); aoa.push(['','Comments:',wm.comments||'','','','','','','','IB GROUP PREPAID ADVANCES',wm.adv||0]); aoa.push(['','','','','','','','','','TOTAL REIMBURSEMENT',grand-(wm.adv||0)]); aoa.push([]); aoa.push(['','Receipts attached:',wk.filter(function(e){return e.receipt}).length+' of '+wk.length]);
    aoa.push([]); aoa.push(['','DETAIL']); aoa.push(['','Date','Category','Vendor','Client / purpose','Amount','Notes']); wk.sort(function(a,b){return a.date.localeCompare(b.date)}).forEach(function(e){ aoa.push(['',e.date,e.cat,e.vendor,e.purpose,amountOf(e),e.notes]); });
    var wb=XLSX.utils.book_new(); var ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:2},{wch:24},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:26},{wch:12}]; XLSX.utils.book_append_sheet(wb,ws,'Expense Report'); XLSX.writeFile(wb,'Expense Report week ending '+curWeek+'.xlsx');
  });
  renderExp();
})();
