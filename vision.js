/* ══════════════════════════════════════════
   이력관리 (Vision 설비 이력) — vision.js
══════════════════════════════════════════ */

/* ── 전역 상태 ── */
var _visionEditMode = false;
var _visionSelId = null;
var _visionSearch = '';

/* Vision Type 색상 맵 */
var VI_TYPE_COLOR = {
  'Notching':    '#1a55bb',
  'Delamination':'#1a7a3a',
  'Foil':        '#7a5500',
  'NGMarking':   '#7a1a99',
  'DNC_Notching':'#0a6a7a',
  'DNC_Cutting': '#7a3a10'
};
function _viTypeColor(t){ return VI_TYPE_COLOR[t] || '#3a3a5a'; }

/* ── 유틸 ── */
function _viId(){ return 've' + Date.now() + Math.floor(Math.random()*1000); }
function _viItemsOf(cat){
  // 그룹 없는 카테고리: cat.items / 그룹 있는 카테고리: cat.groups
  return cat.items || [];
}

/* ══════════════════════════════════════════
   렌더링 — 진입점
══════════════════════════════════════════ */
function renderVisionTab(){
  renderVisionSidebar();
  renderVisionMain();
}

/* ── 사이드바 ── */
function renderVisionSidebar(){
  var sb = document.getElementById('visionSidebar');
  if(!sb) return;

  var search = _visionSearch.trim().toLowerCase();
  var equips = S.visionEquips.filter(function(e){
    if(!search) return true;
    var name = _viEquipName(e);
    var type = (e.data && e.data['vi_type']) || '';
    var site = (e.data && e.data['vi_site']) || e.siteId || '';
    return (name+type+site).toLowerCase().indexOf(search) >= 0;
  });

  // 사이트별 그룹핑
  var bysite = {};
  equips.forEach(function(e){
    var sid = e.siteId || '기타';
    if(!bysite[sid]) bysite[sid] = [];
    bysite[sid].push(e);
  });

  var siteKeys = Object.keys(bysite);
  // S.sites 순서 맞추기
  var orderedSites = S.sites.map(function(s){ return s.id; }).filter(function(id){ return bysite[id]; });
  siteKeys.forEach(function(k){ if(orderedSites.indexOf(k)<0) orderedSites.push(k); });

  var listHtml = '';
  orderedSites.forEach(function(sid){
    var site = S.sites.find(function(s){ return s.id===sid; });
    var sname = site ? site.name : sid;
    var scolor = site ? site.color : '#555';
    listHtml += '<div class="vi-sb-site-hdr" style="color:'+scolor+';border-left:3px solid '+scolor+';padding-left:8px">'+_esc(sname)+'</div>';
    bysite[sid].forEach(function(e){
      var sel = (e.id===_visionSelId) ? ' sel' : '';
      var type = (e.data && e.data['vi_type']) || '';
      var typeBadge = type ? '<span class="vi-type-badge" style="background:'+_viTypeColor(type)+'">'+_esc(type)+'</span>' : '';
      var sub = [(e.data&&e.data['vi_line'])||(e.data&&e.data['vi_site'])||'', (e.data&&e.data['vi_unit'])||''].filter(Boolean).join(' / ');
      listHtml += '<div class="vi-eq-card'+sel+'" onclick="selectVisionEquip(\''+e.id+'\')">'+
        '<div class="vi-eq-name">'+typeBadge+_esc(_viEquipName(e))+'</div>'+
        (sub?'<div class="vi-eq-sub">'+_esc(sub)+'</div>':'')+
        '</div>';
    });
  });

  if(!equips.length && !search){
    listHtml = '<div style="padding:20px 10px;text-align:center;color:#444;font-size:11px">등록된 설비가 없습니다</div>';
  } else if(!equips.length && search){
    listHtml = '<div style="padding:20px 10px;text-align:center;color:#444;font-size:11px">검색 결과 없음</div>';
  }

  sb.innerHTML =
    '<div class="vi-sb-head">'+
      '<span style="font-size:10px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.05em">설비 목록</span>'+
      '<button class="btn pri" onclick="openAddVisionEquip()" style="padding:2px 7px;font-size:10px">+ 추가</button>'+
    '</div>'+
    '<div style="padding:4px 8px 2px">'+
      '<input class="vi-sb-search" type="text" placeholder="검색 (이름/Type/사이트)" value="'+_esc(search)+'" oninput="_viSearchChange(this.value)">'+
    '</div>'+
    '<div class="vi-sb-body">'+listHtml+'</div>';
}

function _viSearchChange(v){
  _visionSearch = v;
  renderVisionSidebar();
}

function _viEquipName(e){
  var unit = (e.data && e.data['vi_unit']) || '';
  var sn   = (e.data && e.data['vi_sn'])   || '';
  if(unit) return unit + (sn ? ' ('+sn+')' : '');
  return sn || e.id;
}

