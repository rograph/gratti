/* ==========================================================
   Gratti v5
   ========================================================== */

import { fmt, esc, tint } from './core/format.js';
import { inferType, toNum } from './core/types.js';
import { is3D, isStack } from './core/pipeline.js';
import {
  DATA, COLS, BLOCKS, FILTERS, CROSS, SEL, FILE, PANE_MODE, AI_STATE, dragId,
  find, charts, setBlocks, setFilters, setCrossFilter, setSel,
  setPaneMode, setAiState, setDragId, setDataset, clearFilters, nextId,
  colTypeOf as colType, numCols, catCols, dateCols, filterCols, guessLat, guessLon
} from './state.js';
import {
  snapshot as buildSnapshot, listSaves, putSave, getSave, removeSave,
  readAutosave, writeAutosave
} from './persist.js';
import { LIBS, PLOT, DLAB } from './libs.js';
import { THEMES, THEME, PAL, setTheme, setPal } from './theme.js';
import { rows } from './query.js';
import { registerActions } from './actions.js';
import { draw, renderStatic } from './renderers/index.js';
import {
  ICON, T2D, T3D, TGEO, CFMODES, LINES, GEOMODE, AGGS, FMTS, DGROUP, SORTS
} from './registries.js';
import { askAI, offlineSpec, clean } from './nl.js';

function applyTheme(){
  const r=document.documentElement.style;
  r.setProperty('--accent', THEME.accent);
  r.setProperty('--accent-soft', tint(THEME.accent, .93));
  setPal(THEME.pal && THEME.pal.length ? THEME.pal : THEMES.indigo.pal);
  const brand=$('#brand');
  brand.innerHTML = THEME.logo
    ? `<img class="brandlogo" src="${THEME.logo}" alt="">`
    : `<span class="mark"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19.5V14.6L9 9.1l4.3 2.7L21 4.5v15Z" fill="#fff"/></svg></span><span id="brandName">Gratti</span>`;
  redrawAll(); renderKPIs();
}

const COLS_N=12, GAP=16, SPAN_MIN=3, SPAN_MAX=12, H_MIN=120, H_MAX=760;

const $=s=>document.querySelector(s);

/* ---------- storage (artifact storage -> localStorage -> memory) ---------- */

/* ---------- helpers ---------- */

/* ---------- load ---------- */
function loadCSV(text,name,keepBlocks){
  const p=Papa.parse(String(text).trim(),{header:true,dynamicTyping:true,skipEmptyLines:true});
  const rows=p.data.filter(r=>Object.values(r).some(v=>v!==null&&v!==''));
  if(!rows.length){ say('No readable rows in that file. Check that it has a header row.',true); return false; }
  setDataset({data:rows, file:name,
    cols:Object.keys(rows[0]).filter(Boolean).map(n=>({name:n,type:inferType(n,rows)}))});
  clearFilters();
  if(!keepBlocks){ setSel(null); killAll(); $('#deckTitle').textContent=name.replace(/\.csv$/i,''); }
  $('#deckMeta').textContent=`${rows.length.toLocaleString()} rows · ${COLS.length} fields`;
  $('#addFilterBtn').style.display='inline-flex';
  renderChips(); renderKPIs(); if(!keepBlocks) renderBoard(); renderPane();
  return true;
}
function unload(){
  setDataset(); clearFilters(); setSel(null);
  killAll();
  $('#deckTitle').textContent='Untitled dashboard';
  $('#deckMeta').textContent='no data loaded';
  $('#addFilterBtn').style.display='none';
  $('#kpis').innerHTML=''; $('#strip').style.display='none';
  renderBoard(); renderPane(); say('');
}

