/* ── 타임라인 ── */
var WPX=42,_months=[],_totPx=0,_sd=null;
var _ganttZoom='week'; // 'week'|'biweek'|'month'
var _ganttSearch='';   // 담당자명 검색
var WPX_MAP={'week':42,'biweek':22,'month':12};
var GANTT_TODAY_OFFSET=400; // 오늘날짜 스크롤 오프셋(px). 값↑ → 오늘이 왼쪽, 값↓ → 오늘이 오른쪽
function calcRange(){
  var minD=new Date(TODAY.getFullYear(),TODAY.getMonth()-1,1),maxD=new Date(TODAY.getFullYear(),TODAY.getMonth()+3,0);
  var all=[];S.schedules.forEach(function(s){all.push(s.start);all.push(s.end);});S.events.forEach(function(e){all.push(e.date);});
  if(all.length){var sorted=all.map(function(d){return pd(d);}).sort(function(a,b){return a-b;});if(sorted[0]<minD)minD=new Date(sorted[0].getFullYear(),sorted[0].getMonth(),1);var mx=sorted[sorted.length-1];var mxE=new Date(mx.getFullYear(),mx.getMonth()+2,0);if(mxE>maxD)maxD=mxE;}
  return{start:minD,end:maxD};
}
function initTL(){
  WPX=WPX_MAP[_ganttZoom]||42;
  var r=calcRange();_sd=new Date(r.start);_sd.setHours(0,0,0,0);_months=[];
  var cur=new Date(r.start.getFullYear(),r.start.getMonth(),1);
  while(cur<=r.end){var y=cur.getFullYear(),m=cur.getMonth()+1,days=new Date(y,m,0).getDate();_months.push({y:y,m:m,days:days,weeks:Math.ceil(days/7),label:(m===1?y+'년 ':'')+m+'월'});cur=new Date(y,m,1);}
  _totPx=Math.round(_months.reduce(function(s,m){return s+m.days;},0)/7*WPX);
}
function d2px(ds){return Math.round(Math.max(0,Math.round((pd(ds)-_sd)/86400000))/7*WPX);}
function tpx(){var y=TODAY.getFullYear(),m=String(TODAY.getMonth()+1).padStart(2,'0'),d=String(TODAY.getDate()).padStart(2,'0');return d2px(y+'-'+m+'-'+d);}
function mPx(mon){return Math.round(mon.days/7*WPX);}
function wPx(mon,wi){var s=wi*7+1,e=Math.min(s+6,mon.days);return Math.round((e-s+1)/7*WPX);}

/* ── 헤더 렌더 ── */
function renderHeader(){
  var tl=document.getElementById('ghTl');tl.innerHTML='';
  _months.forEach(function(mon){var mpx=mPx(mon);var div=document.createElement('div');div.className='ghmb';div.style.width=mpx+'px';var wkh='';for(var i=0;i<mon.weeks;i++){var p=wPx(mon,i);wkh+='<div class="ghwk" style="width:'+p+'px;min-width:'+p+'px">'+(i+1)+'주</div>';}div.innerHTML='<div class="ghmn">'+mon.label+'</div><div class="ghwks">'+wkh+'</div>';tl.appendChild(div);});
  var db=document.getElementById('ghDb');db.innerHTML='';addGrid(db);
  var tp=tpx();if(tp>=0&&tp<=_totPx){var ln=document.createElement('div');ln.className='tdln';ln.style.left=tp+'px';db.appendChild(ln);var lb=document.createElement('div');lb.className='tdlb';lb.style.left=(tp+3)+'px';lb.textContent=todayLbl();db.appendChild(lb);}
  document.getElementById('gwrap').style.width=(300+_totPx)+'px';
}

