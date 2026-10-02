/* ══════════════════════════════════════════
   BU3 인원 현황 — 휴가/출장 상태 + 일정 겹침 확인
   - S.vacations: [{id,name,start,end,type,note,mt}] — type: '휴가'|'반차(오전)'|'반차(오후)'
   - 상태: 휴가중(S.vacations) / 출장중(S.schedules, 이름 매칭 — 타입/숨김 무관) / 본사(둘 다 아님)
══════════════════════════════════════════ */

var BU3_STAFF=[
  {name:'박용기',title:'부문장'},{name:'장석준',title:'부장'},{name:'김준식',title:'부장'},
  {name:'박우철',title:'부장'},{name:'김성민',title:'부장'},{name:'박정웅',title:'차장'},
  {name:'강민호',title:'과장'},{name:'홍성대',title:'과장'},{name:'김경태',title:'과장'},
  {name:'김지환',title:'과장'},{name:'김승민',title:'과장'},{name:'김문홍',title:'과장'},
  {name:'신호종',title:'과장'},{name:'박용대',title:'대리'},{name:'유현우',title:'대리'},
  {name:'김건중',title:'대리'},{name:'권석우',title:'사원'},{name:'최승민',title:'사원'}
];
var ST_VAC_TYPES=['휴가','반차(오전)','반차(오후)'];

function _stVacationOn(name,d){
  return (S.vacations||[]).find(function(v){return v.name===name && d>=pd(v.start) && d<=pd(v.end);});
}
/* 그 날짜에 해당 이름으로 걸린 모든 출장 일정 — 타입/숨김/완료여부 무관하게 전부 매칭 */
function _stTripsOn(name,d){
  return (S.schedules||[]).filter(function(sc){return sc.name===name && d>=pd(sc.start) && d<=pd(sc.end);});
}
function _stTripOn(name,d){var t=_stTripsOn(name,d);return t.length?t[0]:null;}
function _stTripSiteName(sc){
  var proj=S.projects.find(function(p){return p.id===sc.projectId;});
  var site=proj?S.sites.find(function(x){return x.id===proj.siteId;}):null;
  return site?site.name:'';
}
/* 국내/해외 판정 — person.js와 동일한 규칙: domestic 체크가 우선, 아니면 사이트 region */
function _stTripDomestic(sc){
  if(sc.domestic)return true;
  var proj=S.projects.find(function(p){return p.id===sc.projectId;});
  if(!proj)return false;
  return getSiteRegion(proj.siteId)==='korea';
}

/* 출장 등록 저장 직전 겹침검사 (modals.js saveSc에서 호출) */
function _staffConflicts(name,start,end,excludeId){
  if(!BU3_STAFF.some(function(s){return s.name===name;})) return null;
  var s=pd(start),e=pd(end);
  var vac=(S.vacations||[]).find(function(v){return v.name===name && s<=pd(v.end) && e>=pd(v.start);});
  if(vac) return {type:'vacation',name:name,start:vac.start,end:vac.end};
  var trip=(S.schedules||[]).find(function(sc){return sc.name===name && sc.id!==excludeId && !sc.hidden && s<=pd(sc.end) && e>=pd(sc.start);});
  if(trip){
    var label=_stTripSiteName(trip)+(trip.task?' '+trip.task:'');
    return {type:'trip',name:label.trim()||'다른 출장',start:trip.start,end:trip.end};
  }
  return null;
}

/* ── 모달 ── */
var _stSelDate=null; /* null=오늘 기준, 달력 날짜 클릭 시 해당 날짜 */
var _stCalY,_stCalM,_stVacFormOpen=false,_stVacListOpen=false,_stVacEditId=null;
function openStaffStatus(){
  _stSelDate=null;
  _stVacFormOpen=false;_stVacListOpen=false;_stVacEditId=null;
  var now=new Date();_stCalY=now.getFullYear();_stCalM=now.getMonth();
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xxwide"><div class="mtit">BU3 인원 현황</div>'
    +'<div class="st-wrap"><div class="st-left" id="stLeft"></div>'
    +'<div class="st-right"><div id="stVacPanel"></div><div id="stCalArea"></div></div></div>'
    +'<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="cm()">닫기</button></div>'
    +'</div></div>';
  renderStaffLeft();
  renderStaffVacPanel();
  renderStaffCalendar();
}

