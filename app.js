var EVC=[{id:'purple',bg:'#534AB7'},{id:'red',bg:'#b52020'},{id:'green',bg:'#1a8c66'},{id:'amber',bg:'#b8720a'},{id:'coral',bg:'#c04a22'},{id:'blue',bg:'#1558a0'}];
var TYPE_LBL={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
var TYPE_COLOR={hq:'#1a5a9a',outsource:'#8a5a00',tech:'#2a7a5a',vision:'#6a3a9a',host:'#7a2a2a'};

/* ── 상태 ── */
var S={filterSite:'all',showHidden:false,groups:[],sites:[],projects:[],schedules:[],events:[],workTasks:[],equipItems:[],equipUnits:[],equipSiteOrder:[],equipProjects:[],visionTemplate:{categories:[]},visionEquips:[]};
/* ══════════════════════════════════════════
   통합 Tombstone(삭제 기록) 모듈 — 모든 엔티티 타입의 삭제 ID 추적
   - merge/pull 시 삭제 레코드 재복원(부활) 방지
   - POST로 Sheets에 전파(deletedIds) → 다른 PC에서도 삭제 반영
   - localStorage 영속화, 30일 후 자동 정리
   - type = 엔티티 배열명: schedules, events, workTasks, sites, groups,
     projects, equipItems, equipUnits, equipProjects, visionEquips
══════════════════════════════════════════ */
var _TOMB_LS_KEY='bu3_tomb_v1';
var _tombMap=(function(){
  var m={};
  try{m=JSON.parse(localStorage.getItem(_TOMB_LS_KEY)||'{}')||{};}catch(e){m={};}
  // 구 키(bu3_del_sc / bu3_del_vi)에서 1회 마이그레이션
  try{
    var oldSc=JSON.parse(localStorage.getItem('bu3_del_sc')||'{}');
    var oldVi=JSON.parse(localStorage.getItem('bu3_del_vi')||'{}');
    if(Object.keys(oldSc).length){m.schedules=m.schedules||{};Object.keys(oldSc).forEach(function(id){if(!m.schedules[id])m.schedules[id]=oldSc[id];});localStorage.removeItem('bu3_del_sc');}
    if(Object.keys(oldVi).length){m.visionEquips=m.visionEquips||{};Object.keys(oldVi).forEach(function(id){if(!m.visionEquips[id])m.visionEquips[id]=oldVi[id];});localStorage.removeItem('bu3_del_vi');}
  }catch(e){}
  // TTL 30일 정리
  var cutoff=Date.now()-30*24*60*60*1000;
  Object.keys(m).forEach(function(type){
    Object.keys(m[type]||{}).forEach(function(id){
      if(typeof m[type][id]!=='number'||m[type][id]<cutoff)delete m[type][id];
    });
    if(!Object.keys(m[type]).length)delete m[type];
  });
  try{localStorage.setItem(_TOMB_LS_KEY,JSON.stringify(m));}catch(e){}
  return m;
})();
function _tombSave(){try{localStorage.setItem(_TOMB_LS_KEY,JSON.stringify(_tombMap));}catch(e){}}
function _markDeleted(type,id){
  if(!id)return;
  if(!_tombMap[type])_tombMap[type]={};
  _tombMap[type][id]=Date.now();
  _tombSave();
}
function _isDeleted(type,id){return !!(_tombMap[type]&&_tombMap[type][id]);}
/* 서버 tombstone 해제 요청 대기열 — 백업 복원으로 살린 레코드가 다시 삭제되지 않도록
   localStorage 영속화 (POST 실패/새로고침에도 유지, 성공 시 비움) */
var _TOMB_CLEAR_LS_KEY='bu3_tomb_clear';
var _tombClearQueue=(function(){
  try{return JSON.parse(localStorage.getItem(_TOMB_CLEAR_LS_KEY)||'[]')||[];}catch(e){return [];}
})();
function _tombClearSave(){try{localStorage.setItem(_TOMB_CLEAR_LS_KEY,JSON.stringify(_tombClearQueue));}catch(e){}}
function _unmarkDeleted(type,id){
  if(!id)return;
  if(_tombMap[type]&&_tombMap[type][id]){delete _tombMap[type][id];_tombSave();}
  if(!_tombClearQueue.some(function(t){return t.type===type&&t.id===id;})){
    _tombClearQueue.push({id:id,type:type});_tombClearSave();
  }
}
function _tombClearFlushDone(){if(_tombClearQueue.length){_tombClearQueue=[];_tombClearSave();}}
/* POST용: [{id,type,ts},...] 배열 변환 */
function _tombList(){
  var out=[];
  Object.keys(_tombMap).forEach(function(type){
    Object.keys(_tombMap[type]).forEach(function(id){
      out.push({id:id,type:type,ts:_tombMap[type][id]});
    });
  });
  return out;
}
/* GET 응답의 deletedIds 흡수 — 다른 기기의 삭제 기록 반영. 변경 여부 반환
   (해제 대기열에 있는 항목은 흡수하지 않음 — 백업 복원 직후 재삭제 방지) */
function _absorbTombs(arr){
  if(!arr||!arr.length)return false;
  var changed=false;
  arr.forEach(function(t){
    if(!t||!t.id||!t.type)return;
    if(_tombClearQueue.some(function(c){return c.type===t.type&&c.id===t.id;}))return;
    if(!_isDeleted(t.type,t.id)){
      if(!_tombMap[t.type])_tombMap[t.type]={};
      _tombMap[t.type][t.id]=Number(t.ts)||Date.now();
      changed=true;
    }
  });
  if(changed)_tombSave();
  return changed;
}
/* 기존 호출부 호환 shim (modals.js / vision.js 등에서 사용) */
function _markDeletedSc(id){_markDeleted('schedules',id);}
function _isDeletedSc(id){return _isDeleted('schedules',id);}
function _markDeletedVi(id){_markDeleted('visionEquips',id);}
function _isDeletedVi(id){return _isDeleted('visionEquips',id);}
/* deletedScheduleIds 레거시 POST 필드용 */
function _deletedScIds(){return Object.keys(_tombMap.schedules||{});}

function deepCopy(o){return JSON.parse(JSON.stringify(o));}
/* ── 레코드 수정시각 마킹 (mt: epoch ms 숫자 — 동기화 충돌 시 최신 판정용) ── */
function _touch(r){if(r)r.mt=Date.now();return r;}
/* ── ID 생성 (timestamp base36 + 난수 — 다중 PC 동시 생성 충돌 방지) ── */
function genId(prefix,arr){
  var id;
  do{ id=prefix+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
  while(arr&&arr.some(function(r){return r.id===id;}));
  return id;
}
/* ── HTML 이스케이프 (XSS 방지 — gantt.js/vision.js 공용, 로드 순서상 app.js에 정의) ── */
function _esc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/* ══════════════════════════════════════════
   공용 배열 병합 — Sheets 배열과 로컬 배열을 id 기준 병합
   규칙: ① tombstone → 제외
         ② 양쪽 존재 → mt(수정시각) 큰 쪽 승리
         ③ 한쪽만 존재 → tombstone 아니면 포함
   순서: Sheets 행 순서 우선, 로컬 전용은 뒤에 append (기존 동작 보존)
   opts: { normFn: 레코드 정규화 함수(Sheets 행에 적용),
           preferLocalOnTie: mt 동률/없음 시 로컬 우선(push 전 merge용; 기본은 Sheets 우선),
           protectField: 'cells'|'data' — 승자의 해당 필드가 비어있고 패자가 차 있으면 패자 것 유지(레거시 안전망) }
══════════════════════════════════════════ */
function _mergeArr(type,localArr,sheetArr,opts){
  opts=opts||{};
  localArr=localArr||[];sheetArr=sheetArr||[];
  var localMap={};
  localArr.forEach(function(r){if(r&&r.id)localMap[r.id]=r;});
  var out=[];var usedIds={};
  sheetArr.forEach(function(sr){
    if(!sr||!sr.id)return;
    if(_isDeleted(type,sr.id))return;            // ① tombstone 제외
    if(usedIds[sr.id])return;                     // Sheets 내 중복 방지
    if(opts.normFn)sr=opts.normFn(sr)||sr;
    var lr=localMap[sr.id];
    var winner=sr,loser=lr;
    if(lr){
      var smt=Number(sr.mt||0),lmt=Number(lr.mt||0);
      if(lmt>smt||(lmt===smt&&opts.preferLocalOnTie)){winner=lr;loser=sr;}
    }
    // protectField: 승자의 cells/data가 비어있으면 패자 것 보존 (mt 없는 레거시 레코드 안전망)
    if(opts.protectField&&loser){
      var f=opts.protectField;
      var wv=winner[f],lv2=loser[f];
      var wEmpty=!wv||(typeof wv==='object'&&!Object.keys(wv).length);
      var lFull=lv2&&typeof lv2==='object'&&Object.keys(lv2).length;
      if(wEmpty&&lFull)winner[f]=lv2;
    }
    // postMerge: 양쪽 존재 시 추가 필드 병합 콜백 (visionEquips changelog 등)
    if(opts.postMerge&&loser)opts.postMerge(winner,loser);
    out.push(winner);usedIds[sr.id]=true;
  });
  // 로컬 전용(Sheets 미반영 신규) 보존 — 단 tombstone 제외
  localArr.forEach(function(lr){
    if(!lr||!lr.id)return;
    if(usedIds[lr.id])return;
    if(_isDeleted(type,lr.id))return;
    out.push(lr);usedIds[lr.id]=true;
  });
  return out;
}
/* 모든 엔티티 배열에서 tombstone 레코드 일괄 제거 — deletedIds 흡수 직후 호출 */
function _purgeTombstoned(){
  ['schedules','events','workTasks','sites','groups','projects','equipItems','equipUnits','equipProjects','visionEquips'].forEach(function(type){
    if(!S[type]||!S[type].length||!_tombMap[type])return;
    S[type]=S[type].filter(function(r){return !r||!r.id||!_isDeleted(type,r.id);});
  });
}
/* visionEquips 전용 postMerge — changelog/fieldUpdated는 항목 수 많은 쪽 유지 (append-only 메타데이터 보호) */
function _viPostMerge(winner,loser){
  if(loser.fieldUpdated&&Object.keys(loser.fieldUpdated).length>Object.keys(winner.fieldUpdated||{}).length){
    winner.fieldUpdated=loser.fieldUpdated;
  }
  if(loser.changelog&&loser.changelog.length>(winner.changelog||[]).length){
    winner.changelog=loser.changelog;
  }
}
/* schedules 전용 정규화 (Sheets 행 → 로컬 형식) */
function _normSchedRec(sc){
  sc.start=normDate(sc.start);sc.end=normDate(sc.end);
  if(typeof sc.hidden==='string'){
    sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
  }
  if(typeof sc.domestic==='string'){
    sc.domestic=sc.domestic.toUpperCase()==='TRUE'||sc.domestic==='1'||sc.domestic==='true';
  }
  return sc;
}
/* workTasks 전용 정규화 */
function _normWtRec(wt){wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;}
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
  // Migration 13: vi_fg / vi_sync 에 pcSelect:true 누락 시 추가
  // 그룹 ID가 아닌 아이템 ID로 검색 — 커스텀 그룹에 배치된 경우도 패치
  (function(){
    var cats=S.visionTemplate.categories||[];
    cats.forEach(function(cat){
      var all=(cat.items||[]).concat(
        (cat.groups||[]).reduce(function(a,g){return a.concat(g.items||[]);}, [])
      );
      all.forEach(function(it){
        if((it.id==='vi_fg'||it.id==='vi_sync')&&it.type==='board-multi'&&!it.pcSelect)
          it.pcSelect=true;
      });
    });
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
  // showHidden 상태 복원 (PC별 일관성 유지)
  try{S.showHidden=localStorage.getItem('bu3_showHidden')==='1';}catch(e){}
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
          if(typeof sc.domestic==='string'){
            sc.domestic=sc.domestic.toUpperCase()==='TRUE'||sc.domestic==='1'||sc.domestic==='true';
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
var _cacheQuotaWarned=false;
function saveCache(data){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
  }catch(e){
    // localStorage 용량(5MB) 초과 등 — 1회만 경고 (Sheets 저장은 별도 경로로 계속 동작)
    if(!_cacheQuotaWarned){
      _cacheQuotaWarned=true;
      console.error('[saveCache] 로컬 캐시 저장 실패:',e.message);
      alert('⚠ 브라우저 로컬 저장공간이 부족합니다.\n데이터가 많아져 오프라인 캐시 저장에 실패했습니다.\nSheets 동기화는 계속 동작하지만, 관리자에게 데이터 정리를 문의하세요.');
    }
  }
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
        // 복원 데이터가 병합에서 항상 이기도록 처리:
        // ① 복원된 레코드의 tombstone 해제 (삭제됐던 레코드도 복원 의도대로 살림)
        // ② 전 레코드 mt 갱신 (Sheets의 기존 버전이 복원본을 덮어쓰지 못하게)
        ['schedules','events','workTasks','sites','groups','projects','equipItems','equipUnits','equipProjects','visionEquips'].forEach(function(type){
          (S[type]||[]).forEach(function(r){
            if(!r||!r.id)return;
            if(_isDeleted(type,r.id))_unmarkDeleted(type,r.id);
            _touch(r);
          });
        });
        if(S.visionTemplate)S.visionTemplate.mt=Date.now();
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

  // 4. merge 함수 — POST 직전 전 엔티티를 Sheets 데이터와 레코드 단위(mt) 병합
  //    Sheets에 더 새 레코드가 있으면 로컬 stale 레코드를 교체 → 다른 PC의 최신 수정 보존
  function _mergeFromSheets(sheetsData){
    if(!sheetsData||sheetsData.error) return;
    // ── tombstone 흡수: 다른 기기의 삭제 기록(deletedIds + 레거시 deletedScheduleIds) 반영
    _absorbTombs(sheetsData.deletedIds);
    if(sheetsData.deletedScheduleIds&&sheetsData.deletedScheduleIds.length){
      sheetsData.deletedScheduleIds.forEach(function(id){
        if(!_isDeletedSc(id))_markDeletedSc(id);
      });
    }
    _purgeTombstoned();
    // ── 레코드 단위 병합 (mt 동률/없음 시 로컬 우선 — push 경로이므로 현행 동작 보존)
    var T={preferLocalOnTie:true};
    if(sheetsData.schedules&&sheetsData.schedules.length)
      S.schedules=_mergeArr('schedules',S.schedules,sheetsData.schedules,{preferLocalOnTie:true,normFn:_normSchedRec});
    if(sheetsData.events&&sheetsData.events.length)
      S.events=_mergeArr('events',S.events,sheetsData.events,T);
    if(sheetsData.workTasks&&sheetsData.workTasks.length)
      S.workTasks=_mergeArr('workTasks',S.workTasks,sheetsData.workTasks,{preferLocalOnTie:true,normFn:_normWtRec});
    if(sheetsData.sites&&sheetsData.sites.length)
      S.sites=_mergeArr('sites',S.sites,sheetsData.sites,T);
    if(sheetsData.groups&&sheetsData.groups.length)
      S.groups=_mergeArr('groups',S.groups,sheetsData.groups,T);
    if(sheetsData.projects&&sheetsData.projects.length)
      S.projects=_mergeArr('projects',S.projects,sheetsData.projects,T);
    if(sheetsData.equipItems&&sheetsData.equipItems.length)
      S.equipItems=_mergeArr('equipItems',S.equipItems,sheetsData.equipItems,T);
    if(sheetsData.equipUnits&&sheetsData.equipUnits.length)
      S.equipUnits=_mergeArr('equipUnits',S.equipUnits,sheetsData.equipUnits,{preferLocalOnTie:true,protectField:'cells'});
    if(sheetsData.equipProjects&&sheetsData.equipProjects.length)
      S.equipProjects=_mergeArr('equipProjects',S.equipProjects,sheetsData.equipProjects,T);
    if(sheetsData.visionEquips&&sheetsData.visionEquips.length)
      S.visionEquips=_mergeArr('visionEquips',S.visionEquips,sheetsData.visionEquips,{preferLocalOnTie:true,protectField:'data',postMerge:_viPostMerge});
    // ── visionTemplate: 단일 JSON 블롭 — Sheets가 더 최신(mt)일 때만 교체
    if(sheetsData.visionTemplate&&sheetsData.visionTemplate.categories&&sheetsData.visionTemplate.categories.length){
      if(Number(sheetsData.visionTemplate.mt||0)>Number((S.visionTemplate||{}).mt||0)){
        S.visionTemplate=sheetsData.visionTemplate;
        _migrateVisionTemplate();
      }
    }
    saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
  }

  // 5. 저장 완료 처리 (성공/실패 공통)
  function _onDone(ok){
    _saveInFlight=false;
    if(ok){
      try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
      _tombClearFlushDone(); // 서버 tombstone 해제 완료 — 대기열 비움
      S._schCache=null; // 캐시 무효화 — 다음 saveData 시 Sheets에서 최신 데이터 재조회
      updateConnStatus('ok');
      var _ctxt=document.getElementById('connTxt');
      if(_ctxt){
        var _n=new Date();
        var _ts=_n.getHours()+':'+String(_n.getMinutes()).padStart(2,'0')+':'+String(_n.getSeconds()).padStart(2,'0');
        _ctxt.textContent='동기화 완료 '+_ts;
        setTimeout(function(){if(_ctxt.textContent.indexOf('완료')>=0)_ctxt.textContent='연결 정상';},4000);
      }
    } else {
      updateConnStatus('err');
    }
    // pending 요청이 있으면 즉시 재실행
    if(_savePending){_savePending=false;_flushToSheets();}
  }

  // 6. Sheets 조회 캐시(10초) → merge → POST
  var _now=Date.now();
  var _cacheOk=S._schCache&&S._schCache.ts&&(_now-S._schCache.ts)<10000;
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
          deletedIds:_tombList(),
          clearDeletedIds:_tombClearQueue,
          deletedScheduleIds:_deletedScIds()})
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
    +'<div style="border-top:1px solid var(--bd-main);padding-top:12px;margin-bottom:8px">'
    +'<div style="font-size:11px;font-weight:600;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">강제 동기화</div>'
    +'<div style="font-size:11px;color:var(--tx-faint);margin-bottom:8px">다른 PC에서 삭제된 일정이 계속 보이거나 데이터가 다르게 표시될 때 사용합니다.<br>Sheets 데이터로 완전히 교체됩니다.</div>'
    +'<button class="btn sm warn" onclick="cm();forceLoadFromSheets()">⟳ Sheets에서 강제 초기화</button>'
    +'</div>'
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
function forceLoadFromSheets(){
  if(!confirm('Sheets 데이터로 완전히 교체합니다.\n로컬에만 있는 미동기화 변경사항은 유실됩니다.\n계속하시겠습니까?')) return;
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){alert('Sheets 설정을 확인해주세요.');return;}
  var ind=showInd('Sheets에서 데이터를 불러오는 중...');
  fetch(url+'?action=load')
    .then(function(r){return r.json();})
    .then(function(data){
      hideInd(ind);
      if(data.error)throw new Error(data.error);
      try{localStorage.removeItem(CACHE_KEY);}catch(e){}
      try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
      if(data.groups&&data.groups.length)S.groups=data.groups;
      if(data.sites&&data.sites.length)S.sites=data.sites;
      if(data.projects&&data.projects.length)S.projects=data.projects;
      if(data.schedules&&data.schedules.length){
        S.schedules=data.schedules.map(function(sc){
          sc.start=normDate(sc.start);sc.end=normDate(sc.end);
          if(typeof sc.hidden==='string')sc.hidden=sc.hidden.toUpperCase()==='TRUE'||sc.hidden==='1'||sc.hidden==='true';
          if(typeof sc.domestic==='string')sc.domestic=sc.domestic.toUpperCase()==='TRUE'||sc.domestic==='1'||sc.domestic==='true';
          return sc;
        }).filter(function(sc){return !_isDeletedSc(sc.id);});
        var _seen={};
        S.schedules=S.schedules.filter(function(sc){if(_seen[sc.id])return false;_seen[sc.id]=true;return true;});
      }
      if(data.events&&data.events.length)S.events=data.events;
      if(data.workTasks&&data.workTasks.length)S.workTasks=data.workTasks.map(function(wt){wt.start=normDate(wt.start);wt.end=normDate(wt.end);return wt;});
      if(data.equipItems&&data.equipItems.length)S.equipItems=data.equipItems;
      if(data.equipUnits&&data.equipUnits.length)S.equipUnits=data.equipUnits.map(function(u){if(u.cells&&typeof u.cells!=='object')u.cells={};return u;});
      if(data.equipSiteOrder&&data.equipSiteOrder.length)S.equipSiteOrder=data.equipSiteOrder;
      if(data.equipProjects)S.equipProjects=data.equipProjects;
      if(data.visionTemplate&&data.visionTemplate.categories&&data.visionTemplate.categories.length){S.visionTemplate=data.visionTemplate;_migrateVisionTemplate();}
      if(data.visionEquips&&data.visionEquips.length)S.visionEquips=data.visionEquips.filter(function(ve){return !_isDeletedVi(ve.id);});
      saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
      renderAll();
      alert('강제 초기화 완료. 일정 '+S.schedules.length+'개 로드.');
    })
    .catch(function(err){hideInd(ind);alert('강제 초기화 실패: '+err.message);});
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
    // 로컬 데이터를 Sheets로 밀어넣고 dirty 해제 후 콜백 (tombstone 포함 — 삭제 기록 전파)
    fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'save',groups:S.groups,sites:S.sites,
        projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,
        equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,
        visionTemplate:S.visionTemplate,visionEquips:S.visionEquips,
        deletedIds:_tombList(),
        clearDeletedIds:_tombClearQueue,
        deletedScheduleIds:_deletedScIds()})
    }).then(function(r){return r.json();})
    .then(function(data){
      if(!data.error){
        try{localStorage.removeItem(CACHE_DIRTY_KEY);}catch(e){}
        _tombClearFlushDone();
        if(led){led.className='conn-led chk';txt.textContent='변경사항 확인 중...';}
        // push 완료 후 Sheets 최신 데이터를 pull하여 다른 PC의 변경사항 반영
        fetch(url+'?action=load')
          .then(function(r2){if(!r2.ok)throw new Error('HTTP '+r2.status);return r2.json();})
          .then(function(pulled){
            if(!pulled.error){
              _absorbTombs(pulled.deletedIds);
              if(pulled.deletedScheduleIds&&pulled.deletedScheduleIds.length){
                pulled.deletedScheduleIds.forEach(function(id){if(!_isDeletedSc(id))_markDeletedSc(id);});
              }
              _purgeTombstoned();
              if(pulled.schedules&&pulled.schedules.length)S.schedules=_mergeArr('schedules',S.schedules,pulled.schedules,{normFn:_normSchedRec});
              if(pulled.sites&&pulled.sites.length)S.sites=_mergeArr('sites',S.sites,pulled.sites);
              if(pulled.projects&&pulled.projects.length)S.projects=_mergeArr('projects',S.projects,pulled.projects);
              if(pulled.events&&pulled.events.length)S.events=_mergeArr('events',S.events,pulled.events);
              if(pulled.workTasks&&pulled.workTasks.length)S.workTasks=_mergeArr('workTasks',S.workTasks,pulled.workTasks,{normFn:_normWtRec});
              saveCache({groups:S.groups,sites:S.sites,projects:S.projects,schedules:S.schedules,events:S.events,workTasks:S.workTasks,equipItems:S.equipItems,equipUnits:S.equipUnits,equipSiteOrder:S.equipSiteOrder,equipProjects:S.equipProjects,visionTemplate:S.visionTemplate,visionEquips:S.visionEquips});
            }
            if(led){led.className='conn-led ok';txt.textContent='동기화 완료';}
            if(callback)callback();
          })
          .catch(function(){
            if(led){led.className='conn-led ok';txt.textContent='동기화 완료';}
            if(callback)callback();
          });
      } else {
        if(led){led.className='conn-led err';txt.textContent='동기화 실패';}
        if(callback)callback();
      }
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

      // ── tombstone 흡수: 다른 기기의 삭제 기록(deletedIds + 레거시 deletedScheduleIds) 반영 ──
      _absorbTombs(data.deletedIds);
      if(data.deletedScheduleIds&&data.deletedScheduleIds.length){
        data.deletedScheduleIds.forEach(function(id){
          if(!_isDeletedSc(id))_markDeletedSc(id);
        });
      }
      _purgeTombstoned();

      // ── pull 병합: 레코드 단위(mt) — 동률/없음 시 Sheets 우선(현행 pull 동작), 로컬 전용 보존 ──
      if(data.groups&&data.groups.length)S.groups=_mergeArr('groups',S.groups,data.groups);
      if(data.sites&&data.sites.length){
        var oldSites=S.sites||[];
        S.sites=_mergeArr('sites',S.sites,data.sites,{normFn:function(ns){
          // Sheets 행에 누락된 보조 필드를 로컬/기본값에서 보완
          var old=oldSites.find(function(os){return os.id===ns.id;});
          var def=DEF.sites.find(function(ds){return ds.id===ns.id;});
          if(!ns.groupId&&old&&old.groupId)ns.groupId=old.groupId;
          if(!ns.country){if(old&&old.country)ns.country=old.country;else if(def&&def.country)ns.country=def.country;}
          if(!ns.region){if(old&&old.region)ns.region=old.region;else if(def&&def.region)ns.region=def.region;}
          return ns;
        }});
      }
      if(data.projects&&data.projects.length)S.projects=_mergeArr('projects',S.projects,data.projects);

      // ── schedules ──
      if(data.schedules&&data.schedules.length){
        S.schedules=_mergeArr('schedules',S.schedules,data.schedules,{normFn:_normSchedRec});
      }
      if(data.events&&data.events.length)S.events=_mergeArr('events',S.events,data.events);
      if(data.workTasks&&data.workTasks.length)S.workTasks=_mergeArr('workTasks',S.workTasks,data.workTasks,{normFn:_normWtRec});

      // ── equipItems: Sheets가 빈 배열이면 로컬 유지 — 항목 정의는 절대 사라지면 안 됨 ──
      if(data.equipItems&&data.equipItems.length)S.equipItems=_mergeArr('equipItems',S.equipItems,data.equipItems);

      // ── equipUnits: cells 안전 병합 (string 오염 차단 + 레거시 cells 보존) ──
      if(data.equipUnits&&data.equipUnits.length){
        S.equipUnits=_mergeArr('equipUnits',S.equipUnits,data.equipUnits,{
          protectField:'cells',
          normFn:function(su){if(su.cells&&typeof su.cells!=='object')su.cells={};return su;}
        });
      } else if(S.equipUnits&&S.equipUnits.length){
        // Sheets가 0개인데 로컬에 호기가 있으면 로컬 유지
        console.warn('[보호] Sheets equipUnits 비어있음 — 로컬 데이터 유지');
      }

      // ── equipSiteOrder / equipProjects ──
      if(data.equipSiteOrder&&data.equipSiteOrder.length)S.equipSiteOrder=data.equipSiteOrder;
      if(data.equipProjects&&data.equipProjects.length)S.equipProjects=_mergeArr('equipProjects',S.equipProjects,data.equipProjects);

      // ── visionTemplate: Sheets가 더 최신(mt)일 때만 교체 → 마이그레이션도 함께 적용 ──
      if(data.visionTemplate&&data.visionTemplate.categories&&data.visionTemplate.categories.length){
        if(Number(data.visionTemplate.mt||0)>=Number((S.visionTemplate||{}).mt||0)){
          S.visionTemplate=data.visionTemplate;
          _migrateVisionTemplate();
        }
      }

      // ── visionEquips: data 안전 병합 + changelog 보호 ──
      if(data.visionEquips&&data.visionEquips.length){
        S.visionEquips=_mergeArr('visionEquips',S.visionEquips,data.visionEquips,{
          protectField:'data',postMerge:_viPostMerge,
          normFn:function(ve){if(ve.data&&typeof ve.data!=='object')ve.data={};return ve;}
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
  try{localStorage.setItem('bu3_showHidden',S.showHidden?'1':'0');}catch(e){}
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

/* 이력관리 전용 Sheets Pull (visionEquips/visionTemplate 중심 갱신)
   가드: ① 미저장 변경(dirty) 있으면 pull 대신 push-merge — 로컬 수정 보호
         ② 상세 폼 편집 중이면 skip — 입력 중 데이터 교체 방지 */
function refreshVisionFromSheets(silent){
  var url=getSheetsUrl();
  if(!url||location.protocol==='file:'){
    if(!silent) alert('Sheets 연결이 설정되지 않았습니다.\n⚙ Sheets 설정에서 URL을 확인해주세요.');
    return;
  }
  // 가드 ①: dirty면 pull 금지 → push 경로(_flushToSheets)가 read-before-write merge 수행
  var _vDirty=false;
  try{_vDirty=!!localStorage.getItem(CACHE_DIRTY_KEY);}catch(e){}
  if(_vDirty){
    console.warn('[Vision 갱신] 미저장 변경 감지 → pull 대신 push-merge 실행');
    _flushToSheets();
    return;
  }
  // 가드 ②: 상세 폼 편집 중(입력 발생 or 폼에 포커스)이면 skip — 다음 주기에 재시도
  if(typeof _visionView!=='undefined'&&_visionView==='detail'){
    var _formEl=document.getElementById('visionFormWrap');
    var _editing=(typeof _viFormDirty!=='undefined'&&_viFormDirty)||(_formEl&&_formEl.contains(document.activeElement));
    if(_editing){
      console.warn('[Vision 갱신] 상세 폼 편집 중 → 이번 주기 skip');
      return;
    }
  }
  fetch(url+'?action=load')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(data){
      if(data.error)throw new Error(data.error);
      // tombstone 흡수 + 로컬 정리
      _absorbTombs(data.deletedIds);
      if(data.deletedScheduleIds&&data.deletedScheduleIds.length){
        data.deletedScheduleIds.forEach(function(id){if(!_isDeletedSc(id))_markDeletedSc(id);});
      }
      _purgeTombstoned();
      var updated=false;
      var localOnly=[];
      if(data.visionEquips&&data.visionEquips.length){
        var sheetsIds={};
        data.visionEquips.forEach(function(e){sheetsIds[e.id]=true;});
        localOnly=(S.visionEquips||[]).filter(function(e){return !sheetsIds[e.id]&&!_isDeletedVi(e.id);});
        S.visionEquips=_mergeArr('visionEquips',S.visionEquips,data.visionEquips,{
          protectField:'data',postMerge:_viPostMerge,
          normFn:function(ve){if(ve.data&&typeof ve.data!=='object')ve.data={};return ve;}
        });
        updated=true;
      }
      if(data.visionTemplate&&data.visionTemplate.categories&&data.visionTemplate.categories.length){
        if((typeof _visionEditMode==='undefined'||!_visionEditMode)
          &&Number(data.visionTemplate.mt||0)>=Number((S.visionTemplate||{}).mt||0)){
          S.visionTemplate=data.visionTemplate;
          _migrateVisionTemplate();
          updated=true;
        }
      }
      if(updated){
        // Sheets에서 방금 받은 데이터로 schedules/events/workTasks도 동기화
        // (stale한 로컬 일정이 Sheets에 push되는 것 방지 — 핵심 데이터 보호)
        if(data.schedules&&data.schedules.length){
          S.schedules=_mergeArr('schedules',S.schedules,data.schedules,{normFn:_normSchedRec});
        }
        if(data.events&&data.events.length) S.events=_mergeArr('events',S.events,data.events);
        if(data.workTasks&&data.workTasks.length) S.workTasks=_mergeArr('workTasks',S.workTasks,data.workTasks,{normFn:_normWtRec});
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