/* ── 메인 영역 ── */
function renderVisionMain(){
  var main = document.getElementById('visionMain');
  if(!main) return;
  main.style.overflow = 'hidden';
  main.style.display = 'flex';
  main.style.flexDirection = 'column';
  if(!_visionSelId){
    main.innerHTML = '<div class="vi-empty"><span>설비를 선택하거나 새로 추가하세요</span><span class="vi-empty-sub">좌측 목록에서 설비를 선택하면 상세 정보가 표시됩니다</span></div>';
    return;
  }
  var equip = S.visionEquips.find(function(e){ return e.id===_visionSelId; });
  if(!equip){
    _visionSelId = null;
    main.innerHTML = '<div class="vi-empty"><span>설비를 선택하세요</span></div>';
    return;
  }
  main.innerHTML =
    '<div class="vi-main-inner'+ (_visionEditMode ? ' vi-tpl-on' : '') +'" id="visionFormWrap">'+
      _renderVisionEquipForm(equip)+
    '</div>'+
    '<div class="vi-footer">'+
      '<button class="btn pri" onclick="saveVisionEquipData()">저장</button>'+
      '<button class="btn red" onclick="delVisionEquip(\''+equip.id+'\')">삭제</button>'+
      '<span style="flex:1"></span>'+
      '<span style="font-size:10px;color:#444" id="viSaveTs">'+
        (equip.updatedAt ? '최종 저장: '+equip.updatedAt : '')+
      '</span>'+
    '</div>';
}

/* ── 설비 상세 폼 렌더링 ── */
function _renderVisionEquipForm(equip){
  var data = equip.data || {};
  var type = data['vi_type'] || '';
  var typeBadge = type ? '<span class="vi-type-badge" style="background:'+_viTypeColor(type)+'">'+_esc(type)+'</span>' : '';
  var site = S.sites.find(function(s){ return s.id===equip.siteId; });
  var siteName = site ? site.name : (equip.siteId || '');

  var html = '<div class="vi-equip-hdr">'+
    '<div class="vi-equip-title">'+typeBadge+_esc(_viEquipName(equip))+'</div>'+
    '<span class="vi-equip-meta">'+_esc(siteName)+'</span>'+
    '</div>';

  S.visionTemplate.categories.forEach(function(cat, ci){
    html += _renderViCategory(cat, data, ci);
  });

  if(_visionEditMode){
    html += '<button class="vi-tpl-add-btn" onclick="openAddVisionCategory()">+ 카테고리 추가</button>';
  }
  return html;
}

function _renderViCategory(cat, data, ci){
  var hasGroups = !!(cat.groups && cat.groups.length > 0);
  var bodyHtml = '';

  if(hasGroups){
    cat.groups.forEach(function(grp, gi){
      bodyHtml += _renderViGroup(cat, grp, data, ci, gi);
    });
    if(_visionEditMode){
      bodyHtml += '<button class="vi-tpl-add-btn" onclick="openAddVisionGroup(\''+cat.id+'\')">+ 그룹 추가</button>';
    }
  } else {
    var items = cat.items || [];
    items.forEach(function(item, ii){
      bodyHtml += _renderViItemRow(cat.id, null, item, data, ci, -1, ii);
    });
    if(_visionEditMode){
      bodyHtml += '<button class="vi-tpl-add-btn" onclick="openAddVisionItem(\''+cat.id+'\',\'\')">+ 항목 추가</button>';
    }
  }

  var ctrlHtml = '<div class="vi-cat-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViCategory('+ci+',-1)" title="위로">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViCategory('+ci+',1)" title="아래로">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openRenameViCategory(\''+cat.id+'\')" title="이름 변경">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViCategory(\''+cat.id+'\')" title="삭제">✕</button>'+
    '</div>';

  return '<div class="vi-cat" id="vicat_'+cat.id+'">'+
    '<div class="vi-cat-hdr" onclick="_toggleViCat(\''+cat.id+'\')">'+
      '<span class="vi-cat-arrow open" id="vicat_arr_'+cat.id+'">▶</span>'+
      '<span class="vi-cat-name">'+_esc(cat.name)+'</span>'+
      ctrlHtml+
    '</div>'+
    '<div class="vi-cat-body" id="vicat_body_'+cat.id+'">'+bodyHtml+'</div>'+
    '</div>';
}

function _renderViGroup(cat, grp, data, ci, gi){
  var items = grp.items || [];
  var itemsHtml = items.map(function(item, ii){
    return _renderViItemRow(cat.id, grp.id, item, data, ci, gi, ii);
  }).join('');

  if(_visionEditMode){
    itemsHtml += '<button class="vi-tpl-add-btn" onclick="openAddVisionItem(\''+cat.id+'\',\''+grp.id+'\')">+ 항목 추가</button>';
  }

  var ctrlHtml = '<div class="vi-grp-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViGroup(\''+cat.id+'\','+gi+',-1)" title="위로">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViGroup(\''+cat.id+'\','+gi+',1)" title="아래로">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openRenameViGroup(\''+cat.id+'\',\''+grp.id+'\')" title="이름 변경">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViGroup(\''+cat.id+'\',\''+grp.id+'\')" title="삭제">✕</button>'+
    '</div>';

  return '<div class="vi-grp" id="vigrp_'+grp.id+'">'+
    '<div class="vi-grp-hdr" onclick="_toggleViGrp(\''+grp.id+'\')">'+
      '<span class="vi-grp-arrow open" id="vigrp_arr_'+grp.id+'">▶</span>'+
      '<span class="vi-grp-name">'+_esc(grp.name)+'</span>'+
      ctrlHtml+
    '</div>'+
    '<div class="vi-grp-body" id="vigrp_body_'+grp.id+'">'+itemsHtml+'</div>'+
    '</div>';
}

