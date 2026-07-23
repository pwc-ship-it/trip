/* ════════════════════════════════════════════
   인원 출장일 관리
════════════════════════════════════════════ */

var REGION_AMERICAS_IDS=['ESHD','ESMI','ESHG','MILS','UC2','현대JV','BOSK_TN'];
var REGION_CANADA_IDS=['ESOT'];
var REGION_EUROPE_IDS=['WA','ESWA'];
var REGION_CHINA_IDS=[];
var REGION_VIETNAM_IDS=[];

function getSiteRegion(siteId){
  // 사이트 데이터에 region 필드가 있으면 우선 사용
  var site=S.sites.find(function(s){return s.id===siteId;});
  if(site&&site.region) return site.region;
  // 하위 호환: 하드코딩 배열
  var sid=(siteId||'').toUpperCase();
  if(REGION_AMERICAS_IDS.map(function(x){return x.toUpperCase();}).indexOf(sid)>=0) return 'americas';
  if(REGION_CANADA_IDS.map(function(x){return x.toUpperCase();}).indexOf(sid)>=0)   return 'canada';
  if(REGION_EUROPE_IDS.map(function(x){return x.toUpperCase();}).indexOf(sid)>=0)   return 'europe';
  return 'other';
}

function calcOverlapDays(start,end,rangeStart,rangeEnd){
  var s=pd(start),e=pd(end);
  if(rangeStart) s=new Date(Math.max(s,pd(rangeStart)));
  if(rangeEnd)   e=new Date(Math.min(e,pd(rangeEnd)));
  if(s>e) return 0;
  return Math.round((e-s)/86400000)+1;
}

function getRolling12(){
  var end=new Date(TODAY);
  var start=new Date(TODAY.getFullYear()-1,TODAY.getMonth(),TODAY.getDate());
  start.setHours(0,0,0,0); end.setHours(0,0,0,0);
  return {start:start,end:end};
}

function getRolling180(){
  var end=new Date(TODAY);
  var start=new Date(TODAY);
  start.setDate(start.getDate()-179);
  start.setHours(0,0,0,0); end.setHours(0,0,0,0);
  return {start:start,end:end};
}

function getMaxSingleStay(trips, region, window){
  var max=0;
  trips.filter(function(t){return t.region===region;}).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),window.start));
    var e=new Date(Math.min(pd(t.end),window.end));
    if(s>e) return;
    var days=Math.round((e-s)/86400000)+1;
    if(days>max) max=days;
  });
  return max;
}

function escAttr(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showRiskTooltip(el){
  var text=el.getAttribute('data-tooltip');
  if(!text) return;
  var tip=document.getElementById('riskTooltip');
  if(!tip){
    tip=document.createElement('div');
    tip.id='riskTooltip';
    document.body.appendChild(tip);
  }
  tip.textContent=text;
  tip.style.display='block';
  var rect=el.getBoundingClientRect();
  var tw=tip.offsetWidth, th=tip.offsetHeight;
  var left=rect.left+rect.width/2-tw/2;
  left=Math.max(8,Math.min(left,window.innerWidth-tw-8));
  var top=rect.top-th-6;
  if(top<8) top=rect.bottom+6;
  tip.style.left=left+'px';
  tip.style.top=top+'px';
}
function hideRiskTooltip(){
  var tip=document.getElementById('riskTooltip');
  if(tip) tip.style.display='none';
}

function fmtDate(d){
  return d.getFullYear()+'.'
    +String(d.getMonth()+1).padStart(2,'0')+'.'
    +String(d.getDate()).padStart(2,'0');
}

// 특정 지역 12M 누적이 targetDays 미만으로 떨어지는 최초 날짜 + 그날 이후 연속 가능 일수 (공통)
function calcNextSafeDateForRegion(trips, region, targetDays, extraRegion){
  var r365=getRolling12();
  var usedSet={};
  trips.filter(function(t){return t.region===region||(extraRegion&&t.region===extraRegion);}).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),r365.start));
    var e=new Date(Math.min(pd(t.end),r365.end));
    if(s>e) return;
    for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
      usedSet[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=new Date(cur);
  });
  var sorted=Object.keys(usedSet).map(function(k){return usedSet[k];})
    .sort(function(a,b){return a-b;});
  var days=sorted.length;
  if(days<targetDays) return null;
  var anchorDate=sorted[days-targetDays];
  var next=new Date(anchorDate);
  next.setDate(next.getDate()+365);
  var consecutiveDays=1;
  for(var i=days-targetDays+1;i<days;i++){
    if(Math.round((sorted[i]-sorted[i-1])/86400000)===1) consecutiveDays++;
    else break;
  }
  return {date:next,consecutiveDays:consecutiveDays};
}
// 미주 전용 래퍼 (하위 호환)
function calcUsNextSafeDate(trips, targetDays, inclCanada){
  return calcNextSafeDateForRegion(trips,'americas',targetDays,inclCanada?'canada':null);
}

// 롤링 12개월 창 안에서 해외 체류일을 뺀 국내 체류일
function calcKoreaDays12M(trips, rolling12){
  var overseas={};
  trips.filter(function(t){return t.region!=='korea';}).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),rolling12.start));
    var e=new Date(Math.min(pd(t.end),rolling12.end));
    if(s>e) return;
    for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
      overseas[cur.toDateString()]=true;
  });
  var windowDays=Math.round((rolling12.end-rolling12.start)/86400000)+1;
  return windowDays-Object.keys(overseas).length;
}

// 롤링 12개월 창 안에서 모든 지역 합산 해외 체류일
function calcTotalOverseas12M(trips, rolling12){
  var set={};
  trips.filter(function(t){return t.region!=='korea';}).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),rolling12.start));
    var e=new Date(Math.min(pd(t.end),rolling12.end));
    if(s>e) return;
    for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
      set[cur.toDateString()]=true;
  });
  return Object.keys(set).length;
}

// 현재 연속 국내 체류일 (기존 calcKoreaDays와 동일 로직, 이름만 명확화)
function calcCurrentKoreaDays(trips){
  if(!trips||!trips.length) return 0;
  var pastTrips=trips.filter(function(t){return pd(t.end)<=TODAY;});
  if(!pastTrips.length) return 0;
  var lastEnd=pastTrips.reduce(function(mx,t){return pd(t.end)>pd(mx)?t.end:mx;},pastTrips[0].end);
  var onTrip=trips.some(function(t){return t.region!=='korea'&&TODAY>=pd(t.start)&&TODAY<=pd(t.end);});
  if(onTrip) return 0;
  var returnDay=new Date(pd(lastEnd));
  returnDay.setDate(returnDay.getDate()+1);
  if(returnDay>TODAY) return 0;
  return Math.round((TODAY-returnDay)/86400000)+1;
}

function aggregatePersonTrips(){
  var persons={};
  S.schedules.forEach(function(sc){
    // 인원 출장일 탭은 숨김 여부와 무관하게 모든 일정 집계
    var proj=S.projects.find(function(p){return p.id===sc.projectId;});
    if(!proj) return;
    var site=S.sites.find(function(s){return s.id===proj.siteId;});
    var siteId=proj.siteId;
    var siteName=site?site.name:siteId;
    var siteColor=site?site.color:'#555';
    var region=sc.domestic?'korea':getSiteRegion(siteId);
    var s=pd(sc.start),e=pd(sc.end);
    var status=TODAY>e?'done':(TODAY>=s?'going':'plan');
    var key=sc.name;
    if(!persons[key]) persons[key]={name:sc.name,type:sc.type,trips:[]};
    var typePri={hq:6,tech:5,vision:4,host:3,outsource:2,localOutsource:1};
    if((typePri[sc.type]||0)>(typePri[persons[key].type]||0)) persons[key].type=sc.type;
    // 출장 원래 type 기록 (인원에 복수 타입 있을 수 있음)
    if(!persons[key].types) persons[key].types={};
    persons[key].types[sc.type]=true;
    persons[key].trips.push({
      siteId:siteId,siteName:siteName,siteColor:siteColor,
      region:region,start:sc.start,end:sc.end,
      days:dd(sc.start,sc.end),status:status,task:sc.task,note:sc.note,
      domestic:sc.domestic||false
    });
  });
  Object.keys(persons).forEach(function(k){
    persons[k].trips.sort(function(a,b){return a.start>b.start?1:-1;});
  });
  return persons;
}

