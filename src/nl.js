/**
 * Turning a plain-language request into a chart spec, and a fresh
 * spreadsheet into a suggested set of them.
 *
 * Two paths produce specs and one guard cleans them. `askAI` and
 * `askAISuggest` ask the model; `offlineSpec` and `offlineSuggest` work from
 * the real column names and types when there is no endpoint to reach. Either
 * way `clean()` runs last, so a spec that names a column that does not
 * exist, or a visual the libraries cannot draw, comes back as something
 * renderable instead of a broken block.
 *
 * No DOM. main.js owns the input box and the status line.
 */
import { DATA, COLS, numCols, catCols, dateCols, metricCols, colTypeOf, guessLat, guessLon } from './state.js';
import { PLOT } from './libs.js';
import { is3D, isGeo, isStack } from './core/pipeline.js';
import { T2D, T3D, TGEO, CFMODES, GEOMODE, DGROUP, SORTS } from './registries.js';

/* The spec shape and its rules, shared by both prompts so the two model
   paths can never drift apart. */
const SPEC_SHAPE=`{"type":"bar|stack|stack100|hbar|line|area|combo|table|pie|doughnut|radar|scatter|map|choropleth|bar3d|scatter3d|surface3d","x":"<group-by column>","y":"<numeric column or null>","y2":"<second numeric column for combo, else null>","z":"<numeric column for 3D points else null>","lat":"<latitude column for map else null>","lon":"<longitude column for map else null>","agg":"sum|avg|count|min|max|pct","agg2":"sum|avg|count|min|max","series":"<split column or null>","dateGroup":"raw|month|quarter|year","sort":"auto|value-desc|value-asc|label-asc|label-desc","topN":0,"compare":"none|prev","target":null,"cf":"none|bars|scale|arrows","analytics":{"avg":false,"trend":false},"numfmt":"auto|currency|int|pct1","title":"<short title>"}`;
const SPEC_RULES=`- x, y, y2, z, lat, lon, series must be exact column names or null.
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
const schemaLines=()=>`Columns: ${COLS.map(c=>`${c.name} (${c.type})`).join(', ')}
Sample rows:
${DATA.slice(0,3).map(r=>JSON.stringify(r)).join('\n')}`;

async function callModel(prompt){
  const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2000,messages:[{role:'user',content:prompt}]})});
  if(!res.ok) throw new Error('api');
  const data=await res.json();
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
}

export async function askAI(q){
  const prompt=`You turn plain-language requests into chart specs for a dashboard tool.

${schemaLines()}

Request: "${q}"

Reply with ONLY a JSON object, no fences, no commentary:
${SPEC_SHAPE}

Rules:
${SPEC_RULES}`;
  const txt=await callModel(prompt);
  const m=txt.replace(/```json|```/g,'').trim().match(/\{[\s\S]*\}/);
  return JSON.parse(m?m[0]:txt);
}

/* Ask the model to design a starter dashboard from the schema alone.
   Returns an array of raw specs; the caller cleans each one. */
export async function askAISuggest(){
  const prompt=`You design a starter dashboard from a spreadsheet a small-business client just uploaded.

${schemaLines()}

Reply with ONLY a JSON array of 4 to 6 chart spec objects, no fences, no commentary. Each spec:
${SPEC_SHAPE}

Rules:
${SPEC_RULES}
- Propose a varied, useful starter set: a trend over time when a date column exists, a ranked comparison, a composition split across two categories, a map when coordinate columns exist, and a table with data bars for detail.
- Never use a 3D type here.
- No two specs may share both the same type and the same x.
- Never use latitude or longitude as y.`;
  const txt=await callModel(prompt);
  const m=txt.replace(/```json|```/g,'').trim().match(/\[[\s\S]*\]/);
  const arr=JSON.parse(m?m[0]:txt);
  if(!Array.isArray(arr)||!arr.length) throw new Error('shape');
  return arr;
}

/* The same idea with no model: read the schema and propose the obvious
   starter set. Order is deliberate, trend first, detail last. */
export function offlineSuggest(){
  const m=metricCols(), c=COLS.filter(x=>x.type==='category'), d=dateCols();
  const money=n=>n&&/revenue|sales|price|cost|amount|total|profit|spend/i.test(n)?'currency':'auto';
  /* Lead with the money column when there is one. A dashboard that opens on
     Revenue reads better than one that opens on Units. */
  const first=m.find(k=>money(k.name)==='currency')||m[0];
  const y=(first||{}).name||null, agg=y?'sum':'count';
  const second=m.find(k=>k!==first);
  const specs=[];
  if(d[0]&&y) specs.push({type:'line',x:d[0].name,y,agg:'sum',dateGroup:'month',
    analytics:{trend:true},numfmt:money(y),title:`${y} by month`});
  if(c[0]) specs.push({type:'bar',x:c[0].name,y,agg,sort:'value-desc',topN:10,
    numfmt:money(y),title:y?`Top ${c[0].name} by ${y}`:`Rows by ${c[0].name}`});
  if(c[0]&&c[1]&&y) specs.push({type:'stack',x:c[0].name,y,agg:'sum',series:c[1].name,
    numfmt:money(y),title:`${y} by ${c[0].name} and ${c[1].name}`});
  if(d[0]&&y&&second) specs.push({type:'combo',x:d[0].name,y,y2:second.name,agg:'sum',agg2:'sum',
    dateGroup:'month',numfmt:money(y),title:`${y} and ${second.name}`});
  if(guessLat()&&guessLon()&&c[0]&&y) specs.push({type:'map',
    x:(c.find(k=>/city|location|store|site|branch|region/i.test(k.name))||c[0]).name,
    y,agg:'sum',lat:guessLat(),lon:guessLon(),numfmt:money(y),title:`${y} by location`});
  if(c[0]&&y) specs.push({type:'table',x:c[0].name,y,agg:'sum',cf:'bars',
    numfmt:money(y),title:`${y} by ${c[0].name} detail`});
  if(!specs.length&&COLS.length) specs.push({type:'bar',x:(d[0]||c[0]||COLS[0]).name,y,agg,
    numfmt:money(y),title:'Overview'});
  return specs.slice(0,6);
}
export function offlineSpec(q){
  const s=q.toLowerCase(), n=numCols(), c=COLS.filter(x=>x.type==='category'), d=dateCols();
  /* Match column names on word boundaries, not as substrings. "Venue" sits
     inside "revenue", so a plain includes() split every revenue chart by
     venue. Any column whose name is a fragment of a common word has the same
     problem, so this is a correctness fix rather than a nicety. */
  const mentions=name=>new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(s);
  const hit=l=>l.find(x=>mentions(x.name));
  let type='bar';
  if(/\bline\b|trend|over time|monthly/.test(s)) type='line';
  if(/\barea\b/.test(s)) type='area';
  if(/stacked|stack/.test(s)) type='stack';
  if(/100%|share of|percentage mix|mix/.test(s)) type='stack100';
  if(/combo|and.*line|two measures/.test(s)) type='combo';
  if(/\btable\b|list|raw numbers/.test(s)) type='table';
  /* Geography is a weak signal: "location" and "state" show up incidentally
     in requests that name their type outright. Only reach for a map when
     nothing more explicit matched. */
  if(type==='bar'&&/\bmap\b|location|geograph|where/.test(s)&&guessLat()&&guessLon()) type='map';
  if(type==='bar'&&/by state|per state|choropleth|region map/.test(s)) type='choropleth';
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
  const sp=c.filter(k=>k.name!==x&&mentions(k.name))[0];
  const y2=n.filter(k=>k.name!==y&&mentions(k.name))[0];
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
