/* Shared: put a project into one broad project type from its words. Used by the Who's Working Where heat map. */
(function(root){
  var RULES=[
    ['Data center',/\bdata ?cent(er|re)s?\b|datacenter|hyperscale|\bai campus|\bcolo(cation)?\b/i],
    ['Education',/student housing|residence hall|\bdorm|universit|college|\bschool|\bk-12\b|academy|\bprep\b|institute|elementary|middle school|high school|\bisd\b|campus (?:center|recreation)|learning center|stem center|ut health|\butsa\b|\bucf\b|\busf\b|\blsu\b|\bfsu\b|\buab\b|\bunc\b|\btamu\b|clemson|classroom|hub on campus/i],
    ['Healthcare',/hospital|medical|health|clinic|surgery|surgical|cancer|oncology|patient|behavioral|rehab|pediatric|children's (?:hospital|health)|\bmob\b|emergency (?:dept|department)|freestanding ed|ambulatory|cardio|orthop|dental|\bva\b(?! ?beach)|veterans affairs|wellness center|mayo|baptist|adventhealth|methodist|memorial hermann|atrium|novant|prisma|piedmont|emory|ochsner|\bhca\b|baycare|\bmgh\b/i],
    ['Hospitality',/hotel|resort|casino|\binn\b|suites|marriott|hilton|hyatt|\bhampton\b|westin|sheraton|four seasons|ritz|kimpton|\bedition\b|\bmoxy\b|\baloft\b|hard rock|margaritaville|lodge|\bspa\b|gaylord|ballroom|cruise|carnival|caesars|peabody/i],
    ['Sports & convention',/stadium|arena|ballpark|field ?house|natatorium|convention|amphitheat|theat(er|re)|museum|aquarium|zoo|entertainment|\bsports?\b|athletic|performing arts|music hall|expo|fairgrounds|golf|racetrack|speedway|disney|universal|epcot|theme park|harry potter|cinema|regal\b|for the arts|music city center|training facility|recreation center|\bymca\b|playground|nascar|life field|circuit of the americas|amway|alerus|kia center|epic playgrand/i],
    ['Government & civic',/courthouse|city hall|county|federal|municipal|police|fire (?:station|rescue)|airport|terminal|concourse|\bport\b|military|army|navy|air force|\bafb\b|naval|\bbase\b|detention|jail|correction|library|post office|government|\bgsa\b|public safety|civic|special forces|fmcsa|transit|station\b|usace|embassy|capitol/i],
    ['Mixed-use',/mixed[- ]use|mixed use/i],
    ['Multifamily',/apartment|residences|residential|multifamily|multi-family|condo|lofts|\bliving\b|\bunits\b|townhome|senior|assisted|memory care|\bflats\b|tower(?:s)? (?:at|on)|housing|modera|skyhouse|presidium|\bthe laura\b/i],
    ['Office',/office|headquarters|\bhq\b|corporate|workplace|tenant improvement|\bti\b|bank\b|financial center|tower\b/i],
    ['Industrial',/warehouse|distribution|manufactur|\bplant\b|factory|industrial|logistics|fulfillment|cold storage|\blab(oratory|s)?\b|semiconductor|battery|refinery|process|pharma|food|boeing|aeronaut|aerospace|assembly building|wafer|solid dose|technology center|l3harris|lockheed/i],
    ['Retail',/retail|\bmall\b|store|shopping|restaurant|grocery|publix|walmart|target|costco|dealership|\bauto\b|outlet|market\b|starbucks|chick-fil-a|kitchen|burger|saloon|\bbar\b|grill|cafe/i],
    ['Religious',/church|chapel|cathedral|synagogue|temple|mosque|ministr/i]
  ];
  var RADAR={'Healthcare':'Healthcare','Hotel':'Hospitality','Mixed-use/High-rise':'Mixed-use','Multifamily':'Multifamily','Higher-ed':'Education','Convention center':'Sports & convention','Office':'Office','Government':'Government & civic','Data center':'Data center'};
  function classify(text, hint){
    if(hint && RADAR[hint]) return RADAR[hint];
    var t=String(text||'');
    for(var i=0;i<RULES.length;i++) if(RULES[i][1].test(t)) return RULES[i][0];
    return 'Other';
  }
  classify.TYPES=RULES.map(function(r){return r[0]}).filter(function(x){return x!=='Religious'}).concat(['Other']);
  root.BDP_CLASSIFY=classify;
  if(typeof module!=='undefined') module.exports=classify;
})(typeof window!=='undefined'?window:globalThis);