// 사이트별 Total 출장일수 집계 (전체/본사/외주, 기간별)
// period: 'all'(전체 기간) | 'year'(올해) | 'r12'(최근 12개월)
function aggregateSiteDays(period){
  var rangeStart=null, rangeEnd=null;
  if(period==='year'){
    rangeStart=new Date(TODAY.getFullYear(),0,1);
    rangeEnd=new Date(TODAY.getFullYear(),11,31);
  }else if(period==='r12'){
    var r12=getRolling12();
    rangeStart=r12.start; rangeEnd=r12.end;
  }

  var siteMap={}; // siteId -> {siteId,name,color,groupId,total,hq,out,local,names:{}}
  S.schedules.forEach(function(sc){
    if(!_pmSiteTypeFilter[sc.type]) return;
    var proj=S.projects.find(function(p){return p.id===sc.projectId;});
    if(!proj) return;
    var site=S.sites.find(function(s){return s.id===proj.siteId;});
    if(!site) return;
    var days=rangeStart?calcOverlapDays(sc.start,sc.end,rangeStart,rangeEnd):dd(sc.start,sc.end);
    if(days<=0) return;
    var siteId=site.id;
    if(!siteMap[siteId]) siteMap[siteId]={siteId:siteId,name:site.name,color:site.color,groupId:site.groupId,total:0,hq:0,out:0,local:0,names:{}};
    var entry=siteMap[siteId];
    entry.total+=days;
    if(sc.type==='outsource') entry.out+=days;
    else if(sc.type==='localOutsource') entry.local+=days;
    else entry.hq+=days;
    entry.names[sc.name]=true;
  });

  var groupOrder=S.groups.map(function(g){return g.id;});
  var siteList=Object.keys(siteMap).map(function(id){
    var e=siteMap[id];
    return {siteId:e.siteId,name:e.name,color:e.color,groupId:e.groupId,
      total:e.total,hq:e.hq,out:e.out,local:e.local,personCount:Object.keys(e.names).length};
  });
  siteList.sort(function(a,b){
    var gi=groupOrder.indexOf(a.groupId)-groupOrder.indexOf(b.groupId);
    if(gi!==0) return gi;
    return b.total-a.total;
  });

  var groups=[];
  siteList.forEach(function(s){
    var g=groups[groups.length-1];
    if(!g||g.groupId!==s.groupId){
      var gInfo=S.groups.find(function(x){return x.id===s.groupId;});
      g={groupId:s.groupId,groupName:gInfo?gInfo.name:(s.groupId||'미분류'),sites:[]};
      groups.push(g);
    }
    g.sites.push(s);
  });

  var grand={total:0,hq:0,out:0,local:0,names:{}};
  Object.keys(siteMap).forEach(function(id){
    grand.total+=siteMap[id].total; grand.hq+=siteMap[id].hq; grand.out+=siteMap[id].out; grand.local+=siteMap[id].local;
    Object.keys(siteMap[id].names).forEach(function(n){grand.names[n]=true;});
  });

  return {groups:groups,grandTotal:grand.total,grandHq:grand.hq,grandOut:grand.out,grandLocal:grand.local,grandPersons:Object.keys(grand.names).length};
}

// rolling 12M 기준 지역별 출장일 (중복 날짜 제거)
function calcRegionDays12M(trips, region, rolling12){
  var set={};
  trips.filter(function(t){return t.region===region;}).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),rolling12.start));
    var e=new Date(Math.min(pd(t.end),rolling12.end));
    if(s>e) return;
    for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1)){
      set[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=true;
    }
  });
  return Object.keys(set).length;
}

function calcSchengenRisk(trips){
  var r180=getRolling180();
  var usedDays=calcRegionDays12M(trips,'europe',r180);
  var remaining=90-usedDays;
  var status, tooltip;

  if(remaining<=0){
    var usedDateSet={};
    trips.filter(function(t){return t.region==='europe';}).forEach(function(t){
      var s=new Date(Math.max(pd(t.start),r180.start));
      var e=new Date(Math.min(pd(t.end),r180.end));
      if(s>e) return;
      for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
        usedDateSet[cur.toDateString()]=new Date(cur);
    });
    var sorted=Object.keys(usedDateSet).map(function(k){return usedDateSet[k];})
      .sort(function(a,b){return a-b;});
    var anchorDate=sorted[usedDays-90]||sorted[0];
    var nextEntry=new Date(anchorDate);
    nextEntry.setDate(nextEntry.getDate()+180);
    var ne=nextEntry.getFullYear()+'.'
      +String(nextEntry.getMonth()+1).padStart(2,'0')+'.'
      +String(nextEntry.getDate()).padStart(2,'0');
    status='danger';
    tooltip='솅겐 90일 초과 (사용 '+usedDays+'일). 재입국 가능: '+ne;
  } else if(remaining<=14){
    status='warn';
    tooltip='솅겐 잔여 '+remaining+'일 (사용 '+usedDays+'/90일)';
  } else {
    status='safe';
    tooltip=usedDays>0
      ?'솅겐 잔여 '+remaining+'일 (사용 '+usedDays+'/90일)'
      :'유럽 체류 이력 없음';
  }
  var subText;
  if(status==='danger')        subText='재입국 '+ne;
  else if(usedDays>0)          subText='잔여 '+remaining+'일 / 90일';
  else                         subText='-';
  return {status:status,usedDays:usedDays,remaining:remaining,tooltip:tooltip,subText:subText};
}

// 중국: 1회 90일 / 연 183일 (세금 거주자 기준)
var CN_GUIDE_SINGLE=90;
var CN_GUIDE_ANNUAL=183;

function calcChinaRisk(trips){
  var r365=getRolling12();
  var cnDays=calcRegionDays12M(trips,'china',r365);
  var maxSingle=getMaxSingleStay(trips,'china',r365);
  var status='safe', reasons=[];

  if(cnDays>=CN_GUIDE_ANNUAL){
    status='danger';
    reasons.push('연 누적 '+cnDays+'일 ('+CN_GUIDE_ANNUAL+'일 이상, 세금거주자)');
  }
  if(maxSingle>CN_GUIDE_SINGLE){
    status='danger';
    reasons.push('단일 체류 '+maxSingle+'일 ('+CN_GUIDE_SINGLE+'일 초과, 취업허가 필요)');
  }
  if(status!=='danger'){
    if(cnDays>=Math.round(CN_GUIDE_ANNUAL*0.8)){
      status='warn';
      reasons.push('연 누적 '+cnDays+'일 (한도 '+CN_GUIDE_ANNUAL+'일의 80%)');
    }
    if(maxSingle>=Math.round(CN_GUIDE_SINGLE*0.8)){
      if(status==='safe') status='warn';
      reasons.push('단일 체류 '+maxSingle+'일 (한도 '+CN_GUIDE_SINGLE+'일의 80%)');
    }
  }
  var tooltip=reasons.length?reasons.join(' | '):'이상 없음 (중국 '+cnDays+'일 / 연 한도 '+CN_GUIDE_ANNUAL+'일)';
  var subText='누적 '+cnDays+'/'+CN_GUIDE_ANNUAL+'일';
  return {status:status,cnDays:cnDays,maxSingle:maxSingle,tooltip:tooltip,subText:subText};
}

// 베트남: 1회 90일 / 연 183일 (세금 거주자 기준)
var VN_GUIDE_SINGLE=90;
var VN_GUIDE_ANNUAL=183;

function calcVietnamRisk(trips){
  var r365=getRolling12();
  var vnDays=calcRegionDays12M(trips,'vietnam',r365);
  var maxSingle=getMaxSingleStay(trips,'vietnam',r365);
  var status='safe', reasons=[];

  if(vnDays>=VN_GUIDE_ANNUAL){
    status='danger';
    reasons.push('연 누적 '+vnDays+'일 ('+VN_GUIDE_ANNUAL+'일 이상, 세금거주자)');
  }
  if(maxSingle>VN_GUIDE_SINGLE){
    status='danger';
    reasons.push('단일 체류 '+maxSingle+'일 ('+VN_GUIDE_SINGLE+'일 초과, 취업허가 필요)');
  }
  if(status!=='danger'){
    if(vnDays>=Math.round(VN_GUIDE_ANNUAL*0.8)){
      status='warn';
      reasons.push('연 누적 '+vnDays+'일 (한도 '+VN_GUIDE_ANNUAL+'일의 80%)');
    }
    if(maxSingle>=Math.round(VN_GUIDE_SINGLE*0.8)){
      if(status==='safe') status='warn';
      reasons.push('단일 체류 '+maxSingle+'일 (한도 '+VN_GUIDE_SINGLE+'일의 80%)');
    }
  }
  var tooltip=reasons.length?reasons.join(' | '):'이상 없음 (베트남 '+vnDays+'일 / 연 한도 '+VN_GUIDE_ANNUAL+'일)';
  var subText='누적 '+vnDays+'/'+VN_GUIDE_ANNUAL+'일';
  return {status:status,vnDays:vnDays,maxSingle:maxSingle,tooltip:tooltip,subText:subText};
}

// 고객사 가이드: 1회 90일 / 연 150일 한도
var US_GUIDE_SINGLE=90;   // 1회 최대 체류일
var US_GUIDE_ANNUAL=150;  // 연간 최대 누적 체류일
var CA_GUIDE_SINGLE=90;   // 캐나다 1회 최대 체류일
var CA_GUIDE_ANNUAL=150;  // 캐나다 연간 최대 누적 체류일

