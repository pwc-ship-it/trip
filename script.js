var EVC=[{id:'purple',bg:'#534AB7'},{id:'red',bg:'#b52020'},{id:'green',bg:'#1a8c66'},{id:'amber',bg:'#b8720a'},{id:'coral',bg:'#c04a22'},{id:'blue',bg:'#1558a0'}];
var TYPE_LBL={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
var TYPE_COLOR={hq:'#1a5a9a',outsource:'#8a5a00',tech:'#2a7a5a',vision:'#6a3a9a',host:'#7a2a2a'};

/* ── 상태 ── */
var S={filterSite:'all',showHidden:false,groups:[],sites:[],projects:[],schedules:[],events:[],workTasks:[],equipItems:[],equipUnits:[]};

function deepCopy(o){return JSON.parse(JSON.stringify(o));}
function normDate(s){
  // 어떤 형식이든 YYYY-MM-DD로 정규화
  if(!s)return '';
  // 이미 YYYY-MM-DD 형식이면 그대로
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()))return String(s).trim();
  // Date 객체 문자열 등 다른 형식은 파싱 후 변환
  var d=new Date(s);
  if(isNaN(d.getTime()))return s;
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function loadData(){
  // localStorage 캐시 있으면 우선 사용, 없으면 DEF
  try{
    var cached=localStorage.getItem(CACHE_KEY);
    if(cached){
      var d=JSON.parse(cached);
      if(d&&Array.isArray(d.sites)&&d.sites.length){
        S.groups=d.groups||[];S.sites=d.sites;S.projects=d.projects;
        S.schedules=(d.schedules||[]).map(function(sc){
          sc.start=normDate(sc.start);sc.end=normDate(sc.end);
          if(typeof sc.hidden==='string'){
            sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          }
          return sc;
        });
        S.events=d.events||[];
        S.workTasks=d.workTasks||[];
        S.equipItems=(d.equipItems&&d.equipItems.length)?d.equipItems:deepCopy(DEF.equipItems||[]);
        S.equipUnits=d.equipUnits||[];
        return;
      }
    }
  }catch(e){}
  // 캐시 없으면 DEF 기본 데이터
  var def=deepCopy(DEF);
  S.groups=def.groups||[];S.sites=def.sites;S.projects=def.projects;
  S.schedules=def.schedules;S.events=def.events;S.workTasks=def.workTasks||[];
  S.equipItems=def.equipItems||[];S.equipUnits=def.equipUnits||[];
}
function saveCache(data){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
  }catch(e){}
}
function saveData(){
  // 1. 즉시 localStorage 캐시 업데이트 (새로고침 시 최신 상태 보장)
  saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits});
  // 2. 비동기로 Sheets에 저장
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:')return;
  fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({action:'save',groups:S.groups,sites:S.sites,
      projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,
      equipItems:S.equipItems,equipUnits:S.equipUnits})
  }).then(function(r){return r.json();})
  .then(function(data){
    if(data.error)console.warn('자동저장 실패:',data.error);
    else updateConnStatus('ok');
  })
  .catch(function(err){
    console.warn('자동저장 실패:',err.message);
    updateConnStatus('err');
  });
}
function updateConnStatus(state){
  var led=document.getElementById('connLed');
  var txt=document.getElementById('connTxt');
  if(!led)return;
  if(state==='ok'){led.className='conn-led ok';txt.textContent='연결 정상';}
  else if(state==='err'){led.className='conn-led err';txt.textContent='저장 실패';}
}


var SHEETS_LS_KEY='trip_sheets_url';
var CACHE_KEY='trip_data_cache';  // 데이터 캐시용
var CACHE_TS_KEY='trip_cache_ts'; // 캐시 타임스탬프
var DEFAULT_SHEETS_URL='https://script.google.com/macros/s/AKfycbwzOXzciY5Rh6BEZn6kyjbogzoTwoD0SCCaCnTcZRVEYKJOPr-GcJF0CsOlxlhqYBX0vA/exec';
// 최초 접속 시 기본 URL 자동 설정
(function(){
  try{if(!localStorage.getItem(SHEETS_LS_KEY))localStorage.setItem(SHEETS_LS_KEY,DEFAULT_SHEETS_URL);}catch(e){}
})();
function getSheetsUrl(){try{return localStorage.getItem(SHEETS_LS_KEY)||'';}catch(e){return '';}}
function setSheetsUrl(u){try{localStorage.setItem(SHEETS_LS_KEY,u);}catch(e){}}
function openSheetsSettings(){
  var cur=getSheetsUrl();
  var displayUrl = cur || DEFAULT_SHEETS_URL;
  mw('<div class="mtit">⚙ Sheets 설정</div>'
    +'<div style="font-size:12px;color:#b0b0b8;margin-bottom:12px">Apps Script 웹앱 URL을 입력하세요.</div>'
    +'<div class="fg"><label class="fl">URL</label>'
    +'<input type="text" id="sheets_url" value="'+displayUrl+'" style="font-size:11px"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm warn" onclick="resetSheetsUrl()">기본값</button>'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveSheetsUrl()">저장</button>'
    +'</div>');
}
function saveSheetsUrl(){
  var u=document.getElementById('sheets_url').value.trim();
  if(!u){alert('URL을 입력해주세요.');return;}
  setSheetsUrl(u);cm();
  checkConn();
}
function resetSheetsUrl(){
  document.getElementById('sheets_url').value=DEFAULT_SHEETS_URL;
}

/* ── 연결 상태 확인 ── */
function checkConn(){
  // 클릭 시 수동으로 Sheets에서 최신 데이터 다시 로드
  loadFromSheets(function(){renderAll();});
}

/* ── QR 코드 ── */
function showQR(){
  var url=location.href.split('?')[0];
  var qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(url);
  mw('<div class="mtit" style="text-align:center">📱 QR 코드</div>'
    +'<div style="text-align:center;padding:10px 0">'
    +'<img src="'+qrUrl+'" style="width:220px;height:220px;border-radius:8px;background:#fff;padding:8px">'
    +'</div>'
    +'<div style="text-align:center;font-size:11px;color:#888;margin-bottom:14px;word-break:break-all">'+url+'</div>'
    +'<div class="mfoot" style="justify-content:center"><button class="btn sm" onclick="cm()">닫기</button></div>');
}
function showInd(msg){var d=document.createElement('div');d.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e26;color:#e8e8ec;padding:20px 32px;border-radius:10px;border:1px solid #555;z-index:999;font-size:13px';d.textContent=msg;document.body.appendChild(d);return d;}
function hideInd(d){if(d&&d.parentNode)d.parentNode.removeChild(d);}
function sheetsLoad(){
  // 수동 새로고침용 (연결 확인 버튼에서 사용)
  loadFromSheets(function(){renderAll();});
}
function loadFromSheets(callback){
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){
    if(callback)callback();return;
  }
  var led=document.getElementById('connLed');
  var txt=document.getElementById('connTxt');
  if(led){led.className='conn-led chk';txt.textContent='동기화 중...';}
  fetch(url+'?action=load')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(data){
      if(data.error)throw new Error(data.error);
      if(data.groups&&data.groups.length)S.groups=data.groups;
      if(data.sites&&data.sites.length){
        var oldSites=S.sites;
        S.sites=data.sites.map(function(ns){
          var old=oldSites.find(function(os){return os.id===ns.id;});
          if(!ns.groupId&&old&&old.groupId)ns.groupId=old.groupId;
          return ns;
        });
      }
      if(data.projects&&data.projects.length)S.projects=data.projects;
      if(data.schedules&&data.schedules.length){
        S.schedules=data.schedules.map(function(sc){
          sc.start=normDate(sc.start);sc.end=normDate(sc.end);
          // Sheets에서 hidden이 "TRUE"/"FALSE" 문자열로 오는 경우 변환
          if(typeof sc.hidden === 'string'){
            sc.hidden = sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          }
          return sc;
        });
      }
      if(data.events)S.events=data.events;
      if(data.workTasks)S.workTasks=data.workTasks.map(function(wt){wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;});
      if(data.equipItems&&data.equipItems.length)S.equipItems=data.equipItems;
      if(data.equipUnits)S.equipUnits=data.equipUnits;
      // 성공적으로 로드된 데이터를 캐시에 저장
      saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits});
      if(led){led.className='conn-led ok';txt.textContent='연결 정상';}
      if(callback)callback();
    })
    .catch(function(err){
      console.warn('불러오기 실패:',err.message);
      if(led){led.className='conn-led err';txt.textContent='연결 실패';}
      if(callback)callback(); // 실패해도 DEF 데이터로 렌더
    });
}


/* ── 숨김 토글 ── */
function toggleShowHidden(){
  S.showHidden=!S.showHidden;
  document.getElementById('btnHidden').textContent=S.showHidden?'숨김 숨기기':'숨김 보기';
  document.getElementById('btnHidden').className='btn'+(S.showHidden?' warn':'');
  renderGantt();
}

/* ── 날짜 유틸 ── */
var TODAY=(function(){var d=new Date();d.setHours(0,0,0,0);return d;})();
function pd(s){var d=new Date(s);d.setHours(0,0,0,0);return d;}

