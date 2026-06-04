var EVC=[{id:'purple',bg:'#534AB7'},{id:'red',bg:'#b52020'},{id:'green',bg:'#1a8c66'},{id:'amber',bg:'#b8720a'},{id:'coral',bg:'#c04a22'},{id:'blue',bg:'#1558a0'}];
var TYPE_LBL={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
var TYPE_COLOR={hq:'#1a5a9a',outsource:'#8a5a00',tech:'#2a7a5a',vision:'#6a3a9a',host:'#7a2a2a'};

/* ── 상태 ── */
var S={filterSite:'all',showHidden:false,groups:[],sites:[],projects:[],schedules:[],events:[],workTasks:[],equipItems:[],equipUnits:[],equipSiteOrder:[],equipProjects:[],visionTemplate:{categories:[]},visionEquips:[]};

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
/* ══════════════════════════════════════════
   Vision 템플릿 마이그레이션 (loadData + loadFromSheets 공용)
   - loadFromSheets가 Sheets의 구형 템플릿으로 덮어쓴 뒤 saveCache하는 구조 때문에
     마이그레이션을 두 곳 모두에서 실행해야 영구 반영됨
══════════════════════════════════════════ */
function _migrateVisionTemplate(){
  // Migration 1: 구형 템플릿(vi_cameras=camera-multi) → 신형 전체 교체
  (function(){
    var cats=S.visionTemplate.categories||[];
    var visCat=cats.find(function(c){return c.id==='vc_vision';});
    if(!visCat||!visCat.groups)return;
    var camGrp=visCat.groups.find(function(g){return g.id==='vg_camera';});
    if(!camGrp||!camGrp.items)return;
    var camItem=camGrp.items.find(function(i){return i.id==='vi_cameras';});
    if(!camItem||camItem.type!=='camera-multi')return;
    var oldOpts=null;
    var oldBasic=cats.find(function(c){return c.id==='vc_basic';});
    if(oldBasic&&oldBasic.items){var ot=oldBasic.items.find(function(i){return i.id==='vi_type';});if(ot)oldOpts=ot.options;}
    S.visionTemplate=deepCopy(DEF.visionTemplate);
    if(oldOpts){var nb=S.visionTemplate.categories.find(function(c){return c.id==='vc_basic';});if(nb&&nb.items){var nt=nb.items.find(function(i){return i.id==='vi_type';});if(nt)nt.options=oldOpts;}}
  })();
  // Migration 2: vc_board 누락 시 추가 + Vision 내 Board 그룹 잔재 정리
  (function(){
    var cats=S.visionTemplate.categories||[];
    if(cats.find(function(c){return c.id==='vc_board';}))return;
    var defBoard=(DEF.visionTemplate.categories||[]).find(function(c){return c.id==='vc_board';});
    if(!defBoard)return;
    var pcIdx=-1;for(var i=0;i<cats.length;i++){if(cats[i].id==='vc_pc'){pcIdx=i;break;}}
    if(pcIdx>=0) cats.splice(pcIdx,0,deepCopy(defBoard)); else cats.push(deepCopy(defBoard));
    var visCat=cats.find(function(c){return c.id==='vc_vision';});
    if(visCat&&visCat.groups){
      visCat.groups=visCat.groups.filter(function(g){return g.id!=='vg_fg'&&g.id!=='vg_sync'&&g.id!=='vg_trig';});
    }
  })();
  // Migration 3: vi_ram specPlaceholder 누락 시 추가
  (function(){
    var cats=S.visionTemplate.categories||[];
    var pcCat=cats.find(function(c){return c.id==='vc_pc';});
    if(!pcCat||!pcCat.items)return;
    var ram=pcCat.items.find(function(i){return i.id==='vi_ram';});
    if(ram&&!ram.specPlaceholder) ram.specPlaceholder='예: DDR5-4800 16GB';
  })();
  // Migration 4: vg_program 누락 시 Vision 카테고리에 추가
  (function(){
    var cats=S.visionTemplate.categories||[];
    var visCat=cats.find(function(c){return c.id==='vc_vision';});
    if(!visCat||!visCat.groups)return;
    if(visCat.groups.find(function(g){return g.id==='vg_program';}))return;
    var defVis=(DEF.visionTemplate.categories||[]).find(function(c){return c.id==='vc_vision';});
    if(!defVis||!defVis.groups)return;
    var defProg=defVis.groups.find(function(g){return g.id==='vg_program';});
    if(!defProg)return;
    visCat.groups.push(deepCopy(defProg));
  })();
  // Migration 5: vi_notes(특이사항) 누락 시 기본정보에 추가
  (function(){
    var cats=S.visionTemplate.categories||[];
    var basic=cats.find(function(c){return c.id==='vc_basic';});
    if(!basic||!basic.items)return;
    if(basic.items.find(function(i){return i.id==='vi_notes';}))return;
    var maxOrder=basic.items.reduce(function(m,i){return Math.max(m,i.order||0);},-1);
    basic.items.push({id:'vi_notes',name:'특이사항',type:'textarea',order:maxOrder+1,showInGrid:false});
  })();
  // Migration 6: vc_pc → type-pc 변환 + Board에서 FG/Sync 제거
  (function(){
    var cats=S.visionTemplate.categories||[];
    var pcCat=cats.find(function(c){return c.id==='vc_pc';});
    if(pcCat){
      if(!pcCat.items)pcCat.items=[];
      var hasPcItem=pcCat.items.find(function(i){return i.id==='vi_pc'&&i.type==='type-pc';});
      if(!hasPcItem){
        pcCat.items=[{id:'vi_pc',name:'PC',type:'type-pc',order:0,showInGrid:false}];
      } else if(pcCat.items.length>1){
        pcCat.items=[hasPcItem];
      }
    }
    var boardCat=cats.find(function(c){return c.id==='vc_board';});
    if(boardCat&&boardCat.groups){
      boardCat.groups=boardCat.groups.filter(function(g){return g.id!=='vg_fg'&&g.id!=='vg_sync';});
    }
  })();
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
        // string 오염된 cells 차단: 정상 객체만 유지
        S.equipUnits=(d.equipUnits||[]).map(function(u){
          if(u.cells&&typeof u.cells!=='object') u.cells={};
          return u;
        });
        S.equipSiteOrder=d.equipSiteOrder||[];
        S.equipProjects=d.equipProjects||[];
        S.visionTemplate=(d.visionTemplate&&d.visionTemplate.categories&&d.visionTemplate.categories.length)?d.visionTemplate:deepCopy(DEF.visionTemplate);
        S.visionEquips=d.visionEquips||[];
        _migrateVisionTemplate();
        return;
      }
    }
  }catch(e){}
  // 캐시 없으면 DEF 기본 데이터
  var def=deepCopy(DEF);
  S.groups=def.groups||[];S.sites=def.sites;S.projects=def.projects;
  S.schedules=def.schedules;S.events=def.events;S.workTasks=def.workTasks||[];
  S.equipItems=def.equipItems||[];S.equipUnits=def.equipUnits||[];
  S.visionTemplate=def.visionTemplate||{categories:[]};S.visionEquips=def.visionEquips||[];
}
function saveCache(data){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
  }catch(e){}
}

