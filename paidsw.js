/* ══════════════════════════════════════════
   유상 S/W 관리 탭
   - S.paidFeatures: [{id,title,desc,po:{received,date},
       siteStatus:{ [siteId]: { rep:{applied,date,version}, all:{applied} } }, mt}]
     rep = 대표호기 적용(체크+날짜+버전), all = 전호기 적용/횡전개(체크만)
     siteStatus에 키가 없는 사이트 = 대상 아님(N/A)
══════════════════════════════════════════ */

/* ── 그룹별 사이트 목록 (gantt.js renderSidebar와 동일한 그룹핑 로직) ── */
function _pfSiteGroups(){
  var out=[];
  var groups=S.groups&&S.groups.length?S.groups:[{id:'_none',name:'사이트'}];
  groups.forEach(function(grp){
    var sites=S.sites.filter(function(s){return (s.groupId||'_none')===grp.id;});
    if(!sites.length)return;
    out.push({group:grp,sites:sites});
  });
  return out;
}

/* ── 기능건 완료 상태: 'none'(등록만) | 'rep'(대상사이트 대표호기 전체 적용) | 'full'(대표+전호기 전체 적용) ──
   대상사이트가 하나도 없으면(siteStatus 비어있음) 판정 불가 → 'none' */
function _pfFeatureState(f){
  var ids=Object.keys(f.siteStatus||{});
  if(!ids.length)return 'none';
  var allRep=ids.every(function(sid){return f.siteStatus[sid].rep&&f.siteStatus[sid].rep.applied;});
  if(!allRep)return 'none';
  var allAll=ids.every(function(sid){return f.siteStatus[sid].all&&f.siteStatus[sid].all.applied;});
  return allAll?'full':'rep';
}

/* ── 상단 대시보드 통계 ── */
function _pfPct(n,d){return d?Math.round(n/d*100):0;}
function renderPaidSwStats(){
  var el=document.getElementById('paidswStats');
  if(!el)return;
  var list=S.paidFeatures||[];
  var total=list.length;
  var poCnt=list.filter(function(f){return f.po&&f.po.received;}).length;
  var repCnt=list.filter(function(f){return _pfFeatureState(f)==='rep'||_pfFeatureState(f)==='full';}).length;
  var fullCnt=list.filter(function(f){return _pfFeatureState(f)==='full';}).length;
  el.innerHTML=
    '<div class="pm-stat-card"><div class="pm-stat-val">'+total+'</div><div class="pm-stat-lbl">총 등록 건수</div></div>'
    +'<div class="pm-stat-card pf-accent-po"><div class="pm-stat-val">'+poCnt+'</div><div class="pm-stat-lbl">PO 접수</div><div class="pm-stat-sub">전체의 '+_pfPct(poCnt,total)+'%</div></div>'
    +'<div class="pm-stat-card pf-accent-rep"><div class="pm-stat-val">'+repCnt+'</div><div class="pm-stat-lbl">대표호기 적용완료</div><div class="pm-stat-sub">전체의 '+_pfPct(repCnt,total)+'%</div></div>'
    +'<div class="pm-stat-card pf-accent-full"><div class="pm-stat-val">'+fullCnt+'</div><div class="pm-stat-lbl">최종완료 (전호기까지)</div><div class="pm-stat-sub">전체의 '+_pfPct(fullCnt,total)+'%</div></div>';
}