function dd(a,b){return Math.round((pd(b)-pd(a))/86400000)+1;}
function fmt(s){var d=pd(s);return String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');}
function fmtFull(s){if(!s)return '';var d=pd(s);return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');}
function todayLbl(){return (TODAY.getMonth()+1)+'/'+TODAY.getDate();}
function barCls(sc){
  var s=pd(sc.start),e=pd(sc.end);
  var isHq=(sc.type==='hq'||sc.type==='tech'||sc.type==='vision'||sc.type==='host');
  if(TODAY>e) return isHq?'bar-hq-done':'bar-out-done';
  if(TODAY>=s)return isHq?'bar-hq-going':'bar-out-going';
  return           isHq?'bar-hq-plan':'bar-out-plan';
}

/* ── 타임라인 ── */
var WPX=42,_months=[],_totPx=0,_sd=null;
function calcRange(){
  var minD=new Date(TODAY.getFullYear(),TODAY.getMonth()-1,1),maxD=new Date(TODAY.getFullYear(),TODAY.getMonth()+3,0);
  var all=[];S.schedules.forEach(function(s){all.push(s.start);all.push(s.end);});S.events.forEach(function(e){all.push(e.date);});
  if(all.length){var sorted=all.map(function(d){return pd(d);}).sort(function(a,b){return a-b;});if(sorted[0]<minD)minD=new Date(sorted[0].getFullYear(),sorted[0].getMonth(),1);var mx=sorted[sorted.length-1];var mxE=new Date(mx.getFullYear(),mx.getMonth()+2,0);if(mxE>maxD)maxD=mxE;}
  return{start:minD,end:maxD};
}
function initTL(){
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
  var allDiv=document.createElement('div');
  allDiv.className='sit-all'+(S.filterSite==='all'?' on':'');
  var totalCnt=S.schedules.filter(function(s){return !s.hidden||S.showHidden;}).length;
  allDiv.innerHTML='<div class="sdot" style="background:#666"></div><span class="sname">전체 보기</span><span class="scnt">'+totalCnt+'</span>';
  allDiv.onclick=function(){S.filterSite='all';renderAll();};
  el.appendChild(allDiv);

  // 그룹별
  var groups=S.groups&&S.groups.length?S.groups:[{id:'_none',name:'사이트'}];
  groups.forEach(function(grp){
    var grpSites=S.sites.filter(function(s){return (s.groupId||'_none')===grp.id;});
    if(!grpSites.length)return;
    var lbl=document.createElement('div');lbl.className='grplbl';lbl.textContent=grp.name;
    el.appendChild(lbl);
    grpSites.forEach(function(site){
      var cnt=S.schedules.filter(function(s){var p=S.projects.find(function(p){return p.id===s.projectId;});return p&&p.siteId===site.id&&(!s.hidden||S.showHidden);}).length;
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
  var lbl=document.createElement('span');lbl.className='barlbl';lbl.textContent=txt;bar.appendChild(lbl);el.appendChild(bar);
}

/* ── 간트 렌더 ── */
/* 작업 레인 배정: 겹치는 작업은 별도 행으로 분리 */
function assignWtLanes(wts){
  // wts: [{start,end,...}] → 각 wt에 lane 번호 부여
  var lanes=[]; // lanes[i] = 마지막으로 끝난 날짜
  wts.forEach(function(wt){
    var assigned=false;
    for(var i=0;i<lanes.length;i++){
      if(wt.start>lanes[i]){ // 이 레인에 들어갈 수 있음
        wt._lane=i;lanes[i]=wt.end;assigned=true;break;
      }
    }
    if(!assigned){wt._lane=lanes.length;lanes.push(wt.end);}
  });
  return lanes.length;
}

function renderGantt(){
  var body=document.getElementById('gbody');body.innerHTML='';
  // S.sites 순서 기준으로 프로젝트 정렬
  var siteOrder={};S.sites.forEach(function(s,i){siteOrder[s.id]=i;});
  var projs=S.projects.filter(function(p){
    if(S.filterSite!=='all'&&p.siteId!==S.filterSite)return false;
    var hasVisible=S.schedules.some(function(s){return s.projectId===p.id&&(!s.hidden||S.showHidden);});
    var hasEvent=S.events.some(function(e){return e.projectId===p.id;});
    var hasWork=S.workTasks.some(function(w){return w.projectId===p.id;});
    return hasVisible||hasEvent||hasWork;
  }).sort(function(a,b){return (siteOrder[a.siteId]||0)-(siteOrder[b.siteId]||0);});

  if(!projs.length){body.innerHTML='<div class="empty">등록된 출장 일정이 없습니다.</div>';return;}
  var ri=0;
  projs.forEach(function(proj){
    var site=S.sites.find(function(s){return s.id===proj.siteId;});var sc=site?site.color:'#666';
    var scheds=S.schedules.filter(function(s){return s.projectId===proj.id&&(!s.hidden||S.showHidden);});
    var evts=S.events.filter(function(e){return e.projectId===proj.id;});
    var wts=S.workTasks.filter(function(w){return w.projectId===proj.id;}).map(function(w){return JSON.parse(JSON.stringify(w));});
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
  document.getElementById('gscroll').scrollLeft=Math.max(0,tpx()-120);
}

function renderAll(){initTL();renderSidebar();renderHeader();renderGantt();if(_activeTab==='person')renderPersonTab();}

/* ── 모달 ── */
var _selCol='purple',_dragIdx=null;
function openModal(t){if(t==='schedule')showSM(null);else if(t==='event')showEM(null);else showSiteM();}
function openEditSc(id){var s=S.schedules.find(function(x){return x.id===id;});if(s)showSM(s);}
function openEditEv(id){var e=S.events.find(function(x){return x.id===id;});if(e)showEM(e);}
function mw(inner,wide){document.getElementById('mc').innerHTML='<div class="mover" onclick="if(event.target===this)cm()"><div class="modal'+(wide?' wide':'')+'" onclick="event.stopPropagation()">'+inner+'</div></div>';}
function cm(){document.getElementById('mc').innerHTML='';_selCol='purple';_dragIdx=null;}

/* 이벤트 모달 */
var _evModalType='event'; // 'event' | 'work'
function showEM(ex, exWt){
  // ex = 기존 이벤트, exWt = 기존 작업
  var ie=!!(ex||exWt);
  var initType = exWt ? 'work' : 'event';
  _evModalType = initType;
  _selCol = ex ? (ex.colorId||'purple') : 'purple';

  var po=S.projects.map(function(p){
    var si=S.sites.find(function(s){return s.id===p.siteId;});
    var curId = ex ? ex.projectId : (exWt ? exWt.projectId : null);
    return '<option value="'+p.id+'"'+(curId===p.id?' selected':'')+'>'+(si?si.name:'?')+' - '+p.name+'</option>';
  }).join('');
  var sw=EVC.map(function(c){return '<div class="csw'+(c.id===_selCol?' sel':'')+'" style="background:'+c.bg+'" data-cid="'+c.id+'" id="sw_'+c.id+'"></div>';}).join('');

  var todayStr=TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');

  var html='<div class="mtit">'+(ie?'이벤트 / 작업 수정':'이벤트 / 작업 등록')+'</div>';
  // 유형 탭
  html+='<div class="ev-type-sel">'
    +'<button class="ev-type-btn'+(initType==='event'?' on':'')+'" id="evtab_event" onclick="switchEvTab(\'event\')">★ 주요 이벤트</button>'
    +'<button class="ev-type-btn'+(initType==='work'?' on':'')+'" id="evtab_work" onclick="switchEvTab(\'work\')">▣ 작업</button>'
    +'</div>';
  html+='<div class="fg"><label class="fl">사이트/프로젝트</label><select id="fe_proj">'+po+'</select></div>';

  // ── 주요 이벤트 섹션
  html+='<div id="fe_event_sec" style="display:'+(initType==='event'?'block':'none')+'">';
  html+='<div class="fg"><label class="fl">날짜</label><input type="date" id="fe_date" value="'+(ex?ex.date:todayStr)+'"></div>';
  html+='<div class="fg"><label class="fl">이벤트 제목</label><input type="text" id="fe_title" value="'+(ex?ex.title:'')+'" placeholder="예: 양산시작, 고객 방문"></div>';
  html+='<div class="fg"><label class="fl">색상</label><div class="crow">'+sw+'</div></div>';
  html+='</div>';

  // ── 작업 섹션
  var wt=exWt||{};
  var wtDays=exWt?dd(wt.start,wt.end)+' 일':'-';
  var wtDateInfo=exWt?(fmtFull(wt.start)+' → '+fmtFull(wt.end)):'';
  html+='<div id="fe_work_sec" style="display:'+(initType==='work'?'block':'none')+'">';
  html+='<div class="fg"><label class="fl">작업 제목</label><input type="text" id="fw_title" value="'+(exWt?wt.title:'')+'" placeholder="예: 비전 파라미터 최적화, 알람 점검"></div>';
  html+='<div class="fr">'
    +'<div class="fg"><label class="fl">시작일 (YYYY-MM-DD)</label><input type="text" id="fw_start" value="'+(exWt?wt.start:todayStr)+'" maxlength="10" oninput="fmtDateInput(this);calcWD()" style="font-family:monospace;letter-spacing:1px"></div>'
    +'<div class="fg"><label class="fl">종료일 (YYYY-MM-DD)</label><input type="text" id="fw_end" value="'+(exWt?wt.end:todayStr)+'" maxlength="10" oninput="fmtDateInput(this);calcWD()" style="font-family:monospace;letter-spacing:1px"></div>'
    +'</div>';
  html+='<div class="dbox"><span id="fw_datebox" style="color:#ccc">'+wtDateInfo+'</span>'+(wtDateInfo?' &nbsp; ':'')+'기간: <span id="fw_days" style="font-weight:500">'+wtDays+'</span></div>';
  html+='<div class="fg"><label class="fl">담당자 / 비고</label><input type="text" id="fw_note" value="'+(exWt?wt.note:'')+'" placeholder="예: 김성민, 전 라인 점검"></div>';
  // 작업 색상
  var sw2=EVC.map(function(c){return '<div class="csw'+(c.id===(exWt?wt.colorId||'blue':'blue')?' sel':'')+'" style="background:'+c.bg+'" data-cid="'+c.id+'" id="sww_'+c.id+'"></div>';}).join('');
  html+='<div class="fg"><label class="fl">색상</label><div class="crow" id="fw_colors">'+sw2+'</div></div>';
  html+='</div>';

  html+='<div class="mfoot">';
  if(ie) html+='<button class="btn red sm" id="fe_del">삭제</button>';
  html+='<button class="btn sm" id="fe_cancel">취소</button>';
  html+='<button class="btn sm pri" id="fe_save">'+(ie?'수정 완료':'등록')+'</button>';
  html+='</div>';
  mw(html);

  // 이벤트 탭 버튼
  document.querySelectorAll('.csw').forEach(function(btn){
    btn.addEventListener('click',function(){selC(this.getAttribute('data-cid'));});
  });
  document.querySelectorAll('#fw_colors .csw').forEach(function(btn){
    btn.addEventListener('click',function(){selCW(this.getAttribute('data-cid'));});
  });
  document.getElementById('fe_cancel').onclick=function(){cm();};
  document.getElementById('fe_save').onclick=function(){
    if(_evModalType==='event') saveEv(ex?ex.id:null);
    else saveWt(exWt?exWt.id:null);
  };
  if(ie){
    document.getElementById('fe_del').onclick=function(){
      if(_evModalType==='event'&&ex) delEv(ex.id);
      else if(exWt) delWt(exWt.id);
    };
  }
  if(initType==='work') calcWD();
}
function switchEvTab(t){
  _evModalType=t;
  document.getElementById('evtab_event').className='ev-type-btn'+(t==='event'?' on':'');
  document.getElementById('evtab_work').className='ev-type-btn'+(t==='work'?' on':'');
  document.getElementById('fe_event_sec').style.display=t==='event'?'block':'none';
  document.getElementById('fe_work_sec').style.display=t==='work'?'block':'none';
}
function selC(id){
  _selCol=id;
  document.querySelectorAll('.csw').forEach(function(e){
    if(e.id&&e.id.indexOf('sw_')===0) e.classList.toggle('sel',e.id==='sw_'+id);
  });
}
var _selColW='blue';
function selCW(id){
  _selColW=id;
  document.querySelectorAll('#fw_colors .csw').forEach(function(e){e.classList.toggle('sel',e.getAttribute('data-cid')===id);});
}
function calcWD(){
  var s=document.getElementById('fw_start').value;
  var e=document.getElementById('fw_end').value;
  var re=/^\d{4}-\d{2}-\d{2}$/;
  if(s&&e&&re.test(s)&&re.test(e)&&s<=e){
    document.getElementById('fw_days').textContent=dd(s,e)+' 일';
    var db=document.getElementById('fw_datebox');if(db)db.textContent=fmtFull(s)+' → '+fmtFull(e);
  }
}
function saveEv(exId){
  var projId=document.getElementById('fe_proj').value;
  var date=document.getElementById('fe_date').value;
  var title=document.getElementById('fe_title').value.trim();
  if(!projId||!date||!title){alert('모든 항목을 입력하세요.');return;}
  if(exId){
    var i=S.events.findIndex(function(e){return e.id===exId;});
    S.events[i]={id:exId,projectId:projId,date:date,title:title,colorId:_selCol};
  } else {
    S.events.push({id:'e'+Date.now(),projectId:projId,date:date,title:title,colorId:_selCol});
  }
  saveData();cm();renderAll();
}
function saveWt(exId){
  var projId=document.getElementById('fe_proj').value;
  var title=document.getElementById('fw_title').value.trim();
  var start=document.getElementById('fw_start').value;
  var end=document.getElementById('fw_end').value;
  var note=document.getElementById('fw_note').value.trim();
  var dateRe=/^\d{4}-\d{2}-\d{2}$/;
  // 색상: fw_colors 내 sel 찾기
  var selBtn=document.querySelector('#fw_colors .csw.sel');
  var colorId=selBtn?selBtn.getAttribute('data-cid'):'blue';
  if(!projId||!title||!start||!end){alert('모든 항목을 입력하세요.');return;}
  if(!dateRe.test(start)||!dateRe.test(end)){alert('날짜 형식이 올바르지 않아요.\n예: 2026-04-01');return;}
  if(start>end){alert('종료일이 시작일보다 빠릅니다.');return;}
  if(exId){
    var i=S.workTasks.findIndex(function(w){return w.id===exId;});
    S.workTasks[i]={id:exId,projectId:projId,title:title,start:start,end:end,note:note,colorId:colorId};
  } else {
    S.workTasks.push({id:'wt'+Date.now(),projectId:projId,title:title,start:start,end:end,note:note,colorId:colorId});
  }
  saveData();cm();renderAll();
}
function delEv(id){if(!confirm('이벤트를 삭제할까요?'))return;S.events=S.events.filter(function(e){return e.id!==id;});saveData();cm();renderAll();}
function delWt(id){if(!confirm('작업을 삭제할까요?'))return;S.workTasks=S.workTasks.filter(function(w){return w.id!==id;});saveData();cm();renderAll();}
function openEditWt(id){var w=S.workTasks.find(function(x){return x.id===id;});if(w)showEM(null,w);}

/* 출장 모달 */
function showSM(ex){
  var ie=!!ex;
  var so=S.sites.map(function(s){return '<option value="'+s.id+'">'+s.name+'</option>';}).join('');
  var po='<option value="">사이트를 먼저 선택하세요</option>';
  if(ie){var pr=S.projects.find(function(p){return p.id===ex.projectId;});if(pr)po=S.projects.filter(function(p){return p.siteId===pr.siteId;}).map(function(p){return '<option value="'+p.id+'"'+(p.id===ex.projectId?' selected':'')+'>'+p.name+'</option>';}).join('');}
  var curType=ie?(ex.type||'hq'):'hq';
  var typeOpts=[['hq','본사'],['outsource','외주'],['tech','기술'],['vision','비전'],['host','호스트']].map(function(t){return '<option value="'+t[0]+'"'+(curType===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('');
  var days=ie?dd(ex.start,ex.end)+' 일':'-';
  var dateInfo=ie?(fmtFull(ex.start)+' → '+fmtFull(ex.end)):'';
  var isHidden=ie&&ex.hidden?true:false;
  var html='<div class="mtit">'+(ie?'출장 일정 수정':'출장 일정 등록')+'</div>';
  html+='<div class="fg"><label class="fl">사이트</label><select id="f_site">'+so+'</select></div>';
  html+='<div class="fg"><label class="fl">프로젝트</label><select id="f_proj">'+po+'</select></div>';
  html+='<div class="fg"><label class="fl">업무 유형</label><input type="text" id="f_task" value="'+(ie?ex.task:'')+'" placeholder="예: 셋업, 대응, 개조"></div>';
  html+='<div class="fg"><label class="fl">출장자 이름</label><input type="text" id="f_name" value="'+(ie?ex.name:'')+'" placeholder="이름 입력"></div>';
  html+='<div class="fg"><label class="fl">인원 구분</label><select id="f_type">'+typeOpts+'</select></div>';
  html+='<div class="fr"><div class="fg"><label class="fl">출발일 (YYYY-MM-DD)</label><input type="text" id="f_start" value="'+(ie?ex.start:'2026-03-01')+'" placeholder="2026-04-01" maxlength="10" oninput="fmtDateInput(this);calcD()" style="font-family:monospace;letter-spacing:1px"></div><div class="fg"><label class="fl">복귀일 (YYYY-MM-DD)</label><input type="text" id="f_end" value="'+(ie?ex.end:'2026-03-30')+'" placeholder="2026-06-30" maxlength="10" oninput="fmtDateInput(this);calcD()" style="font-family:monospace;letter-spacing:1px"></div></div>';
  html+='<div class="dbox"><span id="f_datebox" style="color:#ccc">'+dateInfo+'</span>'+(dateInfo?' &nbsp; ':'')+'체류: <span id="f_days" style="font-weight:500">'+days+'</span></div>';
  html+='<div class="fg"><label class="fl">메모 / 비고</label><input type="text" id="f_note" value="'+(ie?ex.note:'')+'" placeholder="주의사항 등"></div>';
  html+='<label class="chkrow"><input type="checkbox" id="f_hidden"'+(isHidden?' checked':'')+'>간트차트에서 숨기기</label>';
  html+='<div class="mfoot">';
  if(ie) html+='<button class="btn red sm" id="f_del">삭제</button>';
  html+='<button class="btn sm" id="f_cancel">취소</button>';
  html+='<button class="btn sm pri" id="f_save">'+(ie?'수정 완료':'등록')+'</button>';
  html+='</div>';
  mw(html);
  // 이벤트 등록
  document.getElementById('f_site').onchange=function(){upP();};
  document.getElementById('f_start').onchange=function(){calcD();};
  document.getElementById('f_end').onchange=function(){calcD();};
  document.getElementById('f_cancel').onclick=function(){cm();};
  document.getElementById('f_save').onclick=function(){saveSc(ie?ex.id:null);};
  if(ie){
    document.getElementById('f_del').onclick=function(){delSc(ex.id);};
    var pr2=S.projects.find(function(p){return p.id===ex.projectId;});
    if(pr2) document.getElementById('f_site').value=pr2.siteId;
    upP();
    setTimeout(function(){
      document.getElementById('f_proj').value=ex.projectId;
      calcD(); // 수정 모드에서 초기 날짜 표시
    },0);
  } else {
    upP();
    calcD(); // 신규 등록 모드 초기 날짜 표시
  }
}
function upP(){var sid=document.getElementById('f_site').value;var ps=S.projects.filter(function(p){return p.siteId===sid;});document.getElementById('f_proj').innerHTML=ps.length?ps.map(function(p){return '<option value="'+p.id+'">'+p.name+'</option>';}).join(''):'<option value="">해당 사이트에 프로젝트 없음</option>';}
function fmtDateInput(el){
  // 숫자만 남기고 자동으로 - 삽입: 20260401 → 2026-04-01
  var v=el.value.replace(/[^0-9]/g,'');
  if(v.length>4) v=v.slice(0,4)+'-'+v.slice(4);
  if(v.length>7) v=v.slice(0,7)+'-'+v.slice(7);
  el.value=v.slice(0,10);
}
function calcD(){
  var s=document.getElementById('f_start').value;
  var e=document.getElementById('f_end').value;
  var re=/^\d{4}-\d{2}-\d{2}$/;
  var fs=document.getElementById('f_start');
  var fe=document.getElementById('f_end');
  if(fs) fs.style.borderColor=(!s||re.test(s))?'#3a3a44':'#b52020';
  if(fe) fe.style.borderColor=(!e||re.test(e))?'#3a3a44':'#b52020';
  if(s&&e&&re.test(s)&&re.test(e)){
    if(s<=e){
      document.getElementById('f_days').textContent=dd(s,e)+' 일';
      var db=document.getElementById('f_datebox');
      if(db)db.textContent=fmtFull(s)+' → '+fmtFull(e);
      if(fe) fe.style.borderColor='#3a3a44';
    } else {
      if(fe) fe.style.borderColor='#b52020';
      document.getElementById('f_days').textContent='날짜 오류';
    }
  }
}
function saveSc(exId){
  var projId=document.getElementById('f_proj').value;
  var task=document.getElementById('f_task').value.trim();
  var name=document.getElementById('f_name').value.trim();
  var type=document.getElementById('f_type').value;
  var start=document.getElementById('f_start').value;
  var end=document.getElementById('f_end').value;
  var note=document.getElementById('f_note').value.trim();
  var hidden=document.getElementById('f_hidden').checked;
  var dateRe=/^\d{4}-\d{2}-\d{2}$/;
  if(!projId||!task||!name||!start||!end){alert('필수 항목을 모두 입력하세요.');return;}
  if(!dateRe.test(start)||!dateRe.test(end)){alert('날짜 형식이 올바르지 않아요.\n예: 2026-04-01');return;}
  if(start>end){alert('복귀일이 출발일보다 빠릅니다.');return;}
  if(exId){
    var i=S.schedules.findIndex(function(s){return s.id===exId;});
    S.schedules[i]={id:exId,projectId:projId,task:task,name:name,type:type,start:start,end:end,note:note,hidden:hidden};
  } else {
    S.schedules.push({id:'s'+Date.now(),projectId:projId,task:task,name:name,type:type,start:start,end:end,note:note,hidden:hidden});
  }
  saveData();cm();renderAll();
}
function delSc(id){if(!confirm('이 출장 일정을 삭제할까요?'))return;S.schedules=S.schedules.filter(function(s){return s.id!==id;});saveData();cm();renderAll();}

/* ── 사이트 관리 모달 (좌우 분할) ── */
function showSiteM(){
  mw('<div class="mtit">사이트 / 프로젝트 관리</div>'
    +'<div class="sitemgr">'
    +'<div class="sitemgr-l"><div class="smtit">그룹 & 사이트</div><div id="grpSiteRows"></div>'
    +'<div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a2a34">'
    +'<div style="font-size:10px;color:#666;margin-bottom:5px">새 그룹 추가</div>'
    +'<div style="display:flex;gap:5px"><input type="text" id="ns_grp" placeholder="그룹명" style="flex:1"><button class="btn sm pri" onclick="addGroup()">추가</button></div>'
    +'<div style="font-size:10px;color:#666;margin:8px 0 5px">새 사이트 추가</div>'
    +'<div style="display:flex;gap:5px;margin-bottom:4px"><input type="text" id="ns_n" placeholder="사이트명" style="flex:1"><input type="color" id="ns_c" value="#1558a0" style="width:30px;padding:1px;border:1px solid #3a3a44;border-radius:4px;background:#1e1e26"></div>'
    +'<div style="display:flex;gap:5px"><select id="ns_grpsel" style="flex:1">'+S.groups.map(function(g){return '<option value="'+g.id+'">'+g.name+'</option>';}).join('')+'</select><button class="btn sm pri" onclick="addSite()">추가</button></div>'
    +'</div></div>'
    +'<div class="sitemgr-r"><div class="smtit">프로젝트</div><div id="projRows"></div></div>'
    +'</div>'
    +'<div class="mfoot"><button class="btn sm" onclick="cm()">닫기</button></div>',true);
  buildGrpSiteRows();buildProjRows();
}

function buildGrpSiteRows(){
  var el=document.getElementById('grpSiteRows');if(!el)return;el.innerHTML='';
  S.groups.forEach(function(grp){
    // 그룹 헤더 행
    var gh=document.createElement('div');
    gh.style.cssText='display:flex;align-items:center;gap:5px;padding:5px 0 3px;border-bottom:1px solid #3a3a44;margin-bottom:3px';
    var ni=document.createElement('input');ni.type='text';ni.value=grp.name;
    ni.style.cssText='flex:1;font-size:11px;font-weight:600;color:#ccc;padding:2px 5px';
    ni.onchange=(function(gid){return function(){updGN(gid,this.value);};})(grp.id);
    var db=document.createElement('button');db.className='btn sm red';db.textContent='그룹삭제';
    db.onclick=(function(gid){return function(){delGroup(gid);};})(grp.id);
    gh.appendChild(ni);gh.appendChild(db);el.appendChild(gh);

    // 그룹 내 사이트들
    var grpSites=S.sites.filter(function(s){return (s.groupId||'_none')===grp.id;});
    grpSites.forEach(function(site,si){
      var row=document.createElement('div');row.className='mrow';row.style.paddingLeft='8px';row.draggable=true;
      var ic=document.createElement('input');ic.type='color';ic.value=site.color;
      ic.style.cssText='width:22px;height:22px;padding:0;border:none;background:none;cursor:pointer;flex-shrink:0';
      ic.onchange=(function(sid){return function(){updSC(sid,this.value);};})(site.id);
      var iname=document.createElement('input');iname.type='text';iname.value=site.name;
      iname.style.cssText='flex:1;min-width:60px;font-size:11px';
      iname.onchange=(function(sid){return function(){updSN(sid,this.value);};})(site.id);
      // 그룹 변경 select
      var gsel=document.createElement('select');
      gsel.style.cssText='font-size:10px;padding:2px 3px;max-width:80px';
      S.groups.forEach(function(g){var o=document.createElement('option');o.value=g.id;o.textContent=g.name;if(g.id===grp.id)o.selected=true;gsel.appendChild(o);});
      gsel.onchange=(function(sid){return function(){moveSiteGroup(sid,this.value);};})(site.id);
      var btnP=document.createElement('button');btnP.className='btn sm';btnP.textContent='PJT+';
      btnP.onclick=(function(sid){return function(){addP(sid);};})(site.id);
      var btnD=document.createElement('button');btnD.className='btn sm red';btnD.textContent='삭제';
      btnD.onclick=(function(sid){return function(){delSite(sid);};})(site.id);
      // 드래그
      (function(siteId,siteIdx){
        row.ondragstart=function(e){e.dataTransfer.effectAllowed='move';_dragIdx=siteIdx;};
        row.ondragover=function(e){e.preventDefault();row.classList.add('dover');};
        row.ondragleave=function(){row.classList.remove('dover');};
        row.ondrop=function(e){
          e.preventDefault();row.classList.remove('dover');
          if(_dragIdx===null||_dragIdx===siteIdx){_dragIdx=null;return;}
          var from=_dragIdx,to=siteIdx;_dragIdx=null;
          var moved=S.sites.splice(from,1)[0];S.sites.splice(to,0,moved);
          saveData();buildGrpSiteRows();renderAll();
        };
      })(site.id, S.sites.indexOf(site));
      [ic,iname,gsel,btnP,btnD].forEach(function(el2){row.appendChild(el2);});
      el.appendChild(row);
    });
    // 사이트 없을 때
    if(!grpSites.length){var empty=document.createElement('div');empty.style.cssText='font-size:10px;color:#555;padding:3px 8px';empty.textContent='(사이트 없음)';el.appendChild(empty);}
    // 그룹 간 간격
    var gap=document.createElement('div');gap.style.height='8px';el.appendChild(gap);
  });
}

function buildProjRows(){
  var el=document.getElementById('projRows');if(!el)return;el.innerHTML='';
  S.projects.forEach(function(p){
    var si=S.sites.find(function(s){return s.id===p.siteId;});
    var row=document.createElement('div');row.className='mrow';
    var chip=document.createElement('span');chip.className='grp-chip';
    chip.style.cssText='background:'+(si?si.color:'#555')+';color:#fff';chip.textContent=si?si.name:p.siteId;
    var ni=document.createElement('input');ni.type='text';ni.value=p.name;
    ni.style.cssText='flex:1;min-width:80px;font-size:11px';
    ni.onchange=(function(pid){return function(){updPN(pid,this.value);};})(p.id);
    var btnD=document.createElement('button');btnD.className='btn sm red';btnD.textContent='삭제';
    btnD.onclick=(function(pid){return function(){delPjt(pid);};})(p.id);
    [chip,ni,btnD].forEach(function(el2){row.appendChild(el2);});
    el.appendChild(row);
  });
}

/* 그룹 CRUD */
function addGroup(){
  var name=document.getElementById('ns_grp').value.trim();if(!name){alert('그룹명을 입력하세요.');return;}
  var id='g'+Date.now();S.groups.push({id:id,name:name});
  saveData();showSiteM();renderAll();
}
function delGroup(id){
  if(!confirm('그룹을 삭제하면 소속 사이트가 미분류됩니다. 계속할까요?'))return;
  S.sites.forEach(function(s){if(s.groupId===id)s.groupId='_none';});
  S.groups=S.groups.filter(function(g){return g.id!==id;});
  saveData();showSiteM();renderAll();
}
function updGN(id,v){var g=S.groups.find(function(g){return g.id===id;});if(g){g.name=v.trim();saveData();renderSidebar();}}
function moveSiteGroup(sid,gid){var s=S.sites.find(function(s){return s.id===sid;});if(s){s.groupId=gid;saveData();buildGrpSiteRows();renderSidebar();renderGantt();}}

/* 사이트 CRUD */
function updSN(id,v){var s=S.sites.find(function(s){return s.id===id;});if(s){s.name=v.trim();saveData();renderSidebar();renderGantt();}}
function updSC(id,v){var s=S.sites.find(function(s){return s.id===id;});if(s){s.color=v;saveData();renderSidebar();renderGantt();}}
function addSite(){
  var name=document.getElementById('ns_n').value.trim(),color=document.getElementById('ns_c').value;
  var gid=document.getElementById('ns_grpsel').value;
  if(!name){alert('사이트 이름을 입력하세요.');return;}
  var baseId=name.replace(/[^a-zA-Z0-9가-힣]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')||'site';
  var newId=baseId,n=2;while(S.sites.find(function(s){return s.id===newId;}))newId=baseId+'_'+n++;
  S.sites.push({id:newId,name:name,color:color,groupId:gid});
  saveData();showSiteM();renderAll();
}
function delSite(id){
  if(!confirm('사이트와 관련 항목을 모두 삭제합니까?'))return;
  var pids=S.projects.filter(function(p){return p.siteId===id;}).map(function(p){return p.id;});
  S.projects=S.projects.filter(function(p){return p.siteId!==id;});S.schedules=S.schedules.filter(function(s){return pids.indexOf(s.projectId)<0;});S.events=S.events.filter(function(e){return pids.indexOf(e.projectId)<0;});S.sites=S.sites.filter(function(s){return s.id!==id;});
  saveData();showSiteM();renderAll();
}

/* 프로젝트 CRUD */
function updPN(id,v){var p=S.projects.find(function(p){return p.id===id;});if(p){p.name=v.trim();saveData();renderGantt();}}
function addP(sid){
  var name=prompt('새 프로젝트 이름:');if(!name)return;
  var baseId=name.replace(/[^a-zA-Z0-9가-힣]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')||'pjt';
  var newId=baseId,n=2;while(S.projects.find(function(p){return p.id===newId;}))newId=baseId+'_'+n++;
  S.projects.push({id:newId,siteId:sid,name:name});saveData();showSiteM();renderAll();
}
function delPjt(id){
  if(!confirm('프로젝트와 관련 일정을 모두 삭제합니까?'))return;
  S.schedules=S.schedules.filter(function(s){return s.projectId!==id;});S.events=S.events.filter(function(e){return e.projectId!==id;});S.projects=S.projects.filter(function(p){return p.id!==id;});
  saveData();showSiteM();renderAll();
}

/* ── 시작 ── */
// 접속 시 DEF 기본 데이터로 초기화 후 Sheets에서 최신 데이터 로드
loadData();
renderAll(); // 캐시/DEF 데이터로 즉시 표시
loadFromSheets(function(){
  renderAll(); // Sheets 최신 데이터로 교체
});
// Apps Script 워밍업 - 4분마다 ping으로 콜드 스타트 방지
(function keepWarm(){
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:')return;
  setInterval(function(){
    fetch(url+'?action=ping').catch(function(){});
  }, 4*60*1000); // 4분
})();

/* ════════════════════════════════════════════
   탭 전환
════════════════════════════════════════════ */
var _activeTab='gantt';
function switchTab(tab){
  _activeTab=tab;
  document.getElementById('view_gantt').style.display=tab==='gantt'?'flex':'none';
  document.getElementById('view_person').style.display=tab==='person'?'flex':'none';
  document.getElementById('view_equip').style.display=tab==='equip'?'flex':'none';
  document.getElementById('tab_gantt').className='tab-btn'+(tab==='gantt'?' on':'');
  document.getElementById('tab_person').className='tab-btn'+(tab==='person'?' on':'');
  document.getElementById('tab_equip').className='tab-btn'+(tab==='equip'?' on':'');
  document.getElementById('ganttTools').style.display=tab==='gantt'?'flex':'none';
  document.getElementById('equipTools').style.display=tab==='equip'?'flex':'none';
  if(tab==='person') renderPersonTab();
  if(tab==='equip') renderEquipTab();
}

/* ════════════════════════════════════════════
   인원 출장일 관리
════════════════════════════════════════════ */

var REGION_AMERICAS_IDS=['ESHD','ESMI','ESHG','MILS','ESOT','UC2','현대JV','BOSK_TN'];
var REGION_EUROPE_IDS=['WA','ESWA'];

function getSiteRegion(siteId){
  var sid=(siteId||'').toUpperCase();
  if(REGION_AMERICAS_IDS.map(function(x){return x.toUpperCase();}).indexOf(sid)>=0) return 'americas';
  if(REGION_EUROPE_IDS.map(function(x){return x.toUpperCase();}).indexOf(sid)>=0) return 'europe';
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

// 롤링 12개월 창 안에서 해외 체류일을 뺀 국내 체류일
function calcKoreaDays12M(trips, rolling12){
  var overseas={};
  trips.forEach(function(t){
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
  trips.forEach(function(t){
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
  var onTrip=trips.some(function(t){return TODAY>=pd(t.start)&&TODAY<=pd(t.end);});
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
    var region=getSiteRegion(siteId);
    var s=pd(sc.start),e=pd(sc.end);
    var status=TODAY>e?'done':(TODAY>=s?'going':'plan');
    var key=sc.name;
    if(!persons[key]) persons[key]={name:sc.name,type:sc.type,trips:[]};
    var typePri={hq:5,tech:4,vision:3,host:2,outsource:1};
    if((typePri[sc.type]||0)>(typePri[persons[key].type]||0)) persons[key].type=sc.type;
    // 출장 원래 type 기록 (인원에 복수 타입 있을 수 있음)
    if(!persons[key].types) persons[key].types={};
    persons[key].types[sc.type]=true;
    persons[key].trips.push({
      siteId:siteId,siteName:siteName,siteColor:siteColor,
      region:region,start:sc.start,end:sc.end,
      days:dd(sc.start,sc.end),status:status,task:sc.task,note:sc.note
    });
  });
  Object.keys(persons).forEach(function(k){
    persons[k].trips.sort(function(a,b){return a.start>b.start?1:-1;});
  });
  return persons;
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
var _pmTypeFilter={hq:true,outsource:true,tech:true,vision:true,host:true}; // 인원유형 체크
var _pmExpanded={};           // 행 펼침 상태: { '이름': true }

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

  if(!totalPersons){
    wrap.innerHTML='<div style="padding:40px;text-align:center;color:#555">등록된 출장 일정이 없습니다.</div>';
    return;
  }

  var html='';

  // 통계 카드
  html+='<div class="pm-stats-row">';
  html+='<div class="pm-stat-card"><div class="pm-stat-val">'+totalPersons+'</div><div class="pm-stat-lbl">등록 인원</div><div class="pm-stat-sub">전체 출장자</div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#2176cc">'+onTripNow+'</div><div class="pm-stat-lbl">현재 출장 중</div><div class="pm-stat-sub">오늘 기준</div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#1a8c66">'+americasPersons+'</div><div class="pm-stat-lbl">미주 경험 인원</div><div class="pm-stat-sub">B1 비자 대상</div></div>';
  html+='<div class="pm-stat-card"><div class="pm-stat-val" style="color:#cc8010">'+europePersons+'</div><div class="pm-stat-lbl">유럽 경험 인원</div><div class="pm-stat-sub">ESWA/WA 등</div></div>';
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
  var typeList=[['hq','본사',TYPE_COLOR.hq],['outsource','외주',TYPE_COLOR.outsource],['tech','기술',TYPE_COLOR.tech],['vision','비전',TYPE_COLOR.vision],['host','호스트',TYPE_COLOR.host]];
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

  // ── 결과 영역 (검색/정렬/타입 변경 시 이 div만 갱신)
  html+='<div id="pmBody"></div>';

  wrap.innerHTML=html;
  renderPersonBody(); // 결과 채우기
}

// 정렬 버튼 HTML 조각 생성 (컨트롤바 내 정렬 버튼 업데이트에 재사용)
function buildSortBtnsHtml(){
  var sortBtns=[['name','이름'],['americas','미주(12M)'],['europe','유럽(12M)'],['total','전체해외(12M)'],['korea12m','국내(12M)'],['koreaCur','현재국내']];
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
    else if(_pmSortKey==='europe')   v=calcRegionDays12M(pa.trips,'europe',rolling12)-calcRegionDays12M(pb.trips,'europe',rolling12);
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
  html+=thS('americas','미주(12M)');
  html+=thS('europe','유럽(12M)');
  html+=thS('total','전체해외(12M)');
  html+=thS('koreaCur','현재국내');
  html+=thS('korea12m','국내(12M)');
  html+='<th>B1</th>';
  html+='</tr></thead><tbody>';

  nameList.forEach(function(name){
    html+=renderPersonRow(name, persons[name], rolling12);
    if(_pmExpanded[name]) html+=renderPersonTimeline(persons[name].trips, nameList.length);
  });

  html+='</tbody></table>';
  html+='<div style="font-size:10px;color:#707080;padding:8px 4px;margin-top:4px">* 출장일은 롤링 12개월(오늘 기준 최근 1년) 기준 체류일 (중복 제거). B1 위험도는 미주 12M 기준.</div>';
  return html;
}

function renderPersonRow(name, person, rolling12){
  var trips=person.trips;
  var loc=getCurrentLocation(trips);
  var amDays=calcRegionDays12M(trips,'americas',rolling12);
  var euDays=calcRegionDays12M(trips,'europe',rolling12);
  var totalDays=calcTotalOverseas12M(trips,rolling12);
  var koreaCur=calcCurrentKoreaDays(trips);
  var korea12m=calcKoreaDays12M(trips,rolling12);

  // B1 위험도 (미주 12M 기준)
  var b1Cls='b1-safe', b1Txt='안전';
  if(amDays>=150){b1Cls='b1-alert';b1Txt='위험';}
  else if(amDays>=120){b1Cls='b1-warn';b1Txt='주의';}

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

  // 미주(12M)
  var amCls=amDays>=150?'b1-alert':amDays>=120?'b1-warn':'';
  html+='<td style="text-align:center"><span class="pm-days-big '+(amCls)+'" style="font-size:16px">'+amDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 유럽(12M)
  html+='<td style="text-align:center"><span class="pm-days-big" style="font-size:16px">'+euDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 전체해외(12M)
  html+='<td style="text-align:center"><span style="font-size:16px;font-weight:700;color:#e8e8ec">'+totalDays+'</span><span class="pm-days-unit"> 일</span></td>';

  // 현재국내
  var curColor=koreaCur===0?(loc.onTrip?'#606070':'#e84040'):(koreaCur<30?'#e8a020':'#4aaa70');
  html+='<td style="text-align:center"><span style="font-size:16px;font-weight:600;color:'+curColor+'">'+koreaCur+'</span><span class="pm-days-unit"> 일</span></td>';

  // 국내(12M)
  html+='<td style="text-align:center"><span style="font-size:16px;font-weight:600;color:#7aafee">'+korea12m+'</span><span class="pm-days-unit"> 일</span></td>';

  // B1
  html+='<td style="text-align:center"><span class="'+b1Cls+'" style="font-size:12px;font-weight:600">'+b1Txt+'</span></td>';

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
      +'<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#1e1e2a;color:#b0b0b8">'+(['americas'].indexOf(t.region)>=0?'미주':t.region==='europe'?'유럽':'기타')+'</span>'
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

  return '<tr class="pm-expand-row"><td colspan="8"><div class="pm-timeline">'+rows+'</div></td></tr>';
}


/* ════════════════════════════════════════════
   설비 진행율 탭
════════════════════════════════════════════ */
var _equipEditMode=false;
var _equipFilterSite='all';

/* ── 출장중 인원 조회 ── */
function getOnSitePersonnel(siteId){
  var todayStr=TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');
  var result=[];
  S.schedules.forEach(function(sc){
    if(sc.start>todayStr||sc.end<todayStr) return;
    var proj=S.projects.find(function(p){return p.id===sc.projectId;});
    if(!proj||proj.siteId!==siteId) return;
    if(sc.name&&sc.name!=='미지정') result.push({name:sc.name,type:sc.type||'hq'});
  });
  // 중복 제거
  var seen={};
  return result.filter(function(r){if(seen[r.name])return false;seen[r.name]=true;return true;});
}

/* ── 진행율 계산 ── */
function calcUnitProgress(unit){
  var items=S.equipItems.slice().sort(function(a,b){return a.order-b.order;});
  if(!items.length) return 0;
  var total=0,count=0;
  items.forEach(function(item){
    var cell=(unit.cells||{})[item.id];
    if(!cell||cell.type==='na') return;
    count++;
    if(cell.type==='done') total+=100;
    else if(cell.type==='percent') total+=(parseFloat(cell.value)||0);
    else if(cell.type==='date') total+=0;
  });
  if(!count) return 0;
  return Math.round(total/count);
}

function calcSiteProgress(siteId){
  var units=S.equipUnits.filter(function(u){return u.siteId===siteId;});
  if(!units.length) return null;
  var sum=0;
  units.forEach(function(u){sum+=calcUnitProgress(u);});
  return Math.round(sum/units.length);
}

/* ── 사이드바 렌더 ── */
function renderEquipSidebar(){
  var el=document.getElementById('equipSidebar');
  if(!el) return;
  var usedSiteIds={};
  S.equipUnits.forEach(function(u){usedSiteIds[u.siteId]=true;});
  var html='<div class="sbhead"><span class="slbl">사이트 필터</span></div>';
  html+='<div class="sbody">';
  html+='<div class="sit-all'+(_equipFilterSite==='all'?' on':'')
    +'" onclick="setEquipFilter(\'all\')"><span class="sname">전체 보기</span></div>';
  S.sites.forEach(function(site){
    if(!usedSiteIds[site.id]) return;
    var cnt=S.equipUnits.filter(function(u){return u.siteId===site.id;}).length;
    html+='<div class="sit'+(_equipFilterSite===site.id?' on':'')
      +'" onclick="setEquipFilter(\''+site.id+'\')"><div class="sdot" style="background:'+site.color+'"></div>'
      +'<span class="sname">'+site.name+'</span><span class="scnt">'+cnt+'</span></div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

function setEquipFilter(siteId){
  _equipFilterSite=siteId;
  renderEquipTab();
}

/* ── 메인 렌더 진입점 ── */
function renderEquipTab(){
  renderEquipSidebar();
  renderEquipGrid();
}

/* ── 셀 HTML ── */
function renderEquipCell(cell,editMode,unitId,itemId){
  var inner='';
  var cls='eq-td';
  if(editMode) cls+=' editable';
  var onclick=editMode?' onclick="openEquipCellEdit(\''+unitId+'\',\''+itemId+'\')">':'>';

  if(!cell||cell.type==='na'){
    return '<td class="'+cls+'"'+onclick+'<span class="eq-na">N/A</span></td>';
  }
  if(cell.type==='done'){
    var doneDate=cell.value?'<div style="font-size:10px;color:#5a9aee;margin-top:2px">'+cell.value+'</div>':'';
    return '<td class="'+cls+' eq-done"'+onclick+'100% ✓'+doneDate+'</td>';
  }
  if(cell.type==='percent'){
    var pct=parseFloat(cell.value)||0;
    var barCls2=pct>=90?'eq-bar-fill hi':'eq-bar-fill';
    inner='<div class="eq-pct">'+pct+'%</div>'
      +'<div class="eq-bar-wrap"><div class="'+barCls2+'" style="width:'+Math.min(pct,100)+'%"></div></div>';
    return '<td class="'+cls+'"'+onclick+inner+'</td>';
  }
  if(cell.type==='date'){
    var today=TODAY.toISOString().slice(0,10);
    var isOver=cell.value&&cell.value<today;
    var dateCls=isOver?'eq-date overdue':'eq-date';
    return '<td class="'+cls+'"'+onclick+'<span class="'+dateCls+'">'+cell.value+'</span></td>';
  }
  return '<td class="'+cls+'"'+onclick+inner+'</td>';
}

/* ── 그리드 렌더 ── */
function renderEquipGrid(){
  var el=document.getElementById('eqGrid');
  if(!el) return;

  var items=S.equipItems.slice().sort(function(a,b){return a.order-b.order;});

  // 필터링
  var allUnits=S.equipUnits.filter(function(u){
    return _equipFilterSite==='all'||u.siteId===_equipFilterSite;
  });

  // 사이트 목록 (순서 유지)
  var siteIds=[];
  var siteSet={};
  S.sites.forEach(function(s){
    if(allUnits.some(function(u){return u.siteId===s.id;})&&!siteSet[s.id]){
      siteIds.push(s.id);siteSet[s.id]=true;
    }
  });

  if(!allUnits.length){
    el.innerHTML='<div class="eq-empty">등록된 설비가 없습니다.'
      +'<div class="eq-empty-sub">수정 모드로 전환 후 [+ 사이트]와 [+ 호기]를 추가하세요.</div></div>';
    return;
  }

  /* ── 사이트별 진행율 요약 카드 (eq-scroll 안에 배치 → 좌우 스크롤 연동) ── */
  var summaryHtml='<div class="eq-summary-bar">';
  siteIds.forEach(function(siteId){
    var site=S.sites.find(function(s){return s.id===siteId;});
    if(!site) return;
    var pct=calcSiteProgress(siteId);
    if(pct===null) return;
    var units=S.equipUnits.filter(function(u){return u.siteId===siteId;});
    var doneCount=units.filter(function(u){return calcUnitProgress(u)===100;}).length;
    var barColor=pct===100?'#2a8a40':(pct>=70?'#1a6bbf':'#b87a10');
    summaryHtml+='<div class="eq-summary-card">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      +'<div style="width:8px;height:8px;border-radius:50%;background:'+site.color+';flex-shrink:0"></div>'
      +'<span style="font-size:12px;font-weight:600;color:#e8e8ec">'+site.name+'</span>'
      +'</div>'
      +'<div style="font-size:22px;font-weight:700;color:#e8e8ec;line-height:1">'+pct+'%</div>'
      +'<div style="margin:5px 0 3px;background:#1e1e2a;border-radius:3px;height:5px;overflow:hidden">'
      +'<div style="height:100%;border-radius:3px;background:'+barColor+';width:'+pct+'%"></div></div>'
      +'<div style="font-size:10px;color:#909090;margin-top:2px">'+doneCount+' / '+units.length+' 호기 완료</div>'
      +'</div>';
  });
  summaryHtml+='</div>';

  /* ── 헤더 단일 행 (그룹명은 셀 내 소형 레이블로 표시) ── */
  var prevGroup=null;
  var hdrRow='<tr>';
  hdrRow+='<th class="eq-th fix-col fix-col-1" style="left:0;min-width:80px;width:80px">사이트</th>';
  hdrRow+='<th class="eq-th fix-col fix-col-2" style="left:80px;min-width:120px;width:120px">라인</th>';
  hdrRow+='<th class="eq-th fix-col fix-col-3" style="left:200px;min-width:90px;width:90px;border-right:2px solid #555">호기</th>';
  items.forEach(function(item){
    var g=item.groupName||'';
    var groupLbl=g?'<div style="font-size:8px;color:#534AB7;margin-bottom:2px;letter-spacing:.04em">'+g+'</div>':'';
    var borderLeft=(g&&g!==prevGroup&&prevGroup!==null)?'border-left:2px solid #534AB7;':'';
    prevGroup=g;
    if(_equipEditMode){
      hdrRow+='<th class="eq-th" style="padding:3px 5px;'+borderLeft+'">'
        +groupLbl
        +'<div style="overflow:hidden;text-overflow:ellipsis;max-width:90px">'+item.name+'</div>'
        +'<div style="display:flex;gap:2px;margin-top:3px;justify-content:center">'
        +'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block" onclick="openEditEquipItem(\''+item.id+'\')">수정</button>'
        +'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block;color:#c04040;border-color:#7a1010" onclick="openDelEquipItem(\''+item.id+'\')">삭제</button>'
        +'</div></th>';
    } else {
      hdrRow+='<th class="eq-th" style="'+borderLeft+'">'+groupLbl+item.name+'</th>';
    }
  });
  if(_equipEditMode) hdrRow+='<th class="eq-th">관리</th>';
  hdrRow+='</tr>';

  /* ── 데이터 행 ── */
  var bodyHtml='';
  siteIds.forEach(function(siteId){
    var site=S.sites.find(function(s){return s.id===siteId;});
    var siteName=site?site.name:siteId;
    var siteColor=site?site.color:'#555';
    var personnel=getOnSitePersonnel(siteId);
    var personnelHtml='';
    if(personnel.length){
      personnelHtml=' <span class="eq-site-personnel">출장중: '
        +personnel.map(function(p){
          return '<span class="eq-chip '+(p.type||'hq')+'">'+p.name+'</span>';
        }).join('')+'</span>';
    }
    var colCount=3+items.length+(_equipEditMode?1:0);
    bodyHtml+='<tr class="eq-site-row"><td colspan="'+colCount
      +'" style="background:#151520;padding:4px 12px;font-size:10px;font-weight:600;letter-spacing:.06em">'
      +'<span style="color:'+siteColor+'">■</span> <span style="color:#888">'+siteName+'</span>'
      +personnelHtml+'</td></tr>';

    var siteUnits=allUnits.filter(function(u){return u.siteId===siteId;});
    siteUnits.forEach(function(unit,idx){
      var rowCls='eq-row '+(idx%2===0?'even':'odd');
      var unitPct=calcUnitProgress(unit);
      bodyHtml+='<tr class="'+rowCls+'">';
      // 사이트
      bodyHtml+='<td class="eq-td-fix col-1" style="color:'+siteColor+';font-weight:500">'+siteName+'</td>';
      // 라인
      bodyHtml+='<td class="eq-td-fix col-2">'+(unit.lineName||'')+'</td>';
      // 호기 + 진행율 미니바
      var pctBar='<div style="font-size:9px;color:#666;margin-top:1px">'+unitPct+'%</div>';
      bodyHtml+='<td class="eq-td-fix col-3" style="font-weight:500">'+(unit.unitName||'')+''+pctBar+'</td>';
      // 셀들
      items.forEach(function(item){
        var cell=(unit.cells||{})[item.id];
        bodyHtml+=renderEquipCell(cell,_equipEditMode,unit.id,item.id);
      });
      // 수정모드 액션
      if(_equipEditMode){
        bodyHtml+='<td class="eq-td" style="white-space:nowrap">'
          +'<button class="eq-act-btn copy" onclick="openCopyEquipUnit(\''+unit.id+'\')">복사</button>'
          +'<button class="eq-act-btn del" onclick="delEquipUnit(\''+unit.id+'\')">삭제</button>'
          +'</td>';
      }
      bodyHtml+='</tr>';
    });
  });

  el.innerHTML=summaryHtml
    +'<table class="eq-table"><thead>'+hdrRow+'</thead><tbody>'+bodyHtml+'</tbody></table>';
}

/* ── 수정 모드 토글 ── */
function toggleEquipEdit(){
  _equipEditMode=!_equipEditMode;
  var btn=document.getElementById('btnEquipEdit');
  if(btn) btn.className='btn'+(_equipEditMode?' edit-on':'');
  ['btnAddEquipSite','btnAddEquipUnit','btnAddEquipItem'].forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display=_equipEditMode?'':'none';
  });
  renderEquipTab();
}

/* ── 셀 편집 모달 ── */
function openEquipCellEdit(unitId,itemId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  var item=S.equipItems.find(function(i){return i.id===itemId;});
  if(!unit||!item) return;
  var cell=(unit.cells||{})[itemId]||{type:'na',value:null};
  var t=cell.type||'na';
  var v=cell.value||'';

  mw('<div class="mtit">셀 편집</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:14px">'+item.name+'</div>'
    +'<div class="fg">'
    +'<label class="fl">상태</label>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#e8e8ec;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="na"'+(t==='na'?' checked':'')+' onchange="equipCellTypeChange()"> N/A</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#e8e8ec;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="date"'+(t==='date'?' checked':'')+' onchange="equipCellTypeChange()"> 시작예정일</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#e8e8ec;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="percent"'+(t==='percent'?' checked':'')+' onchange="equipCellTypeChange()"> 진행율(%)</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#e8e8ec;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="done"'+(t==='done'?' checked':'')+' onchange="equipCellTypeChange()"> 완료(100%)</label>'
    +'</div></div>'
    +'<div class="fg" id="eq_val_wrap" style="'+(t==='na'?'display:none':'')+'"><label class="fl" id="eq_val_lbl">'+(t==='done'?'완료 일자 (선택)':(t==='date'?'예정일':'진행율(%)'))+'</label>'
    +'<input type="'+(t==='done'||t==='date'?'date':'number')+'" id="eq_val" min="0" max="100" value="'+v+'" placeholder="'+(t==='done'?'날짜 선택 (선택사항)':'')+'" style="width:100%"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveEquipCell(\''+unitId+'\',\''+itemId+'\')">저장</button>'
    +'</div>');
}

function equipCellTypeChange(){
  var t=document.querySelector('input[name="eq_type"]:checked');
  if(!t) return;
  var wrap=document.getElementById('eq_val_wrap');
  var lbl=document.getElementById('eq_val_lbl');
  var inp=document.getElementById('eq_val');
  if(t.value==='na'){
    wrap.style.display='none';
  } else if(t.value==='done'){
    wrap.style.display='';
    lbl.textContent='완료 일자 (선택)';
    inp.type='date';
    inp.removeAttribute('min');inp.removeAttribute('max');
    inp.placeholder='날짜 선택 (선택사항)';
  } else if(t.value==='date'){
    wrap.style.display='';
    lbl.textContent='예정일';
    inp.type='date';
    inp.removeAttribute('min');inp.removeAttribute('max');
    inp.placeholder='';
  } else {
    wrap.style.display='';
    lbl.textContent='진행율(%)';
    inp.type='number';inp.min='0';inp.max='100';
    inp.placeholder='';
  }
}

function saveEquipCell(unitId,itemId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  var typeEl=document.querySelector('input[name="eq_type"]:checked');
  if(!typeEl) return;
  var type=typeEl.value;
  var value=null;
  if(type==='date'){
    value=document.getElementById('eq_val').value||'';
    if(!value){alert('날짜를 입력해주세요.');return;}
  } else if(type==='done'){
    value=document.getElementById('eq_val').value||null;
  } else if(type==='percent'){
    value=parseFloat(document.getElementById('eq_val').value);
    if(isNaN(value)||value<0||value>100){alert('0~100 사이의 숫자를 입력해주세요.');return;}
  }
  if(!unit.cells) unit.cells={};
  unit.cells[itemId]={type:type,value:value};
  saveData();cm();renderEquipGrid();
}

/* ── 사이트 추가 ── */
function openAddEquipSite(){
  var usedIds={};
  S.equipUnits.forEach(function(u){usedIds[u.siteId]=true;});
  var available=S.sites.filter(function(s){return !usedIds[s.id];});
  if(!available.length){alert('모든 사이트가 이미 추가되어 있습니다.');return;}
  var opts=available.map(function(s){
    return '<option value="'+s.id+'">'+s.name+'</option>';
  }).join('');
  mw('<div class="mtit">사이트 추가</div>'
    +'<div class="fg"><label class="fl">사이트 선택</label>'
    +'<select id="eq_add_site">'+opts+'</select></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveAddEquipSite()">추가</button>'
    +'</div>');
}

function saveAddEquipSite(){
  var siteId=document.getElementById('eq_add_site').value;
  if(!siteId) return;
  var initCells={};
  S.equipItems.forEach(function(item){initCells[item.id]={type:'na',value:null};});
  S.equipUnits.push({id:'eu'+Date.now(),siteId:siteId,lineName:'',unitName:'호기1',cells:initCells});
  saveData();cm();renderEquipTab();
}

/* ── 호기 추가 ── */
function openAddEquipUnit(){
  var usedSiteIds={};
  S.equipUnits.forEach(function(u){usedSiteIds[u.siteId]=true;});
  var available=S.sites.filter(function(s){return usedSiteIds[s.id];});
  if(!available.length){alert('먼저 사이트를 추가해주세요.');return;}
  var opts=available.map(function(s){
    return '<option value="'+s.id+'">'+s.name+'</option>';
  }).join('');
  mw('<div class="mtit">호기 추가</div>'
    +'<div class="fg"><label class="fl">사이트</label>'
    +'<select id="eq_unit_site">'+opts+'</select></div>'
    +'<div class="fg"><label class="fl">라인명 (선택)</label>'
    +'<input type="text" id="eq_unit_line" placeholder="예: 1라인 A 호기"></div>'
    +'<div class="fg"><label class="fl">호기명</label>'
    +'<input type="text" id="eq_unit_name" placeholder="예: Anode"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveAddEquipUnit()">추가</button>'
    +'</div>');
}

function saveAddEquipUnit(){
  var siteId=document.getElementById('eq_unit_site').value;
  var lineName=document.getElementById('eq_unit_line').value.trim();
  var unitName=document.getElementById('eq_unit_name').value.trim();
  if(!unitName){alert('호기명을 입력해주세요.');return;}
  var initCells={};
  S.equipItems.forEach(function(item){initCells[item.id]={type:'na',value:null};});
  S.equipUnits.push({id:'eu'+Date.now(),siteId:siteId,lineName:lineName,unitName:unitName,cells:initCells});
  saveData();cm();renderEquipTab();
}

/* ── 항목 추가 ── */
function openAddEquipItem(){
  var groups=['SAT','IT'];
  var existGroups=[];
  S.equipItems.forEach(function(i){if(i.groupName&&existGroups.indexOf(i.groupName)<0)existGroups.push(i.groupName);});
  existGroups.forEach(function(g){if(groups.indexOf(g)<0)groups.push(g);});
  var opts='<option value="">없음</option>'+groups.map(function(g){return '<option value="'+g+'">'+g+'</option>';}).join('');
  mw('<div class="mtit">공정 항목 추가</div>'
    +'<div class="fg" style="background:#1a2a1a;border:1px solid #2a5a2a;border-radius:5px;padding:8px 10px;margin-bottom:12px;font-size:11px;color:#4aaa70">'
    +'⚠ 이 항목은 <b>모든 사이트에 공통으로 추가</b>됩니다. 기존 호기에는 N/A로 자동 표시됩니다.</div>'
    +'<div class="fg"><label class="fl">항목명</label>'
    +'<input type="text" id="eq_item_name" placeholder="예: Final Check"></div>'
    +'<div class="fg"><label class="fl">그룹 (선택)</label>'
    +'<select id="eq_item_group">'+opts+'</select>'
    +'<input type="text" id="eq_item_group_custom" placeholder="새 그룹명 직접 입력" style="margin-top:5px"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveAddEquipItem()">추가</button>'
    +'</div>');
}

function saveAddEquipItem(){
  var name=document.getElementById('eq_item_name').value.trim();
  if(!name){alert('항목명을 입력해주세요.');return;}
  var group=document.getElementById('eq_item_group_custom').value.trim()
    ||document.getElementById('eq_item_group').value||'';
  var maxOrder=0;
  S.equipItems.forEach(function(i){if(i.order>maxOrder)maxOrder=i.order;});
  var newItem={id:'ei'+Date.now(),name:name,groupName:group,order:maxOrder+1};
  S.equipItems.push(newItem);
  S.equipUnits.forEach(function(u){
    if(!u.cells) u.cells={};
    u.cells[newItem.id]={type:'na',value:null};
  });
  saveData();cm();renderEquipTab();
}

/* ── 항목 수정 ── */
function openEditEquipItem(itemId){
  var item=S.equipItems.find(function(i){return i.id===itemId;});
  if(!item) return;
  var groups=['SAT','IT'];
  S.equipItems.forEach(function(i){if(i.groupName&&groups.indexOf(i.groupName)<0)groups.push(i.groupName);});
  var opts=groups.map(function(g){
    return '<option value="'+g+'"'+(item.groupName===g?' selected':'')+'>'+g+'</option>';
  }).join('');
  mw('<div class="mtit">항목 수정</div>'
    +'<div class="fg"><label class="fl">항목명</label>'
    +'<input type="text" id="eq_edit_name" value="'+item.name+'"></div>'
    +'<div class="fg"><label class="fl">그룹</label>'
    +'<select id="eq_edit_group"><option value=""'+(item.groupName?'':' selected')+'>없음</option>'+opts+'</select>'
    +'<input type="text" id="eq_edit_group_custom" placeholder="새 그룹명 직접 입력" style="margin-top:5px" value="'+(groups.indexOf(item.groupName)<0?item.groupName:'')+'"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveEditEquipItem(\''+itemId+'\')">저장</button>'
    +'</div>');
}

function saveEditEquipItem(itemId){
  var item=S.equipItems.find(function(i){return i.id===itemId;});
  if(!item) return;
  var name=document.getElementById('eq_edit_name').value.trim();
  if(!name){alert('항목명을 입력해주세요.');return;}
  var group=document.getElementById('eq_edit_group_custom').value.trim()
    ||document.getElementById('eq_edit_group').value||'';
  item.name=name;item.groupName=group;
  saveData();cm();renderEquipTab();
}

/* ── 항목 삭제 ── */
function openDelEquipItem(itemId){
  var item=S.equipItems.find(function(i){return i.id===itemId;});
  if(!item) return;
  mw('<div class="mtit">항목 삭제</div>'
    +'<div style="background:#2a0a0a;border:1px solid #7a1010;border-radius:5px;padding:10px 12px;font-size:12px;color:#e84040;margin-bottom:16px">'
    +'⚠ <b>"'+item.name+'"</b> 항목을 삭제하면 <b>모든 사이트의 해당 항목 데이터가 영구 삭제</b>됩니다.'
    +'<br>이 작업은 되돌릴 수 없습니다.</div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm red" onclick="execDelEquipItem(\''+itemId+'\')">삭제</button>'
    +'</div>');
}

function execDelEquipItem(itemId){
  S.equipItems=S.equipItems.filter(function(i){return i.id!==itemId;});
  S.equipUnits.forEach(function(u){if(u.cells)delete u.cells[itemId];});
  saveData();cm();renderEquipTab();
}

/* ── 호기 삭제 ── */
function delEquipUnit(unitId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  if(!confirm('"'+unit.unitName+'" 호기를 삭제하시겠습니까?')) return;
  S.equipUnits=S.equipUnits.filter(function(u){return u.id!==unitId;});
  saveData();renderEquipTab();
}

/* ── 호기 복사 ── */
function openCopyEquipUnit(fromUnitId){
  var from=S.equipUnits.find(function(u){return u.id===fromUnitId;});
  if(!from) return;
  var targets=S.equipUnits.filter(function(u){return u.id!==fromUnitId&&u.siteId===from.siteId;});
  if(!targets.length){alert('복사할 대상 호기가 없습니다.\n같은 사이트에 호기를 먼저 추가해주세요.');return;}
  var chkHtml=targets.map(function(u){
    return '<label class="chkrow"><input type="checkbox" class="eq_copy_target" value="'+u.id+'"> '+(u.lineName?u.lineName+' - ':'')+u.unitName+'</label>';
  }).join('');
  mw('<div class="mtit">호기 복사</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:12px">'
    +'<b>'+(from.lineName?from.lineName+' - ':'')+from.unitName+'</b>의 데이터를 복사할 대상을 선택하세요.'
    +'<br><span style="color:#cc8010">선택한 호기의 기존 데이터가 덮어쓰입니다.</span></div>'
    +'<div style="max-height:200px;overflow-y:auto;border:1px solid #2a2a34;border-radius:5px;padding:8px 10px">'
    +chkHtml+'</div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="execCopyEquipUnit(\''+fromUnitId+'\')">복사</button>'
    +'</div>');
}

function execCopyEquipUnit(fromUnitId){
  var from=S.equipUnits.find(function(u){return u.id===fromUnitId;});
  if(!from) return;
  var checked=document.querySelectorAll('.eq_copy_target:checked');
  if(!checked.length){alert('대상 호기를 선택해주세요.');return;}
  checked.forEach(function(el){
    var target=S.equipUnits.find(function(u){return u.id===el.value;});
    if(target) target.cells=deepCopy(from.cells||{});
  });
  saveData();cm();renderEquipGrid();
}