function _renderViItemRow(catId, grpId, item, data, ci, gi, ii){
  var val = data[item.id] !== undefined ? data[item.id] : '';
  var grpArg = grpId ? '\''+grpId+'\'' : '\'\'';

  var ctrlHtml = '<div class="vi-item-ctrl">'+
    '<button class="vi-ctrl-btn" onclick="moveViItem(\''+catId+'\','+grpArg+',\''+item.id+'\',-1)" title="위로">▲</button>'+
    '<button class="vi-ctrl-btn" onclick="moveViItem(\''+catId+'\','+grpArg+',\''+item.id+'\',1)" title="아래로">▼</button>'+
    '<button class="vi-ctrl-btn" onclick="openEditViItem(\''+catId+'\','+grpArg+',\''+item.id+'\')" title="편집">✏</button>'+
    '<button class="vi-ctrl-btn del" onclick="delViItem(\''+catId+'\','+grpArg+',\''+item.id+'\')" title="삭제">✕</button>'+
    '</div>';

  return '<div class="vi-item-row">'+
    '<div class="vi-item-label">'+_esc(item.name)+'</div>'+
    '<div class="vi-item-input">'+_renderViInput(item, val)+'</div>'+
    ctrlHtml+
    '</div>';
}

/* ── 입력 타입별 렌더링 ── */
function _renderViInput(item, val){
  var id = 'viinp_'+item.id;
  switch(item.type){
    case 'select':  return _renderViSelect(item, val, id);
    case 'camera-sn': return _renderViCameraSn(item, val, id);
    case 'spec-qty':  return _renderViSpecQty(item, val, id);
    case 'ssd-multi': return _renderViSsdMulti(item, val, id);
    case 'lancard-multi': return _renderViLancardMulti(item, val, id);
    default: // text
      return '<input type="text" id="'+id+'" value="'+_esc(String(val||''))+'" placeholder="입력...">';
  }
}

function _renderViSelect(item, val, id){
  var opts = (item.options || []).map(function(o){
    return '<option value="'+_esc(o)+'"'+(val===o?' selected':'')+'>'+_esc(o)+'</option>';
  }).join('');
  var html = '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">'+
    '<select id="'+id+'" style="flex:1;min-width:120px">'+
      '<option value="">-- 선택 --</option>'+opts+
    '</select>';
  if(_visionEditMode){
    html += '<button class="vi-ctrl-btn" onclick="openAddSelectOption(\''+item.id+'\')" title="옵션 추가" style="border:1px dashed #3a3a5a;padding:3px 6px">+ 옵션</button>';
  }
  html += '</div>';
  // 현재 select 옵션 태그 표시 (편집 모드)
  if(_visionEditMode && item.options && item.options.length){
    html += '<div class="vi-sel-opts" style="margin-top:4px">'+
      item.options.map(function(o){
        return '<span class="vi-sel-opt-tag">'+_esc(o)+
          '<button class="vi-sel-opt-del" onclick="delSelectOption(\''+item.id+'\',\''+_esc(o)+'\')" title="옵션 삭제">×</button>'+
          '</span>';
      }).join('')+
    '</div>';
  }
  return html;
}

function _renderViCameraSn(item, val, id){
  // val = {count:N, sns:[...]} or ''
  var obj = (val && typeof val==='object') ? val : {count:0, sns:[]};
  var count = obj.count || 0;
  var sns = obj.sns || [];

  var snRows = '';
  for(var i=0;i<count;i++){
    snRows += '<div class="vi-cam-sn-item">'+
      '<label>CAM '+(i+1)+'</label>'+
      '<input type="text" class="vi-cam-sn-inp" data-idx="'+i+'" value="'+_esc(sns[i]||'')+'" placeholder="S/N">'+
      '</div>';
  }

  return '<div id="'+id+'_wrap">'+
    '<div class="vi-cam-qty-row">'+
      '<label>수량</label>'+
      '<input type="number" id="'+id+'_count" min="0" max="99" value="'+count+'" oninput="_viCamCountChange(\''+item.id+'\',this.value)" style="width:60px">'+
      '<span style="font-size:10px;color:#555">대</span>'+
    '</div>'+
    '<div class="vi-cam-sn-list" id="'+id+'_sns">'+snRows+'</div>'+
    '</div>';
}

function _renderViSpecQty(item, val, id){
  var obj = (val && typeof val==='object') ? val : {spec:'', qty:''};
  return '<div class="vi-spec-qty">'+
    '<input type="text" id="'+id+'_spec" class="spec-inp" value="'+_esc(obj.spec||'')+'" placeholder="사양">'+
    '<input type="number" id="'+id+'_qty" class="qty-inp" value="'+_esc(String(obj.qty||''))+'" min="0" placeholder="수량">'+
    '<span class="qty-lbl">EA</span>'+
    '</div>';
}

