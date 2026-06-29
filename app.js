// ════════════════════════════════════════
// ⚙️ Supabase 설정 — 본인 값으로 교체
// ════════════════════════════════════════
const SUPABASE_URL      = 'https://kiyztxxvynsrjusqlirt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CY7UqYJoq4kY1JfpuFY72g_PAWZFgTT';
// ════════════════════════════════════════

const ITEMS_TBL   = 'purchase_items';
const STATUS_TBL  = 'doc_status';
const PRQ_LOG_TBL = 'prq_log';
const SITES_TBL   = 'sites';

let sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch(e) {}

// 전역 상태
let gStatusMap   = {};   // doc_no → status row
let gModalDocNo  = null; // 현재 열린 모달의 doc_no
let gUploadDocNo = '';
let gUploadPrqNo = '';
let gUploadUser  = '';
let gUploadDate  = '';
let gLastFilteredItems = [];  // 마지막 검색 결과 품목 전체
let gLastGroups        = {};  // 마지막 그룹맵
let gLastFiltered      = [];  // 마지막 filtered doc_no 배열
let gCurrentView       = 'doc'; // 현재 뷰 ('doc' | 'all')
let gDashData          = null;  // 대시보드 캐시 데이터
let gDashFr            = [];    // 대시보드 파이프라인용 field_requests 캐시
let gDashStatuses      = [];    // 대시보드 파이프라인용 standalone doc_status 캐시
let _activePipeStep    = 0;     // 현재 선택된 파이프라인 단계

// ── 알림 접기/펼치기 ──
let alertCollapsed = false;
document.getElementById('alertToggle').addEventListener('click', () => {
  alertCollapsed = !alertCollapsed;
  document.getElementById('alertList').classList.toggle('collapsed', alertCollapsed);
  document.getElementById('alertArrow').textContent = alertCollapsed ? '▼' : '▲';
});

// ══════════════════════════════════════════════════════
// 탭 전환
// ══════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return;
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pane-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'list') loadList();
    if (btn.dataset.tab === 'dashboard') loadDashboard();
    if (btn.dataset.tab === 'field') loadFieldTab();
  });
});

// ══════════════════════════════════════════════════════
// 업로드 탭
// ══════════════════════════════════════════════════════
const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const loadingMsg = document.getElementById('loadingMsg');