/* ── 메인 매트릭스 렌더 ── */
function renderPaidSwTab(){
  renderPaidSwStats();
  var el=document.getElementById('paidswGrid');
  if(!el)return;
  var sg=_pfSiteGroups();
  var totalSites=sg.reduce(function(n,g){return n+g.sites.length;},0);

  var h='<table class="pf-table"><thead>';
  h+='<tr><th rowspan="3">No</th><th rowspan="3">기능제목</th><th rowspan="3">PO</th>';
  if(totalSites){
    sg.forEach(function(g){h+='<th class="pf-th-grp" colspan="'+(g.sites.length*2)+'">'+_esc(g.group.name)+'</th>';});
  } else {
    h+='<th>대상사이트 없음</th>';
  }
  h+='</tr><tr>';
  sg.forEach(function(g){g.sites.forEach(function(s){
    h+='<th class="pf-th-site" colspan="2"><span class="sdot" style="background:'+s.color+';display:inline-block"></span>'+_esc(s.name)+'</th>';
  });});
  h+='</tr><tr>';
  sg.forEach(function(g){g.sites.forEach(function(){
    h+='<th class="pf-th-sub">대표호기</th><th class="pf-th-sub">전호기</th>';
  });});
  h+='</tr></thead><tbody>';

  (S.paidFeatures||[]).forEach(function(f,idx){
    h+='<tr>';
    var state=_pfFeatureState(f);
    var stateCls=state==='full'?' pf-title-full':(state==='rep'?' pf-title-rep':'');
    h+='<td>'+(idx+1)+'</td>';
    h+='<td class="pf-title'+stateCls+'" title="'+_esc(f.desc||'')+'" onclick="openPaidSwModal(\''+f.id+'\')">'+_esc(f.title)+'</td>';
    h+='<td class="pf-po">'+_pfPoCellHtml(f)+'</td>';
    sg.forEach(function(g){g.sites.forEach(function(s){
      h+=_pfSiteCellRepHtml(f,s);
      h+=_pfSiteCellAllHtml(f,s);
    });});
    h+='</tr>';
  });
  if(!S.paidFeatures||!S.paidFeatures.length){
    h+='<tr><td class="pf-empty" colspan="'+(3+totalSites*2)+'">등록된 유상 기능이 없습니다. "+ 기능 추가" 버튼으로 추가하세요.</td></tr>';
  }
  h+='</tbody></table>';
  el.innerHTML=h;
}

function _pfPoCellHtml(f){
  var po=f.po||{received:false,date:''};
  var html='<label class="chkrow" style="justify-content:center;display:inline-flex"><input type="checkbox" '+(po.received?'checked':'')+' onchange="_pfTogglePo(\''+f.id+'\',this.checked)"></label>';
  if(po.received){
    html+='<input type="text" class="pf-podate" value="'+_esc(po.date||'')+'" placeholder="YYYY-MM-DD" oninput="fmtDateInput(this);_pfSetPoDate(\''+f.id+'\',this.value)">';
  }
  return html;
}
function _pfTogglePo(id,checked){
  var f=S.paidFeatures.find(function(x){return x.id===id;});if(!f)return;
  f.po=f.po||{received:false,date:''};f.po.received=checked;if(!checked)f.po.date='';
  _touch(f);saveData();renderPaidSwTab();
}
function _pfSetPoDate(id,val){
  var f=S.paidFeatures.find(function(x){return x.id===id;});if(!f)return;
  f.po=f.po||{received:false,date:''};f.po.date=val;
  _touch(f);saveData();
}

function _pfSiteCellRepHtml(f,s){
  var st=(f.siteStatus||{})[s.id];
  if(!st) return '<td class="pf-cell pf-na">N/A</td>';
  var rep=st.rep||{applied:false,date:'',version:''};
  if(rep.applied){
    return '<td class="pf-cell pf-applied" onclick="openPfCellPopover(event,\''+f.id+'\',\''+s.id+'\')">☑ '+_esc(rep.date||'')+(rep.version?' / '+_esc(rep.version):'')+'</td>';
  }
  return '<td class="pf-cell" onclick="openPfCellPopover(event,\''+f.id+'\',\''+s.id+'\')">☐</td>';
}
function _pfSiteCellAllHtml(f,s){
  var st=(f.siteStatus||{})[s.id];
  if(!st) return '<td class="pf-cell pf-na">N/A</td>';
  var all=st.all||{applied:false};
  return '<td class="pf-cell pf-all" onclick="_pfToggleAll(\''+f.id+'\',\''+s.id+'\')">'+(all.applied?'☑':'☐')+'</td>';
}
function _pfToggleAll(fid,sid){
  var f=S.paidFeatures.find(function(x){return x.id===fid;});if(!f)return;
  var st=(f.siteStatus||{})[sid];if(!st)return;
  st.all=st.all||{applied:false};
  st.all.applied=!st.all.applied;
  _touch(f);saveData();renderPaidSwTab();
}

