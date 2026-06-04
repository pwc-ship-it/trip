/* ══════════════════════════════════════════
   이력관리 (Vision 설비 이력) — vision.js
   v2: 그리드 뷰 + 다중 카메라 + CSV + 복사
══════════════════════════════════════════ */

/* ── 전역 상태 ── */
var _visionView = 'grid';        // 'grid' | 'detail'
var _visionSelId = null;
var _visionFilterType = 'all';
var _visionEditMode = false;
var _viCollapsed = {};           // {siteId: true/false}
var _viCurrentTypes = [];        // 현재 상세 폼의 선택된 Vision Type 목록

/* Vision Type 색상 */
var VI_TYPE_COLOR = {
  'Notching':    '#1a55bb','Delamination':'#1a7a3a','Foil':'#7a5500',
  'NGMarking':   '#7a1a99','DNC_Notching':'#0a6a7a','DNC_Cutting':'#7a3a10'
};
var VI_TYPE_PALETTE = ['#1a55bb','#1a7a3a','#7a5500','#7a1a99','#0a6a7a','#7a3a10','#5500aa','#aa3300','#005555','#5c6600','#006680','#8a4400'];
function _viTypeColor(t){
  if(VI_TYPE_COLOR[t]) return VI_TYPE_COLOR[t];
  var item=_findItemById('vi_type');
  var opts=item?(item.options||[]):[];
  var i=opts.indexOf(t);
  return i>=0?VI_TYPE_PALETTE[i%VI_TYPE_PALETTE.length]:'#3a3a5a';
}

/* ── 공통 유틸 ── */
function _viId(){ return 've'+Date.now()+Math.floor(Math.random()*1000); }
function _viToday(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _esc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _viEquipLabel(e){
  var line=(e.data&&e.data['vi_line'])||'';
  var unit=(e.data&&e.data['vi_unit'])||'';
  if(line&&unit) return line+'-'+unit;
  return unit||line||e.id;
}
function _viTypeLabel(e){
  var t=(e.data&&e.data['vi_type']);
  if(!t) return '';
  if(Array.isArray(t)) return t.join(', ');
  return t;
}
function _viTypeBadges(typeVal){
  var types=Array.isArray(typeVal)?typeVal:(typeVal?[typeVal]:[]);
  return types.map(function(t){
    return '<span class="vi-type-badge" style="background:'+_viTypeColor(t)+'">'+_esc(t)+'</span>';
  }).join(' ');
}

/* ══════════════════════════════════════════
   템플릿 순회 헬퍼
══════════════════════════════════════════ */
function _viAllItems(){
  var list=[];
  (S.visionTemplate.categories||[]).forEach(function(cat){
    if(cat.groups) cat.groups.forEach(function(g){ (g.items||[]).forEach(function(i){ list.push(i); }); });
    else (cat.items||[]).forEach(function(i){ list.push(i); });
  });
  return list;
}
function _getViDynCols(){
  var fixed=['vi_site','vi_line','vi_unit','vi_type'];
  return _viAllItems().filter(function(i){ return i.showInGrid && fixed.indexOf(i.id)<0; });
}
function _findCat(catId){ return (S.visionTemplate.categories||[]).find(function(c){return c.id===catId;})||null; }
function _findGrp(catId,grpId){ var cat=_findCat(catId); if(!cat||!cat.groups)return null; return cat.groups.find(function(g){return g.id===grpId;})||null; }
function _findItem(catId,grpId,itemId){ var list=_getItemsList(catId,grpId); if(!list)return null; return list.find(function(i){return i.id===itemId;})||null; }
function _findItemById(itemId){
  var found=null;
  (S.visionTemplate.categories||[]).forEach(function(cat){
    if(found)return;
    if(cat.items){ var i=cat.items.find(function(x){return x.id===itemId;}); if(i)found=i; }
    if(cat.groups) cat.groups.forEach(function(g){ if(found)return; var i=(g.items||[]).find(function(x){return x.id===itemId;}); if(i)found=i; });
  });
  return found;
}
function _getItemsList(catId,grpId){
  var cat=_findCat(catId); if(!cat)return null;
  if(grpId){ var grp=_findGrp(catId,grpId); if(!grp)return null; if(!grp.items)grp.items=[]; return grp.items; }
  if(!cat.items)cat.items=[]; return cat.items;
}

/* ══════════════════════════════════════════
   렌더링 — 진입점
══════════════════════════════════════════ */
function renderVisionTab(){
  renderVisionSidebar();
  renderVisionMain();
}

/* ══════════════════════════════════════════
   사이드바 (필터 + 설비 목록)
══════════════════════════════════════════ */
function renderVisionSidebar(){
  var sb=document.getElementById('visionSidebar');
  if(!sb)return;

  /* Type 필터 버튼 */
  var allTypes=[];
  (S.visionEquips||[]).forEach(function(e){
    var t=e.data&&e.data['vi_type'];
    var types=Array.isArray(t)?t:(t?[t]:[]);
    types.forEach(function(ty){ if(ty&&allTypes.indexOf(ty)<0) allTypes.push(ty); });
  });
  var typeBar='<div class="vi-type-filter">'+
    '<button class="vi-type-btn'+(_visionFilterType==='all'?' on':'')+'" onclick="setVisionFilterType(\'all\')">전체</button>'+
    allTypes.map(function(t){
      return '<button class="vi-type-btn'+(_visionFilterType===t?' on':'')+'" onclick="setVisionFilterType(\''+_esc(t)+'\')">'+_esc(t)+'</button>';
    }).join('')+
  '</div>';

  /* 필터 적용 */
  var equips=(S.visionEquips||[]).filter(function(e){
    if(_visionFilterType==='all')return true;
    var t=e.data&&e.data['vi_type'];
    var types=Array.isArray(t)?t:(t?[t]:[]);
    return types.indexOf(_visionFilterType)>=0;
  });

  /* 사이트별 그룹 */
  var bysite={};
  equips.forEach(function(e){
    var sid=e.siteId||'기타'; if(!bysite[sid])bysite[sid]=[]; bysite[sid].push(e);
  });
  var siteOrder=S.sites.map(function(s){return s.id;}).filter(function(id){return bysite[id];});
  Object.keys(bysite).forEach(function(k){ if(siteOrder.indexOf(k)<0)siteOrder.push(k); });

  var listHtml='';
  siteOrder.forEach(function(sid){
    var site=S.sites.find(function(s){return s.id===sid;});
    var sname=site?site.name:sid;
    var scolor=site?site.color:'#555';
    var cnt=bysite[sid].length;
    var isOpen=_viCollapsed[sid]!==true;
    listHtml+='<div class="vi-sb-site-sec">'+
      '<div class="vi-sb-site-toggle" onclick="_viToggleSite(\''+sid+'\')" style="border-left:3px solid '+scolor+'">'+
        '<span class="vi-sb-site-arr'+(isOpen?' open':'')+'">▶</span>'+
        '<span class="vi-sb-site-name">'+_esc(sname)+'</span>'+
        '<span class="vi-sb-site-cnt">'+cnt+'</span>'+
      '</div>'+
      (isOpen?'<div class="vi-sb-equip-list">'+
        bysite[sid].map(function(e){
          var sel=e.id===_visionSelId?' sel':'';
          return '<div class="vi-sb-eq-item'+sel+'" onclick="openVisionDetail(\''+e.id+'\')">'+
            '<span class="vi-sb-eq-name">'+_esc(_viEquipLabel(e))+'</span>'+
          '</div>';
        }).join('')+
      '</div>':'')+'</div>';
  });

  if(!equips.length){
    listHtml='<div style="padding:20px 10px;text-align:center;color:#444;font-size:11px">'+
      (_visionFilterType!=='all'?'필터 결과 없음':'등록된 설비가 없습니다')+'</div>';
  }

  sb.innerHTML=typeBar+
    '<div class="vi-sb-body" style="flex:1;overflow-y:auto">'+listHtml+'</div>'+
    '<div class="vi-sb-foot">'+
      '<button class="btn pri" onclick="openAddVisionEquip()" style="width:100%;font-size:11px">+ 설비 추가</button>'+
    '</div>';
}

function _viToggleSite(sid){ _viCollapsed[sid]=!_viCollapsed[sid]; renderVisionSidebar(); }
function setVisionFilterType(t){ _visionFilterType=t; renderVisionTab(); }

/* ══════════════════════════════════════════
   메인 영역 분기
══════════════════════════════════════════ */
function renderVisionMain(){
  var main=document.getElementById('visionMain');
  if(!main)return;
  main.style.overflow='hidden'; main.style.display='flex'; main.style.flexDirection='column';
  if(_visionView==='detail') _renderDetailView(main);
  else _renderGridView(main);
}

/* ══════════════════════════════════════════
   그리드 뷰
══════════════════════════════════════════ */
function _renderGridView(main){
  /* ── 필터된 설비 ── */
  var equips=(S.visionEquips||[]).filter(function(e){
    if(_visionFilterType==='all')return true;
    var t=e.data&&e.data['vi_type']; var types=Array.isArray(t)?t:(t?[t]:[]);
    return types.indexOf(_visionFilterType)>=0;
  });

  /* ── 사이트 그룹 ── */
  var bysite={}; var siteOrder=[];
  equips.forEach(function(e){
    var sid=e.siteId||'기타';
    if(!bysite[sid]){bysite[sid]=[]; siteOrder.push(sid);}
    bysite[sid].push(e);
  });
  var orderedSites=S.sites.map(function(s){return s.id;}).filter(function(id){return bysite[id];});
  siteOrder.forEach(function(k){if(orderedSites.indexOf(k)<0)orderedSites.push(k);});

  /* ── Vision Types 수집 (템플릿 순서 기준) ── */
  var typeItem=_findItemById('vi_type');
  var allTypes=typeItem?(typeItem.options||[]):[];
  var typeSet={}; var typeOrder=[];
  allTypes.forEach(function(t){
    var found=false;
    equips.forEach(function(e){
      var et=e.data&&e.data['vi_type']; var ts=Array.isArray(et)?et:(et?[et]:[]);
      if(ts.indexOf(t)>=0)found=true;
    });
    if(found&&!typeSet[t]){typeSet[t]=true;typeOrder.push(t);}
  });
  equips.forEach(function(e){
    var et=e.data&&e.data['vi_type']; var ts=Array.isArray(et)?et:(et?[et]:[]);
    ts.forEach(function(t){if(!typeSet[t]){typeSet[t]=true;typeOrder.push(t);}});
  });

  /* ── 타입별 최대 수량 계산 ── */
  var maxCam={}; var maxIllum={}; var maxPc={}; var maxTrig=0;
  typeOrder.forEach(function(t){maxCam[t]=0;maxIllum[t]=0;maxPc[t]=0;});
  equips.forEach(function(e){
    var d=e.data||{};
    if(d.vi_cameras&&typeof d.vi_cameras==='object'){
      Object.keys(d.vi_cameras).forEach(function(t){if(Array.isArray(d.vi_cameras[t]))maxCam[t]=Math.max(maxCam[t]||0,d.vi_cameras[t].length);});
    }
    if(d.vi_illumination&&typeof d.vi_illumination==='object'){
      Object.keys(d.vi_illumination).forEach(function(t){if(Array.isArray(d.vi_illumination[t]))maxIllum[t]=Math.max(maxIllum[t]||0,d.vi_illumination[t].length);});
    }
    if(Array.isArray(d.vi_board_trig))maxTrig=Math.max(maxTrig,d.vi_board_trig.length);
    if(d.vi_pc&&typeof d.vi_pc==='object'){
      Object.keys(d.vi_pc).forEach(function(t){if(Array.isArray(d.vi_pc[t]))maxPc[t]=Math.max(maxPc[t]||0,d.vi_pc[t].length);});
    }
  });

  /* ── 동적 컬럼 정의 ── */
  var colDefs=[];
  typeOrder.forEach(function(t){
    var mc=maxCam[t]||0;
    for(var i=0;i<mc;i++){
      var gl='Camera\n'+t; var gc='#1a3358';
      colDefs.push({g:'cam',gLabel:gl,gColor:gc,typeName:t,idx:i,field:'model',label:'Cam'+(i+1)+' 모델'});
      colDefs.push({g:'cam',gLabel:gl,gColor:gc,typeName:t,idx:i,field:'sn',   label:'Cam'+(i+1)+' S/N'});
    }
  });
  typeOrder.forEach(function(t){
    var mi=maxIllum[t]||0;
    for(var i=0;i<mi;i++){
      var gl='Illumination\n'+t; var gc='#1a3320';
      colDefs.push({g:'illum',gLabel:gl,gColor:gc,typeName:t,idx:i,field:'model',label:'조명'+(i+1)+' 모델'});
      colDefs.push({g:'illum',gLabel:gl,gColor:gc,typeName:t,idx:i,field:'sn',   label:'조명'+(i+1)+' S/N'});
    }
  });
  if(maxTrig>0){
    for(var ti2=0;ti2<maxTrig;ti2++){
      var gl2='Trigger Board'; var gc2='#332010';
      colDefs.push({g:'board',gLabel:gl2,gColor:gc2,idx:ti2,field:'model',label:(ti2+1)+' 모델'});
      colDefs.push({g:'board',gLabel:gl2,gColor:gc2,idx:ti2,field:'board',label:(ti2+1)+' Board'});
      colDefs.push({g:'board',gLabel:gl2,gColor:gc2,idx:ti2,field:'fw',   label:(ti2+1)+' FW'});
    }
  }
  typeOrder.forEach(function(t){
    var mp=maxPc[t]||0;
    for(var pi=0;pi<mp;pi++){
      var gl3='PC\n'+t; var gc3='#201a38';
      var pn='PC'+(pi+1)+' ';
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'name',   label:pn+'이름'});
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'cpu',    label:'CPU'});
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'ram',    label:'RAM'});
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'program',label:'Program'});
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'os',     label:'OS'});
      colDefs.push({g:'pc',gLabel:gl3,gColor:gc3,typeName:t,pcIdx:pi,field:'license',label:'License'});
    }
  });

  /* ── 그룹 span 계산 ── */
  var grpSpans=[]; var prevGLabel=null;
  colDefs.forEach(function(c){
    if(c.gLabel===prevGLabel){grpSpans[grpSpans.length-1].span++;}
    else{grpSpans.push({label:c.gLabel,color:c.gColor||'',span:1});prevGLabel=c.gLabel;}
  });

  /* ── 헤더 2단 ── */
  var colSite=90,colLine=80,colUnit=140;
  var hdr1='<tr>'+
    '<th class="vi-th fix-col" rowspan="2" style="left:0;min-width:'+colSite+'px">사이트</th>'+
    '<th class="vi-th fix-col" rowspan="2" style="left:'+colSite+'px;min-width:'+colLine+'px">라인</th>'+
    '<th class="vi-th fix-col" rowspan="2" style="left:'+(colSite+colLine)+'px;min-width:'+colUnit+'px">호기 / Type</th>'+
    '<th class="vi-th" rowspan="2" style="min-width:80px">S/N</th>'+
    '<th class="vi-th" rowspan="2" style="min-width:75px;font-size:10px">최종변경</th>'+
    grpSpans.map(function(g){
      return '<th class="vi-th vi-th-grp" colspan="'+g.span+'" style="'+(g.color?'background:'+g.color+';':'')+'white-space:pre-line;font-size:10px">'+_esc(g.label)+'</th>';
    }).join('')+
  '</tr>';
  var hdr2='<tr>'+
    colDefs.map(function(c){
      return '<th class="vi-th" style="min-width:88px;font-size:10px;font-weight:400">'+_esc(c.label)+'</th>';
    }).join('')+
  '</tr>';

  /* ── 데이터 행 ── */
  var totalCols=5+colDefs.length;
  var bodyHtml='';
  if(!equips.length){
    bodyHtml='<tr><td colspan="'+totalCols+'" class="vi-grid-empty">등록된 설비가 없습니다<br><span style="font-size:11px;color:var(--tx-dim)">좌측 "+ 설비 추가"로 시작하세요</span></td></tr>';
  } else {
    orderedSites.forEach(function(sid){
      var site=S.sites.find(function(s){return s.id===sid;});
      var sname=site?site.name:sid; var scolor=site?site.color:'#555';
      bodyHtml+='<tr class="vi-site-grp-row"><td colspan="'+totalCols+'" style="color:'+scolor+';border-left:3px solid '+scolor+'">'+_esc(sname)+' ('+bysite[sid].length+')</td></tr>';
      bysite[sid].forEach(function(e){
        var d=e.data||{};
        var line=_esc(d['vi_line']||'');
        var unit=_esc(d['vi_unit']||'');
        var sn=_esc(d['vi_sn']||'');
        var typeVal=d['vi_type'];
        var typeBadges=_viTypeBadges(typeVal);
        var updTip=e.updatedAt?'최종 변경: '+e.updatedAt:'변경 이력 없음';
        bodyHtml+='<tr class="vi-grid-row" onclick="openVisionDetail(\''+e.id+'\')" title="'+_esc(updTip)+'">'+
          '<td class="vi-td fix-col" style="left:0;min-width:'+colSite+'px">'+_esc(sname)+'</td>'+
          '<td class="vi-td fix-col" style="left:'+colSite+'px;min-width:'+colLine+'px">'+line+'</td>'+
          '<td class="vi-td fix-col" style="left:'+(colSite+colLine)+'px;min-width:'+colUnit+'px">'+
            (typeBadges?typeBadges+' ':'')+unit+'</td>'+
          '<td class="vi-td" style="min-width:80px;white-space:nowrap">'+sn+'</td>'+
          '<td class="vi-td" style="min-width:75px;white-space:nowrap;font-size:10px;color:var(--tx-dim)">'+_esc(e.updatedAt||'')+'</td>'+
          colDefs.map(function(c){return '<td class="vi-td" style="min-width:88px;white-space:nowrap">'+_esc(_getDetailedCellValue(d,c))+'</td>';}).join('')+
        '</tr>';
      });
    });
  }

  main.innerHTML='<div class="vi-grid-wrap"><table class="vi-grid"><thead>'+hdr1+hdr2+'</thead><tbody>'+bodyHtml+'</tbody></table></div>';
}