function _renderViSsdMulti(item, val, id){
  var rows = (Array.isArray(val) && val.length) ? val : [{capacity:'',qty:'',drive:''}];
  var thead = '<tr><th>용량</th><th style="width:55px">수량(EA)</th><th>드라이브</th><th style="width:24px"></th></tr>';
  var tbody = rows.map(function(r,i){
    return '<tr>'+
      '<td><input type="text" value="'+_esc(r.capacity||'')+'" placeholder="예: 1TB"></td>'+
      '<td><input type="number" value="'+_esc(String(r.qty||''))+'" min="0" placeholder="수량"></td>'+
      '<td><input type="text" value="'+_esc(r.drive||'')+'" placeholder="예: C:, D:"></td>'+
      '<td><button class="vi-multi-del-btn" onclick="_viSsdDelRow(\''+id+'\','+i+')">✕</button></td>'+
      '</tr>';
  }).join('');
  return '<table class="vi-multi-table" id="'+id+'_tbl"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table>'+
    '<button class="vi-add-row-btn" onclick="_viSsdAddRow(\''+id+'\')">+ 행 추가</button>';
}

function _renderViLancardMulti(item, val, id){
  var rows = (Array.isArray(val) && val.length) ? val : [{speed:'',ports:'',purpose:''}];
  var thead = '<tr><th>속도</th><th style="width:55px">PORT 수</th><th>사용 목적</th><th style="width:24px"></th></tr>';
  var tbody = rows.map(function(r,i){
    return '<tr>'+
      '<td><input type="text" value="'+_esc(r.speed||'')+'" placeholder="예: 1Gbps"></td>'+
      '<td><input type="number" value="'+_esc(String(r.ports||''))+'" min="0" placeholder="수"></td>'+
      '<td><input type="text" value="'+_esc(r.purpose||'')+'" placeholder="예: 카메라"></td>'+
      '<td><button class="vi-multi-del-btn" onclick="_viLanDelRow(\''+id+'\','+i+')">✕</button></td>'+
      '</tr>';
  }).join('');
  return '<table class="vi-multi-table" id="'+id+'_tbl"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table>'+
    '<button class="vi-add-row-btn" onclick="_viLanAddRow(\''+id+'\')">+ 행 추가</button>';
}

/* ── 동적 행 추가/삭제 헬퍼 ── */
function _viCamCountChange(itemId, val){
  var count = parseInt(val) || 0;
  if(count < 0) count = 0;
  if(count > 50) count = 50;
  var id = 'viinp_'+itemId;
  var snList = document.getElementById(id+'_sns');
  if(!snList) return;
  var existing = snList.querySelectorAll('.vi-cam-sn-item');
  var cur = existing.length;
  // 줄이기
  while(cur > count){ snList.removeChild(snList.lastChild); cur--; }
  // 늘리기
  while(cur < count){
    var div = document.createElement('div');
    div.className = 'vi-cam-sn-item';
    div.innerHTML = '<label>CAM '+(cur+1)+'</label><input type="text" class="vi-cam-sn-inp" data-idx="'+cur+'" value="" placeholder="S/N">';
    snList.appendChild(div);
    cur++;
  }
}

function _viSsdAddRow(id){
  var tbody = document.querySelector('#'+id+'_tbl tbody');
  if(!tbody) return;
  var idx = tbody.rows.length;
  var tr = document.createElement('tr');
  tr.innerHTML = '<td><input type="text" value="" placeholder="예: 1TB"></td>'+
    '<td><input type="number" value="" min="0" placeholder="수량"></td>'+
    '<td><input type="text" value="" placeholder="예: C:, D:"></td>'+
    '<td><button class="vi-multi-del-btn" onclick="_viSsdDelRow(\''+id+'\','+idx+')">✕</button></td>';
  tbody.appendChild(tr);
  _viReindexDelBtns(id+'_tbl', '_viSsdDelRow', id);
}
function _viSsdDelRow(id, idx){
  var tbody = document.querySelector('#'+id+'_tbl tbody');
  if(!tbody || tbody.rows.length <= 1) return;
  tbody.deleteRow(idx);
  _viReindexDelBtns(id+'_tbl', '_viSsdDelRow', id);
}
function _viLanAddRow(id){
  var tbody = document.querySelector('#'+id+'_tbl tbody');
  if(!tbody) return;
  var idx = tbody.rows.length;
  var tr = document.createElement('tr');
  tr.innerHTML = '<td><input type="text" value="" placeholder="예: 1Gbps"></td>'+
    '<td><input type="number" value="" min="0" placeholder="수"></td>'+
    '<td><input type="text" value="" placeholder="예: 카메라"></td>'+
    '<td><button class="vi-multi-del-btn" onclick="_viLanDelRow(\''+id+'\','+idx+')">✕</button></td>';
  tbody.appendChild(tr);
  _viReindexDelBtns(id+'_tbl', '_viLanDelRow', id);
}
function _viLanDelRow(id, idx){
  var tbody = document.querySelector('#'+id+'_tbl tbody');
  if(!tbody || tbody.rows.length <= 1) return;
  tbody.deleteRow(idx);
  _viReindexDelBtns(id+'_tbl', '_viLanDelRow', id);
}
function _viReindexDelBtns(tblId, fnName, id){
  var tbody = document.querySelector('#'+tblId+' tbody');
  if(!tbody) return;
  Array.prototype.forEach.call(tbody.rows, function(tr, i){
    var btn = tr.querySelector('.vi-multi-del-btn');
    if(btn) btn.setAttribute('onclick', fnName+'(\''+id+'\','+i+')');
  });
}

