/* ==========================================================
   Gratti v5
   ========================================================== */

import { fmt, esc, tint } from './core/format.js';
import { inferType, toNum } from './core/types.js';
import { is3D } from './core/pipeline.js';
import {
  DATA, COLS, BLOCKS, FILTERS, CROSS, SEL, PANE_MODE, AI_STATE, dragId,
  find, charts, setBlocks, setFilters, setCrossFilter, setSel,
  setPaneMode, setAiState, setDragId, setDataset, clearFilters, nextId,
  colTypeOf as colType, numCols, metricCols, catCols, dateCols, filterCols,
  VIEWER, setViewer
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
import { SPAN_MIN, SPAN_MAX, H_MIN, H_MAX } from './registries.js';
import { askAI, offlineSpec, askAISuggest, offlineSuggest, clean } from './nl.js';
import { renderPane, registerPane } from './pane.js';
import { slugFromSearch, loadManifest, loadDashboard } from './publish.js';
import { seal, unseal, isSealed } from './crypt.js';

/* Published dashboards available in the gallery, filled in at boot. */
let PUBLISHED = [];

function applyTheme(){
  const r=document.documentElement.style;
  r.setProperty('--accent', THEME.accent);
  r.setProperty('--accent-soft', tint(THEME.accent, .93));
  /* White-label: the flag rides in the theme, so it travels with the
     snapshot and a published dashboard honours it in the viewer. */
  document.documentElement.classList.toggle('nobrand', !!THEME.hideBrand);
  setPal(THEME.pal && THEME.pal.length ? THEME.pal : THEMES.indigo.pal);
  const brand=$('#brand');
  brand.innerHTML = THEME.logo
    ? `<img class="brandlogo" src="${THEME.logo}" alt="">`
    : `<span class="mark"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19.5V14.6L9 9.1l4.3 2.7L21 4.5v15Z" fill="#fff"/></svg></span><span id="brandName">Gratti</span>`;
  redrawAll(); renderKPIs();
}

const COLS_N=12, GAP=16;

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
registerPane({ say, killBlock, addBlock, addChart, addFilter, unload, loadCSV, sampleCSV,
  applySize, applyTheme, killAll, saveAs, exportJSON, exportJSONEnc, importJSON, refreshSaveList });

/* ---------- KPI strip ---------- */
function renderKPIs(){
  if(!DATA.length){ $('#kpis').innerHTML=''; return; }
  const metrics=metricCols().slice(0,3), d=rows();
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
    if(!spec.y&&metricCols()[0]) spec.y=metricCols()[0].name;
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
/* hoisted for registerPane(), same rule as the actions above */
function addChart(spec,silent){ return addBlock('chart',spec,silent); }

function shell(id,kind,spec){
  /* A published dashboard keeps its charts interactive but loses every
     affordance that would edit, move, or delete a block. */
  const grip=VIEWER?'':`<span class="grip" data-grip="${id}" title="Drag to reorder">⠿</span>`;
  const edit=VIEWER?'false':'true';
  const ctrl=VIEWER?'':`<span class="ctrl">
      <button class="cbtn" data-c="fit" aria-label="Snap to full width" title="Snap to full width">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 4 2.3 8l3.5 4M10.2 4l3.5 4-3.5 4M8 3.2v9.6"/></svg></button>
      <button class="cbtn kill" data-c="kill" aria-label="Delete block" title="Delete">×</button></span>`;
  const handles=VIEWER?'':`<span class="rs rs-b" data-r="v" title="Drag to change height"></span>
    <span class="rs rs-c" data-r="both" title="Drag to resize"></span>
    <span class="readout" id="ro-${id}"></span>`;
  if(kind==='chart')
    return `<div class="card-top">
        ${grip}
        <h3 contenteditable="${edit}" spellcheck="false" data-ttl="${id}">${esc(spec.title)}</h3>
        ${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
  if(kind==='card'||kind==='slicer')
    return `<div class="card-top" style="margin-bottom:8px">
        ${grip}
        ${kind==='slicer'?`<h3 contenteditable="${edit}" spellcheck="false" data-ttl="${id}">${esc(spec.title||spec.col||'Filter')}</h3>`:'<span class="grow"></span>'}
        ${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
  if(kind==='text')
    return `<div class="card-top">${grip}<span class="grow"></span>${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px;overflow:auto"></div>${handles}`;
  return `<div class="card-top">${grip}<span class="grow"></span>${ctrl}</div>
      <div class="plot-wrap" id="w-${id}" style="height:${spec.h}px"></div>${handles}`;
}

function select(id){
  if(VIEWER) return;
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
  if(VIEWER) return;
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
    ${has&&!VIEWER?`<div style="margin-bottom:14px"><button class="act" id="suggestBtn">Build a dashboard for me</button></div>`:''}
    <div class="ideas">${ideas.map(s=>`<button class="idea" data-go="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    ${!has&&PUBLISHED.length?`<div class="gallery">
      <h3>Your dashboards</h3>
      <div class="gal">${PUBLISHED.map(d=>`<a class="galcard" href="?d=${encodeURIComponent(d.slug)}">
        <b>${esc(d.title||d.slug)}</b>
        <span>${d.rows?`${Number(d.rows).toLocaleString()} rows`:''}${d.blocks?` · ${d.blocks} blocks`:''}</span></a>`).join('')}</div>
    </div>`:''}</div>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ $('#askInput').value=b.dataset.go; ask(); });
  const sb=document.getElementById('suggestBtn'); if(sb) sb.onclick=suggestDashboard;
}

/* Read the schema and build a starter dashboard: KPI cards for the top
   measures, then a suggested set of charts. The model designs the set when
   the endpoint answers; the schema rules in nl.js do it offline. */
async function suggestDashboard(){
  if(!DATA.length){ say('Load a CSV first. Use the panel on the right.',true); return; }
  const btn=document.getElementById('suggestBtn'); if(btn) btn.disabled=true;
  say('<span class="pip"></span>'+(AI_STATE==='off'?'Reading your field types…':'Designing a starter dashboard…'));
  let specs, mode='ai';
  try{ specs=await askAISuggest(); setAiState('ok'); }
  catch(e){ specs=offlineSuggest(); mode='keyword'; setAiState('off'); }
  if(!specs.length){ say('This file did not map to any charts. Try describing one instead.',true);
    if(btn) btn.disabled=false; return; }
  metricCols().slice(0,3).forEach(c=>addBlock('card',{y:c.name},true));
  specs.slice(0,6).forEach(sp=>addChart(clean(sp),true));
  $('#scroll').scrollTop=0;
  say(mode==='ai'
    ? 'Starter dashboard built. Edit or delete any block, or ask for more.'
    : 'Starter dashboard built from your field types. No AI endpoint is reachable from this page, so the layout follows the schema rules.');
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
  /* A visitor viewing a published dashboard must never overwrite the
     autosave of whoever is building one in the same browser. */
  if(VIEWER) return;
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
function downloadJSON(obj,pretty){
  const blob=new Blob([JSON.stringify(obj,null,pretty?2:0)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=($('#deckTitle').textContent.trim()||'dashboard').replace(/[^\w\-]+/g,'-')+'.gratti.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function exportJSON(){ downloadJSON(snapshot(),true); say('Dashboard file downloaded.'); }
/* hoisted for registerPane(), same rule as the actions */
async function exportJSONEnc(){
  const pass=prompt('Choose a passphrase for this file. Whoever opens it will need it.');
  if(pass===null) return;
  if(pass.length<8){ say('Use a passphrase of at least 8 characters.',true); return; }
  downloadJSON(await seal(snapshot(),pass));
  say('Protected file downloaded. Share the passphrase separately, and keep it safe: without it nobody can open the file, including you.');
}
async function importJSON(text){
  let snap;
  try{ snap=JSON.parse(text); }
  catch(e){ return say('That file is not a Gratti dashboard.',true); }
  if(isSealed(snap)){
    const pass=prompt('This dashboard is protected. Enter its passphrase.');
    if(pass===null) return;
    try{ snap=await unseal(snap,pass); }
    catch(e){ return say('That passphrase did not unlock the file.',true); }
  }
  try{
    if(!restore(snap)) return say('That file is not a Gratti dashboard.',true);
    say('Dashboard imported.'); scheduleAutosave();
  }catch(e){ say('That file is not a Gratti dashboard.',true); }
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
  const slug=slugFromSearch(location.search);
  if(slug) setViewer(true);
  document.documentElement.classList.toggle('viewer', VIEWER);
  if(VIEWER) $('#deckTitle').contentEditable='false';

  applyTheme(); renderBoard(); renderPane();
  if(!LIBS){ say('Chart libraries did not load. Refresh the page to retry.',true); return; }

  /* A published dashboard: load it and stop. Never touch the autosave. */
  if(VIEWER){
    let snap=null;
    try{ snap=await loadDashboard(slug); }
    catch(e){
      /* Unknown slug. Reopen the editor, and never list what else is
         published: the gallery is for the dashboard owner, not visitors. */
      setViewer(false);
      document.documentElement.classList.remove('viewer');
      $('#deckTitle').contentEditable='true';
      say(`No published dashboard called “${esc(slug)}”.`,true);
      renderBoard();
      return;
    }
    if(isSealed(snap)){
      for(let i=0;i<3&&isSealed(snap);i++){
        const pass=prompt(i===0
          ?'This dashboard is protected. Enter its passphrase.'
          :'That passphrase did not unlock it. Try again.');
        if(pass===null) break;
        try{ snap=await unseal(snap,pass); }catch(e){}
      }
      if(isSealed(snap)){ say('This dashboard stays locked without its passphrase.',true); return; }
    }
    restore(snap);
    return;
  }

  PUBLISHED=await loadManifest();
  try{
    const raw=await readAutosave();
    if(raw){ const snap=JSON.parse(raw);
      if(snap&&snap.blocks&&snap.blocks.length){ restore(snap); say('Picked up where you left off.'); return; } }
  }catch(e){}
  renderBoard();
})();