function _getDetailedCellValue(d,c){
  try{
    switch(c.g){
      case 'cam':{
        var arr=d.vi_cameras; if(!arr||typeof arr!=='object')return '';
        var ents=arr[c.typeName]; if(!Array.isArray(ents)||ents.length<=c.idx)return '';
        return ents[c.idx][c.field]||'';
      }
      case 'illum':{
        var arr2=d.vi_illumination; if(!arr2||typeof arr2!=='object')return '';
        var ents2=arr2[c.typeName]; if(!Array.isArray(ents2)||ents2.length<=c.idx)return '';
        return ents2[c.idx][c.field]||'';
      }
      case 'board':{
        var trig=d.vi_board_trig; if(!Array.isArray(trig)||trig.length<=c.idx)return '';
        return trig[c.idx][c.field]||'';
      }
      case 'pc':{
        var pcd=d.vi_pc; if(!pcd||typeof pcd!=='object')return '';
        var pes=pcd[c.typeName]; if(!Array.isArray(pes)||pes.length<=c.pcIdx)return '';
        var pc=pes[c.pcIdx]; if(!pc)return '';
        switch(c.field){
          case 'name': return pc.name||'';
          case 'cpu':  return pc.cpu?(pc.cpu.spec||''):'';
          case 'ram':
            if(!Array.isArray(pc.ram)||!pc.ram.length)return '';
            return pc.ram.map(function(r){return r.capacity+(r.qty?'×'+r.qty:'');}).join(', ');
          case 'program':
            if(!Array.isArray(pc.program)||!pc.program.length)return '';
            return pc.program.map(function(p){return p.name+(p.version?' '+p.version:'');}).join('; ');
          case 'os':      return pc.os||'';
          case 'license': return pc.license||'';
          default: return '';
        }
      }
      default: return '';
    }
  }catch(ex){return '';}
}

function _viGridCellValue(equip, item){
  var val=(equip.data||{})[item.id];
  if(val===undefined||val===null||val==='')return '';
  switch(item.type){
    case 'multiselect': return Array.isArray(val)?val.join(', '):(val||'');
    case 'type-camera':{
      if(!val||typeof val!=='object'||Array.isArray(val))return '';
      var total=0;Object.keys(val).forEach(function(k){if(Array.isArray(val[k]))total+=val[k].length;});
      return total?total+'대':'';
    }
    case 'type-illum':{
      if(!val||typeof val!=='object'||Array.isArray(val))return '';
      var total2=0;Object.keys(val).forEach(function(k){if(Array.isArray(val[k]))total2+=val[k].length;});
      return total2?total2+'개':'';
    }
    case 'type-program':{
      if(!val||typeof val!=='object'||Array.isArray(val))return '';
      var total3=0;Object.keys(val).forEach(function(k){if(Array.isArray(val[k]))total3+=val[k].length;});
      return total3?total3+'개':'';
    }
    case 'type-pc':{
      if(!val||typeof val!=='object'||Array.isArray(val))return '';
      var total4=0; var ramParts=[];
      Object.keys(val).forEach(function(k){
        if(!Array.isArray(val[k]))return;
        total4+=val[k].length;
        val[k].forEach(function(pc){
          if(pc.name) return; // skip name-only check
          if(pc.ram&&pc.ram.length){
            pc.ram.forEach(function(r){
              if(r.capacity&&r.qty) ramParts.push(r.capacity.replace(/^.*?([\d]+GB).*/i,'$1')+'×'+r.qty);
            });
          }
        });
      });
      var s=total4?total4+'대':'';
      if(ramParts.length) s+=' / RAM: '+ramParts.join(', ');
      return s;
    }
    case 'board-multi':
      if(!Array.isArray(val)||!val.length)return '';
      return val.length+'개';
    case 'camera-multi':
      if(!Array.isArray(val)||!val.length)return '';
      var totalCams=val.reduce(function(s,c){return s+(parseInt(c.count)||0);},0);
      return val.length+'종 / '+totalCams+'대';
    case 'spec-qty':
      if(typeof val==='object') return [val.spec,val.qty?'×'+val.qty:''].filter(Boolean).join(' ');
      return String(val);
    case 'ssd-multi':
      if(!Array.isArray(val)||!val.length)return '';
      return val.filter(function(r){return r.capacity;}).map(function(r){
        return r.capacity+(r.qty?'×'+r.qty:'');
      }).join(', ');
    case 'lancard-multi':
      if(!Array.isArray(val)||!val.length)return '';
      return val.filter(function(r){return r.speed;}).map(function(r){
        return r.speed+(r.ports?'×'+r.ports:'');
      }).join(', ');
    default: return String(val);
  }
}

/* ══════════════════════════════════════════
   상세 뷰
══════════════════════════════════════════ */
function openVisionDetail(id){
  _visionSelId=id; _visionView='detail';
  renderVisionSidebar(); renderVisionMain();
}
function backToVisionGrid(){
  _visionView='grid';
  renderVisionMain();
}

function _renderDetailView(main){
  var equip=S.visionEquips.find(function(e){return e.id===_visionSelId;});
  if(!equip){ _visionView='grid'; _renderGridView(main); return; }
  main.innerHTML=
    '<div class="vi-detail-toolbar" style="flex-shrink:0;display:flex;align-items:center;gap:6px;padding:8px 14px;border-bottom:1px solid var(--bd-light);background:var(--bg-panel)">'+
      '<button class="btn" onclick="backToVisionGrid()">← 목록으로</button>'+
      '<span style="font-size:12px;font-weight:600;flex:1">'+_esc(_viEquipLabel(equip))+'</span>'+
      (equip.updatedAt?'<span class="vi-updated-dt" style="font-size:10px;color:var(--tx-dim);white-space:nowrap">최종 변경: <strong style="color:var(--tx-sub)">'+_esc(equip.updatedAt)+'</strong></span>':'')+
      '<button class="btn pri" onclick="saveVisionEquipData()">저장</button>'+
      '<button class="btn" onclick="copyVisionEquip(\''+equip.id+'\')" title="복사">복사</button>'+
      '<button class="btn red" onclick="delVisionEquip(\''+equip.id+'\')">삭제</button>'+
    '</div>'+
    '<div class="vi-main-inner'+(_visionEditMode?' vi-tpl-on':'')+'" id="visionFormWrap" style="flex:1;overflow-y:auto;padding:16px 20px">'+
      _renderVisionEquipForm(equip)+
    '</div>'+
    '<div class="vi-footer">'+
      '<span style="font-size:10px;color:var(--tx-dim)" id="viSaveTs">'+
        (equip.updatedAt?'저장됨: '+equip.updatedAt:'')+
      '</span>'+
    '</div>';
}

/* ── 상세 폼 렌더 ── */
function _renderVisionEquipForm(equip){
  var data=equip.data||{};
  var typeVal=data['vi_type'];
  _viCurrentTypes=Array.isArray(typeVal)?typeVal:(typeVal?[typeVal]:[]);
  var html='<div class="vi-equip-hdr">'+
    '<div style="flex:1;font-size:13px;font-weight:600">'+_viTypeBadges(typeVal)+' '+_esc(_viEquipLabel(equip))+'</div>'+
    '</div>';
  (S.visionTemplate.categories||[]).forEach(function(cat,ci){
    html+=_renderViCategory(cat,data,ci);
  });
  if(_visionEditMode) html+='<button class="vi-tpl-add-btn" onclick="openAddVisionCategory()">+ 카테고리 추가</button>';
  return html;
}

function _renderViCategory(cat,data,ci){
  var hasGroups=!!(cat.groups&&cat.groups.length>0);
  var bodyHtml='';
  if(hasGroups){
    cat.groups.forEach(function(grp,gi){ bodyHtml+=_renderViGroup(cat,grp,data,ci,gi); });
    if(_visionEditMode) bodyHtml+='<button class="vi-tpl-add-btn" onclick="openAddVisionGroup(\''+cat.id+'\')">+ 그룹 추가</button>';
  } else {
    (cat.items||[]).forEach(function(item,ii){ bodyHtml+=_renderViItemRow(cat.id,null,item,data,ci,-1,ii); });
    if(_visionEditMode) bodyHtml+='<button class="vi-tpl-add-btn" onclick="openAddVisionItem(\''+cat.id+'\',\'\')">+ 항목 추가</button>';
  }
  var ctrlHtml='<div class="vi-cat-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViCategory('+ci+',-1)">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViCategory('+ci+',1)">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openRenameViCategory(\''+cat.id+'\')">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViCategory(\''+cat.id+'\')">✕</button></div>';
  return '<div class="vi-cat" id="vicat_'+cat.id+'">'+
    '<div class="vi-cat-hdr" onclick="_toggleViCat(\''+cat.id+'\')">'+
      '<span class="vi-cat-arrow open" id="vicat_arr_'+cat.id+'">▶</span>'+
      '<span class="vi-cat-name">'+_esc(cat.name)+'</span>'+ctrlHtml+
    '</div>'+
    '<div class="vi-cat-body" id="vicat_body_'+cat.id+'">'+bodyHtml+'</div></div>';
}

function _renderViGroup(cat,grp,data,ci,gi){
  var items=grp.items||[];
  var itemsHtml=items.map(function(item,ii){ return _renderViItemRow(cat.id,grp.id,item,data,ci,gi,ii); }).join('');
  if(_visionEditMode) itemsHtml+='<button class="vi-tpl-add-btn" onclick="openAddVisionItem(\''+cat.id+'\',\''+grp.id+'\')">+ 항목 추가</button>';
  var ctrlHtml='<div class="vi-grp-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViGroup(\''+cat.id+'\','+gi+',-1)">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViGroup(\''+cat.id+'\','+gi+',1)">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openRenameViGroup(\''+cat.id+'\',\''+grp.id+'\')">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViGroup(\''+cat.id+'\',\''+grp.id+'\')">✕</button></div>';
  return '<div class="vi-grp" id="vigrp_'+grp.id+'">'+
    '<div class="vi-grp-hdr" onclick="_toggleViGrp(\''+grp.id+'\')">'+
      '<span class="vi-grp-arrow open" id="vigrp_arr_'+grp.id+'">▶</span>'+
      '<span class="vi-grp-name">'+_esc(grp.name)+'</span>'+ctrlHtml+
    '</div>'+
    '<div class="vi-grp-body" id="vigrp_body_'+grp.id+'">'+itemsHtml+'</div></div>';
}

function _renderViItemRow(catId,grpId,item,data,ci,gi,ii){
  var val=data[item.id]!==undefined?data[item.id]:'';
  var grpArg=grpId?'\''+grpId+'\'':'\'\'';
  var ctrlHtml='<div class="vi-item-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViItem(\''+catId+'\','+grpArg+',\''+item.id+'\',-1)">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViItem(\''+catId+'\','+grpArg+',\''+item.id+'\',1)">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openEditViItem(\''+catId+'\','+grpArg+',\''+item.id+'\')">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViItem(\''+catId+'\','+grpArg+',\''+item.id+'\')">✕</button></div>';
  return '<div class="vi-item-row">'+
    '<div class="vi-item-label">'+_esc(item.name)+'</div>'+
    '<div class="vi-item-input">'+_renderViInput(item,val)+'</div>'+
    ctrlHtml+'</div>';
}

