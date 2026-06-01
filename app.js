var EVC=[{id:'purple',bg:'#534AB7'},{id:'red',bg:'#b52020'},{id:'green',bg:'#1a8c66'},{id:'amber',bg:'#b8720a'},{id:'coral',bg:'#c04a22'},{id:'blue',bg:'#1558a0'}];
var TYPE_LBL={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
var TYPE_COLOR={hq:'#1a5a9a',outsource:'#8a5a00',tech:'#2a7a5a',vision:'#6a3a9a',host:'#7a2a2a'};

/* ── 상태 ── */
var S={filterSite:'all',showHidden:false,groups:[],sites:[],projects:[],schedules:[],events:[],workTasks:[],equipItems:[],equipUnits:[],equipSiteOrder:[],equipProjects:[]};

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
        S.equipSiteOrder=d.equipSiteOrder||[];
        S.equipProjects=d.equipProjects||[];
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
  var snapshot={groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects};
  saveCache(snapshot);
  // 로컬 변경이 Sheets에 아직 미확인 상태임을 표시
  try{localStorage.setItem(CACHE_DIRTY_KEY,'1');}catch(e){}
  // 2. 비동기로 Sheets에 저장
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){
    // file:// 환경은 Sheets 없이 로컬만 사용 — dirty 플래그 즉시 해제
    try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
    return;
  }
  fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({action:'save',groups:S.groups,sites:S.sites,
      projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,
      equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects})
  }).then(function(r){return r.json();})
  .then(function(data){
    if(data.error){console.warn('자동저장 실패:',data.error);updateConnStatus('err');}
    else{
      // Sheets 저장 확인됨 — dirty 플래그 해제
      try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
      updateConnStatus('ok');
    }
  })
  .catch(function(err){
    console.warn('자동저장 실패:',err.message);
    updateConnStatus('err');
    // dirty 플래그는 유지 (다음 로드 시 로컬 데이터 보호)
  });
}
function updateConnStatus(state){
  var led=document.getElementById('connLed');
  var txt=document.getElementById('connTxt');
  if(!led)return;
  if(state==='ok'){
    led.className='conn-led ok';
    var now=new Date();
    var hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    txt.textContent='저장됨 '+hm;
  }
  else if(state==='err'){led.className='conn-led err';txt.textContent='저장 실패';}
}


var SHEETS_LS_KEY='trip_sheets_url';
var CACHE_KEY='trip_data_cache';  // 데이터 캐시용
var CACHE_TS_KEY='trip_cache_ts'; // 캐시 타임스탬프
var CACHE_DIRTY_KEY='trip_data_dirty'; // 로컬 변경이 Sheets에 미확인 저장된 경우 표시
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
  // 로컬에 미확인 변경사항이 있으면 Sheets로 PUSH 후 정상 로드
  var isDirty=false;
  try{isDirty=!!localStorage.getItem(CACHE_DIRTY_KEY);}catch(e){}
  var led=document.getElementById('connLed');
  var txt=document.getElementById('connTxt');
  if(led){led.className='conn-led chk';txt.textContent=isDirty?'미저장 동기화 중...':'동기화 중...';}
  if(isDirty){
    // 로컬 데이터를 Sheets로 밀어넣고 dirty 해제 후 콜백
    fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'save',groups:S.groups,sites:S.sites,
        projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,
        equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects})
    }).then(function(r){return r.json();})
    .then(function(data){
      if(!data.error){
        try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
        if(led){led.className='conn-led ok';txt.textContent='동기화 완료';}
      } else {
        if(led){led.className='conn-led err';txt.textContent='동기화 실패';}
      }
      if(callback)callback();
    })
    .catch(function(){
      if(led){led.className='conn-led err';txt.textContent='동기화 실패';}
      if(callback)callback();
    });
    return;
  }
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
          if(typeof sc.hidden==='string'){
            sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          }
          return sc;
        });
      }
      if(data.events)S.events=data.events;
      if(data.workTasks)S.workTasks=data.workTasks.map(function(wt){wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;});
      if(data.equipItems&&data.equipItems.length)S.equipItems=data.equipItems;
      if(data.equipUnits)S.equipUnits=data.equipUnits;
      if(data.equipSiteOrder&&data.equipSiteOrder.length)S.equipSiteOrder=data.equipSiteOrder;
      if(data.equipProjects)S.equipProjects=data.equipProjects;
      saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects});
      if(led){led.className='conn-led ok';txt.textContent='연결 정상';}
      if(callback)callback();
    })
    .catch(function(err){
      console.warn('불러오기 실패:',err.message);
      if(led){led.className='conn-led err';txt.textContent='연결 실패';}
      if(callback)callback();
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

/* ── 시작 ── */
// 모든 스크립트 로드 후 실행 (renderAll 등이 gantt.js에 정의되므로 DOMContentLoaded 사용)
document.addEventListener('DOMContentLoaded', function(){
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
});

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