/* ── 접기/펼치기 ── */
function _toggleViCat(catId){
  var body = document.getElementById('vicat_body_'+catId);
  var arr  = document.getElementById('vicat_arr_'+catId);
  if(!body) return;
  var collapsed = body.classList.toggle('collapsed');
  if(arr){ if(collapsed) arr.classList.remove('open'); else arr.classList.add('open'); }
}
function _toggleViGrp(grpId){
  var body = document.getElementById('vigrp_body_'+grpId);
  var arr  = document.getElementById('vigrp_arr_'+grpId);
  if(!body) return;
  var collapsed = body.classList.toggle('collapsed');
  if(arr){ if(collapsed) arr.classList.remove('open'); else arr.classList.add('open'); }
}

/* ══════════════════════════════════════════
   설비 CRUD
══════════════════════════════════════════ */
function selectVisionEquip(id){
  _visionSelId = id;
  renderVisionSidebar();
  renderVisionMain();
}

function openAddVisionEquip(){
  var siteOpts = S.sites.map(function(s){
    return '<option value="'+s.id+'">'+_esc(s.name)+'</option>';
  }).join('');
  mw('<div class="mtit">📋 설비 추가</div>'+
    '<div class="fg"><label class="fl">사이트</label>'+
      '<select id="vi_new_site"><option value="">-- 선택 --</option>'+siteOpts+'</select></div>'+
    '<div class="fg"><label class="fl">호기명</label>'+
      '<input type="text" id="vi_new_unit" placeholder="예: Anode"></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doAddVisionEquip()">추가</button>'+
    '</div>');
}
function _doAddVisionEquip(){
  var siteId = document.getElementById('vi_new_site').value;
  var unit   = document.getElementById('vi_new_unit').value.trim();
  if(!siteId){ alert('사이트를 선택해주세요.'); return; }
  var site = S.sites.find(function(s){ return s.id===siteId; });
  var equip = {
    id: _viId(),
    siteId: siteId,
    createdAt: _viToday(),
    updatedAt: _viToday(),
    data: {
      'vi_site': site ? site.name : siteId,
      'vi_unit': unit
    }
  };
  S.visionEquips.push(equip);
  _visionSelId = equip.id;
  saveData();
  cm();
  renderVisionTab();
}

/* ── 데이터 수집 및 저장 ── */
function saveVisionEquipData(){
  var equip = S.visionEquips.find(function(e){ return e.id===_visionSelId; });
  if(!equip) return;
  var data = _collectVisionFormData();
  equip.data = data;
  equip.updatedAt = _viToday();
  // siteId를 vi_site 선택값 기준 사이트 ID로 동기화
  var siteName = data['vi_site'] || '';
  var matchSite = S.sites.find(function(s){ return s.name===siteName||s.id===siteName; });
  if(matchSite) equip.siteId = matchSite.id;
  saveData();
  var ts = document.getElementById('viSaveTs');
  if(ts) ts.textContent = '최종 저장: '+equip.updatedAt;
  renderVisionSidebar(); // 카드명 반영
}

function _collectVisionFormData(){
  var data = {};
  S.visionTemplate.categories.forEach(function(cat){
    var itemsList = cat.items || [];
    if(cat.groups){ cat.groups.forEach(function(g){ itemsList = itemsList.concat(g.items||[]); }); }
    itemsList.forEach(function(item){
      data[item.id] = _collectViField(item);
    });
  });
  return data;
}

function _collectViField(item){
  var id = 'viinp_'+item.id;
  switch(item.type){
    case 'select':{
      var sel = document.getElementById(id);
      return sel ? sel.value : '';
    }
    case 'camera-sn':{
      var countEl = document.getElementById(id+'_count');
      var count = countEl ? (parseInt(countEl.value)||0) : 0;
      var sns = [];
      var snInps = document.querySelectorAll('#'+id+'_sns .vi-cam-sn-inp');
      for(var i=0;i<snInps.length;i++) sns.push(snInps[i].value);
      return {count:count, sns:sns};
    }
    case 'spec-qty':{
      var specEl = document.getElementById(id+'_spec');
      var qtyEl  = document.getElementById(id+'_qty');
      return {spec: specEl?specEl.value:'', qty: qtyEl?qtyEl.value:''};
    }
    case 'ssd-multi': return _collectMultiTable(id+'_tbl',['capacity','qty','drive']);
    case 'lancard-multi': return _collectMultiTable(id+'_tbl',['speed','ports','purpose']);
    default:{
      var el = document.getElementById(id);
      return el ? el.value : '';
    }
  }
}

function _collectMultiTable(tblId, fields){
  var rows = [];
  var tbody = document.querySelector('#'+tblId+' tbody');
  if(!tbody) return rows;
  Array.prototype.forEach.call(tbody.rows, function(tr){
    var inputs = tr.querySelectorAll('input');
    var obj = {};
    fields.forEach(function(f,i){ obj[f] = inputs[i] ? inputs[i].value : ''; });
    rows.push(obj);
  });
  return rows;
}

function delVisionEquip(id){
  var equip = S.visionEquips.find(function(e){ return e.id===id; });
  var name = equip ? _viEquipName(equip) : id;
  if(!confirm('['+name+'] 설비를 삭제하시겠습니까?')) return;
  S.visionEquips = S.visionEquips.filter(function(e){ return e.id!==id; });
  _visionSelId = null;
  saveData();
  renderVisionTab();
}