/* ── 입력 타입 렌더 ── */
function _renderViInput(item,val){
  var id='viinp_'+item.id;
  if(item.id==='vi_type') return _renderViTypeManager(item,val,id);
  switch(item.type){
    case 'multiselect': return _renderViMultisel(item,val,id);
    case 'type-camera': return _renderViTypeCamera(item,val,id);
    case 'type-illum': return _renderViTypeIllum(item,val,id);
    case 'type-program': return _renderViTypeProgram(item,val,id);
    case 'type-pc': return _renderViTypePc(item,val,id);
    case 'board-multi': return _renderViBoardMulti(item,val,id);
    case 'camera-multi': return _renderViCameraMulti(item,val,id);
    case 'spec-qty': return _renderViSpecQty(item,val,id);
    case 'ssd-multi': return _renderViSsdMulti(item,val,id);
    case 'lancard-multi': return _renderViLancardMulti(item,val,id);
    case 'textarea': return '<textarea id="'+id+'" class="vi-notes-area" rows="4" placeholder="특이사항 입력...">'+_esc(String(val||''))+'</textarea>';
    default: return '<input type="text" id="'+id+'" value="'+_esc(String(val||''))+'" placeholder="입력...">';
  }
}

function _renderViMultisel(item,val,id){
  var selected=Array.isArray(val)?val:(val?[val]:[]);
  var opts=(item.options||[]).map(function(o){
    var chk=selected.indexOf(o)>=0?' checked':'';
    var delBtn=_visionEditMode?'<button class="vi-sel-opt-del" onclick="delSelectOption(\''+item.id+'\',\''+_esc(o)+'\')" title="옵션 삭제">×</button>':'';
    return '<label style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap">'+
      '<input type="checkbox" class="vi-ms-chk" value="'+_esc(o)+'"'+chk+'>'+_esc(o)+delBtn+'</label>';
  }).join('');
  var addBtn=_visionEditMode?'<button class="vi-ctrl-btn" onclick="openAddSelectOption(\''+item.id+'\')" style="border:1px dashed #3a3a5a;padding:3px 6px;font-size:10px">+ 옵션</button>':'';
  return '<div class="vi-multisel" id="'+id+'">'+opts+(addBtn?'<span style="display:inline-flex;align-items:center">'+addBtn+'</span>':'')+'</div>';
}

/* ══════════════════════════════════════════
   Vision Type 관리 (기본정보 > Type)
══════════════════════════════════════════ */
function _renderViTypeManager(item,val,id){
  var selected=Array.isArray(val)?val:(val?[val]:[]);
  var opts=item.options||[];
  var optsHtml=opts.map(function(o,oi){
    var chk=selected.indexOf(o)>=0?' checked':'';
    var color=_viTypeColor(o);
    var oEsc=o.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div class="vi-type-mgr-row">'+
      '<label class="vi-type-mgr-chk-lbl">'+
        '<input type="checkbox" class="vi-ms-chk" value="'+_esc(o)+'"'+chk+' onchange="_viTypeManagerChange()">'+
        '<span class="vi-type-badge" style="background:'+color+'">'+_esc(o)+'</span>'+
      '</label>'+
      '<button class="vi-type-mgr-btn" onclick="_openEditViType(\''+item.id+'\','+oi+')" title="수정">✏</button>'+
      '<button class="vi-type-mgr-btn del" onclick="_doDelViType(\''+item.id+'\',\''+oEsc+'\')" title="삭제">✕</button>'+
    '</div>';
  }).join('');
  return '<div class="vi-type-manager" id="'+id+'">'+
    optsHtml+
    '<div class="vi-type-mgr-add">'+
      '<input type="text" id="vi_type_new_inp" class="vi-type-mgr-inp" placeholder="새 Vision Type 입력">'+
      '<button class="vi-type-mgr-add-btn" onclick="_doAddViType(\''+item.id+'\')">+ 추가</button>'+
    '</div>'+
  '</div>';
}

function _doAddViType(itemId){
  var inp=document.getElementById('vi_type_new_inp'); if(!inp)return;
  var val=inp.value.trim(); if(!val){alert('Type명을 입력해주세요.');return;}
  var item=_findItemById(itemId); if(!item)return;
  if(!item.options)item.options=[];
  if(item.options.indexOf(val)>=0){alert('이미 존재하는 Type입니다.');return;}
  item.options.push(val);
  saveData(); renderVisionMain();
}

function _openEditViType(itemId,optIdx){
  var item=_findItemById(itemId); if(!item||!item.options)return;
  var oldVal=item.options[optIdx]; if(oldVal===undefined)return;
  mw('<div class="mtit">Vision Type 수정</div>'+
    '<div class="fg"><label class="fl">Type명</label><input type="text" id="vi_type_edit_inp" value="'+_esc(oldVal)+'"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button>'+
    '<button class="btn sm pri" onclick="_doEditViType(\''+itemId+'\','+optIdx+')">저장</button></div>');
}

function _doEditViType(itemId,optIdx){
  var item=_findItemById(itemId); if(!item||!item.options)return;
  var oldVal=item.options[optIdx];
  var inp=document.getElementById('vi_type_edit_inp'); if(!inp)return;
  var newVal=inp.value.trim(); if(!newVal){alert('Type명을 입력해주세요.');return;}
  if(newVal!==oldVal&&item.options.indexOf(newVal)>=0){alert('이미 존재하는 Type입니다.');return;}
  item.options[optIdx]=newVal;
  (S.visionEquips||[]).forEach(function(e){
    if(!e.data)return;
    var t=e.data['vi_type'];
    if(Array.isArray(t)){var i=t.indexOf(oldVal);if(i>=0)t[i]=newVal;}
    else if(t===oldVal){e.data['vi_type']=newVal;}
    if(e.data['vi_cameras']&&typeof e.data['vi_cameras']==='object'&&!Array.isArray(e.data['vi_cameras'])){
      if(e.data['vi_cameras'][oldVal]!==undefined){e.data['vi_cameras'][newVal]=e.data['vi_cameras'][oldVal];delete e.data['vi_cameras'][oldVal];}
    }
    if(e.data['vi_illumination']&&typeof e.data['vi_illumination']==='object'&&!Array.isArray(e.data['vi_illumination'])){
      if(e.data['vi_illumination'][oldVal]!==undefined){e.data['vi_illumination'][newVal]=e.data['vi_illumination'][oldVal];delete e.data['vi_illumination'][oldVal];}
    }
  });
  saveData(); cm(); renderVisionMain();
}

function _doDelViType(itemId,optVal){
  if(!confirm('['+optVal+'] Type을 삭제하시겠습니까?\n기존 설비에서 이 Type 선택이 해제됩니다.'))return;
  var item=_findItemById(itemId); if(!item||!item.options)return;
  item.options=item.options.filter(function(o){return o!==optVal;});
  (S.visionEquips||[]).forEach(function(e){
    if(!e.data)return;
    var t=e.data['vi_type'];
    if(Array.isArray(t)){e.data['vi_type']=t.filter(function(x){return x!==optVal;});}
    else if(t===optVal){e.data['vi_type']=[];}
  });
  saveData(); renderVisionMain();
}

/* Type 체크박스 변경 시 Camera/Illumination 섹션 실시간 업데이트 */
function _viTypeManagerChange(){
  var wrap=document.getElementById('viinp_vi_type'); if(!wrap)return;
  var chks=wrap.querySelectorAll('.vi-ms-chk:checked');
  _viCurrentTypes=Array.prototype.map.call(chks,function(c){return c.value;});
  var camItem=_findItemById('vi_cameras');
  if(camItem){
    var camWrap=document.getElementById('viinp_vi_cameras');
    if(camWrap){
      var camData=_collectViTypeCamFromDom(camWrap);
      var tmp=document.createElement('div');
      tmp.innerHTML=_renderViTypeCamera(camItem,camData,'viinp_vi_cameras');
      camWrap.parentNode.replaceChild(tmp.firstChild,camWrap);
    }
  }
  var illumItem=_findItemById('vi_illumination');
  if(illumItem){
    var illumWrap=document.getElementById('viinp_vi_illumination');
    if(illumWrap){
      var illumData=_collectViTypeIllumFromDom(illumWrap);
      var tmp2=document.createElement('div');
      tmp2.innerHTML=_renderViTypeIllum(illumItem,illumData,'viinp_vi_illumination');
      illumWrap.parentNode.replaceChild(tmp2.firstChild,illumWrap);
    }
  }
  var progItem=_findItemById('vi_program');
  if(progItem){
    var progWrap=document.getElementById('viinp_vi_program');
    if(progWrap){
      var progData=_collectViTypeProgFromDom(progWrap);
      var tmp3=document.createElement('div');
      tmp3.innerHTML=_renderViTypeProgram(progItem,progData,'viinp_vi_program');
      progWrap.parentNode.replaceChild(tmp3.firstChild,progWrap);
    }
  }
  var pcItem=_findItemById('vi_pc');
  if(pcItem){
    var pcWrap=document.getElementById('viinp_vi_pc');
    if(pcWrap){
      var pcData=_collectViTypePcFromDom(pcWrap);
      var tmp4=document.createElement('div');
      tmp4.innerHTML=_renderViTypePc(pcItem,pcData,'viinp_vi_pc');
      pcWrap.parentNode.replaceChild(tmp4.firstChild,pcWrap);
    }
  }
}

function _collectViTypeCamFromDom(wrap){
  var result={};
  var secs=wrap.querySelectorAll('.vi-type-cam-sec');
  Array.prototype.forEach.call(secs,function(sec){
    var t=sec.getAttribute('data-type'); if(!t)return;
    var entries=sec.querySelectorAll('.vi-type-cam-entry');
    result[t]=Array.prototype.map.call(entries,function(el){
      var m=el.querySelector('.vi-type-cam-model');
      var s=el.querySelector('.vi-type-cam-sn');
      return {model:m?m.value:'',sn:s?s.value:''};
    });
  });
  return result;
}

function _collectViTypeIllumFromDom(wrap){
  var result={};
  var secs=wrap.querySelectorAll('.vi-type-illum-sec');
  Array.prototype.forEach.call(secs,function(sec){
    var t=sec.getAttribute('data-type'); if(!t)return;
    var entries=sec.querySelectorAll('.vi-type-illum-entry');
    result[t]=Array.prototype.map.call(entries,function(el){
      var m=el.querySelector('.vi-type-illum-model');
      var s=el.querySelector('.vi-type-illum-sn');
      return {model:m?m.value:'',sn:s?s.value:''};
    });
  });
  return result;
}

/* ══════════════════════════════════════════
   type-pc 렌더 (Vision Type별 PC 수량 관리)
══════════════════════════════════════════ */
function _renderViTypePc(item,val,id){
  var obj=(val&&typeof val==='object'&&!Array.isArray(val))?val:{};
  if(!_viCurrentTypes||!_viCurrentTypes.length){
    return '<div class="vi-type-empty" id="'+id+'">기본정보에서 Vision Type을 선택하면 PC 항목이 표시됩니다.</div>';
  }
  var html='<div class="vi-type-pc" id="'+id+'">';
  _viCurrentTypes.forEach(function(t,ti){
    var entries=Array.isArray(obj[t])?obj[t]:[];
    var count=entries.length;
    var color=_viTypeColor(t);
    var sectionId=id+'_t'+ti;
    html+='<div class="vi-type-pc-sec" data-type="'+_esc(t)+'" data-idx="'+ti+'">'+
      '<div class="vi-type-pc-sec-hdr" style="border-left:3px solid '+color+';color:'+color+'">'+_esc(t)+'</div>'+
      '<div class="vi-type-pc-count-row">'+
        '<label>PC 수량</label>'+
        '<input type="number" class="vi-type-pc-count qty-inp" min="0" max="10" value="'+count+'" '+
          'oninput="_viTypePcCountChange(\''+id+'\','+ti+',this.value)">'+
        '<span class="qty-lbl">대</span>'+
      '</div>'+
      '<div class="vi-type-pc-entries" id="'+sectionId+'_entries">';
    for(var i=0;i<count;i++){
      html+=_renderViPcEntry(id,ti,i,entries[i]||{});
    }
    html+='</div></div>';
  });
  html+='</div>';
  return html;
}

function _renderViPcEntry(baseId,ti,pi,e){
  e=e||{};
  var cpu=e.cpu||{spec:'',qty:''};
  var mb=e.mainboard||{spec:'',qty:''};
  var eid=baseId+'_t'+ti+'_pc'+pi;
  return '<div class="vi-type-pc-entry" id="'+_esc(eid)+'">'+
    '<div class="vi-type-pc-entry-hdr">'+
      '<span class="vi-pc-entry-num">PC '+(pi+1)+'</span>'+
      '<input type="text" class="vi-pc-name-inp" value="'+_esc(e.name||'')+'" placeholder="이름 (예: Host, Vision)">'+
    '</div>'+
    '<div class="vi-type-pc-entry-body">'+
      _viPcSpecRow('CPU','vi-pc-cpu-spec','vi-pc-cpu-qty',cpu.spec,cpu.qty,'')+
      _viPcSpecRow('MAIN BOARD','vi-pc-mb-spec','vi-pc-mb-qty',mb.spec,mb.qty,'')+
      _viPcSubSec(eid,'ram','RAM',Array.isArray(e.ram)?e.ram:[])+
      _viPcSubSec(eid,'ssd','SSD',e.ssd||[])+
      _viPcSubSec(eid,'hdd','HDD',e.hdd||[])+
      _viPcSubSec(eid,'lancard','LANCARD',e.lancard||[])+
      _viPcSubSec(eid,'fg','FRAME GRABBER',e.fg||[])+
      _viPcSubSec(eid,'sync','SYNC BOARD',e.sync||[])+
      _viPcSubSec(eid,'program','PROGRAM',e.program||[])+
      _viPcSpecRowText('OS','vi-pc-os',e.os||'')+
      _viPcSpecRowText('LICENSE','vi-pc-license',e.license||'')+
    '</div></div>';
}

function _viPcSpecRow(lbl,specCls,qtyCls,specVal,qtyVal,ph){
  return '<div class="vi-pc-spec-row">'+
    '<span class="vi-pc-f-lbl">'+_esc(lbl)+'</span>'+
    '<input type="text" class="'+specCls+' spec-inp" value="'+_esc(specVal||'')+'"'+(ph?' placeholder="'+_esc(ph)+'"':'')+'>'+
    '<input type="number" class="'+qtyCls+' qty-inp" value="'+_esc(String(qtyVal||''))+'" min="0">'+
    '<span class="qty-lbl">EA</span>'+
  '</div>';
}

function _viPcSpecRowText(lbl,cls,val){
  return '<div class="vi-pc-spec-row">'+
    '<span class="vi-pc-f-lbl">'+_esc(lbl)+'</span>'+
    '<input type="text" class="'+cls+' spec-inp" value="'+_esc(val||'')+'">'+
  '</div>';
}

