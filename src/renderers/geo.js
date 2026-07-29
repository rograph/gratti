/** Bubble maps and region maps, both through Plotly. */
import { COLS } from '../state.js';
import { PLOT } from '../libs.js';
import { PAL } from '../theme.js';
import { bucket } from '../query.js';
import { esc, fmtVal, mix, tint } from '../core/format.js';
import { toNum } from '../core/types.js';
import { reduceRows } from '../core/pipeline.js';
import { setCross } from '../actions.js';

export const LAT_HINT=/^(lat|latitude|y_?coord)$/i, LON_HINT=/^(lon|lng|long|longitude|x_?coord)$/i;
export const guessLat=()=>(COLS.find(c=>LAT_HINT.test(c.name))||{}).name||null;
export const guessLon=()=>(COLS.find(c=>LON_HINT.test(c.name))||{}).name||null;

export function drawGeo(id,spec,wrap){
  if(!PLOT){ wrap.innerHTML='<p class="hintline">Map engine failed to load. Refresh to retry.</p>'; return; }
  wrap.innerHTML=`<div class="plot" id="pl-${id}"></div>`;
  const el=document.getElementById('pl-'+id);
  const layout={margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)',
    font:{family:"'Instrument Sans', sans-serif",size:10,color:'#7C889D'},
    hoverlabel:{bgcolor:'#0B1220',bordercolor:'#0B1220',
      font:{family:"'JetBrains Mono', monospace",size:11,color:'#fff'}},
    geo:{scope:spec.geoScope||'usa', showland:true, landcolor:'#F4F6F9',
      subunitcolor:'#DDE3EB', countrycolor:'#DDE3EB', coastlinecolor:'#DDE3EB',
      showlakes:true, lakecolor:'#EDF0F5', showframe:false, bgcolor:'rgba(0,0,0,0)',
      fitbounds:spec.type==='map'?'locations':false}};
  const cfg={displayModeBar:true,displaylogo:false,responsive:true,
    modeBarButtonsToRemove:['toImage','sendDataToCloud','select2d','lasso2d']};

  if(spec.type==='choropleth'){
    const g=bucket({...spec,series:null});
    const labels=[...g.keys()];
    const vals=labels.map(l=>reduceRows(g.get(l).get('_')||[],spec.y,spec.agg==='pct'?'sum':spec.agg));
    return Plotly.newPlot(el,[{type:'choropleth',
      locationmode:spec.geoMode||'USA-states', locations:labels, z:vals,
      colorscale:[[0,tint(PAL[0],.92)],[.55,PAL[0]],[1,mix(PAL[0],'#0B1220',.55)]],
      marker:{line:{color:'#FFFFFF',width:1}},
      colorbar:{thickness:9,len:.7,outlinewidth:0,tickfont:{size:9}},
      hovertemplate:`%{location}<br>${esc(spec.y||'count')}: %{z:,.4~s}<extra></extra>`}],layout,cfg);
  }

  const lat=spec.lat||guessLat(), lon=spec.lon||guessLon();
  if(!lat||!lon){
    wrap.innerHTML=`<p class="hintline" style="padding:14px">A bubble map needs latitude and longitude fields.
      Pick them in the panel on the right, or switch to Region map and use a state or country field.</p>`;
    return;
  }
  /* one bubble per group, sized by the measure and positioned at the group's mean point */
  const g=bucket({...spec,series:null});
  const pts=[...g.keys()].map(k=>{
    const rs=g.get(k).get('_')||[];
    const v=reduceRows(rs,spec.y,spec.agg==='pct'?'sum':spec.agg);
    return {k, v,
      lat:rs.reduce((s,r)=>s+toNum(r[lat]),0)/(rs.length||1),
      lon:rs.reduce((s,r)=>s+toNum(r[lon]),0)/(rs.length||1)};
  }).filter(p=>isFinite(p.lat)&&isFinite(p.lon)&&(p.lat||p.lon));
  if(!pts.length){ wrap.innerHTML='<p class="hintline" style="padding:14px">No usable coordinates in those fields.</p>'; return; }
  const max=Math.max(...pts.map(p=>Math.abs(p.v)))||1;

  Plotly.newPlot(el,[{type:'scattergeo', mode:'markers',
    lat:pts.map(p=>p.lat), lon:pts.map(p=>p.lon),
    text:pts.map(p=>`${p.k}<br>${fmtVal(p.v,spec.numfmt)}`),
    hovertemplate:'%{text}<extra></extra>',
    marker:{size:pts.map(p=>10+Math.sqrt(Math.abs(p.v)/max)*36),
      color:pts.map(p=>p.v), colorscale:[[0,tint(PAL[0],.55)],[1,PAL[0]]],
      opacity:.82, line:{color:'#FFFFFF',width:1.6}, showscale:false}}],layout,cfg);

  el.on('plotly_click',ev=>{
    const p=ev.points&&ev.points[0];
    if(p!=null&&pts[p.pointIndex]) setCross(spec.x,pts[p.pointIndex].k);
  });
}