/* ── 데이터 보호: Sheets 로드 전 로컬 스냅샷 백업 ── */
var BACKUP_KEY='trip_data_backup';
function _saveLocalBackup(){
  try{
    var snap={ts:Date.now(),
      equipItems:S.equipItems, equipUnits:S.equipUnits,
      equipProjects:S.equipProjects, equipSiteOrder:S.equipSiteOrder,
      visionTemplate:S.visionTemplate, visionEquips:S.visionEquips,
      schedules:S.schedules, events:S.events, workTasks:S.workTasks,
      sites:S.sites, groups:S.groups, projects:S.projects};
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
  }catch(e){}
}

/* 안전한 cells 객체 여부 확인 */
function _isValidCells(cells){
  return cells&&typeof cells==='object'&&!Array.isArray(cells)&&Object.keys(cells).length>0;
}

/* 수동 전체 데이터 백업 다운로드 */
function downloadDataBackup(){
  try{
    var data={ts:new Date().toISOString(),
      groups:S.groups,sites:S.sites,projects:S.projects,
      schedules:S.schedules,events:S.events,workTasks:S.workTasks,
      equipItems:S.equipItems,equipUnits:S.equipUnits,
      equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,
      visionTemplate:S.visionTemplate,visionEquips:S.visionEquips};
    var json=JSON.stringify(data,null,2);
    var blob=new Blob([json],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    var d=new Date();
    a.href=url;
    a.download='BU3_backup_'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    alert('백업 파일이 다운로드되었습니다.');
  }catch(e){alert('백업 실패: '+e.message);}
}

/* 백업 파일로 데이터 복원 */
function restoreFromBackupFile(){
  var input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.onchange=function(ev){
    var file=ev.target.files[0]; if(!file)return;
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var d=JSON.parse(e.target.result);
        if(!d.sites||!d.equipItems){alert('올바른 백업 파일이 아닙니다.');return;}
        if(!confirm('현재 데이터를 백업 파일로 복원하시겠습니까?\n저장 시각: '+(d.ts||'알 수 없음')))return;
        if(d.groups)S.groups=d.groups;
        if(d.sites&&d.sites.length)S.sites=d.sites;
        if(d.projects)S.projects=d.projects;
        if(d.schedules)S.schedules=d.schedules;
        if(d.events)S.events=d.events;
        if(d.workTasks)S.workTasks=d.workTasks;
        if(d.equipItems&&d.equipItems.length)S.equipItems=d.equipItems;
        if(d.equipUnits&&d.equipUnits.length)S.equipUnits=d.equipUnits;
        if(d.equipSiteOrder)S.equipSiteOrder=d.equipSiteOrder;
        if(d.equipProjects)S.equipProjects=d.equipProjects;
        if(d.visionTemplate&&d.visionTemplate.categories&&d.visionTemplate.categories.length)S.visionTemplate=d.visionTemplate;
        if(d.visionEquips)S.visionEquips=d.visionEquips;
        saveData(); renderAll();
        alert('복원 완료되었습니다.');
      }catch(err){alert('복원 실패: '+err.message);}
    };
    reader.readAsText(file,'utf-8');
  };
  document.body.appendChild(input);input.click();document.body.removeChild(input);
}
function saveData(){
  // 1. 즉시 localStorage 캐시 업데이트 (새로고침 시 최신 상태 보장)
  var snapshot={groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips};
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
      equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,
      visionTemplate:S.visionTemplate,visionEquips:S.visionEquips})
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
  var displayUrl=cur||DEFAULT_SHEETS_URL;
  mw('<div class="mtit">⚙ 설정 / 데이터 관리</div>'
    +'<div style="font-size:11px;font-weight:600;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">Sheets 연동</div>'
    +'<div style="font-size:12px;color:#b0b0b8;margin-bottom:8px">Apps Script 웹앱 URL을 입력하세요.</div>'
    +'<div class="fg"><label class="fl">URL</label>'
    +'<input type="text" id="sheets_url" value="'+displayUrl+'" style="font-size:11px"></div>'
    +'<div style="display:flex;gap:6px;margin-bottom:16px">'
    +'<button class="btn sm warn" onclick="resetSheetsUrl()">기본값</button>'
    +'<button class="btn sm pri" onclick="saveSheetsUrl()">URL 저장</button>'
    +'</div>'
    +'<div style="border-top:1px solid #2a2a34;padding-top:12px;margin-bottom:8px">'
    +'<div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">데이터 백업 / 복원</div>'
    +'<div style="font-size:11px;color:#777;margin-bottom:10px">전체 데이터(간트·인원·설비·이력)를 JSON 파일로 백업하거나 복원합니다.<br>중요한 작업 전 반드시 백업을 권장합니다.</div>'
    +'<div style="display:flex;gap:6px">'
    +'<button class="btn sm gsh" onclick="cm();downloadDataBackup()">💾 JSON 백업 다운로드</button>'
    +'<button class="btn sm" onclick="cm();restoreFromBackupFile()">↩ 백업 파일로 복원</button>'
    +'</div></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">닫기</button>'
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
function showInd(msg){var d=document.createElement('div');d.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-panel);color:var(--tx-primary);padding:20px 32px;border-radius:10px;border:1px solid var(--bd-strong);z-index:999;font-size:13px';d.textContent=msg;document.body.appendChild(d);return d;}
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
        equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,
        visionTemplate:S.visionTemplate,visionEquips:S.visionEquips})
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

      // ── Sheets 로드 전 로컬 스냅샷 보존 ──
      _saveLocalBackup();

      // ── groups / sites / projects ──
      if(data.groups&&data.groups.length)S.groups=data.groups;
      if(data.sites&&data.sites.length){
        var oldSites=S.sites;
        S.sites=data.sites.map(function(ns){
          var old=oldSites.find(function(os){return os.id===ns.id;});
          var def=DEF.sites.find(function(ds){return ds.id===ns.id;});
          if(!ns.groupId&&old&&old.groupId)ns.groupId=old.groupId;
          if(!ns.country){if(old&&old.country)ns.country=old.country;else if(def&&def.country)ns.country=def.country;}
          if(!ns.region){if(old&&old.region)ns.region=old.region;else if(def&&def.region)ns.region=def.region;}
          return ns;
        });
      }
      if(data.projects&&data.projects.length)S.projects=data.projects;

      // ── schedules ──
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

      // ── equipItems: Sheets에 항목이 있을 때만 교체 ──
      if(data.equipItems&&data.equipItems.length)S.equipItems=data.equipItems;
      // (Sheets가 빈 배열이면 로컬 유지 — 항목 정의는 절대 사라지면 안 됨)

      // ── equipUnits: cells 안전 병합 (핵심 보호) ──
      if(data.equipUnits&&data.equipUnits.length){
        var _prevUnits=S.equipUnits||[];
        S.equipUnits=data.equipUnits.map(function(su){
          // string 오염 차단
          if(su.cells&&typeof su.cells!=='object') su.cells={};
          var hasCells=_isValidCells(su.cells);
          if(!hasCells){
            // Sheets에 cells 없으면 로컬 cells 보존
            var local=_prevUnits.find(function(lu){return lu.id===su.id;});
            if(local&&_isValidCells(local.cells)) su.cells=local.cells;
          }
          return su;
        });
        // 로컬에는 있는데 Sheets에 없는 호기 보존 (실수로 삭제된 경우 방지)
        _prevUnits.forEach(function(lu){
          if(!S.equipUnits.find(function(su){return su.id===lu.id;})){
            console.warn('[보호] Sheets 누락 호기 보존:', lu.unitName);
            S.equipUnits.push(lu);
          }
        });
      } else if(S.equipUnits&&S.equipUnits.length){
        // Sheets가 0개인데 로컬에 호기가 있으면 로컬 유지
        console.warn('[보호] Sheets equipUnits 비어있음 — 로컬 데이터 유지');
      }

      // ── equipSiteOrder / equipProjects ──
      if(data.equipSiteOrder&&data.equipSiteOrder.length)S.equipSiteOrder=data.equipSiteOrder;
      if(data.equipProjects)S.equipProjects=data.equipProjects;

      // ── visionTemplate: 카테고리 있을 때만 교체 → 마이그레이션도 함께 적용 ──
      if(data.visionTemplate&&data.visionTemplate.categories&&data.visionTemplate.categories.length){
        S.visionTemplate=data.visionTemplate;
        _migrateVisionTemplate();
      }

      // ── visionEquips: data 안전 병합 ──
      if(data.visionEquips&&data.visionEquips.length){
        var _prevVE=S.visionEquips||[];
        S.visionEquips=data.visionEquips.map(function(ve){
          if(ve.data&&typeof ve.data!=='object') ve.data={};
          if(!ve.data||!Object.keys(ve.data).length){
            var lv=_prevVE.find(function(x){return x.id===ve.id;});
            if(lv&&lv.data&&Object.keys(lv.data).length) ve.data=lv.data;
          }
          return ve;
        });
      }

      saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
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