function calcUsRisk(trips){
  var r365=getRolling12();
  var amDays=calcRegionDays12M(trips,'americas',r365);
  var totalOverseaDays=calcTotalOverseas12M(trips,r365);
  var koreaDays=calcKoreaDays12M(trips,r365);
  var maxSingle=getMaxSingleStay(trips,'americas',r365);

  var status='safe', reasons=[];

  // 위험: 고객사 가이드 한도 초과
  if(amDays>US_GUIDE_ANNUAL){
    status='danger';
    reasons.push('12M 누적 '+amDays+'일 (한도 '+US_GUIDE_ANNUAL+'일 초과)');
  }
  if(maxSingle>US_GUIDE_SINGLE){
    status='danger';
    reasons.push('단일 체류 '+maxSingle+'일 (한도 '+US_GUIDE_SINGLE+'일 초과)');
  }

  if(status!=='danger'){
    // 주의: 한도 80% 이상
    if(amDays>=Math.round(US_GUIDE_ANNUAL*0.8)){
      status='warn';
      reasons.push('12M 누적 '+amDays+'일 (한도 '+US_GUIDE_ANNUAL+'일의 80%)');
    }
    if(amDays>koreaDays){
      if(status==='safe') status='warn';
      reasons.push('미주 '+amDays+'일 > 한국 '+koreaDays+'일 (거주 의심)');
    }
    if(maxSingle>=Math.round(US_GUIDE_SINGLE*0.8)){
      if(status==='safe') status='warn';
      reasons.push('단일 체류 '+maxSingle+'일 (한도 '+US_GUIDE_SINGLE+'일의 80%)');
    }
    // 전체 해외 체류 과다: 미국 입국심사 "immigrant intent" 우려
    if(totalOverseaDays>270&&amDays>0){
      if(status==='safe') status='warn';
      reasons.push('전체 해외 '+totalOverseaDays+'일 (미국 외 포함 — 입국심사 거주 의심 가능)');
    }
  }

  var tooltip=reasons.length
    ?reasons.join(' | ')
    :'이상 없음 (미주 '+amDays+'일 / 연 한도 '+US_GUIDE_ANNUAL+'일)';

  var subText='12M 누적 '+amDays+'/'+US_GUIDE_ANNUAL+'일';
  if(amDays>US_GUIDE_ANNUAL){
    var nd=calcUsNextSafeDate(trips,US_GUIDE_ANNUAL);
    if(nd){
      var c=nd.consecutiveDays;
      subText+=' · '+fmtDate(nd.date)+'부터 '+c+'일 가능';
    }
  } else if(amDays>=Math.round(US_GUIDE_ANNUAL*0.8)){
    var nd=calcUsNextSafeDate(trips,US_GUIDE_ANNUAL);
    if(nd){
      var c=nd.consecutiveDays;
      subText+=' · '+fmtDate(nd.date)+'부터 '+c+'일 가능';
    }
  }

  return {status:status,amDays:amDays,maxSingle:maxSingle,tooltip:tooltip,subText:subText};
}

// 마지막 복귀일 기준 한국 체류일 계산
// 가장 최근 출장 종료일(복귀일) 다음날부터 오늘까지의 일수
function calcKoreaDays(trips){
  if(!trips||!trips.length) return 0;
  // 종료된 출장 중 가장 최근 복귀일 찾기
  var pastTrips=trips.filter(function(t){return pd(t.end)<=TODAY;});
  if(!pastTrips.length){
    // 아직 출장 간 적 없으면 → 0
    return 0;
  }
  // 가장 최근 복귀일
  var lastEnd=pastTrips.reduce(function(mx,t){
    return pd(t.end)>pd(mx)?t.end:mx;
  }, pastTrips[0].end);
  var lastEndDate=pd(lastEnd);
  // 현재 출장 중이면 한국 체류 0일
  var onTrip=trips.some(function(t){return TODAY>=pd(t.start)&&TODAY<=pd(t.end);});
  if(onTrip) return 0;
  // 복귀일 다음날부터 오늘까지
  var returnDay=new Date(lastEndDate);
  returnDay.setDate(returnDay.getDate()+1);
  if(returnDay>TODAY) return 0;
  return Math.round((TODAY-returnDay)/86400000)+1;
}

function getCurrentLocation(trips){
  for(var i=0;i<trips.length;i++){
    var t=trips[i];
    if(TODAY>=pd(t.start)&&TODAY<=pd(t.end)){
      return {onTrip:true,siteName:t.siteName,siteColor:t.siteColor,region:t.region,endDate:t.end};
    }
  }
  return {onTrip:false};
}

function statusHtml(st){
  if(st==='going') return '<span class="pm-trip-status status-going">출장중</span>';
  if(st==='plan')  return '<span class="pm-trip-status status-plan">예정</span>';
  return '<span class="pm-trip-status status-done">완료</span>';
}

// ── 상태 변수
var _pmFilter='all';          // 상태 필터: all | going | home
var _pmSearch='';             // 이름 검색
var _pmSortKey='name';        // 정렬 기준: name | americas | europe | total | korea12m | koreaCur
var _pmSortAsc=true;          // 정렬 방향
var _pmTypeFilter={hq:true,outsource:true,tech:true,vision:true,host:true,localOutsource:true}; // 인원유형 체크
var _pmExpanded={};           // 행 펼침 상태: { '이름': true }
var _pmSitePeriod='all';      // 사이트별 출장일 집계 기간: all | year | r12
var _pmSiteCollapsed=true;    // 사이트별 출장일 요약 접기 상태 (기본 접힘)
var _pmSiteTypeFilter={hq:true,outsource:true,tech:true,vision:true,host:true,localOutsource:true}; // 사이트별 요약 인원유형 체크

function setPmFilter(f){ _pmFilter=f; renderPersonTab(); }
function setPmSearch(v){
  _pmSearch=v.toLowerCase();
  renderPersonBody();
}
function setPmSort(key){
  if(_pmSortKey===key) _pmSortAsc=!_pmSortAsc;
  else { _pmSortKey=key; _pmSortAsc=key==='name'; }
  renderPersonBody();
}
function togglePersonExpand(name){
  _pmExpanded[name]=!_pmExpanded[name];
  renderPersonBody();
}
function togglePmType(type){
  _pmTypeFilter[type]=!_pmTypeFilter[type];
  renderPersonBody();
}
function setPmSitePeriod(p){
  _pmSitePeriod=p;
  var el=document.getElementById('pmSiteDaysWrap');
  if(el) el.outerHTML=renderSiteDaysSummary();
}
function togglePmSiteCollapse(){
  _pmSiteCollapsed=!_pmSiteCollapsed;
  var el=document.getElementById('pmSiteDaysWrap');
  if(el) el.outerHTML=renderSiteDaysSummary();
}
function toggleSiteTypeFilter(type){
  _pmSiteTypeFilter[type]=!_pmSiteTypeFilter[type];
  var el=document.getElementById('pmSiteDaysWrap');
  if(el) el.outerHTML=renderSiteDaysSummary();
}

function pfRegionChange(val){
  var wrap=document.getElementById('pfCanadaWrap');
  if(wrap) wrap.style.display=(val==='americas'?'inline-flex':'none');
}