/* ---------- filters ---------- */
function addFilter(){
  const free=filterCols().filter(c=>!FILTERS.some(f=>f.col===c.name));
  if(!free.length){ say('Every eligible field already has a filter.',true); return; }
  FILTERS.push({col:free[0].name,val:'__all__'}); renderChips(); recalc();
}
function setCross(col,val){
  setCrossFilter((CROSS&&CROSS.col===col&&String(CROSS.val)===String(val))?null:{col,val});
  renderChips(); recalc();
}
function renderChips(){
  if(!FILTERS.length&&!CROSS){ $('#strip').style.display='none'; return; }
  $('#strip').style.display='flex';
  let h=FILTERS.map((f,i)=>{
    const vals=[...new Set(DATA.map(r=>r[f.col]))].filter(v=>v!==null&&v!=='');
    return `<span class="fchip">
      <select data-fc="${i}">${filterCols().map(c=>`<option ${c.name===f.col?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      <select data-fv="${i}"><option value="__all__">All</option>
      ${vals.map(v=>`<option ${String(v)===String(f.val)?'selected':''}>${esc(v)}</option>`).join('')}</select>
      <button class="x" data-fd="${i}" aria-label="Remove filter">×</button></span>`;
  }).join('');
  if(CROSS) h+=`<span class="fchip live">${esc(CROSS.col)}: ${esc(CROSS.val)}
    <button class="x" id="xCross" aria-label="Clear selection">×</button></span>`;
  $('#chips').innerHTML=h;
  $('#chips').querySelectorAll('[data-fc]').forEach(s=>s.onchange=e=>{
    FILTERS[+e.target.dataset.fc]={col:e.target.value,val:'__all__'}; renderChips(); recalc(); });
  $('#chips').querySelectorAll('[data-fv]').forEach(s=>s.onchange=e=>{
    FILTERS[+e.target.dataset.fv].val=e.target.value; recalc(); });
  $('#chips').querySelectorAll('[data-fd]').forEach(b=>b.onclick=e=>{
    FILTERS.splice(+e.target.dataset.fd,1); renderChips(); recalc(); });
  const x=$('#xCross'); if(x) x.onclick=()=>{ setCrossFilter(null); renderChips(); recalc(); };
}
function recalc(exceptId){ renderKPIs(); redrawAll(exceptId); scheduleAutosave(); }
registerActions({ setCross, recalc, scheduleAutosave, refreshBlock });

/* ---------- KPI strip ---------- */
function renderKPIs(){
  if(!DATA.length){ $('#kpis').innerHTML=''; return; }
  const metrics=numCols().slice(0,3), d=rows();
  const live=[...FILTERS.filter(f=>f.val!=='__all__').map(f=>`${f.col} = ${f.val}`),
              ...(CROSS?[`${CROSS.col} = ${CROSS.val}`]:[])];
  let h=`<div class="kpi"><div class="lab">Records</div>
    <div class="val">${d.length.toLocaleString()}</div>
    <div class="note">${live.length?live.join(' · '):'all rows'}</div></div>`;
  metrics.forEach((c,i)=>{
    const tot=d.reduce((s,r)=>s+toNum(r[c.name]),0);
    const all=DATA.reduce((s,r)=>s+toNum(r[c.name]),0);
    h+=`<div class="kpi"><div class="lab">${esc(c.name)}</div>
      <div class="val">${fmt(tot)}</div>
      <div class="note">${live.length?(all?(tot/all*100).toFixed(1):0)+'% of total':'avg '+fmt(d.length?tot/d.length:0)}</div>
      <div class="spark"><canvas id="sp-${i}"></canvas></div></div>`;
  });
  $('#kpis').innerHTML=h;
  metrics.forEach((c,i)=>drawSpark('sp-'+i,c.name,i));
}
function drawSpark(id,metric,ci){
  const el=document.getElementById(id); if(!el||!LIBS) return;
  const dc=dateCols()[0], d=rows(), b=new Map();
  if(dc) d.forEach(r=>{const k=String(r[dc.name]); b.set(k,(b.get(k)||0)+toNum(r[metric]));});
  else { const size=Math.max(1,Math.ceil(d.length/14));
    d.forEach((r,ix)=>{const k=Math.floor(ix/size); b.set(k,(b.get(k)||0)+toNum(r[metric]));}); }
  const keys=[...b.keys()].sort((x,y)=>String(x).localeCompare(String(y),undefined,{numeric:true}));
  const vals=keys.map(k=>b.get(k));
  if(vals.length<2) return;
  const ctx=el.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,30);
  g.addColorStop(0,PAL[ci%PAL.length]+'2E'); g.addColorStop(1,PAL[ci%PAL.length]+'00');
  new Chart(el,{type:'line',
    data:{labels:keys,datasets:[{data:vals,borderColor:PAL[ci%PAL.length],borderWidth:1.8,
      fill:true,backgroundColor:g,tension:.4,pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false},tooltip:{enabled:false},datalabels:DLAB?{display:false}:undefined,analytics:{lines:[]}},
      scales:{x:{display:false},y:{display:false}}}});
}

/* ==========================================================
   BLOCKS
   ========================================================== */

function defaults(spec){
  const roomy=['line','area','surface3d','bar3d','table','combo'].includes(spec.type)||!!spec.series;
  if(spec.numfmt===undefined) spec.numfmt='auto';
  if(spec.labels===undefined) spec.labels=false;
  if(spec.sort===undefined) spec.sort='auto';
  if(spec.topN===undefined) spec.topN=0;
  if(spec.dateGroup===undefined) spec.dateGroup = colType(spec.x)==='date'?'month':'raw';
  if(spec.compare===undefined) spec.compare='none';
  if(spec.target===undefined) spec.target=null;
  if(spec.targetColor===undefined) spec.targetColor=false;
  if(!spec.span) spec.span=roomy?12:6;
  if(!spec.h) spec.h=is3D(spec.type)?400:(spec.type==='table'?300:288);
  spec.span=Math.max(SPAN_MIN,Math.min(SPAN_MAX,spec.span));
  spec.h=Math.max(H_MIN,Math.min(H_MAX,spec.h));
  return spec;
}

function addBlock(kind,spec,silent){
  if(!$('#grid')) $('#board').innerHTML='<div class="grid" id="grid"></div>';
  const id=nextId();
  if(kind==='chart') defaults(spec);
  else if(kind==='card'){
    if(!spec.y&&numCols()[0]) spec.y=numCols()[0].name;
    if(!spec.agg) spec.agg='sum';
    if(!spec.numfmt) spec.numfmt='auto';
    if(spec.target===undefined) spec.target=null;
    if(spec.spark===undefined) spec.spark=true;
    if(spec.compare===undefined) spec.compare='share';
    if(!spec.span) spec.span=3;
    if(!spec.h) spec.h=140;
  }
  else if(kind==='slicer'){
    if(!spec.col) spec.col=(filterCols()[0]||catCols()[0]||COLS[0]||{}).name;
    if(!Array.isArray(spec.picked)) spec.picked=[];
    if(spec.counts===undefined) spec.counts=true;
    if(!spec.span) spec.span=3;
    if(!spec.h) spec.h=230;
  }
  else{
    if(!spec.span) spec.span=kind==='image'?4:6;
    if(!spec.h) spec.h=kind==='image'?180:150;
  }
  const card=document.createElement('div');
  card.className='card'; card.id='k-'+id; card.draggable=false;
  card.style.gridColumn='span '+spec.span;
  card.innerHTML=shell(id,kind,spec);
  $('#grid').appendChild(card);
  BLOCKS.push({id,kind,spec});

  card.addEventListener('click',e=>{
    if(e.target.closest('[contenteditable]')||e.target.closest('.grip')
      ||e.target.closest('.ctrl')||e.target.closest('.rs')||e.target.closest('.dt thead')) return;
    select(id);
  });
  card.querySelectorAll('[data-c]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    if(b.dataset.c==='kill') return killBlock(id);
    setSpan(id, find(id).spec.span>=SPAN_MAX?6:SPAN_MAX);
  }));
  card.querySelectorAll('.rs').forEach(h=>
    h.addEventListener('pointerdown',e=>startResize(id,h.dataset.r,e,h)));
  const t=card.querySelector(`[data-ttl="${id}"]`);
  if(t) t.addEventListener('blur',e=>{ const b=find(id); if(b) b.spec.title=e.target.textContent.trim()||'Chart'; scheduleAutosave(); });
  wireDrag(id);

  if(kind==='chart') draw(id,spec); else renderStatic(id);  if(!silent){ select(id); card.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  scheduleAutosave();
  return id;
}
const addChart=(spec,silent)=>addBlock('chart',spec,silent);

function shell(id,kind,spec){
  const ctrl=`<span class="ctrl">
      <button class="cbtn" data-c="fit" aria-label="Snap to full width" title="Snap to full width">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 4 2.3 8l3.5 4M10.2 4l3.5 4-3.5 4M8 3.2v9.6"/></svg></button>
      <button class="cbtn kill" data-c="kill" aria-label="Delete block" title="Delete">×</button></span>`;
  const handles=`<span class="rs rs-b" data-r="v" title="Drag to change height"></span>
    <span class="rs rs-c" data-r="both" title="Drag to resize"></span>
    <span class="readout" id="ro-${id}"></span>`;
  if(kind==='chart')
    return `<div class="card-top">
        <span class="grip" data-grip="${id}" title="Drag to reorder">⠿</span>
        <h3 contenteditable="true" spellcheck="false" data-ttl="${id}">${esc(spec.title)}</h3>
        ${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
  if(kind==='card'||kind==='slicer')
    return `<div class="card-top" style="margin-bottom:8px">
        <span class="grip" data-grip="${id}">⠿</span>
        ${kind==='slicer'?`<h3 contenteditable="true" spellcheck="false" data-ttl="${id}">${esc(spec.title||spec.col||'Filter')}</h3>`:'<span class="grow"></span>'}
        ${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
  if(kind==='text')
    return `<div class="card-top"><span class="grip" data-grip="${id}">⠿</span><span class="grow"></span>${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px;overflow:auto"></div>${handles}`;
  return `<div class="card-top"><span class="grip" data-grip="${id}">⠿</span><span class="grow"></span>${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
}

function select(id){
  setSel(id); setPaneMode('block');
  document.querySelectorAll('.card').forEach(c=>c.classList.toggle('sel',c.id==='k-'+id));
  renderPane();
  if(window.innerWidth<=1100) $('#pane').classList.add('open');
}
function deselect(){
  setSel(null); if(PANE_MODE==='block') setPaneMode('data');
  document.querySelectorAll('.card').forEach(c=>c.classList.remove('sel'));
  renderPane();
}

/* ---------- sizing ---------- */
const colWidth=()=>{ const g=$('#grid'); return g?(g.clientWidth-GAP*(COLS_N-1))/COLS_N:80; };
function applySize(id,live){
  const b=find(id), card=document.getElementById('k-'+id); if(!b||!card) return;
  card.style.gridColumn='span '+b.spec.span;
  const w=card.querySelector('.plot-wrap'); if(w) w.style.height=b.spec.h+'px';
  const ro=document.getElementById('ro-'+id);
  if(ro) ro.textContent=`${b.spec.span}/12 · ${Math.round(b.spec.h)}px`;
  if(live&&PLOT&&b.kind==='chart'&&is3D(b.spec.type)){ try{Plotly.Plots.resize('pl-'+id);}catch(e){} }
}
function setSpan(id,span){
  const b=find(id); if(!b) return;
  b.spec.span=Math.max(SPAN_MIN,Math.min(SPAN_MAX,span));
  applySize(id); if(SEL===id) renderPane();
  setTimeout(()=>refreshBlock(id),200); scheduleAutosave();
}
function startResize(id,mode,e,handle){
  if(e.button!==undefined&&e.button!==0) return;
  const b=find(id), card=document.getElementById('k-'+id); if(!b||!card) return;
  e.preventDefault(); e.stopPropagation();
  handle.setPointerCapture(e.pointerId);
  card.classList.add('resizing');
  document.body.style.cursor=mode==='v'?'ns-resize':'nwse-resize';
  const x0=e.clientX,y0=e.clientY,span0=b.spec.span,h0=b.spec.h;
  const cw=colWidth(),unit=cw+GAP;
  let frame=null;
  applySize(id);
  const move=ev=>{
    if(mode!=='v'){
      const startW=span0*cw+(span0-1)*GAP;
      const span=Math.round((startW+(ev.clientX-x0)+GAP)/unit);
      b.spec.span=Math.max(SPAN_MIN,Math.min(SPAN_MAX,span));
    }
    b.spec.h=Math.max(H_MIN,Math.min(H_MAX,h0+(ev.clientY-y0)));
    if(frame) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>applySize(id,true));
  };
  const end=()=>{
    handle.removeEventListener('pointermove',move);
    handle.removeEventListener('pointerup',end);
    handle.removeEventListener('pointercancel',end);
    if(frame) cancelAnimationFrame(frame);
    card.classList.remove('resizing');
    document.body.style.cursor='';
    applySize(id); if(SEL===id) renderPane();
    refreshBlock(id); scheduleAutosave();
  };
  handle.addEventListener('pointermove',move);
  handle.addEventListener('pointerup',end);
  handle.addEventListener('pointercancel',end);
}
/* hoisted, not a const arrow: registerActions() runs before this point */
function refreshBlock(id){ const b=find(id); if(!b) return; b.kind==='chart'?draw(id,b.spec):renderStatic(id); }

function wireDrag(id){
  const card=document.getElementById('k-'+id);
  const g=card.querySelector(`[data-grip="${id}"]`); if(!g) return;
  g.addEventListener('mousedown',()=>{card.draggable=true;});
  card.addEventListener('dragstart',e=>{setDragId(id);card.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  card.addEventListener('dragend',()=>{card.draggable=false;card.classList.remove('dragging');
    document.querySelectorAll('.card').forEach(c=>c.classList.remove('dragover'));
    if(dragId) redrawAll(); setDragId(null); scheduleAutosave();});
  card.addEventListener('dragover',e=>{ if(!dragId||dragId===id) return; e.preventDefault(); card.classList.add('dragover'); });
  card.addEventListener('dragleave',()=>card.classList.remove('dragover'));
  card.addEventListener('drop',e=>{
    e.preventDefault(); card.classList.remove('dragover');
    if(!dragId||dragId===id) return;
    const src=document.getElementById('k-'+dragId), grid=$('#grid'), kids=[...grid.children];
    kids.indexOf(src)<kids.indexOf(card)?card.after(src):card.before(src);
    const order=[...grid.children].map(c=>c.id.replace('k-',''));
    BLOCKS.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  });
}

function killBlock(id){
  const c=Chart.getChart('cv-'+id); if(c) c.destroy();
  if(PLOT) try{Plotly.purge('pl-'+id);}catch(e){}
  const card=document.getElementById('k-'+id); if(card) card.remove();
  setBlocks(BLOCKS.filter(b=>b.id!==id));
  if(SEL===id){ setSel(null); setPaneMode('data'); }
  if(!BLOCKS.length) renderBoard();
  renderPane(); scheduleAutosave();
}
function killAll(){ [...BLOCKS].forEach(b=>killBlock(b.id)); setBlocks([]); renderBoard(); }
const redrawAll=(exceptId)=>BLOCKS.forEach(b=>{ if(b.id!==exceptId) refreshBlock(b.id); });

function renderBoard(){
  if(BLOCKS.length) return;
  const has=DATA.length>0, ideas=has?starters():[];
  $('#board').innerHTML=`<div class="blank">
    <h2>${has?'Describe your first chart':'Start with a spreadsheet'}</h2>
    <p>${has?'Type what you want to see. Charts, tables, notes and logos all live on the same canvas.'
            :'Load a CSV from the panel on the right, or try the sample coffee shop numbers.'}</p>
    <div class="ideas">${ideas.map(s=>`<button class="idea" data-go="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ $('#askInput').value=b.dataset.go; ask(); });
}
function starters(){
  const n=numCols().map(c=>c.name), c=COLS.filter(x=>x.type==='category').map(x=>x.name), d=dateCols().map(x=>x.name);
  const o=[];
  if(d[0]&&n[0]) o.push(`${n[0]} by month as a line chart`);
  if(c[0]&&n[0]&&c[1]) o.push(`${n[0]} by ${c[0]} stacked by ${c[1]}`);
  if(c[0]&&n[0]) o.push(`top 5 ${c[0]} by ${n[0]}`);
  if(n[0]&&n[1]) o.push(`${n[0]} and ${n[1]} as a combo chart by ${c[0]||d[0]}`);
  return o.slice(0,4);
}

/* ==========================================================
   PANE
   ========================================================== */
function renderPane(){
  const b=SEL?find(SEL):null;
  if(PANE_MODE==='theme'){
    $('#paneTitle').textContent='Theme'; $('#paneSub').textContent='brand & colours';
    $('#paneClose').style.display='inline-flex';
    $('#paneBody').innerHTML=themePane(); wireThemePane(); return;
  }
  if(b){
    const label={chart:'Chart',text:'Text',image:'Image',card:'Card',slicer:'Filter'}[b.kind]||'Block';
    $('#paneTitle').textContent=label;
    $('#paneSub').textContent='selected block';
    $('#paneClose').style.display='inline-flex';
    if(b.kind==='chart'){ $('#paneBody').innerHTML=chartPane(b); wireChartPane(b.id); }
    else if(b.kind==='card'){ $('#paneBody').innerHTML=cardPane(b); wireCardPane(b.id); }
    else if(b.kind==='slicer'){ $('#paneBody').innerHTML=slicerPane(b); wireSlicerPane(b.id); }
    else { $('#paneBody').innerHTML = b.kind==='text'?textPane(b):imagePane(b); wireSimplePane(b.id); }
    return;
  }
  $('#paneTitle').textContent='Data'; $('#paneSub').textContent='source & fields';
  $('#paneClose').style.display='none';
  $('#paneBody').innerHTML=dataPane(); wireDataPane();
}

const layoutSect=s=>`<div class="sect"><h4>Layout</h4>
  <div class="field"><label>Width · ${s.span} of 12 columns</label>
    <input type="range" class="rng" data-r="span" min="${SPAN_MIN}" max="${SPAN_MAX}" step="1" value="${s.span}"></div>
  <div class="field"><label>Height · ${Math.round(s.h)}px</label>
    <input type="range" class="rng" data-r="h" min="${H_MIN}" max="${H_MAX}" step="10" value="${s.h}"></div>
  <p class="hintline">Or drag the bottom edge or corner of the block.</p></div>`;

function dataPane(){
  const saved=`<div class="sect"><h4>Saved dashboards</h4>
    <ul class="saves" id="saveList"><li><span class="nm" style="color:var(--muted)">Loading…</span></li></ul>
    <div class="toggles" style="margin-top:10px">
      <button class="tg" id="saveAs">Save as…</button>
      <button class="tg" id="expJson">Export file</button>
      <button class="tg" id="impJson">Import file</button>
      <input type="file" id="jsonIn" accept="application/json,.json" hidden>
    </div></div>`;
  if(!DATA.length){
    return `<div class="sect"><h4>Source</h4>
      <div class="zone" id="zone"><p>Drop a CSV file here</p>
        <button class="act" id="pickBtn">Choose file</button>
        <input type="file" id="fileIn" accept=".csv,text/csv" hidden></div>
      <div style="margin-top:10px"><button class="act-quiet" id="sampleBtn">Use sample coffee shop data</button></div></div>
      ${saved}`;
  }
  return `<div class="sect"><h4>Source</h4>
      <div class="loaded"><div style="min-width:0"><b>${esc(FILE||'data.csv')}</b>
        <span>${DATA.length.toLocaleString()} rows · ${COLS.length} fields</span></div>
        <button class="act-quiet" id="unloadBtn">Change</button></div></div>
    <div class="sect"><h4>Fields</h4><ul class="fields">
      ${COLS.map(c=>`<li><span class="nm">${esc(c.name)}</span>
        <span class="pill p-${c.type==='number'?'num':c.type==='date'?'date':'cat'}">${c.type}</span></li>`).join('')}
    </ul></div>
    <div class="sect"><h4>Insert</h4><div class="toggles">
      <button class="tg" id="addCard2">KPI card</button>
      <button class="tg" id="addSlice2">Filter block</button>
      <button class="tg" id="addTxt2">Text block</button>
      <button class="tg" id="addImg2">Image block</button>
      <button class="tg" id="addFil2">Filter bar</button>
    </div></div>
    ${saved}
    <div class="sect"><h4>Dashboard</h4><div class="toggles">
      <button class="tg" id="pdf2">Export PDF</button>
      <button class="tg warn" id="clearAll">Clear all blocks</button>
    </div></div>`;
}

function chartPane(b){
  const s=b.spec, id=b.id;
  const tbtn=([v,l])=>`<button class="tsel ${s.type===v?'on':''}" data-type="${v}" title="${l}">
    <svg viewBox="0 0 22 22" fill="currentColor">${ICON[v]}</svg><span>${l}</span></button>`;
  const opts=(list,sel)=>list.map(([v,l])=>`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`).join('');
  const cols=(list,sel,nul)=>(nul?`<option value="">None</option>`:'')+
    list.map(x=>`<option value="${esc(x.name)}" ${x.name===sel?'selected':''}>${esc(x.name)}</option>`).join('');
  const isDate=colType(s.x)==='date';
  const grouped=isDate&&s.dateGroup!=='raw';

  return `<div class="sect"><h4>Visual</h4>
      <div class="typegrid">${T2D.map(tbtn).join('')}</div>
      <div class="typegrid" style="margin-top:6px">${[...TGEO,...T3D].map(tbtn).join('')}</div></div>

    <div class="sect"><h4>Fields</h4>
      <div class="field"><label>Group by</label><select data-p="x">${cols(COLS,s.x,false)}</select></div>
      ${s.type==='map'?`<div class="field"><label>Latitude</label>
          <select data-p="lat">${cols(numCols(),s.lat||guessLat(),true)}</select></div>
        <div class="field"><label>Longitude</label>
          <select data-p="lon">${cols(numCols(),s.lon||guessLon(),true)}</select></div>`:''}
      ${s.type==='choropleth'?`<div class="field"><label>Region codes are</label>
          <select data-p="geoMode">${opts(GEOMODE,s.geoMode||'USA-states')}</select></div>
        <div class="field"><label>Map scope</label>
          <select data-p="geoScope">
            <option value="usa" ${(s.geoScope||'usa')==='usa'?'selected':''}>United States</option>
            <option value="world" ${s.geoScope==='world'?'selected':''}>World</option>
            <option value="europe" ${s.geoScope==='europe'?'selected':''}>Europe</option>
            <option value="north america" ${s.geoScope==='north america'?'selected':''}>North America</option>
          </select></div>`:''}
      ${isDate?`<div class="field"><label>Roll up dates to</label>
        <select data-p="dateGroup">${opts(DGROUP,s.dateGroup)}</select></div>`:''}
      <div class="field"><label>Value</label><select data-p="y">${cols(numCols(),s.y,true)}</select></div>
      <div class="field"><label>Summarize with</label><select data-p="agg">${opts(AGGS,s.agg)}</select></div>
      ${s.type==='scatter3d'
        ? `<div class="field"><label>Depth (Z)</label><select data-p="z">${cols(numCols(),s.z,true)}</select></div>`
        : `<div class="field"><label>${isStack(s.type)?'Stack by':'Split by'}</label>
            <select data-p="series">${cols(catCols(),s.series,true)}</select></div>`}
      ${s.type==='combo'?`<div class="field"><label>Line measure (right axis)</label>
          <select data-p="y2">${cols(numCols(),s.y2,true)}</select></div>
        <div class="field"><label>Line summarized with</label>
          <select data-p="agg2">${opts(AGGS.slice(0,5),s.agg2||'sum')}</select></div>
        <div class="field"><label>Line number format</label>
          <select data-p="numfmt2">${opts(FMTS,s.numfmt2||'auto')}</select></div>`:''}</div>

    <div class="sect"><h4>Order</h4>
      <div class="field"><label>Sort</label><select data-p="sort">${opts(SORTS,s.sort)}</select></div>
      <div class="field"><label>Show top N ${s.topN?`(${s.topN})`:'(all)'}</label>
        <input type="range" class="rng" data-r="topN" min="0" max="25" step="1" value="${s.topN}"></div>
      ${grouped?`<div class="field"><label>Compare</label>
        <select data-p="compare">
          <option value="none" ${s.compare==='none'?'selected':''}>No comparison</option>
          <option value="prev" ${s.compare==='prev'?'selected':''}>Versus prior period</option>
        </select></div>`:''}</div>

    <div class="sect"><h4>Goal</h4>
      <div class="field"><label>Target value</label>
        <input type="number" data-p="target" value="${s.target==null?'':s.target}" placeholder="none"></div>
      <div class="toggles"><button class="tg ${s.targetColor?'on':''}" data-b="targetColor">Colour bars vs target</button></div></div>

    <div class="sect"><h4>Analytics lines</h4>
      <div class="toggles">
        ${LINES.map(([k,l])=>`<button class="tg ${(s.analytics||{})[k]?'on':''}" data-a="${k}">${l}</button>`).join('')}
      </div>
      <p class="hintline">Computed from what the chart currently shows, so filters change them too.</p></div>

    ${s.type==='table'?`<div class="sect"><h4>Cell formatting</h4>
      <div class="field"><label>Highlight values with</label>
        <select data-p="cf">${opts(CFMODES,s.cf||'none')}</select></div></div>`:''}

    <div class="sect"><h4>Format</h4>
      <div class="field"><label>Number format</label><select data-p="numfmt">${opts(FMTS,s.numfmt)}</select></div>
      <div class="toggles" style="margin-top:8px">
        <button class="tg ${s.labels?'on':''}" data-b="labels">Show values</button></div></div>

    ${layoutSect(s)}

    <div class="sect"><h4>Definition</h4>
      <div class="def"><b>${s.type}</b> of <b>${esc(s.y||'row count')}</b> (${s.agg})
        by <b>${esc(s.x)}</b>${grouped?` rolled to ${s.dateGroup}`:''}${s.series?`, split by <b>${esc(s.series)}</b>`:''}${s.topN?`, top ${s.topN}`:''}${s.target!=null?`, target ${s.target}`:''}.</div></div>

    <div class="sect"><h4>Actions</h4><div class="toggles">
      <button class="tg" data-b="dup">Duplicate</button>
      <button class="tg warn" data-b="kill">Delete block</button></div></div>`;
}

function cardPane(b){
  const s=b.spec;
  const opts=(l,sel)=>l.map(([v,t])=>`<option value="${v}" ${v===sel?'selected':''}>${t}</option>`).join('');
  const cols=(l,sel,nul)=>(nul?`<option value="">Row count</option>`:'')+
    l.map(x=>`<option value="${esc(x.name)}" ${x.name===sel?'selected':''}>${esc(x.name)}</option>`).join('');
  return `<div class="sect"><h4>Measure</h4>
      <div class="field"><label>Field</label><select data-p="y">${cols(numCols(),s.y,true)}</select></div>
      <div class="field"><label>Summarize with</label><select data-p="agg">${opts(AGGS.slice(0,5),s.agg)}</select></div>
      <div class="field"><label>Number format</label><select data-p="numfmt">${opts(FMTS,s.numfmt)}</select></div>
      <div class="field"><label>Label</label>
        <input type="text" data-p="title" value="${esc(s.title||'')}" placeholder="${esc(s.y||'Records')}"></div></div>
    <div class="sect"><h4>Context</h4>
      <div class="field"><label>Show underneath</label>
        <select data-p="compare">
          <option value="none" ${s.compare==='none'?'selected':''}>Nothing</option>
          <option value="share" ${s.compare==='share'?'selected':''}>Share of all rows</option>
          <option value="prev" ${s.compare==='prev'?'selected':''}>Latest month vs prior</option>
        </select></div>
      <div class="field"><label>Target value</label>
        <input type="number" data-p="target" value="${s.target==null?'':s.target}" placeholder="none"></div>
      <div class="toggles"><button class="tg ${s.spark?'on':''}" data-b="spark">Trend line</button></div>
      <p class="hintline">A target replaces the context line with progress and turns the card red or green.</p></div>
    ${layoutSect(s)}
    <div class="sect"><h4>Actions</h4><div class="toggles">
      <button class="tg" data-b="dup">Duplicate</button>
      <button class="tg warn" data-b="kill">Delete block</button></div></div>`;
}
function slicerPane(b){
  const s=b.spec;
  return `<div class="sect"><h4>Field</h4>
      <div class="field"><label>Filter on</label>
        <select data-p="col">${filterCols().map(c=>`<option value="${esc(c.name)}" ${c.name===s.col?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="toggles">
        <button class="tg ${s.counts?'on':''}" data-b="counts">Show row counts</button>
        <button class="tg" data-b="clear">Clear selection</button></div>
      <p class="hintline">Selections here filter every other block, exactly like the top filter strip.</p></div>
    ${layoutSect(s)}
    <div class="sect"><h4>Actions</h4><div class="toggles">
      <button class="tg warn" data-b="kill">Delete block</button></div></div>`;
}
function wireCardPane(id){
  const body=$('#paneBody'), b=find(id);
  body.querySelectorAll('select[data-p]').forEach(sel=>sel.onchange=e=>{
    b.spec[e.target.dataset.p]=e.target.value===''?null:e.target.value;
    if(!b.spec.y&&b.spec.agg!=='count') b.spec.agg='count';
    renderPane(); renderStatic(id); scheduleAutosave();
  });
  body.querySelectorAll('input[data-p]').forEach(inp=>inp.onchange=e=>{
    const k=e.target.dataset.p, v=e.target.value.trim();
    b.spec[k] = k==='target' ? (v===''?null:Number(v)) : v;
    renderPane(); renderStatic(id); scheduleAutosave();
  });
  body.querySelectorAll('[data-b]').forEach(btn=>btn.onclick=()=>{
    const k=btn.dataset.b;
    if(k==='kill') return killBlock(id);
    if(k==='dup') return addBlock('card',{...b.spec});
    b.spec[k]=!b.spec[k]; btn.classList.toggle('on',b.spec[k]);
    renderStatic(id); scheduleAutosave();
  });
  bindLayout(id,body);
}
function wireSlicerPane(id){
  const body=$('#paneBody'), b=find(id);
  body.querySelectorAll('select[data-p]').forEach(sel=>sel.onchange=e=>{
    b.spec.col=e.target.value; b.spec.picked=[]; b.spec.query='';
    const h=document.querySelector(`[data-ttl="${id}"]`); if(h) h.textContent=b.spec.col;
    renderStatic(id); recalc(id); renderPane();
  });
  body.querySelectorAll('[data-b]').forEach(btn=>btn.onclick=()=>{
    const k=btn.dataset.b;
    if(k==='kill') return killBlock(id);
    if(k==='clear'){ b.spec.picked=[]; renderStatic(id); return recalc(id); }
    b.spec[k]=!b.spec[k]; btn.classList.toggle('on',b.spec[k]);
    renderStatic(id); scheduleAutosave();
  });
  bindLayout(id,body);
}

const textPane=b=>`<div class="sect"><h4>Text</h4>
    <p class="hintline" style="margin-top:0">Click the heading or body on the canvas to edit.</p>
    <div class="toggles" style="margin-top:10px">
      <button class="tg ${b.spec.align==='center'?'on':''}" data-b="align">Centre</button></div></div>
  ${layoutSect(b.spec)}
  <div class="sect"><h4>Actions</h4><div class="toggles">
    <button class="tg warn" data-b="kill">Delete block</button></div></div>`;

const imagePane=b=>`<div class="sect"><h4>Image</h4>
    <div class="zone" id="imgZone"><p>${b.spec.src?'Replace image':'Drop a PNG, JPG or SVG'}</p>
      <button class="act" id="imgPick">Choose file</button>
      <input type="file" id="imgIn" accept="image/*" hidden></div>
    <div class="toggles" style="margin-top:10px">
      <button class="tg ${b.spec.fit==='cover'?'on':''}" data-b="fit">Fill the block</button>
      ${b.spec.src?`<button class="tg" data-b="asLogo">Use as brand logo</button>`:''}</div></div>
  ${layoutSect(b.spec)}
  <div class="sect"><h4>Actions</h4><div class="toggles">
    <button class="tg warn" data-b="kill">Delete block</button></div></div>`;

function themePane(){
  const sw=([k,t])=>`<button class="sw ${THEME.key===k?'on':''}" data-theme="${k}">
    <span class="dots">${t.pal.slice(0,4).map(c=>`<i style="background:${c}"></i>`).join('')}</span>
    <span>${t.name}</span></button>`;
  return `<div class="sect"><h4>Palette</h4>
      <div class="swatches">${Object.entries(THEMES).map(sw).join('')}</div></div>
    <div class="sect"><h4>Accent colour</h4>
      <div class="colorrow">
        <input type="color" id="accentPick" value="${THEME.accent}">
        <span class="hintline" style="margin:0">Overrides the palette's first colour.</span></div></div>
    <div class="sect"><h4>Client logo</h4>
      ${THEME.logo?`<div class="loaded"><img src="${THEME.logo}" style="height:26px;max-width:120px;object-fit:contain">
        <button class="act-quiet" id="logoClear">Remove</button></div>`
        :`<div class="zone" id="logoZone"><p>Replaces the Gratti mark in the header</p>
          <button class="act" id="logoPick">Choose file</button>
          <input type="file" id="logoIn" accept="image/*" hidden></div>`}
      <p class="hintline">Saved with the dashboard, so each client keeps their own branding.</p></div>`;
}

/* ---------- pane wiring ---------- */
function bindLayout(id,body){
  const b=find(id);
  body.querySelectorAll('.rng').forEach(r=>{
    const card=document.getElementById('k-'+id);
    r.addEventListener('input',()=>{
      const k=r.dataset.r;
      if(k==='span') b.spec.span=+r.value;
      else if(k==='h') b.spec.h=+r.value;
      else { b.spec.topN=+r.value; }
      const lab=r.previousElementSibling;
      if(lab) lab.textContent = k==='span'?`Width · ${b.spec.span} of 12 columns`
        : k==='h'?`Height · ${Math.round(b.spec.h)}px`
        : `Show top N ${b.spec.topN?`(${b.spec.topN})`:'(all)'}`;
      if(k!=='topN'){ applySize(id,true); if(card) card.classList.add('resizing'); }
    });
    r.addEventListener('change',()=>{
      if(card) card.classList.remove('resizing');
      refreshBlock(id); scheduleAutosave();
    });
  });
}
function wireChartPane(id){
  const body=$('#paneBody'), b=find(id); if(!b) return;
  const c=b;
  body.querySelectorAll('[data-type]').forEach(t=>t.onclick=()=>{
    const v=t.dataset.type;
    if(is3D(v)&&!PLOT){ say('3D engine unavailable. Refresh to retry.',true); return; }
    c.spec.type=v;
    if(v==='scatter3d'&&!c.spec.z) c.spec.z=(numCols()[1]||numCols()[0]||{}).name||null;
    if(['pie','doughnut'].includes(v)) c.spec.series=null;
    if(v==='combo'&&!c.spec.y2) c.spec.y2=(numCols().find(n=>n.name!==c.spec.y)||{}).name||null;
    if(v==='map'){ if(!c.spec.lat) c.spec.lat=guessLat(); if(!c.spec.lon) c.spec.lon=guessLon();
      c.spec.span=Math.max(c.spec.span,6); c.spec.h=Math.max(c.spec.h,340); applySize(id); }
    if(v==='choropleth'){ c.spec.span=Math.max(c.spec.span,6); c.spec.h=Math.max(c.spec.h,340); applySize(id); }
    if(is3D(v)){ c.spec.span=SPAN_MAX; c.spec.h=Math.max(c.spec.h,400); applySize(id); }
    renderPane(); setTimeout(()=>draw(id,c.spec),200); scheduleAutosave();
  });
  body.querySelectorAll('[data-a]').forEach(btn=>btn.onclick=()=>{
    c.spec.analytics=c.spec.analytics||{};
    const k=btn.dataset.a;
    c.spec.analytics[k]=!c.spec.analytics[k];
    btn.classList.toggle('on',c.spec.analytics[k]);
    draw(id,c.spec); scheduleAutosave();
  });
  body.querySelectorAll('select[data-p]').forEach(sel=>sel.onchange=e=>{
    const k=e.target.dataset.p;
    c.spec[k]=e.target.value===''?null:e.target.value;
    if(k==='x') c.spec.dateGroup = colType(c.spec.x)==='date'?'month':'raw';
    if(!c.spec.y&&c.spec.agg!=='count') c.spec.agg='count';
    if(c.spec.agg==='pct') c.spec.numfmt='pct1';
    renderPane(); draw(id,c.spec); scheduleAutosave();
  });
  body.querySelectorAll('input[data-p]').forEach(inp=>inp.onchange=e=>{
    const v=e.target.value.trim();
    c.spec[e.target.dataset.p] = v===''?null:Number(v);
    renderPane(); draw(id,c.spec); scheduleAutosave();
  });
  body.querySelectorAll('[data-b]').forEach(btn=>btn.onclick=()=>{
    const k=btn.dataset.b;
    if(k==='kill') return killBlock(id);
    if(k==='dup') return addChart({...c.spec,title:c.spec.title+' copy'});
    c.spec[k]=!c.spec[k];
    btn.classList.toggle('on',c.spec[k]);
    draw(id,c.spec); scheduleAutosave();
  });
  bindLayout(id,body);
}
function wireSimplePane(id){
  const body=$('#paneBody'), b=find(id);
  body.querySelectorAll('[data-b]').forEach(btn=>btn.onclick=()=>{
    const k=btn.dataset.b;
    if(k==='kill') return killBlock(id);
    if(k==='align'){ b.spec.align=b.spec.align==='center'?'left':'center'; }
    else if(k==='fit'){ b.spec.fit=b.spec.fit==='cover'?'contain':'cover'; }
    else if(k==='asLogo'){ THEME.logo=b.spec.src; applyTheme(); say('Logo applied to the header.'); }
    btn.classList.toggle('on');
    renderStatic(id); scheduleAutosave();
  });
  const zone=body.querySelector('#imgZone');
  if(zone){
    const read=f=>{ const r=new FileReader();
      r.onload=e=>{ b.spec.src=e.target.result; renderStatic(id); renderPane(); scheduleAutosave(); };
      r.readAsDataURL(f); };
    body.querySelector('#imgPick').onclick=()=>body.querySelector('#imgIn').click();
    body.querySelector('#imgIn').onchange=e=>{ const f=e.target.files[0]; if(f) read(f); };
    ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('over');}));
    zone.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) read(f); });
  }
  bindLayout(id,body);
}
function wireThemePane(){
  const body=$('#paneBody');
  body.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{
    const t=THEMES[b.dataset.theme];
    setTheme({...THEME,key:b.dataset.theme,accent:t.accent,pal:[...t.pal]});
    applyTheme(); renderPane(); scheduleAutosave();
  });
  const pick=body.querySelector('#accentPick');
  if(pick) pick.oninput=e=>{
    THEME.accent=e.target.value; THEME.pal=[e.target.value,...THEME.pal.slice(1)]; THEME.key='custom';
    applyTheme(); scheduleAutosave();
  };
  const lz=body.querySelector('#logoZone');
  if(lz){
    const read=f=>{ const r=new FileReader();
      r.onload=e=>{ THEME.logo=e.target.result; applyTheme(); renderPane(); scheduleAutosave(); };
      r.readAsDataURL(f); };
    body.querySelector('#logoPick').onclick=()=>body.querySelector('#logoIn').click();
    body.querySelector('#logoIn').onchange=e=>{ const f=e.target.files[0]; if(f) read(f); };
    ['dragenter','dragover'].forEach(ev=>lz.addEventListener(ev,e=>{e.preventDefault();lz.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>lz.addEventListener(ev,e=>{e.preventDefault();lz.classList.remove('over');}));
    lz.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) read(f); });
  }
  const lc=body.querySelector('#logoClear');
  if(lc) lc.onclick=()=>{ THEME.logo=null; applyTheme(); renderPane(); scheduleAutosave(); };
}
function wireDataPane(){
  const body=$('#paneBody'), zone=body.querySelector('#zone');
  if(zone){
    const read=f=>{ const r=new FileReader(); r.onload=e=>loadCSV(e.target.result,f.name); r.readAsText(f); };
    body.querySelector('#pickBtn').onclick=()=>body.querySelector('#fileIn').click();
    body.querySelector('#fileIn').onchange=e=>{ const f=e.target.files[0]; if(f) read(f); };
    body.querySelector('#sampleBtn').onclick=()=>{ loadCSV(sampleCSV(),'coffee-shop-sales.csv'); say('Sample data loaded.'); };
    ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('over');}));
    zone.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) read(f); });
  }
  const bind=(sel,fn)=>{ const el=body.querySelector(sel); if(el) el.onclick=fn; };
  bind('#unloadBtn',unload);
  bind('#addCard2',()=>addBlock('card',{}));
  bind('#addSlice2',()=>addBlock('slicer',{}));
  bind('#addTxt2',()=>addBlock('text',{heading:'',body:''}));
  bind('#addImg2',()=>addBlock('image',{src:null,fit:'contain'}));
  bind('#addFil2',addFilter);
  bind('#pdf2',()=>window.print());
  bind('#clearAll',()=>{ killAll(); scheduleAutosave(); });
  bind('#saveAs',()=>saveAs());
  bind('#expJson',exportJSON);
  bind('#impJson',()=>body.querySelector('#jsonIn').click());
  const ji=body.querySelector('#jsonIn');
  if(ji) ji.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>importJSON(ev.target.result); r.readAsText(f); };
  refreshSaveList();
}