/* ══════════════════════════════════════════
   설비진행율에서 가져오기
══════════════════════════════════════════ */
function openVisionImport(){
  if(!S.equipUnits || !S.equipUnits.length){
    alert('설비 진행율에 등록된 호기가 없습니다.');
    return;
  }
  var listHtml = S.equipUnits.map(function(u){
    var site = S.sites.find(function(s){ return s.id===u.siteId; });
    var siteName = site ? site.name : (u.siteId||'');
    var label = [u.lineName, u.unitName].filter(Boolean).join(' / ');
    return '<label class="vi-import-item">'+
      '<input type="checkbox" class="vi-import-chk" value="'+u.id+'">'+
      '<span class="vi-import-label">'+_esc(label)+'</span>'+
      '<span class="vi-import-sub">'+_esc(siteName)+'</span>'+
      '</label>';
  }).join('');

  mw('<div class="mtit">설비진행율 → 이력관리 가져오기</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:6px">선택한 호기의 기본정보(사이트/라인/호기)를 복사하여 새 설비 레코드를 생성합니다.</div>'+
    '<div class="vi-import-list">'+listHtml+'</div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doVisionImport()">가져오기</button>'+
    '</div>');
}
function _doVisionImport(){
  var chks = document.querySelectorAll('.vi-import-chk:checked');
  if(!chks.length){ alert('가져올 호기를 선택해주세요.'); return; }
  var added = 0;
  Array.prototype.forEach.call(chks, function(chk){
    var unit = S.equipUnits.find(function(u){ return u.id===chk.value; });
    if(!unit) return;
    var site = S.sites.find(function(s){ return s.id===unit.siteId; });
    var equip = {
      id: _viId(),
      siteId: unit.siteId || '',
      createdAt: _viToday(),
      updatedAt: _viToday(),
      data: {
        'vi_site': site ? site.name : (unit.siteId||''),
        'vi_line': unit.lineName || '',
        'vi_unit': unit.unitName || ''
      }
    };
    S.visionEquips.push(equip);
    added++;
  });
  saveData();
  cm();
  renderVisionTab();
  if(added) alert(added+'개 설비를 가져왔습니다.');
}

/* ══════════════════════════════════════════
   템플릿 편집 모드
══════════════════════════════════════════ */
function toggleVisionTemplateEdit(){
  _visionEditMode = !_visionEditMode;
  var btn = document.getElementById('btnVisionTplEdit');
  if(btn){
    btn.textContent = _visionEditMode ? '편집 완료' : '템플릿 편집';
    btn.className = _visionEditMode ? 'btn warn' : 'btn';
  }
  renderVisionMain();
}

/* ── 카테고리 ── */
function openAddVisionCategory(){
  mw('<div class="mtit">카테고리 추가</div>'+
    '<div class="fg"><label class="fl">카테고리명</label>'+
      '<input type="text" id="vi_new_cat_name" placeholder="예: 소프트웨어"></div>'+
    '<div class="fg"><label class="fl">구조</label>'+
      '<select id="vi_new_cat_type">'+
        '<option value="items">항목만 (그룹 없음)</option>'+
        '<option value="groups">그룹 포함</option>'+
      '</select></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doAddViCategory()">추가</button>'+
    '</div>');
}
function _doAddViCategory(){
  var name = document.getElementById('vi_new_cat_name').value.trim();
  var type = document.getElementById('vi_new_cat_type').value;
  if(!name){ alert('카테고리명을 입력해주세요.'); return; }
  var maxOrder = S.visionTemplate.categories.reduce(function(m,c){ return Math.max(m,c.order||0); }, -1);
  var cat = {id:'vc_'+Date.now(), name:name, order:maxOrder+1};
  if(type==='groups') cat.groups = [];
  else cat.items = [];
  S.visionTemplate.categories.push(cat);
  saveData(); cm(); renderVisionMain();
}

function openRenameViCategory(catId){
  var cat = _findCat(catId);
  if(!cat) return;
  mw('<div class="mtit">카테고리 이름 변경</div>'+
    '<div class="fg"><label class="fl">카테고리명</label>'+
      '<input type="text" id="vi_ren_cat" value="'+_esc(cat.name)+'"></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doRenameViCat(\''+catId+'\')">저장</button>'+
    '</div>');
}
function _doRenameViCat(catId){
  var name = document.getElementById('vi_ren_cat').value.trim();
  if(!name) return;
  var cat = _findCat(catId);
  if(cat) cat.name = name;
  saveData(); cm(); renderVisionMain();
}

function delViCategory(catId){
  var cat = _findCat(catId);
  if(!cat) return;
  var itemCount = _countCatItems(cat);
  var msg = '['+cat.name+'] 카테고리를 삭제하시겠습니까?';
  if(itemCount) msg += '\n이 카테고리에는 항목이 '+itemCount+'개 있습니다.\n기존 설비의 해당 데이터는 보존됩니다.';
  if(!confirm(msg)) return;
  S.visionTemplate.categories = S.visionTemplate.categories.filter(function(c){ return c.id!==catId; });
  saveData(); renderVisionMain();
}
function _countCatItems(cat){
  if(cat.items) return cat.items.length;
  if(cat.groups) return cat.groups.reduce(function(s,g){ return s+(g.items?g.items.length:0); },0);
  return 0;
}

function moveViCategory(ci, dir){
  var cats = S.visionTemplate.categories;
  var ni = ci+dir;
  if(ni<0||ni>=cats.length) return;
  var tmp=cats[ci]; cats[ci]=cats[ni]; cats[ni]=tmp;
  saveData(); renderVisionMain();
}