// 예정 출장 기간의 실제 일수를 계산 (기존 이력과 중복 제거)
// extraRegions: 추가로 합산할 region 배열 (예: ['canada'])
function calcFeasibleDays(trips, region, planStart, planEnd, windowDays, extraRegions){
  // 예정 종료일 기준 rolling window
  var winEnd=pd(planEnd);
  var winStart=new Date(winEnd);
  winStart.setDate(winStart.getDate()-(windowDays-1));
  var rolling={start:winStart,end:winEnd};
  // 기존 체류일
  var existSet={};
  trips.filter(function(t){
    return t.region===region||(extraRegions&&extraRegions.indexOf(t.region)>=0);
  }).forEach(function(t){
    var s=new Date(Math.max(pd(t.start),rolling.start));
    var e=new Date(Math.min(pd(t.end),rolling.end));
    if(s>e) return;
    for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
      existSet[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=true;
  });
  // 예정 출장 추가
  var allSet=JSON.parse(JSON.stringify(existSet));
  var ps=new Date(Math.max(pd(planStart),rolling.start));
  var pe=new Date(Math.min(pd(planEnd),rolling.end));
  if(ps<=pe){
    for(var cur=new Date(ps);cur<=pe;cur.setDate(cur.getDate()+1))
      allSet[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=true;
  }
  return {existing:Object.keys(existSet).length,total:Object.keys(allSet).length,added:Object.keys(allSet).length-Object.keys(existSet).length};
}

// 출장 가능 시점: planDays 기간의 출장이 limit 이하가 되는 최초 날짜 탐색 (내일부터 최대 2년)
function calcNextFeasibleDate(trips, region, planDays, windowDays, limit, extraRegions){
  var s=new Date(TODAY);s.setDate(s.getDate()+1);
  for(var i=0;i<730;i++){
    var ts=new Date(s);ts.setDate(ts.getDate()+i);
    var te=new Date(ts);te.setDate(te.getDate()+planDays-1);
    var ss=ts.getFullYear()+'-'+String(ts.getMonth()+1).padStart(2,'0')+'-'+String(ts.getDate()).padStart(2,'0');
    var es=te.getFullYear()+'-'+String(te.getMonth()+1).padStart(2,'0')+'-'+String(te.getDate()).padStart(2,'0');
    var r=calcFeasibleDays(trips,region,ss,es,windowDays,extraRegions);
    if(r.total<=limit) return ts;
  }
  return null;
}

function runFeasibilityCheck(){
  var personName=document.getElementById('pfPerson').value;
  var region=document.getElementById('pfRegion').value;
  var start=document.getElementById('pfStart').value;
  var end=document.getElementById('pfEnd').value;
  var resultEl=document.getElementById('pfResult');
  if(!resultEl) return;

  if(!personName||!start||!end){resultEl.innerHTML='<span style="color:#e8a020">인원, 출발일, 귀국일을 모두 입력하세요.</span>';return;}
  if(start>end){resultEl.innerHTML='<span style="color:#e84040">귀국일이 출발일보다 빠릅니다.</span>';return;}

  var allPersons=aggregatePersonTrips();
  var person=allPersons[personName];
  if(!person){resultEl.innerHTML='<span style="color:#e84040">해당 인원이 없습니다.</span>';return;}

  var planDays=dd(start,end);
  var regionLabel={americas:'미국',europe:'유럽(솅겐)',china:'중국',vietnam:'베트남'}[region]||region;
  var html='';

  if(region==='americas'){
    var inclCanada=document.getElementById('pfCanada')&&document.getElementById('pfCanada').checked;
    var baseLabel=inclCanada?'미국+캐나다 합산 기준':'미국 기준';
    var singleOk=planDays<=US_GUIDE_SINGLE;
    var singleWarn=planDays>Math.round(US_GUIDE_SINGLE*0.8);
    // 오늘 기준 12M 롤링 누적 (테이블 미국 가이드와 동일 방식)
    var r365=getRolling12();
    var curSet={};
    person.trips.filter(function(t){return t.region==='americas'||(inclCanada&&t.region==='canada');}).forEach(function(t){
      var s=new Date(Math.max(pd(t.start),r365.start));
      var e=new Date(Math.min(pd(t.end),r365.end));
      if(s>e) return;
      for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
        curSet[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=true;
    });
    var currentDays=Object.keys(curSet).length;
    var annualOver=currentDays>US_GUIDE_ANNUAL;
    var tripTotal=currentDays+planDays;
    var annualWarn=!annualOver&&(tripTotal>Math.round(US_GUIDE_ANNUAL*0.8));
    if(!singleOk){
      // 1회 체류 한도 초과 — 무조건 불가
      html='<span class="pm-feasible-badge pm-feasible-ng">불가</span>';
      html+='<span style="color:#e84040;font-size:11px"> 1회 한도 초과 ('+planDays+'일 > '+US_GUIDE_SINGLE+'일). <span style="color:#666">('+baseLabel+')</span></span>';
    } else if(annualOver){
      // 오늘 기준 12M 초과 — 요청 날짜 기준으로 3가지 케이스 구별
      var nd=calcUsNextSafeDate(person.trips,US_GUIDE_ANNUAL,inclCanada);
      if(!nd||planDays>nd.consecutiveDays){
        // ① 진짜 불가: 가능한 날 없거나 요청 일수가 연속 가용일 초과
        html='<span class="pm-feasible-badge pm-feasible-ng">불가</span>';
        html+='<span style="color:#e84040;font-size:11px"> 12M 누적 '+currentDays+'일 > 한도 '+US_GUIDE_ANNUAL+'일.';
        if(nd) html+=' (최대 가능: '+nd.consecutiveDays+'일)';
        html+=' <span style="color:#666">('+baseLabel+')</span></span>';
        var nextDate=calcNextFeasibleDate(person.trips,'americas',planDays,365,US_GUIDE_ANNUAL,inclCanada?['canada']:null);
        if(nextDate) html+='<br><span style="color:#a0a0a8;font-size:11px"> 출장 가능 시점: '+fmtDate(nextDate)+'</span>';
      } else if(pd(start)>=nd.date){
        // ② 가능: 요청 시작일이 이미 가능 기간 안에 있음
        html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
        html+='<span style="color:#4aaa70;font-size:11px"> 12M 누적 '+currentDays+'일 (현재 초과, 출장 시작일 기준 해소). ';
        html+=fmtDate(nd.date)+'부터 '+nd.consecutiveDays+'일 가능 · 이번 출장('+planDays+'일) 가능';
        html+=' <span style="color:#666">('+baseLabel+')</span></span>';
      } else {
        // ③ 날짜 조정: 시작일만 조정하면 가능 (오늘은 초과지만 곧 해소)
        html='<span class="pm-feasible-badge pm-feasible-warn">날짜 조정</span>';
        html+='<span style="color:#e8a020;font-size:11px"> 12M 누적 '+currentDays+'일 > 한도 '+US_GUIDE_ANNUAL+'일. ';
        html+='출장 가능 시작: '+fmtDate(nd.date)+'부터 '+nd.consecutiveDays+'일 가능 · 이번 출장('+planDays+'일) 가능';
        html+=' <span style="color:#666">('+baseLabel+')</span></span>';
      }
    } else if(singleWarn||annualWarn||(tripTotal>US_GUIDE_ANNUAL)){
      html='<span class="pm-feasible-badge pm-feasible-warn">주의</span>';
      html+='<span style="color:#e8a020;font-size:11px"> 가능 (12M 누적 '+currentDays+'일 + 이번 출장 '+planDays+'일 = '+tripTotal+'/'+US_GUIDE_ANNUAL+'일). ';
      if(tripTotal>US_GUIDE_ANNUAL) html+='이번 출장 포함 시 '+(tripTotal-US_GUIDE_ANNUAL)+'일 초과. ';
      else html+='잔여 '+(US_GUIDE_ANNUAL-tripTotal)+'일. ';
      html+='<span style="color:#666">('+baseLabel+')</span></span>';
    } else {
      html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
      html+='<span style="color:#4aaa70;font-size:11px"> 12M 누적 '+currentDays+'일 + 이번 출장 '+planDays+'일 = '+tripTotal+'/'+US_GUIDE_ANNUAL+'일. 잔여 '+(US_GUIDE_ANNUAL-tripTotal)+'일 <span style="color:#666">('+baseLabel+')</span></span>';
    }
  } else if(region==='europe'){
    var r=calcFeasibleDays(person.trips,'europe',start,end,180);
    var ok=r.total<=90;
    var warn=r.total>76;
    if(!ok){
      html='<span class="pm-feasible-badge pm-feasible-ng">불가</span>';
      html+='<span style="color:#e84040;font-size:11px"> 솅겐 180일 기준 '+r.total+'일 (90일 초과). 현재 사용 '+r.existing+'/90일. 최대 가능: '+Math.max(0,90-r.existing)+'일</span>';
      var nextDate=calcNextFeasibleDate(person.trips,'europe',planDays,180,90,null);if(nextDate)html+='<br><span style="color:#a0a0a8;font-size:11px"> 출장 가능 시점: '+fmtDate(nextDate)+'</span>';
    } else if(warn){
      html='<span class="pm-feasible-badge pm-feasible-warn">주의</span>';
      html+='<span style="color:#e8a020;font-size:11px"> 가능 (솅겐 180일 기준 '+r.total+'/90일). 잔여 '+(90-r.total)+'일</span>';
    } else {
      html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
      html+='<span style="color:#4aaa70;font-size:11px"> 솅겐 180일 기준 '+r.total+'/90일. 잔여 '+(90-r.total)+'일</span>';
    }
  } else if(region==='china'){
    var r=calcFeasibleDays(person.trips,'china',start,end,365);
    var singleOk=planDays<=CN_GUIDE_SINGLE;
    var annualOk=r.total<CN_GUIDE_ANNUAL;
    var annualWarn=r.total>=Math.round(CN_GUIDE_ANNUAL*0.8);
    var singleWarn=planDays>=Math.round(CN_GUIDE_SINGLE*0.8);
    if(!singleOk||!annualOk){
      html='<span class="pm-feasible-badge pm-feasible-ng">위험</span>';
      html+='<span style="color:#e84040;font-size:11px"> ';
      if(!singleOk) html+='1회 한도 초과('+planDays+'/'+CN_GUIDE_SINGLE+'일). ';
      if(!annualOk) html+='연 세금거주자 도달('+r.total+'/'+CN_GUIDE_ANNUAL+'일). ';
      html+='</span>';
      if(!annualOk&&singleOk){var nextDate=calcNextFeasibleDate(person.trips,'china',planDays,365,CN_GUIDE_ANNUAL-1,null);if(nextDate)html+='<br><span style="color:#a0a0a8;font-size:11px"> 출장 가능 시점: '+fmtDate(nextDate)+'</span>';}
    } else if(singleWarn||annualWarn){
      html='<span class="pm-feasible-badge pm-feasible-warn">주의</span>';
      html+='<span style="color:#e8a020;font-size:11px"> 가능 (예정 포함 연 누적 '+r.total+'/'+CN_GUIDE_ANNUAL+'일, 이번 출장 '+planDays+'일)</span>';
    } else {
      html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
      html+='<span style="color:#4aaa70;font-size:11px"> 예정 포함 연 누적 '+r.total+'/'+CN_GUIDE_ANNUAL+'일. 이번 출장 '+planDays+'일</span>';
    }
  } else if(region==='vietnam'){
    var r=calcFeasibleDays(person.trips,'vietnam',start,end,365);
    var singleOk=planDays<=VN_GUIDE_SINGLE;
    var annualOk=r.total<VN_GUIDE_ANNUAL;
    var annualWarn=r.total>=Math.round(VN_GUIDE_ANNUAL*0.8);
    var singleWarn=planDays>=Math.round(VN_GUIDE_SINGLE*0.8);
    if(!singleOk||!annualOk){
      html='<span class="pm-feasible-badge pm-feasible-ng">위험</span>';
      html+='<span style="color:#e84040;font-size:11px"> ';
      if(!singleOk) html+='1회 한도 초과('+planDays+'/'+VN_GUIDE_SINGLE+'일). ';
      if(!annualOk) html+='연 세금거주자 도달('+r.total+'/'+VN_GUIDE_ANNUAL+'일). ';
      html+='</span>';
      if(!annualOk&&singleOk){var nextDate=calcNextFeasibleDate(person.trips,'vietnam',planDays,365,VN_GUIDE_ANNUAL-1,null);if(nextDate)html+='<br><span style="color:#a0a0a8;font-size:11px"> 출장 가능 시점: '+fmtDate(nextDate)+'</span>';}
    } else if(singleWarn||annualWarn){
      html='<span class="pm-feasible-badge pm-feasible-warn">주의</span>';
      html+='<span style="color:#e8a020;font-size:11px"> 가능 (예정 포함 연 누적 '+r.total+'/'+VN_GUIDE_ANNUAL+'일, 이번 출장 '+planDays+'일)</span>';
    } else {
      html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
      html+='<span style="color:#4aaa70;font-size:11px"> 예정 포함 연 누적 '+r.total+'/'+VN_GUIDE_ANNUAL+'일. 이번 출장 '+planDays+'일</span>';
    }
  } else if(region==='canada'){
    var singleOk=planDays<=CA_GUIDE_SINGLE;
    var singleWarn=planDays>Math.round(CA_GUIDE_SINGLE*0.8);
    var r365=getRolling12();
    var curSet={};
    person.trips.filter(function(t){return t.region==='canada';}).forEach(function(t){
      var s=new Date(Math.max(pd(t.start),r365.start));
      var e=new Date(Math.min(pd(t.end),r365.end));
      if(s>e) return;
      for(var cur=new Date(s);cur<=e;cur.setDate(cur.getDate()+1))
        curSet[cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate()]=true;
    });
    var currentDays=Object.keys(curSet).length;
    var annualOver=currentDays>CA_GUIDE_ANNUAL;
    var tripTotal=currentDays+planDays;
    var annualWarn=!annualOver&&(tripTotal>Math.round(CA_GUIDE_ANNUAL*0.8));
    if(!singleOk){
      html='<span class="pm-feasible-badge pm-feasible-ng">불가</span>';
      html+='<span style="color:#e84040;font-size:11px"> 1회 한도 초과 ('+planDays+'일 > '+CA_GUIDE_SINGLE+'일). (캐나다 기준)</span>';
    } else if(annualOver){
      var nd=calcNextSafeDateForRegion(person.trips,'canada',CA_GUIDE_ANNUAL,null);
      if(!nd||planDays>nd.consecutiveDays){
        html='<span class="pm-feasible-badge pm-feasible-ng">불가</span>';
        html+='<span style="color:#e84040;font-size:11px"> 12M 누적 '+currentDays+'일 > 한도 '+CA_GUIDE_ANNUAL+'일.';
        if(nd) html+=' (최대 가능: '+nd.consecutiveDays+'일)';
        html+=' (캐나다 기준)</span>';
      } else if(pd(start)>=nd.date){
        html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
        html+='<span style="color:#4aaa70;font-size:11px"> 12M 누적 '+currentDays+'일 (현재 초과, 출장 시작일 기준 해소). ';
        html+=fmtDate(nd.date)+'부터 '+nd.consecutiveDays+'일 가능 · 이번 출장('+planDays+'일) 가능 (캐나다 기준)</span>';
      } else {
        html='<span class="pm-feasible-badge pm-feasible-warn">날짜 조정</span>';
        html+='<span style="color:#e8a020;font-size:11px"> 12M 누적 '+currentDays+'일 > 한도 '+CA_GUIDE_ANNUAL+'일. ';
        html+='출장 가능 시작: '+fmtDate(nd.date)+'부터 '+nd.consecutiveDays+'일 가능 · 이번 출장('+planDays+'일) 가능 (캐나다 기준)</span>';
      }
    } else if(singleWarn||annualWarn||(tripTotal>CA_GUIDE_ANNUAL)){
      html='<span class="pm-feasible-badge pm-feasible-warn">주의</span>';
      html+='<span style="color:#e8a020;font-size:11px"> 가능 (12M 누적 '+currentDays+'일 + 이번 출장 '+planDays+'일 = '+tripTotal+'/'+CA_GUIDE_ANNUAL+'일). ';
      if(tripTotal>CA_GUIDE_ANNUAL) html+='이번 출장 포함 시 '+(tripTotal-CA_GUIDE_ANNUAL)+'일 초과. ';
      else html+='잔여 '+(CA_GUIDE_ANNUAL-tripTotal)+'일. ';
      html+='(캐나다 기준)</span>';
    } else {
      html='<span class="pm-feasible-badge pm-feasible-ok">가능</span>';
      html+='<span style="color:#4aaa70;font-size:11px"> 12M 누적 '+currentDays+'일 + 이번 출장 '+planDays+'일 = '+tripTotal+'/'+CA_GUIDE_ANNUAL+'일. 잔여 '+(CA_GUIDE_ANNUAL-tripTotal)+'일 (캐나다 기준)</span>';
    }
  }
  resultEl.innerHTML=html;
}

// 사이트별 Total 출장일수 요약 섹션 (전체/본사/외주)
function renderSiteDaysSummary(){
  var agg=aggregateSiteDays(_pmSitePeriod);
  var periods=[['all','전체'],['year','올해'],['r12','최근12개월']];
  var html='<div class="pm-site-days" id="pmSiteDaysWrap">';
  html+='<div class="pm-site-days-head">';
  html+='<span class="pm-site-days-title" onclick="togglePmSiteCollapse()" style="cursor:pointer">'
      +(_pmSiteCollapsed?'▶':'▼')+' 📍 사이트별 Total 출장일수</span>';
  html+='<div class="pm-ctrl-group" style="margin-left:auto">';
  periods.forEach(function(p){
    html+='<button class="pm-filter-btn'+(_pmSitePeriod===p[0]?' on':'')+'" onclick="setPmSitePeriod(\''+p[0]+'\')">'+p[1]+'</button>';
  });
  html+='</div></div>';

  if(!_pmSiteCollapsed){
    var siteTypeList=[['hq','본사',TYPE_COLOR.hq],['outsource','외주',TYPE_COLOR.outsource],['localOutsource','현지외주',TYPE_COLOR.localOutsource],['tech','기술',TYPE_COLOR.tech],['vision','비전',TYPE_COLOR.vision],['host','호스트',TYPE_COLOR.host]];
    html+='<div class="pm-ctrl-group" style="flex-wrap:wrap;gap:4px;padding:8px 12px 0 12px">';
    html+='<span style="font-size:10px;color:#555">인원</span>';
    siteTypeList.forEach(function(t){
      var isOn=_pmSiteTypeFilter[t[0]];
      html+='<label class="pm-type-ck'+(isOn?' on':'')+'" style="--tc:'+t[2]+';'+(isOn?'background:'+t[2]+'22;border-color:'+t[2]:'')+'"><input type="checkbox"'+(isOn?' checked':'')+' onchange="toggleSiteTypeFilter(\''+t[0]+'\')">'+t[1]+'</label>';
    });
    html+='</div>';

    if(!agg.groups.length){
      html+='<div style="padding:12px;color:var(--tx-muted);font-size:12px">해당 조건에 등록된 출장 일정이 없습니다.</div>';
    }else{
      html+='<table class="pm-person-table pm-site-days-table"><thead><tr>'
          +'<th>사이트</th><th>전체 출장일</th><th>본사</th><th>외주</th><th>현지외주</th><th>출장 인원수</th>'
          +'</tr></thead><tbody>';
      agg.groups.forEach(function(g){
        html+='<tr class="pm-site-group-row"><td colspan="6">'+_esc(g.groupName)+'</td></tr>';
        g.sites.forEach(function(s){
          var sidAttr=s.siteId.replace(/'/g,"\\'");
          html+='<tr>'
              +'<td onclick="openSiteRosterModal(\''+sidAttr+'\')" style="cursor:pointer"><span class="pm-site-chip" style="background:'+s.color+'"></span>'+_esc(s.name)+'</td>'
              +'<td>'+s.total+'일</td>'
              +'<td>'+s.hq+'일</td>'
              +'<td>'+s.out+'일</td>'
              +'<td>'+s.local+'일</td>'
              +'<td>'+s.personCount+'명</td>'
              +'</tr>';
        });
      });
      html+='<tr class="pm-site-total-row">'
          +'<td>합계</td><td>'+agg.grandTotal+'일</td><td>'+agg.grandHq+'일</td><td>'+agg.grandOut+'일</td><td>'+agg.grandLocal+'일</td><td>'+agg.grandPersons+'명</td>'
          +'</tr>';
      html+='</tbody></table>';
    }
  }
  html+='</div>';
  return html;
}

// 사이트 클릭 → 인원 로스터 모달 (현재 기간·인원구분 필터를 그대로 반영해 요약표와 대조 가능)
function openSiteRosterModal(siteId){
  var site=S.sites.find(function(s){return s.id===siteId;});
  if(!site) return;
  var period=_pmSitePeriod;
  var rangeStart=null, rangeEnd=null;
  if(period==='year'){ rangeStart=new Date(TODAY.getFullYear(),0,1); rangeEnd=new Date(TODAY.getFullYear(),11,31); }
  else if(period==='r12'){ var r12=getRolling12(); rangeStart=r12.start; rangeEnd=r12.end; }

  var rows=[];
  S.schedules.forEach(function(sc){
    if(!_pmSiteTypeFilter[sc.type]) return;
    var proj=S.projects.find(function(p){return p.id===sc.projectId;});
    if(!proj||proj.siteId!==siteId) return;
    var days=rangeStart?calcOverlapDays(sc.start,sc.end,rangeStart,rangeEnd):dd(sc.start,sc.end);
    if(days<=0) return;
    rows.push({name:sc.name,type:sc.type,task:sc.task||'',start:sc.start,end:sc.end,days:days});
  });
  rows.sort(function(a,b){return a.start>b.start?1:(a.start<b.start?-1:a.name.localeCompare(b.name,'ko'));});

  var total=rows.reduce(function(sum,r){return sum+r.days;},0);
  var body='<div class="mtit">'+_esc(site.name)+' — 인원 출장 로스터</div>';
  if(!rows.length){
    body+='<div style="padding:10px;color:var(--tx-muted);font-size:12px">해당 조건에 표시할 출장 기록이 없습니다.</div>';
  }else{
    body+='<div style="max-height:60vh;overflow-y:auto"><table class="pm-person-table"><thead><tr>'
        +'<th>이름</th><th>인원구분</th><th>업무</th><th>출발일</th><th>복귀일</th><th>일수</th>'
        +'</tr></thead><tbody>';
    rows.forEach(function(r){
      body+='<tr>'
          +'<td>'+_esc(r.name)+'</td>'
          +'<td>'+_esc(TYPE_LBL[r.type]||r.type)+'</td>'
          +'<td>'+_esc(r.task)+'</td>'
          +'<td>'+r.start+'</td>'
          +'<td>'+r.end+'</td>'
          +'<td>'+r.days+'일</td>'
          +'</tr>';
    });
    body+='<tr class="pm-site-total-row"><td colspan="5">합계</td><td>'+total+'일</td></tr>';
    body+='</tbody></table></div>';
  }
  body+='<div class="mfoot"><button class="btn sm" onclick="cm()">닫기</button></div>';
  mw(body,true);
}

// renderPersonTab : 전체 렌더 (탭 첫 진입, 지역필터 변경 시)
// renderPersonBody: 결과 테이블만 갱신 (검색·정렬·타입필터 변경 시 → 검색창 IME 유지)
function renderPersonTab(){
  var wrap=document.getElementById('pmWrap');
  if(!wrap) return;

  var allPersons=aggregatePersonTrips();
  var rolling12=getRolling12();
  var allNames=Object.keys(allPersons);

  var r12s=rolling12.start.getFullYear()+'.'+(rolling12.start.getMonth()+1)+'.'+rolling12.start.getDate();
  var r12e=rolling12.end.getFullYear()+'.'+(rolling12.end.getMonth()+1)+'.'+rolling12.end.getDate();

  var totalPersons=allNames.length;
  var onTripNow=allNames.filter(function(n){return getCurrentLocation(allPersons[n].trips).onTrip;}).length;
  var americasPersons=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='americas';});}).length;
  var europePersons=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='europe';});}).length;
  var chinaPersons=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='china';});}).length;
  var vietnamPersons=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='vietnam';});}).length;
  var isOut=function(t){return t==='outsource'||t==='localOutsource';};
  var totalHq=allNames.filter(function(n){return !isOut(allPersons[n].type);}).length;
  var totalOut=allNames.filter(function(n){return isOut(allPersons[n].type);}).length;
  var onTripHq=allNames.filter(function(n){return getCurrentLocation(allPersons[n].trips).onTrip&&!isOut(allPersons[n].type);}).length;
  var onTripOut=allNames.filter(function(n){return getCurrentLocation(allPersons[n].trips).onTrip&&isOut(allPersons[n].type);}).length;
  var americasHq=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='americas';})&&!isOut(allPersons[n].type);}).length;
  var americasOut=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='americas';})&&isOut(allPersons[n].type);}).length;
  var europeHq=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='europe';})&&!isOut(allPersons[n].type);}).length;
  var europeOut=allNames.filter(function(n){return allPersons[n].trips.some(function(t){return t.region==='europe';})&&isOut(allPersons[n].type);}).length;

  if(!totalPersons){
    wrap.innerHTML='<div style="padding:40px;text-align:center;color:#555">등록된 출장 일정이 없습니다.</div>';
    return;
  }

  var html='';

  html+='<div class="pm-fixed-header">';

  // 통계 카드
  html+='<div class="pm-stats-row">';
  html+='<div class="pm-stat-card"><div class="pm-stat-val">'+totalPersons+'</div><div class="pm-stat-lbl">등록 인원</div><div class="pm-stat-sub">전체 출장자</div><div class="pm-stat-breakdown"><span class="pm-bd-hq">본사계열 '+totalHq+'</span><span class="pm-bd-out">외주 '+totalOut+'</span></div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#2176cc">'+onTripNow+'</div><div class="pm-stat-lbl">현재 출장 중</div><div class="pm-stat-sub">오늘 기준</div><div class="pm-stat-breakdown"><span class="pm-bd-hq">본사계열 '+onTripHq+'</span><span class="pm-bd-out">외주 '+onTripOut+'</span></div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#1a8c66">'+americasPersons+'</div><div class="pm-stat-lbl">미주 출장 인원</div><div class="pm-stat-sub">고객사 가이드 대상</div><div class="pm-stat-breakdown"><span class="pm-bd-hq">본사계열 '+americasHq+'</span><span class="pm-bd-out">외주 '+americasOut+'</span></div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#cc8010">'+europePersons+'</div><div class="pm-stat-lbl">유럽 출장 인원</div><div class="pm-stat-sub">솅겐 90일 대상</div><div class="pm-stat-breakdown"><span class="pm-bd-hq">본사계열 '+europeHq+'</span><span class="pm-bd-out">외주 '+europeOut+'</span></div></div>';
  if(chinaPersons>0||vietnamPersons>0){
    html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#e04060">'+chinaPersons+'</div><div class="pm-stat-lbl">중국 출장 인원</div><div class="pm-stat-sub">세금거주자 기준</div></div>';
    html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#e07030">'+vietnamPersons+'</div><div class="pm-stat-lbl">베트남 출장 인원</div><div class="pm-stat-sub">세금거주자 기준</div></div>';
  }
  html+='</div>';

  // ── 사이트별 Total 출장일수 요약
  html+=renderSiteDaysSummary();

  // ── 출장 예정 체류 가능 여부 확인 폼
  html+='<div class="pm-feasible-form" id="pmFeasibleForm">';
  html+='<div class="pm-feasible-row">';
  html+='<span class="pm-feasible-title">✈ 출장 가능 여부 확인</span>';
  html+='<input type="text" id="pfPerson" class="pm-finp" list="pfPersonList" placeholder="이름 검색..." autocomplete="off" style="min-width:110px">';
  html+='<datalist id="pfPersonList">';
  allNames.sort(function(a,b){return a.localeCompare(b,'ko');}).forEach(function(n){html+='<option value="'+escAttr(n)+'">';});
  html+='</datalist>';
  html+='<select id="pfRegion" class="pm-fsel" onchange="pfRegionChange(this.value)"><option value="americas">미국</option><option value="canada">캐나다</option><option value="europe">유럽(솅겐)</option><option value="china">중국</option><option value="vietnam">베트남</option></select>';
  html+='<label id="pfCanadaWrap" style="display:none;align-items:center;gap:4px;font-size:11px;color:#a0a0c0;white-space:nowrap"><input type="checkbox" id="pfCanada"> 캐나다 합산</label>';
  html+='<input type="date" id="pfStart" class="pm-finp">';
  html+='<span style="font-size:11px;color:#666">~</span>';
  html+='<input type="date" id="pfEnd" class="pm-finp">';
  html+='<button class="btn sm pri" onclick="runFeasibilityCheck()">확인</button>';
  html+='</div>';
  html+='<div id="pfResult" class="pm-feasible-result"></div>';
  html+='</div>';

  // ── 컨트롤 바 (검색창 포함 - 여기서 한 번만 생성, 이후 재생성 안 함)
  html+='<div class="pm-ctrl-bar" id="pmCtrlBar">';
  html+='<div class="pm-ctrl-group">';
  html+='<span style="font-size:11px;color:#666">🔍</span>';
  html+='<input class="pm-search" id="pmSearchInp" type="text" placeholder="이름 검색..." autocomplete="off" oninput="setPmSearch(this.value)">';
  html+='</div>';
  html+='<div class="pm-ctrl-sep"></div>';
  html+='<div class="pm-ctrl-group">';
  html+='<span style="font-size:10px;color:#555">상태</span>';
  [{v:'all',l:'전체'},{v:'going',l:'출장중'},{v:'home',l:'국내'}].forEach(function(f){
    html+='<button class="pm-filter-btn'+((_pmFilter===f.v)?' on':'')+'" onclick="setPmFilter(\''+f.v+'\')">'+f.l+'</button>';
  });
  html+='</div>';
  html+='<div class="pm-ctrl-sep"></div>';
  html+='<div class="pm-ctrl-group" style="flex-wrap:wrap;gap:4px">';
  html+='<span style="font-size:10px;color:#555">인원</span>';
  var typeList=[['hq','본사',TYPE_COLOR.hq],['outsource','외주',TYPE_COLOR.outsource],['localOutsource','현지외주',TYPE_COLOR.localOutsource],['tech','기술',TYPE_COLOR.tech],['vision','비전',TYPE_COLOR.vision],['host','호스트',TYPE_COLOR.host]];
  typeList.forEach(function(t){
    var isOn=_pmTypeFilter[t[0]];
    html+='<label class="pm-type-ck'+(isOn?' on':'')+'" style="--tc:'+t[2]+';'+(isOn?'background:'+t[2]+'22;border-color:'+t[2]:'')+'"><input type="checkbox"'+(isOn?' checked':'')+' onchange="togglePmType(\''+t[0]+'\')">'+t[1]+'</label>';
  });
  html+='</div>';
  html+='<div class="pm-ctrl-sep"></div>';
  html+='<div class="pm-ctrl-group" id="pmSortBtns">';
  html+=buildSortBtnsHtml();
  html+='</div>';
  html+='<span style="font-size:10px;color:#444;margin-left:auto">롤링12M: '+r12s+' ~ '+r12e+'</span>';
  html+='</div>';

  html+='</div>'; // .pm-fixed-header 닫기

  // ── 결과 영역 (검색/정렬/타입 변경 시 이 div만 갱신)
  html+='<div class="pm-body-scroll"><div id="pmBody"></div></div>';

  wrap.innerHTML=html;
  renderPersonBody(); // 결과 채우기
}

