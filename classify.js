/* ═══════════════════════════════════════════════════════════
   과금·위치 분류 / 이상점(⚠) 엔진 / 사이트별 출장일 집계 / 재분류·분할·데이터 점검
   - 과금(payType): free 무상 · md 유상-계약 M/D 소진 · po 유상-별도 PO
   - 위치(loc): overseas 해외 · dom_setup 국내(납품 전 셋업) · dom_final 국내(최종 납품처)
   - 기존 paid/domestic 필드는 지우지 않고 그대로 보존한다(자동 변환 없음, 건별 지정).
═══════════════════════════════════════════════════════════ */
var PAY_LABEL={free:'무상',md:'유상-계약 M/D 소진',po:'유상-별도 PO'};
var PAY_SHORT={free:'무상',md:'계약M/D',po:'별도PO'};
var FREE_REASON={edu:'교육',warranty:'보증',etc:'기타'};
var LOC_LABEL={overseas:'해외',dom_setup:'국내(납품 전 셋업)',dom_final:'국내(최종 납품처)'};
var LOC_SHORT={overseas:'해외',dom_setup:'국내-셋업',dom_final:'국내-납품처'};
/* 겹침이 이 일수 이하이면 '참고(ℹ)'로 낮춘다 — 출국·도착 이동일 패턴 */
var INFO_OVERLAP_MAX_DAYS=2;
/* 2일 이하 겹침 무시 옵션 — 켜면(기본) 참고(ℹ) 표시·점검 목록에서 아예 빼고, 끄면 참고로 표시. 기기별(localStorage) 설정 */
var IGNORE_SHORT_KEY='bu3_ignoreShortOverlap';
function ignoreShortOverlap(){try{return localStorage.getItem(IGNORE_SHORT_KEY)!=='0';}catch(e){return true;}}
function setIgnoreShortOverlap(on){
  try{localStorage.setItem(IGNORE_SHORT_KEY,on?'1':'0');}catch(e){}
  invalidateIssIdx();
  if(_chk.filter==='info'&&on) _chk.filter='all';
  renderAll();
  _renderDataCheck();
}
/* 재분류 화면의 사이트 필터 기본값: 2차전지 사이트 */
var CLS_BATTERY_SITES=['ESHD','ESOT','ESWA','ESHG','현대JV','ESMI'];

/* ── 기본 헬퍼 ── */
function _isNamed(n){n=String(n||'').trim();return !!n&&n!=='미지정';}
function _pad2(n){return String(n).padStart(2,'0');}
function _ymd(d){return d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate());}
function isRealDate(s){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));
  if(!m) return false;
  var y=+m[1],mo=+m[2],d=+m[3],dt=new Date(y,mo-1,d);
  return dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d;
}
function schedProject(sc){return S.projects.find(function(p){return p.id===sc.projectId;})||null;}
function schedSite(sc){var p=schedProject(sc);return p?(S.sites.find(function(s){return s.id===p.siteId;})||null):null;}
function isDomesticSite(site){return !!site&&(site.country==='korea'||site.region==='korea');}
function siteDefaultLoc(site){return isDomesticSite(site)?'dom_final':'overseas';}

/* 과금 구분: payType 이 있으면 그것. paid 가 true → 유상 체크됨(미분류), false → 체크 해제됨(미분류).
   paid 가 없거나 빈 값이면 초기 설비 계약서 M/D 소진('md')으로 본다. */
function effectivePay(sc){
  if(sc.payType==='free'||sc.payType==='md'||sc.payType==='po') return sc.payType;
  if(sc.paid===true||sc.paid==='true'||sc.paid==='TRUE') return 'pending_paid';
  if(sc.paid===false||sc.paid==='false'||sc.paid==='FALSE') return 'pending_unchecked';
  return 'md';
}
function isPendingPay(p){return p==='pending_paid'||p==='pending_unchecked';}
function derivedLoc(sc){
  var site=schedSite(sc);
  if(isDomesticSite(site)) return 'dom_final';
  if(sc.domestic===true||sc.domestic==='true'||sc.domestic==='TRUE') return 'dom_setup';
  return 'overseas';
}
function effectiveLoc(sc){
  if(sc.loc==='overseas'||sc.loc==='dom_setup'||sc.loc==='dom_final') return sc.loc;
  return derivedLoc(sc);
}
function isDomesticLoc(sc){return effectiveLoc(sc)!=='overseas';}

/* 간트 라벨용 태그: 계약 M/D 소진이 기본이라 표시하지 않고, 그 밖의 경우만 표시 */
function payTag(sc){
  var p=effectivePay(sc);
  return p==='free'?'·무상':(p==='po'?'·별도PO':(isPendingPay(p)?'·미분류':''));
}
function locTag(sc){
  var l=effectiveLoc(sc);
  if(l==='dom_setup') return ' [국내-셋업]';
  if(l==='dom_final'&&!isDomesticSite(schedSite(sc))) return ' [국내-납품처]';
  return '';
}
function hasWarnLive(sc){return schedIssues(sc).some(function(i){return i.level!=='info';});}