/* ── 대표호기 셀 팝오버 (체크+날짜+버전) ── */
function openPfCellPopover(ev,fid,sid){
  ev.stopPropagation();
  closePfPopover();
  var f=S.paidFeatures.find(function(x){return x.id===fid;});if(!f)return;
  var st=(f.siteStatus||{})[sid]||{};
  var rep=st.rep||{applied:false,date:'',version:''};
  var site=S.sites.find(function(x){return x.id===sid;});
  var d=document.createElement('div');
  d.className='pf-popover';d.id='pfPopover';
  d.innerHTML='<div class="pf-pop-tit">'+_esc(site?site.name:sid)+' · 대표호기</div>'
    +'<label class="chkrow"><input type="checkbox" id="pfp_applied" '+(rep.applied?'checked':'')+'>적용</label>'
    +'<div class="fg"><label class="fl">적용일자</label><input type="text" id="pfp_date" value="'+_esc(rep.date||'')+'" placeholder="YYYY-MM-DD" oninput="fmtDateInput(this)"></div>'
    +'<div class="fg"><label class="fl">버전</label><input type="text" id="pfp_version" value="'+_esc(rep.version||'')+'" placeholder="예: v2.1"></div>'
    +'<div style="display:flex;gap:6px;justify-content:flex-end">'
    +'<button class="btn" onclick="closePfPopover()">취소</button>'
    +'<button class="btn pri" onclick="_pfSaveCell(\''+fid+'\',\''+sid+'\')">저장</button>'
    +'</div>';
  document.body.appendChild(d);
  var r=ev.currentTarget.getBoundingClientRect();
  d.style.top=(r.bottom+6)+'px';d.style.left=r.left+'px';
  requestAnimationFrame(function(){
    var pr=d.getBoundingClientRect();
    if(pr.right>window.innerWidth-8) d.style.left=Math.max(8,window.innerWidth-8-pr.width)+'px';
    if(pr.bottom>window.innerHeight-8) d.style.top=Math.max(8,r.top-pr.height-6)+'px';
  });
  setTimeout(function(){document.addEventListener('mousedown',_pfOutsideClick);},0);
}
function _pfOutsideClick(e){
  var pop=document.getElementById('pfPopover');
  if(pop&&!pop.contains(e.target))closePfPopover();
}
function closePfPopover(){
  var pop=document.getElementById('pfPopover');
  if(pop&&pop.parentNode)pop.parentNode.removeChild(pop);
  document.removeEventListener('mousedown',_pfOutsideClick);
}
function _pfSaveCell(fid,sid){
  var f=S.paidFeatures.find(function(x){return x.id===fid;});if(!f)return;
  var applied=document.getElementById('pfp_applied').checked;
  var date=document.getElementById('pfp_date').value;
  var version=document.getElementById('pfp_version').value;
  f.siteStatus=f.siteStatus||{};
  var st=f.siteStatus[sid]=f.siteStatus[sid]||{rep:{applied:false,date:'',version:''},all:{applied:false}};
  st.rep={applied:applied,date:applied?date:'',version:applied?version:''};
  _touch(f);saveData();closePfPopover();renderPaidSwTab();
}

/* ── 추가/수정 모달 (3블럭) ── */
var _pfSel={}; // 모달 작업중 로컬 선택 상태 siteId->true

function openPaidSwModal(existingId){
  var ex=existingId?S.paidFeatures.find(function(x){return x.id===existingId;}):null;
  _pfSel={};
  if(ex&&ex.siteStatus)Object.keys(ex.siteStatus).forEach(function(k){_pfSel[k]=true;});
  document.getElementById('mc').innerHTML='<div class="mover"><div class="modal xwide">'+_pfModalHtml(ex)+'</div></div>';
}
function closePfModal(){cm();}

