/** The 3D visuals. They exist for demo impact; never suggest them for analysis. */
import { PLOT } from '../libs.js';
import { PAL } from '../theme.js';
import { rows, aggregate } from '../query.js';
import { esc, fmtVal, tint } from '../core/format.js';
import { toNum } from '../core/types.js';

export function box(cx,cy,h,w,ci){
  const x0=cx-w/2,x1=cx+w/2,y0=cy-w/2,y1=cy+w/2;
  return {type:'mesh3d',x:[x0,x1,x1,x0,x0,x1,x1,x0],y:[y0,y0,y1,y1,y0,y0,y1,y1],z:[0,0,0,0,h,h,h,h],
    i:[0,0,4,4,0,0,1,1,2,2,3,3],j:[1,2,5,6,1,5,2,6,3,7,0,4],k:[2,3,6,7,5,4,6,5,7,6,4,7],
    color:PAL[ci%PAL.length],opacity:.93,flatshading:true,hoverinfo:'skip',showscale:false};
}

export function draw3D(id,spec,wrap){
  if(!PLOT){ wrap.innerHTML='<p class="hintline">3D engine failed to load. Refresh to retry.</p>'; return; }
  wrap.innerHTML=`<div class="plot" id="pl-${id}"></div>`;
  const el=document.getElementById('pl-'+id);
  const layout={margin:{l:0,r:0,t:4,b:0},paper_bgcolor:'rgba(0,0,0,0)',
    font:{family:"'Instrument Sans', sans-serif",size:10,color:'#7C889D'},showlegend:false,
    hoverlabel:{bgcolor:'#0B1220',bordercolor:'#0B1220',font:{family:"'JetBrains Mono', monospace",size:11,color:'#fff'}},
    scene:{aspectmode:'manual',aspectratio:{x:2,y:1,z:.8},
      xaxis:{gridcolor:'#E4E8EF',zerolinecolor:'#E4E8EF',showspikes:false,title:{text:spec.x,font:{size:10}}},
      yaxis:{gridcolor:'#E4E8EF',zerolinecolor:'#E4E8EF',showspikes:false,title:{text:'',font:{size:10}}},
      zaxis:{gridcolor:'#E4E8EF',zerolinecolor:'#E4E8EF',showspikes:false,title:{text:spec.y||'count',font:{size:10}}},
      camera:{eye:{x:1.72,y:-1.88,z:.72}}}};
  const cfg={displayModeBar:true,displaylogo:false,responsive:true,
    modeBarButtonsToRemove:['toImage','sendDataToCloud','hoverClosest3d']};

  if(spec.type==='scatter3d'){
    const d=rows(), z=spec.z||spec.y;
    layout.scene.aspectratio={x:1,y:1,z:.88};
    layout.scene.yaxis.title.text=spec.y||''; layout.scene.zaxis.title.text=z||'';
    return Plotly.newPlot(el,[{type:'scatter3d',mode:'markers',
      x:d.map(r=>toNum(r[spec.x])),y:d.map(r=>toNum(r[spec.y])),z:d.map(r=>toNum(r[z])),
      hovertemplate:`${esc(spec.x)}: %{x}<br>${esc(spec.y||'')}: %{y}<br>${esc(z||'')}: %{z}<extra></extra>`,
      marker:{size:4.4,opacity:.82,color:d.map(r=>toNum(r[z])),
        colorscale:[[0,PAL[0]],[.5,PAL[2]],[1,PAL[3]]],showscale:false}}],layout,cfg);
  }
  const {labels,names,matrix,cut}=aggregate(spec);
  if(spec.type==='surface3d'){
    layout.scene.yaxis.title.text=spec.series||'';
    return Plotly.newPlot(el,[{type:'surface',z:matrix,x:labels,
      y:names.map(s=>s==='_'?(spec.y||'value'):s),
      colorscale:[[0,tint(PAL[0],.9)],[.5,PAL[0]],[1,'#0B1220']],showscale:false,
      hovertemplate:'%{x}<br>%{y}<br>%{z:.4s}<extra></extra>',
      contours:{z:{show:true,usecolormap:true,project:{z:true}}}}],layout,cfg);
  }
  const step=2.2,traces=[],hx=[],hy=[],hz=[],ht=[];
  matrix.forEach((row,si)=>row.forEach((v,li)=>{
    traces.push(box(li,si*step,v,.55,si));
    hx.push(li);hy.push(si*step);hz.push(v);
    ht.push(`${labels[li]}${names[si]==='_'?'':' · '+names[si]}<br>${fmtVal(v,spec.numfmt)}`);
  }));
  traces.push({type:'scatter3d',mode:'markers',x:hx,y:hy,z:hz,
    marker:{size:9,opacity:.01,color:'#000'},text:ht,hovertemplate:'%{text}<extra></extra>'});
  layout.scene.aspectratio={x:2.1,y:Math.max(.55,names.length*.42),z:.82};
  layout.scene.xaxis.ticktext=labels; layout.scene.xaxis.tickvals=labels.map((_,i)=>i);
  layout.scene.yaxis.ticktext=names.map(s=>s==='_'?'':s);
  layout.scene.yaxis.tickvals=names.map((_,i)=>i*step);
  layout.scene.yaxis.title.text=spec.series||'';
  Plotly.newPlot(el,traces,layout,cfg);
}