/* ═══════════════ 이상점(⚠) 엔진 ═══════════════ */
var _issIdx=null;
function invalidateIssIdx(){_issIdx=null;}
function getIssIdx(){
  if(_issIdx) return _issIdx;
  var by={},vac={};
  S.schedules.forEach(function(sc){ /* hidden 값은 쓰지 않는다(자동 숨김된 과거 일정의 오류도 잡는다). 취소 일정은 제외 */
    if(sc.canceled||!_isNamed(sc.name)||!isRealDate(sc.start)||!isRealDate(sc.end)||sc.start>sc.end) return;
    (by[sc.name]=by[sc.name]||[]).push(sc);
  });
  (S.vacations||[]).forEach(function(v){
    if(!_isNamed(v.name)||!isRealDate(v.start)||!isRealDate(v.end)) return;
    (vac[v.name]=vac[v.name]||[]).push(v);
  });
  _issIdx={by:by,vac:vac};
  return _issIdx;
}
function _ovr(a1,a2,b1,b2){
  var s=a1>b1?a1:b1,e=a2<b2?a2:b2;
  return s<=e?{s:s,e:e,n:dd(s,e)}:null;
}
function _per(s,e){return s+'~'+e;}
function _siteNameOf(sc){var s=schedSite(sc);return s?s.name:'(사이트 없음)';}
function conflictsOf(sc){
  var out=[];
  if(sc.canceled||!_isNamed(sc.name)||!isRealDate(sc.start)||!isRealDate(sc.end)||sc.start>sc.end) return out;
  var idx=getIssIdx();
  var mySite=schedSite(sc);
  (idx.vac[sc.name]||[]).forEach(function(v){
    var r=_ovr(sc.start,sc.end,v.start,v.end);
    if(r) out.push({kind:'vac',v:v,r:r,level:'warn',cross:false});
  });
  (idx.by[sc.name]||[]).forEach(function(o){
    if(o===sc||o.id===sc.id) return;
    if(sc.splitGroup&&o.splitGroup===sc.splitGroup) return;
    var r=_ovr(sc.start,sc.end,o.start,o.end);
    if(!r) return;
    var os=schedSite(o);
    var cross=!!(mySite&&os&&mySite.id!==os.id);
    /* 겹침이 2일 이하(출국·도착 이동일 패턴)면 '참고(info)', 3일 이상은 경고 */
    var lvl=r.n<=INFO_OVERLAP_MAX_DAYS?'info':'warn';
    if(lvl==='info'&&ignoreShortOverlap()) return;   /* 2일 이하 겹침 무시 */
    out.push({kind:'trip',o:o,r:r,cross:cross,level:lvl});
  });
  return out;
}
function conflictText(sc,c){
  if(c.kind==='vac'){
    return '휴가 겹침 — '+sc.name+'님의 '+(c.v.type||'휴가')+' '+_per(c.v.start,c.v.end)+(c.v.note?' ('+c.v.note+')':'')
      +' / 겹친 기간 '+_per(c.r.s,c.r.e)+' ('+c.r.n+'일)';
  }
  var o=c.o;
  return (c.cross?'사이트 간 동시 출장':'출장 겹침')+(c.level==='info'?' (참고: '+INFO_OVERLAP_MAX_DAYS+'일 이하 겹침 — 출국·도착 이동일일 수 있음)':'')+' — '+sc.name+'님이 같은 기간에 다른 출장: '+_siteNameOf(o)+(o.task?' · '+o.task:'')+' '+_per(o.start,o.end)
    +' / 겹친 기간 '+_per(c.r.s,c.r.e)+' ('+c.r.n+'일)';
}
/* 이상점 목록 [{code,text}] — code: date | orphan | loc | conflict */
function schedIssues(sc){
  var list=[];
  if(sc.canceled) return list; /* 취소된 일정은 이상점 검사 대상이 아님 */
  ['start','end'].forEach(function(k){
    var v=sc[k],label=k==='start'?'시작일':'종료일';
    if(isRealDate(v)) return;
    var msg=label+' "'+(v||'')+'" 은(는) 존재하지 않는 날짜이거나 형식이 틀립니다';
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))){msg+=' — 화면에서는 '+_ymd(pd(v))+' 로 넘어가 계산되어 일수가 틀립니다';}
    list.push({code:'date',level:'warn',text:msg+'. 일정을 열어 날짜를 고치세요.'});
  });
  if(isRealDate(sc.start)&&isRealDate(sc.end)&&sc.start>sc.end){
    list.push({code:'date',level:'warn',text:'시작일('+sc.start+')이 종료일('+sc.end+')보다 늦습니다. 일정을 열어 날짜를 고치세요.'});
  }
  var proj=schedProject(sc);
  if(!proj){
    list.push({code:'orphan',level:'warn',text:'연결된 프로젝트가 삭제되었거나 없습니다. 이 일정은 간트에 표시되지 않습니다 — [데이터 점검]에서 다른 프로젝트로 다시 연결하세요.'});
  }else if(!S.sites.some(function(s){return s.id===proj.siteId;})){
    list.push({code:'orphan',level:'warn',text:'프로젝트 "'+proj.name+'" 의 사이트가 삭제되었거나 없습니다. [데이터 점검]에서 프로젝트를 다시 연결하세요.'});
  }else{
    var site=schedSite(sc);
    if(sc.loc==='dom_final'&&!isDomesticSite(site)){
      list.push({code:'loc',level:'warn',text:'해외 사이트('+site.name+')에 위치가 \'국내(최종 납품처)\' 로 지정되어 있습니다. 위치를 확인하세요.'});
    }else if(sc.loc==='overseas'&&isDomesticSite(site)){
      list.push({code:'loc',level:'warn',text:'국내 납품처 사이트('+site.name+')인데 위치가 \'해외\' 로 지정되어 있습니다. 위치를 확인하세요.'});
    }
  }
  conflictsOf(sc).forEach(function(c){list.push({code:'conflict',level:c.level,cross:c.cross&&c.level==='warn',text:conflictText(sc,c)});});
  return list;
}
function issuesTitle(list,head){
  var n=list.length,max=5;
  var lines=list.slice(0,max).map(function(x,i){return (i+1)+') '+x.text;});
  if(n>max) lines.push('… 외 '+(n-max)+'건 (일정을 열면 전체를 볼 수 있습니다)');
  return (head||'⚠ 이상점')+' '+n+'건\n'+lines.join('\n');
}
/* 간트 툴팁: 경고(⚠)와 참고(ℹ)를 나눠서 표시 */
function issuesTip(list){
  var w=list.filter(function(x){return x.level!=='info';}),i=list.filter(function(x){return x.level==='info';});
  var t=[];
  if(w.length) t.push(issuesTitle(w,'⚠ 이상점'));
  if(i.length) t.push(issuesTitle(i,'ℹ 참고'));
  return t.join('\n\n');
}
function issueBoxHtml(sc){
  var list=schedIssues(sc);
  if(!list.length) return '';
  var nw=list.filter(function(x){return x.level!=='info';}).length;
  return '<div class="cls-issuebox'+(nw?'':' info')+'"><div class="cls-issuehd">'+(nw?'⚠ 이상점 '+nw+'건':'ℹ 참고')+(list.length>nw&&nw?' (+ 참고 '+(list.length-nw)+'건)':'')+' — 아래 사유를 확인하세요</div><ul>'
    +list.map(function(x){return '<li>'+(x.level==='info'?'ℹ ':'⚠ ')+_esc(x.text)+'</li>';}).join('')+'</ul></div>';
}
function allIssues(){
  invalidateIssIdx();
  var out=[];
  S.schedules.forEach(function(sc){
    if(sc.canceled) return;
    var l=schedIssues(sc);
    if(/취소/.test(String(sc.note||''))) l.push({code:'cancelq',level:'warn',text:'메모에 \'취소\'가 적혀 있습니다 — 취소된 출장인지 확인하세요. 취소가 맞으면 일정을 열어 \'취소 처리\'를 선택하세요(모든 집계에서 제외됩니다).'});
    if(l.length) out.push({sc:sc,issues:l});
  });
  return out;
}

/* ═══════════════ 사이트별 출장일 집계 엔진 ═══════════════ */
/* 집계 규칙: 출발한 일정만(예정 제외, plan:true 이면 미래 포함), 진행 중 일정은 오늘까지만,
   (사이트, 이름, 날짜, 위치) 중복 제거(이름 '미지정' 제외), 숨김(hidden) 값과 무관, 취소 일정 제외. */
function siteDayRows(opts){
  opts=opts||{};
  var period=opts.period||'all',types=opts.types||null,plan=!!opts.plan;
  var rs=null,re=null;
  if(period==='year'){rs=new Date(TODAY.getFullYear(),0,1);re=new Date(TODAY.getFullYear(),11,31);}
  else if(period==='r12'){var r=getRolling12();rs=r.start;re=r.end;}
  var cand=[];
  S.schedules.forEach(function(sc){
    if(sc.canceled) return;   /* 취소는 모든 집계에서 제외 */
    if(types&&!types[sc.type]) return;
    if(!isRealDate(sc.start)||!isRealDate(sc.end)||sc.start>sc.end) return;
    var proj=schedProject(sc);if(!proj) return;
    var site=S.sites.find(function(x){return x.id===proj.siteId;});if(!site) return;
    var s=pd(sc.start),e=pd(sc.end);
    if(!plan){
      if(TODAY<s) return;
      if(e>TODAY) e=new Date(TODAY);
    }
    if(rs&&s<rs) s=new Date(rs);
    if(re&&e>re) e=new Date(re);
    if(s>e) return;
    cand.push({sc:sc,site:site,s:s,e:e});
  });
  cand.sort(function(a,b){return (a.s-b.s)||(a.sc.id<b.sc.id?-1:(a.sc.id>b.sc.id?1:0));});
  var seen={},dup=0,rows=[];
  cand.forEach(function(c){
    var named=_isNamed(c.sc.name),dates=[],L=effectiveLoc(c.sc);
    for(var cur=new Date(c.s);cur<=c.e;cur.setDate(cur.getDate()+1)){
      var ds=_ymd(cur);
      /* (사이트, 이름, 날짜, 위치) 단위 중복 제거 — 위치가 다른 겹침은 이상점으로만 표시 */
      if(named){var k=c.site.id+'|'+c.sc.name+'|'+ds+'|'+L;if(seen[k]){dup++;continue;}seen[k]=1;}
      dates.push(ds);
    }
    rows.push({sc:c.sc,site:c.site,dates:dates,days:dates.length,pay:effectivePay(c.sc),loc:L,type:c.sc.type});
  });
  rows.dup=dup;
  return rows;
}
/* 계약 M/D 소진으로 세는 행: 유상-계약 M/D 소진. 국내(납품 전 셋업)는 사이트 설정(mdIncludeSetup)일 때만. 미분류는 제외 */
/* 사이트의 '셋업 포함' 설정 — 서버 버전에 따라 'TRUE'/'FALSE' 문자열로 올 수 있어 방어적으로 해석 */
function siteMdSetup(site){
  var v=site&&site.mdIncludeSetup;
  return v===true||String(v).toLowerCase()==='true';
}
function consumesMd(r){
  return r.pay==='md'&&(r.loc!=='dom_setup'||siteMdSetup(r.site));
}
function _stat(){return {free:0,md:0,po:0,pend:0,total:0};}
function _addStat(st,pay,n){var k=(pay==='free'||pay==='md'||pay==='po')?pay:'pend';st[k]+=n;st.total+=n;}
function _typeGroup(t){return t==='outsource'?'out':(t==='localOutsource'?'local':'hq');}