function _pfModalHtml(ex){
  var title=ex?ex.title:'';
  var desc=ex?ex.desc:'';
  var po=(ex&&ex.po)||{received:false,date:''};
  var h='<div class="mtit">'+(ex?'유상 기능 수정':'유상 기능 추가')+'</div>';
  h+='<div class="pf-3col">';
  h+='<div class="pf-col pf-colA">';
  h+='<div class="fg"><label class="fl">기능 제목</label><input type="text" id="pf_title" value="'+_esc(title)+'" placeholder="예: 라이선스 관리 시스템"></div>';
  h+='<div class="fg"><label class="fl">설명 (기능제목에 마우스를 올리면 표시됨)</label><textarea id="pf_desc" rows="7" placeholder="상세 내용 입력">'+_esc(desc)+'</textarea></div>';
  h+='<div class="fg"><label class="chkrow"><input type="checkbox" id="pf_po" '+(po.received?'checked':'')+' onchange="document.getElementById(\'pf_po_date_wrap\').style.display=this.checked?\'block\':\'none\'">PO 접수</label></div>';
  h+='<div class="fg" id="pf_po_date_wrap" style="display:'+(po.received?'block':'none')+'"><label class="fl">PO 접수일자</label><input type="text" id="pf_po_date" value="'+_esc(po.date||'')+'" placeholder="YYYY-MM-DD" oninput="fmtDateInput(this)"></div>';
  h+='</div>';
  h+='<div class="pf-col pf-colB"><label class="fl">대상사이트 선택</label><div id="pf_picker">'+_pfPickerHtml()+'</div></div>';
  h+='<div class="pf-col pf-colC"><label class="fl">선택된 사이트</label><div id="pf_selected">'+_pfSelectedHtml()+'</div>';
  h+='<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px">';
  if(ex)h+='<button class="btn warn" onclick="delPaidFeature(\''+ex.id+'\')">삭제</button>';
  h+='<button class="btn" onclick="closePfModal()">취소</button>';
  h+='<button class="btn pri" onclick="savePaidFeature(\''+(ex?ex.id:'')+'\')">저장</button>';
  h+='</div></div>';
  h+='</div>';
  return h;
}
function _pfPickerHtml(){
  var sg=_pfSiteGroups();
  var h='';
  sg.forEach(function(g){
    var allOn=g.sites.length>0&&g.sites.every(function(s){return _pfSel[s.id];});
    h+='<div class="pf-grp"><label class="chkrow pf-grplbl"><input type="checkbox" '+(allOn?'checked':'')+' onchange="_pfToggleGroup(\''+g.group.id+'\',this.checked)"><b>'+_esc(g.group.name)+'</b></label>';
    g.sites.forEach(function(s){
      h+='<label class="chkrow pf-sitelbl"><input type="checkbox" '+(_pfSel[s.id]?'checked':'')+' onchange="_pfToggleSite(\''+s.id+'\')"><span class="sdot" style="background:'+s.color+'"></span>'+_esc(s.name)+'</label>';
    });
    h+='</div>';
  });
  return h||'<div class="pf-empty">등록된 사이트가 없습니다.</div>';
}
function _pfSelectedHtml(){
  var sg=_pfSiteGroups();
  var chips='';
  sg.forEach(function(g){g.sites.forEach(function(s){
    if(_pfSel[s.id])chips+='<span class="pf-chip"><span class="sdot" style="background:'+s.color+'"></span>'+_esc(s.name)+'<span class="pf-chip-x" onclick="_pfToggleSite(\''+s.id+'\')">×</span></span>';
  });});
  return chips||'<div class="pf-empty">선택된 사이트가 없습니다.</div>';
}
function _pfToggleGroup(gid,checked){
  S.sites.filter(function(s){return (s.groupId||'_none')===gid;}).forEach(function(s){
    if(checked)_pfSel[s.id]=true;else delete _pfSel[s.id];
  });
  _pfRefreshPicker();
}
function _pfToggleSite(sid){
  if(_pfSel[sid])delete _pfSel[sid];else _pfSel[sid]=true;
  _pfRefreshPicker();
}
function _pfRefreshPicker(){
  var p=document.getElementById('pf_picker');if(p)p.innerHTML=_pfPickerHtml();
  var s=document.getElementById('pf_selected');if(s)s.innerHTML=_pfSelectedHtml();
}

function savePaidFeature(id){
  var title=document.getElementById('pf_title').value.trim();
  if(!title){alert('기능 제목을 입력하세요.');return;}
  var desc=document.getElementById('pf_desc').value;
  var poReceived=document.getElementById('pf_po').checked;
  var poDate=poReceived?document.getElementById('pf_po_date').value:'';
  var ex=id?S.paidFeatures.find(function(x){return x.id===id;}):null;
  var oldStatus=(ex&&ex.siteStatus)||{};
  var siteStatus={};
  Object.keys(_pfSel).forEach(function(sid){
    siteStatus[sid]=oldStatus[sid]||{rep:{applied:false,date:'',version:''},all:{applied:false}};
  });
  if(ex){
    ex.title=title;ex.desc=desc;ex.po={received:poReceived,date:poDate};ex.siteStatus=siteStatus;
    _touch(ex);
  } else {
    S.paidFeatures.push(_touch({id:genId('pf',S.paidFeatures),title:title,desc:desc,po:{received:poReceived,date:poDate},siteStatus:siteStatus}));
  }
  saveData();closePfModal();renderPaidSwTab();
}
function delPaidFeature(id){
  if(!confirm('이 유상 기능을 삭제할까요?'))return;
  S.paidFeatures=S.paidFeatures.filter(function(x){return x.id!==id;});
  _markDeleted('paidFeatures',id);
  saveData();closePfModal();renderPaidSwTab();
}