/* ── 그룹 ── */
function openAddVisionGroup(catId){
  mw('<div class="mtit">그룹 추가</div>'+
    '<div class="fg"><label class="fl">그룹명</label>'+
      '<input type="text" id="vi_new_grp_name" placeholder="예: LIGHTING"></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doAddViGroup(\''+catId+'\')">추가</button>'+
    '</div>');
}
function _doAddViGroup(catId){
  var name = document.getElementById('vi_new_grp_name').value.trim();
  if(!name){ alert('그룹명을 입력해주세요.'); return; }
  var cat = _findCat(catId);
  if(!cat) return;
  if(!cat.groups) cat.groups = [];
  var maxOrder = cat.groups.reduce(function(m,g){ return Math.max(m,g.order||0); },-1);
  cat.groups.push({id:'vg_'+Date.now(), name:name, order:maxOrder+1, items:[]});
  saveData(); cm(); renderVisionMain();
}

function openRenameViGroup(catId, grpId){
  var grp = _findGrp(catId, grpId);
  if(!grp) return;
  mw('<div class="mtit">그룹 이름 변경</div>'+
    '<div class="fg"><label class="fl">그룹명</label>'+
      '<input type="text" id="vi_ren_grp" value="'+_esc(grp.name)+'"></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doRenameViGrp(\''+catId+'\',\''+grpId+'\')">저장</button>'+
    '</div>');
}
function _doRenameViGrp(catId, grpId){
  var name = document.getElementById('vi_ren_grp').value.trim();
  if(!name) return;
  var grp = _findGrp(catId, grpId);
  if(grp) grp.name = name;
  saveData(); cm(); renderVisionMain();
}

function delViGroup(catId, grpId){
  var cat = _findCat(catId);
  var grp = _findGrp(catId, grpId);
  if(!cat||!grp) return;
  var itemCount = grp.items ? grp.items.length : 0;
  var msg = '['+grp.name+'] 그룹을 삭제하시겠습니까?';
  if(itemCount) msg += '\n이 그룹에는 항목이 '+itemCount+'개 있습니다.\n기존 설비의 해당 데이터는 보존됩니다.';
  if(!confirm(msg)) return;
  cat.groups = cat.groups.filter(function(g){ return g.id!==grpId; });
  saveData(); renderVisionMain();
}

function moveViGroup(catId, gi, dir){
  var cat = _findCat(catId);
  if(!cat||!cat.groups) return;
  var grps = cat.groups;
  var ni = gi+dir;
  if(ni<0||ni>=grps.length) return;
  var tmp=grps[gi]; grps[gi]=grps[ni]; grps[ni]=tmp;
  saveData(); renderVisionMain();
}

/* ── 항목 ── */
var _VI_TYPES = [
  {val:'text',       lbl:'텍스트'},
  {val:'select',     lbl:'선택 (드롭다운)'},
  {val:'camera-sn',  lbl:'카메라 S/N (수량+S/N 목록)'},
  {val:'spec-qty',   lbl:'사양+수량'},
  {val:'ssd-multi',  lbl:'SSD (용량/수량/드라이브)'},
  {val:'lancard-multi',lbl:'랜카드 (속도/PORT/목적)'}
];

function openAddVisionItem(catId, grpId){
  var typeOpts = _VI_TYPES.map(function(t){
    return '<option value="'+t.val+'">'+t.lbl+'</option>';
  }).join('');
  mw('<div class="mtit">항목 추가</div>'+
    '<div class="fg"><label class="fl">항목명</label>'+
      '<input type="text" id="vi_new_item_name" placeholder="예: 버전"></div>'+
    '<div class="fg"><label class="fl">입력 타입</label>'+
      '<select id="vi_new_item_type">'+typeOpts+'</select></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doAddViItem(\''+catId+'\',\''+grpId+'\')">추가</button>'+
    '</div>');
}
function _doAddViItem(catId, grpId){
  var name = document.getElementById('vi_new_item_name').value.trim();
  var type = document.getElementById('vi_new_item_type').value;
  if(!name){ alert('항목명을 입력해주세요.'); return; }
  var itemsList = _getItemsList(catId, grpId||'');
  if(!itemsList) return;
  var maxOrder = itemsList.reduce(function(m,i){ return Math.max(m,i.order||0); },-1);
  var newItem = {id:'vi_'+Date.now(), name:name, type:type, order:maxOrder+1};
  if(type==='select') newItem.options = [];
  itemsList.push(newItem);
  saveData(); cm(); renderVisionMain();
}

function openEditViItem(catId, grpId, itemId){
  var item = _findItem(catId, grpId, itemId);
  if(!item) return;
  var typeOpts = _VI_TYPES.map(function(t){
    return '<option value="'+t.val+'"'+(item.type===t.val?' selected':'')+'>'+t.lbl+'</option>';
  }).join('');
  mw('<div class="mtit">항목 편집</div>'+
    '<div class="fg"><label class="fl">항목명</label>'+
      '<input type="text" id="vi_edit_item_name" value="'+_esc(item.name)+'"></div>'+
    '<div class="fg"><label class="fl">입력 타입</label>'+
      '<select id="vi_edit_item_type">'+typeOpts+'</select></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doEditViItem(\''+catId+'\',\''+grpId+'\',\''+itemId+'\')">저장</button>'+
    '</div>');
}
function _doEditViItem(catId, grpId, itemId){
  var name = document.getElementById('vi_edit_item_name').value.trim();
  var type = document.getElementById('vi_edit_item_type').value;
  if(!name){ alert('항목명을 입력해주세요.'); return; }
  var item = _findItem(catId, grpId, itemId);
  if(!item) return;
  item.name = name;
  if(item.type!==type){
    item.type = type;
    if(type==='select' && !item.options) item.options=[];
  }
  saveData(); cm(); renderVisionMain();
}

