var EVC=[{id:'purple',bg:'#534AB7'},{id:'red',bg:'#b52020'},{id:'green',bg:'#1a8c66'},{id:'amber',bg:'#b8720a'},{id:'coral',bg:'#c04a22'},{id:'blue',bg:'#1558a0'}];
var TYPE_LBL={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
var TYPE_COLOR={hq:'#1a5a9a',outsource:'#8a5a00',tech:'#2a7a5a',vision:'#6a3a9a',host:'#7a2a2a'};

/* ── 상태 ── */
var S={filterSite:'all',showHidden:false,groups:[],sites:[],projects:[],schedules:[],events:[],workTasks:[],equipItems:[],equipUnits:[],equipSiteOrder:[],equipProjects:[],visionTemplate:{categories:[]},visionEquips:[]};
/* 삭제된 일정 ID 추적 — merge 시 재복원 방지
   localStorage 영속화: 새로고침/재로드 후에도 삭제 기록 유지 (24시간 후 자동 정리) */
var _DELETED_SC_LS_KEY='bu3_del_sc';
var _deletedScIdMap=(function(){
  try{
    var d=JSON.parse(localStorage.getItem(_DELETED_SC_LS_KEY)||'{}');
    var cutoff=Date.now()-86400000;
    var dirty=false;
    Object.keys(d).forEach(function(id){if(typeof d[id]!=='number'||d[id]<cutoff){delete d[id];dirty=true;}});
    if(dirty)try{localStorage.setItem(_DELETED_SC_LS_KEY,JSON.stringify(d));}catch(e2){}
    return d;
  }catch(e){return {};}
})();
function _markDeletedSc(id){
  _deletedScIdMap[id]=Date.now();
  try{localStorage.setItem(_DELETED_SC_LS_KEY,JSON.stringify(_deletedScIdMap));}catch(e){}
}
function _isDeletedSc(id){return !!_deletedScIdMap[id];}
/* 삭제된 visionEquip ID 추적 — refreshVisionFromSheets/loadFromSheets merge 시 재복원 방지
   localStorage 영속화: 새로고침/재로드 후에도 삭제 기록 유지 (24시간 후 자동 정리) */
var _DELETED_VI_LS_KEY='bu3_del_vi';
var _deletedViIdMap=(function(){
  try{
    var d=JSON.parse(localStorage.getItem(_DELETED_VI_LS_KEY)||'{}');
    var cutoff=Date.now()-86400000; // 24시간 이전 항목 정리
    var dirty=false;
    Object.keys(d).forEach(function(id){if(typeof d[id]!=='number'||d[id]<cutoff){delete d[id];dirty=true;}});
    if(dirty)try{localStorage.setItem(_DELETED_VI_LS_KEY,JSON.stringify(d));}catch(e2){}
    return d;
  }catch(e){return {};}
})();
function _markDeletedVi(id){
  _deletedViIdMap[id]=Date.now();
  try{localStorage.setItem(_DELETED_VI_LS_KEY,JSON.stringify(_deletedViIdMap));}catch(e){}
}
function _isDeletedVi(id){return !!_deletedViIdMap[id];}

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
  // Migration 2: vc_board 누락 시 추가 (vc_vision 앞에 삽입) + Vision 내 Board 그룹 잔재 정리
  (function(){
    var cats=S.visionTemplate.categories||[];
    if(cats.find(function(c){return c.id==='vc_board';}))return;
    var defBoard=(DEF.visionTemplate.categories||[]).find(function(c){return c.id==='vc_board';});
    if(!defBoard)return;
    var visIdx=-1;for(var i=0;i<cats.length;i++){if(cats[i].id==='vc_vision'){visIdx=i;break;}}
    if(visIdx>=0) cats.splice(visIdx,0,deepCopy(defBoard)); else cats.push(deepCopy(defBoard));
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
  // Migration 6: vc_pc → type-pc 변환
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
  })();
  // Migration 7: vi_os/vi_license → 기본정보에서 제거, vg_program → Vision에서 제거
  (function(){
    var cats=S.visionTemplate.categories||[];
    var basic=cats.find(function(c){return c.id==='vc_basic';});
    if(basic&&basic.items){
      basic.items=basic.items.filter(function(i){return i.id!=='vi_os'&&i.id!=='vi_license';});
    }
    var vis=cats.find(function(c){return c.id==='vc_vision';});
    if(vis&&vis.groups){
      vis.groups=vis.groups.filter(function(g){return g.id!=='vg_program';});
    }
  })();
  // Migration 8: vi_board_trig labels[0] '모델명' → '사용 용도'
  (function(){
    var cats=S.visionTemplate.categories||[];
    var boardCat=cats.find(function(c){return c.id==='vc_board';});
    if(!boardCat||!boardCat.groups)return;
    var trigGrp=boardCat.groups.find(function(g){return g.id==='vg_trig';});
    if(!trigGrp||!trigGrp.items)return;
    var trigItem=trigGrp.items.find(function(i){return i.id==='vi_board_trig';});
    if(!trigItem)return;
    if(!trigItem.labels||trigItem.labels[0]==='모델명'){
      trigItem.labels=['사용 용도','BOARD 버전','FIRMWARE'];
    }
  })();
  // Migration 9: vi_program → vc_basic에 추가 (없는 경우)
  (function(){
    var cats=S.visionTemplate.categories||[];
    var bc=cats.find(function(c){return c.id==='vc_basic';});
    if(!bc||!bc.items)return;
    if(bc.items.find(function(i){return i.id==='vi_program';}))return;
    var snIdx=bc.items.findIndex(function(i){return i.id==='vi_sn';});
    var insertAt=snIdx>=0?snIdx+1:bc.items.length;
    bc.items.splice(insertAt,0,{id:'vi_program',name:'Program',type:'type-program',order:5,showInGrid:true});
    bc.items.forEach(function(i){if(i.id==='vi_notes')i.order=6;});
  })();
  // Migration 10: vc_board에 vg_fg / vg_sync 그룹 누락 시 추가
  (function(){
    var cats=S.visionTemplate.categories||[];
    var boardCat=cats.find(function(c){return c.id==='vc_board';});
    if(!boardCat||!boardCat.groups)return;
    var defBoard=(DEF.visionTemplate.categories||[]).find(function(c){return c.id==='vc_board';});
    if(!defBoard||!defBoard.groups)return;
    ['vg_fg','vg_sync'].forEach(function(gid){
      if(!boardCat.groups.find(function(g){return g.id===gid;})){
        var defGrp=defBoard.groups.find(function(g){return g.id===gid;});
        if(defGrp) boardCat.groups.push(deepCopy(defGrp));
      }
    });
  })();
  // Migration 11: vc_board가 vc_vision 뒤에 있으면 앞으로 이동
  (function(){
    var cats=S.visionTemplate.categories||[];
    var boardIdx=-1,visIdx=-1;
    for(var i=0;i<cats.length;i++){
      if(cats[i].id==='vc_board') boardIdx=i;
      if(cats[i].id==='vc_vision') visIdx=i;
    }
    if(boardIdx>=0&&visIdx>=0&&boardIdx>visIdx){
      var boardCat=cats.splice(boardIdx,1)[0];
      cats.splice(visIdx,0,boardCat);
    }
  })();
  // Migration 12: vc_controller 누락 시 vc_board 뒤에 추가
  (function(){
    var cats=S.visionTemplate.categories||[];
    if(cats.find(function(c){return c.id==='vc_controller';}))return;
    var defCtrl=(DEF.visionTemplate.categories||[]).find(function(c){return c.id==='vc_controller';});
    if(!defCtrl)return;
    var boardIdx=-1;
    for(var i=0;i<cats.length;i++){if(cats[i].id==='vc_board'){boardIdx=i;break;}}
    if(boardIdx>=0) cats.splice(boardIdx+1,0,deepCopy(defCtrl));
    else cats.push(deepCopy(defCtrl));
  })();
}