/* ==========================================================
   PERSISTENCE
   ========================================================== */
const snapshot=()=>buildSnapshot($('#deckTitle').textContent.trim(), THEME);
function restore(snap){
  if(!snap||!snap.blocks) return false;
  killAll();
  setDataset({data:snap.data, cols:snap.cols, file:snap.file});
  setFilters(snap.filters||[]); setCrossFilter(null); setSel(null);
  setTheme(snap.theme||THEME);
  $('#deckTitle').textContent=snap.title||'Untitled dashboard';
  $('#deckMeta').textContent=DATA.length?`${DATA.length.toLocaleString()} rows · ${COLS.length} fields`:'no data loaded';
  $('#addFilterBtn').style.display=DATA.length?'inline-flex':'none';
  applyTheme();
  snap.blocks.forEach(b=>addBlock(b.kind,b.spec,true));
  renderChips(); renderKPIs(); renderBoard(); renderPane();
  return true;
}
let autoTimer=null;
function scheduleAutosave(){
  clearTimeout(autoTimer);
  autoTimer=setTimeout(async()=>{
    try{ await writeAutosave(JSON.stringify(snapshot())); }catch(e){}
  },700);
}
async function refreshSaveList(){
  const el=$('#saveList'); if(!el) return;
  const list=await listSaves();
  el.innerHTML = list.length
    ? list.map(s=>`<li><span class="nm">${esc(s.name)}</span>
        <span class="when">${new Date(s.at).toLocaleDateString()}</span>
        <button class="mini" data-open="${esc(s.name)}">Open</button>
        <button class="mini warn" data-drop="${esc(s.name)}">×</button></li>`).join('')
    : `<li><span class="nm" style="color:var(--muted)">Nothing saved yet</span></li>`;
  el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openSave(b.dataset.open));
  el.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>dropSave(b.dataset.drop));
}
async function saveDash(name){
  const ok=await putSave(name, JSON.stringify(snapshot()));
  say(ok?`Saved “${name}”.`:`Saved “${name}” for this session only — storage is unavailable here.`,!ok);
  refreshSaveList();
}
function saveAs(){
  const name=prompt('Name this dashboard', $('#deckTitle').textContent.trim()||'Untitled');
  if(name&&name.trim()) saveDash(name.trim());
}
async function openSave(name){
  const raw=await getSave(name);
  if(!raw){ say('That dashboard could not be found.',true); return; }
  try{ restore(JSON.parse(raw)); say(`Opened “${name}”.`); }
  catch(e){ say('That saved file could not be read.',true); }
}
async function dropSave(name){
  await removeSave(name);
  refreshSaveList();
}
function exportJSON(){
  const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=($('#deckTitle').textContent.trim()||'dashboard').replace(/[^\w\-]+/g,'-')+'.gratti.json';
  a.click(); URL.revokeObjectURL(a.href);
  say('Dashboard file downloaded.');
}
function importJSON(text){
  try{ restore(JSON.parse(text)); say('Dashboard imported.'); scheduleAutosave(); }
  catch(e){ say('That file is not a Gratti dashboard.',true); }
}

