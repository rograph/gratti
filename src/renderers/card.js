/** KPI cards: one big number, an optional target bar, an optional sparkline. */
import { DATA, dateCols } from '../state.js';
import { LIBS, DLAB } from '../libs.js';
import { PAL } from '../theme.js';
import { rows } from '../query.js';
import { esc, fmtVal } from '../core/format.js';
import { dateKey, prevKey } from '../core/dates.js';
import { reduceRows } from '../core/pipeline.js';

/* ---------- card visual ---------- */
export function cardValue(spec,dataset){
  const rs=dataset||rows();
  if(spec.agg==='count') return rs.length;
  return reduceRows(rs,spec.y,spec.agg);
}
export function renderCard(id,b,w){
  const s=b.spec;
  w.className='plot-wrap'; w.style.height=s.h+'px';
  const val=cardValue(s);
  const label=s.title||`${s.agg==='count'?'Records':s.y||'Value'}`;
  const scale=Math.max(22,Math.min(52,Math.round(s.h*0.26)));

  let sub='', meter='';
  if(s.target!=null&&isFinite(s.target)){
    const pct=s.target?val/s.target*100:0;
    const hit=val>=s.target;
    sub=`<span class="cv-pill ${hit?'cv-good':'cv-bad'}">${pct.toFixed(0)}% of target</span>
         <span>target ${fmtVal(s.target,s.numfmt)}</span>`;
    meter=`<div class="cv-meter"><i style="width:${Math.max(2,Math.min(100,pct))}%;background:${hit?'#1F9D63':'#DB4457'}"></i></div>`;
  }else if(s.compare==='share'){
    const all=cardValue(s,DATA);
    const pct=all?val/all*100:100;
    sub=`<span class="cv-pill cv-flat">${pct.toFixed(1)}% of all rows</span>`;
  }else if(s.compare==='prev'){
    const dc=dateCols()[0];
    if(dc){
      const keys=[...new Set(rows().map(r=>dateKey(r[dc.name],'month')))].sort();
      const last=keys[keys.length-1], prevK=last?prevKey(last,'month'):null;
      const cur=cardValue(s,rows().filter(r=>dateKey(r[dc.name],'month')===last));
      const was=prevK?cardValue(s,rows().filter(r=>dateKey(r[dc.name],'month')===prevK)):null;
      if(was!=null&&was!==0){
        const d=(cur-was)/Math.abs(was)*100;
        const cls=d>0.5?'cv-good':d<-0.5?'cv-bad':'cv-flat';
        sub=`<span class="cv-pill ${cls}">${d>0?'▲':d<0?'▼':'•'} ${Math.abs(d).toFixed(1)}%</span>
             <span>${last} vs ${prevK}</span>`;
      }
    }
  }

  w.innerHTML=`<div class="cardviz">
      <div class="cv-lab">${esc(label)}</div>
      <div class="cv-val" style="font-size:${scale}px">${fmtVal(val,s.numfmt)}</div>
      ${sub?`<div class="cv-sub">${sub}</div>`:''}
      ${meter}
      ${s.spark?`<div class="cv-spark"><canvas id="cs-${id}"></canvas></div>`:''}
    </div>`;
  if(s.spark) cardSpark(id,s);
}
export function cardSpark(id,s){
  const el=document.getElementById('cs-'+id); if(!el||!LIBS) return;
  const dc=dateCols()[0], d=rows(), b=new Map();
  if(dc) d.forEach(r=>{const k=dateKey(r[dc.name],'month'); if(!b.has(k)) b.set(k,[]); b.get(k).push(r);});
  else { const size=Math.max(1,Math.ceil(d.length/16));
    d.forEach((r,i)=>{const k=Math.floor(i/size); if(!b.has(k)) b.set(k,[]); b.get(k).push(r);}); }
  const keys=[...b.keys()].sort((x,y)=>String(x).localeCompare(String(y),undefined,{numeric:true}));
  const vals=keys.map(k=>s.agg==='count'?b.get(k).length:reduceRows(b.get(k),s.y,s.agg));
  if(vals.length<2) return;
  const col=(s.target!=null&&isFinite(s.target))
    ? (cardValue(s)>=s.target?'#1F9D63':'#DB4457') : PAL[0];
  const ctx=el.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,40);
  g.addColorStop(0,col+'33'); g.addColorStop(1,col+'00');
  new Chart(el,{type:'line',
    data:{labels:keys,datasets:[{data:vals,borderColor:col,borderWidth:2,fill:true,
      backgroundColor:g,tension:.4,pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false},datalabels:DLAB?{display:false}:undefined,analytics:{lines:[]},
        tooltip:{enabled:true,backgroundColor:'#0B1220',padding:8,cornerRadius:7,displayColors:false,
          bodyFont:{family:"'JetBrains Mono', monospace",size:10.5},
          callbacks:{label:c=>fmtVal(c.parsed.y,s.numfmt)}}},
      scales:{x:{display:false},y:{display:false}}}});
}