['dragenter','dragover','dragleave','drop'].forEach(ev =>
  window.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false)
);
dropZone.addEventListener('dragover',  () => dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', e => {
  if (!['INPUT','BUTTON'].includes(e.target.tagName)) fileInput.click();
});
document.getElementById('selectFileBtn').addEventListener('click', e => {
  e.stopPropagation(); fileInput.click();
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
document.getElementById('addRowBtn').addEventListener('click', () => appendPreviewRow({}));
document.getElementById('saveUploadBtn').addEventListener('click', saveUpload);

// ── 서브탭 전환 ──
function switchSubTab(tab) {
  document.getElementById('subPaneHtml').style.display   = tab === 'html'   ? '' : 'none';
  document.getElementById('subPaneManual').style.display = tab === 'manual' ? '' : 'none';
  document.getElementById('subPaneCheck').style.display  = tab === 'check'  ? '' : 'none';
  document.getElementById('subTabHtml').classList.toggle('active',   tab === 'html');
  document.getElementById('subTabManual').classList.toggle('active', tab === 'manual');
  document.getElementById('subTabCheck').classList.toggle('active',  tab === 'check');
  if (tab === 'manual') initManualTab();
}

// ── 수동 입력 초기화: 빈 행 1개 준비 ──
function initManualTab() {
  const tbody = document.getElementById('manualBody');
  if (tbody.querySelectorAll('tr').length === 0) appendManualRow();
}

function appendManualRow(item) {
  item = item || {};
  const tbody = document.getElementById('manualBody');
  const tr = document.createElement('tr');
  const mk = (k, val, type) =>
    `<td><input class="editable" data-k="${k}" type="${type||'text'}" value="${esc(val||'')}" ${type==='number'?'min="0"':''}></td>`;
  tr.innerHTML =
    mk('p_name', item.p_name) +
    mk('p_code', item.p_code) +
    mk('name',   item.name)   +
    mk('spec',   item.spec)   +
    mk('qty',    item.qty, 'number') +
    `<td><button class="btn btn-danger btn-sm" type="button">삭제</button></td>`;
  tr.querySelector('.btn-danger').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

document.getElementById('manualAddRowBtn').addEventListener('click', () => appendManualRow());

document.getElementById('manualSaveBtn').addEventListener('click', async () => {
  if (!sb) { showToast('Supabase 미연결', 'error'); return; }

  const docNo = document.getElementById('mDocNoInput').value.trim();
  const user  = document.getElementById('mUserInput').value.trim();
  const date  = document.getElementById('mDateInput').value.trim();
  const prqNo = document.getElementById('mPrqNoInput').value.trim();

  if (!docNo) { showToast('문서번호를 입력하세요.', 'error'); return; }

  const rows = document.getElementById('manualBody').querySelectorAll('tr');
  if (!rows.length) { showToast('등록할 품목이 없습니다.', 'error'); return; }

  const btn = document.getElementById('manualSaveBtn');
  btn.disabled = true;
  try {
    const chk = await sb.from(ITEMS_TBL).select('id', { count:'exact', head:true }).eq('doc_no', docNo);
    if (chk.error) throw chk.error;
    if (chk.count > 0) { showToast('⚠️ 이미 존재하는 문서번호입니다: ' + docNo, 'error'); return; }

    const now = new Date().toISOString();
    const items = Array.from(rows).map(tr => {
      const obj = { doc_no: docNo, prq_no: prqNo || null, requester: user, doc_date: date || null, uploaded_at: now };
      tr.querySelectorAll('.editable').forEach(inp => {
        obj[inp.dataset.k] = inp.dataset.k === 'qty' ? (Number(inp.value)||0) : inp.value.trim();
      });
      return obj;
    });

    const { error } = await sb.from(ITEMS_TBL).insert(items);
    if (error) throw error;

    showToast(`✅ [${docNo}] ${items.length}건 저장 완료`, 'success');
    if (prqNo) await linkPrqToDoc(prqNo, docNo);

    // 폼 초기화
    document.getElementById('mDocNoInput').value  = '';
    document.getElementById('mUserInput').value   = '';
    document.getElementById('mDateInput').value   = '';
    document.getElementById('mPrqNoInput').value  = '';
    document.getElementById('manualBody').innerHTML = '';
    appendManualRow();
  } catch(err) {
    showToast('❌ ' + (err.message||err), 'error');
  } finally {
    btn.disabled = false;
  }
});

async function handleFile(file) {
  loadingMsg.classList.add('show');
  try {
    const html = await file.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const text = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('HTML에서 텍스트를 추출할 수 없습니다.');

    const res  = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');
    renderUpload(data);
    showToast(data.items.length + '개 품목 추출 완료', 'success');
  } catch(err) {
    showToast('⚠️ ' + err.message, 'error');
  } finally {
    loadingMsg.classList.remove('show');
    fileInput.value = '';
  }
}

function renderUpload(data) {
  gUploadDocNo = data.doc_no || '';
  gUploadPrqNo = data.prq_no || '';
  gUploadUser  = data.user   || '';
  gUploadDate  = data.date   || '';
  document.getElementById('pvDocNo').textContent = gUploadDocNo || '-';
  document.getElementById('pvPrqNo').value       = gUploadPrqNo;
  document.getElementById('pvUser').textContent  = gUploadUser  || '-';
  document.getElementById('pvDate').textContent  = gUploadDate  || '-';
  document.getElementById('pvCount').textContent = (data.items || []).length;
  document.getElementById('previewHeader').classList.add('show');
  document.getElementById('previewBody').innerHTML = '';
  (data.items || []).forEach(item => appendPreviewRow(item));
  document.getElementById('previewTbl').style.display = 'block';
  document.getElementById('actionBar').classList.add('show');
}

function appendPreviewRow(item) {
  item = item || {};
  const tr = document.createElement('tr');
  const mk = (k, val, type) =>
    `<td><input class="editable" data-k="${k}" type="${type||'text'}" value="${esc(val||'')}" ${type==='number'?'min="0"':''}></td>`;
  tr.innerHTML =
    mk('p_name', item.p_name) +
    mk('p_code', item.p_code) +
    mk('name',   item.name)   +
    mk('spec',   item.spec)   +
    mk('qty',    item.qty, 'number') +
    `<td><button class="btn btn-danger btn-sm" type="button">삭제</button></td>`;
  tr.querySelector('.btn-danger').addEventListener('click', () => {
    tr.remove();
    document.getElementById('pvCount').textContent =
      document.getElementById('previewBody').querySelectorAll('tr').length;
  });
  document.getElementById('previewBody').appendChild(tr);
  document.getElementById('pvCount').textContent =
    document.getElementById('previewBody').querySelectorAll('tr').length;
}

async function saveUpload() {
  if (!sb) { showToast('Supabase 미연결', 'error'); return; }
  if (!gUploadDocNo) { showToast('문서번호가 없습니다.', 'error'); return; }
  const rows = document.getElementById('previewBody').querySelectorAll('tr');
  if (!rows.length) { showToast('저장할 품목이 없습니다.', 'error'); return; }

  gUploadPrqNo = document.getElementById('pvPrqNo').value.trim();

  const btn = document.getElementById('saveUploadBtn');
  btn.disabled = true;
  try {
    const chk = await sb.from(ITEMS_TBL).select('prq_no', { count:'exact' }).eq('doc_no', gUploadDocNo).limit(1);
    if (chk.error) throw chk.error;
    if (chk.count > 0) {
      const existingPrqNo = chk.data?.[0]?.prq_no;
      if (!existingPrqNo && gUploadPrqNo) {
        if (!confirm(`[${gUploadDocNo}] 이미 등록된 문서입니다.\n구매요청번호(${gUploadPrqNo})만 업데이트하시겠습니까?`)) return;
        const { error: upErr } = await sb.from(ITEMS_TBL)
          .update({ prq_no: gUploadPrqNo })
          .eq('doc_no', gUploadDocNo)
          .is('prq_no', null);
        if (upErr) throw upErr;
        showToast(`✅ [${gUploadDocNo}] 구매요청번호 업데이트 완료`, 'success');
        return;
      }
      showToast('⚠️ 이미 존재하는 문서번호입니다: ' + gUploadDocNo, 'error');
      return;
    }

    const items = Array.from(rows).map(tr => {
      const obj = { doc_no: gUploadDocNo, prq_no: gUploadPrqNo || null, requester: gUploadUser, doc_date: gUploadDate, uploaded_at: new Date().toISOString() };
      tr.querySelectorAll('.editable').forEach(inp => {
        obj[inp.dataset.k] = inp.dataset.k === 'qty' ? (Number(inp.value)||0) : inp.value.trim();
      });
      return obj;
    });

    const { error } = await sb.from(ITEMS_TBL).insert(items);
    if (error) throw error;
    showToast('✅ ' + items.length + '건 저장 완료', 'success');
    if (gUploadPrqNo) await linkPrqToDoc(gUploadPrqNo, gUploadDocNo);
  } catch(err) {
    showToast('❌ ' + (err.message||err), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════
// 그룹웨어 확인 탭
// ══════════════════════════════════════════════════════
const imgDropZone   = document.getElementById('imgDropZone');
const imgInput      = document.getElementById('imgInput');
const checkLoadingMsg = document.getElementById('checkLoadingMsg');

imgDropZone.addEventListener('dragover',  () => imgDropZone.classList.add('dragover'));
imgDropZone.addEventListener('dragleave', () => imgDropZone.classList.remove('dragover'));
imgDropZone.addEventListener('drop', e => {
  imgDropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageCheck(file);
  else showToast('이미지 파일만 드롭하세요.', 'warning');
});
imgDropZone.addEventListener('click', e => {
  if (!['INPUT','BUTTON'].includes(e.target.tagName)) imgInput.click();
});
document.getElementById('selectImgBtn').addEventListener('click', e => {
  e.stopPropagation(); imgInput.click();
});
imgInput.addEventListener('change', e => {
  if (e.target.files[0]) handleImageCheck(e.target.files[0]);
});

function resizeImage(file, maxWidth = 1400) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.floor(img.width  * ratio);
      canvas.height = Math.floor(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function handleImageCheck(file) {
  checkLoadingMsg.classList.add('show');
  document.getElementById('checkResultSection').style.display = 'none';

  try {
    const base64 = await resizeImage(file);
    if (!base64) throw new Error('이미지를 읽을 수 없습니다.');

    const res = await fetch('/api/check-groupware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error || '서버 오류') + (data.detail ? ' — ' + data.detail : ''));

    const documents = data.documents || [];
    if (!documents.length) {
      showToast('이미지에서 결재 목록을 찾을 수 없습니다.', 'warning');
      return;
    }

    if (!sb) { showToast('Supabase 미연결', 'error'); return; }

    const { data: registered, error: sbErr } = await sb
      .from(ITEMS_TBL)
      .select('doc_no');
    if (sbErr) throw sbErr;

    // 등록된 doc_no 집합
    const registeredDocNos = new Set((registered || []).map(r => (r.doc_no || '').trim()));

    const results = documents.map(doc => {
      const norm = (doc.doc_no || '').trim();
      const isRegistered = norm.length > 0 && registeredDocNos.has(norm);
      return {
        doc_no:     norm,
        title:      doc.title,
        registered: isRegistered,
      };
    });

    renderCheckResults(results);

  } catch(err) {
    showToast('⚠️ ' + err.message, 'error');
  } finally {
    checkLoadingMsg.classList.remove('show');
    imgInput.value = '';
  }
}

function renderCheckResults(results) {
  const total      = results.length;
  const regCount   = results.filter(r => r.registered).length;
  const unregCount = total - regCount;

  document.getElementById('checkTotalCount').textContent       = `전체 ${total}건`;
  document.getElementById('checkRegisteredCount').textContent  = `✅ 등록됨 ${regCount}건`;
  document.getElementById('checkUnregisteredCount').textContent = `❌ 미등록 ${unregCount}건`;

  const tbody = document.getElementById('checkResultBody');
  tbody.innerHTML = '';
  results.forEach((doc, i) => {
    const tr = document.createElement('tr');
    if (!doc.registered) tr.classList.add('row-unregistered');
    tr.innerHTML =
      `<td>${i + 1}</td>` +
      `<td style="font-family:monospace;font-size:13px">${esc(doc.doc_no || '-')}</td>` +
      `<td>${esc(doc.title)}</td>` +
      `<td><span class="check-badge ${doc.registered ? 'badge-registered' : 'badge-unregistered'}">${doc.registered ? '✅ 등록됨' : '❌ 미등록'}</span></td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('checkResultSection').style.display = 'block';
  showToast(`확인 완료: 등록됨 ${regCount}건 / 미등록 ${unregCount}건`, 'success');
}

// ══════════════════════════════════════════════════════
// 조회 탭
// ══════════════════════════════════════════════════════
document.getElementById('searchBtn').addEventListener('click', loadList);
document.getElementById('resetBtn').addEventListener('click', () => {
  ['sDoc','sUser','sPname','sCode','sName','sSpec','sArrFrom','sArrTo'].forEach(id =>
    document.getElementById(id).value = ''
  );
  document.getElementById('sArrStat').value  = '';
  document.getElementById('sShipStat').value = '';
  document.getElementById('sStage').value    = '';
  document.getElementById('sDelayOnly').checked = false;
  // 뷰를 문서별로 초기화
  gCurrentView = 'doc';
  // 결과 영역 초기화 후 전체 재조회
  document.getElementById('listArea').innerHTML = '<div class="empty-state"><div class="es-icon">⏳</div><p>불러오는 중...</p></div>';
  document.getElementById('allItemsArea').innerHTML = '';
  document.getElementById('allItemsArea').style.display = 'none';
  document.getElementById('viewToggleBar').style.display = 'none';
  document.getElementById('statRow').style.display = 'none';
  loadList();
});

async function loadList() {
  const area = document.getElementById('listArea');
  const statRow = document.getElementById('statRow');
  if (!sb) {
    area.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Supabase 연결이 설정되지 않았습니다.</p></div>';
    return;
  }
  area.innerHTML = '<div class="empty-state"><div class="es-icon">⏳</div><p>불러오는 중...</p></div>';
  statRow.style.display = 'none';
  document.getElementById('exportBtn').style.display = 'none';

  const sDoc     = v('sDoc');
  const sUser    = v('sUser');
  const sPname   = v('sPname');
  const sCode    = v('sCode');
  const sName    = v('sName');
  const sSpec    = v('sSpec');
  const sArrFrom = v('sArrFrom');
  const sArrTo   = v('sArrTo');
  const sArrStat   = document.getElementById('sArrStat').value;
  const sShipStat  = document.getElementById('sShipStat').value;
  const sStage     = document.getElementById('sStage').value;
  const sDelayOnly = document.getElementById('sDelayOnly').checked;

  try {
    // 품목 쿼리
    let q = sb.from(ITEMS_TBL).select('*').order('uploaded_at', { ascending: false }).limit(2000);
    if (sDoc)   q = q.ilike('doc_no',    '%' + sDoc   + '%');
    if (sUser)  q = q.ilike('requester', '%' + sUser  + '%');
    if (sPname) q = q.ilike('p_name',    '%' + sPname + '%');
    if (sCode)  q = q.ilike('p_code',    '%' + sCode  + '%');
    if (sName)  q = q.ilike('name',      '%' + sName  + '%');
    if (sSpec)  q = q.ilike('spec',      '%' + sSpec  + '%');

    const { data: items, error: ie } = await q;
    if (ie) throw ie;

    // 전체 상태 로드 (알림용)
    const { data: allSt, error: se } = await sb.from(STATUS_TBL).select('*');
    if (se) throw se;

    gStatusMap = {};
    (allSt || []).forEach(s => { gStatusMap[s.doc_no] = s; });

    // 알림 배너 갱신 — purchase_items의 모든 문서번호 기준 (상태 미등록 문서도 포함)
    const allDocNosForAlert = [...new Set((items || []).map(r => r.doc_no))];
    const alertTargets = allDocNosForAlert.map(doc => gStatusMap[doc] || { doc_no: doc });
    checkAlerts(alertTargets);

    if (!items || items.length === 0) {
      area.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><p>저장된 데이터가 없습니다.</p></div>';
      return;
    }

    // 문서번호 그룹화
    const groups = {}, order = [];
    items.forEach(row => {
      if (!groups[row.doc_no]) { groups[row.doc_no] = { meta: row, items: [] }; order.push(row.doc_no); }
      groups[row.doc_no].items.push(row);
    });

    const today = todayStr();

    // 상태 필터 (입고예정일 날짜 범위 포함)
    const filtered = order.filter(d => {
      const s = gStatusMap[d] || {};
      // 입고예정일 범위 필터
      if (sArrFrom && s.expected_arrival && s.expected_arrival < sArrFrom) return false;
      if (sArrTo   && s.expected_arrival && s.expected_arrival > sArrTo)   return false;
      // 입고 상태 필터
      if (sArrStat === 'done')    return !!s.arrival_done;
      if (sArrStat === 'pending') return !s.arrival_done;
      if (sArrStat === 'nodate')  return !s.expected_arrival && !s.arrival_done;
      // 배송 상태 필터
      if (sShipStat === 'done')    return !!s.ship_done;
      if (sShipStat === 'started') return !!s.ship_start_date && !s.ship_done;
      if (sShipStat === 'none')    return !s.ship_start_date;
      // 진행 단계 필터
      if (sStage === 'pending_arrival') return !s.arrival_done;
      if (sStage === 'shipping')        return !!s.arrival_done && !!s.ship_start_date && !s.ship_done;
      if (sStage === 'done')            return !!s.arrival_done && !!s.ship_done;
      // 지연만 보기
      if (sDelayOnly) {
        const arrLate  = !s.arrival_done && s.expected_arrival && s.expected_arrival < today;
        const shipLate = !s.ship_done && s.ship_done_date && s.ship_done_date < today;
        return !!(arrLate || shipLate);
      }
      return true;
    });

    // 통계
    let arrDone=0, arrNone=0, shipDone=0;
    order.forEach(d => {
      const s = gStatusMap[d] || {};
      if (s.arrival_done) arrDone++;
      if (!s.expected_arrival && !s.arrival_done) arrNone++;
      if (s.ship_done) shipDone++;
    });
    document.getElementById('scDoc').textContent      = filtered.length;
    document.getElementById('scItem').textContent     = items.length;
    document.getElementById('scArrDone').textContent  = arrDone;
    document.getElementById('scArrNone').textContent  = arrNone;
    document.getElementById('scShipDone').textContent = shipDone;
    statRow.style.display = 'flex';

    if (!filtered.length) {
      area.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div><p>검색 조건에 맞는 문서가 없습니다.</p></div>';
      return;
    }

    // 결과 테이블 렌더링 (진행중 / 완료 섹션 분리)
    area.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'result-tbl-wrap';

    // 진행중: 입고완료 OR 배송완료 중 하나라도 미완료
    // 완료: 입고완료 AND 배송완료 모두 true
    const activeDocs = filtered.filter(d => {
      const s = gStatusMap[d] || {};
      return !(s.arrival_done && s.ship_done);
    });
    const doneDocs = filtered.filter(d => {
      const s = gStatusMap[d] || {};
      return s.arrival_done && s.ship_done;
    });

    function buildDocRow(d) {
      const g = groups[d];
      const s = gStatusMap[d] || {};
      const arrChip = arrivalChip(s, today);
      const sDChip  = shipDoneChip(s, today);
      const rep = g.items.slice(0,2).map(i =>
        [i.p_name, i.name].filter(Boolean).join(' · ')
      ).join('　') + (g.items.length > 2 ? ` 외 ${g.items.length-2}건` : '');
      const arrLate  = !s.arrival_done && s.expected_arrival && s.expected_arrival < today;
      const shipLate = !s.ship_done && s.ship_done_date && s.ship_done_date < today;
      const delayed  = !!(arrLate || shipLate);
      let stageChipHtml;
      if (s.arrival_done && s.ship_done) {
        stageChipHtml = '<span class="stage-chip stage-done">✅ 완료</span>';
      } else if (s.arrival_done && s.ship_start_date) {
        stageChipHtml = `<span class="stage-chip stage-ship${shipLate?' stage-late':''}">🚚 배송중</span>`;
      } else if (s.arrival_done) {
        stageChipHtml = '<span class="stage-chip stage-arr-done">📦 배송대기</span>';
      } else {
        stageChipHtml = `<span class="stage-chip stage-arr${arrLate?' stage-late':''}">⏳ 입고대기</span>`;
      }
      return `<tr data-docno="${esc(d)}" class="doc-row${delayed?' row-delayed':''}" style="cursor:pointer">
        <td><span class="doc-link">${esc(d)}</span></td>
        <td>${esc(g.meta.requester||'-')}</td>
        <td>${esc(g.meta.doc_date||'')}</td>
        <td style="font-weight:600;color:var(--primary-dark)">${s.expected_arrival ? fmtDate(s.expected_arrival) : '<span style="color:var(--gray300)">미정</span>'}</td>
        <td>${arrChip}</td>
        <td>${s.ship_start_date ? fmtDate(s.ship_start_date) : '<span style="color:var(--gray300)">-</span>'}</td>
        <td>${s.ship_done_date  ? fmtDate(s.ship_done_date)  : '<span style="color:var(--gray300)">-</span>'}</td>
        <td>${sDChip}</td>
        <td>${stageChipHtml}</td>
        <td style="font-weight:700">${g.items.length}</td>
        <td style="text-align:left;font-size:12px;color:var(--gray500);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rep)}</td>
      </tr>`;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>문서번호</th>
            <th>기안자</th>
            <th>기안일</th>
            <th>입고예정일</th>
            <th>입고완료</th>
            <th>배송시작일</th>
            <th>배송완료예정일</th>
            <th>배송완료</th>
            <th>단계</th>
            <th>품목수</th>
            <th>대표 프로젝트/품목</th>
          </tr>
        </thead>
        <tbody>`;

    activeDocs.forEach(d => { html += buildDocRow(d); });

    if (doneDocs.length > 0) {
      html += `<tr class="section-divider"><td colspan="11">✅ 완료 항목 (${doneDocs.length}건) — 입고·배송 모두 완료</td></tr>`;
      doneDocs.forEach(d => { html += buildDocRow(d); });
    }

    html += `</tbody></table>`;
    html += `<div class="tbl-footer">총 문서 ${filtered.length}건 / 품목 ${items.length}건 (진행중 ${activeDocs.length}건 · 완료 ${doneDocs.length}건)</div>`;
    wrap.innerHTML = html;

    // 행 클릭 → 모달
    wrap.querySelectorAll('.doc-row').forEach(row => {
      row.addEventListener('click', () => openModal(row.dataset.docno, groups, gStatusMap));
    });

    area.appendChild(wrap);
    document.getElementById('exportBtn').style.display = '';

    // ── 전체 품목 뷰 데이터 저장 & 토글바 표시 ──
    gLastFilteredItems = items.filter(row => filtered.includes(row.doc_no));
    gLastGroups        = groups;
    gLastFiltered      = filtered;

    const toggleBar = document.getElementById('viewToggleBar');
    toggleBar.style.display = 'block';
    document.getElementById('viewAllCount').textContent =
      '총 ' + gLastFilteredItems.length + '개 품목 / ' + filtered.length + '개 문서';

    // 현재 뷰 상태 유지
    switchView(gCurrentView || 'doc');

  } catch(err) {
    console.error(err);
    area.innerHTML = `<div class="empty-state" style="color:var(--danger)">❌ 조회 실패: ${esc(err.message||String(err))}</div>`;
    document.getElementById('viewToggleBar').style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════
// 뷰 전환 (문서별 / 전체 품목)
// ══════════════════════════════════════════════════════
function switchView(mode) {
  gCurrentView = mode;
  const docArea  = document.getElementById('listArea');
  const allArea  = document.getElementById('allItemsArea');
  const btnDoc   = document.getElementById('btnViewDoc');
  const btnAll   = document.getElementById('btnViewAll');

  if (mode === 'all') {
    docArea.style.display = 'none';
    allArea.style.display = 'block';
    btnDoc.classList.remove('active');
    btnAll.classList.add('active');
    renderAllItems();
  } else {
    docArea.style.display = 'block';
    allArea.style.display = 'none';
    btnDoc.classList.add('active');
    btnAll.classList.remove('active');
  }
}

function renderAllItems() {
  const allArea = document.getElementById('allItemsArea');
  const today   = todayStr();

  if (!gLastFilteredItems.length) {
    allArea.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><p>품목이 없습니다.</p></div>';
    return;
  }

  // 정렬: 문서번호 순 → 같은 문서 품목끼리 묶음
  const sorted = [...gLastFilteredItems].sort((a, b) => a.doc_no.localeCompare(b.doc_no));

  let prevDocNo = null;
  let rowsHtml  = '';

  sorted.forEach(row => {
    const s        = gStatusMap[row.doc_no] || {};
    const isNew    = row.doc_no !== prevDocNo;
    const rowClass = isNew ? 'group-start' : '';

    // 문서번호 셀: 같은 문서 첫 행만 표시 (rowspan 없이 텍스트로)
    const docCell = isNew
      ? `<td class="doc-no-cell" data-docno="${esc(row.doc_no)}">${esc(row.doc_no)}</td>`
      : `<td style="border-right:1px solid var(--gray100)"></td>`;

    // 상태 칩 (첫 행만 표시)
    const arrCell = isNew
      ? `<td>${arrivalChip(s, today)}</td>`
      : `<td></td>`;
    const shipCell = isNew
      ? `<td>${shipDoneChip(s, today)}</td>`
      : `<td></td>`;
    const reqCell = isNew
      ? `<td style="font-size:12px">${esc(row.requester||'-')}</td>`
      : `<td></td>`;

    rowsHtml += `<tr class="${rowClass}">
      ${docCell}
      ${reqCell}
      <td style="font-size:12px;color:var(--gray500)">${esc(row.p_name||'')}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray500)">${esc(row.p_code||'')}</td>
      <td style="text-align:left;font-weight:600">${esc(row.name||'')}</td>
      <td style="text-align:left;font-size:12px;color:var(--gray600)">${esc(row.spec||'')}</td>
      <td style="font-weight:700;color:var(--primary)">${row.qty||0}</td>
      ${arrCell}
      ${shipCell}
    </tr>`;

    prevDocNo = row.doc_no;
  });

  const html = `
    <div class="all-items-wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width:160px">문서번호</th>
            <th style="min-width:70px">기안자</th>
            <th style="min-width:140px">프로젝트명</th>
            <th style="min-width:110px">코드</th>
            <th style="min-width:200px;text-align:left">품명</th>
            <th style="min-width:180px;text-align:left">규격</th>
            <th style="min-width:60px">수량</th>
            <th style="min-width:100px">입고완료</th>
            <th style="min-width:100px">배송완료</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="tbl-footer">
        총 <strong>${sorted.length}</strong>개 품목 /
        <strong>${gLastFiltered.length}</strong>개 문서
      </div>
    </div>`;

  allArea.innerHTML = html;

  // 문서번호 클릭 → 모달
  allArea.querySelectorAll('.doc-no-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      openModal(cell.dataset.docno, gLastGroups, gStatusMap);
    });
  });
}

// ══════════════════════════════════════════════════════
// 모달
// ══════════════════════════════════════════════════════
function openModal(docNo, groups, statusMap) {
  gModalDocNo = docNo;
  const g = groups[docNo];
  const s = statusMap[docNo] || {};

  document.getElementById('modalDocNo').textContent = docNo;
  document.getElementById('mDocNo').textContent  = docNo;
  document.getElementById('mUser').textContent   = g?.meta?.requester || '-';
  document.getElementById('mDate').textContent   = g?.meta?.doc_date  || '-';
  document.getElementById('mCount').textContent  = g?.items?.length   || 0;

  // PRQ 번호 표시
  const prqNo = g?.meta?.prq_no || '';
  const mPrqDisp = document.getElementById('mPrqDisplay');
  if (mPrqDisp) {
    mPrqDisp.textContent = prqNo || '(미등록)';
    mPrqDisp.style.color = prqNo ? 'var(--gray700)' : 'var(--gray400)';
  }
  const mPrqInput = document.getElementById('mPrqInput');
  if (mPrqInput) mPrqInput.value = prqNo;
  const mPrqEditRow = document.getElementById('mPrqEditRow');
  if (mPrqEditRow) mPrqEditRow.style.display = 'none';

  // 상태 필드 세팅
  document.getElementById('mExpectedArrival').value = s.expected_arrival  || '';
  document.getElementById('mArrDone').checked       = !!s.arrival_done;
  document.getElementById('mShipStart').value       = s.ship_start_date   || '';
  document.getElementById('mShipDone').value        = s.ship_done_date    || '';
  document.getElementById('mShipDoneCk').checked    = !!s.ship_done;
  document.getElementById('mMemo').value            = s.memo              || '';

  // 토글 스타일
  refreshToggle('mArrDoneToggle',  'mArrDone');
  refreshToggle('mShipDoneToggle', 'mShipDoneCk');

  // 품목 테이블
  const tbody = document.getElementById('mItemBody');
  tbody.innerHTML = (g?.items || []).map(row =>
    `<tr>
      <td>${esc(row.p_name||'')}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${esc(row.p_code||'')}</td>
      <td>${esc(row.name||'')}</td>
      <td>${esc(row.spec||'')}</td>
      <td style="font-weight:700">${row.qty||0}</td>
    </tr>`
  ).join('');

  // 연결된 현장 요청 확인
  const linkedFrSec  = document.getElementById('mLinkedFrSection');
  const linkedFrBody = document.getElementById('mLinkedFrBody');
  const linkedFr = (_frData.requests || []).filter(r => r.linked_doc_no === docNo);
  if (linkedFr.length > 0) {
    const STEP_LABELS = ['현장요청','본사확인','사내결재','서류등록','입고','배송','수령완료'];
    linkedFrBody.innerHTML = linkedFr.map(fr => {
      const step = fr.current_step || 1;
      const stepLabel = STEP_LABELS[step - 1] || `${step}단계`;
      const isDone = step >= 7;
      return `<div class="fr-link-item">
        <div class="fr-link-info">
          <span class="fr-link-site">${esc(fr.site_name)}</span>
          <span class="fr-link-req">요청자: ${esc(fr.requester_name)}</span>
          <span class="fr-link-reason">${esc(fr.request_reason)}</span>
          <span class="fr-step-chip ${isDone?'fr-s-done':'fr-s-hq'}">${stepLabel}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openFrDetail('${esc(fr.id)}')">🔍 현장요청 상세 보기</button>
      </div>`;
    }).join('');
    linkedFrSec.style.display = '';
  } else {
    linkedFrSec.style.display = 'none';
  }

  document.getElementById('docModal').classList.add('open');
}

// 체크박스 변경 시 토글 스타일 갱신
['mArrDone','mShipDoneCk'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    refreshToggle(id === 'mArrDone' ? 'mArrDoneToggle' : 'mShipDoneToggle', id);
  });
});

function refreshToggle(toggleId, checkId) {
  const checked = document.getElementById(checkId).checked;
  document.getElementById(toggleId).classList.toggle('checked', checked);
}

// PRQ 편집 토글
function togglePrqEdit() {
  const row = document.getElementById('mPrqEditRow');
  if (!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if (show) document.getElementById('mPrqInput')?.focus();
}

async function savePrqNo() {
  if (!sb || !gModalDocNo) return;
  const val = (document.getElementById('mPrqInput')?.value || '').trim();
  try {
    const { error } = await sb.from(ITEMS_TBL).update({ prq_no: val || null }).eq('doc_no', gModalDocNo);
    if (error) throw error;
    // 로컬 캐시 갱신
    if (gLastGroups[gModalDocNo]) gLastGroups[gModalDocNo].meta.prq_no = val || null;
    const disp = document.getElementById('mPrqDisplay');
    if (disp) { disp.textContent = val || '(미등록)'; disp.style.color = val ? 'var(--gray700)' : 'var(--gray400)'; }
    togglePrqEdit();
    showToast('구매요청번호가 저장됐습니다.', 'success');
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'danger');
  }
}

// 닫기
['modalClose','mCancelBtn'].forEach(id =>
  document.getElementById(id).addEventListener('click', () =>
    document.getElementById('docModal').classList.remove('open')
  )
);
document.getElementById('docModal').addEventListener('click', e => {
  if (e.target === document.getElementById('docModal'))
    document.getElementById('docModal').classList.remove('open');
});

// 저장
document.getElementById('mSaveBtn').addEventListener('click', saveModal);
async function saveModal() {
  if (!sb || !gModalDocNo) return;
  const btn = document.getElementById('mSaveBtn');
  btn.disabled = true;
  try {
    const payload = {
      doc_no:           gModalDocNo,
      expected_arrival: document.getElementById('mExpectedArrival').value || null,
      arrival_done:     document.getElementById('mArrDone').checked,
      arrival_done_at:  document.getElementById('mArrDone').checked
        ? (gStatusMap[gModalDocNo]?.arrival_done_at || new Date().toISOString()) : null,
      ship_start_date:  document.getElementById('mShipStart').value || null,
      ship_done_date:   document.getElementById('mShipDone').value  || null,
      ship_done:        document.getElementById('mShipDoneCk').checked,
      ship_done_at:     document.getElementById('mShipDoneCk').checked
        ? (gStatusMap[gModalDocNo]?.ship_done_at || new Date().toISOString()) : null,
      memo:             document.getElementById('mMemo').value.trim()
    };

    const { error } = await sb.from(STATUS_TBL).upsert(payload, { onConflict: 'doc_no' });
    if (error) throw error;

    gStatusMap[gModalDocNo] = payload;
    checkAlerts(Object.values(gStatusMap));

    showToast('✅ [' + gModalDocNo + '] 상태 저장 완료', 'success');
    document.getElementById('docModal').classList.remove('open');

    // 목록 갱신 (현재 뷰 유지)
    await loadList();
  } catch(err) {
    showToast('❌ ' + (err.message||err), 'error');
  } finally {
    btn.disabled = false;
  }
}

// 삭제
document.getElementById('mDeleteBtn').addEventListener('click', async () => {
  if (!gModalDocNo) return;
  if (!confirm(`[${gModalDocNo}] 문서의 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
  const btn = document.getElementById('mDeleteBtn');
  btn.disabled = true;
  try {
    const { error: e1 } = await sb.from(ITEMS_TBL).delete().eq('doc_no', gModalDocNo);
    if (e1) throw e1;
    const { error: e2 } = await sb.from(STATUS_TBL).delete().eq('doc_no', gModalDocNo);
    if (e2) throw e2;

    delete gStatusMap[gModalDocNo];
    checkAlerts(Object.values(gStatusMap));
    showToast('🗑 [' + gModalDocNo + '] 삭제 완료', 'warning');
    document.getElementById('docModal').classList.remove('open');
    loadList();
  } catch(err) {
    showToast('❌ 삭제 실패: ' + (err.message||err), 'error');
  } finally {
    btn.disabled = false;
  }
});

// ══════════════════════════════════════════════════════
// 알림 배너
// ══════════════════════════════════════════════════════
function checkAlerts(statusList) {
  const today  = todayStr();
  const alerts = [];

  statusList.forEach(s => {
    if (!s.doc_no) return;

    // 입고예정일
    if (!s.arrival_done) {
      if (!s.expected_arrival) {
        alerts.push({ doc: s.doc_no, msg: '입고예정일이 입력되지 않았습니다. 확인해주세요!', type: 'nodate' });
      } else if (s.expected_arrival < today) {
        alerts.push({ doc: s.doc_no, msg: '입고예정일 ' + fmtDateKo(s.expected_arrival) + ' — 아직 입고완료 처리되지 않았습니다.', type: 'overdue' });
      } else if (s.expected_arrival === today) {
        alerts.push({ doc: s.doc_no, msg: '입고예정일 입니다. 확인해주세요!', type: 'today' });
      }
    }

    // 배송완료 알람: 배송완료예정일이 지난 후에만 표시
    if (!s.ship_done) {
      if (s.ship_done_date && s.ship_done_date < today) {
        alerts.push({ doc: s.doc_no, msg: '배송완료예정일 ' + fmtDateKo(s.ship_done_date) + ' 이 지났습니다. 배송완료 여부를 확인해주세요!', type: 'overdue' });
      } else if (s.ship_done_date && s.ship_done_date === today) {
        alerts.push({ doc: s.doc_no, msg: '오늘이 배송완료예정일 입니다. 배송완료 여부를 확인해주세요!', type: 'today' });
      }
    }
  });

  const banner = document.getElementById('alertBanner');
  const list   = document.getElementById('alertList');
  const title  = document.getElementById('alertTitleText');

  if (!alerts.length) { banner.classList.remove('show'); return; }

  title.textContent = `🔔 확인이 필요한 항목 ${alerts.length}건`;
  list.innerHTML = alerts.map(a => {
    const badgeCls  = a.type === 'overdue' ? 'badge-overdue' : a.type === 'nodate' ? 'badge-nodate' : 'badge-today';
    const badgeTxt  = a.type === 'overdue' ? '지연' : a.type === 'nodate' ? '미입력' : '오늘';
    const rowCls    = a.type === 'overdue' ? 'overdue' : a.type === 'nodate' ? 'nodate' : '';
    return `<div class="alert-row ${rowCls}">
      <span class="a-doc">${esc(a.doc)}</span>
      <span class="a-msg">${esc(a.msg)}</span>
      <span class="a-badge ${badgeCls}">${badgeTxt}</span>
    </div>`;
  }).join('');

  banner.classList.add('show');
}

// ══════════════════════════════════════════════════════
// 칩 헬퍼
// ══════════════════════════════════════════════════════
function arrivalChip(s, today) {
  if (s.arrival_done)      return '<span class="chip chip-done">✅ 입고완료</span>';
  if (!s.expected_arrival) return '<span class="chip chip-none">미정</span>';
  if (s.expected_arrival < today)  return `<span class="chip chip-overdue">⚠️ 지연 (${fmtDate(s.expected_arrival)})</span>`;
  if (s.expected_arrival === today) return '<span class="chip chip-pending">📦 오늘</span>';
  return `<span class="chip chip-pending">📦 ${fmtDate(s.expected_arrival)}</span>`;
}

function shipDoneChip(s, today) {
  if (s.ship_done) return '<span class="chip chip-done">✅ 배송완료</span>';
  if (!s.ship_done_date) {
    if (s.ship_start_date) return '<span class="chip chip-pending">🚚 배송중</span>';
    return '<span class="chip chip-none">-</span>';
  }
  if (s.ship_done_date < today)  return `<span class="chip chip-overdue">❓ 완료확인 필요</span>`;
  if (s.ship_done_date === today) return '<span class="chip chip-pending">📬 오늘 완료예정</span>';
  return `<span class="chip chip-none">완료예정 ${fmtDate(s.ship_done_date)}</span>`;
}

// ══════════════════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════════════════
function v(id) { return document.getElementById(id).value.trim(); }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}
function fmtDate(str) {
  if (!str) return '';
  const [,m,d] = str.split('-');
  return m + '/' + d;
}
function fmtDateKo(str) {
  if (!str) return '';
  const [y,m,d] = str.split('-');
  return y + '년 ' + parseInt(m) + '월 ' + parseInt(d) + '일';
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function showToast(msg, type) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + (type||'');
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

// ── 페이지 로드 시 대시보드 로드 ──
(async () => {
  if (!sb) return;
  try { await loadDashboard(); } catch(e) { console.warn('초기화 오류:', e); }
})();

// ═══════════════════════════════════════════════════════════════
// 대시보드 (메인 화면)
// ═══════════════════════════════════════════════════════════════

// 탭 전환 헬퍼
function switchTabTo(tabName, subTabName) {
  const btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
  if (!btn) { showToast('이 기능은 다음 단계에서 추가됩니다.', 'warning'); return; }
  btn.click();
  if (subTabName) setTimeout(() => switchSubTab(subTabName), 80);
}

// 구매 리스트 탭으로 이동 후 해당 문서 모달 열기
function openListAndDoc(docNo) {
  switchTabTo('list');
  setTimeout(() => {
    document.getElementById('sDoc').value = docNo;
    loadList().then(() => {
      if (gLastGroups && gLastGroups[docNo]) openModal(docNo);
    });
  }, 200);
}

// 날짜 차이 계산 (일수)
function daysDiff(a, b) {
  const da = new Date(String(a || '').slice(0,10));
  const db = new Date(String(b || '').slice(0,10));
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.max(0, Math.floor((db - da) / 86400000));
}

let _dashCharts = {};

async function loadDashboard() {
  if (!document.getElementById('pane-dashboard')) return;
  const content = document.getElementById('dashContent');
  if (content) content.innerHTML = '<div class="empty-state"><div class="es-icon">⏳</div><p>불러오는 중...</p></div>';
  if (!sb) {
    if (content) content.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Supabase 연결 오류</p></div>';
    return;
  }
  try {
    const [frRes, sitesRes, statusRes, itemsRes, prqRes] = await Promise.all([
      sb.from('field_requests').select('*').order('created_at', { ascending: false }),
      sb.from(SITES_TBL).select('*').eq('active', true),
      sb.from(STATUS_TBL).select('*'),
      sb.from(ITEMS_TBL).select('doc_no').limit(2000),
      sb.from(PRQ_LOG_TBL).select('*')
    ]);
    const fr     = frRes.error     ? [] : (frRes.data     || []);
    const sites  = sitesRes.error  ? [] : (sitesRes.data  || []);
    const stats  = statusRes.error ? [] : (statusRes.data || []);
    const items  = itemsRes.error  ? [] : (itemsRes.data  || []);
    const prqLog = prqRes.error    ? [] : (prqRes.data    || []);

    // 알림 배너 갱신
    const stMap = {};
    stats.forEach(s => { stMap[s.doc_no] = s; });
    gStatusMap = stMap;
    const allDocNos = [...new Set(items.map(r => r.doc_no))];
    checkAlerts(allDocNos.map(d => stMap[d] || { doc_no: d }));

    renderDashboard(fr, sites, stats, prqLog);
  } catch(err) {
    area.innerHTML = '<div class="empty-state" style="color:var(--danger)">❌ 대시보드 로드 실패: ' + esc(err.message) + '</div>';
  }
}

function renderDashboard(fr, sites, statuses, prqLog) {
  gDashFr = fr;
  const today = todayStr();
  const thisMonth = today.slice(0, 7);

  // ── KPI 계산 ──
  const activeCount   = fr.filter(r => r.current_step < 7).length;
  const stMap = {};
  statuses.forEach(s => { stMap[s.doc_no] = s; });
  // standalone doc_status (field_requests와 연결되지 않은 구매 문서)
  const linkedDocNos = new Set(fr.map(r => r.linked_doc_no).filter(Boolean));
  const standaloneStatuses = statuses.filter(s => !linkedDocNos.has(s.doc_no));
  gDashStatuses = standaloneStatuses;

  const completed     = fr.filter(r => r.received_at && r.created_at);
  const prqUnreg      = prqLog.filter(p => p.status === 'unregistered').length;

  // ── 파이프라인 단계별 건수 (FR effective step + standalone doc_status) ──
  const frStepCounts = [1,2,3,4,5,6,7].map(n => fr.filter(r => getEffectiveStep(r, stMap) === n).length);
  const standaloneCounts = [0,0,0,0,0,0,0];
  standaloneStatuses.forEach(s => {
    const step = deriveDocStatusStep(s);
    if (step) standaloneCounts[step - 1]++;
  });
  const stepCounts = frStepCounts.map((n, i) => n + standaloneCounts[i]);
  const stepLabels = ['요청','본사확인','사내결재','서류등록','입고','배송','수령완료'];
  const stepNums   = ['①','②','③','④','⑤','⑥','⑦'];

  // ── 입고 예정/완료 구분 (step 5) ──
  const frStep5Exp  = fr.filter(r => getEffectiveStep(r, stMap) === 5 && !((stMap[r.linked_doc_no]||{}).arrival_done || r.arrival_done)).length;
  const frStep5Done = fr.filter(r => getEffectiveStep(r, stMap) === 5 &&  ((stMap[r.linked_doc_no]||{}).arrival_done || r.arrival_done)).length;
  const saStep5Exp  = standaloneStatuses.filter(s => !s.ship_start_date && s.expected_arrival && !s.arrival_done).length;
  const saStep5Done = standaloneStatuses.filter(s => !s.ship_start_date && s.arrival_done).length;
  const step5Exp    = frStep5Exp + saStep5Exp;
  const step5Done   = frStep5Done + saStep5Done;

  // ── 차트 데이터 ──
  const siteMap = {};
  fr.forEach(r => { siteMap[r.site_name] = (siteMap[r.site_name]||0)+1; });
  const reasonMap = { '파손':0, '분실':0, '소모':0, '기타':0 };
  fr.forEach(r => { if (r.request_reason in reasonMap) reasonMap[r.request_reason]++; });
  const reqMap = {};
  fr.forEach(r => { reqMap[r.requester_name] = (reqMap[r.requester_name]||0)+1; });
  const monthMap = {};
  completed.forEach(r => {
    const m = r.created_at.slice(0,7);
    if (!monthMap[m]) monthMap[m] = { sum:0, cnt:0 };
    monthMap[m].sum += daysDiff(r.created_at, r.received_at);
    monthMap[m].cnt++;
  });
  const monthKeys = Object.keys(monthMap).sort().slice(-6);

  // ── HTML ──

  // 빠른 액션
  let html =
    '<div class="dash-quick-row">' +
      '<button class="dash-quick-btn" onclick="switchTabTo(\'field\')">' +
        '<span class="dqb-icon">➕</span><span>현장 요청하기</span>' +
      '</button>' +
      '<button class="dash-quick-btn" onclick="switchTabTo(\'upload\')">' +
        '<span class="dqb-icon">📤</span><span>서류 등록</span>' +
      '</button>' +
      '<button class="dash-quick-btn" onclick="switchTabTo(\'upload\',\'check\')">' +
        '<span class="dqb-icon">🔍</span><span>그룹웨어 확인</span>' +
      '</button>' +
    '</div>';

  // 파이프라인
  html += '<div class="dash-section">' +
    '<div class="dash-section-title">📊 단계별 파이프라인 현황' +
    '<span style="background:var(--primary);color:#fff;border-radius:10px;padding:1px 10px;font-size:12px;font-weight:700;margin-left:8px">진행중 '+activeCount+'건</span>' +
    ' <span style="font-size:11px;color:var(--gray400);font-weight:400">건수 클릭 시 목록 펼침</span></div>' +
    '<div class="pipeline-scroll"><div class="dash-pipeline">';
  stepCounts.forEach((cnt, i) => {
    if (i > 0) html += '<div class="dp-arrow">›</div>';
    html += '<div class="dp-step" id="dp-step-'+(i+1)+'" onclick="togglePipelineStep('+(i+1)+')" style="cursor:pointer">' +
      '<div class="dp-num">'+stepNums[i]+'</div>' +
      '<div class="dp-label">'+stepLabels[i]+'</div>';
    if (i === 4) {
      // ⑤ 입고 — 예정/완료 구분
      html += '<div class="dp-sub'+(step5Exp>0?' dp-count-active':'')+'">예정 '+step5Exp+'건</div>' +
              '<div class="dp-sub dp-sub-done'+(step5Done>0?' dp-sub-done-active':'')+'">완료 '+step5Done+'건</div>';
    } else {
      html += '<div class="dp-count'+(cnt>0?' dp-count-active':'')+'">'+cnt+'건</div>';
    }
    html += '</div>';
  });
  html += '</div></div>' +
    '<div id="pipelineStepArea"></div>' +
  '</div>';

  // 차트 영역
  const noData = '<div class="dash-no-data">데이터 없음</div>';
  html += '<div class="dash-charts-grid">' +
    '<div class="dash-chart-card"><div class="dcc-title">현장별 요청 건수</div>' +
      (Object.keys(siteMap).length ? '<canvas id="chartSite"></canvas>' : noData) +
    '</div>' +
    '<div class="dash-chart-card"><div class="dcc-title">요청 사유 비율</div>' +
      (fr.length ? '<canvas id="chartReason"></canvas>' : noData) +
    '</div>' +
    '<div class="dash-chart-card"><div class="dcc-title">요청자별 빈도</div>' +
      (Object.keys(reqMap).length ? '<canvas id="chartRequester"></canvas>' : noData) +
    '</div>' +
    '<div class="dash-chart-card"><div class="dcc-title">월별 평균 처리 기간 (일)</div>' +
      (monthKeys.length ? '<canvas id="chartMonthly"></canvas>' : noData) +
    '</div>' +
  '</div>';

  // PRQ 미등록 알림
  if (prqUnreg > 0) {
    html += '<div class="dash-section">' +
      '<div class="dash-section-title">📦 구매리스트 모니터링</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<div class="dash-monitor-chip dash-monitor-warning" onclick="switchTabTo(\'upload\',\'check\')" style="cursor:pointer">' +
          '🔗 PRQ 미등록 '+prqUnreg+'건 &nbsp;—&nbsp; 그룹웨어 확인 탭에서 확인하세요' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  const area = document.getElementById('dashContent');
  if (area) area.innerHTML = html;
  gDashData = null;
  _activePipeStep = 0;

  // 차트 초기화
  initDashCharts({ siteMap, reasonMap, reqMap, monthKeys, monthMap });
}

function initDashCharts({ siteMap, reasonMap, reqMap, monthKeys, monthMap }) {
  Object.values(_dashCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
  _dashCharts = {};
  if (typeof Chart === 'undefined') return;

  const c1 = document.getElementById('chartSite');
  if (c1) {
    const sorted = Object.entries(siteMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    _dashCharts.site = new Chart(c1, {
      type:'bar',
      data:{ labels:sorted.map(e=>e[0]), datasets:[{ label:'요청 건수', data:sorted.map(e=>e[1]), backgroundColor:'#1a56db', borderRadius:4 }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
    });
  }

  const c2 = document.getElementById('chartReason');
  if (c2) {
    _dashCharts.reason = new Chart(c2, {
      type:'doughnut',
      data:{ labels:Object.keys(reasonMap), datasets:[{ data:Object.values(reasonMap), backgroundColor:['#e02424','#d97706','#057a55','#6b7280'], borderWidth:2 }] },
      options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } } }
    });
  }

  const c3 = document.getElementById('chartRequester');
  if (c3) {
    const sorted = Object.entries(reqMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
    _dashCharts.req = new Chart(c3, {
      type:'bar',
      data:{ labels:sorted.map(e=>e[0]), datasets:[{ label:'요청 건수', data:sorted.map(e=>e[1]), backgroundColor:'#0694a2', borderRadius:4 }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
    });
  }

  const c4 = document.getElementById('chartMonthly');
  if (c4 && monthKeys.length) {
    _dashCharts.monthly = new Chart(c4, {
      type:'line',
      data:{ labels:monthKeys, datasets:[{ label:'평균 처리일', data:monthKeys.map(m=>Math.round(monthMap[m].sum/monthMap[m].cnt)), borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,0.1)', tension:0.3, fill:true, pointRadius:4 }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 파이프라인 단계 클릭 — 인라인 목록
// ═══════════════════════════════════════════════════════════════

function togglePipelineStep(step) {
  const area = document.getElementById('pipelineStepArea');
  if (!area) return;
  const allSteps = document.querySelectorAll('.dp-step');
  if (_activePipeStep === step) {
    _activePipeStep = 0;
    area.innerHTML = '';
    allSteps.forEach(el => el.classList.remove('dp-active'));
    return;
  }
  _activePipeStep = step;
  allSteps.forEach(el => el.classList.remove('dp-active'));
  const el = document.getElementById('dp-step-' + step);
  if (el) el.classList.add('dp-active');

  // FR: effective step 기준 필터
  const frItems = gDashFr.filter(r => getEffectiveStep(r, gStatusMap) === step);
  // standalone doc_status: step 5/6/7만
  const saItems = step >= 5 ? gDashStatuses.filter(s => deriveDocStatusStep(s) === step) : [];

  if (!frItems.length && !saItems.length) {
    area.innerHTML = '<div class="pipe-empty">해당 단계에 진행 중인 건이 없습니다.</div>';
    return;
  }
  area.innerHTML = '<div class="pipe-step-list">' +
    frItems.map(buildPipelineCard).join('') +
    saItems.map(buildDocStatusCard).join('') +
  '</div>';
}

// FR의 실제 진행 단계 — linked doc_status 고려
function getEffectiveStep(fr, stMap) {
  if ((fr.current_step || 1) < 4 || !fr.linked_doc_no) return fr.current_step || 1;
  const s = stMap[fr.linked_doc_no] || {};
  if (fr.received_at || s.ship_done) return 7;
  if (s.ship_start_date || fr.ship_start_date) return 6;
  if (s.arrival_done || fr.arrival_done || s.expected_arrival || fr.expected_arrival) return 5;
  return fr.current_step || 1;
}

// standalone doc_status의 파이프라인 단계 추출
function deriveDocStatusStep(s) {
  if (s.ship_done) return 7;
  if (s.ship_start_date) return 6;
  if (s.arrival_done || s.expected_arrival) return 5;
  return null;
}

// standalone 구매 문서 파이프라인 카드
function buildDocStatusCard(s) {
  const expArr  = s.expected_arrival || '';
  const arrDone = s.arrival_done;
  const shipStart = s.ship_start_date || '';
  const shipDone  = s.ship_done;
  let statusText = '';
  if (shipDone)       statusText = '배송완료';
  else if (shipStart) statusText = '배송중 (시작: ' + shipStart + ')';
  else if (arrDone)   statusText = '입고완료';
  else if (expArr)    statusText = '입고예정 ' + expArr;
  return '<div class="pipe-card">' +
    '<div class="pipe-card-top">' +
      '<span class="pipe-card-site">'+esc(s.doc_no||'-')+'</span>' +
      '<span class="fr-step-chip fr-s-doc">구매문서</span>' +
    '</div>' +
    '<div class="pipe-card-info">' +
      '<span>' + esc(statusText) + '</span>' +
      (s.memo ? '<span>메모: '+esc(s.memo)+'</span>' : '') +
    '</div>' +
    '<div class="pipe-card-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="openListAndDoc(\''+esc(s.doc_no||'')+'\')">🔍 구매 리스트</button>' +
    '</div>' +
  '</div>';
}

function buildPipelineCard(fr) {
  const STEP_LABELS = ['현장요청','본사확인','사내결재','서류등록','입고','배송','수령완료'];
  const STEP_COLORS = ['fr-s-new','fr-s-hq','fr-s-hq','fr-s-doc','fr-s-arr','fr-s-ship','fr-s-done'];
  const step = Math.min(Math.max(fr.current_step||1, 1), 7);
  const items = Array.isArray(fr.items) ? fr.items : [];
  const itemSummary = items.length ? esc(items[0].name||'품목 미상') + (items.length>1 ? ' 외 '+(items.length-1)+'건' : '') : '품목 없음';
  const reqDate = (fr.created_at||'').slice(0,10);
  return '<div class="pipe-card">' +
    '<div class="pipe-card-top">' +
      '<span class="pipe-card-site">'+esc(fr.site_name||'-')+'</span>' +
      '<span class="fr-step-chip '+STEP_COLORS[step-1]+'">'+STEP_LABELS[step-1]+'</span>' +
    '</div>' +
    '<div class="pipe-card-info">' +
      '<span>요청자: '+esc(fr.requester_name||'-')+'</span>' +
      '<span>사유: '+esc(fr.request_reason||'-')+'</span>' +
      '<span>'+reqDate+'</span>' +
    '</div>' +
    '<div class="pipe-card-items">'+itemSummary+'</div>' +
    (fr.linked_doc_no ? '<div style="font-size:11px;color:var(--gray400)">연결 문서: '+esc(fr.linked_doc_no)+'</div>' : '') +
    '<div class="pipe-card-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="openFrDetail(\''+esc(fr.id)+'\')">🔍 상세 보기</button>' +
    '</div>' +
  '</div>';
}

// ═══════════════════════════════════════════════════════════════
// 현장 요청 탭
// ═══════════════════════════════════════════════════════════════

let _frData = { sites: [], requests: [] };

async function loadFieldTab() {
  const area = document.getElementById('pane-field');
  if (!area) return;
  area.innerHTML = '<div class="empty-state"><div class="es-icon">⏳</div><p>불러오는 중...</p></div>';
  if (!sb) return;
  try {
    const [sitesRes, frRes] = await Promise.all([
      sb.from(SITES_TBL).select('*').eq('active', true).order('name'),
      sb.from('field_requests').select('*').order('created_at', { ascending: false })
    ]);
    _frData.sites    = sitesRes.error ? [] : (sitesRes.data || []);
    _frData.requests = frRes.error    ? [] : (frRes.data    || []);
    renderFieldTab();
  } catch(err) {
    area.innerHTML = '<div class="empty-state">❌ 로드 실패: ' + esc(err.message) + '</div>';
  }
}

function renderFieldTab() {
  const area = document.getElementById('pane-field');
  if (!area) return;
  const sites = _frData.sites;
  const siteOpts = sites.map(s => '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>').join('');

  let html =
    // ── 입력 폼 ──
    '<div class="fr-form-card">' +
      '<div class="fr-form-title">📋 새 현장 요청 등록</div>' +
      '<div class="fr-form-grid">' +
        '<div class="fr-field">' +
          '<label class="fr-label">현장명 <span class="fr-req">*</span></label>' +
          '<select id="frSite" class="fr-input"><option value="">— 현장 선택 —</option>'+siteOpts+'</select>' +
        '</div>' +
        '<div class="fr-field">' +
          '<label class="fr-label">요청자 이름 <span class="fr-req">*</span></label>' +
          '<input type="text" id="frRequester" class="fr-input" placeholder="이름을 입력하세요">' +
        '</div>' +
        '<div class="fr-field">' +
          '<label class="fr-label">요청 사유 <span class="fr-req">*</span></label>' +
          '<select id="frReason" class="fr-input">' +
            '<option value="">— 사유 선택 —</option>' +
            '<option value="파손">파손</option><option value="분실">분실</option>' +
            '<option value="소모">소모</option><option value="기타">기타</option>' +
          '</select>' +
        '</div>' +
        '<div class="fr-field fr-field-wide">' +
          '<label class="fr-label">상세 내용</label>' +
          '<textarea id="frDetail" class="fr-input" rows="2" placeholder="사유 상세 설명 (선택사항)"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="fr-items-section">' +
        '<div class="fr-items-label-row">' +
          '<span class="fr-items-label">요청 품목 <span class="fr-req">*</span></span>' +
          '<div class="fr-csv-btns">' +
            '<button class="btn btn-ghost btn-sm" type="button" onclick="downloadItemTemplate()">📥 양식 다운로드</button>' +
            '<label class="btn btn-ghost btn-sm" style="cursor:pointer">📤 파일로 일괄 추가<input type="file" accept=".xlsx,.csv" style="display:none" onchange="handleItemFileUpload(this.files[0],\'form\');this.value=\'\'"></label>' +
          '</div>' +
        '</div>' +
        '<table class="fr-items-table" id="frItemsTable">' +
          '<thead><tr><th>품목명 (모를 경우 특징 설명)</th><th>규격</th><th>수량</th><th>참고/메모</th><th></th></tr></thead>' +
          '<tbody id="frItemsBody">' +
            '<tr>' +
              '<td><input type="text" class="fr-cell-input fi-name" placeholder="품목명 또는 특징 설명"></td>' +
              '<td><input type="text" class="fr-cell-input fi-spec" placeholder="규격 (선택)"></td>' +
              '<td><input type="number" class="fr-cell-input fi-qty" value="1" min="1"></td>' +
              '<td><input type="text" class="fr-cell-input fi-memo" placeholder="위치·색상 등 참고사항"></td>' +
              '<td><button type="button" class="btn-fi-del" onclick="removeFieldRow(this)" title="삭제">✕</button></td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +
        '<button class="btn btn-ghost btn-sm" type="button" onclick="addFieldRow()" style="margin-top:8px">＋ 품목 추가</button>' +
      '</div>' +
      '<div class="fr-form-actions">' +
        '<button class="btn btn-ghost" onclick="copyFieldRequest()">📋 요청 내용 복사</button>' +
        '<button class="btn btn-primary" onclick="submitFieldRequest()">📤 요청 제출</button>' +
      '</div>' +
    '</div>' +
    // ── 요청 목록 ──
    '<div class="fr-list-section">' +
      '<div class="fr-list-header">' +
        '<div class="fr-list-title">📋 현장 요청 현황</div>' +
        '<div class="fr-list-filters">' +
          '<select id="frFilterSite" class="fr-filter-sel" onchange="renderFieldList()">' +
            '<option value="">전체 현장</option>' + siteOpts +
          '</select>' +
          '<select id="frFilterStep" class="fr-filter-sel" onchange="renderFieldList()">' +
            '<option value="">전체 단계</option>' +
            '<option value="active">진행중</option>' +
            '<option value="done">완료</option>' +
          '</select>' +
          '<button class="btn btn-ghost btn-sm" onclick="loadFieldTab()">🔄</button>' +
        '</div>' +
      '</div>' +
      '<div id="frListArea"></div>' +
    '</div>';

  area.innerHTML = html;
  renderFieldList();
}

function renderFieldList() {
  const wrap = document.getElementById('frListArea');
  if (!wrap) return;
  const fSite = (document.getElementById('frFilterSite')||{}).value || '';
  const fStep = (document.getElementById('frFilterStep')||{}).value || '';

  let reqs = _frData.requests;
  if (fSite) reqs = reqs.filter(r => r.site_name === fSite);
  if (fStep === 'active') reqs = reqs.filter(r => r.current_step < 7);
  if (fStep === 'done')   reqs = reqs.filter(r => r.current_step >= 7);

  if (!reqs.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:32px"><div class="es-icon" style="font-size:28px">📭</div><p>등록된 요청이 없습니다.</p></div>';
    return;
  }

  const stepLabels = ['요청접수','본사확인','사내결재','서류등록','입고','배송','수령완료'];
  const stepColors = ['fr-s-new','fr-s-hq','fr-s-hq','fr-s-doc','fr-s-arr','fr-s-ship','fr-s-done'];

  let rows = '';
  reqs.forEach(r => {
    const items  = Array.isArray(r.items) ? r.items : [];
    const summary = items.length
      ? esc(items[0].name||'-') + (items.length>1 ? ' <span style="color:var(--gray400)">외 '+(items.length-1)+'건</span>' : '')
      : '-';
    const step  = Math.min(Math.max(r.current_step||1, 1), 7);
    const reqDate = (r.created_at||'').slice(0,10);
    rows += '<tr class="fr-list-row" onclick="openFrDetail(\''+r.id+'\')">' +
      '<td>'+reqDate+'</td>' +
      '<td>'+esc(r.site_name||'-')+'</td>' +
      '<td>'+esc(r.requester_name||'-')+'</td>' +
      '<td style="text-align:left">'+summary+'</td>' +
      '<td><span class="fr-step-chip '+stepColors[step-1]+'">'+stepLabels[step-1]+'</span></td>' +
      '<td>'+esc(r.request_reason||'-')+'</td>' +
    '</tr>';
  });

  wrap.innerHTML =
    '<div class="tbl-wrap" style="margin-top:0">' +
    '<table><thead><tr>' +
      '<th>요청일</th><th>현장명</th><th>요청자</th>' +
      '<th style="text-align:left">품목</th><th>현재 단계</th><th>사유</th>' +
    '</tr></thead><tbody>'+rows+'</tbody></table>' +
    '<div class="tbl-footer">'+reqs.length+'건 표시 (전체 '+_frData.requests.length+'건)</div>' +
    '</div>';
}

function addFieldRow(name='', spec='', qty=1, memo='') {
  const tbody = document.getElementById('frItemsBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="fr-cell-input fi-name" placeholder="품목명 또는 특징 설명" value="'+esc(name)+'"></td>' +
    '<td><input type="text" class="fr-cell-input fi-spec" placeholder="규격 (선택)" value="'+esc(spec)+'"></td>' +
    '<td><input type="number" class="fr-cell-input fi-qty" value="'+qty+'" min="1"></td>' +
    '<td><input type="text" class="fr-cell-input fi-memo" placeholder="위치·색상 등 참고사항" value="'+esc(memo)+'"></td>' +
    '<td><button type="button" class="btn-fi-del" onclick="removeFieldRow(this)" title="삭제">✕</button></td>';
  tbody.appendChild(tr);
}

function removeFieldRow(btn) {
  const tbody = document.getElementById('frItemsBody');
  if (!tbody || tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
}

async function submitFieldRequest() {
  if (!sb) { showToast('Supabase 연결 오류', 'danger'); return; }
  const site      = (document.getElementById('frSite')     ||{}).value || '';
  const requester = ((document.getElementById('frRequester')||{}).value||'').trim();
  const reason    = (document.getElementById('frReason')   ||{}).value || '';
  const detail    = ((document.getElementById('frDetail')  ||{}).value||'').trim();

  if (!site)      { showToast('현장명을 선택해주세요.', 'warning'); return; }
  if (!requester) { showToast('요청자 이름을 입력해주세요.', 'warning'); return; }
  if (!reason)    { showToast('요청 사유를 선택해주세요.', 'warning'); return; }

  const rows = document.querySelectorAll('#frItemsBody tr');
  const items = [];
  rows.forEach(row => {
    const name = ((row.querySelector('.fi-name')||{}).value||'').trim();
    const spec = ((row.querySelector('.fi-spec')||{}).value||'').trim();
    const qty  = parseInt((row.querySelector('.fi-qty')||{}).value||'1', 10) || 1;
    const memo = ((row.querySelector('.fi-memo')||{}).value||'').trim();
    if (name || memo) items.push({ name: name||'(미상)', spec, qty, ...(memo?{memo}:{}) });
  });
  if (!items.length) { showToast('품목명 또는 참고 내용을 하나 이상 입력해주세요.', 'warning'); return; }

  try {
    const { error } = await sb.from('field_requests').insert({
      site_name:      site,
      requester_name: requester,
      request_reason: reason,
      reason_detail:  detail || null,
      items:          items,
      current_step:   1
    });
    if (error) throw error;
    showToast('요청이 제출됐습니다! ✅', 'success');
    await loadFieldTab();
  } catch(err) {
    showToast('제출 실패: ' + err.message, 'danger');
  }
}

function copyFieldRequest() {
  const site      = (document.getElementById('frSite')     ||{}).value || '(미선택)';
  const requester = ((document.getElementById('frRequester')||{}).value||'').trim() || '(미입력)';
  const reason    = (document.getElementById('frReason')   ||{}).value || '(미선택)';
  const detail    = ((document.getElementById('frDetail')  ||{}).value||'').trim();
  const today     = todayStr();
  const rows = document.querySelectorAll('#frItemsBody tr');
  const itemLines = [];
  rows.forEach((row, i) => {
    const name = ((row.querySelector('.fi-name')||{}).value||'').trim();
    const spec = ((row.querySelector('.fi-spec')||{}).value||'').trim();
    const qty  = ((row.querySelector('.fi-qty') ||{}).value||'1');
    const memo = ((row.querySelector('.fi-memo')||{}).value||'').trim();
    const nameStr = name || (memo ? '(품목명 미상)' : '');
    if (!nameStr && !memo) return;
    let line = (i+1) + '. ' + nameStr;
    if (spec) line += ' | ' + spec;
    line += ' | ' + qty + '개';
    if (memo) line += '  ← ' + memo;
    itemLines.push(line);
  });
  const text = [
    '[현장 구매 요청]',
    '현장명: ' + site,
    '요청자: ' + requester + '  |  요청일: ' + today,
    '사유: ' + reason + (detail ? ' — ' + detail : ''),
    '',
    '품목:',
    itemLines.length ? itemLines.join('\n') : '(품목 미입력)',
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 요청 내용이 클립보드에 복사됐습니다.', 'success');
  }).catch(() => {
    showToast('복사 실패: 브라우저 권한을 확인하세요.', 'warning');
  });
}

function downloadItemTemplate() {
  if (typeof XLSX === 'undefined') { showToast('엑셀 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도하세요.', 'warning'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['품목명 (필수 — 모를 경우 특징 설명)', '규격', '수량 (필수)', '참고/메모'],
    ['DNC_ROLLER', 'ML097803', 2, ''],
    ['(품목명 미상)', '', 1, '검은색 모터 옆 베어링'],
  ]);
  ws['!cols'] = [{ wpx: 220 }, { wpx: 120 }, { wpx: 80 }, { wpx: 200 }];
  XLSX.utils.book_append_sheet(wb, ws, '품목입력양식');
  XLSX.writeFile(wb, '품목입력양식.xlsx');
}

function handleItemFileUpload(file, context) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('엑셀 라이브러리를 불러오는 중입니다.', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { showToast('파일에 데이터가 없습니다.', 'warning'); return; }
      const getName = r => String(r['품목명 (필수 — 모를 경우 특징 설명)'] || r['품목명'] || '').trim();
      const getSpec = r => String(r['규격'] || r['spec'] || '').trim();
      const getQty  = r => parseInt(r['수량 (필수)'] || r['수량'] || r['qty'] || 1, 10) || 1;
      const getMemo = r => String(r['참고/메모'] || r['참고'] || r['메모'] || r['memo'] || '').trim();
      const parsed  = rows.filter(r => getName(r) || getMemo(r));
      if (!parsed.length) { showToast('품목명 또는 메모가 있는 행이 없습니다.', 'warning'); return; }
      if (context === 'form') {
        // 폼의 기존 빈 행 제거 후 추가
        const tbody = document.getElementById('frItemsBody');
        if (tbody) {
          Array.from(tbody.rows).forEach(r => {
            const n = (r.querySelector('.fi-name')||{}).value||'';
            const m = (r.querySelector('.fi-memo')||{}).value||'';
            if (!n && !m) r.remove();
          });
        }
        parsed.forEach(r => addFieldRow(getName(r), getSpec(r), getQty(r), getMemo(r)));
      } else {
        // frModal 품목 편집 테이블
        const tbody = document.getElementById('frEditItemsBody');
        if (tbody) {
          parsed.forEach(r => addFrEditRow(tbody, getName(r), getSpec(r), getQty(r), getMemo(r)));
        }
      }
      showToast('✅ ' + parsed.length + '개 품목이 추가됐습니다.', 'success');
    } catch(err) {
      showToast('파일 읽기 실패: ' + err.message, 'danger');
    }
  };
  reader.readAsBinaryString(file);
}

function openFrDetail(id) {
  const fr = (_frData.requests||[]).find(r => r.id === id);
  if (!fr) return;
  const modal = document.getElementById('frModal');
  if (!modal) return;
  document.getElementById('frModalTitle').textContent = (fr.site_name||'-') + ' — ' + (fr.requester_name||'-');
  document.getElementById('frModalBody').innerHTML = buildFrTimeline(fr);
  modal.style.display = 'flex';
}

function buildFrTimeline(fr) {
  const today = todayStr();
  const cur = fr.current_step || 1;

  // linked doc_status 병합 — 5~7단계에 우선 사용
  const linked_s = fr.linked_doc_no ? (gStatusMap[fr.linked_doc_no] || {}) : {};
  const arrDone   = linked_s.arrival_done    ?? fr.arrival_done;
  const arrDoneAt = linked_s.arrival_done_at ?? fr.arrival_done_at;
  const expArr    = linked_s.expected_arrival ?? fr.expected_arrival;
  const shipDone  = linked_s.ship_done       ?? fr.ship_done;
  const shipDoneAt= linked_s.ship_done_at    ?? fr.ship_done_at;
  const shipStart = linked_s.ship_start_date ?? fr.ship_start_date;
  const shipEnd   = linked_s.ship_done_date  ?? fr.ship_done_date;
  const rcvDone   = !!fr.received_at || !!shipDone;
  const rcvDate   = (fr.received_at || linked_s.ship_done_at || '').slice(0, 10);

  const defs = [
    { label:'요청 접수',  done:true,                    date:(fr.created_at||'').slice(0,10), by:fr.requester_name,  extra:'현장: '+fr.site_name+' / 사유: '+fr.request_reason },
    { label:'본사 확인',  done:!!fr.hq_confirmed_at,    date:(fr.hq_confirmed_at||'').slice(0,10),  by:fr.hq_confirmed_by },
    { label:'사내 결재',  done:!!fr.doc_approved_at,    date:(fr.doc_approved_at||'').slice(0,10),  by:fr.doc_approved_by,  extra:fr.doc_ref_no?'문서번호: '+fr.doc_ref_no:'' },
    { label:'서류 등록',  done:!!fr.linked_doc_no,      date:(fr.linked_at||'').slice(0,10),         extra:fr.linked_doc_no?'연결 문서: '+fr.linked_doc_no:'' },
    { label:'입고',       done:!!arrDone,               date:(arrDoneAt||'').slice(0,10),     extra:expArr?'예정일: '+expArr:'',
      delayed:!arrDone && expArr && expArr < today },
    { label:'배송',       done:!!shipDone,              date:(shipDoneAt||'').slice(0,10),    extra:shipStart?'시작일: '+shipStart+''+( shipEnd?' / 완료예정: '+shipEnd:''):'',
      delayed:!shipDone && shipEnd && shipEnd < today },
    { label:'현장 수령',  done:rcvDone,                  date:rcvDate,                         by:fr.received_by,
      extra: rcvDone && !fr.received_at ? '(배송완료 처리)' : '' },
  ];
  const nums = ['①','②','③','④','⑤','⑥','⑦'];

  // 관리 버튼 (수정/삭제)
  let html = '<div class="fr-mgmt-row">' +
    '<button class="btn btn-ghost btn-sm" onclick="startFrEdit(\''+esc(fr.id)+'\')">✏️ 수정</button>' +
    '<button class="btn btn-danger btn-sm" onclick="deleteFrRequest(\''+esc(fr.id)+'\')">🗑 삭제</button>' +
  '</div>';

  html += '<div class="fr-modal-section"><div class="fr-modal-stitle">📊 처리 현황</div><div class="fr-timeline">';
  defs.forEach((s, i) => {
    let cls = 'frs-pending'; let icon = '⚪';
    if (s.done)              { cls = 'frs-done';    icon = '✅'; }
    else if (i+1 === cur)    { cls = 'frs-current'; icon = '🔵'; }
    else if (s.delayed)      { cls = 'frs-delayed'; icon = '🔴'; }

    html += '<div class="fr-tl-step '+cls+'">' +
      '<div class="frs-head"><span class="frs-icon">'+icon+'</span><span class="frs-num">'+nums[i]+'</span><span class="frs-lbl">'+s.label+'</span></div>' +
      (s.date||s.by||s.extra ? '<div class="frs-detail">' +
        (s.date  ? '<span class="frs-date">'+esc(s.date)+'</span>' : '') +
        (s.by    ? '<span class="frs-by">'+esc(s.by)+'</span>' : '') +
        (s.extra ? '<span class="frs-extra">'+esc(s.extra)+'</span>' : '') +
      '</div>' : '') +
      (s.delayed ? '<span class="frs-delay">⚠️ 지연</span>' : '') +
      (i === 3 && fr.linked_doc_no && cur >= 5
        ? '<div style="margin-top:8px">' +
          '<button class="btn btn-ghost btn-sm" onclick="toggleRelinkForm(\''+esc(String(fr.id))+'\')">🔄 연결 문서 변경</button>' +
          '<div id="frsRelinkForm_'+esc(String(fr.id))+'" style="display:none;margin-top:8px">' +
            '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
              '<input type="text" id="frsRelinkInput_'+esc(String(fr.id))+'" class="fr-input" placeholder="새 문서번호" style="width:180px;font-size:13px">' +
              '<button class="btn btn-primary btn-sm" onclick="saveRelinkDoc(\''+esc(String(fr.id))+'\')">저장</button>' +
              '<button class="btn btn-ghost btn-sm" onclick="toggleRelinkForm(\''+esc(String(fr.id))+'\')">취소</button>' +
            '</div>' +
          '</div>' +
        '</div>'
        : '') +
    '</div>';
    if (i < 6) html += '<div class="frs-conn"></div>';
  });
  html += '</div></div>';

  // 품목
  const items = Array.isArray(fr.items) ? fr.items : [];
  html += '<div class="fr-modal-section" id="frItemsViewSec_'+esc(fr.id)+'">' +
    '<div class="fr-modal-stitle-row">' +
      '<span class="fr-modal-stitle">📦 요청 품목</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="toggleFrItemEdit(\''+esc(fr.id)+'\')">📝 품목 편집</button>' +
    '</div>' +
    // 읽기 전용 테이블
    '<div id="frItemsReadView_'+esc(fr.id)+'">' +
    (items.length
      ? '<table class="fr-items-view"><thead><tr><th>품목명</th><th>규격</th><th>수량</th><th>참고</th></tr></thead><tbody>' +
        items.map(it =>
          '<tr><td>'+esc(it.name||'-')+'</td><td style="color:var(--gray500)">'+esc(it.spec||'-')+'</td>' +
          '<td style="text-align:center;font-weight:700">'+esc(String(it.qty||1))+'</td>' +
          '<td style="color:var(--gray400);font-size:12px">'+esc(it.memo||'')+'</td></tr>'
        ).join('') + '</tbody></table>'
      : '<p style="color:var(--gray400);font-size:13px;padding:8px 0">등록된 품목이 없습니다. 편집 버튼으로 추가하세요.</p>'
    ) +
    '</div>' +
    // 편집 테이블 (숨김)
    '<div id="frItemsEditView_'+esc(fr.id)+'" style="display:none">' +
      '<div class="fr-csv-btns" style="margin-bottom:8px">' +
        '<button class="btn btn-ghost btn-sm" type="button" onclick="downloadItemTemplate()">📥 양식 다운로드</button>' +
        '<label class="btn btn-ghost btn-sm" style="cursor:pointer">📤 파일로 추가<input type="file" accept=".xlsx,.csv" style="display:none" onchange="handleItemFileUpload(this.files[0],\''+esc(fr.id)+'\');this.value=\'\'"></label>' +
      '</div>' +
      '<table class="fr-items-table"><thead><tr><th>품목명</th><th>규격</th><th>수량</th><th>참고</th><th></th></tr></thead>' +
      '<tbody id="frEditItemsBody_'+esc(fr.id)+'">' +
      items.map(it =>
        '<tr>' +
          '<td><input type="text" class="fr-cell-input fi-ename" value="'+esc(it.name||'')+'" placeholder="품목명 또는 특징"></td>' +
          '<td><input type="text" class="fr-cell-input fi-espec" value="'+esc(it.spec||'')+'" placeholder="규격"></td>' +
          '<td><input type="number" class="fr-cell-input fi-eqty" value="'+(it.qty||1)+'" min="1"></td>' +
          '<td><input type="text" class="fr-cell-input fi-ememo" value="'+esc(it.memo||'')+'" placeholder="참고사항"></td>' +
          '<td><button type="button" class="btn-fi-del" onclick="this.closest(\'tr\').remove()" title="삭제">✕</button></td>' +
        '</tr>'
      ).join('') +
      (items.length === 0 ? '<tr>' +
          '<td><input type="text" class="fr-cell-input fi-ename" placeholder="품목명 또는 특징"></td>' +
          '<td><input type="text" class="fr-cell-input fi-espec" placeholder="규격"></td>' +
          '<td><input type="number" class="fr-cell-input fi-eqty" value="1" min="1"></td>' +
          '<td><input type="text" class="fr-cell-input fi-ememo" placeholder="참고사항"></td>' +
          '<td><button type="button" class="btn-fi-del" onclick="this.closest(\'tr\').remove()" title="삭제">✕</button></td>' +
        '</tr>' : '') +
      '</tbody></table>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button class="btn btn-ghost btn-sm" type="button" onclick="addFrEditRow(document.getElementById(\'frEditItemsBody_'+esc(fr.id)+'\'))">＋ 행 추가</button>' +
        '<button class="btn btn-primary btn-sm" onclick="saveFrItems(\''+esc(fr.id)+'\')">💾 품목 저장</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="toggleFrItemEdit(\''+esc(fr.id)+'\')">취소</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  // 메모 / 지연 사유
  if (fr.delay_reason) html += '<div class="fr-modal-section"><div class="fr-modal-stitle">⚠️ 지연 사유</div><p style="color:var(--danger);font-size:14px">'+esc(fr.delay_reason)+'</p></div>';
  if (fr.memo) html += '<div class="fr-modal-section"><div class="fr-modal-stitle">📝 메모</div><p style="color:var(--gray600);font-size:14px">'+esc(fr.memo)+'</p></div>';

  // 단계 업데이트 패널
  if (fr.received_at) {
    html += '<div class="fr-adv-done">🎉 모든 단계가 완료됐습니다!</div>';
  } else {
    html += buildStepAdvanceForm(fr);
  }

  return html;
}

// ── 연결 문서 변경 ──
function toggleRelinkForm(id) {
  const el = document.getElementById('frsRelinkForm_' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveRelinkDoc(id) {
  const newDocNo = (document.getElementById('frsRelinkInput_' + id) || {}).value;
  if (!newDocNo || !newDocNo.trim()) { showToast('문서번호를 입력해주세요.', 'warning'); return; }
  const docNo = newDocNo.trim();
  const fr = (_frData.requests || []).find(r => r.id === id);
  if (!fr || !sb) return;

  let autoStep = 4;
  try {
    const dsRes = await sb.from(STATUS_TBL).select('*').eq('doc_no', docNo).maybeSingle();
    if (dsRes.data) {
      const ds = dsRes.data;
      if (ds.ship_done)             autoStep = 7;
      else if (ds.ship_start_date)  autoStep = 6;
      else if (ds.arrival_done || ds.expected_arrival) autoStep = 5;
      gStatusMap[docNo] = ds;
    }
  } catch(e) { /* doc_status 조회 실패 시 step 4 유지 */ }

  autoStep = Math.max(autoStep, fr.current_step || 4);

  try {
    const { error } = await sb.from('field_requests').update({
      linked_doc_no: docNo,
      linked_at: new Date().toISOString(),
      current_step: autoStep
    }).eq('id', id);
    if (error) throw error;
    showToast('연결 문서가 변경되었습니다 ✅', 'success');
    const { data: fresh } = await sb.from('field_requests').select('*').eq('id', id).single();
    if (fresh) {
      const idx = _frData.requests.findIndex(r => r.id === id);
      if (idx >= 0) _frData.requests[idx] = fresh;
      renderFieldList();
      document.getElementById('frModalTitle').textContent = (fresh.site_name||'-') + ' — ' + (fresh.requester_name||'-');
      document.getElementById('frModalBody').innerHTML = buildFrTimeline(fresh);
    }
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'danger');
  }
}

// ── FR 수정 ──
function startFrEdit(id) {
  const fr = (_frData.requests||[]).find(r => r.id === id);
  if (!fr) return;
  const sites = _frData.sites;
  const siteOpts = sites.map(s => '<option value="'+esc(s.name)+'"'+(s.name===fr.site_name?' selected':'')+'>'+esc(s.name)+'</option>').join('');
  const html =
    '<div class="fr-edit-form">' +
    '<div class="fr-modal-stitle" style="margin-bottom:12px">✏️ 요청 정보 수정</div>' +
    '<div class="fr-form-grid">' +
      '<div class="fr-field"><label class="fr-label">현장명 <span class="fr-req">*</span></label>' +
        '<select id="feditSite" class="fr-input"><option value="">— 현장 선택 —</option>'+siteOpts+'</select></div>' +
      '<div class="fr-field"><label class="fr-label">요청자 이름 <span class="fr-req">*</span></label>' +
        '<input type="text" id="feditRequester" class="fr-input" value="'+esc(fr.requester_name||'')+'"></div>' +
      '<div class="fr-field"><label class="fr-label">요청 사유 <span class="fr-req">*</span></label>' +
        '<select id="feditReason" class="fr-input">' +
          ['파손','분실','소모','기타'].map(v => '<option value="'+v+'"'+(v===fr.request_reason?' selected':'')+'>'+v+'</option>').join('') +
        '</select></div>' +
      '<div class="fr-field fr-field-wide"><label class="fr-label">상세 내용</label>' +
        '<textarea id="feditDetail" class="fr-input" rows="2">'+esc(fr.reason_detail||'')+'</textarea></div>' +
      '<div class="fr-field fr-field-wide"><label class="fr-label">메모</label>' +
        '<textarea id="feditMemo" class="fr-input" rows="2">'+esc(fr.memo||'')+'</textarea></div>' +
    '</div>' +
    '<div class="fr-form-actions">' +
      '<button class="btn btn-ghost" onclick="openFrDetail(\''+esc(id)+'\')">취소</button>' +
      '<button class="btn btn-primary" onclick="saveFrEdit(\''+esc(id)+'\')">💾 저장</button>' +
    '</div>' +
    '</div>';
  document.getElementById('frModalBody').innerHTML = html;
}

async function saveFrEdit(id) {
  if (!sb) return;
  const site      = (document.getElementById('feditSite')     ||{}).value||'';
  const requester = ((document.getElementById('feditRequester')||{}).value||'').trim();
  const reason    = (document.getElementById('feditReason')   ||{}).value||'';
  const detail    = ((document.getElementById('feditDetail')  ||{}).value||'').trim();
  const memo      = ((document.getElementById('feditMemo')    ||{}).value||'').trim();
  if (!site || !requester || !reason) { showToast('현장명, 요청자, 사유는 필수입니다.', 'warning'); return; }
  try {
    const { error } = await sb.from('field_requests').update({
      site_name:      site,
      requester_name: requester,
      request_reason: reason,
      reason_detail:  detail || null,
      memo:           memo || null,
    }).eq('id', id);
    if (error) throw error;
    // 캐시 갱신
    const idx = (_frData.requests||[]).findIndex(r => r.id === id);
    if (idx >= 0) Object.assign(_frData.requests[idx], { site_name:site, requester_name:requester, request_reason:reason, reason_detail:detail||null, memo:memo||null });
    showToast('요청 정보가 수정됐습니다.', 'success');
    openFrDetail(id);
  } catch(err) {
    showToast('수정 실패: ' + err.message, 'danger');
  }
}

async function deleteFrRequest(id) {
  if (!confirm('이 현장 요청을 삭제하면 복구할 수 없습니다.\n삭제하시겠습니까?')) return;
  if (!sb) return;
  try {
    const { error } = await sb.from('field_requests').delete().eq('id', id);
    if (error) throw error;
    _frData.requests = (_frData.requests||[]).filter(r => r.id !== id);
    document.getElementById('frModal').style.display = 'none';
    renderFieldList();
    showToast('요청이 삭제됐습니다.', 'success');
  } catch(err) {
    showToast('삭제 실패: ' + err.message, 'danger');
  }
}

// ── FR 품목 편집 ──
function toggleFrItemEdit(id) {
  const readView = document.getElementById('frItemsReadView_'+id);
  const editView = document.getElementById('frItemsEditView_'+id);
  if (!readView || !editView) return;
  const isEdit = editView.style.display !== 'none';
  readView.style.display = isEdit ? '' : 'none';
  editView.style.display = isEdit ? 'none' : '';
}

function addFrEditRow(tbody, name='', spec='', qty=1, memo='') {
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="fr-cell-input fi-ename" placeholder="품목명 또는 특징" value="'+esc(name)+'"></td>' +
    '<td><input type="text" class="fr-cell-input fi-espec" placeholder="규격" value="'+esc(spec)+'"></td>' +
    '<td><input type="number" class="fr-cell-input fi-eqty" value="'+qty+'" min="1"></td>' +
    '<td><input type="text" class="fr-cell-input fi-ememo" placeholder="참고사항" value="'+esc(memo)+'"></td>' +
    '<td><button type="button" class="btn-fi-del" onclick="this.closest(\'tr\').remove()" title="삭제">✕</button></td>';
  tbody.appendChild(tr);
}

async function saveFrItems(id) {
  if (!sb) return;
  const tbody = document.getElementById('frEditItemsBody_'+id);
  if (!tbody) return;
  const items = [];
  Array.from(tbody.rows).forEach(row => {
    const name = ((row.querySelector('.fi-ename')||{}).value||'').trim();
    const spec = ((row.querySelector('.fi-espec')||{}).value||'').trim();
    const qty  = parseInt((row.querySelector('.fi-eqty') ||{}).value||'1', 10) || 1;
    const memo = ((row.querySelector('.fi-ememo')||{}).value||'').trim();
    if (name || memo) items.push({ name: name||'(미상)', spec, qty, ...(memo?{memo}:{}) });
  });
  try {
    const { error } = await sb.from('field_requests').update({ items }).eq('id', id);
    if (error) throw error;
    const idx = (_frData.requests||[]).findIndex(r => r.id === id);
    if (idx >= 0) _frData.requests[idx].items = items;
    showToast('품목이 저장됐습니다.', 'success');
    openFrDetail(id);
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'danger');
  }
}

function buildStepAdvanceForm(fr) {
  const step = fr.current_step || 1;
  const actionLabels = [
    '본사 확인 처리',   // 1→2
    '사내 결재 처리',   // 2→3
    '서류 등록 연결',   // 3→4
    '입고 완료 처리',   // 4→5
    '배송 시작 처리',   // 5→6
    '배송 완료 처리',   // 6→7
    '수령 완료 처리',   // 7(done)
  ];
  const label = actionLabels[Math.min(step, 7) - 1];

  let fields = '';
  if (step === 1) {
    fields =
      '<div class="fr-adv-field"><label>본사 담당자 이름 <span class="fr-req">*</span></label>' +
      '<input type="text" id="advF1" class="fr-input" placeholder="담당자 이름"></div>';
  } else if (step === 2) {
    fields =
      '<div class="fr-adv-field"><label>결재자 이름 <span class="fr-req">*</span></label>' +
      '<input type="text" id="advF1" class="fr-input" placeholder="결재자 이름"></div>' +
      '<div class="fr-adv-field"><label>사내 문서번호</label>' +
      '<input type="text" id="advF2" class="fr-input" placeholder="결재 문서번호 (선택)"></div>';
  } else if (step === 3) {
    fields =
      '<div class="fr-adv-field"><label>연결 구매 문서번호 <span class="fr-req">*</span></label>' +
      '<input type="text" id="advF1" class="fr-input" placeholder="예: DOC-2026-001"></div>';
  } else if (step === 4) {
    fields =
      '<div class="fr-adv-field"><label>입고 예정일</label>' +
      '<input type="date" id="advF1" class="fr-input" value="'+(fr.expected_arrival||'')+'"></div>' +
      '<p class="fr-adv-note">버튼 클릭 시 입고 완료로 처리되고 배송 단계로 이동합니다.</p>';
  } else if (step === 5) {
    fields =
      '<div class="fr-adv-field"><label>배송 시작일 <span class="fr-req">*</span></label>' +
      '<input type="date" id="advF1" class="fr-input"></div>' +
      '<div class="fr-adv-field"><label>배송 완료 예정일</label>' +
      '<input type="date" id="advF2" class="fr-input"></div>';
  } else if (step === 6) {
    fields = '<p class="fr-adv-note">배송 완료 처리 후 현장 수령 단계로 이동합니다.</p>';
  } else if (step === 7) {
    fields =
      '<div class="fr-adv-field"><label>수령 확인자 이름</label>' +
      '<input type="text" id="advF1" class="fr-input" placeholder="수령자 이름 (선택)"></div>';
  }

  return '<div class="fr-adv-section">' +
    '<div class="fr-adv-title">⬆️ ' + label + '</div>' +
    fields +
    '<div class="fr-adv-field"><label>메모</label>' +
      '<textarea id="advMemo" class="fr-input" rows="2" placeholder="메모 (선택)">'+esc(fr.memo||'')+'</textarea>' +
    '</div>' +
    '<div class="fr-adv-actions">' +
      '<button class="btn btn-primary" onclick="advanceFieldRequest(\''+fr.id+'\')">✅ ' + label + '</button>' +
    '</div>' +
  '</div>';
}

async function advanceFieldRequest(id) {
  const fr = (_frData.requests||[]).find(r => r.id === id);
  if (!fr || !sb) return;
  const step = fr.current_step || 1;
  const now = new Date().toISOString();
  const f1  = ((document.getElementById('advF1') ||{}).value||'').trim();
  const f2  = ((document.getElementById('advF2') ||{}).value||'').trim();
  const memo= ((document.getElementById('advMemo')||{}).value||'').trim();

  let update = {};
  let dsUpdate = null; // doc_status upsert 데이터 (linked 시)

  if (step === 1) {
    if (!f1) { showToast('담당자 이름을 입력해주세요.', 'warning'); return; }
    update = { hq_confirmed_at: now, hq_confirmed_by: f1, current_step: 2 };
  } else if (step === 2) {
    if (!f1) { showToast('결재자 이름을 입력해주세요.', 'warning'); return; }
    update = { doc_approved_at: now, doc_approved_by: f1, doc_ref_no: f2||null, current_step: 3 };
  } else if (step === 3) {
    // 서류 연결 — 기존 doc_status 상태에 따라 current_step 자동 설정
    if (!f1) { showToast('문서번호를 입력해주세요.', 'warning'); return; }
    let autoStep = 4;
    try {
      const dsRes = await sb.from(STATUS_TBL).select('*').eq('doc_no', f1).maybeSingle();
      if (dsRes.data) {
        const ds = dsRes.data;
        if (ds.ship_done)          autoStep = 7;
        else if (ds.ship_start_date) autoStep = 6;
        else if (ds.arrival_done)    autoStep = 5;
        else if (ds.expected_arrival) autoStep = 5;
        gStatusMap[f1] = ds; // 캐시 갱신
      }
    } catch(e) { /* doc_status 조회 실패 시 step 4로 진행 */ }
    update = { linked_doc_no: f1, linked_at: now, current_step: autoStep };
  } else if (step === 4) {
    if (fr.linked_doc_no) {
      dsUpdate = { doc_no: fr.linked_doc_no, expected_arrival: f1||null, arrival_done: true, arrival_done_at: now };
      update = { current_step: 5 };
    } else {
      update = { expected_arrival: f1||null, arrival_done: true, arrival_done_at: now, current_step: 5 };
    }
  } else if (step === 5) {
    if (!f1) { showToast('배송 시작일을 입력해주세요.', 'warning'); return; }
    if (fr.linked_doc_no) {
      dsUpdate = { doc_no: fr.linked_doc_no, ship_start_date: f1, ship_done_date: f2||null };
      update = { current_step: 6 };
    } else {
      update = { ship_start_date: f1, ship_done_date: f2||null, current_step: 6 };
    }
  } else if (step === 6) {
    if (fr.linked_doc_no) {
      dsUpdate = { doc_no: fr.linked_doc_no, ship_done: true, ship_done_at: now };
      update = { current_step: 7 };
    } else {
      update = { ship_done: true, ship_done_at: now, current_step: 7 };
    }
  } else if (step === 7) {
    update = { received_at: now, received_by: f1||null };
  }
  if (memo !== '') update.memo = memo;

  try {
    // doc_status upsert (linked 경우)
    if (dsUpdate) {
      const { error: dsErr } = await sb.from(STATUS_TBL).upsert(dsUpdate, { onConflict: 'doc_no' });
      if (dsErr) throw dsErr;
      gStatusMap[dsUpdate.doc_no] = { ...(gStatusMap[dsUpdate.doc_no]||{}), ...dsUpdate };
    }
    const { error } = await sb.from('field_requests').update(update).eq('id', id);
    if (error) throw error;
    showToast('저장됐습니다! ✅', 'success');
    // 데이터 갱신 후 모달 내 타임라인만 업데이트
    const { data: fresh } = await sb.from('field_requests').select('*').eq('id', id).single();
    if (fresh) {
      const idx = _frData.requests.findIndex(r => r.id === id);
      if (idx >= 0) _frData.requests[idx] = fresh;
      renderFieldList();
      document.getElementById('frModalTitle').textContent = (fresh.site_name||'-') + ' — ' + (fresh.requester_name||'-');
      document.getElementById('frModalBody').innerHTML = buildFrTimeline(fresh);
    }
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════════════
// PRQ 로그 저장 / 연결
// ═══════════════════════════════════════════════════════════════
async function savePrqLog(results) {
  if (!sb || !results.length) return;
  const toSave = results.filter(r => r.prq_no);
  if (!toSave.length) return;
  try {
    const rows = toSave.map(r => ({
      prq_no: r.prq_no,
      title:  r.title || null,
      doc_no: r.matched_doc_no || null,
      status: r.matched_doc_no ? 'registered' : 'unregistered'
    }));
    const { error } = await sb.from(PRQ_LOG_TBL).upsert(rows, { onConflict: 'prq_no', ignoreDuplicates: false });
    if (error) throw error;
    const unregCount = rows.filter(r => r.status === 'unregistered').length;
    if (unregCount > 0)
      showToast('⚠️ PRQ 미등록 ' + unregCount + '건이 대시보드에 기록됐습니다.', 'warning');
  } catch(err) {
    console.warn('PRQ 로그 저장 실패 (migration_add_prq_log.sql 실행 필요):', err.message);
  }
}

async function linkPrqToDoc(prqNo, docNo) {
  if (!sb || !prqNo || !docNo) return;
  try {
    await sb.from(PRQ_LOG_TBL)
      .update({ doc_no: docNo, status: 'registered' })
      .eq('prq_no', prqNo)
      .eq('status', 'unregistered');
  } catch(err) {
    console.warn('PRQ 연결 오류:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 현장 관리 모달
// ═══════════════════════════════════════════════════════════════
document.getElementById('sitesBtn').addEventListener('click', openSitesModal);
document.getElementById('sitesModalClose').addEventListener('click', () =>
  document.getElementById('sitesModal').classList.remove('open')
);
document.getElementById('sitesModal').addEventListener('click', e => {
  if (e.target === document.getElementById('sitesModal'))
    document.getElementById('sitesModal').classList.remove('open');
});
document.getElementById('addSiteBtn').addEventListener('click', async () => {
  const input = document.getElementById('newSiteName');
  const name  = input.value.trim();
  if (!name) { showToast('현장명을 입력하세요.', 'error'); return; }
  await addSite(name);
  input.value = '';
});
document.getElementById('newSiteName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addSiteBtn').click();
});

async function openSitesModal() {
  document.getElementById('sitesModal').classList.add('open');
  await loadSitesForModal();
}

async function loadSitesForModal() {
  const wrap = document.getElementById('sitesListWrap');
  if (!sb) { wrap.innerHTML = '<p style="color:var(--danger)">Supabase 미연결</p>'; return; }
  wrap.innerHTML = '<div class="empty-state" style="padding:20px"><div class="es-icon" style="font-size:24px">⏳</div><p>불러오는 중...</p></div>';
  try {
    const { data, error } = await sb.from(SITES_TBL).select('*').order('name');
    if (error) throw error;
    if (!data || !data.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:24px"><div class="es-icon" style="font-size:28px">🏭</div><p>등록된 현장이 없습니다.<br>위에서 추가해주세요.</p></div>';
      return;
    }
    let html = '<div class="sites-list">';
    data.forEach(site => {
      html +=
        '<div class="site-row" id="site-row-' + site.id + '">' +
          '<span class="site-name' + (site.active ? '' : ' site-inactive') + '">' + esc(site.name) + '</span>' +
          '<div class="site-actions">' +
            '<button class="btn btn-sm ' + (site.active ? 'btn-success' : 'btn-ghost') + '" ' +
              'onclick="toggleSiteActive(\'' + site.id + '\', ' + site.active + ', this)">' +
              (site.active ? '✅ 활성' : '⛔ 비활성') +
            '</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteSite(\'' + site.id + '\')">삭제</button>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
  } catch(err) {
    wrap.innerHTML =
      '<div style="padding:16px;color:var(--danger);font-size:13px">' +
      '⚠️ ' + esc(err.message) +
      '<br><small style="color:var(--gray400)">migration_field_requests.sql 실행이 필요할 수 있습니다.</small>' +
      '</div>';
  }
}

async function addSite(name) {
  const btn = document.getElementById('addSiteBtn');
  btn.disabled = true;
  try {
    const { error } = await sb.from(SITES_TBL).insert({ name });
    if (error) throw error;
    showToast('✅ [' + name + '] 현장 추가 완료', 'success');
    await loadSitesForModal();
  } catch(err) {
    if (err.code === '23505' || (err.message || '').includes('unique')) {
      showToast('이미 존재하는 현장명입니다.', 'error');
    } else {
      showToast('❌ ' + (err.message || err), 'error');
    }
  } finally {
    btn.disabled = false;
  }
}

async function deleteSite(id) {
  const row  = document.getElementById('site-row-' + id);
  const name = row ? row.querySelector('.site-name').textContent : id;
  if (!confirm('[' + name + '] 현장을 삭제하시겠습니까?\n연결된 요청이 있으면 삭제되지 않습니다.')) return;
  try {
    const { error } = await sb.from(SITES_TBL).delete().eq('id', id);
    if (error) throw error;
    showToast('🗑 [' + name + '] 삭제 완료', 'warning');
    row?.remove();
    const list = document.querySelector('.sites-list');
    if (list && !list.children.length)
      document.getElementById('sitesListWrap').innerHTML =
        '<div class="empty-state" style="padding:24px"><div class="es-icon" style="font-size:28px">🏭</div><p>등록된 현장이 없습니다.</p></div>';
  } catch(err) {
    showToast('❌ ' + (err.message || err), 'error');
  }
}

async function toggleSiteActive(id, currentActive, btn) {
  const newActive = !currentActive;
  try {
    const { error } = await sb.from(SITES_TBL).update({ active: newActive }).eq('id', id);
    if (error) throw error;
    btn.className  = 'btn btn-sm ' + (newActive ? 'btn-success' : 'btn-ghost');
    btn.textContent = newActive ? '✅ 활성' : '⛔ 비활성';
    btn.setAttribute('onclick', 'toggleSiteActive(\'' + id + '\', ' + newActive + ', this)');
    const nameEl = btn.closest('.site-row')?.querySelector('.site-name');
    if (nameEl) nameEl.classList.toggle('site-inactive', !newActive);
    showToast(newActive ? '활성화 완료' : '비활성화 완료', 'success');
  } catch(err) {
    showToast('❌ ' + (err.message || err), 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// exportExcel() — SheetJS 기반 엑셀 내보내기
// 검색 결과(gLastFilteredItems + gStatusMap)를 4개 시트로 내보냄
// ═══════════════════════════════════════════════════════════════
async function exportExcel() {
  if (!gLastFilteredItems || gLastFilteredItems.length === 0) {
    showToast('먼저 검색을 실행해 주세요.', 'warning'); return;
  }
  const btn = document.getElementById('exportBtn');
  btn.disabled = true; btn.textContent = '⏳ 생성 중...';
  try {
    const XLSX = window.XLSX;
    const wb   = XLSX.utils.book_new();
    const today = new Date().toISOString().slice(0,10);
    const docNos = [...new Set(gLastFilteredItems.map(r=>r.doc_no))];

    /* ── 스타일 헬퍼 ── */
    function ab(rgb){ const s={style:'thin',color:{rgb}}; return {top:s,bottom:s,left:s,right:s}; }
    const S = {
      title:   {font:{bold:true,sz:14,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:'111827'}},alignment:{horizontal:'left',vertical:'center'}},
      navyHdr: {font:{bold:true,sz:10,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:'1A3A5C'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:ab('1A56DB')},
      grayHdr: {font:{bold:true,sz:10,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:'374151'}},alignment:{horizontal:'center',vertical:'center'},border:ab('374151')},
      docNo:   {font:{bold:true,sz:10,color:{rgb:'1A3A5C'},name:'Arial'},fill:{fgColor:{rgb:'EBF5FF'}},alignment:{horizontal:'left',vertical:'center',indent:1},border:ab('D1D5DB')},
      even:    {font:{sz:10,name:'Arial',color:{rgb:'111827'}},fill:{fgColor:{rgb:'F3F4F6'}},alignment:{horizontal:'center',vertical:'center'},border:ab('E5E7EB')},
      odd:     {font:{sz:10,name:'Arial',color:{rgb:'111827'}},fill:{fgColor:{rgb:'FFFFFF'}},alignment:{horizontal:'center',vertical:'center'},border:ab('E5E7EB')},
      leftEven:{font:{sz:10,name:'Arial',color:{rgb:'111827'}},fill:{fgColor:{rgb:'F3F4F6'}},alignment:{horizontal:'left',vertical:'center',indent:1},border:ab('E5E7EB')},
      leftOdd: {font:{sz:10,name:'Arial',color:{rgb:'111827'}},fill:{fgColor:{rgb:'FFFFFF'}},alignment:{horizontal:'left',vertical:'center',indent:1},border:ab('E5E7EB')},
      done:    {font:{bold:true,sz:10,color:{rgb:'057A55'},name:'Arial'},fill:{fgColor:{rgb:'DEF7EC'}},alignment:{horizontal:'center',vertical:'center'},border:ab('A7F3D0')},
      pend:    {font:{bold:true,sz:10,color:{rgb:'B45309'},name:'Arial'},fill:{fgColor:{rgb:'FEF3C7'}},alignment:{horizontal:'center',vertical:'center'},border:ab('FDE68A')},
      late:    {font:{bold:true,sz:10,color:{rgb:'C81E1E'},name:'Arial'},fill:{fgColor:{rgb:'FDE8E8'}},alignment:{horizontal:'center',vertical:'center'},border:ab('FCA5A5')},
      qty:     {font:{bold:true,sz:11,color:{rgb:'1A56DB'},name:'Arial'},fill:{fgColor:{rgb:'EBF5FF'}},alignment:{horizontal:'center',vertical:'center'},border:ab('D6E4FF')},
      sec:     {font:{bold:true,sz:11,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:'1A3A5C'}},alignment:{horizontal:'left',vertical:'center'}},
      guideLbl:{font:{bold:true,sz:10,name:'Arial',color:{rgb:'111827'}},fill:{fgColor:{rgb:'D6E4FF'}},alignment:{horizontal:'left',vertical:'center'},border:ab('D1D5DB')},
      guide:   {font:{sz:10,name:'Arial',color:{rgb:'374151'}},fill:{fgColor:{rgb:'F9FAFB'}},alignment:{horizontal:'left',vertical:'center'},border:ab('D1D5DB')},
      warn:    {font:{bold:true,sz:10,name:'Arial',color:{rgb:'B45309'}},fill:{fgColor:{rgb:'FEF3C7'}},alignment:{horizontal:'left',vertical:'center'},border:ab('FDE68A')},
    };

    function setCell(ws,r,c,v,s){
      const a=XLSX.utils.encode_cell({r,c}); ws[a]={v,t:typeof v==='number'?'n':'s',s};
      const range=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:9999,c:9999},e:{r:0,c:0}};
      if(r<range.s.r)range.s.r=r; if(c<range.s.c)range.s.c=c;
      if(r>range.e.r)range.e.r=r; if(c>range.e.c)range.e.c=c;
      ws['!ref']=XLSX.utils.encode_range(range);
    }
    function merge(ws,r1,c1,r2,c2){if(!ws['!merges'])ws['!merges']=[];ws['!merges'].push({s:{r:r1,c:c1},e:{r:r2,c:c2}});}

    /* ════ 시트1: 데이터 원본 ════ */
    const wsD={}; wsD['!cols']=[22,22,10,12,22,18,28,28,8,13,10,13,14,10,30].map(w=>({wpx:w*7}));
    wsD['!rows']=[{hpx:32},{hpx:30}];
    setCell(wsD,0,0,'🛒  인텍플러스 구매관리 — 데이터 원본  |  '+today,S.title);
    merge(wsD,0,0,0,14);
    ['사이트','문서번호','기안자','기안일','프로젝트명','코드','품명','규격','수량','입고예정일','입고완료','배송시작일','배송완료예정일','배송완료','메모']
      .forEach((h,ci)=>setCell(wsD,1,ci,h,S.navyHdr));

    gLastFilteredItems.forEach((row,ri)=>{
      const isE=ri%2===0, bg=isE?S.even:S.odd, bgL=isE?S.leftEven:S.leftOdd;
      const st=gStatusMap[row.doc_no]||{};
      const arrSt=st.arrival_done?S.done:(st.expected_arrival&&st.expected_arrival<today?S.late:S.pend);
      const shipSt=st.ship_done?S.done:(st.ship_done_date&&st.ship_done_date<today?S.late:bg);
      const r=ri+2; wsD['!rows'].push({hpx:22});
      const dn={...S.docNo,fill:{fgColor:{rgb:isE?'EBF5FF':'FFFFFF'}}};
      [
        [SUPABASE_URL.replace('https://','').split('.')[0],bg],
        [row.doc_no||'',dn],[row.requester||'',bg],[row.doc_date||'',bg],
        [row.p_name||'',bgL],[row.p_code||'',bg],[row.name||'',bgL],[row.spec||'',bgL],
        [row.qty||0,S.qty],[st.expected_arrival||'',bg],
        [st.arrival_done?'✅ 완료':'⏳ 미완료',arrSt],
        [st.ship_start_date||'',bg],[st.ship_done_date||'',bg],
        [st.ship_done?'✅ 완료':(st.ship_start_date?'🚚 배송중':'—'),shipSt],
        [st.memo||'',bgL]
      ].forEach(([v,s],ci)=>setCell(wsD,r,ci,v,s));
    });
    XLSX.utils.book_append_sheet(wb,wsD,'📦 데이터');

    /* ════ 시트2: 검색 결과 ════ */
    const wsS={}; wsS['!cols']=[5,22,10,12,22,18,28,28,8,13,10,13,14,10,30].map(w=>({wpx:w*7}));
    wsS['!rows']=[{hpx:32},{hpx:20},{hpx:22},{hpx:14},{hpx:30}];

    const conds=[
      ['문서번호',document.getElementById('sDoc')?.value||''],
      ['기안자',document.getElementById('sUser')?.value||''],
      ['프로젝트명',document.getElementById('sPname')?.value||''],
      ['코드',document.getElementById('sCode')?.value||''],
      ['품명',document.getElementById('sName')?.value||''],
      ['규격',document.getElementById('sSpec')?.value||''],
    ].filter(([,v])=>v).map(([k,v])=>`${k}:"${v}"`).join('  ');

    setCell(wsS,0,0,'🔍  검색 결과  |  '+today,S.title); merge(wsS,0,0,0,14);
    setCell(wsS,1,0,'검색 조건',S.grayHdr);
    setCell(wsS,1,1,conds||'전체 (조건 없음)',{font:{sz:9,italic:true,color:{rgb:'374151'},name:'Arial'},fill:{fgColor:{rgb:'FEF3C7'}}}); merge(wsS,1,1,1,14);
    setCell(wsS,2,0,'결과',S.grayHdr);
    setCell(wsS,2,1,`문서 ${docNos.length}건 / 품목 ${gLastFilteredItems.length}개`,{font:{bold:true,sz:10,color:{rgb:'1A3A5C'},name:'Arial'},fill:{fgColor:{rgb:'EBF5FF'}}}); merge(wsS,2,1,2,14);

    ['No.','문서번호','기안자','기안일','프로젝트명','코드','품명','규격','수량','입고예정일','입고완료','배송시작일','배송완료예정일','배송완료','메모']
      .forEach((h,ci)=>setCell(wsS,4,ci,h,S.navyHdr));

    gLastFilteredItems.forEach((row,ri)=>{
      const isE=ri%2===0, bg=isE?S.even:S.odd, bgL=isE?S.leftEven:S.leftOdd;
      const st=gStatusMap[row.doc_no]||{};
      const arrSt=st.arrival_done?S.done:(st.expected_arrival&&st.expected_arrival<today?S.late:S.pend);
      const shipSt=st.ship_done?S.done:(st.ship_done_date&&st.ship_done_date<today?S.late:bg);
      const r=ri+5; wsS['!rows'].push({hpx:22});
      const dn={...S.docNo,fill:{fgColor:{rgb:isE?'EBF5FF':'FFFFFF'}}};
      [
        [ri+1,bg],[row.doc_no||'',dn],[row.requester||'',bg],[row.doc_date||'',bg],
        [row.p_name||'',bgL],[row.p_code||'',bg],[row.name||'',bgL],[row.spec||'',bgL],
        [row.qty||0,S.qty],[st.expected_arrival||'',bg],
        [st.arrival_done?'✅ 완료':'⏳ 미완료',arrSt],
        [st.ship_start_date||'',bg],[st.ship_done_date||'',bg],
        [st.ship_done?'✅ 완료':(st.ship_start_date?'🚚 배송중':'—'),shipSt],
        [st.memo||'',bgL]
      ].forEach(([v,s],ci)=>setCell(wsS,r,ci,v,s));
    });

    // 합계 행
    const tqty=gLastFilteredItems.reduce((s,r)=>s+(r.qty||0),0);
    const tRow=5+gLastFilteredItems.length; wsS['!rows'].push({hpx:26});
    setCell(wsS,tRow,0,'합계',S.grayHdr); merge(wsS,tRow,0,tRow,7);
    setCell(wsS,tRow,8,tqty,{...S.qty,font:{...S.qty.font,sz:13}});
    XLSX.utils.book_append_sheet(wb,wsS,'🔍 검색결과');

    /* ════ 시트3: 통계 ════ */
    const wsT={}; wsT['!cols']=[20,12,12,12,12,20,12,12,12,12].map(w=>({wpx:w*7}));
    wsT['!rows']=[{hpx:32},{hpx:14},{hpx:28},{hpx:38},{hpx:14}];
    setCell(wsT,0,0,'📊  통계 요약  |  '+today,S.title); merge(wsT,0,0,0,9);

    const kpis=[
      ['전체 품목',gLastFilteredItems.length,'1A3A5C'],
      ['문서 수',docNos.length,'1A56DB'],
      ['입고완료',gLastFilteredItems.filter(r=>(gStatusMap[r.doc_no]||{}).arrival_done).length,'057A55'],
      ['입고 미완료',gLastFilteredItems.length-gLastFilteredItems.filter(r=>(gStatusMap[r.doc_no]||{}).arrival_done).length,'B45309'],
      ['배송완료',gLastFilteredItems.filter(r=>(gStatusMap[r.doc_no]||{}).ship_done).length,'0694A2'],
    ];
    kpis.forEach(([lbl,val,clr],ki)=>{
      const c=ki*2;
      const ls={font:{bold:true,sz:9,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:clr}},alignment:{horizontal:'center',vertical:'center'}};
      const vs={font:{bold:true,sz:22,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:clr}},alignment:{horizontal:'center',vertical:'center'}};
      setCell(wsT,2,c,lbl,ls); merge(wsT,2,c,2,c+1);
      setCell(wsT,3,val===gLastFilteredItems.length&&ki===0?3:3,val,vs);
      setCell(wsT,3,c,val,vs); merge(wsT,3,c,3,c+1);
    });

    // 기안자별
    const su={};
    gLastFilteredItems.forEach(r=>{const u=r.requester||'(미상)',st=gStatusMap[r.doc_no]||{};if(!su[u])su[u]={i:0,a:0,s:0,q:0};su[u].i++;if(st.arrival_done)su[u].a++;if(st.ship_done)su[u].s++;su[u].q+=(r.qty||0);});
    let sr=5; wsT['!rows'].push({hpx:18});
    setCell(wsT,sr,0,'👤  기안자별 현황',S.sec); merge(wsT,sr,0,sr,4); sr++;
    wsT['!rows'].push({hpx:24});
    ['기안자','품목 수','입고완료','배송완료','총수량'].forEach((h,ci)=>setCell(wsT,sr,ci,h,S.grayHdr)); sr++;
    Object.entries(su).forEach(([u,v],ri)=>{
      const isE=ri%2===0,bg=isE?S.even:S.odd; wsT['!rows'].push({hpx:22});
      setCell(wsT,sr,0,u,{...bg,font:{bold:true,sz:10,color:{rgb:'1A3A5C'},name:'Arial'}});
      setCell(wsT,sr,1,v.i,bg); setCell(wsT,sr,2,v.a,v.a===v.i?S.done:bg);
      setCell(wsT,sr,3,v.s,v.s===v.i?S.done:bg); setCell(wsT,sr,4,v.q,S.qty); sr++;
    });

    // 프로젝트별
    const sp={};
    gLastFilteredItems.forEach(r=>{const p=r.p_name||'(미상)',st=gStatusMap[r.doc_no]||{};if(!sp[p])sp[p]={i:0,a:0,q:0};sp[p].i++;if(st.arrival_done)sp[p].a++;sp[p].q+=(r.qty||0);});
    sr++; wsT['!rows'].push({hpx:18});
    setCell(wsT,sr,0,'📁  프로젝트별 현황',S.sec); merge(wsT,sr,0,sr,4); sr++;
    wsT['!rows'].push({hpx:24});
    ['프로젝트명','품목 수','입고완료','입고율','총수량'].forEach((h,ci)=>setCell(wsT,sr,ci,h,S.grayHdr)); sr++;
    Object.entries(sp).forEach(([p,v],ri)=>{
      const isE=ri%2===0,bg=isE?S.even:S.odd; wsT['!rows'].push({hpx:22});
      const rate=v.i>0?Math.round(v.a/v.i*100)+'%':'-';
      setCell(wsT,sr,0,p,{...bg,font:{bold:true,sz:10,color:{rgb:'0694A2'},name:'Arial'}});
      setCell(wsT,sr,1,v.i,bg); setCell(wsT,sr,2,v.a,v.a===v.i?S.done:bg);
      setCell(wsT,sr,3,rate,v.a===v.i?S.done:bg); setCell(wsT,sr,4,v.q,S.qty); sr++;
    });
    XLSX.utils.book_append_sheet(wb,wsT,'📊 통계');

    /* ════ 시트4: 가이드 ════ */
    const wsG={}; wsG['!cols']=[{wpx:28},{wpx:140},{wpx:385},{wpx:100}];
    wsG['!rows']=[{hpx:32}];
    setCell(wsG,0,0,'📌  BU3 구매 관리 — 사용 가이드',S.title); merge(wsG,0,0,0,3);
    const guideData=[
      ['sec','📦 시트 구성'],
      ['hdr','시트명','설명'],
      ['row','','📦 데이터','원본 데이터 시트. 가져온 데이터를 붙여넣는 곳'],
      ['row','','🔍 검색결과','현재 검색 스냅샷 (정적 시트)'],
      ['row','','📊 통계','KPI + 기안자별·프로젝트별 집계'],
      ['row','','🏗 현장요청','현장 요청 전체 목록 (7단계 파이프라인 데이터)'],
      ['row','','📍 현장별통계','현장(사이트)별 요청 건수·완료율·평균 처리일'],
      ['row','','👤 요청자별통계','요청자별 요청 건수·완료율·평균 처리일'],
      ['row','','📌 가이드','이 파일'],
      ['sp'],
      ['sec','🔍 웹 검색 기능 안내'],
      ['row','①','단일 조건 검색','품명 칸에 "ROLLER" 입력 → 해당 품목만 표시'],
      ['row','②','다중 조건 검색','기안자 + 입고상태 등 동시에 입력 → 모두 만족하는 항목만 표시'],
      ['row','③','부분 일치','"IBAZ" → IBAZ-DSK, IBAZ-MSR 등 모두 검색됨'],
      ['row','④','엑셀 내보내기','검색 후 "📊 엑셀 내보내기" 버튼 클릭'],
      ['sp'],
      ['sec','⚠️ 주의사항'],
      ['warn','!','스냅샷 파일','이 파일은 다운로드 시점의 데이터입니다. 실시간 연동 아님'],
      ['warn','!','데이터 수정 자제','원본 시트 직접 수정 시 통계에 반영 안 됨'],
    ];
    let gr=1;
    guideData.forEach(g=>{
      if(g[0]==='sp'){wsG['!rows'].push({hpx:10});gr++;return;}
      wsG['!rows'].push({hpx:g[0]==='sec'?28:24});
      if(g[0]==='sec'){setCell(wsG,gr,0,g[1],S.sec);merge(wsG,gr,0,gr,3);}
      else if(g[0]==='hdr'){setCell(wsG,gr,1,g[1],S.grayHdr);setCell(wsG,gr,2,g[2],S.grayHdr);merge(wsG,gr,2,gr,3);}
      else if(g[0]==='row'){
        setCell(wsG,gr,0,g[1],{font:{bold:true,sz:11,color:{rgb:'1A56DB'},name:'Arial'},alignment:{horizontal:'center',vertical:'center'}});
        setCell(wsG,gr,1,g[2],S.guideLbl);
        setCell(wsG,gr,2,g[3],S.guide); merge(wsG,gr,2,gr,3);
      } else if(g[0]==='warn'){
        setCell(wsG,gr,0,g[1],{font:{bold:true,sz:13,color:{rgb:'B45309'},name:'Arial'},alignment:{horizontal:'center',vertical:'center'}});
        setCell(wsG,gr,1,g[2],S.warn); setCell(wsG,gr,2,g[3],S.warn); merge(wsG,gr,2,gr,3);
      }
      gr++;
    });
    XLSX.utils.book_append_sheet(wb,wsG,'📌 가이드');

    /* ════ 시트5~7: 현장 요청 데이터 ════ */
    try {
      const { data: frAll } = await sb.from('field_requests').select('*').order('created_at',{ascending:false});
      const { data: siteAll } = await sb.from('sites').select('*');
      const frList = frAll || [];
      const siteMap2 = {};
      (siteAll||[]).forEach(s => { siteMap2[s.id] = s.name; });

      function daysBetween(a, b) {
        if (!a || !b) return null;
        return Math.round((new Date(b) - new Date(a)) / 86400000);
      }
      const STEP_LBL = ['현장요청','본사확인','사내결재','서류등록','입고','배송','수령완료'];

      /* ── 시트5: 현장 요청 ── */
      const wsFR = {}; wsFR['!rows'] = [{hpx:32},{hpx:30}];
      const frCols = [18,12,12,10,6,10,14,12,12,12,18,12,12,12,12,12,12,20,20,10];
      wsFR['!cols'] = frCols.map(w=>({wpx:w*7}));
      setCell(wsFR,0,0,'🏗  현장 요청 목록  |  '+today,S.title); merge(wsFR,0,0,0,19);
      ['현장명','요청자','요청사유','사유상세','품목수','현재단계',
       '본사확인자','확인일','결재자','결재일','연결문서번호',
       '입고예정일','입고완료일','배송시작일','배송완료예정일','배송완료일',
       '수령일','수령자','지연사유','총처리일수'].forEach((h,ci)=>setCell(wsFR,1,ci,h,S.navyHdr));
      frList.forEach((fr,ri) => {
        const isE=ri%2===0, bg=isE?S.even:S.odd, bgL=isE?S.leftEven:S.leftOdd;
        const r = ri+2; wsFR['!rows'].push({hpx:22});
        const items = Array.isArray(fr.items) ? fr.items : [];
        const stepLabel = STEP_LBL[(fr.current_step||1)-1] || `${fr.current_step}단계`;
        const totalDays = daysBetween(fr.created_at, fr.received_at || null);
        [
          [fr.site_name||'',bgL],[fr.requester_name||'',bg],[fr.request_reason||'',bg],[fr.reason_detail||'',bgL],
          [items.length,bg],[stepLabel,bg],
          [fr.hq_confirmed_by||'',bg],[(fr.hq_confirmed_at||'').slice(0,10),bg],
          [fr.doc_approved_by||'',bg],[(fr.doc_approved_at||'').slice(0,10),bg],
          [fr.linked_doc_no||'',bg],
          [fr.expected_arrival||'',bg],[(fr.arrival_done_at||'').slice(0,10),bg],
          [fr.ship_start_date||'',bg],[fr.ship_done_date||'',bg],[(fr.ship_done_at||'').slice(0,10),bg],
          [(fr.received_at||'').slice(0,10),bg],[fr.received_by||'',bg],
          [fr.delay_reason||'',bgL],[totalDays!=null?totalDays:'',bg]
        ].forEach(([v,s],ci)=>setCell(wsFR,r,ci,v,s));
      });
      XLSX.utils.book_append_sheet(wb,wsFR,'🏗 현장요청');

      /* ── 시트6: 현장별 통계 ── */
      const wsSite = {}; wsSite['!rows']=[{hpx:32},{hpx:30}];
      wsSite['!cols']=[22,10,10,10,12,18].map(w=>({wpx:w*7}));
      setCell(wsSite,0,0,'📍  현장별 통계  |  '+today,S.title); merge(wsSite,0,0,0,5);
      ['현장명','총 요청','완료','진행중','평균처리일','주요사유'].forEach((h,ci)=>setCell(wsSite,1,ci,h,S.navyHdr));
      const bySite = {};
      frList.forEach(fr => {
        const site = fr.site_name||'(미상)';
        if (!bySite[site]) bySite[site] = { total:0, done:0, days:[], reasons:{} };
        bySite[site].total++;
        if (fr.current_step >= 7 && fr.received_at) {
          bySite[site].done++;
          const d = daysBetween(fr.created_at, fr.received_at);
          if (d != null) bySite[site].days.push(d);
        }
        const r = fr.request_reason||'기타';
        bySite[site].reasons[r] = (bySite[site].reasons[r]||0)+1;
      });
      Object.entries(bySite).forEach(([site,v],ri) => {
        const isE=ri%2===0, bg=isE?S.even:S.odd;
        const r=ri+2; wsSite['!rows'].push({hpx:24});
        const avg = v.days.length ? Math.round(v.days.reduce((a,b)=>a+b,0)/v.days.length) : '';
        const topReason = Object.entries(v.reasons).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
        setCell(wsSite,r,0,site,{...bg,font:{bold:true,sz:10,color:{rgb:'1A3A5C'},name:'Arial'}});
        setCell(wsSite,r,1,v.total,bg); setCell(wsSite,r,2,v.done,v.done===v.total&&v.total>0?S.done:bg);
        setCell(wsSite,r,3,v.total-v.done,bg); setCell(wsSite,r,4,avg||'-',bg); setCell(wsSite,r,5,topReason,bg);
      });
      XLSX.utils.book_append_sheet(wb,wsSite,'📍 현장별통계');

      /* ── 시트7: 요청자별 통계 ── */
      const wsReq = {}; wsReq['!rows']=[{hpx:32},{hpx:30}];
      wsReq['!cols']=[16,10,10,12].map(w=>({wpx:w*7}));
      setCell(wsReq,0,0,'👤  요청자별 통계  |  '+today,S.title); merge(wsReq,0,0,0,3);
      ['요청자','요청건수','완료율','평균처리일'].forEach((h,ci)=>setCell(wsReq,1,ci,h,S.navyHdr));
      const byReq = {};
      frList.forEach(fr => {
        const req = fr.requester_name||'(미상)';
        if (!byReq[req]) byReq[req] = { total:0, done:0, days:[] };
        byReq[req].total++;
        if (fr.current_step >= 7 && fr.received_at) {
          byReq[req].done++;
          const d = daysBetween(fr.created_at, fr.received_at);
          if (d != null) byReq[req].days.push(d);
        }
      });
      Object.entries(byReq).sort((a,b)=>b[1].total-a[1].total).forEach(([req,v],ri) => {
        const isE=ri%2===0, bg=isE?S.even:S.odd;
        const r=ri+2; wsReq['!rows'].push({hpx:24});
        const rate = v.total>0 ? Math.round(v.done/v.total*100)+'%' : '0%';
        const avg  = v.days.length ? Math.round(v.days.reduce((a,b)=>a+b,0)/v.days.length) : '-';
        setCell(wsReq,r,0,req,{...bg,font:{bold:true,sz:10,color:{rgb:'1A3A5C'},name:'Arial'}});
        setCell(wsReq,r,1,v.total,bg); setCell(wsReq,r,2,rate,v.done===v.total&&v.total>0?S.done:bg);
        setCell(wsReq,r,3,avg,bg);
      });
      XLSX.utils.book_append_sheet(wb,wsReq,'👤 요청자별통계');

    } catch(frErr) {
      console.warn('현장 요청 시트 생성 실패:', frErr);
    }

    /* ── 파일 저장 ── */
    const fname=`인텍플러스_구매관리_${today}.xlsx`;
    XLSX.writeFile(wb,fname,{bookType:'xlsx',type:'binary',cellStyles:true});
    showToast(`✅ ${fname} 다운로드 완료`,'success');

  } catch(err) {
    console.error(err);
    showToast('❌ 엑셀 내보내기 실패: '+err.message,'error');
  } finally {
    btn.disabled=false; btn.textContent='📊 엑셀 내보내기';
  }
}
