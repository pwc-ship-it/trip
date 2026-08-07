/* ── 타임라인 ── */
var WPX=42,_months=[],_totPx=0,_sd=null;
var _ganttZoom='week'; // 'week'|'biweek'|'month'
var _ganttSearch='';   // 담당자명 검색
var _typeShow={sched:true,event:true,work:true}; // 출장일정/이벤트/작업 표시 토글
function toggleTypeShow(k,v){_typeShow[k]=v;renderGantt();}
var WPX_MAP={'week':42,'biweek':22,'month':12};
function ganttFixedW(){var el=document.querySelector('.ghfixed');return (el&&el.offsetWidth)||300;} // 좌측 고정컬럼 실측 폭(반응형 CSS 추종)
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
  document.getElementById('gwrap').style.width=(ganttFixedW()+_totPx)+'px';
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
  allDiv.onclick=function(){S.filterSite='all';S.filterSites=[];renderAll();};
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
    lbl.innerHTML=_esc(grp.name)+'<span class="scnt grp-cnt">'+grpCnt+'</span>';
    lbl.onclick=(function(gk){return function(){S.filterSite=gk;S.filterSites=[];renderAll();};})(grpKey);
    el.appendChild(lbl);
    var isMulti=S.filterSites.length>0;
    grpSites.forEach(function(site){
      var cnt=S.schedules.filter(function(s){var p=S.projects.find(function(p){return p.id===s.projectId;});return p&&p.siteId===site.id&&_sVisible(s);}).length;
      var checked=S.filterSites.indexOf(site.id)>=0;
      var on=isMulti?checked:S.filterSite===site.id;
      var d=document.createElement('div');d.className='sit'+(on?' on':'');
      d.innerHTML='<input type="checkbox" class="sit-cb"'+(checked?' checked':'')+'><div class="sdot" style="background:'+site.color+'"></div><span class="sname">'+_esc(site.name)+'</span><span class="scnt">'+cnt+'</span>';
      d.onclick=(function(sid){return function(){S.filterSite=sid;S.filterSites=[];renderAll();};})(site.id);
      d.querySelector('.sit-cb').onclick=(function(sid){return function(e){
        e.stopPropagation();
        var idx=S.filterSites.indexOf(sid);
        if(idx>=0)S.filterSites.splice(idx,1);else S.filterSites.push(sid);
        renderAll();
      };})(site.id);
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
  var domesticTag=sched.domestic?' [국내]':'';
  var txt=dr+' · '+sched.name+' ['+tl+']'+domesticTag+' ('+days+'일)'+(sched.note?' · '+sched.note:'');
  var bar=document.createElement('div');bar.className='bar '+barCls(sched);bar.style.cssText='left:'+sp+'px;width:'+wp+'px';bar.title=txt;
  bar.onclick=(function(id){return function(){openEditSc(id);};})(sched.id);
  var lbl=document.createElement('span');lbl.className='barlbl';lbl.textContent=txt;bar.appendChild(lbl);el.appendChild(bar);
}
function wtLabelTxt(wt){
  var days=dd(wt.start,wt.end),dr=fmt(wt.start)+'~'+fmt(wt.end);
  return dr+' · '+wt.title+(wt.note?' ('+wt.note+')':'')+'  '+days+'일';
}
var WTLBL_FONT="500 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
var WTLBL_PAD=14; // .barlbl-wk padding:0 7px 양쪽
function measureTextW(text,font){
  var c=measureTextW._c||(measureTextW._c=document.createElement('canvas'));
  var ctx=c.getContext('2d');ctx.font=font;
  return ctx.measureText(text).width;
}
function addWtBar(el,wt){
  var sp=d2px(wt.start),ep=d2px(wt.end)+Math.round(WPX/7),wp=Math.max(ep-sp,8);
  var col=EVC.find(function(c){return c.id===wt.colorId;})||EVC.find(function(c){return c.id==='blue';})||EVC[0];
  // 완료/진행/예정 색조 조정
  var isDone=TODAY>pd(wt.end),isGoing=TODAY>=pd(wt.start)&&TODAY<=pd(wt.end);
  var alpha=isDone?'99':isGoing?'dd':'ff';
  var barColor=col.bg+(alpha==='ff'?'':alpha);
  var txt=wtLabelTxt(wt);
  var bar=document.createElement('div');
  bar.className='bar bar-wk';
  bar.style.cssText='left:'+sp+'px;width:'+wp+'px;background:'+barColor+';opacity:'+(isDone?'.55':'1');
  bar.title=txt;
  bar.onclick=(function(id){return function(){openEditWt(id);};})(wt.id);
  var lbl=document.createElement('span');lbl.className='barlbl-wk';lbl.textContent=txt;bar.appendChild(lbl);el.appendChild(bar);
}

/* ── 간트 렌더 ── */
/* 작업 레인 배정: 막대+라벨 실제 텍스트 폭 기준으로 겹치지 않는 레인에 배치 (필요하면 3줄 이상도 사용)
   같은 group(예: 라인명) 태그를 가진 작업들은 항상 같은 레인에 고정 배치 — 순차 단계를 한 줄로 이어붙여 보여줄 때 사용 */
function assignWtLanes(wts){
  var GAP=8; // 레인 내 인접 작업 사이 최소 여백(px)
  var laneEnd=[]; // 각 레인이 점유 중인 오른쪽 끝(px)
  var groupLane={}; // group명 -> 고정 레인 인덱스
  wts.forEach(function(wt){
    var sp=d2px(wt.start),ep=d2px(wt.end)+Math.round(WPX/7);
    var barW=Math.max(ep-sp,8);
    var lblW=measureTextW(wtLabelTxt(wt),WTLBL_FONT)+WTLBL_PAD;
    var occupiedEnd=sp+Math.max(barW,lblW);
    var lane;
    if(wt.group&&groupLane.hasOwnProperty(wt.group)){
      lane=groupLane[wt.group];
      laneEnd[lane]=Math.max(laneEnd[lane],occupiedEnd);
    } else {
      lane=laneEnd.findIndex(function(end){return sp>=end+GAP;});
      if(lane===-1){lane=laneEnd.length;laneEnd.push(occupiedEnd);}
      else laneEnd[lane]=occupiedEnd;
      if(wt.group)groupLane[wt.group]=lane;
    }
    wt._lane=lane;
  });
  return laneEnd.length;
}

function renderGantt(){
  var body=document.getElementById('gbody');body.innerHTML='';
  // 숨김 보기 버튼 상태 동기화 (showHidden이 localStorage에서 복원된 경우 반영)
  var _btn=document.getElementById('btnHidden');
  if(_btn){_btn.textContent=S.showHidden?'숨김 숨기기':'숨김 보기';_btn.className='btn'+(S.showHidden?' warn':'');}
  // 오늘 날짜 문자열 (과거 일정 판별용)
  var _td=TODAY;var todayISO=_td.getFullYear()+'-'+String(_td.getMonth()+1).padStart(2,'0')+'-'+String(_td.getDate()).padStart(2,'0');
  // 사이드바와 동일한 그룹→사이트 순서 기준으로 프로젝트 정렬
  var siteOrder={};
  var _so=0;
  var _sideGroups=S.groups&&S.groups.length?S.groups:[{id:'_none'}];
  _sideGroups.forEach(function(grp){
    S.sites.forEach(function(s){if((s.groupId||'_none')===grp.id)siteOrder[s.id]=_so++;});
  });
  S.sites.forEach(function(s){if(siteOrder[s.id]===undefined)siteOrder[s.id]=_so++;});
  var projs=S.projects.filter(function(p){
    // 사이트/그룹 필터 (다중 선택 체크박스가 우선)
    if(S.filterSites&&S.filterSites.length){
      if(S.filterSites.indexOf(p.siteId)<0)return false;
    } else if(S.filterSite!=='all'){
      if(S.filterSite.slice(0,2)==='g:'){
        var gid=S.filterSite.slice(2);
        var pSite=S.sites.find(function(s){return s.id===p.siteId;});
        if(!pSite||(pSite.groupId||'_none')!==gid)return false;
      } else if(p.siteId!==S.filterSite){return false;}
    }
    // 과거 일정도 숨김 처리 (종료일 < 오늘) + 출장일정/이벤트/작업 표시 토글
    var hasVisible=_typeShow.sched&&S.schedules.some(function(s){
      if(s.projectId!==p.id)return false;
      var isPast=s.end&&s.end<todayISO;
      if(!((!s.hidden&&!isPast)||S.showHidden))return false;
      if(_ganttSearch&&s.name.toLowerCase().indexOf(_ganttSearch)<0)return false;
      return true;
    });
    if(_ganttSearch) return hasVisible;
    var hasEvent=_typeShow.event&&S.events.some(function(e){
      if(e.projectId!==p.id)return false;
      var isPast=e.date&&e.date<todayISO;
      return !isPast||S.showHidden;
    });
    var hasWork=_typeShow.work&&S.workTasks.some(function(w){return w.projectId===p.id;});
    return hasVisible||hasEvent||hasWork;
  }).sort(function(a,b){return (siteOrder[a.siteId]||0)-(siteOrder[b.siteId]||0);});

  if(!projs.length){body.innerHTML='<div class="empty">등록된 출장 일정이 없습니다.</div>';return;}
  var ri=0;
  projs.forEach(function(proj){
    var site=S.sites.find(function(s){return s.id===proj.siteId;});var sc=site?site.color:'#666';
    var scheds=!_typeShow.sched?[]:S.schedules.filter(function(s){
      if(s.projectId!==proj.id)return false;
      var isPast=s.end&&s.end<todayISO;
      if(!((!s.hidden&&!isPast)||S.showHidden))return false;
      if(_ganttSearch&&s.name.toLowerCase().indexOf(_ganttSearch)<0)return false;
      return true;
    });
    var evts=(_ganttSearch||!_typeShow.event)?[]:S.events.filter(function(e){
      if(e.projectId!==proj.id)return false;
      var isPast=e.date&&e.date<todayISO;
      return !isPast||S.showHidden;
    });
    var wts=(_ganttSearch||!_typeShow.work)?[]:S.workTasks.filter(function(w){
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
    var gf=document.createElement('div');gf.className='grpfix';gf.innerHTML='<span class="grpbadge" style="background:'+sc+'">'+_esc(site?site.name:proj.siteId)+'</span><span class="grpname">'+_esc(proj.name)+'</span>';
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
        // 레인 레이블: 그룹(라인) 태그가 전부 같으면 그걸로, 아니면 첫 작업 제목(1개) 또는 숫자(여러개)
        var laneGroup=laneTasks.length&&laneTasks[0].group&&laneTasks.every(function(w){return w.group===laneTasks[0].group;})?laneTasks[0].group:null;
        var laneLabel=laneGroup||(laneTasks.length===1?laneTasks[0].title:(li+1)+'번 레인 ('+laneTasks.length+'건)');
        wkf.innerHTML='<span class="wkfix-label">'+_esc(laneLabel)+'</span>';
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
        gf2.innerHTML='<div class="gtask">'+(idx===0?_esc(task):'')+'</div>'
          +'<div class="gperson">'+_esc(sched.name)
          +'<span class="type-badge" style="background:'+tc+'">'+_esc(tl)+'</span>'
          +(isDone?'<span class="done-badge">완료</span>':'')
          +(sched.hidden?'<span class="hidden-badge">숨김</span>':'')
          +'<span class="gbadge">'+dr+' · '+days+'일</span></div>';
        var rtl=makeTL(28,'gtl',evts,false);addBar(rtl,sched);row.appendChild(gf2);row.appendChild(rtl);body.appendChild(row);
      });
    });
  });
  // ponytail: 400=300*4/3 이었던 기존 비율(고정컬럼+여유폭)을 보존한 상대식. 여백감이 안 맞으면 4/3 계수만 튜닝.
  document.getElementById('gscroll').scrollLeft=Math.max(0,tpx()-Math.round(ganttFixedW()*4/3));
}

function renderAll(){initTL();renderSidebar();renderHeader();renderGantt();if(_activeTab==='person')renderPersonTab();if(_activeTab==='vision')renderVisionTab();}
function setGanttZoom(z){_ganttZoom=z;renderAll();_updateZoomBtns();}
function _updateZoomBtns(){
  ['week','biweek','month'].forEach(function(z){
    var btn=document.getElementById('zoomBtn_'+z);
    if(btn) btn.className='btn'+(z===_ganttZoom?' active':'');
  });
}
function ganttSearch(v){_ganttSearch=v.trim().toLowerCase();renderGantt();}