/* Vision 설비 데이터 마이그레이션 — pc.program → vi_program, pc.fg/sync → vi_fg/vi_sync */
function _migrateVisionEquips(){
  (S.visionEquips||[]).forEach(function(e){
    if(!e.data)return;
    var viPc=e.data['vi_pc'];
    if(!viPc||typeof viPc!=='object'||Array.isArray(viPc))return;
    if(!e.data['vi_program'])e.data['vi_program']={};
    Object.keys(viPc).forEach(function(type){
      if(!Array.isArray(viPc[type]))return;
      if(e.data['vi_program'][type]&&e.data['vi_program'][type].length){
        viPc[type].forEach(function(pc){delete pc.program;});
        return;
      }
      var merged=[],seen={};
      viPc[type].forEach(function(pc){
        if(!Array.isArray(pc.program))return;
        pc.program.forEach(function(p){
          var key=(p.name||'')+'@'+(p.version||'');
          if(!seen[key]&&(p.name||p.version)){seen[key]=true;merged.push(p);}
        });
        delete pc.program;
      });
      if(merged.length)e.data['vi_program'][type]=merged;
    });
  });
  // pc.fg / pc.sync → vi_fg / vi_sync 이관 (equip-level board-multi)
  (S.visionEquips||[]).forEach(function(e){
    if(!e.data)return;
    var d=e.data;
    function _migratePcBoard(key){
      if(Array.isArray(d[key])&&d[key].length)return;
      var arr=[],seen={};
      var viPc2=d['vi_pc'];
      if(!viPc2||typeof viPc2!=='object'||Array.isArray(viPc2))return;
      Object.keys(viPc2).forEach(function(type){
        var pcs=Array.isArray(viPc2[type])?viPc2[type]:[];
        pcs.forEach(function(pc){
          var sub=pc[key==='vi_fg'?'fg':'sync'];
          if(!Array.isArray(sub))return;
          sub.forEach(function(r){
            if(r.model||r.board||r.fw){
              var k=(r.model||'')+'|'+(r.board||'')+'|'+(r.fw||'');
              if(!seen[k]){seen[k]=true;arr.push({model:r.model||'',board:r.board||'',fw:r.fw||''});}
            }
          });
        });
      });
      if(arr.length)d[key]=arr;
    }
    _migratePcBoard('vi_fg');
    _migratePcBoard('vi_sync');
  });
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
        _migrateVisionEquips();
        try{var cv=JSON.parse(localStorage.getItem('viColVis')||'{}');S.visionColVis=cv;}catch(e){S.visionColVis={};}
        return;
      }
    }
  }catch(e){console.warn('[loadData] 캐시 파싱 실패:', e.message);}
  // 캐시 없으면 DEF 기본 데이터 — dirty 플래그 제거 (DEF 샘플 데이터를 Sheets에 올리지 않음)
  try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
  var def=deepCopy(DEF);
  S.groups=def.groups||[];S.sites=def.sites;S.projects=def.projects;
  S.schedules=def.schedules;S.events=def.events;S.workTasks=def.workTasks||[];
  S.equipItems=def.equipItems||[];S.equipUnits=def.equipUnits||[];
  S.visionTemplate=def.visionTemplate||{categories:[]};S.visionEquips=def.visionEquips||[];
  S.visionColVis={};
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
/* ── Sheets 저장 직렬화 상태 ── */
var _saveDebounceTimer=null; // debounce 타이머
var _saveInFlight=false;     // 현재 Sheets POST 진행 중
var _savePending=false;      // 진행 중에 추가 저장 요청 있음

