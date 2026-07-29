/** Sortable table with totals and conditional formatting. */
import { CROSS } from '../state.js';
import { PAL } from '../theme.js';
import { aggregate } from '../query.js';
import { esc, fmtVal, mix } from '../core/format.js';
import { setCross, scheduleAutosave, refreshBlock } from '../actions.js';

/* ---------- table ---------- */
export function drawTable(id,spec,wrap){
  const {labels,names,matrix}=aggregate(spec);
  const multi=names.length>1||names[0]!=='_';
  const heads=[spec.x, ...(multi?names:[spec.y||'Count']), ...(multi?['Total']:[])];
  const rowsOut=labels.map((l,li)=>{
    const vals=names.map(( _,si)=>matrix[si][li]);
    const tot=vals.reduce((a,b)=>a+b,0);
    return {label:l, vals, tot};
  });
  const sk=spec.tableSort;
  if(sk){
    const dir=sk.dir==='asc'?1:-1;
    if(sk.col===0) rowsOut.sort((a,b)=>dir*String(a.label).localeCompare(String(b.label),undefined,{numeric:true}));
    else if(sk.col===heads.length-1&&multi) rowsOut.sort((a,b)=>dir*(a.tot-b.tot));
    else rowsOut.sort((a,b)=>dir*((a.vals[sk.col-1]||0)-(b.vals[sk.col-1]||0)));
  }
  const totals=names.map((_,si)=>rowsOut.reduce((s,r)=>s+(r.vals[si]||0),0));
  const grand=totals.reduce((a,b)=>a+b,0);
  const ar=i=>sk&&sk.col===i?`<span class="ar">${sk.dir==='asc'?'▲':'▼'}</span>`:'';
  const lit=l=>!CROSS||CROSS.col!==spec.x||String(CROSS.val)===String(l);

  /* conditional formatting scales, computed across every numeric cell */
  const cf=spec.cf||'none';
  const flat=rowsOut.flatMap(r=>r.vals).filter(v=>isFinite(v));
  const lo=flat.length?Math.min(...flat):0, hi=flat.length?Math.max(...flat):1;
  const span=(hi-lo)||1;
  const cell=v=>{
    if(cf==='none'||!isFinite(v)) return `<td>${fmtVal(v,spec.numfmt)}</td>`;
    if(cf==='bars'){
      const pct=Math.max(0,Math.min(100,((v-Math.min(0,lo))/(hi-Math.min(0,lo)||1))*100));
      return `<td class="cf"><span class="bar" style="width:calc(${pct}% - 12px);background:${PAL[0]}"></span>${fmtVal(v,spec.numfmt)}</td>`;
    }
    if(cf==='scale'){
      const t=(v-lo)/span;
      return `<td style="background:${mix('#FFFFFF',PAL[0],t*0.42)}">${fmtVal(v,spec.numfmt)}</td>`;
    }
    const mid=(lo+hi)/2;
    const up=v>=mid;
    return `<td><span class="arrow" style="color:${up?'#1F9D63':'#DB4457'}">${up?'▲':'▼'}</span>${fmtVal(v,spec.numfmt)}</td>`;
  };

  wrap.innerHTML=`<table class="dt">
    <thead><tr>${heads.map((h,i)=>`<th data-sc="${i}">${esc(h)}${ar(i)}</th>`).join('')}</tr></thead>
    <tbody>${rowsOut.map(r=>`<tr data-lbl="${esc(r.label)}" class="${CROSS&&CROSS.col===spec.x&&lit(r.label)?'sel-row':''}">
      <td>${esc(r.label)}</td>
      ${r.vals.map(v=>cell(v)).join('')}
      ${multi?`<td>${fmtVal(r.tot,spec.numfmt)}</td>`:''}</tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td>
      ${totals.map(v=>`<td>${fmtVal(v,spec.numfmt)}</td>`).join('')}
      ${multi?`<td>${fmtVal(grand,spec.numfmt)}</td>`:''}</tr></tfoot></table>`;

  wrap.querySelectorAll('[data-sc]').forEach(th=>th.onclick=e=>{
    e.stopPropagation();
    const col=+th.dataset.sc, cur=spec.tableSort;
    spec.tableSort = cur&&cur.col===col ? {col,dir:cur.dir==='asc'?'desc':'asc'} : {col,dir:col===0?'asc':'desc'};
    refreshBlock(id); scheduleAutosave();
  });
  wrap.querySelectorAll('[data-lbl]').forEach(tr=>tr.onclick=e=>{
    e.stopPropagation(); setCross(spec.x,tr.dataset.lbl);
  });
}