// 정렬 버튼 HTML 조각 생성 (컨트롤바 내 정렬 버튼 업데이트에 재사용)
function buildSortBtnsHtml(){
  var sortBtns=[['name','이름'],['americas','미국(12M)'],['canada','캐나다(12M)'],['europe','유럽(12M)'],['china','중국(12M)'],['vietnam','베트남(12M)'],['total','전체해외(12M)'],['korea12m','국내(12M)'],['koreaCur','현재국내']];
  var h='<span style="font-size:10px;color:#555">정렬</span>';
  sortBtns.forEach(function(b){
    var isOn=_pmSortKey===b[0];
    var arrow=isOn?(_pmSortAsc?'▲':'▼'):'';
    h+='<button class="pm-sort-btn'+(isOn?' on':'')+'" onclick="setPmSort(\''+b[0]+'\')">'+b[1]+'<span class="pm-sort-arrow">'+arrow+'</span></button>';
  });
  return h;
}

// 결과 테이블만 갱신 - pmCtrlBar/pmSearchInp DOM 건드리지 않음
function renderPersonBody(){
  var body=document.getElementById('pmBody');
  if(!body) return;

  // 정렬 버튼 상태만 업데이트 (검색창과 무관)
  var sortEl=document.getElementById('pmSortBtns');
  if(sortEl) sortEl.innerHTML=buildSortBtnsHtml();

  // 타입필터 버튼 상태 업데이트
  var ctrlBar=document.getElementById('pmCtrlBar');
  if(ctrlBar){
    ctrlBar.querySelectorAll('.pm-type-ck').forEach(function(el){
      var t=el.querySelector('input[type=checkbox]');
      if(!t) return;
      var type=t.getAttribute('onchange').replace(/togglePmType\('|'\)/g,'');
      var isOn=_pmTypeFilter[type];
      el.className='pm-type-ck'+(isOn?' on':'');
      el.style.cssText='--tc:'+TYPE_COLOR[type]+';'+(isOn?'background:'+TYPE_COLOR[type]+'22;border-color:'+TYPE_COLOR[type]:'');
      t.checked=isOn;
    });
  }

  var allPersons=aggregatePersonTrips();
  var rolling12=getRolling12();

  // 이름 검색 + 인원유형 필터 + 상태 필터
  var names=Object.keys(allPersons).filter(function(n){
    var p=allPersons[n];
    var typeKeys=Object.keys(p.types||{});
    if(typeKeys.length===0) typeKeys=[p.type];
    if(!typeKeys.some(function(t){return _pmTypeFilter[t];})) return false;
    if(_pmSearch && n.toLowerCase().indexOf(_pmSearch)<0) return false;
    var loc=getCurrentLocation(p.trips);
    if(_pmFilter==='going' && !loc.onTrip) return false;
    if(_pmFilter==='home'  &&  loc.onTrip) return false;
    return true;
  });

  if(!names.length){
    body.innerHTML='<div style="padding:30px 10px;text-align:center;color:#707080;font-size:13px">해당 조건의 인원이 없습니다.</div>';
    return;
  }

  // 정렬
  names=names.slice().sort(function(a,b){
    var pa=allPersons[a], pb=allPersons[b];
    var v;
    if(_pmSortKey==='name')        v=a.localeCompare(b,'ko');
    else if(_pmSortKey==='americas') v=calcRegionDays12M(pa.trips,'americas',rolling12)-calcRegionDays12M(pb.trips,'americas',rolling12);
    else if(_pmSortKey==='canada')   v=calcRegionDays12M(pa.trips,'canada',rolling12)-calcRegionDays12M(pb.trips,'canada',rolling12);
    else if(_pmSortKey==='europe')   v=calcRegionDays12M(pa.trips,'europe',rolling12)-calcRegionDays12M(pb.trips,'europe',rolling12);
    else if(_pmSortKey==='china')    v=calcRegionDays12M(pa.trips,'china',rolling12)-calcRegionDays12M(pb.trips,'china',rolling12);
    else if(_pmSortKey==='vietnam')  v=calcRegionDays12M(pa.trips,'vietnam',rolling12)-calcRegionDays12M(pb.trips,'vietnam',rolling12);
    else if(_pmSortKey==='total')    v=calcTotalOverseas12M(pa.trips,rolling12)-calcTotalOverseas12M(pb.trips,rolling12);
    else if(_pmSortKey==='korea12m') v=calcKoreaDays12M(pa.trips,rolling12)-calcKoreaDays12M(pb.trips,rolling12);
    else if(_pmSortKey==='koreaCur') v=calcCurrentKoreaDays(pa.trips)-calcCurrentKoreaDays(pb.trips);
    else                             v=a.localeCompare(b,'ko');
    return _pmSortAsc?v:-v;
  });

  body.innerHTML=renderPersonTable(allPersons, names, rolling12);
}

