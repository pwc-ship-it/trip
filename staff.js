/* ══════════════════════════════════════════
   BU3 인원 현황 — 휴가/출장 상태 + 일정 겹침 확인
   - S.vacations: [{id,name,start,end,note,mt}]
   - 상태: 휴가중(S.vacations) / 출장중(S.schedules, type==='hq') / 본사(둘 다 아님)
══════════════════════════════════════════ */

var BU3_STAFF=[
  {name:'박용기',title:'부문장'},{name:'장석준',title:'부장'},{name:'김준식',title:'부장'},
  {name:'박우철',title:'부장'},{name:'김성민',title:'부장'},{name:'박정웅',title:'차장'},
  {name:'강민호',title:'과장'},{name:'홍성대',title:'과장'},{name:'김경태',title:'과장'},
  {name:'김지환',title:'과장'},{name:'김승민',title:'과장'},{name:'김문홍',title:'과장'},
  {name:'신호종',title:'과장'},{name:'박용대',title:'대리'},{name:'유현우',title:'대리'},
  {name:'김건중',title:'대리'},{name:'권석우',title:'사원'},{name:'최승민',title:'사원'}
];

function _stVacationOn(name,d){
  return (S.vacations||[]).find(function(v){return v.name===name && d>=pd(v.start) && d<=pd(v.end);});
}
function _stTripOn(name,d){
  return (S.schedules||[]).find(function(sc){return sc.name===name && sc.type==='hq' && !sc.hidden && d>=pd(sc.start) && d<=pd(sc.end);});
}
function _stTripSiteName(sc){
  var proj=S.projects.find(function(p){return p.id===sc.projectId;});
  var site=proj?S.sites.find(function(x){return x.id===proj.siteId;}):null;
  return site?site.name:'';
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
var _stCalY,_stCalM,_stVacFormOpen=false;
function openStaffStatus(){
  _stVacFormOpen=false;
  var now=new Date();_stCalY=now.getFullYear();_stCalM=now.getMonth();
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xwide"><div class="mtit">BU3 인원 현황</div>'
    +'<div class="st-wrap"><div class="st-left" id="stLeft"></div><div class="st-right" id="stRight"></div></div>'
    +'<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="cm()">닫기</button></div>'
    +'</div></div>';
  renderStaffLeft();
  renderStaffCalendar();
}

function renderStaffLeft(){
  var el=document.getElementById('stLeft');if(!el)return;
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    +'<span class="fl" style="margin:0">구성원 ('+BU3_STAFF.length+'명)</span>'
    +'<button class="btn sm" onclick="toggleStaffVacForm()">+ 휴가 등록</button></div>';
  h+='<div id="stVacForm" style="display:'+(_stVacFormOpen?'block':'none')+'">'+_stVacFormHtml()+'</div>';
  h+='<div class="st-person-list">';
  BU3_STAFF.forEach(function(p){
    var vac=_stVacationOn(p.name,TODAY);
    var trip=_stTripOn(p.name,TODAY);
    var badges='';
    if(vac)badges+='<span class="st-badge st-badge-vac">휴가중</span>';
    if(trip)badges+='<span class="st-badge st-badge-trip">출장중'+(_stTripSiteName(trip)?' · '+_esc(_stTripSiteName(trip)):'')+'</span>';
    if(!vac&&!trip)badges+='<span class="st-badge st-badge-office">본사</span>';
    h+='<div class="st-person-row"><span class="st-person-name">'+_esc(p.name)+'</span><span class="st-person-title">'+_esc(p.title)+'</span><span class="st-person-badges">'+badges+'</span></div>';
  });
  h+='</div>';
  h+='<div class="st-vac-list">'+_stVacListHtml()+'</div>';
  el.innerHTML=h;
}

function _stVacFormHtml(){
  var opts=BU3_STAFF.map(function(p){return '<option value="'+_esc(p.name)+'">'+_esc(p.name)+'</option>';}).join('');
  return '<div class="fg"><label class="fl">이름</label><select id="st_vac_name">'+opts+'</select></div>'
    +'<div class="fr"><div class="fg"><label class="fl">시작일</label><input type="text" id="st_vac_start" placeholder="2026-10-05" maxlength="10" oninput="fmtDateInput(this)"></div>'
    +'<div class="fg"><label class="fl">종료일</label><input type="text" id="st_vac_end" placeholder="2026-10-07" maxlength="10" oninput="fmtDateInput(this)"></div></div>'
    +'<div class="fg"><label class="fl">메모</label><input type="text" id="st_vac_note" placeholder="선택사항"></div>'
    +'<div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:10px"><button class="btn sm" onclick="toggleStaffVacForm()">취소</button><button class="btn sm pri" onclick="saveStaffVacation()">등록</button></div>';
}
function toggleStaffVacForm(){_stVacFormOpen=!_stVacFormOpen;renderStaffLeft();}
function saveStaffVacation(){
  var name=document.getElementById('st_vac_name').value;
  var start=document.getElementById('st_vac_start').value;
  var end=document.getElementById('st_vac_end').value;
  var note=document.getElementById('st_vac_note').value.trim();
  var dateRe=/^\d{4}-\d{2}-\d{2}$/;
  if(!name||!start||!end){alert('이름과 기간을 입력하세요.');return;}
  if(!dateRe.test(start)||!dateRe.test(end)){alert('날짜 형식이 올바르지 않아요.\n예: 2026-04-01');return;}
  if(start>end){alert('종료일이 시작일보다 빠릅니다.');return;}
  S.vacations.push(_touch({id:genId('vac',S.vacations),name:name,start:start,end:end,note:note}));
  saveData();
  _stVacFormOpen=false;
  renderStaffLeft();renderStaffCalendar();
}
function _stVacListHtml(){
  var upcoming=(S.vacations||[]).filter(function(v){return pd(v.end)>=TODAY;}).sort(function(a,b){return a.start<b.start?-1:1;});
  if(!upcoming.length)return '<div class="pf-empty" style="padding:12px 0">등록된 휴가 일정이 없습니다.</div>';
  var h='<div class="fl" style="margin:10px 0 4px">등록된 휴가 (진행중/예정)</div>';
  upcoming.forEach(function(v){
    h+='<div class="st-vac-item"><span>'+_esc(v.name)+' · '+v.start+'~'+v.end+(v.note?' · '+_esc(v.note):'')+'</span><span class="st-vac-del" onclick="delStaffVacation(\''+v.id+'\')">삭제</span></div>';
  });
  return h;
}
function delStaffVacation(id){
  if(!confirm('이 휴가 일정을 삭제할까요?'))return;
  S.vacations=S.vacations.filter(function(v){return v.id!==id;});
  _markDeleted('vacations',id);
  saveData();
  renderStaffLeft();renderStaffCalendar();
}

/* ── 월 달력 ── */
function renderStaffCalendar(){
  var el=document.getElementById('stRight');if(!el)return;
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
    var chips='';
    BU3_STAFF.forEach(function(p){
      if(_stVacationOn(p.name,dateObj))chips+='<span class="st-chip st-chip-vac" title="'+_esc(p.name)+' 휴가">'+_esc(p.name)+'</span>';
      var t=_stTripOn(p.name,dateObj);
      if(t)chips+='<span class="st-chip st-chip-trip" title="'+_esc(p.name)+' 출장 · '+_esc(_stTripSiteName(t))+'">'+_esc(p.name)+'</span>';
    });
    h+='<div class="st-cal-cell'+(isToday?' st-cal-today':'')+'"><div class="st-cal-daynum">'+d+'</div><div class="st-cal-chips">'+chips+'</div></div>';
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