/* ── 사이드바 (그룹별) ── */
function renderSidebar(){
  var el=document.getElementById('siteList');el.innerHTML='';
  // 전체 보기
  var _today=TODAY;var _tiso=_today.getFullYear()+'-'+String(_today.getMonth()+1).padStart(2,'0')+'-'+String(_today.getDate()).padStart(2,'0');
  function _sVisible(s){var isPast=s.end&&s.end<_tiso;return (!s.hidden&&!isPast)||S.showHidden;}
  var allDiv=document.createElement('div');
  allDiv.className='sit-all'+(S.filterSite==='all'?' on':'');
  var totalCnt=S.schedules.filter(_sVisible).length;
  allDiv.innerHTML='<div class="sdot" style="background:#666"></div><span class="sname">전체 보기</span><span class="scnt">'+totalCnt+'</span>';
  allDiv.onclick=function(){S.filterSite='all';renderAll();};
  el.appendChild(allDiv);

  // 그룹별
  var groups=S.groups&&S.groups.length?S.groups:[{id:'_none',name:'사이트'}];
  groups.forEach(function(grp){
    var grpSites=S.sites.filter(function(s){return (s.groupId||'_none')===grp.id;});
    if(!grpSites.length)return;
    var grpKey='g:'+grp.id;
    var grpCnt=S.schedules.filter(function(sc){
      var p=S.projects.find(function(p){return p.id===sc.projectId;});
      if(!p)return false;
      var site=S.sites.find(function(s){return s.id===p.siteId;});
      return site&&(site.groupId||'_none')===grp.id&&_sVisible(sc);
    }).length;
    var lbl=document.createElement('div');
    lbl.className='grplbl'+(S.filterSite===grpKey?' on':'');
    lbl.innerHTML=grp.name+'<span class="scnt grp-cnt">'+grpCnt+'</span>';
    lbl.onclick=(function(gk){return function(){S.filterSite=gk;renderAll();};})(grpKey);
    el.appendChild(lbl);
    grpSites.forEach(function(site){
      var cnt=S.schedules.filter(function(s){var p=S.projects.find(function(p){return p.id===s.projectId;});return p&&p.siteId===site.id&&_sVisible(s);}).length;
      var d=document.createElement('div');d.className='sit'+(S.filterSite===site.id?' on':'');
      d.innerHTML='<div class="sdot" style="background:'+site.color+'"></div><span class="sname">'+site.name+'</span><span class="scnt">'+cnt+'</span>';
      d.onclick=(function(sid){return function(){S.filterSite=sid;renderAll();};})(site.id);
      el.appendChild(d);
    });
  });
}

/* ── 그리드/이벤트 ── */
function addGrid(el){var xPx=0;_months.forEach(function(mon,mi){if(mi>0){var ln=document.createElement('div');ln.className='gl mo';ln.style.left=xPx+'px';el.appendChild(ln);}for(var w=1;w<mon.weeks;w++){var ln=document.createElement('div');ln.className='gl';ln.style.left=(xPx+w*WPX)+'px';el.appendChild(ln);}xPx+=mPx(mon);});}
function addTodayLine(el){var px=tpx();if(px<0||px>_totPx)return;var ln=document.createElement('div');ln.className='tlnb';ln.style.left=px+'px';el.appendChild(ln);}

/* 이벤트 칩 겹침 처리 */
function addEv(el,evts,chips){
  evts.forEach(function(evt){
    var col=EVC.find(function(c){return c.id===evt.colorId;})||EVC[0];
    var px=d2px(evt.date);
    var ln=document.createElement('div');ln.className='evln';ln.style.cssText='left:'+px+'px;background:'+col.bg+';opacity:'+(chips?'.9':'.25');el.appendChild(ln);
    if(!chips)return;
    var ch=document.createElement('div');ch.className='evchip';
    ch.style.cssText='left:'+(px+3)+'px;background:'+col.bg;
    ch.setAttribute('data-px', px);
    ch.title=fmt(evt.date)+' '+evt.title; // hover 시 전체 내용
    ch.textContent=fmt(evt.date)+' '+evt.title;
    ch.onclick=(function(id){return function(){openEditEv(id);};})(evt.id);
    el.appendChild(ch);
  });
  // 겹침 처리: 칩들을 px 기준 정렬 후 가까운 것은 너비 제한
  if(chips){
    var chipEls=Array.prototype.slice.call(el.querySelectorAll('.evchip')).sort(function(a,b){return parseInt(a.getAttribute('data-px'))-parseInt(b.getAttribute('data-px'));});
    for(var i=0;i<chipEls.length-1;i++){
      var cur=chipEls[i], next=chipEls[i+1];
      var curPx=parseInt(cur.getAttribute('data-px'));
      var nextPx=parseInt(next.getAttribute('data-px'));
      var gap=nextPx-curPx;
      if(gap<80){  // 80px 이내면 겹침
        cur.style.maxWidth=Math.max(gap-6,20)+'px';
        cur.style.overflow='hidden';
        cur.style.textOverflow='ellipsis';
      }
    }
  }
}