function renderStaffLeft(){
  var el=document.getElementById('stLeft');if(!el)return;
  var D=_stSelDate||TODAY;
  var dLbl=(D.getMonth()+1)+'/'+D.getDate()+(_stSelDate?' 기준':' (오늘)');
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">'
    +'<span class="fl" style="margin:0">구성원 ('+BU3_STAFF.length+'명) · '+dLbl+'</span>'
    +'<button class="btn sm pri" onclick="toggleStaffVacForm()">+ 휴가 등록</button></div>';
  h+='<div id="stVacForm" style="display:'+(_stVacFormOpen?'block':'none')+'">'+_stVacFormHtml()+'</div>';
  h+='<div class="st-person-list">';
  BU3_STAFF.forEach(function(p){
    var vac=_stVacationOn(p.name,D);
    var trip=_stTripOn(p.name,D);
    var badges='';
    if(vac)badges+='<span class="st-badge st-badge-vac">'+_esc(vac.type||'휴가')+'</span>';
    if(trip){
      var isDom=_stTripDomestic(trip);
      badges+='<span class="st-badge '+(isDom?'st-badge-trip':'st-badge-trip-intl')+'">출장중'+(_stTripSiteName(trip)?' · '+_esc(_stTripSiteName(trip)):'')+' · '+(isDom?'국내':'해외')+'</span>';
    }
    if(!vac&&!trip)badges+='<span class="st-badge st-badge-office">본사</span>';
    h+='<div class="st-person-row"><span class="st-person-name">'+_esc(p.name)+'</span><span class="st-person-title">'+_esc(p.title)+'</span><span class="st-person-badges">'+badges+'</span></div>';
  });
  h+='</div>';
  el.innerHTML=h;
}