function renderPersonTable(persons, nameList, rolling12){
  var html='<table class="pm-person-table">';
  html+='<thead><tr>';
  function thS(key,lbl){
    var isOn=_pmSortKey===key;
    var arrow=isOn?(_pmSortAsc?' ▲':' ▼'):'';
    return '<th class="'+(isOn?'on':'')+'" onclick="setPmSort(\''+key+'\')">'+lbl+arrow+'</th>';
  }
  html+=thS('name','이름');
  html+='<th>현재위치</th>';
  html+=thS('americas','미국(12M)');
  html+=thS('canada','캐나다(12M)');
  html+=thS('europe','유럽(12M)');
  html+=thS('china','중국(12M)');
  html+=thS('vietnam','베트남(12M)');
  html+=thS('total','전체해외(12M)');
  html+=thS('koreaCur','현재국내');
  html+=thS('korea12m','국내(12M)');
  html+='<th>미국 가이드</th>';
  html+='<th>유럽 솅겐</th>';
  html+='<th>중국</th>';
  html+='<th>베트남</th>';
  html+='</tr></thead><tbody>';

  nameList.forEach(function(name){
    html+=renderPersonRow(name, persons[name], rolling12);
    if(_pmExpanded[name]) html+=renderPersonTimeline(persons[name].trips, nameList.length);
  });

  html+='</tbody></table>';
  html+='<div style="font-size:10px;color:#707080;padding:8px 4px;margin-top:4px">'
    +'* 출장일: 롤링 12개월(오늘 기준 최근 1년) 기준 체류일 (중복 제거). 미국·캐나다는 별도 표시. '
    +'미국 고객사 가이드: 1회 '+US_GUIDE_SINGLE+'일 / 연 '+US_GUIDE_ANNUAL+'일 (캐나다 합산 여부는 출장 가능 여부 확인에서 선택). '
    +'유럽 솅겐: 롤링 180일 기준 90일. '
    +'중국/베트남: 1회 90일 / 연 183일(세금거주자). '
    +'※ 미국 입국심사는 미국 체류일만 카운트하나, 장기 해외 체류 반복 시 "거주 의심" 우려 가능.'
    +'</div>';
  return html;
}