function aggregateSiteDays(period,opts){
  opts=opts||{};
  var types=_pmSiteTypeFilter;
  var rows=siteDayRows({period:period,types:types});
  var allRows=(period==='all')?rows:siteDayRows({period:'all',types:types});
  var planRows=siteDayRows({period:'all',types:types,plan:true});
  var overseasOnly=!!opts.overseasOnly; /* 검증용: 해외만 */
  var map={};
  function get(site){
    return map[site.id]||(map[site.id]={site:site,loc:{overseas:_stat(),dom_setup:_stat(),dom_final:_stat()},
      type:{hq:_stat(),out:_stat(),local:_stat()},total:_stat(),mdUsed:0,mdPlan:0,pendAll:0,pendPaid:0,pendUnchecked:0,names:{},planDates:{}});
  }
  rows.forEach(function(r){
    if(overseasOnly&&r.loc!=='overseas') return;
    var m=get(r.site);
    if(!r.days) return;
    _addStat(m.loc[r.loc],r.pay,r.days);_addStat(m.type[_typeGroup(r.type)],r.pay,r.days);_addStat(m.total,r.pay,r.days);
    if(_isNamed(r.sc.name)) m.names[r.sc.name]=1;
  });
  allRows.forEach(function(r){
    if(overseasOnly&&r.loc!=='overseas') return;
    var m=get(r.site);
    if(consumesMd(r)) m.mdUsed+=r.days;
    if(isPendingPay(r.pay)){
      m.pendAll+=r.days;
      if(r.pay==='pending_paid') m.pendPaid+=r.days; else m.pendUnchecked+=r.days;
    }
  });
  planRows.forEach(function(r){
    if(overseasOnly&&r.loc!=='overseas') return;
    var m=get(r.site);
    if(!consumesMd(r)) return;
    m.mdPlan+=r.days;
    r.dates.forEach(function(d){m.planDates[d]=(m.planDates[d]||0)+1;});
  });
  var todayStr=_ymd(TODAY);
  var siteList=Object.keys(map).map(function(id){
    var m=map[id],est=Number(m.site.estMd)||0;
    m.estMd=est;m.personCount=Object.keys(m.names).length;
    m.excessDate='';
    if(est>0&&m.mdPlan>est){
      var cum=0,ds=Object.keys(m.planDates).sort();
      for(var i=0;i<ds.length;i++){cum+=m.planDates[ds[i]];if(cum>est){m.excessDate=ds[i];break;}}
    }
    m.excessPast=!!m.excessDate&&m.excessDate<=todayStr;
    return m;
  });
  var groupOrder=S.groups.map(function(g){return g.id;});
  siteList.sort(function(a,b){
    var gi=groupOrder.indexOf(a.site.groupId)-groupOrder.indexOf(b.site.groupId);
    return gi!==0?gi:(b.total.total-a.total.total);
  });
  var groups=[];
  siteList.forEach(function(m){
    var g=groups[groups.length-1];
    if(!g||g.groupId!==m.site.groupId){
      var gi=S.groups.find(function(x){return x.id===m.site.groupId;});
      g={groupId:m.site.groupId,groupName:gi?gi.name:(m.site.groupId||'미분류'),sites:[]};
      groups.push(g);
    }
    g.sites.push(m);
  });
  var grand={loc:{overseas:_stat(),dom_setup:_stat(),dom_final:_stat()},type:{hq:_stat(),out:_stat(),local:_stat()},total:_stat(),
    mdUsed:0,mdPlan:0,pendAll:0,estMd:0,names:{}};
  siteList.forEach(function(m){
    ['overseas','dom_setup','dom_final'].forEach(function(l){['free','md','po','pend','total'].forEach(function(k){grand.loc[l][k]+=m.loc[l][k];});});
    ['hq','out','local'].forEach(function(t){['free','md','po','pend','total'].forEach(function(k){grand.type[t][k]+=m.type[t][k];});});
    ['free','md','po','pend','total'].forEach(function(k){grand.total[k]+=m.total[k];});
    grand.mdUsed+=m.mdUsed;grand.mdPlan+=m.mdPlan;grand.pendAll+=m.pendAll;grand.estMd+=m.estMd;
    Object.keys(m.names).forEach(function(n){grand.names[n]=1;});
  });
  grand.persons=Object.keys(grand.names).length;
  return {groups:groups,sites:siteList,grand:grand,dup:rows.dup};
}