/* ==========================================================
   SAMPLE DATA + EVENTS
   ========================================================== */
function sampleCSV(){
  const months=['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
  const sites=[
    {n:'Lake Worth',    lat:26.6168, lon:-80.0570, m:1.00},
    {n:'Delray Beach',  lat:26.4615, lon:-80.0728, m:0.74},
    {n:'Boca Raton',    lat:26.3683, lon:-80.1289, m:1.18},
    {n:'West Palm Beach',lat:26.7153,lon:-80.0534, m:0.91},
    {n:'Boynton Beach', lat:26.5254, lon:-80.0664, m:0.62}
  ];
  const cats=['Coffee','Juice','Pastry','Merch'], chans=['In-store','Online'];
  const base={Coffee:[3.8,240],Juice:[7.5,120],Pastry:[4.2,95],Merch:[22,18]};
  let rows=[['Month','Location','State','Latitude','Longitude','Category','Channel','Units','Revenue']], seed=7;
  const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;
  months.forEach((m,mi)=>sites.forEach(s=>cats.forEach(cat=>chans.forEach(ch=>{
    const [price,vol]=base[cat];
    const units=Math.max(2,Math.round(vol*(1+.16*Math.sin((mi/11)*Math.PI*2))*(1+mi*.021)*
      s.m*(ch==='In-store'?1:.33)*(.85+rnd()*.3)));
    rows.push([m,s.n,'FL',s.lat,s.lon,cat,ch,units,+(units*price*(.96+rnd()*.08)).toFixed(2)]);
  }))));
  return rows.map(r=>r.join(',')).join('\n');
}
function say(msg,bad){
  const el=$('#say'); el.className='say'+(bad?' bad':''); el.innerHTML=msg||'';
}
async function ask(){
  const q=$('#askInput').value.trim();
  if(!q) return;
  if(!DATA.length){ say('Load a CSV first. Use the panel on the right.',true); return; }
  $('#askBtn').disabled=true;
  say('<span class="pip"></span>'+(AI_STATE==='off'?'Matching your fields…':'Reading your fields…'));
  try{
    let spec, mode='ai';
    try{ spec=await askAI(q); setAiState('ok'); }
    catch(e){ spec=offlineSpec(q); mode='keyword'; setAiState('off'); }
    addChart(clean(spec));
    $('#askInput').value='';
    if(mode==='ai') say('Chart added. Edit it in the panel on the right.');
    else say('Chart built in keyword mode. No AI endpoint is reachable from this page, so field and chart-type names were matched directly.');
  }catch(e){ say('That request did not map to a chart. Try naming a field directly.',true); }
  finally{ $('#askBtn').disabled=false; }
}

$('#askBtn').addEventListener('click',ask);
$('#askInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();ask();} });
$('#addFilterBtn').addEventListener('click',addFilter);
$('#addCardBtn').addEventListener('click',()=>{
  if(!DATA.length) return say('Load a CSV first.',true);
  addBlock('card',{});
});
$('#addSlicerBtn').addEventListener('click',()=>{
  if(!DATA.length) return say('Load a CSV first.',true);
  addBlock('slicer',{});
});
$('#addTextBtn').addEventListener('click',()=>addBlock('text',{heading:'',body:''}));
$('#addImgBtn').addEventListener('click',()=>addBlock('image',{src:null,fit:'contain'}));
$('#themeBtn').addEventListener('click',()=>{ setSel(null);
  document.querySelectorAll('.card').forEach(c=>c.classList.remove('sel'));
  setPaneMode('theme'); renderPane(); $('#pane').classList.add('open'); });
$('#saveBtn').addEventListener('click',()=>{
  const t=$('#deckTitle').textContent.trim();
  t&&t!=='Untitled dashboard' ? saveDash(t) : saveAs();
});
$('#pdfBtn').addEventListener('click',()=>window.print());
$('#paneToggle').addEventListener('click',()=>$('#pane').classList.toggle('open'));
$('#paneClose').addEventListener('click',()=>{ deselect(); setPaneMode('data'); renderPane(); $('#pane').classList.remove('open'); });
$('#scroll').addEventListener('click',e=>{ if(!e.target.closest('.card')&&PANE_MODE!=='theme') deselect(); });
$('#deckTitle').addEventListener('blur',e=>{
  if(!e.target.textContent.trim()) e.target.textContent='Untitled dashboard';
  scheduleAutosave();
});
window.addEventListener('resize',()=>{ if(PLOT) charts().filter(c=>is3D(c.spec.type))
  .forEach(c=>{try{Plotly.Plots.resize('pl-'+c.id);}catch(e){}}); });

/* boot */
(async function boot(){
  applyTheme(); renderBoard(); renderPane();
  if(!LIBS){ say('Chart libraries did not load. Refresh the page to retry.',true); return; }
  try{
    const raw=await readAutosave();
    if(raw){ const snap=JSON.parse(raw);
      if(snap&&snap.blocks&&snap.blocks.length){ restore(snap); say('Picked up where you left off.'); return; } }
  }catch(e){}
})();
