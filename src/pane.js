/**
 * The right-hand properties panel.
 *
 * renderPane() decides which pane to show from PANE_MODE and the selection:
 * the data pane (source, fields, saves), one of the block panes, or the
 * theme pane. Each pane is a template function plus a wire function that
 * attaches handlers to the fresh markup.
 *
 * The panes edit blocks and files, and those jobs (killBlock, loadCSV,
 * saveAs, ...) live in main.js, which itself calls renderPane(). Importing
 * each other in a circle is the same problem actions.js solves, so it gets
 * the same fix: main.js registers its functions once at startup and the
 * panes call through module-level bindings.
 */
import { esc } from './core/format.js';
import { is3D, isStack } from './core/pipeline.js';
import {
  DATA, COLS, SEL, PANE_MODE, FILE,
  find, colTypeOf as colType, numCols, catCols, filterCols, guessLat, guessLon
} from './state.js';
import { PLOT } from './libs.js';
import { THEMES, THEME, setTheme } from './theme.js';
import { recalc, scheduleAutosave, refreshBlock } from './actions.js';
import { draw, renderStatic } from './renderers/index.js';
import {
  ICON, T2D, T3D, TGEO, CFMODES, LINES, GEOMODE, AGGS, FMTS, DGROUP, SORTS,
  SPAN_MIN, SPAN_MAX, H_MIN, H_MAX
} from './registries.js';

const $=s=>document.querySelector(s);

/* Registered by main.js at startup, before anything can render. */
let say, killBlock, addBlock, addChart, addFilter, unload, loadCSV, sampleCSV,
    applySize, applyTheme, killAll, saveAs, exportJSON, exportJSONEnc, importJSON, refreshSaveList;

export function registerPane(p){
  ({ say, killBlock, addBlock, addChart, addFilter, unload, loadCSV, sampleCSV,
     applySize, applyTheme, killAll, saveAs, exportJSON, exportJSONEnc, importJSON, refreshSaveList } = p);
}

export function renderPane(){
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
      <button class="tg" id="expEnc" title="Encrypted with a passphrase. Safe to publish anywhere.">Protected export</button>
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
  const s=b.spec;
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
  bind('#expEnc',()=>exportJSONEnc());
  bind('#impJson',()=>body.querySelector('#jsonIn').click());
  const ji=body.querySelector('#jsonIn');
  if(ji) ji.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>importJSON(ev.target.result); r.readAsText(f); };
  refreshSaveList();
}