function makeTL(h,cls,evts,chips){var el=document.createElement('div');el.className=cls;el.style.cssText='flex:1;position:relative;min-height:'+h+'px;height:'+h+'px';addGrid(el);addTodayLine(el);if(evts)addEv(el,evts,chips);return el;}
function addBar(el,sched){
  var sp=d2px(sched.start),ep=d2px(sched.end)+Math.round(WPX/7),wp=Math.max(ep-sp,8);
  var days=dd(sched.start,sched.end),dr=fmt(sched.start)+'~'+fmt(sched.end);
  var tl=TYPE_LBL[sched.type]||sched.type;
  var txt=dr+' · '+sched.name+' ['+tl+'] ('+days+'일)'+(sched.note?' · '+sched.note:'');
  var bar=document.createElement('div');bar.className='bar '+barCls(sched);bar.style.cssText='left:'+sp+'px;width:'+wp+'px';bar.title=txt;
  bar.onclick=(function(id){return function(){openEditSc(id);};})(sched.id);
  var lbl=document.createElement('span');lbl.className='barlbl';lbl.textContent=txt;bar.appendChild(lbl);el.appendChild(bar);
}
function addWtBar(el,wt){
  var sp=d2px(wt.start),ep=d2px(wt.end)+Math.round(WPX/7),wp=Math.max(ep-sp,8);
  var days=dd(wt.start,wt.end),dr=fmt(wt.start)+'~'+fmt(wt.end);
  var col=EVC.find(function(c){return c.id===wt.colorId;})||EVC.find(function(c){return c.id==='blue';})||EVC[0];
  // 완료/진행/예정 색조 조정
  var isDone=TODAY>pd(wt.end),isGoing=TODAY>=pd(wt.start)&&TODAY<=pd(wt.end);
  var alpha=isDone?'99':isGoing?'dd':'ff';
  var barColor=col.bg+(alpha==='ff'?'':alpha);
  var txt=dr+' · '+wt.title+(wt.note?' ('+wt.note+')':'')+'  '+days+'일';
  var bar=document.createElement('div');
  bar.className='bar bar-wk';
  bar.style.cssText='left:'+sp+'px;width:'+wp+'px;background:'+barColor+';opacity:'+(isDone?'.55':'1');
  bar.title=txt;
  bar.onclick=(function(id){return function(){openEditWt(id);};})(wt.id);
  var lbl=document.createElement('span');lbl.className='barlbl-wk';lbl.textContent=txt;bar.appendChild(lbl);el.appendChild(bar);
}

/* ── 간트 렌더 ── */
/* 작업 레인 배정: 홀짝 2레인 고정 배분 (1번째·3번째·5번째→레인0, 2번째·4번째·6번째→레인1) */
function assignWtLanes(wts){
  wts.forEach(function(wt,i){wt._lane=i%2;});
  return Math.min(2,wts.length);
}