function saveData(){
  // 1. 즉시 localStorage 캐시 업데이트 (새로고침·오프라인 시 최신 상태 보장)
  var snapshot={groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips};
  saveCache(snapshot);
  try{localStorage.setItem(CACHE_DIRTY_KEY,'1');}catch(e){}

  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){
    try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
    return;
  }
  // 2. debounce 300ms — 연속 수정 시 마지막 것만 Sheets에 전송
  if(_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer=setTimeout(_flushToSheets, 300);
}

function _flushToSheets(){
  _saveDebounceTimer=null;
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:') return;

  // 3. 직렬화 — 이미 저장 중이면 pending 표시 후 완료 시 재실행
  if(_saveInFlight){_savePending=true;return;}
  _saveInFlight=true;
  updateConnStatus('saving');

  // 4. merge 함수 — schedules/workTasks/events 모두 Sheets 데이터와 병합
  function _mergeFromSheets(sheetsData){
    if(!sheetsData||sheetsData.error) return;
    var changed=false;
    // ── deletedScheduleIds: 다른 기기에서 삭제한 일정 ID를 로컬에도 반영
    if(sheetsData.deletedScheduleIds&&sheetsData.deletedScheduleIds.length){
      sheetsData.deletedScheduleIds.forEach(function(id){
        if(!_isDeletedSc(id))_markDeletedSc(id);
      });
      // 로컬 S.schedules에서 삭제 대상 제거
      var beforeLen=S.schedules.length;
      S.schedules=S.schedules.filter(function(sc){return !_isDeletedSc(sc.id);});
      if(S.schedules.length<beforeLen)changed=true;
    }
    // ── schedules merge (삭제한 것 제외)
    if(sheetsData.schedules&&sheetsData.schedules.length){
      var localIds={};
      S.schedules.forEach(function(s){localIds[s.id]=true;});
      sheetsData.schedules.forEach(function(sc){
        if(!localIds[sc.id]&&!_isDeletedSc(sc.id)){
          sc.start=normDate(sc.start);sc.end=normDate(sc.end);
          if(typeof sc.hidden==='string'){
            sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          }
          S.schedules.push(sc);localIds[sc.id]=true;changed=true;
        }
      });
    }
    // ── workTasks: 로컬이 비어있고 Sheets에 데이터가 있으면 Sheets 우선
    if(sheetsData.workTasks&&sheetsData.workTasks.length){
      if(!S.workTasks||!S.workTasks.length){
        S.workTasks=sheetsData.workTasks.map(function(wt){
          wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;
        });
        console.warn('[보호] 로컬 workTasks 비어있음 → Sheets 데이터 복원:',S.workTasks.length,'건');
        changed=true;
      }
    }
    // ── events: 로컬이 비어있고 Sheets에 데이터가 있으면 Sheets 우선
    if(sheetsData.events&&sheetsData.events.length){
      if(!S.events||!S.events.length){
        S.events=sheetsData.events;
        console.warn('[보호] 로컬 events 비어있음 → Sheets 데이터 복원:',S.events.length,'건');
        changed=true;
      }
    }
    // ── sites: Sheets에만 있는 사이트를 로컬에 추가 (다기기 동기화 보호)
    if(sheetsData.sites&&sheetsData.sites.length){
      var _lsids={};S.sites.forEach(function(s){_lsids[s.id]=true;});
      sheetsData.sites.forEach(function(ss){
        if(!_lsids[ss.id]){S.sites.push(ss);_lsids[ss.id]=true;changed=true;console.warn('[보호] Sheets 사이트 병합:',ss.name);}
      });
    }
    // ── groups: Sheets에만 있는 그룹을 로컬에 추가
    if(sheetsData.groups&&sheetsData.groups.length){
      var _lgids={};S.groups.forEach(function(g){_lgids[g.id]=true;});
      sheetsData.groups.forEach(function(sg){
        if(!_lgids[sg.id]){S.groups.push(sg);_lgids[sg.id]=true;changed=true;}
      });
    }
    // ── projects: Sheets에만 있는 프로젝트를 로컬에 추가
    if(sheetsData.projects&&sheetsData.projects.length){
      var _lpids={};S.projects.forEach(function(p){_lpids[p.id]=true;});
      sheetsData.projects.forEach(function(sp){
        if(!_lpids[sp.id]){S.projects.push(sp);changed=true;}
      });
    }
    if(changed){
      saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
    }
  }

  // 5. 저장 완료 처리 (성공/실패 공통)
  function _onDone(ok){
    _saveInFlight=false;
    if(ok){
      try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
      S._schCache=null; // 캐시 무효화 — 다음 saveData 시 Sheets에서 최신 데이터 재조회
      updateConnStatus('ok');
    } else {
      updateConnStatus('err');
    }
    // pending 요청이 있으면 즉시 재실행
    if(_savePending){_savePending=false;_flushToSheets();}
  }

  // 6. Sheets 조회 캐시(30초) → merge → POST
  var _now=Date.now();
  var _cacheOk=S._schCache&&S._schCache.ts&&(_now-S._schCache.ts)<30000;
  var fetchPromise=_cacheOk
    ? Promise.resolve(S._schCache.data)
    : fetch(url+'?action=load').then(function(r){return r.json();}).then(function(d){S._schCache={data:d,ts:_now};return d;});

  fetchPromise
    .catch(function(){return null;}) // GET 실패해도 POST는 진행
    .then(function(sheetsData){
      _mergeFromSheets(sheetsData);
      return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},
        body:JSON.stringify({action:'save',groups:S.groups,sites:S.sites,
          projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,
          equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,
          visionTemplate:S.visionTemplate,visionEquips:S.visionEquips,
          deletedScheduleIds:Object.keys(_deletedScIdMap)})
      });
    })
    .then(function(r){return r.json();})
    .then(function(data){_onDone(!data.error);})
    .catch(function(err){console.error('[saveData]',err.message);_onDone(false);});
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
  else if(state==='saving'){led.className='conn-led chk';txt.textContent='저장 중...';}
  else if(state==='err'){
    led.className='conn-led err';txt.textContent='저장 실패 ⚠';
    // 저장 실패 시 상단 배너로 경고 (5초 후 자동 숨김)
    _showSaveFailBanner();
  }
}
var _saveFailBannerTimer=null;
function _showSaveFailBanner(){
  var banner=document.getElementById('saveFailBanner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='saveFailBanner';
    banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#b52020;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;';
    banner.innerHTML='⚠ Sheets 저장 실패 — 네트워크 확인 후 페이지 새로고침을 권장합니다. <span style="text-decoration:underline;cursor:pointer" onclick="document.getElementById(\'saveFailBanner\').style.display=\'none\'">닫기</span>';
    document.body.appendChild(banner);
  }
  banner.style.display='block';
  if(_saveFailBannerTimer) clearTimeout(_saveFailBannerTimer);
  _saveFailBannerTimer=setTimeout(function(){
    if(banner) banner.style.display='none';
  }, 8000);
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
        // 로컬에만 있는 사이트 보존 (Sheets 미반영 신규 사이트)
        oldSites.forEach(function(os){
          if(!S.sites.find(function(s){return s.id===os.id;})){
            console.warn('[보호] Sheets 미반영 로컬 사이트 보존:',os.name);
            S.sites.push(os);
          }
        });
      }
      if(data.projects&&data.projects.length)S.projects=data.projects;

      // ── deletedScheduleIds: 다른 기기에서 삭제한 일정 ID를 로컬에도 반영 ──
      if(data.deletedScheduleIds&&data.deletedScheduleIds.length){
        data.deletedScheduleIds.forEach(function(id){
          if(!_isDeletedSc(id))_markDeletedSc(id);
        });
      }

      // ── schedules: merge 방식 (로컬 전용 일정 보존) ──
      if(data.schedules&&data.schedules.length){
        var _sheetsSids={};
        data.schedules.forEach(function(s){_sheetsSids[s.id]=true;});
        // 로컬에만 있는 일정 보존 (Sheets 로드 전 로컬에서 추가된 것, 단 삭제한 것은 제외)
        var _localSafe=(S.schedules||[]).filter(function(s){return !_sheetsSids[s.id]&&!_isDeletedSc(s.id);});
        S.schedules=data.schedules.map(function(sc){
          sc.start=normDate(sc.start);sc.end=normDate(sc.end);
          if(typeof sc.hidden==='string'){
            sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          }
          return sc;
        }).filter(function(sc){return !_isDeletedSc(sc.id);}); // Sheets에 남아있어도 삭제된 것은 제거
        if(_localSafe.length){
          console.warn('[보호] Sheets 미반영 로컬 일정 보존:',_localSafe.length,'건');
          S.schedules=S.schedules.concat(_localSafe);
        }
        // 중복 ID 제거 (네트워크 경합으로 같은 일정이 복수 등록된 경우)
        var _seenIds={};
        S.schedules=S.schedules.filter(function(sc){
          if(_seenIds[sc.id])return false;
          _seenIds[sc.id]=true;return true;
        });
      }
      if(data.events&&data.events.length)S.events=data.events;
      if(data.workTasks&&data.workTasks.length)S.workTasks=data.workTasks.map(function(wt){wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;});

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
        S.visionEquips=data.visionEquips.filter(function(ve){return !_isDeletedVi(ve.id);}).map(function(ve){
          if(ve.data&&typeof ve.data!=='object') ve.data={};
          if(!ve.data||!Object.keys(ve.data).length){
            var lv=_prevVE.find(function(x){return x.id===ve.id;});
            if(lv&&lv.data&&Object.keys(lv.data).length) ve.data=lv.data;
          }
          return ve;
        });
      }

      var _cacheSnap={groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips};
      saveCache(_cacheSnap);
      // saveData()의 30초 merge 캐시도 갱신 (로드 직후 저장 시 추가 GET 방지)
      S._schCache={data:_cacheSnap,ts:Date.now()};
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
  // 5분마다 배경 데이터 갱신 — 렌더링 없이 S와 캐시만 최신화
  // (다음 저장 시 최신 Sheets 데이터 기준으로 merge되어 다른 사용자 입력 보호)
  (function bgRefresh(){
    var url=getSheetsUrl();
    if(!url||location.protocol==='file:')return;
    setInterval(function(){
      var mc=document.getElementById('mc');
      var isModalOpen=(mc&&mc.innerHTML&&mc.innerHTML.length>0);
      if(isModalOpen) return; // 모달/폼 입력 중에는 배경 갱신 건너뜀
      if(_activeTab==='vision') return; // Vision 탭은 자체 2분 타이머가 처리
      // 배경에서 데이터만 갱신 (S + 캐시 업데이트, 렌더링 없음)
      // 다음 저장 시 최신 데이터 기준으로 merge되어 다른 사용자 입력 보호
      loadFromSheets(function(){ /* 렌더링 없음 — 깜빡임 방지 */ });
    }, 5*60*1000); // 5분
  })();
});

