/* ════════════════════════════════════════════
   설비 진행율 탭
════════════════════════════════════════════ */
var _equipEditMode=false;
var _equipFilterSite='all';
var _equipCollapsed={};
var PROJ_TYPE_COLOR={'납품셋업':'#1a55bb','개조':'#aa6000','이설':'#1a7a3a','개발':'#7a1a99'};
var PROJ_TYPES=['납품셋업','개조','이설','개발'];
var _dragEquipSiteId=null;
var _EQUIP_SITE_GROUPS=[
  {label:'LG (미국)',   ids:['ESHD','ESMI','ESHG','MILS','UC2','BOSK_TN']},
  {label:'LG (캐나다)', ids:['ESOT']},
  {label:'현대JV',      ids:['현대JV']},
  {label:'중국',        ids:['ESNA','ESNB','DSBJ','SDD']},
  {label:'베트남',      ids:['SDV']},
  {label:'유럽',        ids:['WA']},
];

/* ── 설비 탭 사이트 순서 헬퍼 ── */
function ensureEquipSiteOrder(){
  if(!S.equipSiteOrder) S.equipSiteOrder=[];
  var inUnits={};
  S.equipUnits.forEach(function(u){inUnits[u.siteId]=true;});
  S.sites.forEach(function(s){
    if(inUnits[s.id]&&S.equipSiteOrder.indexOf(s.id)<0)
      S.equipSiteOrder.push(s.id);
  });
  S.equipSiteOrder=S.equipSiteOrder.filter(function(id){
    return S.sites.some(function(s){return s.id===id;});
  });
}
function onEquipSiteDragStart(siteId){_dragEquipSiteId=siteId;}
function onEquipSiteDrop(targetSiteId){
  if(!_dragEquipSiteId||_dragEquipSiteId===targetSiteId){_dragEquipSiteId=null;return;}
  ensureEquipSiteOrder();
  var arr=S.equipSiteOrder;
  var fi=arr.indexOf(_dragEquipSiteId),ti=arr.indexOf(targetSiteId);
  if(fi<0||ti<0){_dragEquipSiteId=null;return;}
  arr.splice(fi,1);arr.splice(ti,0,_dragEquipSiteId);
  _dragEquipSiteId=null;
  saveData();renderEquipTab();
}

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
function calcProjectProgress(projectId){
  var units=S.equipUnits.filter(function(u){return u.equipProjectId===projectId;});
  if(!units.length) return null;
  var sum=0;
  units.forEach(function(u){sum+=calcUnitProgress(u);});
  return Math.round(sum/units.length);
}