/* ── 사이트별 요약 UI ── */
var _pmSiteTypeCols=false; /* 인원구분별 열 보기 */
function _fmtN(n){return Number(n||0).toLocaleString('ko-KR');}
function _locCell(st){
  if(!st.total) return '<span class="cls-dim">-</span>';
  var parts=[];
  if(st.free) parts.push('무상 '+_fmtN(st.free));
  if(st.md) parts.push('계약 '+_fmtN(st.md));
  if(st.po) parts.push('PO '+_fmtN(st.po));
  if(st.pend) parts.push('<span class="cls-pend">미분류 '+_fmtN(st.pend)+'</span>');
  return '<b>'+_fmtN(st.total)+'일</b><div class="cls-sub">'+parts.join(' · ')+'</div>';
}
function _remainCell(estMd,used){
  if(!estMd) return '<span class="cls-dim">-</span>';
  var d=estMd-used;
  return d>=0?'잔여 '+_fmtN(d)+'일':'<span class="cls-over">초과 '+_fmtN(-d)+'일</span>';
}
function _excessCell(m){
  if(!m.estMd) return '<span class="cls-dim">-</span>';
  if(!m.excessDate) return '<span class="cls-dim">없음</span>';
  return '<span class="'+(m.excessPast?'cls-over':'cls-warn')+'">'+m.excessDate+(m.excessPast?' (이미 초과)':'')+'</span>';
}
function setSiteMdSetup(siteId,on){
  var s=S.sites.find(function(x){return x.id===siteId;});
  if(!s) return;
  s.mdIncludeSetup=!!on;_touch(s);saveData();
  var el=document.getElementById('pmSiteDaysWrap');
  if(el) el.outerHTML=renderSiteDaysSummary();
}
function togglePmTypeCols(){
  _pmSiteTypeCols=!_pmSiteTypeCols;
  var el=document.getElementById('pmSiteDaysWrap');
  if(el) el.outerHTML=renderSiteDaysSummary();
}
function renderSiteDaysSummary(){
  var agg=aggregateSiteDays(_pmSitePeriod);
  var periods=[['all','전체'],['year','올해'],['r12','최근12개월']];
  var pend=pendingList().length,issues=allIssues().filter(function(x){return x.issues.some(function(i){return i.level!=='info';});}).length;
  var html='<div class="pm-site-days" id="pmSiteDaysWrap">';
  html+='<div class="pm-site-days-head">';
  html+='<span class="pm-site-days-title" onclick="togglePmSiteCollapse()" style="cursor:pointer">'
      +(_pmSiteCollapsed?'▶':'▼')+' 📍 사이트별 Total 출장일수</span>';
  html+='<div class="pm-ctrl-group" style="margin-left:auto;gap:6px">';
  html+='<button class="btn sm'+(pend?' warn':'')+'" onclick="openReclassModal()">과금·위치 재분류'+(pend?' ('+pend+'건)':'')+'</button>';
  html+='<button class="btn sm" onclick="openDataCheckModal()">데이터 점검'+(issues?' ('+issues+'건)':'')+'</button>';
  periods.forEach(function(p){
    html+='<button class="pm-filter-btn'+(_pmSitePeriod===p[0]?' on':'')+'" onclick="setPmSitePeriod(\''+p[0]+'\')">'+p[1]+'</button>';
  });
  html+='</div></div>';
  if(!_pmSiteCollapsed){
    var siteTypeList=[['hq','본사',TYPE_COLOR.hq],['outsource','외주',TYPE_COLOR.outsource],['localOutsource','현지외주',TYPE_COLOR.localOutsource],['tech','기술',TYPE_COLOR.tech],['vision','비전',TYPE_COLOR.vision],['host','호스트',TYPE_COLOR.host]];
    html+='<div class="pm-ctrl-group" style="flex-wrap:wrap;gap:4px;padding:8px 12px 0 12px">';
    html+='<span style="font-size:var(--fs-xs);color:var(--tx-faint)">인원</span>';
    siteTypeList.forEach(function(t){
      var isOn=_pmSiteTypeFilter[t[0]];
      html+='<label class="pm-type-ck'+(isOn?' on':'')+'" style="--tc:'+t[2]+';'+(isOn?'background:'+t[2]+'22;border-color:'+t[2]:'')+'"><input type="checkbox"'+(isOn?' checked':'')+' onchange="toggleSiteTypeFilter(\''+t[0]+'\')">'+t[1]+'</label>';
    });
    html+='<span style="width:1px;height:16px;background:var(--bd-main);margin:0 2px"></span>';
    html+='<label class="pm-type-ck'+(_pmSiteTypeCols?' on':'')+'" style="--tc:#666666"><input type="checkbox"'+(_pmSiteTypeCols?' checked':'')+' onchange="togglePmTypeCols()">인원구분별 열 보기</label>';
    html+='</div>';
    html+='<div class="cls-note">계약 M/D 소진 = <b>유상-계약 M/D 소진</b>만 집계합니다(해외 + 국내 최종 납품처, 국내 납품 전 셋업은 사이트별 \'셋업 포함\' 설정 시). '
        +'<b>미분류</b>(유상 체크/체크 해제 확인 필요)는 소진에서 제외하고 \'미분류(일)\'로 따로 표시합니다. 숨김 일정도 모두 집계에 포함하며, 같은 사이트 안에서 같은 사람·같은 날은 한 번만 셉니다'
        +(agg.dup?' (중복 제외 '+_fmtN(agg.dup)+'일)':'')+'.</div>';
    if(!agg.groups.length){
      html+='<div style="padding:12px;color:var(--tx-muted);font-size:var(--fs-sm)">해당 조건에 등록된 출장 일정이 없습니다.</div>';
    }else{
      var tc=_pmSiteTypeCols;
      var ncol=11+(tc?3:0);
      html+='<div style="overflow-x:auto"><table class="pm-person-table pm-site-days-table"><thead><tr>'
          +'<th>사이트</th><th>해외</th><th>국내(납품 전 셋업)</th><th>국내(최종 납품처)</th>'
          +(tc?'<th>본사·기술·비전·호스트</th><th>외주</th><th>현지외주</th>':'')
          +'<th>소진 (기준일까지)</th><th>계획 포함 소진</th><th>견적 M/D</th><th>잔여/초과</th><th>예상 초과 시작일</th><th>미분류(일)</th><th>인원수</th>'
          +'</tr></thead><tbody>';
      agg.groups.forEach(function(g){
        html+='<tr class="pm-site-group-row"><td colspan="'+ncol+'">'+_esc(g.groupName)+'</td></tr>';
        g.sites.forEach(function(m){
          var sid=m.site.id.replace(/'/g,"\\'");
          var setupNote=(!siteMdSetup(m.site)&&m.loc.dom_setup.md>0)?'<div class="cls-sub">셋업 '+_fmtN(m.loc.dom_setup.md)+'일 제외</div>':'';
          html+='<tr>'
            +'<td onclick="openSiteRosterModal(\''+sid+'\')" style="cursor:pointer"><span class="pm-site-chip" style="background:'+m.site.color+'"></span>'+_esc(m.site.name)+'</td>'
            +'<td>'+_locCell(m.loc.overseas)+'</td><td>'+_locCell(m.loc.dom_setup)+'</td><td>'+_locCell(m.loc.dom_final)+'</td>'
            +(tc?'<td>'+_locCell(m.type.hq)+'</td><td>'+_locCell(m.type.out)+'</td><td>'+_locCell(m.type.local)+'</td>':'')
            +'<td><b>'+_fmtN(m.mdUsed)+'일</b>'+setupNote
            +'<label class="cls-sm"><input type="checkbox"'+(siteMdSetup(m.site)?' checked':'')+' onchange="setSiteMdSetup(\''+sid+'\',this.checked)"> 셋업 포함</label></td>'
            +'<td>'+_fmtN(m.mdPlan)+'일</td>'
            +'<td><input type="number" min="0" class="pm-estmd-inp" value="'+(m.estMd||'')+'" placeholder="-" onchange="updSiteEstMd(\''+sid+'\',this.value)"></td>'
            +'<td>'+_remainCell(m.estMd,m.mdUsed)+'</td><td>'+_excessCell(m)+'</td>'
            +'<td>'+(m.pendAll?'<span class="cls-pend">'+_fmtN(m.pendAll)+'일</span>':'<span class="cls-dim">0</span>')+'</td>'
            +'<td>'+m.personCount+'명</td></tr>';
        });
      });
      var G=agg.grand;
      html+='<tr class="pm-site-total-row"><td>합계</td><td>'+_locCell(G.loc.overseas)+'</td><td>'+_locCell(G.loc.dom_setup)+'</td><td>'+_locCell(G.loc.dom_final)+'</td>'
        +(tc?'<td>'+_locCell(G.type.hq)+'</td><td>'+_locCell(G.type.out)+'</td><td>'+_locCell(G.type.local)+'</td>':'')
        +'<td>'+_fmtN(G.mdUsed)+'일</td><td>'+_fmtN(G.mdPlan)+'일</td><td>'+(G.estMd?_fmtN(G.estMd)+'일':'-')+'</td><td>'+_remainCell(G.estMd,G.mdUsed)+'</td><td></td>'
        +'<td>'+(G.pendAll?_fmtN(G.pendAll)+'일':'0')+'</td><td>'+G.persons+'명</td></tr>';
      html+='</tbody></table></div>';
    }
  }
  html+='</div>';
  return html;
}

/* 사이트 클릭 → 인원 로스터 (요약표와 같은 집계 엔진 사용 → 합계 일치) */
function openSiteRosterModal(siteId){
  var site=S.sites.find(function(s){return s.id===siteId;});
  if(!site) return;
  var rows=siteDayRows({period:_pmSitePeriod,types:_pmSiteTypeFilter}).filter(function(r){return r.site.id===siteId&&r.days>0;});
  rows.sort(function(a,b){var x=a.sc.start,y=b.sc.start;return x>y?1:(x<y?-1:String(a.sc.name).localeCompare(String(b.sc.name),'ko'));});
  var total=rows.reduce(function(s,r){return s+r.days;},0);
  var mdSum=rows.reduce(function(s,r){return s+(consumesMd(r)?r.days:0);},0);
  var sid=siteId.replace(/'/g,"\\'");
  var body='<div class="mtit" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
    +'<span>'+_esc(site.name)+' — 인원 출장 로스터</span>'
    +'<button class="btn sm" onclick="exportSiteRosterExcel(\''+sid+'\')">📥 전체 이력 엑셀 다운로드</button></div>';
  if(!rows.length){
    body+='<div style="padding:10px;color:var(--tx-muted);font-size:var(--fs-sm)">해당 조건에 표시할 출장 기록이 없습니다.</div>';
  }else{
    body+='<div style="max-height:60vh;overflow-y:auto"><table class="pm-person-table"><thead><tr>'
      +'<th>이름</th><th>인원구분</th><th>업무</th><th>위치</th><th>과금</th><th>출발일</th><th>복귀일</th><th>집계 일수</th></tr></thead><tbody>';
    rows.forEach(function(r){
      var payTxt=isPendingPay(r.pay)?'<span class="cls-pend">미분류</span>':_esc(PAY_SHORT[r.pay]+(r.pay==='po'&&r.sc.poNo?' '+r.sc.poNo:''));
      body+='<tr style="cursor:pointer" onclick="openEditSc(\''+r.sc.id+'\')">'
        +'<td>'+_esc(r.sc.name)+'</td><td>'+_esc(TYPE_LBL[r.type]||r.type)+'</td><td>'+_esc(r.sc.task||'')+'</td>'
        +'<td>'+LOC_SHORT[r.loc]+'</td><td>'+payTxt+'</td><td>'+r.sc.start+'</td><td>'+r.sc.end+'</td><td>'+r.days+'일</td></tr>';
    });
    body+='<tr class="pm-site-total-row"><td colspan="7">합계 (이 중 계약 M/D 소진 '+_fmtN(mdSum)+'일)</td><td>'+_fmtN(total)+'일</td></tr></tbody></table></div>';
  }
  body+='<div class="mfoot"><button class="btn sm" onclick="cm()">닫기</button></div>';
  mw(body,true);
}

/* ═══════════════ 분류 적용 / 이력 ═══════════════ */
function pendingList(){
  return S.schedules.filter(function(sc){return !sc.canceled&&isPendingPay(effectivePay(sc));});
}
/* 과금·위치를 일정에 기록하고 변경 이력을 남긴다. opt:{loc,poNo,freeReason,reason,note} */
function applyClass(sc,pay,opt){
  opt=opt||{};
  var before=histSnap(sc);
  var loc=opt.loc||effectiveLoc(sc);
  sc.payType=pay||'';
  sc.loc=loc;
  sc.poNo=(pay==='po')?(opt.poNo||''):'';
  sc.freeReason=(pay==='free')?(opt.freeReason||''):'';
  if(pay){sc.paid=(pay==='po');}   /* 구버전 호환: 별도 PO = 예전 '유상' */
  sc.domestic=(loc!=='overseas');   /* 구버전 호환: 국내 판정 */
  _touch(sc);
  appendHist(sc,before,opt.reason||'재분류',opt.note||'');
  return sc;
}
function histHtml(sc){
  var h=getHist(sc);
  if(!h.length) return '';
  var rows=h.slice().reverse().map(function(x){
    var d=new Date(x.t),ts=d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate())+' '+_pad2(d.getHours())+':'+_pad2(d.getMinutes());
    function s(o){
      if(!o) return '-';
      return (o.payType?PAY_SHORT[o.payType]:(o.paid===true?'유상(미분류)':(o.paid===false?'체크해제':'기본')))
        +(o.freeReason?'('+(FREE_REASON[o.freeReason]||o.freeReason)+')':'')+' / '+(LOC_SHORT[o.loc]||(o.domestic?'국내':'해외(기본)'))
        +(o.poNo?' / PO '+o.poNo:'')+' / '+o.start+'~'+o.end+(o.canceled?' / 취소':'');
    }
    return '<tr><td>'+ts+'</td><td>'+_esc(x.why||'')+(x.note?' — '+_esc(x.note):'')+'</td><td>'+_esc(s(x.from))+'</td><td>'+_esc(s(x.to))+'</td></tr>';
  }).join('');
  return '<details class="cls-hist"><summary>변경 이력 '+h.length+'건</summary><table><thead><tr><th>시각</th><th>사유</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>'+rows+'</tbody></table></details>';
}

/* ═══════════════ 일정 등록/수정 모달용 조각 ═══════════════ */
function clsFormHtml(ex,siteId){
  var pay=ex?effectivePay(ex):'md';
  var pend=isPendingPay(pay);
  var site=siteId?S.sites.find(function(s){return s.id===siteId;}):(ex?schedSite(ex):null);
  var loc=ex?effectiveLoc(ex):siteDefaultLoc(site);
  var h='<div class="fg"><label class="fl">과금 구분'+(pend?' <span class="cls-pend">미분류 — 선택하세요</span>':'')+'</label><div class="cls-radios" id="f_pay_wrap">';
  ['free','md','po'].forEach(function(k){
    h+='<label class="chkrow"><input type="radio" name="f_pay" value="'+k+'"'+(pay===k?' checked':'')+' onchange="clsPayChanged()">'+PAY_LABEL[k]+'</label>';
  });
  h+='</div><div id="f_po_wrap" style="display:'+(pay==='po'?'block':'none')+';margin-top:6px"><input type="text" id="f_po" value="'+_esc(ex&&ex.poNo?ex.poNo:'')+'" placeholder="PO 번호 / 메모 (선택)"></div>'
   +'<div id="f_freer_wrap" style="display:'+(pay==='free'?'block':'none')+';margin-top:6px"><select id="f_freer"><option value="">무상 사유 (선택)</option>'
   +Object.keys(FREE_REASON).map(function(k){return '<option value="'+k+'"'+(ex&&ex.freeReason===k?' selected':'')+'>'+FREE_REASON[k]+'</option>';}).join('')+'</select></div></div>';
  h+='<div class="fg"><label class="fl">위치 <span id="f_loc_hint" class="cls-dim"></span></label><select id="f_loc">'
   +Object.keys(LOC_LABEL).map(function(k){return '<option value="'+k+'"'+(loc===k?' selected':'')+'>'+LOC_LABEL[k]+'</option>';}).join('')+'</select></div>';
  var cn=!!(ex&&ex.canceled);
  h+='<div class="fg"><label class="chkrow" style="margin:0"><input type="checkbox" id="f_cancel_ck"'+(cn?' checked':'')+' onchange="clsCancelChanged()">취소된 출장 (모든 집계에서 제외 · 삭제되지 않음)</label>'
   +'<input type="text" id="f_cancel_why" style="display:'+(cn?'block':'none')+';margin-top:6px" placeholder="취소 사유 (필수)" value="'+_esc(ex&&ex.cancelReason?ex.cancelReason:'')+'"></div>';
  return h;
}
function clsPayChanged(){
  var v=(document.querySelector('input[name="f_pay"]:checked')||{}).value;
  var po=document.getElementById('f_po_wrap'),fr=document.getElementById('f_freer_wrap');
  if(po) po.style.display=v==='po'?'block':'none';
  if(fr) fr.style.display=v==='free'?'block':'none';
}
function clsSiteChanged(siteId){
  var site=S.sites.find(function(s){return s.id===siteId;});
  var sel=document.getElementById('f_loc'),hint=document.getElementById('f_loc_hint');
  if(!sel||!site) return;
  var def=siteDefaultLoc(site);
  sel.value=def;
  if(hint) hint.textContent='(사이트 납품처 기준 기본값: '+LOC_LABEL[def]+')';
}
function clsCancelChanged(){
  var ck=document.getElementById('f_cancel_ck'),w=document.getElementById('f_cancel_why');
  if(w) w.style.display=(ck&&ck.checked)?'block':'none';
}
function clsReadForm(){
  var r=document.querySelector('input[name="f_pay"]:checked');
  var ck=document.getElementById('f_cancel_ck');
  return {pay:r?r.value:'',loc:(document.getElementById('f_loc')||{}).value||'',
    poNo:((document.getElementById('f_po')||{}).value||'').trim(),freeReason:(document.getElementById('f_freer')||{}).value||'',
    canceled:!!(ck&&ck.checked),cancelReason:((document.getElementById('f_cancel_why')||{}).value||'').trim()};
}

/* ═══════════════ 재분류 모달 ═══════════════ */
var _cls={filter:'all',site:'__battery__',q:'',cur:null,sel:{},reason:'재분류',note:''};
function _clsBatteryIds(){
  var ids={};
  S.sites.forEach(function(st){if(CLS_BATTERY_SITES.indexOf(st.name)>=0||CLS_BATTERY_SITES.indexOf(st.id)>=0) ids[st.id]=1;});
  return ids;
}
function _clsBackupOk(){
  var ts=0;try{ts=Number(localStorage.getItem('bu3_last_backup_ts')||0);}catch(e){}
  return ts&&(Date.now()-ts)<6*3600*1000;
}
function _clsBackupTxt(){
  var ts=0;try{ts=Number(localStorage.getItem('bu3_last_backup_ts')||0);}catch(e){}
  if(!ts) return '아직 백업하지 않음';
  var d=new Date(ts);return d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate())+' '+_pad2(d.getHours())+':'+_pad2(d.getMinutes());
}
function _clsFiltered(){
  var q=(_cls.q||'').trim();
  var list=pendingList().filter(function(sc){
    var p=effectivePay(sc);
    if(_cls.filter==='paid'&&p!=='pending_paid') return false;
    if(_cls.filter==='unchecked'&&p!=='pending_unchecked') return false;
    if(_cls.site==='__battery__'){var pb=schedProject(sc);if(!pb||!_clsBatteryIds()[pb.siteId]) return false;}
    else if(_cls.site){var pr=schedProject(sc);if(!pr||pr.siteId!==_cls.site) return false;}
    if(q&&String(sc.name||'').indexOf(q)<0&&String(sc.task||'').indexOf(q)<0) return false;
    return true;
  });
  list.sort(function(a,b){
    var sa=_siteNameOf(a),sb=_siteNameOf(b);
    return sa!==sb?sa.localeCompare(sb,'ko'):(String(a.name).localeCompare(String(b.name),'ko')||(a.start>b.start?1:-1));
  });
  return list;
}
function openReclassModal(){
  _cls={filter:'all',site:'__battery__',q:'',cur:null,sel:{},reason:'재분류',note:''};
  if(!Object.keys(_clsBatteryIds()).length) _cls.site='';   /* 해당 사이트가 데이터에 하나도 없으면 전체로 */
  _renderReclass();
  document.removeEventListener('keydown',_clsKey);
  document.addEventListener('keydown',_clsKey);
}
function _clsKey(e){
  var card=document.getElementById('clsCard');
  if(!card){document.removeEventListener('keydown',_clsKey);return;}
  var t=e.target&&e.target.tagName;
  if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA') return;
  if(e.key==='1') clsSaveCur('free');
  else if(e.key==='2') clsSaveCur('md');
  else if(e.key==='3') clsSaveCur('po');
  else if(e.key==='s'||e.key==='S') clsSkip();
  else if(e.key==='p'||e.key==='P'){if(_cls.cur) openSplitModal(_cls.cur,'reclass');}
}
function _clsCurSc(list){
  var cur=_cls.cur&&list.find(function(s){return s.id===_cls.cur;});
  if(!cur){cur=list[0]||null;_cls.cur=cur?cur.id:null;}
  return cur;
}
function _renderReclass(){
  var all=pendingList(),list=_clsFiltered(),cur=_clsCurSc(list);
  var nPaid=all.filter(function(s){return effectivePay(s)==='pending_paid';}).length,nUn=all.length-nPaid;
  var ok=_clsBackupOk();
  var siteOpts=_sitesWithProjects().map(function(s){return '<option value="'+s.id+'"'+(_cls.site===s.id?' selected':'')+'>'+_esc(s.name)+'</option>';}).join('');
  var h='<div class="mtit">과금·위치 재분류 <span class="cls-sub" style="font-weight:400">미분류 전체 '+all.length+'건 (유상 체크 '+nPaid+' · 체크 해제 '+nUn+') · 현재 필터 '+list.length+'건</span></div>';
  h+='<div class="cls-bkbar'+(ok?' ok':'')+'"><span>① 일괄 수정 전 전체 백업 — '+(ok?'백업 완료 ('+_clsBackupTxt()+')':'백업이 필요합니다 (마지막: '+_clsBackupTxt()+')')+'</span>'
    +'<button class="btn sm" onclick="clsBackup()">백업 파일 다운로드</button></div>';
  h+='<div class="cls-filters"><select onchange="_cls.filter=this.value;_cls.cur=null;_renderReclass()">'
    +[['all','전체'],['paid','유상 체크됨'],['unchecked','체크 해제됨']].map(function(o){return '<option value="'+o[0]+'"'+(_cls.filter===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>'
    +'<select onchange="_cls.site=this.value;_cls.cur=null;_renderReclass()"><option value="__battery__"'+(_cls.site==='__battery__'?' selected':'')+'>2차전지 사이트 ('+CLS_BATTERY_SITES.join('·')+')</option><option value=""'+(_cls.site===''?' selected':'')+'>모든 사이트</option>'+siteOpts+'</select>'
    +'<input type="text" placeholder="이름·업무 검색" value="'+_esc(_cls.q)+'" onchange="_cls.q=this.value;_cls.cur=null;_renderReclass()" style="width:160px"></div>';
  if(!cur){
    h+='<div class="cls-empty">'+(all.length?'조건에 맞는 미분류 일정이 없습니다.':'🎉 미분류 일정이 모두 정리되었습니다.')+'</div>';
  }else{
    var site=schedSite(cur),proj=schedProject(cur),loc=effectiveLoc(cur),p=effectivePay(cur);
    h+='<div class="cls-card" id="clsCard"><div class="cls-cardhd">현재 항목 '+(list.indexOf(cur)+1)+' / '+list.length+'</div>'
      +'<div class="cls-cardrow"><b>'+_esc(site?site.name:'-')+'</b> · '+_esc(proj?proj.name:'-')+'</div>'
      +'<div class="cls-cardrow">'+_esc(cur.name||'미지정')+' ('+_esc(TYPE_LBL[cur.type]||cur.type)+') · '+_esc(cur.task||'')+' · '+cur.start+' ~ '+cur.end+' ('+(isRealDate(cur.start)&&isRealDate(cur.end)?dd(cur.start,cur.end):'?')+'일)</div>'
      +'<div class="cls-cardrow">현재 상태: <span class="cls-pend">'+(p==='pending_paid'?'유상 체크됨':'체크 해제됨')+'</span>'
      +'</div>'
      +'<div class="cls-cardrow cls-cardctl"><label>위치 <select id="c_loc">'+Object.keys(LOC_LABEL).map(function(k){return '<option value="'+k+'"'+(loc===k?' selected':'')+'>'+LOC_LABEL[k]+'</option>';}).join('')+'</select></label>'
      +'<label>PO 번호 <input type="text" id="c_po" placeholder="별도 PO일 때 (선택)" style="width:150px"></label>'
      +'<label>무상 사유 <select id="c_fr"><option value="">선택 안 함</option>'+Object.keys(FREE_REASON).map(function(k){return '<option value="'+k+'">'+FREE_REASON[k]+'</option>';}).join('')+'</select></label></div>'
      +'<div class="cls-cardrow cls-cardctl"><label>변경 사유 <select id="c_why">'+['재분류','오입력 정정','기타'].map(function(r){return '<option'+(_cls.reason===r?' selected':'')+'>'+r+'</option>';}).join('')+'</select></label>'
      +'<label>메모 <input type="text" id="c_note" value="'+_esc(_cls.note)+'" placeholder="선택" style="width:220px"></label></div>'
      +'<div class="cls-bigbtns">'
      +'<button class="btn pri" '+(ok?'':'disabled ')+'onclick="clsSaveCur(\'free\')">1 무상</button>'
      +'<button class="btn pri" '+(ok?'':'disabled ')+'onclick="clsSaveCur(\'md\')">2 유상-계약 M/D 소진</button>'
      +'<button class="btn pri" '+(ok?'':'disabled ')+'onclick="clsSaveCur(\'po\')">3 유상-별도 PO</button>'
      +'<span style="flex:1"></span>'
      +'<button class="btn" onclick="clsSkip()">건너뛰기 (S)</button>'
      +'<button class="btn" onclick="openSplitModal(\''+cur.id+'\',\'reclass\')">날짜로 분할 (P)</button>'
      +'<button class="btn" onclick="openEditSc(\''+cur.id+'\')">일정 열기</button></div>'
      +(ok?'':'<div class="cls-sub" style="margin-top:6px">백업을 받기 전에는 저장할 수 없습니다.</div>')
      +histHtml(cur)+'</div>';
    var nSel=Object.keys(_cls.sel).filter(function(k){return _cls.sel[k];}).length;
    h+='<div class="cls-bulk"><span>목록에서 선택한 '+nSel+'건을</span>'
      +'<button class="btn sm" '+(ok&&nSel?'':'disabled ')+'onclick="clsBulk(\'free\')">무상</button>'
      +'<button class="btn sm" '+(ok&&nSel?'':'disabled ')+'onclick="clsBulk(\'md\')">계약 M/D 소진</button>'
      +'<button class="btn sm" '+(ok&&nSel?'':'disabled ')+'onclick="clsBulk(\'po\')">별도 PO</button><span>으로 일괄 지정 (위치는 각 일정의 현재 값 유지)</span>'
      +'<span style="flex:1"></span><button class="btn sm" onclick="clsSelAll(true)">전체 선택</button><button class="btn sm" onclick="clsSelAll(false)">선택 해제</button></div>';
    h+='<div class="cls-list"><table class="pm-person-table"><thead><tr><th></th><th>사이트</th><th>이름</th><th>인원구분</th><th>업무</th><th>기간</th><th>상태</th><th>위치</th></tr></thead><tbody>';
    list.forEach(function(sc){
      var pp=effectivePay(sc);
      h+='<tr class="'+(sc.id===cur.id?'cls-currow':'')+'" onclick="_cls.cur=\''+sc.id+'\';_renderReclass()">'
        +'<td onclick="event.stopPropagation()"><input type="checkbox"'+(_cls.sel[sc.id]?' checked':'')+' onchange="_cls.sel[\''+sc.id+'\']=this.checked;_renderReclass()"></td>'
        +'<td>'+_esc(_siteNameOf(sc))+'</td><td>'+_esc(sc.name||'미지정')+'</td><td>'+_esc(TYPE_LBL[sc.type]||sc.type)+'</td><td>'+_esc(sc.task||'')+'</td>'
        +'<td>'+sc.start+'~'+sc.end+'</td><td>'+(pp==='pending_paid'?'유상 체크':'체크 해제')+'</td><td>'+LOC_SHORT[effectiveLoc(sc)]+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='<div class="mfoot"><span class="cls-sub" style="margin-right:auto">단축키: 1 무상 · 2 계약 M/D · 3 별도 PO · S 건너뛰기 · P 분할</span><button class="btn sm" onclick="clsClose()">닫기</button></div>';
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xwide">'+h+'</div></div>';
}
function clsClose(){document.removeEventListener('keydown',_clsKey);cm();renderAll();}
function clsBackup(){
  if(downloadDataBackup(true)){_renderReclass();}
}
function clsSkip(){
  var list=_clsFiltered();
  if(!list.length) return;
  var i=list.findIndex(function(s){return s.id===_cls.cur;});
  _cls.cur=list[(i+1)%list.length].id;
  _renderReclass();
}
function _clsReadCard(){
  var g=function(id){var el=document.getElementById(id);return el?el.value:'';};
  _cls.reason=g('c_why')||'재분류';_cls.note=g('c_note');
  return {loc:g('c_loc'),poNo:g('c_po').trim(),freeReason:g('c_fr'),reason:_cls.reason,note:_cls.note};
}
function clsSaveCur(pay){
  if(!_clsBackupOk()){alert('먼저 전체 백업 파일을 다운로드하세요.');return;}
  var list=_clsFiltered();
  var sc=list.find(function(s){return s.id===_cls.cur;});
  if(!sc||!document.getElementById('clsCard')) return;
  var i=list.indexOf(sc);
  applyClass(sc,pay,_clsReadCard());
  saveData();
  var next=_clsFiltered();
  _cls.cur=next.length?next[Math.min(i,next.length-1)].id:null;
  delete _cls.sel[sc.id];
  _renderReclass();
}
function clsSelAll(on){
  _cls.sel={};
  if(on) _clsFiltered().forEach(function(s){_cls.sel[s.id]=true;});
  _renderReclass();
}
function clsBulk(pay){
  if(!_clsBackupOk()){alert('먼저 전체 백업 파일을 다운로드하세요.');return;}
  var ids=Object.keys(_cls.sel).filter(function(k){return _cls.sel[k];});
  if(!ids.length) return;
  if(!confirm('선택한 '+ids.length+'건을 \''+PAY_LABEL[pay]+'\' 으로 지정합니다. 계속할까요?\n(변경 이력이 각 일정에 기록됩니다)')) return;
  var o=_clsReadCard();
  ids.forEach(function(id){
    var sc=S.schedules.find(function(s){return s.id===id;});
    if(sc) applyClass(sc,pay,{loc:effectiveLoc(sc),poNo:'',freeReason:o.freeReason,reason:o.reason,note:(o.note?o.note+' ':'')+'(일괄 '+ids.length+'건)'});
  });
  _cls.sel={};_cls.cur=null;
  saveData();_renderReclass();
}

/* ═══════════════ 일정 분할 ═══════════════ */
var _split={id:null,from:'',};
function _prevDay(s){var d=pd(s);d.setDate(d.getDate()-1);return _ymd(d);}
function openSplitModal(id,from){
  var sc=S.schedules.find(function(s){return s.id===id;});
  if(!sc) return;
  if(!isRealDate(sc.start)||!isRealDate(sc.end)||sc.start>=sc.end){alert('날짜가 올바르지 않거나 하루짜리 일정이라 분할할 수 없습니다. 먼저 일정 날짜를 고치세요.');return;}
  _split={id:id,from:from||''};
  var loc=effectiveLoc(sc);
  function partHtml(n,defPay){
    return '<div class="cls-part"><div class="cls-parthd" id="sp_hd'+n+'"></div>'
      +'<div class="cls-radios">'+['free','md','po'].map(function(k){return '<label class="chkrow"><input type="radio" name="sp_pay'+n+'" value="'+k+'"'+(defPay===k?' checked':'')+'>'+PAY_LABEL[k]+'</label>';}).join('')+'</div>'
      +'<div class="cls-cardctl"><label>위치 <select id="sp_loc'+n+'">'+Object.keys(LOC_LABEL).map(function(k){return '<option value="'+k+'"'+(loc===k?' selected':'')+'>'+LOC_LABEL[k]+'</option>';}).join('')+'</select></label>'
      +'<label>PO <input type="text" id="sp_po'+n+'" placeholder="별도 PO일 때 (선택)" style="width:140px"></label></div></div>';
  }
  var h='<div class="mtit">일정 날짜로 분할</div>'
    +'<div class="cls-cardrow"><b>'+_esc(_siteNameOf(sc))+'</b> · '+_esc(sc.name||'미지정')+' · '+_esc(sc.task||'')+' · '+sc.start+' ~ '+sc.end+' ('+dd(sc.start,sc.end)+'일)</div>'
    +'<div class="fg"><label class="fl">분할 기준일 — 이 날짜부터 뒤 구간이 시작됩니다 (출발일 다음날 ~ 복귀일)</label><input type="text" id="sp_date" maxlength="10" placeholder="YYYY-MM-DD" oninput="fmtDateInput(this);splitPreview()" style="width:160px"></div>'
    +'<div class="cls-twocol">'+partHtml(1,'md')+partHtml(2,'po')+'</div>'
    +'<div class="cls-cardctl" style="margin-top:8px"><label>변경 사유 <select id="sp_why"><option>재분류</option><option>오입력 정정</option><option>기타</option></select></label>'
    +'<label>메모 <input type="text" id="sp_note" placeholder="선택" style="width:260px"></label></div>'
    +'<div class="mfoot"><button class="btn sm" onclick="splitBack()">취소</button><button class="btn sm pri" onclick="splitSave()">분할 저장</button></div>';
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xwide">'+h+'</div></div>';
  splitPreview();
}
function splitPreview(){
  var sc=S.schedules.find(function(s){return s.id===_split.id;});
  if(!sc) return;
  var v=(document.getElementById('sp_date')||{}).value||'';
  var h1=document.getElementById('sp_hd1'),h2=document.getElementById('sp_hd2');
  if(isRealDate(v)&&v>sc.start&&v<=sc.end){
    h1.textContent='앞 구간: '+sc.start+' ~ '+_prevDay(v)+' ('+dd(sc.start,_prevDay(v))+'일)';
    h2.textContent='뒤 구간: '+v+' ~ '+sc.end+' ('+dd(v,sc.end)+'일)';
  }else{
    h1.textContent='앞 구간: (기준일을 입력하세요)';h2.textContent='뒤 구간: (기준일을 입력하세요)';
  }
}
function splitBack(){
  if(_split.from==='reclass') _renderReclass(); else if(_split.from==='check') openDataCheckModal(); else cm();
}
function splitSave(){
  var sc=S.schedules.find(function(s){return s.id===_split.id;});
  if(!sc) return;
  var v=(document.getElementById('sp_date')||{}).value||'';
  if(!isRealDate(v)||!(v>sc.start&&v<=sc.end)){alert('분할 기준일은 출발일 다음날부터 복귀일 사이의 올바른 날짜여야 합니다.');return;}
  function rd(n){
    var r=document.querySelector('input[name="sp_pay'+n+'"]:checked');
    return {pay:r?r.value:'',loc:document.getElementById('sp_loc'+n).value,poNo:document.getElementById('sp_po'+n).value.trim()};
  }
  var a=rd(1),b=rd(2);
  if(!a.pay||!b.pay){alert('앞 구간과 뒤 구간의 과금 구분을 모두 선택하세요.');return;}
  if(!_clsBackupOk()&&!confirm('최근 6시간 안에 전체 백업을 받지 않았습니다. 그래도 분할할까요?\n(취소 후 재분류 화면에서 백업을 받을 수 있습니다)')) return;
  var why=document.getElementById('sp_why').value,note=(document.getElementById('sp_note').value||'').trim();
  var origEnd=sc.end,before=histSnap(sc);
  var part2=JSON.parse(JSON.stringify(sc));
  part2.id=genId('s',S.schedules);
  part2.hist='';
  var sg=sc.splitGroup||genId('sg');
  sc.splitGroup=sg;part2.splitGroup=sg;
  sc.end=_prevDay(v);part2.start=v;part2.end=origEnd;
  applyClass(sc,a.pay,{loc:a.loc,poNo:a.poNo,reason:'분할('+why+')',note:'앞 구간 '+sc.start+'~'+sc.end+(note?' / '+note:'')});
  /* 앞 구간 이력의 '변경 전'은 분할 이전 원본 값으로 교체 */
  var h1=getHist(sc);if(h1.length){h1[h1.length-1].from=before;sc.hist=JSON.stringify(h1);}
  applyClass(part2,b.pay,{loc:b.loc,poNo:b.poNo,reason:'분할('+why+')',note:'뒤 구간 '+part2.start+'~'+part2.end+' (원본 '+before.start+'~'+before.end+')'+(note?' / '+note:'')});
  var h2=getHist(part2);if(h2.length){h2[h2.length-1].from=before;part2.hist=JSON.stringify(h2);}
  S.schedules.push(part2);
  saveData();renderAll();
  splitBack();
}

/* ═══════════════ 데이터 점검 모달 ═══════════════ */
var _chk={filter:'all'};
function openDataCheckModal(filter){
  _chk.filter=filter||'all';
  _renderDataCheck();
}
function _chkHas(x,fn){return x.issues.some(fn);}
function _chkIsCross(x){return _chkHas(x,function(i){return !!i.cross;});}
function _chkMatch(x,k){
  if(k==='all') return true;
  if(k==='cross') return _chkIsCross(x);
  if(k==='info') return _chkHas(x,function(i){return i.level==='info';});
  if(k==='conflict') return _chkHas(x,function(i){return i.code==='conflict'&&i.level!=='info';});
  return _chkHas(x,function(i){return i.code===k;});
}
function _chkRow(x,projOpts){
  var sc=x.sc,orphan=_chkHas(x,function(i){return i.code==='orphan';});
  var h='<tr class="'+(_chkIsCross(x)?'cls-crossrow':'')+'"><td>'+_esc(sc.name||'미지정')+'</td><td>'+_esc(_siteNameOf(sc))+' · '+_esc(sc.task||'')+'</td><td>'+_esc(sc.start)+'~'+_esc(sc.end)+'</td>'
    +'<td><ul class="cls-isslist">'+x.issues.map(function(i){return '<li>'+(i.level==='info'?'ℹ ':'⚠ ')+_esc(i.text)+'</li>';}).join('')+'</ul></td><td style="white-space:nowrap">';
  if(orphan){
    h+='<select id="rc_'+sc.id+'" style="width:190px"><option value="">프로젝트 선택…</option>'+projOpts+'</select> <button class="btn sm" onclick="chkReconnect(\''+sc.id+'\')">재연결</button>';
  }else{
    h+='<button class="btn sm" onclick="openEditSc(\''+sc.id+'\')">수정</button>';
    if(isRealDate(sc.start)&&isRealDate(sc.end)&&sc.start<sc.end) h+=' <button class="btn sm" onclick="openSplitModal(\''+sc.id+'\',\'check\')">분할</button>';
  }
  return h+'</td></tr>';
}
function _renderDataCheck(){
  var all=allIssues();
  var labels={all:'전체',cross:'견적 확정 전 정리 필요',conflict:'겹침',info:'참고('+INFO_OVERLAP_MAX_DAYS+'일 이하 겹침)',date:'날짜 오류',orphan:'프로젝트 없음',loc:'위치',cancelq:'취소 확인 필요'};
  var count={};
  Object.keys(labels).forEach(function(k){count[k]=all.filter(function(x){return _chkMatch(x,k);}).length;});
  var list=all.filter(function(x){return _chkMatch(x,_chk.filter);});
  var order=function(a,b){return String(a.sc.name).localeCompare(String(b.sc.name),'ko')||(a.sc.start>b.sc.start?1:-1);};
  var top=list.filter(_chkIsCross).sort(order),rest=list.filter(function(x){return !_chkIsCross(x);}).sort(order);
  var pairs=0;top.forEach(function(x){x.issues.forEach(function(i){if(i.cross) pairs++;});});pairs=Math.round(pairs/2);
  var ign=ignoreShortOverlap();
  if(ign){delete labels.info;delete count.info;}
  var h='<div class="mtit">데이터 점검 <span class="cls-sub" style="font-weight:400">hidden(숨김) 값과 관계없이 전체 일정을 검사합니다</span></div>';
  h+='<div class="cls-filters"><label class="pm-type-ck'+(ign?' on':'')+'" style="--tc:#666666"><input type="checkbox"'+(ign?' checked':'')+' onchange="setIgnoreShortOverlap(this.checked)">'+INFO_OVERLAP_MAX_DAYS+'일 이하 겹침 무시 (출국·도착 이동일)</label>'+Object.keys(labels).map(function(k){
    return '<button class="pm-filter-btn'+(_chk.filter===k?' on':'')+'" onclick="_chk.filter=\''+k+'\';_renderDataCheck()">'+labels[k]+' '+count[k]+'</button>';}).join('')+'</div>';
  if(!list.length){h+='<div class="cls-empty">점검할 항목이 없습니다.</div>';}
  else{
    var projOpts=S.projects.map(function(p){var s=S.sites.find(function(x){return x.id===p.siteId;});return '<option value="'+p.id+'">'+_esc((s?s.name:'-')+' / '+p.name)+'</option>';}).join('');
    var head='<thead><tr><th>이름</th><th>사이트·업무</th><th>기간</th><th>이상점 사유</th><th></th></tr></thead>';
    h+='<div class="cls-list" style="max-height:60vh"><table class="pm-person-table cls-chk">'+head+'<tbody>';
    if(top.length){
      h+='<tr class="cls-sechd cross"><td colspan="5">견적 확정 전 정리 필요 — 사이트 간 동시 출장 ('+pairs+'쌍 · 일정 '+top.length+'건). 집계에는 각 사이트에 그대로 반영되어 있습니다.</td></tr>';
      top.forEach(function(x){h+=_chkRow(x,projOpts);});
    }
    if(rest.length){
      if(top.length) h+='<tr class="cls-sechd"><td colspan="5">그 밖의 점검 항목 ('+rest.length+'건)</td></tr>';
      rest.forEach(function(x){h+=_chkRow(x,projOpts);});
    }
    h+='</tbody></table></div>';
  }
  h+='<div class="mfoot"><button class="btn sm" onclick="cm();renderAll()">닫기</button></div>';
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xwide">'+h+'</div></div>';
}
function chkReconnect(id){
  var sc=S.schedules.find(function(s){return s.id===id;});
  var pid=(document.getElementById('rc_'+id)||{}).value;
  if(!sc||!pid){alert('연결할 프로젝트를 선택하세요.');return;}
  var before=histSnap(sc);
  sc.projectId=pid;_touch(sc);
  appendHist(sc,before,'프로젝트 재연결','');
  saveData();renderAll();_renderDataCheck();
}
