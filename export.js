/* ════════════════════════════════════════════
   엑셀 다운로드
════════════════════════════════════════════ */
function downloadExcel(){
  if(!window.ExcelJS){
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload=function(){_doDownloadExcel();};
    document.head.appendChild(s);
    return;
  }
  _doDownloadExcel();
}

function _doDownloadExcel(){
  var wb=new ExcelJS.Workbook();
  wb.creator='BU3 출장 일정 관리';
  wb.created=new Date();
  _buildGanttSheet(wb);
  _buildPersonSheet(wb);
  _buildEquipSheet(wb);
  wb.xlsx.writeBuffer().then(function(buf){
    var blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    var d=new Date();
    a.download='출장일정관리_'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'.xlsx';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  });
}

/* ── 공통 유틸 ── */
function _xArgb(hex){
  hex=(hex||'#888888').replace('#','');
  if(hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return 'FF'+hex.toUpperCase();
}

function _xStyle(cell,opts){
  var bgColor=opts.bg?_xArgb(opts.bg):'FF18181E';
  var fgColor=opts.fg?_xArgb(opts.fg):'FFC8C8D4';
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgColor}};
  cell.font={name:'맑은 고딕',size:opts.size||10,color:{argb:fgColor},bold:!!opts.bold};
  cell.alignment={vertical:'middle',horizontal:opts.align||'center',wrapText:!!opts.wrap};
  var bc={argb:'FF3A3A44'};
  cell.border={top:{style:'thin',color:bc},bottom:{style:'thin',color:bc},left:{style:'thin',color:bc},right:{style:'thin',color:bc}};
}

