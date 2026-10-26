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
    {key:'heads',label:'Workers',aliases:['workers','heads','headcount','workers','crew','crew size','manpower','people']},
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
    $('expRows').innerHTML=rows.length?rows.map(function(e){ return '<tr><td class="mono">'+fmtD(e.date)+'</td><td>'+esc(e.cat)+(e.cat==='Miles Driven'?' <span class="sub13">('+(+e.miles||0)+' mi)</span>':'')+'</td><td>'+esc(e.vendor)+'</td><td>'+esc(e.purpose)+(e.notes?'<br><span class="sub13">'+esc(e.notes)+'</span>':'')+'</td><td class="mono" style="text-align:right">'+money(amountOf(e))+'</td><td>'+(e.receipt?'<img class="thumb" src="'+e.receipt+'" alt="Receipt" data-zoom="'+e._i+'">':'<span class="tag">Missing</span>')+'</td><td><div class="acts"><button class="sbtn go" data-edite="'+e._i+'">Edit</button><button class="sbtn quiet" data-dele="'+e._i+'" aria-label="Remove expense">✕</button></div></td></tr>'; }).join('')
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
    $('expRows').addEventListener('click',function(e){
      var ed=e.target.closest('button[data-edite]'); if(ed){ var x=EXP[+ed.dataset.edite]; if(!x)return; resetExpForm(); editIdx=+ed.dataset.edite; $('expFormTitle').textContent='Edit expense'; $('expSubmit').textContent='Save changes'; $('eDate').value=x.date; $('eCat').value=x.cat; $('eCat').dispatchEvent(new Event('change')); $('eVendor').value=x.vendor||''; $('eAmount').value=x.amount||''; $('eMiles').value=x.miles||''; $('ePurpose').value=x.purpose||''; $('eNotes').value=x.notes||''; pendingReceipt=x.receipt||null; if(x.receipt){ $('receiptPreview').src=x.receipt; $('receiptPreviewWrap').hidden=false; $('receiptText').textContent=''; } toggle(addExpBtn,addExpCard,true); addExpCard.scrollIntoView({behavior:'smooth'}); $('eVendor').focus(); return; }
      var b=e.target.closest('button[data-dele]'); if(b){ if(!b.dataset.confirm){b.dataset.confirm='1';b.textContent='Remove?';b.style.color='var(--accent)';return;} EXP.splice(+b.dataset.dele,1); saveExp(); renderExp(); return; }
      var im=e.target.closest('img[data-zoom]'); if(im){ var w=window.open(); if(w){ w.document.write('<img src="'+im.src+'" style="max-width:100%">'); } } });
    $('expGrid').addEventListener('click',function(e){ var td=e.target.closest('td.hit'); if(!td)return; toggle(addExpBtn,addExpCard,true); $('eDate').value=td.dataset.date; $('eCat').value=td.dataset.cat; $('eCat').dispatchEvent(new Event('change')); $('eVendor').focus(); });
    var pendingReceipt=null, editIdx=-1;
    function resetExpForm(){ expForm.reset(); pendingReceipt=null; editIdx=-1; $('expFormTitle').textContent='New expense'; $('expSubmit').textContent='Add to report'; $('receiptPreviewWrap').hidden=true; $('receiptStatus').hidden=true; $('eMilesLabel').hidden=true; $('eAmountLabel').hidden=false; }
    expForm.addEventListener('submit',function(e){ e.preventDefault();
      var rec={date:$('eDate').value,cat:$('eCat').value,vendor:$('eVendor').value.trim(),amount:+$('eAmount').value||0,miles:+$('eMiles').value||0,purpose:$('ePurpose').value.trim(),notes:$('eNotes').value.trim(),receipt:pendingReceipt,added:today()};
      if(editIdx>=0&&EXP[editIdx]){ rec.added=EXP[editIdx].added; rec.edited=today(); EXP[editIdx]=rec; } else EXP.push(rec);
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

/* ===================== ANNUAL GOALS, KPI TRACKER, WORK WEEK, MILEAGE ===================== */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  function load(k,def){ try{var v=JSON.parse(localStorage.getItem(k)); return v==null?def:v;}catch(e){return def} }
  function save(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){ alert('Could not save — browser storage is full. Large photos are the usual cause.'); } }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmtD(s,o){ return new Date(s+'T12:00:00').toLocaleDateString('en-US',o||{month:'short',day:'numeric',year:'numeric'}); }
  function set(id,t){var e=$(id);if(e)e.textContent=t}
  function uid(){ return Math.random().toString(36).slice(2,9); }

  /* ---------- First 90: collapsible phases, bar opens it ---------- */
  document.querySelectorAll('#panel-first90 .phase').forEach(function(ph){ ph.classList.add('collapsed'); var hd=ph.querySelector('.phase-head'); if(hd) hd.addEventListener('click',function(e){ if(e.target.closest('input,button,a'))return; ph.classList.toggle('collapsed'); }); });
  function open90(){ if(window.aopShowSub)window.aopShowSub('first90'); var p=$('panel-first90'); if(p)p.scrollIntoView({behavior:'smooth'}); }
  var o90=$('aopOpen90'); if(o90) o90.addEventListener('click',open90);
  var ptrack=document.querySelector('#aopProgress .ptrack'); if(ptrack){ ptrack.style.cursor='pointer'; ptrack.title='Open the 90-day checklist'; ptrack.addEventListener('click',open90); }
  // phase nav links (#phase1..3) should expand that phase
  document.querySelectorAll('#panel-first90 .phase-nav a').forEach(function(a){ a.addEventListener('click',function(){ var t=$(a.getAttribute('href').slice(1)); if(t)t.classList.remove('collapsed'); }); });

  /* ---------- Annual goals ---------- */
  var GROUPS={industry:'Industry-standard goals',company:'IB Group–specific goals',clients:'5 large clients to sign',winback:'Customers to win back'};
  var DEFAULT_GOALS=[
    {g:'industry',t:'Build and keep a qualified target list of GC and Division 9 subcontractor accounts across FL, TX, LA and GA',target:60,unit:'accounts',why:'The list is the territory. Nothing downstream happens without it.'},
    {g:'industry',t:'Secure new client accounts with signed labor agreements',target:6,unit:'accounts',why:'The core output of the role per §9.'},
    {g:'industry',t:'Place crews that generate billable labor hours',target:50000,unit:'hours',why:'Hours are what IB Group invoices and what commission is paid on.'},
    {g:'industry',t:'Hold qualified meetings and site visits with decision-makers',target:100,unit:'meetings',why:'Meetings are the leading indicator for accounts.'},
    {g:'industry',t:'Receive invitations to bid, RFPs or pricing requests',target:12,unit:'bids',why:'Proof the relationship has reached the buying stage.'},
    {g:'industry',t:'Grow accounts into recurring, repeat business',target:3,unit:'accounts',why:'§15: sustainable and recurring business, not one-off placements.'},
    {g:'industry',t:'Originate gross margin equal to 5× the fully loaded cost of the seat',target:5,unit:'× ROI',why:'The number the Salary ROI tab reports.'},
    {g:'industry',t:'Deliver the weekly pipeline report and monthly performance report with no misses',target:52,unit:'reports',why:'§8 and §10 — organizational discipline is evaluated directly.'},
    {g:'industry',t:'Join and actively work trade associations (AWCI, ABC and AGC chapters)',target:2,unit:'associations',why:'Standing venues for the GC and sub relationships §2B calls for.'},
    {g:'company',t:'Land INTAL, Elite Mainframe or Global Drywall crews on at least one large-scale project in each territory state',target:4,unit:'states',why:'Proves the model travels beyond South Florida.'},
    {g:'company',t:'Document the discovery-call → rate sheet → placement process so management can run it without me',target:1,unit:'playbook',why:'Turns a personal network into a company asset.'},
    {g:'company',t:'Build a bench of pre-qualified drywall, framing and ACT crews ready to deploy within two weeks of award',target:1,unit:'bench',why:'Winning the account is worthless if the crew is not ready.'},
    {g:'clients',t:'[Large client 1 — name it]',target:1,unit:'signed',why:''},
    {g:'clients',t:'[Large client 2 — name it]',target:1,unit:'signed',why:''},
    {g:'clients',t:'[Large client 3 — name it]',target:1,unit:'signed',why:''},
    {g:'clients',t:'[Large client 4 — name it]',target:1,unit:'signed',why:''},
    {g:'clients',t:'[Large client 5 — name it]',target:1,unit:'signed',why:''}
  ];
  var GS=load('bdp-goals',null);
  if(!GS){ GS={goals:DEFAULT_GOALS.map(function(d){return {id:uid(),group:d.g,title:d.t,target:d.target,unit:d.unit,why:d.why,count:0,done:false,subs:[],log:[],created:today()}})}; save('bdp-goals',GS); }
  function saveG(){ save('bdp-goals',GS); }
  function pct(g){ return g.target?Math.min(100,Math.round((g.count||0)/g.target*100)):(g.done?100:0); }
  function renderGoals(){
    var el=$('goalGroups'); if(!el)return;
    el.innerHTML=Object.keys(GROUPS).map(function(k){ var list=GS.goals.filter(function(g){return g.group===k});
      return '<div class="goalgrp"><h3>'+esc(GROUPS[k])+' <span class="sub13">· '+list.filter(function(g){return g.done}).length+' of '+list.length+' complete</span></h3>'+(list.length?list.map(function(g){
        return '<div class="goal'+(g.done?' done':'')+'" data-open="'+g.id+'" role="button" tabindex="0"><input type="checkbox" data-done="'+g.id+'" '+(g.done?'checked':'')+' aria-label="Complete"><div><div class="gt">'+esc(g.title)+'</div><div class="gs">'+(g.target?(g.count||0).toLocaleString()+' / '+g.target.toLocaleString()+' '+esc(g.unit||''):'')+(g.subs.length?' · '+g.subs.filter(function(s){return s.done}).length+'/'+g.subs.length+' steps':'')+'</div></div><div class="gbarwrap"><div class="gbar"><div style="width:'+pct(g)+'%"></div></div></div><span class="sub13">›</span></div>';
      }).join(''):'<div class="empty">'+(k==='winback'?'Add the former customers you want back — one per line, with why they left if you know it.':'Nothing here yet.')+'</div>')+'</div>'; }).join('');
    var done=GS.goals.filter(function(g){return g.done}).length; set('ovGoals',done+' / '+GS.goals.length+' annual goals done');
  }
  function openGoal(id){
    var g=GS.goals.find(function(x){return x.id===id}); if(!g)return; var pg=$('goalPage'), home=$('goalsHome');
    pg.innerHTML='<div class="gpage">'
      +'<button class="btn back" type="button" data-gback>‹ All goals</button>'
      +'<div><span class="label">'+esc(GROUPS[g.group])+'</span><input data-gf="title" value="'+esc(g.title)+'" style="width:100%;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:1.6rem;border:0;border-bottom:1px dashed var(--line);background:transparent;color:var(--fg);padding:4px 0" aria-label="Goal title"></div>'
      +'<label class="sub13" style="display:flex;flex-direction:column;gap:6px">Why it matters<textarea data-gf="why" rows="2" style="border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);padding:8px;font-family:var(--sans);font-size:14px">'+esc(g.why||'')+'</textarea></label>'
      +'<div class="kpi" style="padding:14px 16px"><div class="top"><span class="nm">Progress</span><span class="cnt">'+(g.count||0).toLocaleString()+' <small>/ '+(g.target||0).toLocaleString()+' '+esc(g.unit||'')+'</small></span></div><div class="bar"><div class="'+(pct(g)>=100?'met':'')+'" style="width:'+pct(g)+'%"></div></div><div class="ctl"><button class="sbtn go" data-ginc="1">+1</button><button class="sbtn quiet" data-ginc="-1">−1</button><span class="sub13" style="margin-left:6px">Add</span><input type="number" step="1" data-gadd style="width:90px;min-height:32px;border:1px solid var(--line);border-radius:4px;padding:0 8px;background:var(--bg);color:var(--fg);font-family:var(--mono)" placeholder="amount"><button class="sbtn" data-gaddgo>Add</button><span class="sub13" style="margin-left:auto">Target</span><input class="tgt" type="number" min="0" data-gf="target" value="'+esc(g.target||0)+'"><input class="tgt" data-gf="unit" value="'+esc(g.unit||'')+'" placeholder="unit"><label class="sub13" style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-gf="done" '+(g.done?'checked':'')+'> Complete</label></div></div>'
      +'<div><div class="card-head" style="margin-bottom:8px"><h2 style="font-size:16px">Steps</h2><span class="note">'+g.subs.filter(function(s){return s.done}).length+' / '+g.subs.length+'</span></div><ul class="tasks custom" style="margin-bottom:8px">'+g.subs.map(function(s,i){return '<li class="'+(s.done?'checked':'')+'"><input type="checkbox" data-sub="'+i+'" '+(s.done?'checked':'')+'><span class="task-text">'+esc(s.text)+'</span><button class="rm" type="button" data-subrm="'+i+'" aria-label="Remove step">✕</button></li>'}).join('')+'</ul><form data-subform class="addline"><input data-subtext required placeholder="Next concrete step" style="flex:1 1 240px"><button class="btn" type="submit">Add step</button></form></div>'
      +'<div><div class="card-head" style="margin-bottom:8px"><h2 style="font-size:16px">Progress log</h2></div><form data-logform class="addline"><input data-logtext required placeholder="What moved today" style="flex:1 1 240px"><button class="btn" type="submit">Log</button></form><div class="rows">'+(g.log.length?g.log.slice().reverse().map(function(l){return '<div class="kv"><span>'+esc(l.text)+'</span><span class="v muted">'+esc(l.date)+'</span></div>'}).join(''):'<div class="sub13">No entries yet.</div>')+'</div></div>'
      +'<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="sub13">Created '+esc(g.created)+'</span><button class="sbtn quiet" type="button" data-gdel>Delete goal</button></div>'
      +'</div>';
    home.hidden=true; pg.hidden=false; window.scrollTo(0,0);
    var upd=function(){ saveG(); openGoal(id); renderGoals(); };
    pg.querySelector('[data-gback]').onclick=function(){ pg.hidden=true; home.hidden=false; renderGoals(); };
    pg.querySelectorAll('[data-gf]').forEach(function(inp){ inp.addEventListener('change',function(){ var f=inp.dataset.gf; if(f==='done'){ g.done=inp.checked; g.log.push({text:g.done?'Marked complete':'Reopened',date:today()}); } else if(f==='target') g.target=+inp.value||0; else g[f]=inp.value; upd(); }); });
    pg.querySelectorAll('[data-ginc]').forEach(function(b){ b.onclick=function(){ g.count=Math.max(0,(g.count||0)+(+b.dataset.ginc)); g.log.push({text:(+b.dataset.ginc>0?'+1':'−1')+' '+(g.unit||''),date:today()}); if(g.target&&g.count>=g.target&&!g.done){g.done=true;g.log.push({text:'Target reached',date:today()});} upd(); }; });
    pg.querySelector('[data-gaddgo]').onclick=function(){ var n=+pg.querySelector('[data-gadd]').value||0; if(!n)return; g.count=Math.max(0,(g.count||0)+n); g.log.push({text:'+'+n.toLocaleString()+' '+(g.unit||''),date:today()}); if(g.target&&g.count>=g.target&&!g.done){g.done=true;} upd(); };
    pg.querySelector('[data-subform]').onsubmit=function(e){ e.preventDefault(); g.subs.push({text:pg.querySelector('[data-subtext]').value.trim(),done:false}); upd(); };
    pg.querySelectorAll('[data-sub]').forEach(function(c){ c.onchange=function(){ g.subs[+c.dataset.sub].done=c.checked; upd(); }; });
    pg.querySelectorAll('[data-subrm]').forEach(function(b){ b.onclick=function(){ g.subs.splice(+b.dataset.subrm,1); upd(); }; });
    pg.querySelector('[data-logform]').onsubmit=function(e){ e.preventDefault(); g.log.push({text:pg.querySelector('[data-logtext]').value.trim(),date:today()}); upd(); };
    pg.querySelector('[data-gdel]').onclick=function(){ var b=pg.querySelector('[data-gdel]'); if(!b.dataset.c){b.dataset.c='1';b.textContent='Delete this goal?';b.style.color='var(--accent)';return;} GS.goals=GS.goals.filter(function(x){return x.id!==id}); saveG(); pg.hidden=true; home.hidden=false; renderGoals(); };
  }
  var gg=$('goalGroups'); if(gg){
    gg.addEventListener('click',function(e){ var c=e.target.closest('input[data-done]'); if(c){ e.stopPropagation(); var g=GS.goals.find(function(x){return x.id===c.dataset.done}); g.done=c.checked; g.log.push({text:g.done?'Marked complete':'Reopened',date:today()}); saveG(); renderGoals(); return; } var row=e.target.closest('[data-open]'); if(row)openGoal(row.dataset.open); });
    gg.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var row=e.target.closest('[data-open]'); if(row)openGoal(row.dataset.open); } });
    $('goalForm').addEventListener('submit',function(e){ e.preventDefault(); GS.goals.push({id:uid(),group:$('goalGroup').value,title:$('goalText').value.trim(),target:+$('goalTarget').value||0,unit:$('goalUnit').value.trim(),why:'',count:0,done:false,subs:[],log:[],created:today()}); saveG(); $('goalForm').reset(); renderGoals(); });
    renderGoals();
  }

  /* ---------- KPI tracker ---------- */
  var DEFAULT_KPIS=[
    {n:'Qualified target accounts identified',t:100,u:'accounts'},{n:'Decision-makers identified & contacted',t:200,u:'people'},{n:'New relationships established',t:60,u:'relationships'},
    {n:'Qualified meetings secured',t:60,u:'meetings'},{n:'Client & project site visits',t:24,u:'visits'},{n:'Active opportunities developed',t:50,u:'opportunities'},
    {n:'Invitations to bid / RFPs / pricing received',t:12,u:'bids'},{n:'New client accounts secured',t:6,u:'accounts'},{n:'Projects awarded',t:4,u:'projects'},
    {n:'Labor hours generated',t:50000,u:'hours'},{n:'Revenue generated',t:2500000,u:'$'},{n:'Industry events attended',t:12,u:'events'}
  ];
  var KP=load('bdp-kpis',null); if(!KP){ KP={year:new Date().getFullYear(),items:DEFAULT_KPIS.map(function(d){return {id:uid(),name:d.n,target:d.t,unit:d.u,count:0}})}; save('bdp-kpis',KP); }
  var kpiEditing=false;
  function fmtN(n,u){ return u==='$'?'$'+(+n||0).toLocaleString():(+n||0).toLocaleString(); }
  function renderK(){
    var el=$('kpiList'); if(!el)return;
    el.innerHTML=KP.items.map(function(k,i){ var p=k.target?Math.min(100,Math.round(k.count/k.target*100)):0; var big=k.unit==='$'||k.unit==='hours';
      return '<div class="kpi"><div class="top"><span class="nm">'+esc(k.name)+'</span><span class="cnt">'+fmtN(k.count,k.unit)+' <small>/ '+fmtN(k.target,k.unit)+(k.unit==='$'?'':' '+esc(k.unit))+' · '+p+'%</small></span></div><div class="bar"><div class="'+(p>=100?'met':'')+'" style="width:'+p+'%"></div></div><div class="ctl">'
        +(big?'<input type="number" min="0" step="1" data-kadd="'+i+'" style="width:110px;min-height:32px;border:1px solid var(--line);border-radius:4px;padding:0 8px;background:var(--bg);color:var(--fg);font-family:var(--mono)" placeholder="amount"><button class="sbtn go" data-kaddgo="'+i+'">Add</button>':'<button class="sbtn go" data-kinc="'+i+'" data-n="1">+1</button><button class="sbtn quiet" data-kinc="'+i+'" data-n="-1">−1</button>')
        +(kpiEditing?'<span class="sub13" style="margin-left:auto">Target</span><input class="tgt" type="number" min="0" data-kt="'+i+'" value="'+k.target+'"><button class="sbtn quiet" data-krm="'+i+'" aria-label="Remove KPI">✕</button>':'')+'</div></div>'; }).join('');
    set('kpiEdit',kpiEditing?'Done editing':'Edit targets');
  }
  var kl=$('kpiList'); if(kl){
    kl.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b)return;
      if(b.dataset.kinc!=null){ var k=KP.items[+b.dataset.kinc]; k.count=Math.max(0,k.count+(+b.dataset.n)); }
      else if(b.dataset.kaddgo!=null){ var inp=kl.querySelector('input[data-kadd="'+b.dataset.kaddgo+'"]'); var n=+inp.value||0; if(!n)return; KP.items[+b.dataset.kaddgo].count=Math.max(0,KP.items[+b.dataset.kaddgo].count+n); }
      else if(b.dataset.krm!=null){ KP.items.splice(+b.dataset.krm,1); }
      else return; save('bdp-kpis',KP); renderK(); });
    kl.addEventListener('change',function(e){ var t=e.target.closest('input[data-kt]'); if(!t)return; KP.items[+t.dataset.kt].target=+t.value||0; save('bdp-kpis',KP); renderK(); });
    $('kpiEdit').addEventListener('click',function(){ kpiEditing=!kpiEditing; renderK(); });
    $('kpiAdd').addEventListener('click',function(){ $('kpiForm').hidden=!$('kpiForm').hidden; if(!$('kpiForm').hidden)$('kpiName').focus(); });
    $('kpiCancel').addEventListener('click',function(){ $('kpiForm').hidden=true; $('kpiForm').reset(); });
    $('kpiForm').addEventListener('submit',function(e){ e.preventDefault(); KP.items.push({id:uid(),name:$('kpiName').value.trim(),target:+$('kpiTarget').value||0,unit:$('kpiUnit').value.trim()||'',count:0}); save('bdp-kpis',KP); $('kpiForm').reset(); $('kpiForm').hidden=true; renderK(); });
    renderK();
  }

  /* ---------- Daily reports + Work week summary (one data model) ---------- */
  var RPT=load('bdp-reports',{days:{},weeks:{}});
  // migrate old week counters
  try{ var oldW=load('bdp-weeks',null); if(oldW&&oldW.weeks&&!RPT._migrated){ Object.keys(oldW.weeks).forEach(function(we){ var w=oldW.weeks[we]; RPT.weeks[we]={wins:w.wins||[],plan:w.plan||'',notes:w.notes||'',photos:w.photos||[],created:w.created}; var c=w.counters||{}; var d=addDays(we,-2); var r=RPT.days[d]||(RPT.days[d]={}); r.calls=(r.calls||0)+(c.dials||0); r.meetings=(r.meetings||0)+(c.meetings||0); r.contacts=(r.contacts||0)+(c.convos||0); r.proposals=(r.proposals||0)+(c.proposals||0); }); RPT._migrated=true; save('bdp-reports',RPT); } }catch(e){}
  function weekEndingOf(dstr){ var d=new Date(dstr+'T12:00:00'); var dow=(d.getDay()+6)%7; d.setDate(d.getDate()+(6-dow)); return d.toISOString().slice(0,10); }
  function addDays(s,n){ var d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function saveR(){ save('bdp-reports',RPT); }
  function day(d,create){ var r=RPT.days[d]; if(!r&&create){ r=RPT.days[d]={title:'',where:'',happened:'',movement:'',tomorrow:'',calls:0,meetings:0,contacts:0,proposals:0,status:'draft'}; } return r||{title:'',where:'',happened:'',movement:'',tomorrow:'',calls:0,meetings:0,contacts:0,proposals:0,status:'none'}; }
  function wkRec(we,create){ var w=RPT.weeks[we]; if(!w&&create){ w=RPT.weeks[we]={wins:[],plan:'',notes:'',photos:[],created:today()}; } return w||{wins:[],plan:'',notes:'',photos:[],created:null}; }
  function weekDays(we){ var a=[]; for(var i=6;i>=0;i--)a.push(addDays(we,-i)); return a; }
  function weekTotals(we){ var t={calls:0,meetings:0,contacts:0,proposals:0}; weekDays(we).forEach(function(d){ var r=RPT.days[d]; if(!r)return; Object.keys(t).forEach(function(k){t[k]+=(+r[k]||0)}); }); return t; }
  var selDay=today(), calMonth=today().slice(0,7);

  // ---- Daily reports UI
  function renderCal(){
    var g=$('calGrid'); if(!g)return; var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7)-1; var first=new Date(y,m,1); var startDow=(first.getDay()+6)%7; var dim=new Date(y,m+1,0).getDate();
    $('calTitle').textContent=first.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    var html=['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(d){return '<span class="dow">'+d+'</span>'}).join('');
    var prevDim=new Date(y,m,0).getDate();
    for(var i=startDow-1;i>=0;i--){ var pd=new Date(y,m-1,prevDim-i); html+=cell(pd,true); }
    for(var d=1;d<=dim;d++){ html+=cell(new Date(y,m,d),false); }
    var rem=(7-((startDow+dim)%7))%7; for(var n=1;n<=rem;n++){ html+=cell(new Date(y,m+1,n),true); }
    g.innerHTML=html;
    function cell(dt,other){ var iso=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); var r=RPT.days[iso]; var dot=r?(r.status==='submitted'?'<span class="d ok"></span>':'<span class="d draft"></span>'):''; return '<button type="button" data-day="'+iso+'" class="'+(other?'other ':'')+(iso===selDay?'sel ':'')+(iso===today()?'today':'')+'">'+dt.getDate()+dot+'</button>'; }
  }
  function renderWeekStrip(){
    var el=$('rptWeekList'); if(!el)return; var we=weekEndingOf(selDay), days=weekDays(we).slice(0,5); var filed=0;
    el.innerHTML=days.map(function(d){ var r=RPT.days[d]; if(r&&r.status==='submitted')filed++; var tag=r?(r.status==='submitted'?'<span class="tag ok">Submitted</span>':'<span class="tag">Draft</span>'):'<span class="tag" style="opacity:.5">—</span>'; return '<div class="wkday'+(d===selDay?' sel':'')+'" role="button" tabindex="0" data-day="'+d+'"><div class="top"><span>'+fmtD(d,{weekday:'short',month:'short',day:'numeric'})+'</span>'+tag+'</div><div class="sum">'+esc(r&&(r.title||r.happened)?(r.title||r.happened.slice(0,70)):'Nothing logged')+'</div></div>'; }).join('');
    $('rptWeekLabel').textContent='Week of '+fmtD(days[0],{month:'short',day:'numeric'}); $('rptWeekFiled').textContent=filed+' of 5 filed';
  }
  function renderReport(){
    if(!$('rptPanel'))return; var r=day(selDay,false);
    $('rptDateLine').textContent=fmtD(selDay,{weekday:'long',month:'long',day:'numeric',year:'numeric'})+(r.submittedAt?' · Submitted '+r.submittedAt:'');
    $('rptTitle').value=r.title||''; $('rptWhere').value=r.where||''; $('rptHappened').value=r.happened||''; $('rptMovement').value=r.movement||''; $('rptTomorrow').value=r.tomorrow||'';
    ['calls','meetings','contacts','proposals'].forEach(function(k){ set('rptN-'+k,r[k]||0); });
    var st=$('rptStatus'); st.textContent=r.status==='submitted'?'Submitted':r.status==='draft'?'Draft':'Not started'; st.className=r.status==='submitted'?'tag ok':'tag';
    set('rptFoot',r.status==='none'?'Not saved':(r.status==='submitted'?'Submitted '+(r.submittedAt||''):'Draft saved '+(r.savedAt||'')));
    set('rptEyebrow','Daily reports · '+Object.keys(RPT.days).filter(function(d){return RPT.days[d].status==='submitted'}).length+' submitted');
    renderCal(); renderWeekStrip(); renderOverview();
  }
  function readForm(r){ r.title=$('rptTitle').value.trim(); r.where=$('rptWhere').value.trim(); r.happened=$('rptHappened').value.trim(); r.movement=$('rptMovement').value.trim(); r.tomorrow=$('rptTomorrow').value.trim(); }
  function selectDay(d){ selDay=d; calMonth=d.slice(0,7); try{localStorage.setItem('bdp-rpt-day',d)}catch(e){} renderReport(); }
  if($('rptPanel')){
    try{ var sd=localStorage.getItem('bdp-rpt-day'); if(sd&&/^\d{4}-\d{2}-\d{2}$/.test(sd))selDay=sd; }catch(e){} calMonth=selDay.slice(0,7);
    $('calGrid').addEventListener('click',function(e){ var b=e.target.closest('button[data-day]'); if(b)selectDay(b.dataset.day); });
    $('rptWeekList').addEventListener('click',function(e){ var b=e.target.closest('[data-day]'); if(b)selectDay(b.dataset.day); });
    $('rptWeekList').addEventListener('keydown',function(e){ if(e.key==='Enter'){ var b=e.target.closest('[data-day]'); if(b)selectDay(b.dataset.day); } });
    $('calPrev').addEventListener('click',function(){ var y=+calMonth.slice(0,4),m=+calMonth.slice(5,7)-2; var d=new Date(y,m,1); calMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCal(); });
    $('calNext').addEventListener('click',function(){ var y=+calMonth.slice(0,4),m=+calMonth.slice(5,7); var d=new Date(y,m,1); calMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCal(); });
    $('rptPanel').addEventListener('click',function(e){ var b=e.target.closest('button[data-rinc],button[data-rdec]'); if(!b)return; var r=day(selDay,true); var k=b.dataset.rinc||b.dataset.rdec; r[k]=Math.max(0,(+r[k]||0)+(b.dataset.rinc?1:-1)); if(r.status==='none')r.status='draft'; saveR(); renderReport(); });
    $('rptSave').addEventListener('click',function(){ var r=day(selDay,true); readForm(r); if(r.status!=='submitted')r.status='draft'; r.savedAt=today(); saveR(); renderReport(); toastMsg('SAVED'); });
    $('rptSubmit').addEventListener('click',function(){ var r=day(selDay,true); readForm(r); r.status='submitted'; r.submittedAt=new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); saveR(); renderReport(); toastMsg('SUBMITTED'); });
    ['rptTitle','rptWhere','rptHappened','rptMovement','rptTomorrow'].forEach(function(id){ $(id).addEventListener('change',function(){ var r=day(selDay,true); readForm(r); if(r.status==='none')r.status='draft'; r.savedAt=today(); saveR(); renderCal(); renderWeekStrip(); }); });
  }
  var toastT2; function toastMsg(m){ var t=$('toast'); if(!t)return; t.textContent=m; t.classList.add('show'); clearTimeout(toastT2); toastT2=setTimeout(function(){t.classList.remove('show')},1800); }

  // ---- Overview cards
  function renderOverview(){
    var subm=Object.keys(RPT.days).filter(function(d){return RPT.days[d].status!=='none'}).sort(); var last=subm.length?subm[subm.length-1]:null;
    if($('ovRptDate')){ if(last){ var r=RPT.days[last]; set('ovRptDate',fmtD(last,{weekday:'short',month:'short',day:'numeric'})+(r.status==='submitted'?' · Submitted':' · Draft')); set('ovRptText',r.title?(r.title+(r.happened?' — '+r.happened:'')):(r.happened||'No narrative yet.')); $('ovRptChips').innerHTML='<span class="chip outline">Calls '+(r.calls||0)+'</span><span class="chip outline">Meetings '+(r.meetings||0)+'</span><span class="chip outline">New contacts '+(r.contacts||0)+'</span><span class="chip outline">Proposals '+(r.proposals||0)+'</span>'; } else { set('ovRptDate','—'); set('ovRptText','No daily report filed yet.'); } }
    var we=weekEndingOf(today()), t=weekTotals(we), w=wkRec(we,false);
    var ov=$('ovWeekRows'); if(ov){ ov.innerHTML='<div class="kv"><span>Calls</span><span class="v">'+t.calls+'</span></div><div class="kv"><span>Meetings</span><span class="v">'+t.meetings+'</span></div><div class="kv"><span>New contacts</span><span class="v">'+t.contacts+'</span></div><div class="kv"><span>Proposals</span><span class="v">'+t.proposals+'</span></div>'+(w.wins.length?'<div class="kv"><span>Wins</span><span class="v">'+w.wins.length+'</span></div>':''); set('ovWeekFoot',w.wins.length?('Latest win: '+w.wins[w.wins.length-1].text):'Log the day on Daily Reports and it adds up here.'); }
    set('ovMeet',String(t.meetings)); set('ovMeetSub',t.proposals+' proposals · '+w.wins.length+' wins');
  }

  // ---- Work week summary UI
  var cur=weekEndingOf(today());
  function renderW(){
    if(!$('wkCounters'))return; var w=wkRec(cur,false), t=weekTotals(cur), start=addDays(cur,-6);
    set('wkEyebrow','Week of '+fmtD(start,{month:'short',day:'numeric'})+' – '+fmtD(cur)); var filed=weekDays(cur).filter(function(d){return RPT.days[d]&&RPT.days[d].status==='submitted'}).length; set('wkMeta',filed+' daily report'+(filed===1?'':'s')+' submitted this week'+(w.created?' · week notes started '+fmtD(w.created):'')+(cur===weekEndingOf(today())?' · current week':''));
    ['calls','meetings','contacts','proposals'].forEach(function(k){ set('wkC-'+k,t[k]); });
    set('wkWinCount',w.wins.length+' win'+(w.wins.length===1?'':'s'));
    $('wkWins').innerHTML=w.wins.length?w.wins.map(function(x,i){return '<div class="kv"><span>'+esc(x.text)+'</span><span style="display:flex;gap:8px;align-items:center"><span class="v muted">'+esc(x.date)+'</span><button class="rm" type="button" data-winrm="'+i+'" aria-label="Remove win">✕</button></span></div>'}).join(''):'<div class="sub13">No wins logged yet this week.</div>';
    $('wkNextPlan').value=w.plan||''; $('wkNotes').value=w.notes||'';
    $('wkPhotos').innerHTML=w.photos.length?w.photos.map(function(p,i){return '<figure><img src="'+p.src+'" alt="'+esc(p.name)+'"><button class="rmp" type="button" data-prm="'+i+'" aria-label="Remove photo">✕</button><figcaption>'+esc(p.name)+' · '+esc(p.date)+'</figcaption></figure>'}).join(''):'<div class="sub13">No photos attached.</div>';
    renderOverview();
  }
  if($('wkCounters')){
    var logDay=function(){ var td=today(); var days=weekDays(cur); if(days.indexOf(td)>=0)return td; return days[4]; };
    $('wkCounters').addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b)return; var d=logDay(); var r=day(d,true); var k=b.dataset.inc||b.dataset.dec; if(!k)return; r[k]=Math.max(0,(+r[k]||0)+(b.dataset.inc?1:-1)); if(r.status==='none')r.status='draft'; saveR(); renderW(); if(selDay===d)renderReport(); });
    $('winForm').addEventListener('submit',function(e){ e.preventDefault(); wkRec(cur,true).wins.push({text:$('winText').value.trim(),date:today()}); saveR(); $('winForm').reset(); renderW(); });
    $('wkWins').addEventListener('click',function(e){ var b=e.target.closest('button[data-winrm]'); if(!b)return; wkRec(cur,true).wins.splice(+b.dataset.winrm,1); saveR(); renderW(); });
    $('wkNextPlan').addEventListener('change',function(){ wkRec(cur,true).plan=$('wkNextPlan').value; saveR(); renderW(); });
    $('wkNotes').addEventListener('change',function(){ wkRec(cur,true).notes=$('wkNotes').value; saveR(); renderW(); });
    $('wkPrev').addEventListener('click',function(){ cur=addDays(cur,-7); renderW(); });
    $('wkNext').addEventListener('click',function(){ cur=addDays(cur,7); renderW(); });
    $('wkPhotos').addEventListener('click',function(e){ var b=e.target.closest('button[data-prm]'); if(!b)return; wkRec(cur,true).photos.splice(+b.dataset.prm,1); saveR(); renderW(); });
    $('wkPhoto').addEventListener('change',function(){ var files=[].slice.call($('wkPhoto').files); var w=wkRec(cur,true); var left=files.length; files.forEach(function(f){ var img=new Image(), url=URL.createObjectURL(f); img.onload=function(){ var s=Math.min(1,1000/Math.max(img.width,img.height)); var c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); w.photos.push({src:c.toDataURL('image/jpeg',0.72),name:f.name,date:today()}); if(--left===0){ saveR(); renderW(); } }; img.src=url; }); $('wkPhoto').value=''; });
    $('wkDownload').addEventListener('click',function(){
      var w=wkRec(cur,false), t=weekTotals(cur), start=addDays(cur,-6); var win=window.open('','_blank'); if(!win){ alert('Allow pop-ups for this site to download the PDF.'); return; }
      var days=weekDays(cur).slice(0,5).filter(function(d){return RPT.days[d]&&RPT.days[d].status!=='none'});
      var css='body{margin:0;padding:32px;font-family:"IBM Plex Sans",system-ui,sans-serif;color:#1B1F27;background:#fff} .mono{font-family:"IBM Plex Mono",monospace} h1{font-size:28px;margin:0 0 4px} .eyebrow{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5B6270} .sub{color:#5B6270;margin-bottom:20px} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px} .tile{border:1px solid #E3DFD5;border-radius:10px;padding:14px 16px} .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:#5B6270} .big{font-family:"IBM Plex Mono",monospace;font-size:30px;font-weight:600} h2{font-size:16px;margin:18px 0 8px} h3{font-size:14px;margin:12px 0 4px} .kv{display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #EDE9E0;font-size:14px} .kv:last-child{border-bottom:1px solid #EDE9E0} .muted{color:#5B6270;font-family:"IBM Plex Mono",monospace;font-size:12px} p{white-space:pre-wrap;font-size:14px;line-height:1.55;margin:0} .day{border:1px solid #E3DFD5;border-radius:8px;padding:12px 14px;margin-bottom:10px;break-inside:avoid} .photos{display:flex;flex-wrap:wrap;gap:10px} .photos figure{margin:0;width:220px;break-inside:avoid} .photos img{width:220px;height:165px;object-fit:cover;border-radius:6px;border:1px solid #E3DFD5} figcaption{font-size:11px;color:#5B6270;margin-top:4px} .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #16233A;padding-bottom:14px;margin-bottom:18px} .foot{margin-top:28px;font-size:11px;color:#5B6270;border-top:1px solid #EDE9E0;padding-top:10px} @media print{body{padding:0} @page{margin:18mm}}';
      var html='<!doctype html><html><head><meta charset="utf-8"><title>Work Week Summary — week ending '+cur+'</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"><style>'+css+'</style></head><body>'
        +'<div class="head"><div><div class="eyebrow">IB Group Worldwide · BD Progress Portal</div><h1>Work Week Summary</h1><div class="sub" style="margin:0">Samuel R. Carstens — Strategic Accounts &amp; Data Centers · FL · TX · LA · GA</div></div><div style="text-align:right"><div class="eyebrow">Week ending</div><div class="mono" style="font-size:18px;font-weight:600">'+fmtD(cur)+'</div><div class="muted">'+fmtD(start,{month:'short',day:'numeric'})+' – '+fmtD(cur,{month:'short',day:'numeric'})+'</div></div></div>'
        +'<div class="grid"><div class="tile"><div class="label">Calls</div><div class="big">'+t.calls+'</div></div><div class="tile"><div class="label">Meetings</div><div class="big">'+t.meetings+'</div></div><div class="tile"><div class="label">New contacts</div><div class="big">'+t.contacts+'</div></div><div class="tile"><div class="label">Proposals</div><div class="big">'+t.proposals+'</div></div></div>'
        +'<h2>Wins ('+w.wins.length+')</h2>'+(w.wins.length?w.wins.map(function(x){return '<div class="kv"><span>'+esc(x.text)+'</span><span class="muted">'+esc(x.date)+'</span></div>'}).join(''):'<p class="muted">None logged.</p>')
        +'<h2>Daily reports</h2>'+(days.length?days.map(function(d){ var r=RPT.days[d]; return '<div class="day"><div class="eyebrow">'+fmtD(d,{weekday:'long',month:'short',day:'numeric'})+' · '+(r.status==='submitted'?'Submitted':'Draft')+' · Calls '+(r.calls||0)+' · Meetings '+(r.meetings||0)+' · New contacts '+(r.contacts||0)+' · Proposals '+(r.proposals||0)+'</div>'+(r.title?'<h3>'+esc(r.title)+'</h3>':'')+(r.happened?'<p>'+esc(r.happened)+'</p>':'')+(r.movement?'<h3>Pipeline movement</h3><p>'+esc(r.movement)+'</p>':'')+(r.tomorrow?'<h3>Next</h3><p>'+esc(r.tomorrow)+'</p>':'')+'</div>'; }).join(''):'<p class="muted">No daily reports this week.</p>')
        +'<h2>Plan for next week</h2><p>'+(esc(w.plan)||'<span class="muted">—</span>')+'</p><h2>Notes</h2><p>'+(esc(w.notes)||'<span class="muted">—</span>')+'</p>'
        +(w.photos.length?'<h2>Photos ('+w.photos.length+')</h2><div class="photos">'+w.photos.map(function(p){return '<figure><img src="'+p.src+'"><figcaption>'+esc(p.name)+' · '+esc(p.date)+'</figcaption></figure>'}).join('')+'</div>':'')
        +'<div class="foot">Generated '+fmtD(today())+' from the BD Progress Portal. In the print dialog choose "Save as PDF".</div>'
        +'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},600)})<\/script></body></html>';
      win.document.open(); win.document.write(html); win.document.close();
    });
  }
  renderReport(); renderW(); renderOverview();
  window.addEventListener('hashchange',function(){ if(location.hash==='#week'){ cur=weekEndingOf(today()); renderW(); } if(location.hash==='#reports')renderReport(); if(location.hash==='#overview')renderOverview(); });
  // Lead Gen hub contact count
  try{ var cc=JSON.parse(localStorage.getItem('bdp-contacts')||'[]'); set('lgContacts',cc.length+' contact'+(cc.length===1?'':'s')); }catch(e){}

  /* ---------- Mileage counter in expense form ---------- */
  var eCat=$('eCat'); if(eCat){
    var showMi=function(){ var mi=eCat.value==='Miles Driven'; ['eOdoStartLabel','eOdoEndLabel','eTripLabel'].forEach(function(id){ if($(id))$(id).hidden=!mi; }); };
    eCat.addEventListener('change',showMi); showMi();
    var odo=function(){ var a=+$('eOdoStart').value, b=+$('eOdoEnd').value; if(b>a&&a>0){ $('eMiles').value=((b-a)*(+$('eTrip').value||1)).toFixed(1); } };
    $('eOdoStart').addEventListener('input',odo); $('eOdoEnd').addEventListener('input',odo); $('eTrip').addEventListener('input',odo);
    $('eTripPlus').addEventListener('click',function(){ $('eTrip').value=(+$('eTrip').value||0)+1; odo(); if(!$('eOdoEnd').value&&$('eMiles').dataset.base){ $('eMiles').value=((+$('eMiles').dataset.base)*(+$('eTrip').value)).toFixed(1); } });
    $('eMiles').addEventListener('input',function(){ if(!$('eOdoEnd').value) $('eMiles').dataset.base=$('eMiles').value; });
  }
})();