function renderGantt(){
  var body=document.getElementById('gbody');body.innerHTML='';
  // 오늘 날짜 문자열 (과거 일정 판별용)
  var _td=TODAY;var todayISO=_td.getFullYear()+'-'+String(_td.getMonth()+1).padStart(2,'0')+'-'+String(_td.getDate()).padStart(2,'0');
  // S.sites 순서 기준으로 프로젝트 정렬
  var siteOrder={};S.sites.forEach(function(s,i){siteOrder[s.id]=i;});
  var projs=S.projects.filter(function(p){
    // 사이트/그룹 필터
    if(S.filterSite!=='all'){
      if(S.filterSite.slice(0,2)==='g:'){
        var gid=S.filterSite.slice(2);
        var pSite=S.sites.find(function(s){return s.id===p.siteId;});
        if(!pSite||(pSite.groupId||'_none')!==gid)return false;
      } else if(p.siteId!==S.filterSite){return false;}
    }
    // 과거 일정도 숨김 처리 (종료일 < 오늘)
    var hasVisible=S.schedules.some(function(s){
      if(s.projectId!==p.id)return false;
      var isPast=s.end&&s.end<todayISO;
      if(!((!s.hidden&&!isPast)||S.showHidden))return false;
      if(_ganttSearch&&s.name.toLowerCase().indexOf(_ganttSearch)<0)return false;
      return true;
    });
    if(_ganttSearch) return hasVisible;
    var hasEvent=S.events.some(function(e){return e.projectId===p.id;});
    var hasWork=S.workTasks.some(function(w){return w.projectId===p.id;});
    return hasVisible||hasEvent||hasWork;
  }).sort(function(a,b){return (siteOrder[a.siteId]||0)-(siteOrder[b.siteId]||0);});

  if(!projs.length){body.innerHTML='<div class="empty">등록된 출장 일정이 없습니다.</div>';return;}
  var ri=0;
  projs.forEach(function(proj){
    var site=S.sites.find(function(s){return s.id===proj.siteId;});var sc=site?site.color:'#666';
    var scheds=S.schedules.filter(function(s){
      if(s.projectId!==proj.id)return false;
      var isPast=s.end&&s.end<todayISO;
      if(!((!s.hidden&&!isPast)||S.showHidden))return false;
      if(_ganttSearch&&s.name.toLowerCase().indexOf(_ganttSearch)<0)return false;
      return true;
    });
    var evts=_ganttSearch?[]:S.events.filter(function(e){return e.projectId===proj.id;});
    var wts=_ganttSearch?[]:S.workTasks.filter(function(w){
      if(w.projectId!==proj.id) return false;
      var isPast=w.end&&w.end<todayISO;
      return !isPast||S.showHidden;
    }).map(function(w){return JSON.parse(JSON.stringify(w));});
    // 작업 레인 배정
    var wtLanes=0;
    if(wts.length){
      wts.sort(function(a,b){return a.start>b.start?1:-1;});
      wtLanes=assignWtLanes(wts);
    }
    // 그룹 헤더
    var grp=document.createElement('div');grp.className='grprow';
    var gf=document.createElement('div');gf.className='grpfix';gf.innerHTML='<span class="grpbadge" style="background:'+sc+'">'+(site?site.name:proj.siteId)+'</span><span class="grpname">'+proj.name+'</span>';
    grp.appendChild(gf);grp.appendChild(makeTL(26,'grptl',evts,false));body.appendChild(grp);
    // 이벤트 행
    if(evts.length){var er=document.createElement('div');er.className='evrow';var ef=document.createElement('div');ef.className='evfix';ef.textContent='★ 주요 이벤트';er.appendChild(ef);er.appendChild(makeTL(22,'evtl',evts,true));body.appendChild(er);}
    // ── 작업 행 (레인별)
    if(wts.length){
      // 작업 섹션 헤더
      var wsec=document.createElement('div');wsec.className='wksecrow';
      var wsf=document.createElement('div');wsf.className='wksecfix';wsf.innerHTML='<span class="wksecfix-lbl">▣ 작업</span>';
      var wst=makeTL(18,'wksectrl',null,false);
      wsec.appendChild(wsf);wsec.appendChild(wst);body.appendChild(wsec);
      for(var li=0;li<wtLanes;li++){
        var laneTasks=wts.filter(function(w){return w._lane===li;});
        var wkr=document.createElement('div');wkr.className='wkrow';
        var wkf=document.createElement('div');wkf.className='wkfix';
        // 레인 레이블: 첫 번째 작업 제목 표시 (여러 개면 숫자)
        var laneLabel=laneTasks.length===1?laneTasks[0].title:(li+1)+'번 레인 ('+laneTasks.length+'건)';
        wkf.innerHTML='<span class="wkfix-label">'+laneLabel+'</span>';
        var wktl=makeTL(22,'wktl',null,false);
        // 각 작업 바 추가
        laneTasks.forEach(function(wt){
          addWtBar(wktl,wt);
        });
        wkr.appendChild(wkf);wkr.appendChild(wktl);body.appendChild(wkr);
      }
    }
    // 출장 행
    var tasks=[];scheds.forEach(function(s){if(tasks.indexOf(s.task)<0)tasks.push(s.task);});
    tasks.forEach(function(task){
      scheds.filter(function(s){return s.task===task;}).forEach(function(sched,idx){
        var days=dd(sched.start,sched.end),dr=fmt(sched.start)+'~'+fmt(sched.end);
        var isDone=TODAY>pd(sched.end);var isEven=(ri%2===0);ri++;
        var row=document.createElement('div');
        row.className='grow '+(isEven?'even':'odd')+(isDone?' done':'')+(sched.hidden?' hidden-row':'');
        var gf2=document.createElement('div');gf2.className='gfix';
        var tc=TYPE_COLOR[sched.type]||'#555';var tl=TYPE_LBL[sched.type]||sched.type;
        gf2.innerHTML='<div class="gtask">'+(idx===0?task:'')+'</div>'
          +'<div class="gperson">'+sched.name
          +'<span class="type-badge" style="background:'+tc+'">'+tl+'</span>'
          +(isDone?'<span class="done-badge">완료</span>':'')
          +(sched.hidden?'<span class="hidden-badge">숨김</span>':'')
          +'<span class="gbadge">'+dr+' · '+days+'일</span></div>';
        var rtl=makeTL(28,'gtl',evts,false);addBar(rtl,sched);row.appendChild(gf2);row.appendChild(rtl);body.appendChild(row);
      });
    });
  });
  document.getElementById('gscroll').scrollLeft=Math.max(0,tpx()-GANTT_TODAY_OFFSET);
}

function renderAll(){initTL();renderSidebar();renderHeader();renderGantt();if(_activeTab==='person')renderPersonTab();}
function setGanttZoom(z){_ganttZoom=z;renderAll();_updateZoomBtns();}
function _updateZoomBtns(){
  ['week','biweek','month'].forEach(function(z){
    var btn=document.getElementById('zoomBtn_'+z);
    if(btn) btn.className='btn'+(z===_ganttZoom?' active':'');
  });
}
function ganttSearch(v){_ganttSearch=v.trim().toLowerCase();renderGantt();}