function _stVacFormHtml(){
  var ex=_stVacEditId?(S.vacations||[]).find(function(v){return v.id===_stVacEditId;}):null;
  var dlOpts=BU3_STAFF.map(function(p){return '<option value="'+_esc(p.name)+'">';}).join('');
  var typeOpts=ST_VAC_TYPES.map(function(t){return '<option value="'+t+'"'+(ex&&ex.type===t?' selected':'')+'>'+t+'</option>';}).join('');
  return '<div class="mtit" style="font-size:12px;margin-bottom:8px">'+(ex?'휴가 수정':'휴가 등록')+'</div>'
    +'<datalist id="st_staff_dl">'+dlOpts+'</datalist>'
    +'<div class="fg"><label class="fl">이름 (목록에서 선택 또는 직접 입력)</label><input type="text" id="st_vac_name" list="st_staff_dl" value="'+_esc(ex?ex.name:'')+'" placeholder="이름 입력"></div>'
    +'<div class="fg"><label class="fl">휴가 구분</label><select id="st_vac_type">'+typeOpts+'</select></div>'
    +'<div class="fr"><div class="fg"><label class="fl">시작일</label><input type="text" id="st_vac_start" value="'+(ex?ex.start:'')+'" placeholder="2026-10-05" maxlength="10" oninput="fmtDateInput(this)"></div>'
    +'<div class="fg"><label class="fl">종료일</label><input type="text" id="st_vac_end" value="'+(ex?ex.end:'')+'" placeholder="2026-10-07" maxlength="10" oninput="fmtDateInput(this)"></div></div>'
    +'<div class="fg"><label class="fl">메모</label><input type="text" id="st_vac_note" value="'+(ex?_esc(ex.note||''):'')+'" placeholder="선택사항"></div>'
    +'<div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:10px"><button class="btn sm" onclick="toggleStaffVacForm()">취소</button><button class="btn sm pri" onclick="saveStaffVacation()">'+(ex?'수정 완료':'등록')+'</button></div>';
}
function toggleStaffVacForm(){
  _stVacFormOpen=!_stVacFormOpen;
  if(!_stVacFormOpen)_stVacEditId=null;
  renderStaffLeft();
}
function toggleStaffVacList(){_stVacListOpen=!_stVacListOpen;renderStaffVacPanel();}
function editStaffVacation(id){
  _stVacEditId=id;_stVacFormOpen=true;
  renderStaffLeft();
}
function saveStaffVacation(){
  var name=document.getElementById('st_vac_name').value.trim();
  var type=document.getElementById('st_vac_type').value;
  var start=document.getElementById('st_vac_start').value;
  var end=document.getElementById('st_vac_end').value;
  var note=document.getElementById('st_vac_note').value.trim();
  var dateRe=/^\d{4}-\d{2}-\d{2}$/;
  if(!name||!start||!end){alert('이름과 기간을 입력하세요.');return;}
  if(!dateRe.test(start)||!dateRe.test(end)){alert('날짜 형식이 올바르지 않아요.\n예: 2026-04-01');return;}
  if(start>end){alert('종료일이 시작일보다 빠릅니다.');return;}
  if(!BU3_STAFF.some(function(s){return s.name===name;})){
    alert('"'+name+'"은(는) 구성원 목록(BU3 인원 현황)에 없는 이름입니다.\n그래도 등록됩니다 — 이름을 다시 확인해주세요.');
  }
  if(_stVacEditId){
    var i=S.vacations.findIndex(function(v){return v.id===_stVacEditId;});
    if(i>=0) S.vacations[i]=_touch({id:_stVacEditId,name:name,type:type,start:start,end:end,note:note});
  } else {
    S.vacations.push(_touch({id:genId('vac',S.vacations),name:name,type:type,start:start,end:end,note:note}));
  }
  saveData();
  _stVacFormOpen=false;_stVacEditId=null;
  renderStaffLeft();renderStaffVacPanel();renderStaffCalendar();
}

/* ── 등록된 휴가 패널 (달력 쪽, 구성원 List와 무관) ── */
function renderStaffVacPanel(){
  var el=document.getElementById('stVacPanel');if(!el)return;
  var h='<div style="display:flex;justify-content:flex-end;margin-bottom:8px">'
    +'<button class="btn sm" onclick="toggleStaffVacList()">'+(_stVacListOpen?'목록 닫기':'📋 등록된 휴가')+'</button></div>';
  if(_stVacListOpen) h+='<div class="st-vac-panel">'+_stVacListHtml()+'</div>';
  el.innerHTML=h;
}
function _stVacListHtml(){
  var monthStart=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);
  var list=(S.vacations||[]).filter(function(v){return pd(v.end)>=monthStart;}).sort(function(a,b){return a.start<b.start?-1:1;});
  var h='<div class="fl" style="margin:4px 0">이번 달 + 예정 휴가 ('+list.length+'건) — 지난 휴가는 표시하지 않음</div>';
  if(!list.length) h+='<div class="pf-empty" style="padding:8px 0">없음</div>';
  list.forEach(function(v){h+=_stVacItemHtml(v);});
  return h;
}
function _stVacItemHtml(v){
  return '<div class="st-vac-item"><span>'+_esc(v.name)+' · '+_esc(v.type||'휴가')+' · '+v.start+'~'+v.end+(v.note?' · '+_esc(v.note):'')+'</span>'
    +'<span><span class="st-vac-edit" onclick="editStaffVacation(\''+v.id+'\')">수정</span>'
    +'<span class="st-vac-del" onclick="delStaffVacation(\''+v.id+'\')">삭제</span></span></div>';
}
function delStaffVacation(id){
  if(!confirm('이 휴가 일정을 삭제할까요?'))return;
  S.vacations=S.vacations.filter(function(v){return v.id!==id;});
  _markDeleted('vacations',id);
  saveData();
  if(_stVacEditId===id){_stVacEditId=null;_stVacFormOpen=false;}
  renderStaffLeft();renderStaffVacPanel();renderStaffCalendar();
}