/* ===================== ONE-TIME SEED: Framing the Pipeline (Oct 26, 2026) ===================== */
(function(){
  var KEY='bdp-seed-ftp-v1';
  try{ if(localStorage.getItem(KEY))return; }catch(e){ return; }
  if(!window.OPPS)return;
  fetch('seed-opps.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(list){
    var have={}; window.OPPS.forEach(function(o){ have[(o.project||'').toLowerCase()]=1; });
    var n=0; list.forEach(function(o){ var k=(o.project||'').toLowerCase(); if(!k||have[k])return; have[k]=1; window.OPPS.push(o); n++; });
    try{ localStorage.setItem('bdp-opps',JSON.stringify(window.OPPS)); localStorage.setItem(KEY,new Date().toISOString()); }catch(e){}
    if(window.renderPipeline)window.renderPipeline();
    var f=document.getElementById('oppFoot'); if(f&&n) f.textContent='Loaded '+n+' companies from Framing the Pipeline · '+f.textContent;
  }).catch(function(){});
})();

/* ===================== PIPELINE DRILL-DOWN: metro / trade pages and company job pages ===================== */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  function money(n){ n=+n||0; if(n>=1e6)return '$'+(n/1e6).toFixed(n>=1e7?0:1)+'M'; if(n>=1e3)return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  var home=$('pipeHome'), sub=$('pipeSub'); if(!home||!sub)return;
  var toastT; function toast(msg){ var t=$('toast'); if(!t)return; t.textContent=msg||'SAVED'; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('show')},1800); }
  function push(state){ try{ history.pushState(state,'',location.href); }catch(e){} }
  var suppress=false;
  function OPPS(){ return window.OPPS||[]; }
  function saveAll(){ try{localStorage.setItem('bdp-opps',JSON.stringify(OPPS()))}catch(e){ alert('Could not save — browser storage is full. Site plans are the usual cause; try a smaller file.'); } if(window.renderPipeline)window.renderPipeline(); }
  var ACTIVE=['Qualified','Meeting set','Proposal sent','Verbal yes'];
  var STAGES_ALL=['New','Qualified','Meeting set','Proposal sent','Verbal yes','Won','Lost'];
  var cur={key:null,val:null};
  var hdr=$('view-pipeline').querySelector('header.head');
  function showHome(noPush){ sub.hidden=true; home.hidden=false; if(hdr)hdr.hidden=false; window.scrollTo(0,0); if(!noPush&&history.state&&history.state.pipe&&history.state.pipe!=='home')push({pipe:'home'}); }
  function groupList(key,val){ return OPPS().map(function(o,i){o._i=i;return o}).filter(function(o){ return ACTIVE.indexOf(o.stage)>=0 && (o[key]||'—')===val; }); }
  function stageCls(s){ return (s==='Won'||s==='Verbal yes'||s==='Proposal sent')?'tag ok':'tag'; }

  function showGroup(key,val,noPush){
    cur={key:key,val:val}; if(!noPush)push({pipe:'group',key:key,val:val}); var list=groupList(key,val); var total=list.reduce(function(a,o){return a+(+o.value||0)},0);
    sub.innerHTML='<div style="display:flex;flex-direction:column;gap:16px">'
      +'<div><button class="btn" type="button" data-back="home">‹ Pipeline</button></div>'
      +'<header class="head"><div class="head-left"><span class="eyebrow">By '+esc(key)+' · '+list.length+' qualified opportunit'+(list.length===1?'y':'ies')+'</span><h1>'+esc(val)+'</h1><span class="sub">Total value '+money(total)+'. Click a company for the job details, site plan and price.</span></div></header>'
      +'<div class="sublist">'+(list.length?list.map(function(o){ return '<div class="co" role="button" tabindex="0" data-co="'+o._i+'"><div><div class="t">'+esc(o.project)+'</div><div class="m">'+esc([o.gc,o.location||o.metro,o.trade].filter(Boolean).join(' · '))+'</div></div><div><div class="m"><span class="'+stageCls(o.stage)+'">'+esc(o.stage)+'</span>'+(o.contact?' · '+esc(o.contact):'')+'</div><div class="m">'+esc(o.next||o.status||'')+'</div></div><div class="mono" style="text-align:right;font-weight:600">'+(o.value?money(o.value):'<span style="color:var(--accent)">Set price</span>')+'</div><div style="text-align:right;color:var(--accent)">›</div></div>'; }).join(''):'<div class="empty">No qualified opportunities in this group.</div>')+'</div></div>';
    home.hidden=true; sub.hidden=false; if(hdr)hdr.hidden=true; window.scrollTo(0,0);
  }

  function showCompany(idx,noPush){
    var o=OPPS()[idx]; if(!o)return; var si=STAGES_ALL.indexOf(o.stage); if(!noPush)push({pipe:'company',idx:idx,key:cur.key,val:cur.val});
    var f=function(label,key,type,wide){ return '<label class="'+(wide?'wide':'')+'">'+label+'<input data-f="'+key+'" type="'+(type||'text')+'" value="'+esc(o[key]||'')+'"></label>'; };
    sub.innerHTML='<div style="display:flex;flex-direction:column;gap:18px">'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-back="group">‹ '+esc(cur.val||'Back')+'</button><button class="btn" type="button" data-back="home">Pipeline</button></div>'
      +'<header class="head"><div class="head-left"><span class="eyebrow">'+esc(o.metro||'')+' · '+esc(o.trade||'')+'</span><h1>'+esc(o.project)+'</h1><span class="sub">'+esc([o.gc,o.location,o.projectType].filter(Boolean).join(' · '))+'</span></div><div class="head-right"><span class="'+stageCls(o.stage)+'" style="font-size:13px;padding:6px 12px">'+esc(o.stage)+'</span></div></header>'
      +'<div class="price"><div style="display:flex;flex-direction:column;gap:4px"><span class="label" style="color:var(--mute-soft)">Price for this project</span><span class="sub13" style="color:var(--navy-dim)">Counts toward the '+esc(o.stage)+' total in By stage, By metro and By trade.</span></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="mono" style="font-size:22px">$</span><input data-f="value" type="number" min="0" step="1000" value="'+(o.value||'')+'" placeholder="0" aria-label="Price"><button class="btn" type="button" data-saveprice style="background:var(--accent);border-color:var(--accent);color:#fff">Save price</button></div></div>'
      +'<div class="card"><div class="card-head"><h2>Agreed hourly rates</h2><span class="note">Rate × 40 hrs/week × weeks on site, per role</span></div><div class="rates" data-ratecalc></div><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-top:12px;border-top:1px solid var(--line-soft)"><span class="sub13">Tick the roles on this job. Workers count is the Workers field.</span><div style="display:flex;align-items:center;gap:12px"><span class="mono" style="font-size:20px;font-weight:600" data-ratetotal>—</span><button class="btn primary" type="button" data-rateuse>Use as price</button></div></div></div>'
      +'<div class="card"><div class="card-head"><h2>Job details</h2><span class="note">Edits save when you leave a field</span></div><div class="detail">'
      +f('Company / project','project')+f('General contractor','gc')+f('Metro','metro')
      +'<label>Trade<select data-f="trade">'+['Drywall &amp; metal framing','Acoustical ceilings','Insulation','Drywall / ACT combined','General labor','General contractor','Other'].map(function(t){var tt=t.replace('&amp;','&');return '<option'+(tt===o.trade?' selected':'')+'>'+t+'</option>'}).join('')+'</select></label>'
      +f('Workers','heads','number')+f('Weeks','weeks','number')
      +f('Decision-maker / contact','contact')+f('Phone','phone','tel')+f('Email','email','email')
      +f('Location / address','location',null,true)+f('Project type / scope','projectType',null,true)
      +f('Relationship status','status')+f('Next step','next')+f('Timeline','timeline')
      +'<label class="wide">Notes<textarea data-f="notes">'+esc(o.notes||'')+'</textarea></label>'
      +'</div></div>'
      +'<div class="card"><div class="card-head"><h2>Site plan</h2><label class="btn" style="display:inline-flex;align-items:center;cursor:pointer;position:relative;overflow:hidden"><input type="file" data-plan accept="image/*,.pdf" style="position:absolute;width:1px;height:1px;opacity:0">Attach site plan</label></div><div class="plan">'
      +(o.plan?(o.plan.type==='application/pdf'?'<a class="btn" href="'+o.plan.src+'" target="_blank" rel="noopener">Open PDF · '+esc(o.plan.name)+'</a>':'<a href="'+o.plan.src+'" target="_blank" rel="noopener"><img src="'+o.plan.src+'" alt="Site plan"></a>')+'<span class="sub13">'+esc(o.plan.name)+' · attached '+esc(o.plan.date)+'</span><button class="sbtn quiet" type="button" data-planrm>Remove</button>':'<span class="sub13">No site plan attached. Images or PDF up to about 2 MB.</span>')
      +'</div></div>'
      +'<div class="card"><div class="card-head"><h2>Stage</h2><span class="note">Opened '+esc(o.opened||'')+(o.qualified?' · qualified '+esc(o.qualified):'')+(o.closed?' · closed '+esc(o.closed):'')+'</span></div><div class="acts">'
      +STAGES_ALL.slice(0,5).map(function(s,i){return '<button class="sbtn'+(o.stage===s?' go':'')+'" type="button" data-stage="'+s+'">'+s+'</button>'}).join('')+'<button class="sbtn win" type="button" data-stage="Won">Won</button><button class="sbtn quiet" type="button" data-stage="Lost">Lost</button></div></div>'
      +'</div>';
    home.hidden=true; sub.hidden=false; if(hdr)hdr.hidden=true; window.scrollTo(0,0);
    sub.querySelectorAll('[data-f]').forEach(function(inp){ inp.addEventListener('change',function(){ var k=inp.dataset.f; o[k]=(inp.type==='number')?(+inp.value||0):inp.value; o.edited=today(); saveAll(); if(k==='value'||k==='metro'||k==='trade'||k==='project')showCompany(idx); }); });
    sub.querySelector('[data-saveprice]').addEventListener('click',function(){ var inp=sub.querySelector('input[data-f="value"]'); o.value=+inp.value||0; o.edited=today(); saveAll(); showCompany(idx,true); toast('SAVED'); });
    // ---- hourly rate calculator
    var R=o.rates||{sup:{on:false,count:1,rate:0,weeks:o.weeks||0},fore:{on:false,count:1,rate:0,weeks:o.weeks||0},work:{on:true,count:o.heads||0,rate:0,weeks:o.weeks||0}};
    var rc=sub.querySelector('[data-ratecalc]'); if(rc){
      var row=function(k,label){ var r=R[k]; return '<input type="checkbox" data-rk="'+k+'" data-rf="on" '+(r.on?'checked':'')+' aria-label="Include '+label+'"><span>'+label+'</span><input class="c3" type="number" min="0" step="1" data-rk="'+k+'" data-rf="count" value="'+(r.count||0)+'" aria-label="'+label+' count"><input class="c4" type="number" min="0" step="0.25" data-rk="'+k+'" data-rf="rate" value="'+(r.rate||'')+'" placeholder="$/hr" aria-label="'+label+' hourly rate"><input class="c5" type="number" min="0" step="1" data-rk="'+k+'" data-rf="weeks" value="'+(r.weeks||0)+'" aria-label="'+label+' weeks"><span class="rowt c6" data-rt="'+k+'">—</span>'; };
      rc.innerHTML='<span class="hd"></span><span class="hd">Role</span><span class="hd">Count</span><span class="hd">Rate $/hr</span><span class="hd">Weeks</span><span class="hd" style="text-align:right">Line total</span>'+row('sup','Superintendent')+row('fore','Foreman')+row('work','Workers');
      var calc=function(){ var tot=0; ['sup','fore','work'].forEach(function(k){ var r=R[k]; var lt=r.on?(+r.count||0)*(+r.rate||0)*40*(+r.weeks||0):0; tot+=lt; var el=rc.querySelector('[data-rt="'+k+'"]'); if(el)el.textContent=r.on&&lt?money(lt):'—'; }); var tv=sub.querySelector('[data-ratetotal]'); if(tv)tv.textContent=tot?('$'+Math.round(tot).toLocaleString()):'—'; return tot; };
      rc.addEventListener('input',function(e){ var i=e.target.closest('[data-rk]'); if(!i)return; var r=R[i.dataset.rk]; if(i.dataset.rf==='on')r.on=i.checked; else r[i.dataset.rf]=+i.value||0; o.rates=R; calc(); });
      rc.addEventListener('change',function(){ o.rates=R; if(R.work.count)o.heads=R.work.count; saveAll(); });
      sub.querySelector('[data-rateuse]').addEventListener('click',function(){ var tot=calc(); o.rates=R; o.value=Math.round(tot); o.edited=today(); if(R.work.count)o.heads=R.work.count; saveAll(); showCompany(idx,true); toast('SAVED'); });
      calc();
    }
    sub.querySelectorAll('[data-stage]').forEach(function(b){ b.addEventListener('click',function(){ var s=b.dataset.stage; if(s===o.stage)return; o.stage=s; if(s==='Qualified'&&!o.qualified)o.qualified=today(); if(s==='Won'||s==='Lost')o.closed=today(); else delete o.closed; saveAll(); showCompany(idx); }); });
    var pf=sub.querySelector('[data-plan]'); pf.addEventListener('change',function(){ var file=pf.files[0]; if(!file)return;
      var finish=function(src){ o.plan={src:src,name:file.name,type:file.type,date:today()}; saveAll(); showCompany(idx); };
      if(file.type==='application/pdf'){ if(file.size>2.5e6){ alert('That PDF is '+(file.size/1e6).toFixed(1)+' MB — too large to keep in the browser. Export a smaller PDF or a screenshot of the plan.'); return; } var r=new FileReader(); r.onload=function(){finish(r.result)}; r.readAsDataURL(file); }
      else { var img=new Image(), url=URL.createObjectURL(file); img.onload=function(){ var s=Math.min(1,1800/Math.max(img.width,img.height)); var c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); finish(c.toDataURL('image/jpeg',0.8)); }; img.src=url; }
    });
    var prm=sub.querySelector('[data-planrm]'); if(prm) prm.addEventListener('click',function(){ delete o.plan; saveAll(); showCompany(idx); });
  }

  // navigation
  ['byMetro','byTrade'].forEach(function(id){ var el=$(id); if(!el)return; el.addEventListener('click',function(e){ var r=e.target.closest('[data-gkey]'); if(r)showGroup(r.dataset.gkey,r.dataset.gval); }); el.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var r=e.target.closest('[data-gkey]'); if(r)showGroup(r.dataset.gkey,r.dataset.gval); } }); });
  sub.addEventListener('click',function(e){ var b=e.target.closest('[data-back]'); if(b){ if(b.dataset.back==='home')showHome(); else if(cur.key)showGroup(cur.key,cur.val); else showHome(); return; } var c=e.target.closest('[data-co]'); if(c)showCompany(+c.dataset.co); });
  sub.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var c=e.target.closest('[data-co]'); if(c)showCompany(+c.dataset.co); } });
  // opportunities table: clicking a project name opens its page too
  var rows=$('oppRows'); if(rows) rows.addEventListener('click',function(e){ if(e.target.closest('button'))return; var tr=e.target.closest('tr'); if(!tr)return; var b=tr.querySelector('button[data-i]'); if(!b)return; cur={key:null,val:null}; showCompany(+b.dataset.i); });
  try{ if(!history.state||!history.state.pipe) history.replaceState({pipe:'home'},'',location.href); }catch(e){}
  window.addEventListener('popstate',function(e){ var s=e.state||{}; if(location.hash!=='#pipeline')return; if(s.pipe==='company'){ cur={key:s.key,val:s.val}; showCompany(s.idx,true); } else if(s.pipe==='group'){ showGroup(s.key,s.val,true); } else { showHome(true); } });
  window.addEventListener('hashchange',function(){ if(location.hash!=='#pipeline')showHome(true); });
  // ---- search across all companies
  var sIn=$('pipeSearch'), sOut=$('pipeSearchResults');
  if(sIn){ var doSearch=function(){ var q=sIn.value.trim().toLowerCase(); if(!q){ sOut.hidden=true; sOut.innerHTML=''; return; }
      var hits=OPPS().map(function(o,i){o._i=i;return o}).filter(function(o){ return [o.project,o.gc,o.contact,o.metro,o.trade,o.location,o.status,o.projectType].join(' ').toLowerCase().indexOf(q)>=0; }).slice(0,30);
      sOut.innerHTML=hits.length?hits.map(function(o){ return '<div class="sr-item" role="button" tabindex="0" data-sr="'+o._i+'"><div><div class="t">'+esc(o.project)+'</div><div class="m">'+esc([o.metro,o.trade,o.contact].filter(Boolean).join(' · '))+'</div></div><div style="text-align:right"><span class="'+stageCls(o.stage)+'">'+esc(o.stage)+'</span><div class="m mono">'+(o.value?money(o.value):'')+'</div></div></div>'; }).join('')+(hits.length===30?'<div class="m" style="padding:8px 14px">Showing first 30 — keep typing to narrow.</div>':''):'<div class="sr-item"><div class="m">No companies match "'+esc(sIn.value)+'".</div></div>';
      sOut.hidden=false; };
    sIn.addEventListener('input',doSearch); sIn.addEventListener('focus',doSearch);
    sOut.addEventListener('click',function(e){ var r=e.target.closest('[data-sr]'); if(!r)return; sOut.hidden=true; sIn.value=''; cur={key:null,val:null}; showCompany(+r.dataset.sr); });
    sOut.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var r=e.target.closest('[data-sr]'); if(r){ sOut.hidden=true; sIn.value=''; showCompany(+r.dataset.sr); } } });
    document.addEventListener('click',function(e){ if(!e.target.closest('#pipeSearch,#pipeSearchResults')) sOut.hidden=true; });
    sIn.addEventListener('keydown',function(e){ if(e.key==='Escape'){ sOut.hidden=true; } });
  }
})();