/* ── 사이드바 렌더 ── */
function renderEquipSidebar(){
  var el=document.getElementById('equipSidebar');
  if(!el) return;
  ensureEquipSiteOrder();
  // equipSiteOrder 기반 + units에 있는 사이트 fallback
  var sidebarSiteIds=[];
  S.equipSiteOrder.forEach(function(id){
    if(S.sites.some(function(s){return s.id===id;})) sidebarSiteIds.push(id);
  });
  S.equipUnits.forEach(function(u){
    if(sidebarSiteIds.indexOf(u.siteId)<0) sidebarSiteIds.push(u.siteId);
  });
  var html='<div class="sbhead"><span class="slbl">사이트 필터</span>';
  if(_equipEditMode) html+='<div style="font-size:10px;color:#6a6a88;margin-top:2px">드래그로 순서 변경</div>';
  html+='</div><div class="sbody">';
  html+='<div class="sit-all'+(_equipFilterSite==='all'?' on':'')
    +'" onclick="setEquipFilter(\'all\')"><span class="sname">전체 보기</span></div>';
  sidebarSiteIds.forEach(function(siteId){
    var site=S.sites.find(function(s){return s.id===siteId;});
    if(!site) return;
    var cnt=S.equipUnits.filter(function(u){return u.siteId===siteId;}).length;
    var drag=_equipEditMode
      ?' draggable="true"'
       +' ondragstart="onEquipSiteDragStart(\''+siteId+'\')"'
       +' ondragover="event.preventDefault()"'
       +' ondrop="onEquipSiteDrop(\''+siteId+'\')"'
       +' style="cursor:grab"'
      :'';
    html+='<div class="sit'+(_equipFilterSite===siteId?' on':'')+'"'
      +drag+' onclick="setEquipFilter(\''+siteId+'\')">'
      +'<div class="sdot" style="background:'+site.color+'"></div>'
      +'<span class="sname">'+site.name+'</span><span class="scnt">'+cnt+'</span></div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

function setEquipFilter(siteId){
  _equipFilterSite=siteId;
  renderEquipTab();
}
function toggleEquipCollapse(siteId){
  _equipCollapsed[siteId]=!_equipCollapsed[siteId];
  renderEquipTab();
}
function collapseAllEquip(){
  ensureEquipSiteOrder();
  S.equipSiteOrder.forEach(function(id){_equipCollapsed[id]=true;});
  S.equipUnits.forEach(function(u){_equipCollapsed[u.siteId]=true;});
  renderEquipTab();
}
function expandAllEquip(){
  _equipCollapsed={};
  renderEquipTab();
}

/* ── sticky 좌측 오프셋 보정 (라인/호기/양산시작/메모 4열) ── */
function fixEquipStickyOffsets(){
  var lineEl=document.querySelector('#eqGrid .eq-col-line');
  var unitEl=document.querySelector('#eqGrid .eq-col-unit');
  var msEl=document.querySelector('#eqGrid .eq-col-msdate');
  if(!lineEl) return;
  var lw=lineEl.offsetWidth;
  var uw=unitEl?unitEl.offsetWidth:80;
  var mw2=msEl?msEl.offsetWidth:80;
  document.querySelectorAll('#eqGrid .eq-col-unit').forEach(function(el){el.style.left=lw+'px';});
  document.querySelectorAll('#eqGrid .eq-col-msdate').forEach(function(el){el.style.left=(lw+uw)+'px';});
  document.querySelectorAll('#eqGrid .eq-col-memo').forEach(function(el){el.style.left=(lw+uw+mw2)+'px';});
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

/* ── sticky 셀 렌더러 (고정 열용) ── */
function renderEquipCellSticky(cell,editMode,unitId,itemId,extraCls,extraStyle){
  var cls='eq-td-fix'+(extraCls?' '+extraCls:'')+(editMode?' editable':'');
  var style=extraStyle?(' style="'+extraStyle+'"'):'';
  var onclick=editMode?' onclick="openEquipCellEdit(\''+unitId+'\',\''+itemId+'\')">':'>';
  if(!cell||cell.type==='na'){
    return '<td class="'+cls+'"'+style+onclick+'<span class="eq-na">N/A</span></td>';
  }
  if(cell.type==='done'){
    var doneDate=cell.value?'<div style="font-size:10px;color:#5a9aee;margin-top:2px">'+cell.value+'</div>':'';
    return '<td class="'+cls+' eq-done"'+style+onclick+'100% ✓'+doneDate+'</td>';
  }
  if(cell.type==='percent'){
    var pct=parseFloat(cell.value)||0;
    var barCls2=pct>=90?'eq-bar-fill hi':'eq-bar-fill';
    var inner='<div class="eq-pct">'+pct+'%</div>'
      +'<div class="eq-bar-wrap"><div class="'+barCls2+'" style="width:'+Math.min(pct,100)+'%"></div></div>';
    return '<td class="'+cls+'"'+style+onclick+inner+'</td>';
  }
  if(cell.type==='date'){
    var today=TODAY.toISOString().slice(0,10);
    var isOver=cell.value&&cell.value<today;
    var dateCls=isOver?'eq-date overdue':'eq-date';
    return '<td class="'+cls+'"'+style+onclick+'<span class="'+dateCls+'">'+cell.value+'</span></td>';
  }
  return '<td class="'+cls+'"'+style+onclick+'</td>';
}

/* ── 메모 셀 렌더러 ── */
function renderEquipMemoCell(unit,editMode){
  var memo=unit.memo||'';
  var cls='eq-td-fix eq-col-memo'+(editMode?' editable':'');
  var styleAttr=' style="left:0;border-right:2px solid #555;text-align:center;padding:4px"';
  var onclick=editMode?' onclick="openEditUnitMemo(\''+unit.id+'\')">':'>';
  if(memo){
    var escaped=memo.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return '<td class="'+cls+'"'+styleAttr+onclick
      +'<span class="eq-memo-icon-wrap" data-memo="'+escaped+'" onmouseenter="showMemoTooltip(this)" onmouseleave="hideMemoTooltip()">'
      +'<span class="eq-memo-icon has-memo">&#x1F4AC;</span>'
      +'</span></td>';
  }
  if(editMode){
    return '<td class="'+cls+'"'+styleAttr+onclick+'<span class="eq-memo-icon">+</span></td>';
  }
  return '<td class="'+cls+'"'+styleAttr+'></td>';
}

function showMemoTooltip(el){
  var memo=el.getAttribute('data-memo');
  if(!memo) return;
  var tt=document.getElementById('eq-memo-tt');
  if(!tt){
    tt=document.createElement('div');
    tt.id='eq-memo-tt';
    tt.className='eq-memo-tooltip-fixed';
    document.body.appendChild(tt);
  }
  tt.innerHTML=memo.replace(/\n/g,'<br>');
  tt.style.display='block';
  var rect=el.getBoundingClientRect();
  var top=rect.bottom+4;
  var left=rect.left;
  tt.style.top=top+'px';
  tt.style.left=left+'px';
  var w=tt.offsetWidth;
  if(left+w>window.innerWidth-8) tt.style.left=Math.max(8,window.innerWidth-w-8)+'px';
}
function hideMemoTooltip(){
  var tt=document.getElementById('eq-memo-tt');
  if(tt) tt.style.display='none';
}

function _renderEquipUnitHtml(unit,idx,e,msDateItem,scrollItems){
  var rowCls='eq-row '+(idx%2===0?'even':'odd');
  var unitPct=calcUnitProgress(unit);
  var pctBar,unitBg='';
  if(unitPct===100){
    pctBar='<div style="font-size:11px;font-weight:600;color:#4aaa70;margin-top:2px">완료 ✓</div>';
    unitBg='background:var(--bg-eq-done);';
  } else {
    pctBar='<div style="font-size:11px;color:var(--tx-muted);margin-top:2px">'+unitPct+'%</div>';
  }
  var html='<tr class="'+rowCls+'">';
  html+='<td class="eq-td-fix eq-col-line'+(e?' editable':'')+'" style="left:0;min-width:0;white-space:nowrap;text-align:left"'
    +(e?' onclick="openEditEquipUnit(\''+unit.id+'\')">':'>')
    +(unit.lineName||'')+'</td>';
  // 프로젝트 없는 사이트 직속 호기에만 유형 배지 표시 (프로젝트 호기는 프로젝트 행에서 표시)
  var isNoProj=!(unit.equipProjectId&&(S.equipProjects||[]).find(function(p){return p.id===unit.equipProjectId;}));
  var uType=isNoProj?(unit.unitType||'납품셋업'):null;
  var uTypeBadge=uType?'<span class="eq-type-badge" style="font-size:9px;padding:1px 5px;background:'+(PROJ_TYPE_COLOR[uType]||'#1a55bb')+'">'+uType+'</span>':'';
  html+='<td class="eq-td-fix eq-col-unit'+(e?' editable':'')+'"'
    +' style="left:0;border-right:1px solid var(--bd-main);font-weight:500;'+unitBg+'"'
    +(e?' onclick="openEditEquipUnit(\''+unit.id+'\')"':'')+'>'
    +uTypeBadge+(unit.unitName||'')+pctBar+'</td>';
  if(msDateItem){
    html+=renderEquipCellSticky((unit.cells||{})[msDateItem.id],e,unit.id,msDateItem.id,
      'eq-col-msdate','left:0;border-right:1px solid #3a3a44');
  } else {
    html+='<td class="eq-td-fix eq-col-msdate" style="left:0;border-right:1px solid #3a3a44"></td>';
  }
  html+=renderEquipMemoCell(unit,e);
  scrollItems.forEach(function(item){
    html+=renderEquipCell((unit.cells||{})[item.id],e,unit.id,item.id);
  });
  if(e){
    html+='<td class="eq-td" style="white-space:nowrap">'
      +'<button class="eq-act-btn copy" onclick="openCopyEquipUnit(\''+unit.id+'\')">복사</button>'
      +'<button class="eq-act-btn del" onclick="delEquipUnit(\''+unit.id+'\')">삭제</button>'
      +'</td>';
  }
  html+='</tr>';
  return html;
}

/* ── 그리드 렌더 ── */
function renderEquipGrid(){
  var el=document.getElementById('eqGrid');
  if(!el) return;

  var items=S.equipItems.slice().sort(function(a,b){return a.order-b.order;});
  // 양산시작(ei21)은 고정 열로 분리, 나머지가 스크롤 항목
  var msDateItem=items.find(function(i){return i.id==='ei21';});
  var scrollItems=items.filter(function(i){
    if(i.id==='ei21') return false;
    if(_equipFilterSite==='all') return true;
    var s=i.siteIds;
    return !s||s.length===0||s.indexOf(_equipFilterSite)>=0;
  });

  // 필터링
  var allUnits=S.equipUnits.filter(function(u){
    return _equipFilterSite==='all'||u.siteId===_equipFilterSite;
  });

  // 사이트 목록 — equipSiteOrder 기반
  ensureEquipSiteOrder();
  var siteIds=S.equipSiteOrder.filter(function(id){
    return allUnits.some(function(u){return u.siteId===id;});
  });
  allUnits.forEach(function(u){
    if(siteIds.indexOf(u.siteId)<0) siteIds.push(u.siteId);
  });

  /* ── 요약 카드 — eqSummary 영역 (테이블과 분리, 스크롤 독립) ── */
  var summaryEl=document.getElementById('eqSummary');
  if(!allUnits.length){
    el.innerHTML='<div class="eq-empty">등록된 설비가 없습니다.'
      +'<div class="eq-empty-sub">수정 모드로 전환 후 [+ 사이트]와 [+ 호기]를 추가하세요.</div></div>';
    if(summaryEl) summaryEl.innerHTML='';
    return;
  }

  if(summaryEl){
    var summaryHtml='<div class="eq-summary-bar">';
    siteIds.forEach(function(siteId){
      var site=S.sites.find(function(s){return s.id===siteId;});
      if(!site) return;
      var pct=calcSiteProgress(siteId);
      if(pct===null) return;
      var units=S.equipUnits.filter(function(u){return u.siteId===siteId;});
      var doneCount=units.filter(function(u){return calcUnitProgress(u)===100;}).length;
      var barColor=pct===100?'#2a8a40':(pct>=70?'#1a6bbf':'#b87a10');
      var siteProjs=(S.equipProjects||[]).filter(function(p){return p.siteId===siteId;});
      var projSubHtml='';
      if(siteProjs.length>0){
        projSubHtml='<div class="eq-proj-sub-list">';
        siteProjs.forEach(function(proj){
          var pp=calcProjectProgress(proj.id);
          if(pp===null) return;
          var pc=pp===100?'#2a8a40':(pp>=70?'#1a6bbf':'#b87a10');
          projSubHtml+='<div class="eq-proj-sub-item">'
            +'<span class="eq-proj-sub-name">'+proj.name+'</span>'
            +'<span class="eq-proj-sub-pct" style="color:'+pc+'">'+pp+'%</span>'
            +'<div class="eq-proj-sub-bar"><div class="eq-proj-sub-bar-fill" style="width:'+pp+'%;background:'+pc+'"></div></div>'
            +'</div>';
        });
        projSubHtml+='</div>';
      }
      summaryHtml+='<div class="eq-summary-card">'
        +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">'
        +'<div style="width:4px;height:28px;border-radius:2px;background:'+site.color+';flex-shrink:0"></div>'
        +'<span style="font-size:13px;font-weight:700">'+site.name+'</span>'
        +'</div>'
        +'<div style="font-size:24px;font-weight:700;line-height:1">'+pct+'%</div>'
        +'<div style="margin:6px 0 3px;background:var(--bd-light);border-radius:3px;height:5px;overflow:hidden">'
        +'<div style="height:100%;border-radius:3px;background:'+barColor+';width:'+pct+'%"></div></div>'
        +'<div style="font-size:10px;color:var(--tx-muted);margin-top:3px">'+doneCount+' / '+units.length+' 호기 완료</div>'
        +projSubHtml
        +'</div>';
    });
    summaryHtml+='</div>';
    summaryEl.innerHTML=summaryHtml;
  }

  var e=_equipEditMode;
  // colCount: 고정 4열 (라인/호기/양산시작/메모) + 스크롤 항목 + 관리열(수정모드)
  var scrollColCount=scrollItems.length+(e?1:0);

  /* ── 헤더 단일 행 ── */
  var prevGroup=null;
  var hdrRow='<tr>';
  // 고정 4열 헤더
  hdrRow+='<th class="eq-th fix-col eq-col-line" style="left:0;white-space:nowrap;min-width:40px">라인</th>';
  hdrRow+='<th class="eq-th fix-col eq-col-unit" style="left:0;min-width:80px;width:80px;border-right:1px solid var(--bd-main)">호기</th>';
  hdrRow+='<th class="eq-th fix-col eq-col-msdate" style="left:0;min-width:80px;width:80px;border-right:1px solid var(--bd-main)">'+(msDateItem?msDateItem.name:'양산시작')+'</th>';
  hdrRow+='<th class="eq-th fix-col eq-col-memo" style="left:0;min-width:40px;width:40px;border-right:2px solid var(--bd-strong)">메모</th>';
  // 스크롤 항목 헤더
  scrollItems.forEach(function(item,itemIdx){
    var g=item.groupName||'';
    var groupLbl=g?'<div style="font-size:8px;color:#534AB7;margin-bottom:2px;letter-spacing:.04em">'+g+'</div>':'';
    var borderLeft=(g&&g!==prevGroup&&prevGroup!==null)?'border-left:2px solid #534AB7;':'';
    prevGroup=g;
    if(e){
      var isFirst=(itemIdx===0),isLast=(itemIdx===scrollItems.length-1);
      hdrRow+='<th class="eq-th" style="padding:3px 5px;'+borderLeft+'white-space:normal;max-width:100px">'
        +groupLbl
        +'<div style="word-break:break-word">'+item.name+'</div>'
        +'<div style="display:flex;gap:2px;margin-top:3px;justify-content:center;flex-wrap:wrap">'
        +(isFirst?'':'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block" onclick="moveEquipItem(\''+item.id+'\',-1)">↑</button>')
        +(isLast?'':'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block" onclick="moveEquipItem(\''+item.id+'\',1)">↓</button>')
        +'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block" onclick="openEditEquipItem(\''+item.id+'\')">수정</button>'
        +'<button class="eq-item-edit-btn" style="width:auto;padding:1px 5px;display:inline-block;color:#c04040;border-color:#7a1010" onclick="openDelEquipItem(\''+item.id+'\')">삭제</button>'
        +'</div></th>';
    } else {
      hdrRow+='<th class="eq-th" style="'+borderLeft+'white-space:normal;max-width:100px">'+groupLbl+item.name+'</th>';
    }
  });
  if(e) hdrRow+='<th class="eq-th">관리</th>';
  hdrRow+='</tr>';

  /* ── 데이터 행 ── */
  var bodyHtml='';
  siteIds.forEach(function(siteId){
    var site=S.sites.find(function(s){return s.id===siteId;});
    if(!site) return; // 삭제된 사이트는 표시하지 않음
    var siteName=site.name;
    var siteColor=site.color;
    var personnel=getOnSitePersonnel(siteId);
    var personnelHtml='';
    if(personnel.length){
      personnelHtml=' <span class="eq-site-personnel">출장중: '
        +personnel.map(function(p){
          return '<span class="eq-chip '+(p.type||'hq')+'">'+p.name+'</span>';
        }).join('')+'</span>';
    }
    var collapsed=!!_equipCollapsed[siteId];
    var sitePct=calcSiteProgress(siteId);
    var sitePctStr=sitePct!==null?sitePct+'%':'—';
    var sitePctColor=sitePct===100?'#2a8a40':(sitePct>=70?'#1a6bbf':'#b87a10');
    var collapseBtn='<button class="eq-collapse-btn" onclick="toggleEquipCollapse(\''+siteId+'\')">'+(collapsed?'▶':'▼')+'</button>';
    var collapsedInfo=collapsed
      ?'<span class="eq-site-pct" style="color:'+sitePctColor+'">'+sitePctStr+'</span>'
       +'<div class="eq-site-pbar"><div class="eq-site-pbar-fill" style="width:'+(sitePct||0)+'%;background:'+sitePctColor+'"></div></div>'
      :'';
    // 사이트 구분 행 — 4열 colspan sticky로 사이트명/출장자 고정
    bodyHtml+='<tr class="eq-site-row">'
      +'<td colspan="4" style="position:sticky;left:0;z-index:25;border-left:4px solid '+siteColor+'">'
      +'<div class="eq-site-inner">'
      +collapseBtn
      +'<span style="font-size:14px;font-weight:700;letter-spacing:.04em">'+siteName+'</span>'
      +collapsedInfo
      +personnelHtml
      +'</div></td>'
      +(scrollColCount>0?'<td colspan="'+scrollColCount+'" style="background:var(--bg-alt);border-top:2px solid var(--bd-light)"></td>':'')
      +'</tr>';

    var siteUnits=allUnits.filter(function(u){return u.siteId===siteId;});
    var siteProjects=(S.equipProjects||[]).filter(function(p){return p.siteId===siteId;});
    if(siteProjects.length>0){
      // 프로젝트 모드: 프로젝트별 서브그룹
      siteProjects.forEach(function(proj){
        var projUnits=siteUnits.filter(function(u){return u.equipProjectId===proj.id;});
        var projPct=calcProjectProgress(proj.id);
        var projPctStr=projPct!==null?projPct+'%':'—';
        var pType=proj.projType||'납품셋업';
        var pTypeColor=PROJ_TYPE_COLOR[pType]||'#1a55bb';
        var typeBadge='<span class="eq-type-badge" style="background:'+pTypeColor+'">'+pType+'</span>';
        bodyHtml+='<tr class="eq-project-row">'
          +'<td colspan="4" class="eq-proj-sticky" style="position:sticky;left:0;z-index:22;background:var(--bg-deep);'
          +'border-top:1px solid var(--bd-light);border-left:3px solid #4a4a6a;border-bottom:1px solid var(--bd-light);">'
          +typeBadge
          +'<span class="eq-proj-name">'+proj.name+'</span>'
          +'<span class="eq-proj-pct">'+projPctStr+'</span>'
          +(e?'<button class="eq-item-edit-btn" onclick="openEditEquipProject(\''+proj.id+'\')">수정</button>'
            +'<button class="eq-item-edit-btn" style="color:#c04040;border-color:#7a1010" onclick="delEquipProject(\''+proj.id+'\')">삭제</button>':'')
          +'</td>'
          +(scrollColCount>0?'<td colspan="'+scrollColCount+'" style="background:var(--bg-deep);border-top:1px solid var(--bd-light);border-bottom:1px solid var(--bd-light)"></td>':'')
          +'</tr>';
        if(!collapsed){
          projUnits.forEach(function(unit,idx){bodyHtml+=_renderEquipUnitHtml(unit,idx,e,msDateItem,scrollItems);});
        }
      });
      // 미지정 호기
      var unassigned=siteUnits.filter(function(u){
        return !u.equipProjectId||!siteProjects.find(function(p){return p.id===u.equipProjectId;});
      });
      if(unassigned.length&&!collapsed){
        bodyHtml+='<tr class="eq-project-row unassigned">'
          +'<td colspan="'+(4+scrollColCount)+'" style="position:sticky;left:0;z-index:22;background:var(--bg-deep);'
          +'border-top:1px solid var(--bd-light);border-bottom:1px solid var(--bd-light);'
          +'color:var(--tx-faint);font-size:11px;font-style:italic;padding:4px 10px 4px 20px">미지정</td>'
          +'</tr>';
        unassigned.forEach(function(unit,idx){bodyHtml+=_renderEquipUnitHtml(unit,idx,e,msDateItem,scrollItems);});
      }
    } else {
      // 기존 방식 (프로젝트 없음 - 납품셋업 기본 배지 표시)
      if(!collapsed){
        siteUnits.forEach(function(unit,idx){bodyHtml+=_renderEquipUnitHtml(unit,idx,e,msDateItem,scrollItems);});
      }
    }
  });

  el.innerHTML='<table class="eq-table"><thead>'+hdrRow+'</thead><tbody>'+bodyHtml+'</tbody></table>';
  fixEquipStickyOffsets();
}

/* ── 수정 모드 토글 ── */
function toggleEquipEdit(){
  _equipEditMode=!_equipEditMode;
  var btn=document.getElementById('btnEquipEdit');
  if(btn) btn.className='btn'+(_equipEditMode?' edit-on':'');
  ['btnAddEquipSite','btnAddEquipProject','btnAddEquipUnit','btnAddEquipItem'].forEach(function(id){
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
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="na"'+(t==='na'?' checked':'')+' onchange="equipCellTypeChange()"> N/A</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="date"'+(t==='date'?' checked':'')+' onchange="equipCellTypeChange()"> 시작예정일</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
    +'<input type="radio" name="eq_type" value="percent"'+(t==='percent'?' checked':'')+' onchange="equipCellTypeChange()"> 진행율(%)</label>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
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

/* ── 호기 메모 편집 ── */
function openEditUnitMemo(unitId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  var memo=unit.memo||'';
  mw('<div class="mtit">호기 메모</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:10px">'+unit.unitName+'</div>'
    +'<div class="fg"><label class="fl">메모 내용</label>'
    +'<textarea id="eq_memo_text" rows="4" style="width:100%;resize:vertical;background:var(--bg-input);'
    +'color:var(--tx-primary);border:1px solid var(--bd-main);border-radius:4px;padding:6px;font-size:12px">'
    +memo+'</textarea></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm warn" onclick="saveUnitMemo(\''+unitId+'\',true)">삭제</button>'
    +'<button class="btn sm pri" onclick="saveUnitMemo(\''+unitId+'\',false)">저장</button>'
    +'</div>');
  setTimeout(function(){var el=document.getElementById('eq_memo_text');if(el)el.focus();},50);
}

function saveUnitMemo(unitId,clear){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  unit.memo=clear?'':(document.getElementById('eq_memo_text').value.trim());
  saveData();cm();renderEquipGrid();
}

/* ── 프로젝트 CRUD ── */
function _projTypeOpts(sel){
  return PROJ_TYPES.map(function(t){
    return '<option value="'+t+'"'+(t===(sel||'납품셋업')?' selected':'')+'>'+t+'</option>';
  }).join('');
}
function openAddEquipProject(){
  ensureEquipSiteOrder();
  var available=S.sites.filter(function(s){return S.equipSiteOrder.indexOf(s.id)>=0;});
  if(!available.length){alert('먼저 사이트를 추가해주세요.');return;}
  var opts=available.map(function(s){return '<option value="'+s.id+'">'+s.name+'</option>';}).join('');
  mw('<div class="mtit">프로젝트 추가</div>'
    +'<div class="fg"><label class="fl">사이트</label>'
    +'<select id="eq_proj_site">'+opts+'</select></div>'
    +'<div class="fg"><label class="fl">프로젝트명</label>'
    +'<input type="text" id="eq_proj_name" placeholder="예: Phase 1" autocorrect="off" autocomplete="off" spellcheck="false"'
    +' onkeydown="if(event.key===\'Enter\')saveAddEquipProject()"></div>'
    +'<div class="fg"><label class="fl">유형</label>'
    +'<select id="eq_proj_type">'+_projTypeOpts()+'</select></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveAddEquipProject()">추가</button>'
    +'</div>');
  setTimeout(function(){var el=document.getElementById('eq_proj_name');if(el)el.focus();},50);
}
function saveAddEquipProject(){
  var siteId=document.getElementById('eq_proj_site').value;
  var name=document.getElementById('eq_proj_name').value.trim();
  var projType=document.getElementById('eq_proj_type').value||'납품셋업';
  if(!name){alert('프로젝트명을 입력해주세요.');return;}
  S.equipProjects.push({id:'ep'+Date.now(),siteId:siteId,name:name,projType:projType});
  saveData();cm();renderEquipGrid();
}
function openEditEquipProject(projectId){
  var proj=S.equipProjects.find(function(p){return p.id===projectId;});
  if(!proj) return;
  mw('<div class="mtit">프로젝트 수정</div>'
    +'<div class="fg"><label class="fl">프로젝트명</label>'
    +'<input type="text" id="eq_edit_proj_name" value="'+proj.name+'" autocorrect="off" autocomplete="off" spellcheck="false"'
    +' onkeydown="if(event.key===\'Enter\')saveEditEquipProject(\''+projectId+'\')"></div>'
    +'<div class="fg"><label class="fl">유형</label>'
    +'<select id="eq_edit_proj_type">'+_projTypeOpts(proj.projType||'납품셋업')+'</select></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveEditEquipProject(\''+projectId+'\')">저장</button>'
    +'</div>');
  setTimeout(function(){var el=document.getElementById('eq_edit_proj_name');if(el)el.focus();},50);
}
function saveEditEquipProject(projectId){
  var proj=S.equipProjects.find(function(p){return p.id===projectId;});
  if(!proj) return;
  var name=document.getElementById('eq_edit_proj_name').value.trim();
  var projType=document.getElementById('eq_edit_proj_type').value||'납품셋업';
  if(!name){alert('프로젝트명을 입력해주세요.');return;}
  proj.name=name;
  proj.projType=projType;
  saveData();cm();renderEquipGrid();
}
function delEquipProject(projectId){
  var proj=S.equipProjects.find(function(p){return p.id===projectId;});
  if(!proj) return;
  if(!confirm('"'+proj.name+'" 프로젝트를 삭제하시겠습니까?\n소속 호기는 미지정으로 이동됩니다.')) return;
  S.equipUnits.forEach(function(u){if(u.equipProjectId===projectId)u.equipProjectId=null;});
  S.equipProjects=S.equipProjects.filter(function(p){return p.id!==projectId;});
  saveData();renderEquipGrid();
}

/* ── 사이트 추가 ── */
function openAddEquipSite(){
  ensureEquipSiteOrder();
  var available=S.sites.filter(function(s){return S.equipSiteOrder.indexOf(s.id)<0;});
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
  ensureEquipSiteOrder();
  if(S.equipSiteOrder.indexOf(siteId)<0) S.equipSiteOrder.push(siteId);
  saveData();cm();renderEquipTab();
}

/* ── 호기 추가 ── */
function _equipProjOpts(siteId, selectedId){
  var projs=S.equipProjects.filter(function(p){return p.siteId===siteId;});
  if(!projs.length) return '';
  return '<option value=""'+(selectedId?'':' selected')+'>없음</option>'
    +projs.map(function(p){return '<option value="'+p.id+'"'+(p.id===selectedId?' selected':'')+'>'+p.name+'</option>';}).join('');
}
function openAddEquipUnit(){
  ensureEquipSiteOrder();
  var available=S.sites.filter(function(s){return S.equipSiteOrder.indexOf(s.id)>=0;});
  if(!available.length){alert('먼저 사이트를 추가해주세요.');return;}
  var firstSiteId=available[0].id;
  var opts=available.map(function(s){return '<option value="'+s.id+'">'+s.name+'</option>';}).join('');
  var projOpts=_equipProjOpts(firstSiteId,'');
  mw('<div class="mtit">호기 추가</div>'
    +'<div class="fg"><label class="fl">사이트</label>'
    +'<select id="eq_unit_site" onchange="_updateUnitProjSelect()">'+opts+'</select></div>'
    +(projOpts?'<div class="fg" id="eq_unit_proj_wrap"><label class="fl">프로젝트</label>'
      +'<select id="eq_unit_proj">'+projOpts+'</select></div>':'<div id="eq_unit_proj_wrap"></div>')
    +'<div class="fg"><label class="fl">라인명 (선택)</label>'
    +'<input type="text" id="eq_unit_line" placeholder="예: 1라인" autocorrect="off" autocomplete="off" spellcheck="false"></div>'
    +'<div class="fg"><label class="fl">호기명</label>'
    +'<input type="text" id="eq_unit_name" placeholder="예: Anode" autocorrect="off" autocomplete="off" spellcheck="false"'
    +' onkeydown="if(event.key===\'Enter\')saveAddEquipUnit()"></div>'
    +'<div id="eq_unit_feedback" style="display:none;color:#4aaa70;font-size:11px;'
    +'padding:4px 8px;background:#0a1e10;border-radius:4px;margin-bottom:6px"></div>'
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">닫기</button>'
    +'<button class="btn sm pri" onclick="saveAddEquipUnit()">추가</button>'
    +'</div>');
}
function _updateUnitProjSelect(){
  var siteId=document.getElementById('eq_unit_site').value;
  var wrap=document.getElementById('eq_unit_proj_wrap');
  if(!wrap) return;
  var opts=_equipProjOpts(siteId,'');
  wrap.innerHTML=opts?'<label class="fl">프로젝트</label><select id="eq_unit_proj">'+opts+'</select>':'';
}

function saveAddEquipUnit(){
  var siteId=document.getElementById('eq_unit_site').value;
  var lineName=document.getElementById('eq_unit_line').value.trim();
  var unitName=document.getElementById('eq_unit_name').value.trim();
  if(!unitName){alert('호기명을 입력해주세요.');return;}
  var projEl=document.getElementById('eq_unit_proj');
  var equipProjectId=projEl?projEl.value||null:null;
  var initCells={};
  S.equipItems.forEach(function(item){
    var s=item.siteIds;
    if(!s||s.length===0||s.indexOf(siteId)>=0) initCells[item.id]={type:'na',value:null};
  });
  S.equipUnits.push({id:'eu'+Date.now(),siteId:siteId,equipProjectId:equipProjectId,lineName:lineName,unitName:unitName,memo:'',cells:initCells});
  saveData();
  renderEquipGrid();
  // 모달 유지 — 필드 초기화 후 포커스
  document.getElementById('eq_unit_line').value='';
  document.getElementById('eq_unit_name').value='';
  document.getElementById('eq_unit_name').focus();
  var fb=document.getElementById('eq_unit_feedback');
  if(fb){fb.style.display='';fb.textContent='"'+unitName+'" 추가됨';}
}

/* ── 사이트 선택 체크박스 HTML 생성 헬퍼 ── */
var _REGION_LABEL={'americas':'미주 (미국)','canada':'캐나다','china':'중국','vietnam':'베트남','europe':'유럽'};
var _REGION_ORDER=['americas','canada','vietnam','china','europe'];
function _buildSiteCheckboxesHtml(checkedIds){
  var allChecked=!checkedIds||checkedIds.length===0;
  // S.sites 기반으로 region별 동적 그룹화
  var regionMap={};
  (S.sites||[]).forEach(function(site){
    var r=site.region||'other';
    if(!regionMap[r]) regionMap[r]=[];
    regionMap[r].push(site);
  });
  // S.sites에 없지만 equip에 등록된 사이트도 포함
  (S.equipSiteOrder||[]).forEach(function(sid){
    var found=(S.sites||[]).some(function(s){return s.id===sid;});
    if(!found){
      if(!regionMap['other']) regionMap['other']=[];
      regionMap['other'].push({id:sid,name:sid});
    }
  });
  var orderedRegions=_REGION_ORDER.filter(function(r){return regionMap[r];});
  if(regionMap['other']) orderedRegions.push('other');

  var html='<div class="fg"><label class="fl">적용 사이트</label>'
    +'<label style="display:flex;align-items:center;gap:5px;cursor:pointer;margin-bottom:6px">'
    +'<input type="checkbox" id="eq_site_all" onchange="_onEquipSiteAllChange()"'+(allChecked?' checked':'')+'>'
    +'<span style="font-size:12px">전체 공통 (모든 사이트)</span></label>'
    +'<div id="eq_site_groups" style="display:'+(allChecked?'none':'block')+';padding:6px 8px;background:var(--bg-alt);border:1px solid var(--bd-main);border-radius:4px">';
  orderedRegions.forEach(function(region){
    var sites=regionMap[region];
    var label=_REGION_LABEL[region]||region;
    html+='<div style="margin-bottom:4px"><span style="font-size:10px;color:#7a7aaa;margin-right:6px">'+label+'</span>';
    sites.forEach(function(site){
      var chk=(!allChecked&&checkedIds&&checkedIds.indexOf(site.id)>=0)?' checked':'';
      html+='<label style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;cursor:pointer;font-size:11px">'
        +'<input type="checkbox" class="eq-site-cb" value="'+site.id+'"'+chk+'>'+site.name+'</label>';
    });
    html+='</div>';
  });
  html+='</div></div>';
  return html;
}
function _onEquipSiteAllChange(){
  var allEl=document.getElementById('eq_site_all');
  var grpEl=document.getElementById('eq_site_groups');
  if(grpEl) grpEl.style.display=allEl&&allEl.checked?'none':'block';
}
function _collectSiteIds(){
  var allEl=document.getElementById('eq_site_all');
  if(allEl&&allEl.checked) return [];
  var ids=[];
  var cbs=document.querySelectorAll('.eq-site-cb:checked');
  cbs.forEach(function(cb){ids.push(cb.value);});
  return ids;
}

/* ── 항목 추가 ── */
function openAddEquipItem(){
  var groups=['SAT','IT'];
  var existGroups=[];
  S.equipItems.forEach(function(i){if(i.groupName&&existGroups.indexOf(i.groupName)<0)existGroups.push(i.groupName);});
  existGroups.forEach(function(g){if(groups.indexOf(g)<0)groups.push(g);});
  var opts='<option value="">없음</option>'+groups.map(function(g){return '<option value="'+g+'">'+g+'</option>';}).join('');
  mw('<div class="mtit">공정 항목 추가</div>'
    +'<div class="fg"><label class="fl">항목명</label>'
    +'<input type="text" id="eq_item_name" placeholder="예: Final Check"></div>'
    +'<div class="fg"><label class="fl">그룹 (선택)</label>'
    +'<select id="eq_item_group">'+opts+'</select>'
    +'<input type="text" id="eq_item_group_custom" placeholder="새 그룹명 직접 입력" style="margin-top:5px"></div>'
    +_buildSiteCheckboxesHtml(null)
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
  var siteIds=_collectSiteIds();
  var maxOrder=0;
  S.equipItems.forEach(function(i){if(i.order>maxOrder)maxOrder=i.order;});
  var newItem={id:'ei'+Date.now(),name:name,groupName:group,order:maxOrder+1,siteIds:siteIds};
  S.equipItems.push(newItem);
  S.equipUnits.forEach(function(u){
    if(!u.cells) u.cells={};
    var applicable=siteIds.length===0||siteIds.indexOf(u.siteId)>=0;
    if(applicable) u.cells[newItem.id]={type:'na',value:null};
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
    +_buildSiteCheckboxesHtml(item.siteIds||[])
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
  var newSiteIds=_collectSiteIds();
  // 새로 추가된 사이트의 units에 cells 초기화 (기존 데이터는 유지)
  S.equipUnits.forEach(function(u){
    if(!u.cells) u.cells={};
    var wasApplicable=!item.siteIds||item.siteIds.length===0||item.siteIds.indexOf(u.siteId)>=0;
    var nowApplicable=newSiteIds.length===0||newSiteIds.indexOf(u.siteId)>=0;
    if(!wasApplicable&&nowApplicable&&!u.cells[itemId])
      u.cells[itemId]={type:'na',value:null};
  });
  item.name=name;item.groupName=group;item.siteIds=newSiteIds;
  saveData();cm();renderEquipTab();
}

/* ── 항목 삭제 ── */
function openDelEquipItem(itemId){
  var item=S.equipItems.find(function(i){return i.id===itemId;});
  if(!item) return;
  mw('<div class="mtit">항목 삭제</div>'
    +'<div style="background:var(--bg-danger,#2a0a0a);border:1px solid var(--bd-danger,#7a1010);border-radius:5px;padding:10px 12px;font-size:12px;color:#e84040;margin-bottom:16px">'
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

/* ── 항목 순서 변경 ── */
function moveEquipItem(itemId,dir){
  var sorted=S.equipItems.slice().sort(function(a,b){return a.order-b.order;});
  var idx=sorted.findIndex(function(i){return i.id===itemId;});
  var swapIdx=idx+dir;
  if(swapIdx<0||swapIdx>=sorted.length) return;
  var tmp=sorted[idx].order;
  sorted[idx].order=sorted[swapIdx].order;
  sorted[swapIdx].order=tmp;
  S.equipItems.forEach(function(item){
    var s=sorted.find(function(i){return i.id===item.id;});
    if(s) item.order=s.order;
  });
  saveData();renderEquipGrid();
}

/* ── 라인/호기 수정 ── */
function openEditEquipUnit(unitId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  var siteOpts=S.sites.map(function(s){
    return '<option value="'+s.id+'"'+(s.id===unit.siteId?' selected':'')+'>'+s.name+'</option>';
  }).join('');
  var projOpts=_equipProjOpts(unit.siteId,unit.equipProjectId||'');
  // 프로젝트에 속하지 않는 사이트 직속 호기일 때 유형 선택 표시
  var hasProj=!!(unit.equipProjectId&&(S.equipProjects||[]).find(function(p){return p.id===unit.equipProjectId;}));
  var typeRow=hasProj?'':'<div class="fg"><label class="fl">유형</label>'
    +'<select id="eq_edit_unit_type">'+_projTypeOpts(unit.unitType||'납품셋업')+'</select></div>';
  mw('<div class="mtit">라인 / 호기 수정</div>'
    +'<div class="fg"><label class="fl">사이트</label>'
    +'<select id="eq_edit_unit_site" onchange="_updateEditUnitProjSelect(\''+unitId+'\')">'+siteOpts+'</select></div>'
    +(projOpts?'<div class="fg" id="eq_edit_unit_proj_wrap"><label class="fl">프로젝트</label>'
      +'<select id="eq_edit_unit_proj">'+projOpts+'</select></div>':'<div id="eq_edit_unit_proj_wrap"></div>')
    +'<div class="fg"><label class="fl">라인명 (선택)</label>'
    +'<input type="text" id="eq_edit_unit_line" value="'+(unit.lineName||'')+'" autocorrect="off" autocomplete="off" spellcheck="false"></div>'
    +'<div class="fg"><label class="fl">호기명</label>'
    +'<input type="text" id="eq_edit_unit_name" value="'+(unit.unitName||'')+'" autocorrect="off" autocomplete="off" spellcheck="false"></div>'
    +typeRow
    +'<div class="mfoot">'
    +'<button class="btn sm" onclick="cm()">취소</button>'
    +'<button class="btn sm pri" onclick="saveEditEquipUnit(\''+unitId+'\')">저장</button>'
    +'</div>');
}
function _updateEditUnitProjSelect(){
  var siteId=document.getElementById('eq_edit_unit_site').value;
  var wrap=document.getElementById('eq_edit_unit_proj_wrap');
  if(!wrap) return;
  var opts=_equipProjOpts(siteId,'');
  wrap.innerHTML=opts?'<label class="fl">프로젝트</label><select id="eq_edit_unit_proj">'+opts+'</select>':'';
}
function saveEditEquipUnit(unitId){
  var unit=S.equipUnits.find(function(u){return u.id===unitId;});
  if(!unit) return;
  var newSiteId=document.getElementById('eq_edit_unit_site').value;
  var ln=document.getElementById('eq_edit_unit_line').value.trim();
  var un=document.getElementById('eq_edit_unit_name').value.trim();
  if(!un){alert('호기명을 입력해주세요.');return;}
  var projEl=document.getElementById('eq_edit_unit_proj');
  var typeEl=document.getElementById('eq_edit_unit_type');
  unit.siteId=newSiteId;
  unit.equipProjectId=projEl?projEl.value||null:null;
  unit.lineName=ln;unit.unitName=un;
  if(typeEl) unit.unitType=typeEl.value||'납품셋업';
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
    +'<div style="max-height:200px;overflow-y:auto;border:1px solid var(--bd-light);border-radius:5px;padding:8px 10px">'
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