/* ── 테마 (다크/라이트) ── */
function initTheme(){
  var saved=localStorage.getItem('trip_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
  var btn=document.getElementById('themeToggle');
  if(btn) btn.textContent=saved==='dark'?'🌙':'☀️';
}
function toggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme')||'dark';
  var next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('trip_theme',next);
  var btn=document.getElementById('themeToggle');
  if(btn) btn.textContent=next==='dark'?'🌙':'☀️';
}

/* ── 모바일 사이드바 토글 ── */
function openSidebar(view){
  var sb=view==='gantt'?document.getElementById('ganttSidebar')
        :view==='equip'?document.getElementById('equipSidebar')
        :document.getElementById('visionSidebar');
  if(sb) sb.classList.add('open');
}
function closeSidebar(view){
  var sb=view==='gantt'?document.getElementById('ganttSidebar')
        :view==='equip'?document.getElementById('equipSidebar')
        :document.getElementById('visionSidebar');
  if(sb) sb.classList.remove('open');
}

/* ── 시작 ── */
// 모든 스크립트 로드 후 실행 (renderAll 등이 gantt.js에 정의되므로 DOMContentLoaded 사용)
document.addEventListener('DOMContentLoaded', function(){
  initTheme();
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
  document.getElementById('view_vision').style.display=tab==='vision'?'flex':'none';
  document.getElementById('tab_gantt').className='tab-btn'+(tab==='gantt'?' on':'');
  document.getElementById('tab_person').className='tab-btn'+(tab==='person'?' on':'');
  document.getElementById('tab_equip').className='tab-btn'+(tab==='equip'?' on':'');
  document.getElementById('tab_vision').className='tab-btn'+(tab==='vision'?' on':'');
  document.getElementById('ganttTools').style.display=tab==='gantt'?'flex':'none';
  document.getElementById('equipTools').style.display=tab==='equip'?'flex':'none';
  document.getElementById('visionTools').style.display=tab==='vision'?'flex':'none';
  if(tab==='person') renderPersonTab();
  if(tab==='equip') renderEquipTab();
  if(tab==='vision') renderVisionTab();
}
