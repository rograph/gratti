/**
 * Turning a plain-language request into a chart spec.
 *
 * Two paths produce a spec and one guard cleans it. `askAI` asks the model;
 * `offlineSpec` matches keywords against the real column names when there is
 * no endpoint to reach. Either way `clean()` runs last, so a spec that names
 * a column that does not exist, or a visual the libraries cannot draw, comes
 * back as something renderable instead of a broken block.
 *
 * No DOM. main.js owns the input box and the status line.
 */
import { DATA, COLS, numCols, catCols, dateCols, colTypeOf, guessLat, guessLon } from './state.js';
import { PLOT } from './libs.js';
import { is3D, isGeo, isStack } from './core/pipeline.js';
import { T2D, T3D, TGEO, CFMODES, GEOMODE, DGROUP, SORTS } from './registries.js';

export async function askAI(q){
  const prompt=`You turn plain-language requests into chart specs for a dashboard tool.

Columns: ${COLS.map(c=>`${c.name} (${c.type})`).join(', ')}
Sample rows:
${DATA.slice(0,3).map(r=>JSON.stringify(r)).join('\n')}

Request: "${q}"

Reply with ONLY a JSON object, no fences, no commentary:
{"type":"bar|stack|stack100|hbar|line|area|combo|table|pie|doughnut|radar|scatter|map|choropleth|bar3d|scatter3d|surface3d","x":"<group-by column>","y":"<numeric column or null>","y2":"<second numeric column for combo, else null>","z":"<numeric column for 3D points else null>","lat":"<latitude column for map else null>","lon":"<longitude column for map else null>","agg":"sum|avg|count|min|max|pct","agg2":"sum|avg|count|min|max","series":"<split column or null>","dateGroup":"raw|month|quarter|year","sort":"auto|value-desc|value-asc|label-asc|label-desc","topN":0,"compare":"none|prev","target":null,"cf":"none|bars|scale|arrows","analytics":{"avg":false,"trend":false},"numfmt":"auto|currency|int|pct1","title":"<short title>"}

Rules:
- x, y, y2, z, lat, lon, series must be exact column names or null.
- Use line or area when x is a date column; set dateGroup to month unless another rollup is asked for.
- Use stack when the request says stacked, stack100 for share or percentage mix.
- Use combo when two different measures are requested together; put the second in y2.
- Use table when the request asks for a table, list, or raw numbers. Set cf to bars when it asks to highlight or rank cells visually.
- Use map when the request mentions a map, locations, or geography and latitude and longitude columns exist.
- Use choropleth when the request mentions states, regions, or countries and a code column exists.
- Set analytics.avg or analytics.trend to true when the request asks for an average line or a trend line.
- Use count with y=null for how-many questions; pct for share-of-total.
- topN is a number, 0 means show everything. Set it when the request says top N.
- compare is "prev" when the request mentions versus last month, prior period, or year over year.
- target is a number only when the request names a goal.
- numfmt currency when the value is money.
- Only use a 3d type when the request explicitly says 3D.
- Title under 6 words.`;
  const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})});
  if(!res.ok) throw new Error('api');
  const data=await res.json();
  const txt=data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  const m=txt.replace(/```json|```/g,'').trim().match(/\{[\s\S]*\}/);
  return JSON.parse(m?m[0]:txt);
}
export function offlineSpec(q){
  const s=q.toLowerCase(), n=numCols(), c=COLS.filter(x=>x.type==='category'), d=dateCols();
  const hit=l=>l.find(x=>s.includes(x.name.toLowerCase()));
  let type='bar';
  if(/\bline\b|trend|over time|monthly/.test(s)) type='line';
  if(/\barea\b/.test(s)) type='area';
  if(/stacked|stack/.test(s)) type='stack';
  if(/100%|share of|percentage mix|mix/.test(s)) type='stack100';
  if(/combo|and.*line|two measures/.test(s)) type='combo';
  if(/\btable\b|list|raw numbers/.test(s)) type='table';
  if(/\bmap\b|location|geograph|where/.test(s)&&guessLat()&&guessLon()) type='map';
  if(/by state|per state|choropleth|region map/.test(s)) type='choropleth';
  if(/\bpie\b|breakdown/.test(s)) type='pie';
  if(/donut|doughnut/.test(s)) type='doughnut';
  if(/radar|spider/.test(s)) type='radar';
  if(/horizontal|ranked/.test(s)) type='hbar';
  if(/3d|three.d/.test(s)) type=/scatter|point/.test(s)?'scatter3d':'bar3d';
  let agg='sum';
  if(/average|avg|mean/.test(s)) agg='avg';
  if(/count|how many|number of/.test(s)) agg='count';
  if(/max|highest|peak/.test(s)) agg='max';
  if(/min|lowest/.test(s)) agg='min';
  if(/% of|percent of|share of/.test(s)) agg='pct';
  const topM=s.match(/top\s+(\d+)/);
  const y=agg==='count'?null:((hit(n)||n[0]||{}).name||null);
  const x=(hit(d)||hit(c)||d[0]||c[0]||COLS[0]).name;
  const sp=c.filter(k=>k.name!==x&&s.includes(k.name.toLowerCase()))[0];
  const y2=n.filter(k=>k.name!==y&&s.includes(k.name.toLowerCase()))[0];
  return {type,x,y,y2:y2?y2.name:null,z:(n[1]||{}).name||null,agg,agg2:'sum',
    lat:guessLat(), lon:guessLon(), geoMode:'USA-states',
    analytics:{avg:/average line|show average/.test(s), trend:/trend ?line|trendline/.test(s)},
    cf:/data bars|highlight/.test(s)?'bars':'none',
    series:sp?sp.name:null, dateGroup:colTypeOf(x)==='date'?'month':'raw',
    sort:'auto', topN:topM?+topM[1]:0, compare:/last month|prior|previous|year over year/.test(s)?'prev':'none',
    target:null, numfmt:/revenue|sales|price|cost|amount|\$/.test(s)?'currency':'auto',
    title:`${agg==='count'?'Count':(y||'Value')} by ${x}`};
}
export function clean(spec){
  const names=COLS.map(c=>c.name), fix=v=>names.includes(v)?v:null;
  const all=[...T2D,...TGEO,...T3D].map(t=>t[0]);
  spec.x=fix(spec.x)||(dateCols()[0]||catCols()[0]||COLS[0]).name;
  spec.y=fix(spec.y); spec.y2=fix(spec.y2); spec.z=fix(spec.z); spec.series=fix(spec.series);
  spec.lat=fix(spec.lat); spec.lon=fix(spec.lon);
  if(spec.series===spec.x) spec.series=null;
  if(!all.includes(spec.type)) spec.type='bar';
  if(is3D(spec.type)&&!PLOT) spec.type='bar';
  if(isGeo(spec.type)&&!PLOT) spec.type='bar';
  if(spec.type==='map'){ if(!spec.lat) spec.lat=guessLat(); if(!spec.lon) spec.lon=guessLon();
    if(!spec.lat||!spec.lon) spec.type='bar'; }
  if(spec.type==='choropleth'&&!GEOMODE.map(g=>g[0]).includes(spec.geoMode)) spec.geoMode='USA-states';
  if(!spec.analytics||typeof spec.analytics!=='object') spec.analytics={};
  if(!CFMODES.map(c=>c[0]).includes(spec.cf)) spec.cf='none';
  if(!spec.y&&spec.agg!=='count') spec.agg='count';
  if(spec.type==='scatter3d'&&!spec.z) spec.z=(numCols()[1]||{}).name||spec.y;
  if(spec.type==='combo'&&!spec.y2) spec.y2=(numCols().find(n=>n.name!==spec.y)||{}).name||null;
  if(['pie','doughnut'].includes(spec.type)) spec.series=null;
  if(isStack(spec.type)&&!spec.series) spec.series=(catCols().find(c=>c.name!==spec.x)||{}).name||null;
  if(!['sum','avg','count','min','max','pct'].includes(spec.agg)) spec.agg='sum';
  if(!['auto','currency','int','pct1'].includes(spec.numfmt)) spec.numfmt='auto';
  if(spec.agg==='pct') spec.numfmt='pct1';
  if(!DGROUP.map(d=>d[0]).includes(spec.dateGroup)) spec.dateGroup=colTypeOf(spec.x)==='date'?'month':'raw';
  if(!SORTS.map(s=>s[0]).includes(spec.sort)) spec.sort='auto';
  spec.topN=Math.max(0,Math.min(25,+spec.topN||0));
  if(spec.target!=null&&!isFinite(+spec.target)) spec.target=null;
  if(spec.target!=null) spec.target=+spec.target;
  spec.title=(spec.title||'Chart').slice(0,52);
  return spec;
}