/* ── 월 달력 ── */
function renderStaffCalendar(){
  var el=document.getElementById('stCalArea');if(!el)return;
  var y=_stCalY,m=_stCalM;
  var first=new Date(y,m,1);
  var startWeekday=first.getDay();
  var daysInMonth=new Date(y,m+1,0).getDate();
  var h='<div class="st-cal-head"><button class="btn sm" onclick="stCalNav(-1)">‹</button><span class="st-cal-title">'+y+'년 '+(m+1)+'월</span><button class="btn sm" onclick="stCalNav(1)">›</button></div>';
  h+='<div class="st-cal-grid">';
  ['일','월','화','수','목','금','토'].forEach(function(w){h+='<div class="st-cal-dow">'+w+'</div>';});
  for(var i=0;i<startWeekday;i++)h+='<div class="st-cal-cell st-cal-empty"></div>';
  for(var d=1;d<=daysInMonth;d++){
    var dateObj=new Date(y,m,d);dateObj.setHours(0,0,0,0);
    var isToday=dateObj.getTime()===TODAY.getTime();
    var isSel=_stSelDate&&dateObj.getTime()===_stSelDate.getTime();
    var vacChips='',tripChips='';
    BU3_STAFF.forEach(function(p){
      var vac=_stVacationOn(p.name,dateObj);
      if(vac)vacChips+='<span class="st-chip st-chip-vac" title="'+_esc(p.name)+' '+_esc(vac.type||'휴가')+'">'+_esc(p.name)+'</span>';
      var trips=_stTripsOn(p.name,dateObj);
      if(trips.length){
        var anyConflict=trips.some(function(t){return t.hasConflict;});
        var anyIntl=trips.some(function(t){return !_stTripDomestic(t);});
        var siteNames=trips.map(function(t){return _stTripSiteName(t);}).filter(function(x){return x;}).join(', ');
        var cls='st-chip '+(anyIntl?'st-chip-trip-intl':'st-chip-trip')+(anyConflict?' st-chip-warn':'');
        tripChips+='<span class="'+cls+'" title="'+_esc(p.name)+' 출장 · '+_esc(siteNames)+' · '+(anyIntl?'해외':'국내')+(anyConflict?' ⚠ 겹침 있음':'')+'">'+_esc(p.name)+(anyConflict?' ⚠':'')+'</span>';
      }
    });
    var chips=(vacChips?'<div class="st-cal-chiprow">'+vacChips+'</div>':'')+(tripChips?'<div class="st-cal-chiprow">'+tripChips+'</div>':'');
    h+='<div class="st-cal-cell'+(isToday?' st-cal-today':'')+(isSel?' st-cal-sel':'')+'" style="cursor:pointer" onclick="stSelectDate('+y+','+m+','+d+')"><div class="st-cal-daynum">'+d+'</div><div class="st-cal-chips">'+chips+'</div></div>';
  }
  h+='</div>';
  el.innerHTML=h;
}
function stCalNav(delta){
  _stCalM+=delta;
  if(_stCalM<0){_stCalM=11;_stCalY--;}
  if(_stCalM>11){_stCalM=0;_stCalY++;}
  renderStaffCalendar();
}
function stSelectDate(y,m,d){
  var t=new Date(y,m,d);t.setHours(0,0,0,0);
  _stSelDate=(t.getTime()===TODAY.getTime()||(_stSelDate&&_stSelDate.getTime()===t.getTime()))?null:t; // 오늘/선택된 날짜 재클릭 → 오늘 기준 복귀
  renderStaffLeft();renderStaffCalendar();
}