/* ── Sheet 1: 간트차트 ── */
function _buildGanttSheet(wb){
  var ws=wb.addWorksheet('간트차트');
  var colWidths=[12,10,30,10,12,8,13,13,9,20];
  var colHdrs=['그룹','사이트','프로젝트','업무','출장자','유형','시작일','종료일','기간(일)','비고'];
  ws.columns=colHdrs.map(function(h,i){return {width:colWidths[i]};});
  ws.views=[{state:'frozen',ySplit:1}];

  var hRow=ws.getRow(1);
  colHdrs.forEach(function(h,i){
    var cell=hRow.getCell(i+1);
    cell.value=h;
    _xStyle(cell,{bg:'#2a2a3e',fg:'#e0e0ec',bold:true});
  });
  hRow.height=20;

  var typeLabel={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
  var rows=[];
  S.schedules.forEach(function(sc){
    var proj=S.projects.find(function(p){return p.id===sc.projectId;});
    if(!proj) return;
    var site=S.sites.find(function(s){return s.id===proj.siteId;});
    var grpObj=site&&site.groupId?S.groups.find(function(g){return g.id===site.groupId;}):null;
    rows.push({
      grp:grpObj?grpObj.name:'',
      siteIdx:S.sites.indexOf(site),
      siteId:proj.siteId,
      siteName:site?site.name:proj.siteId,
      siteColor:site?site.color:'#555555',
      proj:proj.name,
      task:sc.task||'',
      name:sc.name||'',
      typeLabel:typeLabel[sc.type]||sc.type||'',
      typeRaw:sc.type||'hq',
      start:sc.start,
      end:sc.end,
      days:dd(sc.start,sc.end),
      note:sc.note||''
    });
  });
  rows.sort(function(a,b){
    if(a.siteIdx!==b.siteIdx) return a.siteIdx-b.siteIdx;
    return a.start>b.start?1:-1;
  });

  var prevSiteId=null;
  var rIdx=2;
  rows.forEach(function(r){
    if(r.siteId!==prevSiteId){
      ws.mergeCells(rIdx,1,rIdx,10);
      var sepCell=ws.getRow(rIdx).getCell(1);
      sepCell.value=r.siteName;
      _xStyle(sepCell,{bg:r.siteColor,fg:'#ffffff',bold:true,align:'left'});
      ws.getRow(rIdx).height=18;
      rIdx++;
      prevSiteId=r.siteId;
    }
    var bg=r.typeRaw==='hq'?'#0d1e33':(r.typeRaw==='outsource'?'#1e1400':'#181820');
    var dataRow=ws.getRow(rIdx);
    [r.grp,r.siteName,r.proj,r.task,r.name,r.typeLabel,r.start,r.end,r.days,r.note].forEach(function(v,i){
      var cell=dataRow.getCell(i+1);
      cell.value=v;
      _xStyle(cell,{bg:bg,fg:'#c8c8d4',align:(i>=6&&i<=8)?'center':'left'});
    });
    dataRow.height=17;
    rIdx++;
  });
}

/* ── Sheet 2: 인원출장일 ── */
function _buildPersonSheet(wb){
  var ws=wb.addWorksheet('인원출장일');
  var allPersons=aggregatePersonTrips();
  var rolling12=getRolling12();
  var names=Object.keys(allPersons).sort(function(a,b){return a.localeCompare(b,'ko');});

  ws.columns=[12,8,22,14,14,18,16,10].map(function(w){return {width:w};});
  ws.views=[{state:'frozen',ySplit:1}];

  if(!names.length){
    ws.getCell('A1').value='등록된 출장 일정이 없습니다.';
    return;
  }

  var sumHdr=['이름','유형','현재상태','미주12M(일)','유럽12M(일)','전체해외12M(일)','현연속국내(일)','B1위험도'];
  var hRow=ws.getRow(1);
  sumHdr.forEach(function(h,i){
    var cell=hRow.getCell(i+1);
    cell.value=h;
    _xStyle(cell,{bg:'#2a2a3e',fg:'#e0e0ec',bold:true});
  });
  hRow.height=20;

  var typeLabel={hq:'본사',outsource:'외주',tech:'기술',vision:'비전',host:'호스트'};
  var rIdx=2;
  names.forEach(function(name){
    var p=allPersons[name];
    var loc=getCurrentLocation(p.trips);
    var status=loc.onTrip?'출장중 ('+loc.siteName+')':'국내';
    var americas=calcRegionDays12M(p.trips,'americas',rolling12);
    var europe=calcRegionDays12M(p.trips,'europe',rolling12);
    var total=calcTotalOverseas12M(p.trips,rolling12);
    var korCur=calcCurrentKoreaDays(p.trips);
    var b1Risk=americas>=150?'위험':americas>=100?'주의':'안전';
    var b1Color=americas>=150?'#ff4444':americas>=100?'#ffaa00':'#4aaa70';
    var bg=rIdx%2===0?'#1c1c24':'#181820';
    var row=ws.getRow(rIdx);
    [name,typeLabel[p.type]||p.type,status,americas,europe,total,korCur,b1Risk].forEach(function(v,i){
      var cell=row.getCell(i+1);
      cell.value=v;
      _xStyle(cell,{bg:bg,fg:i===7?b1Color:'#c8c8d4',align:i>=3?'center':'left',bold:i===7});
    });
    row.height=17;
    rIdx++;
  });

  rIdx+=2;

  var detHdr=['이름','사이트','업무','시작일','종료일','기간(일)','상태'];
  var detHRow=ws.getRow(rIdx);
  detHdr.forEach(function(h,i){
    var cell=detHRow.getCell(i+1);
    cell.value=h;
    _xStyle(cell,{bg:'#2a2a3e',fg:'#e0e0ec',bold:true});
  });
  detHRow.height=20;
  rIdx++;

  var stLabel={done:'완료',going:'출장중',plan:'예정'};
  var stColor={done:'#888888',going:'#2176cc',plan:'#0f9e6e'};
  names.forEach(function(name){
    var p=allPersons[name];
    p.trips.forEach(function(t){
      var bg=rIdx%2===0?'#1c1c24':'#181820';
      var row=ws.getRow(rIdx);
      [name,t.siteName,t.task||'',t.start,t.end,t.days,stLabel[t.status]||t.status].forEach(function(v,i){
        var cell=row.getCell(i+1);
        cell.value=v;
        _xStyle(cell,{bg:bg,fg:i===6?(stColor[t.status]||'#c8c8d4'):'#c8c8d4',align:i>=3?'center':'left'});
      });
      row.height=17;
      rIdx++;
    });
  });
}

/* ── Sheet 3: 설비진행율 ── */
function _buildEquipSheet(wb){
  var ws=wb.addWorksheet('설비진행율');
  var items=S.equipItems.slice().sort(function(a,b){return a.order-b.order;});
  var msDateItem=items.find(function(i){return i.id==='ei21';});
  var scrollItems=items.filter(function(i){return i.id!=='ei21';});
  var totalCols=6+scrollItems.length;

  var colDefs=[
    {header:'사이트',width:12},
    {header:'라인',width:8},
    {header:'호기',width:14},
    {header:'진행율(%)',width:10},
    {header:msDateItem?msDateItem.name:'양산시작',width:12},
    {header:'메모',width:22}
  ].concat(scrollItems.map(function(item){
    return {header:item.name+(item.groupName?'\n['+item.groupName+']':''),width:14};
  }));

  ws.columns=colDefs.map(function(c){return {width:c.width};});
  ws.views=[{state:'frozen',ySplit:1}];

  var hRow=ws.getRow(1);
  colDefs.forEach(function(c,i){
    var cell=hRow.getCell(i+1);
    cell.value=c.header;
    _xStyle(cell,{bg:'#2a2a3e',fg:'#e0e0ec',bold:true,wrap:true});
  });
  hRow.height=32;

  if(!S.equipUnits.length){
    ws.getCell('A2').value='등록된 설비가 없습니다.';
    return;
  }

  ensureEquipSiteOrder();
  var siteIds=S.equipSiteOrder.filter(function(id){
    return S.equipUnits.some(function(u){return u.siteId===id;});
  });
  S.equipUnits.forEach(function(u){
    if(siteIds.indexOf(u.siteId)<0) siteIds.push(u.siteId);
  });

  var rIdx=2;
  var todayStr=TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');

  siteIds.forEach(function(siteId){
    var site=S.sites.find(function(s){return s.id===siteId;});
    var siteName=site?site.name:siteId;
    var siteColor=site?site.color:'#555555';
    var siteUnits=S.equipUnits.filter(function(u){return u.siteId===siteId;});
    if(!siteUnits.length) return;

    ws.mergeCells(rIdx,1,rIdx,totalCols);
    var sepCell=ws.getRow(rIdx).getCell(1);
    sepCell.value=siteName;
    _xStyle(sepCell,{bg:siteColor,fg:'#ffffff',bold:true,align:'left'});
    ws.getRow(rIdx).height=18;
    rIdx++;

    siteUnits.forEach(function(unit,idx){
      var unitPct=calcUnitProgress(unit);
      var bg=idx%2===0?'#1c1c24':'#181820';
      var isDone=unitPct===100;
      var rowBg=isDone?'#091810':bg;
      var row=ws.getRow(rIdx);

      [siteName,unit.lineName||'',unit.unitName||''].forEach(function(v,i){
        var cell=row.getCell(i+1);
        cell.value=v;
        _xStyle(cell,{bg:rowBg,fg:'#c8c8d4',align:'left'});
      });

      var pctCell=row.getCell(4);
      pctCell.value=unitPct;
      _xStyle(pctCell,{bg:rowBg,fg:isDone?'#4aaa70':'#c8c8d4',align:'center',bold:isDone});

      var msRaw=msDateItem?(unit.cells||{})[msDateItem.id]:null;
      _buildEquipXCell(row.getCell(5),msRaw,rowBg,todayStr);

      var memoCell=row.getCell(6);
      memoCell.value=unit.memo||'';
      _xStyle(memoCell,{bg:rowBg,fg:'#b0b0c0',align:'left'});

      scrollItems.forEach(function(item,iIdx){
        var rawCell=(unit.cells||{})[item.id];
        _buildEquipXCell(row.getCell(7+iIdx),rawCell,rowBg,todayStr);
      });

      row.height=17;
      rIdx++;
    });
  });
}

function _buildEquipXCell(exCell,cell,defaultBg,todayStr){
  if(!cell||cell.type==='na'){
    exCell.value='N/A';
    _xStyle(exCell,{bg:'#1a1a1a',fg:'#555566',align:'center'});
    return;
  }
  if(cell.type==='done'){
    exCell.value='100% ✓'+(cell.value?' ('+cell.value+')':'');
    _xStyle(exCell,{bg:'#0a1e10',fg:'#4aaa70',align:'center',bold:true});
    return;
  }
  if(cell.type==='percent'){
    var pct=parseFloat(cell.value)||0;
    exCell.value=pct;
    _xStyle(exCell,{bg:defaultBg,fg:pct>=90?'#7adeaa':'#c8c8d4',align:'center'});
    return;
  }
  if(cell.type==='date'){
    var isOver=cell.value&&cell.value<todayStr;
    exCell.value=cell.value||'';
    _xStyle(exCell,{bg:defaultBg,fg:isOver?'#ff6060':'#5a9aee',align:'center'});
    return;
  }
  exCell.value='';
  _xStyle(exCell,{bg:defaultBg,fg:'#c8c8d4',align:'center'});
}