/* ════════════════════════════════════════════
   탭 전환
════════════════════════════════════════════ */
var _activeTab='gantt';
var _viSyncTimer=null; // 이력관리 자동 동기화 타이머

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
  if(tab==='vision'){
    renderVisionTab();
    // 탭 진입 시 Sheets에서 최신 이력관리 데이터 자동 Pull
    refreshVisionFromSheets(true);
    // 2분마다 자동 갱신
    if(_viSyncTimer) clearInterval(_viSyncTimer);
    _viSyncTimer=setInterval(function(){refreshVisionFromSheets(true);},2*60*1000);
  } else {
    // Vision 탭 벗어나면 타이머 중지
    if(_viSyncTimer){clearInterval(_viSyncTimer);_viSyncTimer=null;}
  }
}

/* 이력관리 전용 Sheets Pull (isDirty 무관, visionEquips/visionTemplate만 갱신) */
function refreshVisionFromSheets(silent){
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){
    if(!silent) alert('Sheets 연결이 설정되지 않았습니다.\n⚙ Sheets 설정에서 URL을 확인해주세요.');
    return;
  }
  fetch(url+'?action=load')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(data){
      if(data.error)throw new Error(data.error);
      var updated=false;
      if(data.visionEquips&&data.visionEquips.length){
        var sheetsIds={};
        data.visionEquips.forEach(function(e){sheetsIds[e.id]=true;});
        var localOnly=(S.visionEquips||[]).filter(function(e){return !sheetsIds[e.id]&&!_isDeletedVi(e.id);});
        var _prevVE=S.visionEquips||[];
        S.visionEquips=data.visionEquips.filter(function(ve){return !_isDeletedVi(ve.id);}).map(function(ve){
          if(ve.data&&typeof ve.data!=='object') ve.data={};
          var lv=_prevVE.find(function(x){return x.id===ve.id;});
          // data: Sheets가 비어있으면 로컬 유지
          if(!ve.data||!Object.keys(ve.data).length){
            if(lv&&lv.data&&Object.keys(lv.data).length) ve.data=lv.data;
          }
          // fieldUpdated/changelog: 로컬이 더 최신일 수 있으므로 항목 수가 많은 쪽 우선
          if(lv){
            if(lv.fieldUpdated&&Object.keys(lv.fieldUpdated).length>=Object.keys(ve.fieldUpdated||{}).length){
              ve.fieldUpdated=lv.fieldUpdated;
            }
            if(lv.changelog&&lv.changelog.length>=(ve.changelog||[]).length&&lv.changelog.length>0){
              ve.changelog=lv.changelog;
            }
          }
          return ve;
        }).concat(localOnly);
        updated=true;
      }
      if(data.visionTemplate&&data.visionTemplate.categories&&data.visionTemplate.categories.length){
        if(typeof _visionEditMode==='undefined'||!_visionEditMode){
          S.visionTemplate=data.visionTemplate;
          _migrateVisionTemplate();
          updated=true;
        }
      }
      if(updated){
        // Sheets에서 방금 받은 데이터로 schedules/events/workTasks도 동기화
        // (stale한 로컬 일정이 Sheets에 push되는 것 방지 — 핵심 데이터 보호)
        if(data.schedules&&data.schedules.length){
          var _vSheetsSids={};
          data.schedules.forEach(function(s){_vSheetsSids[s.id]=true;});
          var _vLocalSafe=(S.schedules||[]).filter(function(s){return !_vSheetsSids[s.id]&&!_isDeletedSc(s.id);});
          S.schedules=data.schedules.map(function(sc){
            sc.start=normDate(sc.start);sc.end=normDate(sc.end);
            if(typeof sc.hidden==='string'){
              sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
            }
            return sc;
          });
          if(_vLocalSafe.length) S.schedules=S.schedules.concat(_vLocalSafe);
        }
        if(data.events&&data.events.length) S.events=data.events;
        if(data.workTasks&&data.workTasks.length) S.workTasks=data.workTasks.map(function(wt){
          wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;
        });
        // localOnly equips가 있을 때만 Sheets에 push (그렇지 않으면 캐시만 갱신)
        // → 매 2분마다 불필요한 Sheets write + stale 데이터 push를 완전 차단
        if(localOnly.length>0){
          saveData(); // read-before-write merge 후 Sheets 저장
        } else {
          saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
        }
        // Vision 탭 렌더링: 모달이 열려 있지 않을 때만 갱신 (입력 중 초기화 방지)
        var _mc=document.getElementById('mc');
        if(_activeTab==='vision'&&typeof renderVisionTab==='function'&&(!_mc||!_mc.innerHTML)){
          // 사이드바는 항상 갱신, 그리드 뷰는 renderVisionMain()(스크롤 보존 포함)만 호출
          if(typeof renderVisionSidebar==='function') renderVisionSidebar();
          if(typeof _visionView==='undefined'||_visionView!=='detail'){
            if(typeof renderVisionMain==='function') renderVisionMain();
          }
        }
      }
      if(!silent){
        var sheetsCount=(data.visionEquips&&data.visionEquips.length)||0;
        if(sheetsCount===0){
          alert('Sheets에 이력관리 설비 데이터가 없습니다.\n\nApps Script가 배포되지 않았을 수 있습니다.\n(Backup 폴더 → Apps Script 업데이트_Vision이력관리.txt 참조)');
        } else {
          alert('Sheets에서 '+sheetsCount+'개 설비를 가져왔습니다. (현재 총 '+S.visionEquips.length+'개)');
        }
      }
    })
    .catch(function(err){
      if(!silent) alert('Sheets 불러오기 실패: '+err.message);
    });
}
