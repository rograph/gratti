/** Every Chart.js visual: column, bar, line, area, stacks, combo, pie, radar. */
import { CROSS } from '../state.js';
import { DLAB } from '../libs.js';
import { PAL } from '../theme.js';
import { aggregate, alignedSeries, analyticsOpts } from '../query.js';
import { fmtVal } from '../core/format.js';
import { isStack } from '../core/pipeline.js';
import { setCross } from '../actions.js';

export function draw2D(id,spec,wrap){
  wrap.innerHTML=`<canvas id="cv-${id}"></canvas>`;
  const {labels,names,matrix,compare}=aggregate(spec);
  const pie=['pie','doughnut'].includes(spec.type);
  const stacked=isStack(spec.type);
  const base = spec.type==='hbar'||stacked||spec.type==='combo' ? 'bar'
             : spec.type==='area' ? 'line' : spec.type;
  const clickable=['bar','hbar','pie','doughnut','stack','stack100','combo'].includes(spec.type)&&!spec.series;
  const lit=l=>!CROSS||CROSS.col!==spec.x||String(CROSS.val)===String(l);
  const el=document.getElementById('cv-'+id), ctx=el.getContext('2d');
  const fmtMode=spec.type==='stack100'?'pct1':spec.numfmt;

  const datasets=names.map((sn,i)=>{
    const col=PAL[i%PAL.length];
    let bg;
    if(pie) bg=labels.map((l,j)=>PAL[j%PAL.length]+(lit(l)?'':'30'));
    else if(spec.type==='area'){
      const g=ctx.createLinearGradient(0,0,0,Math.max(120,spec.h));
      g.addColorStop(0,col+'40'); g.addColorStop(1,col+'02'); bg=g;
    }
    else if(spec.type==='radar') bg=col+'2A';
    else if(spec.target!=null&&spec.targetColor&&!spec.series)
      bg=matrix[i].map((v,j)=>(v>=spec.target?'#1F9D63':'#DB4457')+(lit(labels[j])?'':'30'));
    else if(clickable) bg=labels.map(l=>col+(lit(l)?'':'30'));
    else bg=col;
    return {label:sn==='_'?(spec.y||'count'):sn, data:matrix[i], backgroundColor:bg, borderColor:col,
      borderWidth:['line','area','radar'].includes(spec.type)?2.6:0,
      fill:spec.type==='area'||spec.type==='radar', tension:.38,
      pointRadius:labels.length>18?0:3, pointBackgroundColor:col, pointBorderColor:'#fff', pointBorderWidth:1.5,
      pointHoverRadius:5, borderRadius:['bar','hbar','combo'].includes(spec.type)?6:(stacked?3:0),
      maxBarThickness:54, categoryPercentage:.72, barPercentage:.88,
      order:2, yAxisID:'y'};
  });

  if(compare){
    datasets.push({label:'Prior period', data:compare, type:'line', borderColor:'#9AA6B6',
      borderWidth:2, borderDash:[5,4], fill:false, pointRadius:0, tension:.35, order:0, yAxisID:'y'});
  }
  if(spec.type==='combo'&&spec.y2){
    const line=alignedSeries(spec,labels,spec.y2,spec.agg2||'sum');
    datasets.push({label:spec.y2, data:line, type:'line', borderColor:PAL[3%PAL.length],
      backgroundColor:PAL[3%PAL.length], borderWidth:2.8, fill:false, tension:.35,
      pointRadius:labels.length>18?0:3.5, pointBackgroundColor:PAL[3%PAL.length],
      pointBorderColor:'#fff', pointBorderWidth:1.5, order:0, yAxisID:'y1'});
  }

  const scales = (pie||spec.type==='radar') ? {} : {
    x:{stacked, grid:{display:false}, border:{display:false},
       ticks:{maxRotation:38,autoSkipPadding:14,padding:6,font:{size:11}}},
    y:{stacked, grid:{color:'#F0F3F7',drawTicks:false}, border:{display:false},
       ticks:{callback:v=>fmtVal(v,fmtMode),padding:10,maxTicksLimit:6,font:{size:11}},
       grace:'8%', max:spec.type==='stack100'?100:undefined}
  };
  if(spec.type==='combo'&&spec.y2)
    scales.y1={position:'right',grid:{display:false},border:{display:false},
      ticks:{callback:v=>fmtVal(v,spec.numfmt2||'auto'),padding:8,maxTicksLimit:5,font:{size:11},
      color:PAL[3%PAL.length]},grace:'12%'};

  new Chart(el,{type:base,data:{labels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      indexAxis:spec.type==='hbar'?'y':'x',
      layout:{padding:{top:spec.labels?14:4,right:4,left:0,bottom:0}},
      interaction:{mode:'index',intersect:false},
      onClick:(e,els,ch)=>{ if(clickable&&els.length) setCross(spec.x,ch.data.labels[els[0].index]); },
      onHover:(e,els)=>{ e.native.target.style.cursor=(clickable&&els.length)?'pointer':'default'; },
      plugins:{
        legend:{display:pie||datasets.length>1, position:pie?'right':'top', align:'start',
          labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:14,font:{size:11.5}}},
        tooltip:{backgroundColor:'#0B1220',padding:12,cornerRadius:9,titleFont:{size:12,weight:'600'},
          bodyFont:{family:"'JetBrains Mono', monospace",size:11.5},boxWidth:8,boxHeight:8,boxPadding:5,
          callbacks:{label:c=>{
            const v=c.parsed.y??c.parsed.r??c.parsed;
            const m=c.dataset.yAxisID==='y1'?(spec.numfmt2||'auto'):fmtMode;
            return ` ${c.dataset.label}: ${fmtVal(v,m)}`;
          }}},
        datalabels:DLAB?{display:spec.labels?'auto':false,
          anchor:pie?'center':(stacked?'center':'end'), align:pie?'center':(stacked?'center':'end'), offset:3,
          color:(pie||stacked)?'#fff':'#3A4457', font:{family:"'JetBrains Mono', monospace",size:10,weight:'500'},
          formatter:(v,c)=>fmtVal(v, c.dataset.yAxisID==='y1'?(spec.numfmt2||'auto'):fmtMode)}:undefined,
        analytics:analyticsOpts(spec,matrix,fmtMode)      },
      scales
    }});

  if(clickable){
    const f=document.createElement('span'); f.className='readout'; f.style.cssText='opacity:.85;left:20px;right:auto;bottom:8px;background:none;color:#7C889D;padding:0';
    f.textContent=CROSS&&CROSS.col===spec.x?'click the same bar to clear':'click a bar to filter everything';
    wrap.parentElement.appendChild(f);
    setTimeout(()=>{ try{f.remove();}catch(e){} },4000);
  }
}
