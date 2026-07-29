/** On-canvas filter blocks. A slicer filters every other block but itself. */
import { DATA } from '../state.js';
import { rows } from '../query.js';
import { esc } from '../core/format.js';
import { recalc } from '../actions.js';

/* ---------- slicer visual ---------- */
export function renderSlicer(id,b,w){
  const s=b.spec;
  w.className='plot-wrap'; w.style.height=s.h+'px';
  if(!s.col||!DATA.length){ w.innerHTML='<p class="hintline">Pick a field in the panel on the right.</p>'; return; }
  const others=rows(null,id);
  const counts=new Map();
  others.forEach(r=>{ const k=String(r[s.col]); counts.set(k,(counts.get(k)||0)+1); });
  const all=[...new Set(DATA.map(r=>String(r[s.col])))].filter(v=>v!==''&&v!=='null');
  all.sort((a,z)=>a.localeCompare(z,undefined,{numeric:true}));
  const q=(s.query||'').toLowerCase();
  const show=q?all.filter(v=>v.toLowerCase().includes(q)):all;
  const tick=`<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3 4.8 8.7 9.5 3.4"/></svg>`;

  w.innerHTML=`<div class="slicer">
      ${all.length>8?`<input class="sl-search" id="q-${id}" placeholder="Search ${esc(s.col)}" value="${esc(s.query||'')}">`:''}
      <div class="sl-list">
        ${show.map(v=>`<div class="sl-item ${s.picked.includes(v)?'on':''}" data-v="${esc(v)}">
          <span class="box">${tick}</span><span class="lbl">${esc(v)}</span>
          ${s.counts?`<span class="cnt">${(counts.get(v)||0).toLocaleString()}</span>`:''}</div>`).join('')}
        ${show.length?'':'<p class="hintline">No matches.</p>'}
      </div>
      <div class="sl-foot">
        <button data-all="1">Select all</button>
        <button data-none="1">Clear</button>
        <span class="n">${s.picked.length?s.picked.length+' of '+all.length:'all'}</span>
      </div></div>`;

  w.querySelectorAll('[data-v]').forEach(el=>el.onclick=e=>{
    e.stopPropagation();
    const v=el.dataset.v, i=s.picked.indexOf(v);
    i>=0?s.picked.splice(i,1):s.picked.push(v);
    renderSlicer(id,b,w); recalc(id);
  });
  const qa=w.querySelector('[data-all]'), qn=w.querySelector('[data-none]');
  if(qa) qa.onclick=e=>{ e.stopPropagation(); s.picked=[...all]; renderSlicer(id,b,w); recalc(id); };
  if(qn) qn.onclick=e=>{ e.stopPropagation(); s.picked=[]; renderSlicer(id,b,w); recalc(id); };
  const qi=w.querySelector('#q-'+id);
  if(qi) qi.oninput=e=>{ s.query=e.target.value;
    const pos=e.target.selectionStart; renderSlicer(id,b,w);
    const n=w.querySelector('#q-'+id); if(n){ n.focus(); n.setSelectionRange(pos,pos); } };
}