function renderPersonRow(name, person, rolling12){
  var trips=person.trips;
  var loc=getCurrentLocation(trips);
  var amDays=calcRegionDays12M(trips,'americas',rolling12);
  var caDays=calcRegionDays12M(trips,'canada',rolling12);
  var euDays=calcRegionDays12M(trips,'europe',rolling12);
  var cnDays=calcRegionDays12M(trips,'china',rolling12);
  var vnDays=calcRegionDays12M(trips,'vietnam',rolling12);
  var totalDays=calcTotalOverseas12M(trips,rolling12);
  var koreaCur=calcCurrentKoreaDays(trips);
  var korea12m=calcKoreaDays12M(trips,rolling12);

  var usRisk=calcUsRisk(trips);
  var euRisk=calcSchengenRisk(trips);
  var cnRisk=calcChinaRisk(trips);
  var vnRisk=calcVietnamRisk(trips);

  var tc=TYPE_COLOR[person.type]||'#555';
  var tl=TYPE_LBL[person.type]||person.type;
  var expanded=_pmExpanded[name];
  var arrow=expanded?'▼':'▶';

  var html='<tr class="pm-person-row" onclick="togglePersonExpand(\''+name.replace(/'/g,"\\'")+'\')">';

  // 이름 + 유형 + 펼침 화살표
  html+='<td><div style="display:flex;align-items:center;gap:6px">'
    +'<span style="font-size:10px;color:#606070">'+arrow+'</span>'
    +'<span class="pm-name">'+name+'</span>'
    +'<span class="pm-type" style="background:'+tc+'">'+tl+'</span>'
    +'</div></td>';

  // 현재 위치
  if(loc.onTrip){
    html+='<td><div style="display:flex;flex-direction:column;gap:1px">'
      +'<span style="font-size:12px;font-weight:600;color:'+loc.siteColor+'">'+loc.siteName+'</span>'
      +'<span style="font-size:10px;color:#909090">~'+fmt(loc.endDate)+'</span>'
      +'</div></td>';
  } else {
    html+='<td><span style="font-size:12px;color:#4aaa70;font-weight:500">🇰🇷 국내</span></td>';
  }

  // 미국(12M)
  var amCls=usRisk.status==='danger'?'b1-alert':usRisk.status==='warn'?'b1-warn':'';
  html+='<td style="text-align:center"><span class="pm-days-big '+(amCls)+'" style="font-size:16px">'+amDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 캐나다(12M)
  html+='<td style="text-align:center"><span class="pm-days-big" style="font-size:16px">'+caDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 유럽(12M)
  html+='<td style="text-align:center"><span class="pm-days-big" style="font-size:16px">'+euDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 중국(12M)
  var cnCls=cnRisk.status==='danger'?'b1-alert':cnRisk.status==='warn'?'b1-warn':'';
  html+='<td style="text-align:center"><span class="pm-days-big '+cnCls+'" style="font-size:16px">'+cnDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 베트남(12M)
  var vnCls=vnRisk.status==='danger'?'b1-alert':vnRisk.status==='warn'?'b1-warn':'';
  html+='<td style="text-align:center"><span class="pm-days-big '+vnCls+'" style="font-size:16px">'+vnDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 전체해외(12M)
  html+='<td style="text-align:center"><span class="pm-days-big" style="font-size:16px;font-weight:700">'+totalDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 현재국내
  var curColor=koreaCur===0?(loc.onTrip?'#606070':'#e84040'):(koreaCur<30?'#e8a020':'#4aaa70');
  html+='<td style="text-align:center"><span style="font-size:16px;font-weight:600;color:'+curColor+'">'+koreaCur+'</span><span class="pm-days-unit"> 일</span></td>';

  // 국내(12M)
  html+='<td style="text-align:center"><span style="font-size:16px;font-weight:600;color:#7aafee">'+korea12m+'</span><span class="pm-days-unit"> 일</span></td>';

  // 미국 가이드 리스크
  var usLbl=usRisk.status==='danger'?'위험':usRisk.status==='warn'?'주의':'안전';
  html+='<td style="text-align:center">'
    +'<div style="display:flex;flex-direction:column;align-items:center;gap:3px">'
    +'<span class="risk-badge risk-'+usRisk.status+'" data-tooltip="'+escAttr(usRisk.tooltip)+'" onmouseenter="showRiskTooltip(this)" onmouseleave="hideRiskTooltip()">'+usLbl+'</span>'
    +'<span style="font-size:10px;color:#a0a0a8;white-space:nowrap">'+usRisk.subText+'</span>'
    +'</div></td>';

  // 유럽 솅겐 리스크
  var euLbl=euRisk.status==='danger'?'위험':euRisk.status==='warn'?'주의':'안전';
  html+='<td style="text-align:center">'
    +'<div style="display:flex;flex-direction:column;align-items:center;gap:3px">'
    +'<span class="risk-badge risk-'+euRisk.status+'" data-tooltip="'+escAttr(euRisk.tooltip)+'" onmouseenter="showRiskTooltip(this)" onmouseleave="hideRiskTooltip()">'+euLbl+'</span>'
    +'<span style="font-size:10px;color:#a0a0a8;white-space:nowrap">'+euRisk.subText+'</span>'
    +'</div></td>';

  // 중국 리스크
  var cnLbl=cnRisk.status==='danger'?'위험':cnRisk.status==='warn'?'주의':(cnDays>0?'안전':'-');
  html+='<td style="text-align:center">'
    +(cnDays>0
      ?'<div style="display:flex;flex-direction:column;align-items:center;gap:3px">'
        +'<span class="risk-badge risk-'+cnRisk.status+'" data-tooltip="'+escAttr(cnRisk.tooltip)+'" onmouseenter="showRiskTooltip(this)" onmouseleave="hideRiskTooltip()">'+cnLbl+'</span>'
        +'<span style="font-size:10px;color:#a0a0a8;white-space:nowrap">'+cnRisk.subText+'</span>'
        +'</div>'
      :'<span style="color:#505060;font-size:11px">-</span>')
    +'</td>';

  // 베트남 리스크
  var vnLbl=vnRisk.status==='danger'?'위험':vnRisk.status==='warn'?'주의':(vnDays>0?'안전':'-');
  html+='<td style="text-align:center">'
    +(vnDays>0
      ?'<div style="display:flex;flex-direction:column;align-items:center;gap:3px">'
        +'<span class="risk-badge risk-'+vnRisk.status+'" data-tooltip="'+escAttr(vnRisk.tooltip)+'" onmouseenter="showRiskTooltip(this)" onmouseleave="hideRiskTooltip()">'+vnLbl+'</span>'
        +'<span style="font-size:10px;color:#a0a0a8;white-space:nowrap">'+vnRisk.subText+'</span>'
        +'</div>'
      :'<span style="color:#505060;font-size:11px">-</span>')
    +'</td>';

  html+='</tr>';
  return html;
}

function renderPersonTimeline(trips, colSpan){
  if(!trips||!trips.length) return '';
  var sorted=trips.slice().sort(function(a,b){return a.start>b.start?1:-1;});
  var rows='';
  var prevEnd=null;
  var todayStr=TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');

  sorted.forEach(function(t){
    // 이전 출장과 사이에 국내 체류 갭이 있으면 표시
    if(prevEnd!==null){
      var gapStart=new Date(pd(prevEnd));
      gapStart.setDate(gapStart.getDate()+1);
      var gapEnd=new Date(pd(t.start));
      gapEnd.setDate(gapEnd.getDate()-1);
      if(gapStart<=gapEnd){
        var gapDays=Math.round((gapEnd-gapStart)/86400000)+1;
        rows+='<div class="pm-tl-korea">'
          +'<span style="font-size:16px;margin-right:2px">🇰🇷</span>'
          +'<span style="flex:1">국내 체류</span>'
          +'<span style="color:#a0a0a8;font-size:11px">'+fmtFull(gapStart.getFullYear()+'-'+String(gapStart.getMonth()+1).padStart(2,'0')+'-'+String(gapStart.getDate()).padStart(2,'0'))
          +' → '+fmtFull(gapEnd.getFullYear()+'-'+String(gapEnd.getMonth()+1).padStart(2,'0')+'-'+String(gapEnd.getDate()).padStart(2,'0'))+'</span>'
          +'<span style="min-width:50px;text-align:right;color:#b0b0b8">'+gapDays+'일</span>'
          +'</div>';
      }
    }
    // 출장 행
    var stHtml=statusHtml(t.status);
    rows+='<div class="pm-tl-trip">'
      +'<span class="pm-trip-site" style="background:'+t.siteColor+'">'+t.siteName+'</span>'
      +'<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#1e1e2a;color:#b0b0b8">'+(t.region==='americas'?'미국':t.region==='canada'?'캐나다':t.region==='europe'?'유럽':t.region==='china'?'중국':t.region==='vietnam'?'베트남':t.region==='korea'?'국내':'기타')+'</span>'
      +'<span style="flex:1;color:#a0a0a8;font-size:11px">'+fmtFull(t.start)+' → '+fmtFull(t.end)+'</span>'
      +'<span style="min-width:50px;text-align:right;color:#c8c8d4">'+t.days+'일</span>'
      +stHtml
      +'</div>';
    prevEnd=t.end;
  });

  // 마지막 출장 후 현재까지 국내 체류 (출장중이 아닌 경우)
  var onTrip=trips.some(function(t){return TODAY>=pd(t.start)&&TODAY<=pd(t.end);});
  if(!onTrip && prevEnd!==null){
    var afterStart=new Date(pd(prevEnd));
    afterStart.setDate(afterStart.getDate()+1);
    if(afterStart<=TODAY){
      var afterDays=Math.round((TODAY-afterStart)/86400000)+1;
      rows+='<div class="pm-tl-korea">'
        +'<span style="font-size:16px;margin-right:2px">🇰🇷</span>'
        +'<span style="flex:1">국내 체류 (현재)</span>'
        +'<span style="color:#a0a0a8;font-size:11px">'+fmtFull(afterStart.getFullYear()+'-'+String(afterStart.getMonth()+1).padStart(2,'0')+'-'+String(afterStart.getDate()).padStart(2,'0'))+' → 오늘</span>'
        +'<span style="min-width:50px;text-align:right;color:#4aaa70">'+afterDays+'일</span>'
        +'</div>';
    }
  }

  return '<tr class="pm-expand-row"><td colspan="14"><div class="pm-timeline">'+rows+'</div></td></tr>';
}