function delViItem(catId, grpId, itemId){
  var item = _findItem(catId, grpId, itemId);
  if(!item) return;
  // 기존 데이터가 있는 설비 수 확인
  var affected = S.visionEquips.filter(function(e){
    return e.data && e.data[itemId] !== undefined && e.data[itemId] !== '' && e.data[itemId] !== null;
  }).length;
  var msg = '['+item.name+'] 항목을 삭제하시겠습니까?';
  if(affected) msg += '\n데이터가 입력된 설비 '+affected+'개가 있습니다.\n기존 데이터는 보존됩니다(화면에서만 숨겨짐).';
  if(!confirm(msg)) return;
  var list = _getItemsList(catId, grpId);
  if(!list) return;
  var idx = list.findIndex ? list.findIndex(function(i){ return i.id===itemId; })
    : (function(){ for(var x=0;x<list.length;x++) if(list[x].id===itemId) return x; return -1; })();
  if(idx>=0) list.splice(idx,1);
  saveData(); renderVisionMain();
}

function moveViItem(catId, grpId, itemId, dir){
  var list = _getItemsList(catId, grpId);
  if(!list) return;
  var idx = -1;
  for(var i=0;i<list.length;i++) if(list[i].id===itemId){ idx=i; break; }
  if(idx<0) return;
  var ni = idx+dir;
  if(ni<0||ni>=list.length) return;
  var tmp=list[idx]; list[idx]=list[ni]; list[ni]=tmp;
  saveData(); renderVisionMain();
}

/* ── select 옵션 관리 ── */
function openAddSelectOption(itemId){
  mw('<div class="mtit">드롭다운 옵션 추가</div>'+
    '<div class="fg"><label class="fl">옵션명</label>'+
      '<input type="text" id="vi_new_opt" placeholder="예: Winding"></div>'+
    '<div class="mfoot">'+
      '<button class="btn sm" onclick="cm()">취소</button>'+
      '<button class="btn sm pri" onclick="_doAddSelectOption(\''+itemId+'\')">추가</button>'+
    '</div>');
}
function _doAddSelectOption(itemId){
  var val = document.getElementById('vi_new_opt').value.trim();
  if(!val){ alert('옵션명을 입력해주세요.'); return; }
  var item = _findItemById(itemId);
  if(!item) return;
  if(!item.options) item.options=[];
  if(item.options.indexOf(val)>=0){ alert('이미 존재하는 옵션입니다.'); return; }
  item.options.push(val);
  saveData(); cm(); renderVisionMain();
}
function delSelectOption(itemId, optVal){
  var item = _findItemById(itemId);
  if(!item||!item.options) return;
  item.options = item.options.filter(function(o){ return o!==optVal; });
  saveData(); renderVisionMain();
}

/* ══════════════════════════════════════════
   CSV 스텁
══════════════════════════════════════════ */
function exportVisionCSV(){
  alert('CSV 내보내기 기능은 추후 업데이트 예정입니다.\n현재 데이터는 localStorage 및 Google Sheets에 저장되어 있습니다.');
}
function openVisionCsvImport(){
  alert('CSV 가져오기 기능은 추후 업데이트 예정입니다.\n현재는 수동 입력 또는 "진행율 가져오기" 기능을 사용해주세요.');
}

/* ══════════════════════════════════════════
   유틸 헬퍼
══════════════════════════════════════════ */
function _esc(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function _viToday(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function _findCat(catId){
  return S.visionTemplate.categories.find(function(c){ return c.id===catId; }) || null;
}
function _findGrp(catId, grpId){
  var cat = _findCat(catId);
  if(!cat||!cat.groups) return null;
  return cat.groups.find(function(g){ return g.id===grpId; }) || null;
}
function _findItem(catId, grpId, itemId){
  var list = _getItemsList(catId, grpId);
  if(!list) return null;
  return list.find(function(i){ return i.id===itemId; }) || null;
}
function _findItemById(itemId){
  // 전체 카테고리/그룹을 순회하며 item 찾기
  var found = null;
  S.visionTemplate.categories.forEach(function(cat){
    if(found) return;
    if(cat.items){
      var i = cat.items.find(function(x){ return x.id===itemId; });
      if(i) found=i;
    }
    if(cat.groups) cat.groups.forEach(function(grp){
      if(found) return;
      var i = (grp.items||[]).find(function(x){ return x.id===itemId; });
      if(i) found=i;
    });
  });
  return found;
}
function _getItemsList(catId, grpId){
  var cat = _findCat(catId);
  if(!cat) return null;
  if(grpId){
    var grp = _findGrp(catId, grpId);
    if(!grp) return null;
    if(!grp.items) grp.items=[];
    return grp.items;
  }
  if(!cat.items) cat.items=[];
  return cat.items;
}