function _viPcSubSec(eid,sub,label,rows){
  var tEsc=eid.replace(/'/g,"\\'");
  var rowsHtml=rows.map(function(r){
    return '<div class="vi-pc-sub-row">'+_viPcSubRowFields(sub,r)+'</div>';
  }).join('');
  return '<div class="vi-pc-sub-sec">'+
    '<div class="vi-pc-sub-sec-lbl">'+
      '<span>'+_esc(label)+'</span>'+
      '<button class="vi-pc-sub-add" onclick="_viPcSubAdd(\''+_esc(eid)+'_'+sub+'\',\''+sub+'\')">+ 추가</button>'+
    '</div>'+
    '<div class="vi-pc-sub-rows" data-sub="'+sub+'" id="'+_esc(eid)+'_'+sub+'">'+rowsHtml+'</div>'+
  '</div>';
}

function _viPcSubRowFields(sub,r){
  r=r||{};
  var del='<button class="vi-pc-sub-del" onclick="_viPcSubDel(this)">✕</button>';
  switch(sub){
    case 'program':
      return '<input type="text" placeholder="프로그램명" value="'+_esc(r.name||'')+'">'+
        '<input type="text" placeholder="버전 (예: v1.0.0)" value="'+_esc(r.version||'')+'">'+del;
    case 'ram':
      return '<input type="text" placeholder="예: DDR5-4800 16GB" style="flex:2" value="'+_esc(r.capacity||'')+'">'+
        '<input type="number" class="qty-inp" min="0" placeholder="수량(EA)" value="'+_esc(String(r.qty||''))+'">'+del;
    case 'ssd': case 'hdd':
      return '<input type="text" placeholder="예: 1TB" value="'+_esc(r.capacity||'')+'">'+
        '<input type="number" class="qty-inp" min="0" placeholder="수량" value="'+_esc(String(r.qty||''))+'">'+
        '<input type="text" placeholder="C:" value="'+_esc(r.drive||'')+'">'+del;
    case 'lancard':
      return '<input type="text" placeholder="1Gbps" value="'+_esc(r.speed||'')+'">'+
        '<input type="number" class="qty-inp" min="0" placeholder="PORT" value="'+_esc(String(r.ports||''))+'">'+
        '<input type="text" placeholder="목적" value="'+_esc(r.purpose||'')+'">'+del;
    case 'fg':
      return '<input type="text" placeholder="모델명" value="'+_esc(r.model||'')+'">'+
        '<input type="text" placeholder="BOARD 버전" value="'+_esc(r.board||'')+'">'+
        '<input type="text" placeholder="FIRMWARE" value="'+_esc(r.fw||'')+'">'+del;
    case 'sync':
      return '<input type="text" placeholder="버전" value="'+_esc(r.model||'')+'">'+
        '<input type="text" placeholder="BOARD 버전" value="'+_esc(r.board||'')+'">'+
        '<input type="text" placeholder="FIRMWARE" value="'+_esc(r.fw||'')+'">'+del;
    default: return del;
  }
}

function _viTypePcCountChange(id,ti,val){
  var count=Math.max(0,Math.min(10,parseInt(val)||0));
  var container=document.getElementById(id+'_t'+ti+'_entries'); if(!container)return;
  var current=container.querySelectorAll('.vi-type-pc-entry').length;
  while(current>count){container.removeChild(container.lastChild);current--;}
  while(current<count){
    var tmp=document.createElement('div');
    tmp.innerHTML=_renderViPcEntry(id,ti,current,{});
    container.appendChild(tmp.firstChild); current++;
  }
}

function _viPcSubAdd(containerId,subType){
  var container=document.getElementById(containerId); if(!container)return;
  var div=document.createElement('div'); div.className='vi-pc-sub-row';
  div.innerHTML=_viPcSubRowFields(subType,{}); // empty row
  container.appendChild(div);
}

function _viPcSubDel(btn){ var row=btn.parentNode; row.parentNode.removeChild(row); }

function _collectViPcEntry(el){
  function g(cls){var e=el.querySelector('.'+cls);return e?e.value:'';}
  function subRows(dataSub,fields){
    var c=el.querySelector('.vi-pc-sub-rows[data-sub="'+dataSub+'"]'); if(!c)return [];
    return Array.prototype.map.call(c.querySelectorAll('.vi-pc-sub-row'),function(r){
      var inps=r.querySelectorAll('input'); var obj={};
      fields.forEach(function(f,i){obj[f]=inps[i]?inps[i].value:'';});
      return obj;
    });
  }
  return {
    name:g('vi-pc-name-inp'),
    cpu:{spec:g('vi-pc-cpu-spec'),qty:g('vi-pc-cpu-qty')},
    mainboard:{spec:g('vi-pc-mb-spec'),qty:g('vi-pc-mb-qty')},
    ram:subRows('ram',['capacity','qty']),
    ssd:subRows('ssd',['capacity','qty','drive']),
    hdd:subRows('hdd',['capacity','qty','drive']),
    lancard:subRows('lancard',['speed','ports','purpose']),
    fg:subRows('fg',['model','board','fw']),
    sync:subRows('sync',['model','board','fw']),
    program:subRows('program',['name','version']),
    os:g('vi-pc-os'),
    license:g('vi-pc-license')
  };
}

function _collectViTypePcFromDom(wrap){
  var result={};
  var secs=wrap.querySelectorAll('.vi-type-pc-sec');
  Array.prototype.forEach.call(secs,function(sec){
    var t=sec.getAttribute('data-type'); if(!t)return;
    var entries=sec.querySelectorAll('.vi-type-pc-entry');
    result[t]=Array.prototype.map.call(entries,_collectViPcEntry);
  });
  return result;
}

/* ══════════════════════════════════════════
   type-program 렌더 (Type별 프로그램 버전 관리)
══════════════════════════════════════════ */
function _renderViTypeProgram(item,val,id){
  var obj=(val&&typeof val==='object'&&!Array.isArray(val))?val:{};
  if(!_viCurrentTypes||!_viCurrentTypes.length){
    return '<div class="vi-type-empty" id="'+id+'">기본정보에서 Vision Type을 선택하면 Program 항목이 표시됩니다.</div>';
  }
  var html='<div class="vi-type-prog" id="'+id+'">';
  _viCurrentTypes.forEach(function(t,ti){
    var entries=Array.isArray(obj[t])?obj[t]:[];
    var color=_viTypeColor(t);
    var sectionId=id+'_t'+ti;
    html+='<div class="vi-type-prog-sec" data-type="'+_esc(t)+'" data-idx="'+ti+'">'+
      '<div class="vi-type-prog-sec-hdr" style="border-left:3px solid '+color+';color:'+color+'">'+_esc(t)+'</div>'+
      '<div class="vi-type-prog-entries" id="'+sectionId+'_entries">';
    if(entries.length){
      html+='<div class="vi-type-prog-entry-hdr"><span>프로그램명</span><span>버전</span><span></span></div>';
      entries.forEach(function(e){
        html+='<div class="vi-type-prog-entry">'+
          '<input type="text" class="vi-type-prog-name" value="'+_esc(e.name||'')+'" placeholder="프로그램명">'+
          '<input type="text" class="vi-type-prog-ver" value="'+_esc(e.version||'')+'" placeholder="예: v1.0.0">'+
          '<button class="vi-prog-del-btn" onclick="_viTypeProgramDelEntry(this)" title="삭제">✕</button>'+
        '</div>';
      });
    }
    html+='</div>'+
      '<button class="vi-prog-add-btn" onclick="_viTypeProgramAdd(\''+id+'\','+ti+')">+ 프로그램 추가</button>'+
    '</div>';
  });
  html+='</div>';
  return html;
}

function _viTypeProgramAdd(id,ti){
  var container=document.getElementById(id+'_t'+ti+'_entries'); if(!container)return;
  if(!container.querySelector('.vi-type-prog-entry-hdr')){
    var hdr=document.createElement('div'); hdr.className='vi-type-prog-entry-hdr';
    hdr.innerHTML='<span>프로그램명</span><span>버전</span><span></span>';
    container.appendChild(hdr);
  }
  var div=document.createElement('div'); div.className='vi-type-prog-entry';
  div.innerHTML='<input type="text" class="vi-type-prog-name" value="" placeholder="프로그램명">'+
    '<input type="text" class="vi-type-prog-ver" value="" placeholder="예: v1.0.0">'+
    '<button class="vi-prog-del-btn" onclick="_viTypeProgramDelEntry(this)" title="삭제">✕</button>';
  container.appendChild(div);
}

function _viTypeProgramDelEntry(btn){
  var entry=btn.parentNode;
  var container=entry.parentNode;
  container.removeChild(entry);
  if(!container.querySelector('.vi-type-prog-entry')) container.innerHTML='';
}

function _collectViTypeProgFromDom(wrap){
  var result={};
  var secs=wrap.querySelectorAll('.vi-type-prog-sec');
  Array.prototype.forEach.call(secs,function(sec){
    var t=sec.getAttribute('data-type'); if(!t)return;
    var entries=sec.querySelectorAll('.vi-type-prog-entry');
    result[t]=Array.prototype.map.call(entries,function(el){
      var n=el.querySelector('.vi-type-prog-name');
      var v=el.querySelector('.vi-type-prog-ver');
      return {name:n?n.value:'',version:v?v.value:''};
    });
  });
  return result;
}

/* ══════════════════════════════════════════
   type-camera 렌더 (Type별 그룹)
══════════════════════════════════════════ */
function _renderViTypeCamera(item,val,id){
  var obj=(val&&typeof val==='object'&&!Array.isArray(val))?val:{};
  if(!_viCurrentTypes||!_viCurrentTypes.length){
    return '<div class="vi-type-empty" id="'+id+'">기본정보에서 Vision Type을 선택하면 Camera 항목이 표시됩니다.</div>';
  }
  var html='<div class="vi-type-cam" id="'+id+'">';
  _viCurrentTypes.forEach(function(t,ti){
    var entries=Array.isArray(obj[t])?obj[t]:[];
    var count=entries.length;
    var color=_viTypeColor(t);
    var sectionId=id+'_t'+ti;
    html+='<div class="vi-type-cam-sec" data-type="'+_esc(t)+'" data-idx="'+ti+'">'+
      '<div class="vi-type-cam-sec-hdr" style="border-left:3px solid '+color+';color:'+color+'">'+_esc(t)+'</div>'+
      '<div class="vi-type-cam-count-row">'+
        '<label>수량</label>'+
        '<input type="number" class="vi-type-cam-count qty-inp" min="0" max="99" value="'+count+'" '+
          'oninput="_viTypeCamCountChange(\''+id+'\','+ti+',this.value)">'+
        '<span class="qty-lbl">대</span>'+
      '</div>'+
      '<div class="vi-type-cam-entries" id="'+sectionId+'_entries">';
    for(var i=0;i<count;i++){
      var e=entries[i]||{model:'',sn:''};
      html+='<div class="vi-type-cam-entry">'+
        '<span class="vi-type-cam-entry-num">'+(i+1)+'</span>'+
        '<div class="vi-type-cam-entry-fields">'+
          '<div class="vi-type-cam-field"><label>모델명</label><input type="text" class="vi-type-cam-model" value="'+_esc(e.model||'')+'"></div>'+
          '<div class="vi-type-cam-field"><label>S/N</label><input type="text" class="vi-type-cam-sn" value="'+_esc(e.sn||'')+'"></div>'+
        '</div></div>';
    }
    html+='</div></div>';
  });
  html+='</div>';
  return html;
}

function _viTypeCamCountChange(id,ti,val){
  var count=Math.max(0,Math.min(99,parseInt(val)||0));
  var container=document.getElementById(id+'_t'+ti+'_entries'); if(!container)return;
  var current=container.querySelectorAll('.vi-type-cam-entry').length;
  while(current>count){container.removeChild(container.lastChild);current--;}
  while(current<count){
    var div=document.createElement('div'); div.className='vi-type-cam-entry';
    div.innerHTML='<span class="vi-type-cam-entry-num">'+(current+1)+'</span>'+
      '<div class="vi-type-cam-entry-fields">'+
        '<div class="vi-type-cam-field"><label>모델명</label><input type="text" class="vi-type-cam-model" value=""></div>'+
        '<div class="vi-type-cam-field"><label>S/N</label><input type="text" class="vi-type-cam-sn" value=""></div>'+
      '</div>';
    container.appendChild(div); current++;
  }
}

/* ══════════════════════════════════════════
   type-illum 렌더 (Type별 그룹)
══════════════════════════════════════════ */
function _renderViTypeIllum(item,val,id){
  var obj=(val&&typeof val==='object'&&!Array.isArray(val))?val:{};
  if(!_viCurrentTypes||!_viCurrentTypes.length){
    return '<div class="vi-type-empty" id="'+id+'">기본정보에서 Vision Type을 선택하면 Illumination 항목이 표시됩니다.</div>';
  }
  var html='<div class="vi-type-illum" id="'+id+'">';
  _viCurrentTypes.forEach(function(t,ti){
    var entries=Array.isArray(obj[t])?obj[t]:[];
    var count=entries.length;
    var color=_viTypeColor(t);
    var sectionId=id+'_t'+ti;
    html+='<div class="vi-type-illum-sec" data-type="'+_esc(t)+'" data-idx="'+ti+'">'+
      '<div class="vi-type-illum-sec-hdr" style="border-left:3px solid '+color+';color:'+color+'">'+_esc(t)+'</div>'+
      '<div class="vi-type-illum-count-row">'+
        '<label>수량</label>'+
        '<input type="number" class="vi-type-illum-count qty-inp" min="0" max="99" value="'+count+'" '+
          'oninput="_viTypeIllumCountChange(\''+id+'\','+ti+',this.value)">'+
        '<span class="qty-lbl">개</span>'+
      '</div>'+
      '<div class="vi-type-illum-entries" id="'+sectionId+'_entries">';
    for(var i=0;i<count;i++){
      var e=entries[i]||{model:'',sn:''};
      html+='<div class="vi-type-illum-entry">'+
        '<span class="vi-type-illum-entry-num">'+(i+1)+'</span>'+
        '<div class="vi-type-illum-entry-fields">'+
          '<div class="vi-type-illum-field"><label>모델명</label><input type="text" class="vi-type-illum-model" value="'+_esc(e.model||'')+'"></div>'+
          '<div class="vi-type-illum-field"><label>S/N</label><input type="text" class="vi-type-illum-sn" value="'+_esc(e.sn||'')+'"></div>'+
        '</div></div>';
    }
    html+='</div></div>';
  });
  html+='</div>';
  return html;
}

function _viTypeIllumCountChange(id,ti,val){
  var count=Math.max(0,Math.min(99,parseInt(val)||0));
  var container=document.getElementById(id+'_t'+ti+'_entries'); if(!container)return;
  var current=container.querySelectorAll('.vi-type-illum-entry').length;
  while(current>count){container.removeChild(container.lastChild);current--;}
  while(current<count){
    var div=document.createElement('div'); div.className='vi-type-illum-entry';
    div.innerHTML='<span class="vi-type-illum-entry-num">'+(current+1)+'</span>'+
      '<div class="vi-type-illum-entry-fields">'+
        '<div class="vi-type-illum-field"><label>모델명</label><input type="text" class="vi-type-illum-model" value=""></div>'+
        '<div class="vi-type-illum-field"><label>S/N</label><input type="text" class="vi-type-illum-sn" value=""></div>'+
      '</div>';
    container.appendChild(div); current++;
  }
}

/* ══════════════════════════════════════════
   board-multi 렌더 (수량→상세 입력)
══════════════════════════════════════════ */
function _renderViBoardMulti(item,val,id){
  var entries=Array.isArray(val)&&val.length?val:[{model:'',board:'',fw:''}];
  var count=entries.length;
  var labels=item.labels||['모델명','BOARD 버전','FIRMWARE'];
  var labelsJson=JSON.stringify(labels).replace(/"/g,'&quot;');
  return '<div class="vi-board-multi" id="'+id+'" data-labels="'+labelsJson+'">'+
    '<div class="vi-board-count-row">'+
      '<label>수량</label>'+
      '<input type="number" class="vi-board-count qty-inp" min="0" max="99" value="'+count+'" '+
        'oninput="_viBoardCountChange(\''+id+'\',this.value)">'+
      '<span class="qty-lbl">EA</span>'+
    '</div>'+
    '<div class="vi-board-entries" id="'+id+'_entries">'+
      entries.map(function(e,i){return _renderViBoardEntry(labels,e,i);}).join('')+
    '</div>'+
  '</div>';
}

function _renderViBoardEntry(labels,e,idx){
  e=e||{};
  return '<div class="vi-board-entry">'+
    '<div class="vi-board-entry-hdr">'+(idx+1)+'</div>'+
    '<div class="vi-board-entry-fields">'+
      '<div class="vi-board-entry-field"><label>'+_esc(labels[0]||'모델명')+'</label><input type="text" class="vi-board-f1" value="'+_esc(e.model||'')+'"></div>'+
      '<div class="vi-board-entry-field"><label>'+_esc(labels[1]||'BOARD 버전')+'</label><input type="text" class="vi-board-f2" value="'+_esc(e.board||'')+'"></div>'+
      '<div class="vi-board-entry-field"><label>'+_esc(labels[2]||'FIRMWARE')+'</label><input type="text" class="vi-board-f3" value="'+_esc(e.fw||'')+'"></div>'+
    '</div></div>';
}

function _viBoardCountChange(id,val){
  var count=Math.max(0,Math.min(99,parseInt(val)||0));
  var container=document.getElementById(id+'_entries'); if(!container)return;
  var wrap=document.getElementById(id); if(!wrap)return;
  var labels;
  try{labels=JSON.parse(wrap.getAttribute('data-labels').replace(/&quot;/g,'"'));}catch(ex){labels=['모델명','BOARD 버전','FIRMWARE'];}
  var current=container.querySelectorAll('.vi-board-entry').length;
  while(current>count){container.removeChild(container.lastChild);current--;}
  while(current<count){
    var tmp=document.createElement('div');
    tmp.innerHTML=_renderViBoardEntry(labels,{},current);
    container.appendChild(tmp.firstChild); current++;
  }
  Array.prototype.forEach.call(container.querySelectorAll('.vi-board-entry'),function(el,i){
    var hdr=el.querySelector('.vi-board-entry-hdr'); if(hdr)hdr.textContent=i+1;
  });
}

function _renderViCameraMulti(item,val,id){
  var cameras=Array.isArray(val)&&val.length?val:[{model:'',count:0,sns:[]}];
  var html='<div class="vi-cam-multi" id="'+id+'">';
  cameras.forEach(function(cam,idx){
    html+=_renderViCamEntry(id,cam,idx,cameras.length);
  });
  html+='<button class="vi-cam-add-btn" onclick="_viCamEntryAdd(\''+id+'\')">+ 카메라 추가</button>';
  html+='</div>';
  return html;
}

function _renderViCamEntry(wrapperId,cam,idx,total){
  var count=parseInt(cam.count)||0;
  var sns=cam.sns||[];
  var snRows='';
  for(var i=0;i<count;i++){
    snRows+='<div class="vi-cam-sn-row"><label>SN '+(i+1)+'</label>'+
      '<input type="text" class="vi-cam-sn-inp" data-idx="'+i+'" value="'+_esc(sns[i]||'')+'"></div>';
  }
  return '<div class="vi-cam-entry" id="'+wrapperId+'_cam'+idx+'">'+
    '<div class="vi-cam-entry-hdr">카메라 '+(idx+1)+
      '<button class="vi-cam-entry-del" onclick="_viCamEntryDel(\''+wrapperId+'\','+idx+')" title="삭제">✕</button>'+
    '</div>'+
    '<div class="vi-cam-entry-body">'+
      '<div class="vi-cam-entry-row"><label>모델명</label><input type="text" class="vi-cam-model-inp" value="'+_esc(cam.model||'')+'"></div>'+
      '<div class="vi-cam-entry-row"><label>수량</label>'+
        '<input type="number" class="vi-cam-qty-inp qty-inp" min="0" max="99" value="'+count+'" oninput="_viCamQtyChange(\''+wrapperId+'\','+idx+',this.value)">'+
        '<span style="font-size:10px;color:var(--tx-faint)">대</span>'+
      '</div>'+
      '<div class="vi-cam-sn-rows" id="'+wrapperId+'_cam'+idx+'_sns">'+snRows+'</div>'+
    '</div></div>';
}

function _viCamQtyChange(wrapperId,idx,val){
  var count=Math.max(0,Math.min(99,parseInt(val)||0));
  var snWrap=document.getElementById(wrapperId+'_cam'+idx+'_sns');
  if(!snWrap)return;
  var existing=snWrap.querySelectorAll('.vi-cam-sn-row');
  var cur=existing.length;
  while(cur>count){ snWrap.removeChild(snWrap.lastChild); cur--; }
  while(cur<count){
    var div=document.createElement('div'); div.className='vi-cam-sn-row';
    div.innerHTML='<label>SN '+(cur+1)+'</label><input type="text" class="vi-cam-sn-inp" data-idx="'+cur+'" value="">';
    snWrap.appendChild(div); cur++;
  }
}

function _viCamEntryAdd(wrapperId){
  var wrap=document.getElementById(wrapperId);
  if(!wrap)return;
  var entries=wrap.querySelectorAll('.vi-cam-entry');
  var idx=entries.length;
  var addBtn=wrap.querySelector('.vi-cam-add-btn');
  var div=document.createElement('div');
  div.innerHTML=_renderViCamEntry(wrapperId,{model:'',count:0,sns:[]},idx,idx+1);
  wrap.insertBefore(div.firstChild,addBtn);
  _viRenumberCamEntries(wrapperId);
}

function _viCamEntryDel(wrapperId,idx){
  var entry=document.getElementById(wrapperId+'_cam'+idx);
  if(entry) entry.parentNode.removeChild(entry);
  _viRenumberCamEntries(wrapperId);
}

function _viRenumberCamEntries(wrapperId){
  var wrap=document.getElementById(wrapperId);
  if(!wrap)return;
  var entries=wrap.querySelectorAll('.vi-cam-entry');
  entries.forEach(function(el,i){
    var hdr=el.querySelector('.vi-cam-entry-hdr');
    if(hdr){ var del=hdr.querySelector('.vi-cam-entry-del'); hdr.textContent='카메라 '+(i+1); if(del)hdr.appendChild(del); }
    el.id=wrapperId+'_cam'+i;
    var delBtn=el.querySelector('.vi-cam-entry-del');
    if(delBtn) delBtn.setAttribute('onclick','_viCamEntryDel(\''+wrapperId+'\','+i+')');
    var qtyInp=el.querySelector('.vi-cam-qty-inp');
    if(qtyInp) qtyInp.setAttribute('oninput','_viCamQtyChange(\''+wrapperId+'\','+i+',this.value)');
    var snsWrap=el.querySelector('[id$="_sns"]');
    if(snsWrap) snsWrap.id=wrapperId+'_cam'+i+'_sns';
  });
}

function _renderViSpecQty(item,val,id){
  var obj=(val&&typeof val==='object')?val:{spec:'',qty:''};
  var ph=item.specPlaceholder||'사양 입력';
  return '<div class="vi-spec-qty">'+
    '<input type="text" id="'+id+'_spec" class="spec-inp" value="'+_esc(obj.spec||'')+'" placeholder="'+_esc(ph)+'">'+
    '<input type="number" id="'+id+'_qty" class="qty-inp" value="'+_esc(String(obj.qty||''))+'" min="0" placeholder="수량">'+
    '<span class="qty-lbl">EA</span></div>';
}

function _renderViSsdMulti(item,val,id){
  var rows=(Array.isArray(val)&&val.length)?val:[{capacity:'',qty:'',drive:''}];
  var thead='<tr><th>용량</th><th style="width:55px">수량</th><th>드라이브</th><th style="width:24px"></th></tr>';
  var tbody=rows.map(function(r,i){
    return '<tr>'+
      '<td><input type="text" value="'+_esc(r.capacity||'')+'" placeholder="예: 1TB"></td>'+
      '<td><input type="number" value="'+_esc(String(r.qty||''))+'" min="0"></td>'+
      '<td><input type="text" value="'+_esc(r.drive||'')+'" placeholder="C:, D:"></td>'+
      '<td><button class="vi-multi-del-btn" onclick="_viSsdDelRow(\''+id+'\','+i+')">✕</button></td></tr>';
  }).join('');
  return '<table class="vi-multi-table" id="'+id+'_tbl"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table>'+
    '<button class="vi-add-row-btn" onclick="_viSsdAddRow(\''+id+'\')">+ 행 추가</button>';
}

function _renderViLancardMulti(item,val,id){
  var rows=(Array.isArray(val)&&val.length)?val:[{speed:'',ports:'',purpose:''}];
  var thead='<tr><th>속도</th><th style="width:55px">PORT 수</th><th>사용 목적</th><th style="width:24px"></th></tr>';
  var tbody=rows.map(function(r,i){
    return '<tr>'+
      '<td><input type="text" value="'+_esc(r.speed||'')+'" placeholder="1Gbps"></td>'+
      '<td><input type="number" value="'+_esc(String(r.ports||''))+'" min="0"></td>'+
      '<td><input type="text" value="'+_esc(r.purpose||'')+'" placeholder="카메라"></td>'+
      '<td><button class="vi-multi-del-btn" onclick="_viLanDelRow(\''+id+'\','+i+')">✕</button></td></tr>';
  }).join('');
  return '<table class="vi-multi-table" id="'+id+'_tbl"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table>'+
    '<button class="vi-add-row-btn" onclick="_viLanAddRow(\''+id+'\')">+ 행 추가</button>';
}

/* ── 다중행 동적 추가/삭제 ── */
function _viSsdAddRow(id){
  var tbody=document.querySelector('#'+id+'_tbl tbody'); if(!tbody)return;
  var idx=tbody.rows.length;
  var tr=document.createElement('tr');
  tr.innerHTML='<td><input type="text" value="" placeholder="예: 1TB"></td>'+
    '<td><input type="number" value="" min="0"></td>'+
    '<td><input type="text" value="" placeholder="C:, D:"></td>'+
    '<td><button class="vi-multi-del-btn" onclick="_viSsdDelRow(\''+id+'\','+idx+')">✕</button></td>';
  tbody.appendChild(tr); _viReindexDelBtns(id+'_tbl','_viSsdDelRow',id);
}
function _viSsdDelRow(id,idx){
  var tbody=document.querySelector('#'+id+'_tbl tbody'); if(!tbody||tbody.rows.length<=1)return;
  tbody.deleteRow(idx); _viReindexDelBtns(id+'_tbl','_viSsdDelRow',id);
}
function _viLanAddRow(id){
  var tbody=document.querySelector('#'+id+'_tbl tbody'); if(!tbody)return;
  var idx=tbody.rows.length;
  var tr=document.createElement('tr');
  tr.innerHTML='<td><input type="text" value="" placeholder="1Gbps"></td>'+
    '<td><input type="number" value="" min="0"></td>'+
    '<td><input type="text" value="" placeholder="카메라"></td>'+
    '<td><button class="vi-multi-del-btn" onclick="_viLanDelRow(\''+id+'\','+idx+')">✕</button></td>';
  tbody.appendChild(tr); _viReindexDelBtns(id+'_tbl','_viLanDelRow',id);
}
function _viLanDelRow(id,idx){
  var tbody=document.querySelector('#'+id+'_tbl tbody'); if(!tbody||tbody.rows.length<=1)return;
  tbody.deleteRow(idx); _viReindexDelBtns(id+'_tbl','_viLanDelRow',id);
}
function _viReindexDelBtns(tblId,fnName,id){
  var tbody=document.querySelector('#'+tblId+' tbody'); if(!tbody)return;
  Array.prototype.forEach.call(tbody.rows,function(tr,i){
    var btn=tr.querySelector('.vi-multi-del-btn');
    if(btn)btn.setAttribute('onclick',fnName+'(\''+id+'\','+i+')');
  });
}

/* ── 접기/펼치기 ── */
function _toggleViCat(catId){
  var body=document.getElementById('vicat_body_'+catId);
  var arr=document.getElementById('vicat_arr_'+catId);
  if(!body)return;
  var c=body.classList.toggle('collapsed');
  if(arr){if(c)arr.classList.remove('open');else arr.classList.add('open');}
}
function _toggleViGrp(grpId){
  var body=document.getElementById('vigrp_body_'+grpId);
  var arr=document.getElementById('vigrp_arr_'+grpId);
  if(!body)return;
  var c=body.classList.toggle('collapsed');
  if(arr){if(c)arr.classList.remove('open');else arr.classList.add('open');}
}

/* ══════════════════════════════════════════
   데이터 수집 및 저장
══════════════════════════════════════════ */
function saveVisionEquipData(){
  var equip=S.visionEquips.find(function(e){return e.id===_visionSelId;});
  if(!equip)return;
  equip.data=_collectVisionFormData();
  equip.updatedAt=_viToday();
  var sn=equip.data['vi_site']||'';
  var matchSite=S.sites.find(function(s){return s.name===sn||s.id===sn;});
  if(matchSite)equip.siteId=matchSite.id;
  saveData();
  var ts=document.getElementById('viSaveTs');
  if(ts)ts.textContent='저장됨: '+equip.updatedAt;
  // 툴바 최종 변경일도 갱신
  var toolbar=document.querySelector('.vi-detail-toolbar');
  if(toolbar){
    var dtSpan=toolbar.querySelector('.vi-updated-dt');
    if(dtSpan) dtSpan.innerHTML='최종 변경: <strong style="color:var(--tx-sub)">'+_esc(equip.updatedAt)+'</strong>';
  }
  renderVisionSidebar();
}

function _collectVisionFormData(){
  var data={};
  (S.visionTemplate.categories||[]).forEach(function(cat){
    var items=[];
    if(cat.groups) cat.groups.forEach(function(g){items=items.concat(g.items||[]);});
    else items=cat.items||[];
    items.forEach(function(item){ data[item.id]=_collectViField(item); });
  });
  return data;
}

function _collectViField(item){
  var id='viinp_'+item.id;
  switch(item.type){
    case 'multiselect':{
      var wrap=document.getElementById(id); if(!wrap)return [];
      var chks=wrap.querySelectorAll('.vi-ms-chk:checked');
      return Array.prototype.map.call(chks,function(c){return c.value;});
    }
    case 'camera-multi':{
      var wrap=document.getElementById(id); if(!wrap)return [];
      var entries=wrap.querySelectorAll('.vi-cam-entry');
      return Array.prototype.map.call(entries,function(el){
        var modelEl=el.querySelector('.vi-cam-model-inp');
        var qtyEl=el.querySelector('.vi-cam-qty-inp');
        var snInps=el.querySelectorAll('.vi-cam-sn-inp');
        return {
          model:modelEl?modelEl.value:'',
          count:parseInt(qtyEl?qtyEl.value:0)||0,
          sns:Array.prototype.map.call(snInps,function(i){return i.value;})
        };
      });
    }
    case 'spec-qty':{
      var s=document.getElementById(id+'_spec'), q=document.getElementById(id+'_qty');
      return {spec:s?s.value:'', qty:q?q.value:''};
    }
    case 'type-camera':{
      var wrap=document.getElementById(id); if(!wrap)return {};
      var result={};
      var secs=wrap.querySelectorAll('.vi-type-cam-sec');
      Array.prototype.forEach.call(secs,function(sec){
        var t=sec.getAttribute('data-type'); if(!t)return;
        var entries=sec.querySelectorAll('.vi-type-cam-entry');
        result[t]=Array.prototype.map.call(entries,function(el){
          var m=el.querySelector('.vi-type-cam-model');
          var s=el.querySelector('.vi-type-cam-sn');
          return {model:m?m.value:'',sn:s?s.value:''};
        });
      });
      return result;
    }
    case 'type-illum':{
      var wrap=document.getElementById(id); if(!wrap)return {};
      var result={};
      var secs=wrap.querySelectorAll('.vi-type-illum-sec');
      Array.prototype.forEach.call(secs,function(sec){
        var t=sec.getAttribute('data-type'); if(!t)return;
        var entries=sec.querySelectorAll('.vi-type-illum-entry');
        result[t]=Array.prototype.map.call(entries,function(el){
          var m=el.querySelector('.vi-type-illum-model');
          var s=el.querySelector('.vi-type-illum-sn');
          return {model:m?m.value:'',sn:s?s.value:''};
        });
      });
      return result;
    }
    case 'board-multi':{
      var wrap=document.getElementById(id); if(!wrap)return [];
      var entries=wrap.querySelectorAll('.vi-board-entry');
      return Array.prototype.map.call(entries,function(el){
        var f1=el.querySelector('.vi-board-f1');
        var f2=el.querySelector('.vi-board-f2');
        var f3=el.querySelector('.vi-board-f3');
        return {model:f1?f1.value:'',board:f2?f2.value:'',fw:f3?f3.value:''};
      });
    }
    case 'type-program':{
      var wrap=document.getElementById(id); if(!wrap)return {};
      return _collectViTypeProgFromDom(wrap);
    }
    case 'type-pc':{
      var wrap=document.getElementById(id); if(!wrap)return {};
      return _collectViTypePcFromDom(wrap);
    }
    case 'textarea':{ var el=document.getElementById(id); return el?el.value:''; }
    case 'ssd-multi': return _collectMultiTable(id+'_tbl',['capacity','qty','drive']);
    case 'lancard-multi': return _collectMultiTable(id+'_tbl',['speed','ports','purpose']);
    default:{ var el=document.getElementById(id); return el?el.value:''; }
  }
}

function _collectMultiTable(tblId,fields){
  var rows=[]; var tbody=document.querySelector('#'+tblId+' tbody'); if(!tbody)return rows;
  Array.prototype.forEach.call(tbody.rows,function(tr){
    var inputs=tr.querySelectorAll('input'); var obj={};
    fields.forEach(function(f,i){obj[f]=inputs[i]?inputs[i].value:'';});
    rows.push(obj);
  });
  return rows;
}

/* ══════════════════════════════════════════
   설비 CRUD
══════════════════════════════════════════ */
function openAddVisionEquip(){
  var siteOpts=S.sites.map(function(s){return '<option value="'+s.id+'">'+_esc(s.name)+'</option>';}).join('');
  mw('<div class="mtit">📋 설비 추가</div>'+
    '<div class="fg"><label class="fl">사이트</label><select id="vi_new_site"><option value="">-- 선택 --</option>'+siteOpts+'</select></div>'+
    '<div class="fg"><label class="fl">호기명</label><input type="text" id="vi_new_unit" placeholder="예: Anode"></div>'+
    '<div class="fg"><label class="fl">라인</label><input type="text" id="vi_new_line" placeholder="예: 1라인"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doAddVisionEquip()">추가</button></div>');
}
function _doAddVisionEquip(){
  var siteId=document.getElementById('vi_new_site').value;
  var unit=document.getElementById('vi_new_unit').value.trim();
  var line=document.getElementById('vi_new_line').value.trim();
  if(!siteId){alert('사이트를 선택해주세요.');return;}
  var site=S.sites.find(function(s){return s.id===siteId;});
  var equip={id:_viId(),siteId:siteId,createdAt:_viToday(),updatedAt:_viToday(),
    data:{'vi_site':site?site.name:siteId,'vi_unit':unit,'vi_line':line}};
  S.visionEquips.push(equip);
  _visionSelId=equip.id; _visionView='detail';
  saveData(); cm(); renderVisionTab();
}

function delVisionEquip(id){
  var equip=S.visionEquips.find(function(e){return e.id===id;});
  var name=equip?_viEquipLabel(equip):id;
  if(!confirm('['+name+'] 설비를 삭제하시겠습니까?'))return;
  S.visionEquips=S.visionEquips.filter(function(e){return e.id!==id;});
  _visionSelId=null; _visionView='grid';
  saveData(); renderVisionTab();
}

function copyVisionEquip(srcId){
  var src=S.visionEquips.find(function(e){return e.id===srcId;});
  if(!src)return;
  var newEquip={id:_viId(),siteId:src.siteId,createdAt:_viToday(),updatedAt:_viToday(),
    data:deepCopy(src.data)};
  if(newEquip.data['vi_unit']) newEquip.data['vi_unit']+=' (복사)';
  S.visionEquips.push(newEquip);
  _visionSelId=newEquip.id; _visionView='detail';
  saveData(); renderVisionTab();
}

/* ══════════════════════════════════════════
   설비진행율 가져오기
══════════════════════════════════════════ */
function openVisionImport(){
  if(!S.equipUnits||!S.equipUnits.length){alert('설비 진행율에 등록된 호기가 없습니다.');return;}
  var listHtml=S.equipUnits.map(function(u){
    var site=S.sites.find(function(s){return s.id===u.siteId;});
    var siteName=site?site.name:(u.siteId||'');
    var label=[u.lineName,u.unitName].filter(Boolean).join('-');
    return '<label class="vi-import-item">'+
      '<input type="checkbox" class="vi-import-chk" value="'+u.id+'">'+
      '<span class="vi-import-label">'+_esc(label)+'</span>'+
      '<span class="vi-import-sub">'+_esc(siteName)+'</span></label>';
  }).join('');
  mw('<div class="mtit">설비진행율 → 이력관리 가져오기</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:6px">선택한 호기의 기본정보를 복사하여 새 설비 레코드를 생성합니다.</div>'+
    '<div class="vi-import-list">'+listHtml+'</div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doVisionImport()">가져오기</button></div>');
}
function _doVisionImport(){
  var chks=document.querySelectorAll('.vi-import-chk:checked');
  if(!chks.length){alert('가져올 호기를 선택해주세요.');return;}
  var added=0;
  Array.prototype.forEach.call(chks,function(chk){
    var unit=S.equipUnits.find(function(u){return u.id===chk.value;}); if(!unit)return;
    var site=S.sites.find(function(s){return s.id===unit.siteId;});
    var equip={id:_viId(),siteId:unit.siteId||'',createdAt:_viToday(),updatedAt:_viToday(),
      data:{'vi_site':site?site.name:(unit.siteId||''),'vi_line':unit.lineName||'','vi_unit':unit.unitName||''}};
    S.visionEquips.push(equip); added++;
  });
  saveData(); cm(); renderVisionTab();
  if(added)alert(added+'개 설비를 가져왔습니다.');
}

/* ══════════════════════════════════════════
   열 설정
══════════════════════════════════════════ */
function openViColumnSettings(){
  var fixedIds=['vi_site','vi_line','vi_unit','vi_type'];
  var catHtml='';
  (S.visionTemplate.categories||[]).forEach(function(cat){
    var items=[];
    if(cat.groups) cat.groups.forEach(function(g){items=items.concat((g.items||[]).map(function(i){return{item:i,grp:g.name};}));});
    else (cat.items||[]).forEach(function(i){items.push({item:i,grp:null});});
    var eligible=items.filter(function(x){return fixedIds.indexOf(x.item.id)<0;});
    if(!eligible.length)return;
    catHtml+='<div class="vi-col-cat-hdr">'+_esc(cat.name)+'</div>';
    eligible.forEach(function(x){
      var lbl=(x.grp?x.grp+' > ':'')+x.item.name;
      catHtml+='<label class="vi-col-item">'+
        '<input type="checkbox" class="vi-col-chk" data-id="'+x.item.id+'"'+(x.item.showInGrid?' checked':'')+'>'+
        '<label>'+_esc(lbl)+'</label></label>';
    });
  });
  mw('<div class="mtit">열 설정 (그리드에 표시할 항목)</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:8px">고정 열(사이트/라인/호기/Type)은 항상 표시됩니다.</div>'+
    '<div class="vi-col-settings-list">'+catHtml+'</div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doViColumnSettings()">적용</button></div>');
}
function _doViColumnSettings(){
  var chks=document.querySelectorAll('.vi-col-chk');
  Array.prototype.forEach.call(chks,function(chk){
    var item=_findItemById(chk.dataset.id); if(item)item.showInGrid=chk.checked;
  });
  saveData(); cm(); renderVisionMain();
}

/* ══════════════════════════════════════════
   템플릿 편집 모드
══════════════════════════════════════════ */
function toggleVisionTemplateEdit(){
  _visionEditMode=!_visionEditMode;
  var btn=document.getElementById('btnVisionTplEdit');
  if(btn){btn.textContent=_visionEditMode?'편집 완료':'템플릿 편집'; btn.className=_visionEditMode?'btn warn':'btn';}
  if(_visionView==='detail') renderVisionMain();
}

function openAddVisionCategory(){
  mw('<div class="mtit">카테고리 추가</div>'+
    '<div class="fg"><label class="fl">카테고리명</label><input type="text" id="vi_new_cat_name" placeholder="예: 소프트웨어"></div>'+
    '<div class="fg"><label class="fl">구조</label><select id="vi_new_cat_type"><option value="items">항목만 (그룹 없음)</option><option value="groups">그룹 포함</option></select></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doAddViCategory()">추가</button></div>');
}
function _doAddViCategory(){
  var name=document.getElementById('vi_new_cat_name').value.trim();
  var type=document.getElementById('vi_new_cat_type').value;
  if(!name){alert('카테고리명을 입력해주세요.');return;}
  var cats=S.visionTemplate.categories||[];
  var maxOrder=cats.reduce(function(m,c){return Math.max(m,c.order||0);},-1);
  var cat={id:'vc_'+Date.now(),name:name,order:maxOrder+1};
  if(type==='groups')cat.groups=[];else cat.items=[];
  cats.push(cat); saveData(); cm(); renderVisionMain();
}
function openRenameViCategory(catId){
  var cat=_findCat(catId); if(!cat)return;
  mw('<div class="mtit">카테고리 이름 변경</div>'+
    '<div class="fg"><label class="fl">카테고리명</label><input type="text" id="vi_ren_cat" value="'+_esc(cat.name)+'"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doRenameViCat(\''+catId+'\')">저장</button></div>');
}
function _doRenameViCat(catId){
  var name=document.getElementById('vi_ren_cat').value.trim(); if(!name)return;
  var cat=_findCat(catId); if(cat)cat.name=name; saveData(); cm(); renderVisionMain();
}
function delViCategory(catId){
  var cat=_findCat(catId); if(!cat)return;
  var cnt=cat.groups?cat.groups.reduce(function(s,g){return s+(g.items?g.items.length:0);},0):(cat.items?cat.items.length:0);
  var msg='['+cat.name+'] 카테고리를 삭제하시겠습니까?';
  if(cnt)msg+='\n항목 '+cnt+'개 포함. 기존 설비 데이터는 보존됩니다.';
  if(!confirm(msg))return;
  S.visionTemplate.categories=S.visionTemplate.categories.filter(function(c){return c.id!==catId;});
  saveData(); renderVisionMain();
}
function moveViCategory(ci,dir){
  var cats=S.visionTemplate.categories; var ni=ci+dir;
  if(ni<0||ni>=cats.length)return;
  var tmp=cats[ci];cats[ci]=cats[ni];cats[ni]=tmp; saveData(); renderVisionMain();
}

function openAddVisionGroup(catId){
  mw('<div class="mtit">그룹 추가</div>'+
    '<div class="fg"><label class="fl">그룹명</label><input type="text" id="vi_new_grp_name" placeholder="예: LIGHTING"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doAddViGroup(\''+catId+'\')">추가</button></div>');
}
function _doAddViGroup(catId){
  var name=document.getElementById('vi_new_grp_name').value.trim(); if(!name){alert('그룹명을 입력해주세요.');return;}
  var cat=_findCat(catId); if(!cat)return; if(!cat.groups)cat.groups=[];
  var maxOrder=cat.groups.reduce(function(m,g){return Math.max(m,g.order||0);},-1);
  cat.groups.push({id:'vg_'+Date.now(),name:name,order:maxOrder+1,items:[]}); saveData(); cm(); renderVisionMain();
}
function openRenameViGroup(catId,grpId){
  var grp=_findGrp(catId,grpId); if(!grp)return;
  mw('<div class="mtit">그룹 이름 변경</div>'+
    '<div class="fg"><label class="fl">그룹명</label><input type="text" id="vi_ren_grp" value="'+_esc(grp.name)+'"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doRenameViGrp(\''+catId+'\',\''+grpId+'\')">저장</button></div>');
}
function _doRenameViGrp(catId,grpId){
  var name=document.getElementById('vi_ren_grp').value.trim(); if(!name)return;
  var grp=_findGrp(catId,grpId); if(grp)grp.name=name; saveData(); cm(); renderVisionMain();
}
function delViGroup(catId,grpId){
  var cat=_findCat(catId); var grp=_findGrp(catId,grpId); if(!cat||!grp)return;
  var cnt=grp.items?grp.items.length:0;
  var msg='['+grp.name+'] 그룹을 삭제하시겠습니까?';
  if(cnt)msg+='\n항목 '+cnt+'개 포함. 기존 설비 데이터는 보존됩니다.';
  if(!confirm(msg))return;
  cat.groups=cat.groups.filter(function(g){return g.id!==grpId;}); saveData(); renderVisionMain();
}
function moveViGroup(catId,gi,dir){
  var cat=_findCat(catId); if(!cat||!cat.groups)return;
  var grps=cat.groups; var ni=gi+dir; if(ni<0||ni>=grps.length)return;
  var tmp=grps[gi];grps[gi]=grps[ni];grps[ni]=tmp; saveData(); renderVisionMain();
}

var _VI_TYPES=[
  {val:'text',lbl:'텍스트'},{val:'multiselect',lbl:'복수 선택 (체크박스)'},
  {val:'type-camera',lbl:'카메라 (Type별 그룹)'},
  {val:'type-illum',lbl:'조명 (Type별 그룹)'},
  {val:'type-program',lbl:'프로그램 (Type별 그룹)'},
  {val:'type-pc',lbl:'PC (Type별 그룹)'},
  {val:'textarea',lbl:'텍스트 (여러 줄)'},
  {val:'board-multi',lbl:'Board (수량→상세 입력)'},
  {val:'camera-multi',lbl:'카메라 (다중 모델+S/N)'},
  {val:'spec-qty',lbl:'사양+수량'},{val:'ssd-multi',lbl:'SSD/HDD (용량/수량/드라이브)'},
  {val:'lancard-multi',lbl:'랜카드 (속도/PORT/목적)'}
];

function openAddVisionItem(catId,grpId){
  var typeOpts=_VI_TYPES.map(function(t){return '<option value="'+t.val+'">'+t.lbl+'</option>';}).join('');
  mw('<div class="mtit">항목 추가</div>'+
    '<div class="fg"><label class="fl">항목명</label><input type="text" id="vi_new_item_name" placeholder="예: 버전"></div>'+
    '<div class="fg"><label class="fl">입력 타입</label><select id="vi_new_item_type">'+typeOpts+'</select></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doAddViItem(\''+catId+'\',\''+grpId+'\')">추가</button></div>');
}
function _doAddViItem(catId,grpId){
  var name=document.getElementById('vi_new_item_name').value.trim();
  var type=document.getElementById('vi_new_item_type').value;
  if(!name){alert('항목명을 입력해주세요.');return;}
  var list=_getItemsList(catId,grpId||''); if(!list)return;
  var maxOrder=list.reduce(function(m,i){return Math.max(m,i.order||0);},-1);
  var newItem={id:'vi_'+Date.now(),name:name,type:type,order:maxOrder+1,showInGrid:false};
  if(type==='multiselect'||type==='select')newItem.options=[];
  list.push(newItem); saveData(); cm(); renderVisionMain();
}
function openEditViItem(catId,grpId,itemId){
  var item=_findItem(catId,grpId,itemId); if(!item)return;
  var typeOpts=_VI_TYPES.map(function(t){return '<option value="'+t.val+'"'+(item.type===t.val?' selected':'')+'>'+t.lbl+'</option>';}).join('');
  mw('<div class="mtit">항목 편집</div>'+
    '<div class="fg"><label class="fl">항목명</label><input type="text" id="vi_edit_item_name" value="'+_esc(item.name)+'"></div>'+
    '<div class="fg"><label class="fl">입력 타입</label><select id="vi_edit_item_type">'+typeOpts+'</select></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doEditViItem(\''+catId+'\',\''+grpId+'\',\''+itemId+'\')">저장</button></div>');
}
function _doEditViItem(catId,grpId,itemId){
  var name=document.getElementById('vi_edit_item_name').value.trim();
  var type=document.getElementById('vi_edit_item_type').value;
  if(!name){alert('항목명을 입력해주세요.');return;}
  var item=_findItem(catId,grpId,itemId); if(!item)return;
  item.name=name;
  if(item.type!==type){item.type=type; if((type==='multiselect'||type==='select')&&!item.options)item.options=[];}
  saveData(); cm(); renderVisionMain();
}
function delViItem(catId,grpId,itemId){
  var item=_findItem(catId,grpId,itemId); if(!item)return;
  var affected=(S.visionEquips||[]).filter(function(e){return e.data&&e.data[itemId]!==undefined&&e.data[itemId]!==''&&e.data[itemId]!==null;}).length;
  var msg='['+item.name+'] 항목을 삭제하시겠습니까?';
  if(affected)msg+='\n데이터 입력 설비 '+affected+'개. 기존 데이터는 보존됩니다.';
  if(!confirm(msg))return;
  var list=_getItemsList(catId,grpId); if(!list)return;
  var idx=-1; for(var i=0;i<list.length;i++)if(list[i].id===itemId){idx=i;break;}
  if(idx>=0)list.splice(idx,1); saveData(); renderVisionMain();
}
function moveViItem(catId,grpId,itemId,dir){
  var list=_getItemsList(catId,grpId); if(!list)return;
  var idx=-1; for(var i=0;i<list.length;i++)if(list[i].id===itemId){idx=i;break;}
  if(idx<0)return; var ni=idx+dir; if(ni<0||ni>=list.length)return;
  var tmp=list[idx];list[idx]=list[ni];list[ni]=tmp; saveData(); renderVisionMain();
}

function openAddSelectOption(itemId){
  mw('<div class="mtit">옵션 추가</div>'+
    '<div class="fg"><label class="fl">옵션명</label><input type="text" id="vi_new_opt" placeholder="예: Winding"></div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button><button class="btn sm pri" onclick="_doAddSelectOption(\''+itemId+'\')">추가</button></div>');
}
function _doAddSelectOption(itemId){
  var val=document.getElementById('vi_new_opt').value.trim(); if(!val){alert('옵션명을 입력해주세요.');return;}
  var item=_findItemById(itemId); if(!item)return;
  if(!item.options)item.options=[];
  if(item.options.indexOf(val)>=0){alert('이미 존재하는 옵션입니다.');return;}
  item.options.push(val); saveData(); cm(); renderVisionMain();
}
function delSelectOption(itemId,optVal){
  var item=_findItemById(itemId); if(!item||!item.options)return;
  item.options=item.options.filter(function(o){return o!==optVal;}); saveData(); renderVisionMain();
}

/* ══════════════════════════════════════════
   CSV 내보내기 / 가져오기
══════════════════════════════════════════ */
function exportVisionCSV(){
  if(!S.visionEquips||!S.visionEquips.length){alert('내보낼 설비 데이터가 없습니다.');return;}
  var allItems=_viAllItems();
  var headers=['site','line','unit','type']; // 고정 4열
  var colMap=[]; // {header, item}

  // 단순 타입 컬럼
  allItems.forEach(function(item){
    var fixedIds=['vi_site','vi_line','vi_unit','vi_type'];
    if(fixedIds.indexOf(item.id)>=0)return;
    switch(item.type){
      case 'spec-qty':
        headers.push(item.id+'_spec'); headers.push(item.id+'_qty');
        colMap.push({h:item.id+'_spec',item:item,sub:'spec'}); colMap.push({h:item.id+'_qty',item:item,sub:'qty'}); break;
      case 'type-camera':{
        var tcTypeItem=_findItemById('vi_type');
        var tcTypes=tcTypeItem?(tcTypeItem.options||[]):[];
        tcTypes.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          var maxN=0;
          S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id];if(v&&v[t]&&Array.isArray(v[t]))maxN=Math.max(maxN,v[t].length);});
          for(var ci=0;ci<maxN;ci++){
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_model'); colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_model',item:item,sub:'tcam_model',t:t,ci:ci});
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_sn');    colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_sn',   item:item,sub:'tcam_sn',   t:t,ci:ci});
          }
        });
        break;}
      case 'type-illum':{
        var tiTypeItem=_findItemById('vi_type');
        var tiTypes=tiTypeItem?(tiTypeItem.options||[]):[];
        tiTypes.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          var maxN=0;
          S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id];if(v&&v[t]&&Array.isArray(v[t]))maxN=Math.max(maxN,v[t].length);});
          for(var ci=0;ci<maxN;ci++){
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_model'); colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_model',item:item,sub:'tillum_model',t:t,ci:ci});
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_sn');    colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_sn',   item:item,sub:'tillum_sn',  t:t,ci:ci});
          }
        });
        break;}
      case 'type-program':{
        var tpTypeItem=_findItemById('vi_type');
        var tpTypes=tpTypeItem?(tpTypeItem.options||[]):[];
        tpTypes.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          var maxN=0;
          S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id];if(v&&v[t]&&Array.isArray(v[t]))maxN=Math.max(maxN,v[t].length);});
          for(var ci=0;ci<maxN;ci++){
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_name'); colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_name',item:item,sub:'tprog_name',t:t,ci:ci});
            headers.push(item.id+'_'+tk+'_'+(ci+1)+'_ver');  colMap.push({h:item.id+'_'+tk+'_'+(ci+1)+'_ver', item:item,sub:'tprog_ver', t:t,ci:ci});
          }
        });
        break;}
      case 'type-pc':{
        var tpcTypeItem=_findItemById('vi_type');
        var tpcTypes=tpcTypeItem?(tpcTypeItem.options||[]):[];
        var pcSubs=['cpu','mainboard','ram'];
        var pcSubTbls={ssd:['cap','qty','drive'],hdd:['cap','qty','drive'],lancard:['spd','ports','purpose'],fg:['f1','f2','f3'],sync:['f1','f2','f3']};
        tpcTypes.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          var maxPc=0;
          S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id];if(v&&v[t]&&Array.isArray(v[t]))maxPc=Math.max(maxPc,v[t].length);});
          for(var pi2=0;pi2<maxPc;pi2++){
            var pfx=item.id+'_'+tk+'_'+(pi2+1);
            pcSubs.forEach(function(sf){
              headers.push(pfx+'_'+sf+'_spec'); colMap.push({h:pfx+'_'+sf+'_spec',item:item,sub:'tpc_spec',t:t,pi:pi2,sf:sf});
              headers.push(pfx+'_'+sf+'_qty');  colMap.push({h:pfx+'_'+sf+'_qty', item:item,sub:'tpc_qty', t:t,pi:pi2,sf:sf});
            });
          }
        });
        break;}
      case 'board-multi':{
        var maxBd=0;
        S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id];if(Array.isArray(v))maxBd=Math.max(maxBd,v.length);});
        for(var bi=0;bi<maxBd;bi++){
          headers.push(item.id+'_'+(bi+1)+'_model'); colMap.push({h:item.id+'_'+(bi+1)+'_model',item:item,sub:'brd_model',bi:bi});
          headers.push(item.id+'_'+(bi+1)+'_board'); colMap.push({h:item.id+'_'+(bi+1)+'_board',item:item,sub:'brd_board',bi:bi});
          headers.push(item.id+'_'+(bi+1)+'_fw');    colMap.push({h:item.id+'_'+(bi+1)+'_fw',   item:item,sub:'brd_fw',   bi:bi});
        }
        break;}
      case 'camera-multi':
        // 최대 카메라 수 탐색
        var maxCams=0;
        S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id]; if(Array.isArray(v))maxCams=Math.max(maxCams,v.length);});
        maxCams=Math.max(maxCams,1);
        var maxSns=0;
        S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id]; if(Array.isArray(v))v.forEach(function(c){maxSns=Math.max(maxSns,parseInt(c.count)||0);});});
        maxSns=Math.max(maxSns,1);
        for(var ci=0;ci<maxCams;ci++){
          headers.push('cam'+(ci+1)+'_model'); colMap.push({h:'cam'+(ci+1)+'_model',item:item,sub:'cam_model',ci:ci});
          headers.push('cam'+(ci+1)+'_count'); colMap.push({h:'cam'+(ci+1)+'_count',item:item,sub:'cam_count',ci:ci});
          for(var si=0;si<maxSns;si++){
            headers.push('cam'+(ci+1)+'_sn'+(si+1)); colMap.push({h:'cam'+(ci+1)+'_sn'+(si+1),item:item,sub:'cam_sn',ci:ci,si:si});
          }
        }
        break;
      case 'ssd-multi':
        var maxRows=0;
        S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id]; if(Array.isArray(v))maxRows=Math.max(maxRows,v.length);});
        maxRows=Math.max(maxRows,1);
        for(var ri=0;ri<maxRows;ri++){
          var p=item.id+'_'+(ri+1);
          headers.push(p+'_cap'); headers.push(p+'_qty'); headers.push(p+'_drive');
          colMap.push({h:p+'_cap',item:item,sub:'ssd_cap',ri:ri}); colMap.push({h:p+'_qty',item:item,sub:'ssd_qty',ri:ri}); colMap.push({h:p+'_drive',item:item,sub:'ssd_drive',ri:ri});
        }
        break;
      case 'lancard-multi':
        var maxRows2=0;
        S.visionEquips.forEach(function(e){var v=e.data&&e.data[item.id]; if(Array.isArray(v))maxRows2=Math.max(maxRows2,v.length);});
        maxRows2=Math.max(maxRows2,1);
        for(var ri2=0;ri2<maxRows2;ri2++){
          var p2=item.id+'_'+(ri2+1);
          headers.push(p2+'_speed'); headers.push(p2+'_ports'); headers.push(p2+'_purpose');
          colMap.push({h:p2+'_speed',item:item,sub:'lan_speed',ri:ri2}); colMap.push({h:p2+'_ports',item:item,sub:'lan_ports',ri:ri2}); colMap.push({h:p2+'_purpose',item:item,sub:'lan_purpose',ri:ri2});
        }
        break;
      default:
        headers.push(item.id); colMap.push({h:item.id,item:item,sub:'direct'});
    }
  });

  // 행 생성
  var rows=[headers];
  S.visionEquips.forEach(function(e){
    var d=e.data||{};
    var row=[
      d['vi_site']||'', d['vi_line']||'', d['vi_unit']||'',
      Array.isArray(d['vi_type'])?d['vi_type'].join(';'):(d['vi_type']||'')
    ];
    colMap.forEach(function(cm){
      var v=d[cm.item.id];
      switch(cm.sub){
        case 'spec': row.push(v&&typeof v==='object'?v.spec:''); break;
        case 'qty': row.push(v&&typeof v==='object'?v.qty:''); break;
        case 'tcam_model': row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].model:''); break;
        case 'tcam_sn':   row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].sn:'');    break;
        case 'tillum_model': row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].model:''); break;
        case 'tillum_sn':    row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].sn:'');    break;
        case 'tprog_name':   row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].name:'');   break;
        case 'tprog_ver':    row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.ci]?v[cm.t][cm.ci].version:'');break;
        case 'tpc_spec': row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.pi]&&v[cm.t][cm.pi][cm.sf]?v[cm.t][cm.pi][cm.sf].spec:'');break;
        case 'tpc_qty':  row.push(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v[cm.t])&&v[cm.t][cm.pi]&&v[cm.t][cm.pi][cm.sf]?v[cm.t][cm.pi][cm.sf].qty:''); break;
        case 'brd_model': row.push(Array.isArray(v)&&v[cm.bi]?v[cm.bi].model:''); break;
        case 'brd_board': row.push(Array.isArray(v)&&v[cm.bi]?v[cm.bi].board:''); break;
        case 'brd_fw':    row.push(Array.isArray(v)&&v[cm.bi]?v[cm.bi].fw:'');    break;
        case 'cam_model': row.push(Array.isArray(v)&&v[cm.ci]?v[cm.ci].model:''); break;
        case 'cam_count': row.push(Array.isArray(v)&&v[cm.ci]?v[cm.ci].count:''); break;
        case 'cam_sn': row.push(Array.isArray(v)&&v[cm.ci]&&v[cm.ci].sns?v[cm.ci].sns[cm.si]||'':''); break;
        case 'ssd_cap': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].capacity:''); break;
        case 'ssd_qty': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].qty:''); break;
        case 'ssd_drive': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].drive:''); break;
        case 'lan_speed': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].speed:''); break;
        case 'lan_ports': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].ports:''); break;
        case 'lan_purpose': row.push(Array.isArray(v)&&v[cm.ri]?v[cm.ri].purpose:''); break;
        default:
          if(Array.isArray(v))row.push(v.join(';'));
          else row.push(v!==undefined&&v!==null?String(v):'');
      }
    });
    rows.push(row);
  });

  var csv=rows.map(function(r){return r.map(function(c){var s=String(c||''); return (s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',');}).join('\r\n');
  var bom='﻿';
  var blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='vision_equip_'+_viToday()+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════
   CSV 양식 다운로드 (일괄 입력용 빈 양식)
══════════════════════════════════════════ */
function openVisionCsvTemplate(){
  var typeItem=_findItemById('vi_type');
  var types=typeItem?(typeItem.options||[]):[];
  if(!types.length){alert('먼저 기본정보-Type에서 Vision Type을 등록해주세요.');return;}
  mw('<div class="mtit">CSV 양식 다운로드</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:10px">'+
      'Excel에서 작성 후 "CSV 가져오기"로 일괄 등록할 수 있습니다.<br>'+
      '등록할 최대 수량을 입력하면 그에 맞는 컬럼이 생성됩니다.'+
    '</div>'+
    '<div class="fg"><label class="fl">Camera 수 (Type별 최대)</label>'+
      '<input type="number" id="vt_cam_n" value="4" min="0" max="20" style="width:60px"> 대</div>'+
    '<div class="fg"><label class="fl">Illumination 수 (Type별 최대)</label>'+
      '<input type="number" id="vt_illum_n" value="4" min="0" max="20" style="width:60px"> 개</div>'+
    '<div class="fg"><label class="fl">Board 수 (보드별 최대)</label>'+
      '<input type="number" id="vt_board_n" value="2" min="0" max="10" style="width:60px"> 개</div>'+
    '<div class="fg"><label class="fl">SSD/HDD 수 (최대)</label>'+
      '<input type="number" id="vt_ssd_n" value="3" min="0" max="10" style="width:60px"> 개</div>'+
    '<div class="fg"><label class="fl">LAN카드 수 (최대)</label>'+
      '<input type="number" id="vt_lan_n" value="2" min="0" max="10" style="width:60px"> 개</div>'+
    '<div class="mfoot"><button class="btn sm" onclick="cm()">취소</button>'+
    '<button class="btn sm pri" onclick="_doDownloadVisionCsvTemplate()">⬇ 양식 다운로드</button></div>');
}

function _doDownloadVisionCsvTemplate(){
  var camN=Math.max(0,parseInt(document.getElementById('vt_cam_n').value)||0);
  var illumN=Math.max(0,parseInt(document.getElementById('vt_illum_n').value)||0);
  var boardN=Math.max(0,parseInt(document.getElementById('vt_board_n').value)||0);
  var ssdN=Math.max(0,parseInt(document.getElementById('vt_ssd_n').value)||0);
  var lanN=Math.max(0,parseInt(document.getElementById('vt_lan_n').value)||0);
  var typeItem=_findItemById('vi_type');
  var types=typeItem?(typeItem.options||[]):[];
  var allItems=_viAllItems();
  var fixedIds=['vi_site','vi_line','vi_unit','vi_type'];
  var headers=['site','line','unit','type'];
  allItems.forEach(function(item){
    if(fixedIds.indexOf(item.id)>=0)return;
    switch(item.type){
      case 'spec-qty':
        headers.push(item.id+'_spec');headers.push(item.id+'_qty');break;
      case 'type-camera':
        types.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          for(var ci=0;ci<camN;ci++){headers.push(item.id+'_'+tk+'_'+(ci+1)+'_model');headers.push(item.id+'_'+tk+'_'+(ci+1)+'_sn');}
        });break;
      case 'type-illum':
        types.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          for(var ci=0;ci<illumN;ci++){headers.push(item.id+'_'+tk+'_'+(ci+1)+'_model');headers.push(item.id+'_'+tk+'_'+(ci+1)+'_sn');}
        });break;
      case 'board-multi':
        for(var bi=0;bi<boardN;bi++){headers.push(item.id+'_'+(bi+1)+'_model');headers.push(item.id+'_'+(bi+1)+'_board');headers.push(item.id+'_'+(bi+1)+'_fw');}
        break;
      case 'ssd-multi':
        for(var ri=0;ri<ssdN;ri++){headers.push(item.id+'_'+(ri+1)+'_cap');headers.push(item.id+'_'+(ri+1)+'_qty');headers.push(item.id+'_'+(ri+1)+'_drive');}
        break;
      case 'lancard-multi':
        for(var ri2=0;ri2<lanN;ri2++){headers.push(item.id+'_'+(ri2+1)+'_speed');headers.push(item.id+'_'+(ri2+1)+'_ports');headers.push(item.id+'_'+(ri2+1)+'_purpose');}
        break;
      case 'type-program':
        types.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          for(var ci=0;ci<4;ci++){headers.push(item.id+'_'+tk+'_'+(ci+1)+'_name');headers.push(item.id+'_'+tk+'_'+(ci+1)+'_ver');}
        });break;
      case 'type-pc':
        types.forEach(function(t){
          var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          for(var pi4=0;pi4<2;pi4++){
            var pfx=item.id+'_'+tk+'_'+(pi4+1);
            ['cpu','mainboard','ram'].forEach(function(sf){headers.push(pfx+'_'+sf+'_spec');headers.push(pfx+'_'+sf+'_qty');});
          }
        });break;
      case 'camera-multi':break;
      case 'textarea':headers.push(item.id);break;
      default:headers.push(item.id);
    }
  });
  var emptyRow=headers.map(function(){return '';});
  var csv=[headers,emptyRow,emptyRow,emptyRow].map(function(r){
    return r.map(function(c){var s=String(c||'');return (s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',');
  }).join('\r\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='vision_template_'+_viToday()+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  cm();
}

function openVisionCsvImport(){
  var fi=document.getElementById('viCsvFileInput'); if(fi)fi.click();
}

function handleVisionCsvFile(input){
  var file=input.files&&input.files[0]; if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var text=e.target.result;
    // BOM 제거
    if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
    _parseAndImportVisionCSV(text);
  };
  reader.readAsText(file,'utf-8');
  input.value='';
}

function _parseAndImportVisionCSV(text){
  var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
  if(lines.length<2){alert('데이터가 없습니다.');return;}
  var headers=_csvParseLine(lines[0]);
  var allItems=_viAllItems();
  var imported=0, updated=0;
  for(var li=1;li<lines.length;li++){
    var row=_csvParseLine(lines[li]);
    if(!row.length||!row[0])continue;
    var rmap={};
    headers.forEach(function(h,i){rmap[h]=row[i]||'';});
    var siteName=rmap['site']||''; var line=rmap['line']||''; var unit=rmap['unit']||'';
    var site=S.sites.find(function(s){return s.name===siteName||s.id===siteName;});
    // 기존 설비 매칭 (사이트+라인+호기)
    var existing=S.visionEquips.find(function(e){
      return e.siteId===(site?site.id:siteName)&&(e.data&&e.data['vi_unit']===unit)&&(e.data&&e.data['vi_line']===line);
    });
    var equip=existing||{id:_viId(),siteId:site?site.id:siteName,createdAt:_viToday(),updatedAt:_viToday(),data:{}};
    equip.data['vi_site']=siteName; equip.data['vi_line']=line; equip.data['vi_unit']=unit;
    var typeStr=rmap['type']||'';
    equip.data['vi_type']=typeStr?typeStr.split(';').map(function(s){return s.trim();}).filter(Boolean):[];
    // 나머지 항목
    allItems.forEach(function(item){
      var fixedIds=['vi_site','vi_line','vi_unit','vi_type']; if(fixedIds.indexOf(item.id)>=0)return;
      switch(item.type){
        case 'spec-qty':
          equip.data[item.id]={spec:rmap[item.id+'_spec']||'',qty:rmap[item.id+'_qty']||''}; break;
        case 'type-camera':{
          var tcImpTypeItem=_findItemById('vi_type');
          var tcImpTypes=tcImpTypeItem?(tcImpTypeItem.options||[]):[];
          var tcRes={};
          tcImpTypes.forEach(function(t){
            var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
            var entries=[]; var ci=0;
            while(rmap[item.id+'_'+tk+'_'+(ci+1)+'_model']!==undefined){
              entries.push({model:rmap[item.id+'_'+tk+'_'+(ci+1)+'_model']||'',sn:rmap[item.id+'_'+tk+'_'+(ci+1)+'_sn']||''});
              ci++;
            }
            if(entries.length)tcRes[t]=entries;
          });
          if(Object.keys(tcRes).length)equip.data[item.id]=tcRes; break;}
        case 'type-illum':{
          var tiImpTypeItem=_findItemById('vi_type');
          var tiImpTypes=tiImpTypeItem?(tiImpTypeItem.options||[]):[];
          var tiRes={};
          tiImpTypes.forEach(function(t){
            var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
            var entries=[]; var ci=0;
            while(rmap[item.id+'_'+tk+'_'+(ci+1)+'_model']!==undefined){
              entries.push({model:rmap[item.id+'_'+tk+'_'+(ci+1)+'_model']||'',sn:rmap[item.id+'_'+tk+'_'+(ci+1)+'_sn']||''});
              ci++;
            }
            if(entries.length)tiRes[t]=entries;
          });
          if(Object.keys(tiRes).length)equip.data[item.id]=tiRes; break;}
        case 'type-program':{
          var tpImpTypeItem=_findItemById('vi_type');
          var tpImpTypes=tpImpTypeItem?(tpImpTypeItem.options||[]):[];
          var tpRes={};
          tpImpTypes.forEach(function(t){
            var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
            var entries=[]; var ci=0;
            while(rmap[item.id+'_'+tk+'_'+(ci+1)+'_name']!==undefined){
              entries.push({name:rmap[item.id+'_'+tk+'_'+(ci+1)+'_name']||'',version:rmap[item.id+'_'+tk+'_'+(ci+1)+'_ver']||''});
              ci++;
            }
            if(entries.length)tpRes[t]=entries;
          });
          if(Object.keys(tpRes).length)equip.data[item.id]=tpRes; break;}
        case 'type-pc':{
          var tpcImpTypeItem=_findItemById('vi_type');
          var tpcImpTypes=tpcImpTypeItem?(tpcImpTypeItem.options||[]):[];
          var tpcRes={};
          tpcImpTypes.forEach(function(t){
            var tk=t.replace(/[^a-zA-Z0-9가-힣]/g,'_');
            var pcs=[]; var pi3=0;
            while(rmap[item.id+'_'+tk+'_'+(pi3+1)+'_cpu_spec']!==undefined){
              var pfx=item.id+'_'+tk+'_'+(pi3+1);
              pcs.push({
                cpu:{spec:rmap[pfx+'_cpu_spec']||'',qty:rmap[pfx+'_cpu_qty']||''},
                mainboard:{spec:rmap[pfx+'_mainboard_spec']||'',qty:rmap[pfx+'_mainboard_qty']||''},
                ram:{spec:rmap[pfx+'_ram_spec']||'',qty:rmap[pfx+'_ram_qty']||''},
                ssd:[],hdd:[],lancard:[],fg:[],sync:[]
              });
              pi3++;
            }
            if(pcs.length)tpcRes[t]=pcs;
          });
          if(Object.keys(tpcRes).length)equip.data[item.id]=tpcRes; break;}
        case 'board-multi':{
          var bdRows=[]; var bi=0;
          while(rmap[item.id+'_'+(bi+1)+'_model']!==undefined){
            bdRows.push({model:rmap[item.id+'_'+(bi+1)+'_model']||'',board:rmap[item.id+'_'+(bi+1)+'_board']||'',fw:rmap[item.id+'_'+(bi+1)+'_fw']||''});
            bi++;
          }
          if(bdRows.length)equip.data[item.id]=bdRows; break;}
        case 'camera-multi':{
          var cams=[]; var ci=0;
          while(rmap['cam'+(ci+1)+'_model']!==undefined||rmap['cam'+(ci+1)+'_count']!==undefined){
            var model=rmap['cam'+(ci+1)+'_model']||'';
            var count=parseInt(rmap['cam'+(ci+1)+'_count'])||0;
            var sns=[]; for(var si=0;si<count;si++){sns.push(rmap['cam'+(ci+1)+'_sn'+(si+1)]||'');}
            cams.push({model:model,count:count,sns:sns}); ci++;
          }
          if(cams.length)equip.data[item.id]=cams; break;}
        case 'ssd-multi':{
          var rows=[]; var ri=0;
          while(rmap[item.id+'_'+(ri+1)+'_cap']!==undefined){
            rows.push({capacity:rmap[item.id+'_'+(ri+1)+'_cap']||'',qty:rmap[item.id+'_'+(ri+1)+'_qty']||'',drive:rmap[item.id+'_'+(ri+1)+'_drive']||''});
            ri++;
          }
          if(rows.length)equip.data[item.id]=rows; break;}
        case 'lancard-multi':{
          var rows2=[]; var ri2=0;
          while(rmap[item.id+'_'+(ri2+1)+'_speed']!==undefined){
            rows2.push({speed:rmap[item.id+'_'+(ri2+1)+'_speed']||'',ports:rmap[item.id+'_'+(ri2+1)+'_ports']||'',purpose:rmap[item.id+'_'+(ri2+1)+'_purpose']||''});
            ri2++;
          }
          if(rows2.length)equip.data[item.id]=rows2; break;}
        case 'multiselect':{
          var v=rmap[item.id]||'';
          equip.data[item.id]=v?v.split(';').map(function(s){return s.trim();}).filter(Boolean):[];break;}
        default:
          if(rmap[item.id]!==undefined)equip.data[item.id]=rmap[item.id];
      }
    });
    equip.updatedAt=_viToday();
    if(existing)updated++;
    else{S.visionEquips.push(equip);imported++;}
  }
  saveData(); renderVisionTab();
  alert('가져오기 완료: 신규 '+imported+'개, 업데이트 '+updated+'개');
}

function _csvParseLine(line){
  var result=[]; var cur=''; var inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(c===','&&!inQ){result.push(cur);cur='';}
    else cur+=c;
  }
  result.push(cur); return result;
}
