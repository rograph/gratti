/**
 * Which CDN libraries actually made it, and the one-time Chart.js setup.
 *
 * Importing this module registers the `analytics` plugin as a side effect,
 * so main.js imports it before anything draws. The flags let the renderers
 * show a message instead of throwing when a library is missing.
 */

export const LIBS = typeof Chart !== 'undefined' && typeof Papa !== 'undefined';
export const PLOT = typeof Plotly !== 'undefined';
export const DLAB = typeof ChartDataLabels !== 'undefined';

if(LIBS){
  Chart.defaults.font.family="'Instrument Sans', system-ui, sans-serif";
  Chart.defaults.font.size=11.5;
  Chart.defaults.color='#7C889D';
  if(DLAB){ Chart.register(ChartDataLabels); Chart.defaults.plugins.datalabels.display=false; }
  /* reference lines: target, average, min, max, and a least-squares trend */
  Chart.register({
    id:'analytics',
    afterDatasetsDraw(chart,args,opts){
      const list=(opts&&opts.lines)||[];
      if(!list.length&&!(opts&&opts.trend)) return;
      const {ctx,chartArea:ca,scales}=chart;
      const horiz=chart.options.indexAxis!=='y';
      const vs=horiz?scales.y:scales.x;
      if(!vs) return;
      ctx.save();
      list.forEach(ln=>{
        if(ln.value==null||!isFinite(ln.value)) return;
        const p=vs.getPixelForValue(ln.value);
        ctx.strokeStyle=ln.color; ctx.lineWidth=1.6;
        ctx.setLineDash(ln.dash||[5,4]);
        ctx.beginPath();
        if(horiz){ ctx.moveTo(ca.left,p); ctx.lineTo(ca.right,p); }
        else{ ctx.moveTo(p,ca.top); ctx.lineTo(p,ca.bottom); }
        ctx.stroke(); ctx.setLineDash([]);
        if(!ln.label) return;
        ctx.font="500 10px 'JetBrains Mono', monospace";
        const w=ctx.measureText(ln.label).width+12;
        ctx.fillStyle=ln.color;
        if(horiz){
          const x=ca.right-w-2, y=Math.max(ca.top+1,Math.min(ca.bottom-15,p-16));
          ctx.beginPath(); ctx.roundRect(x,y,w,14,4); ctx.fill();
          ctx.fillStyle='#fff'; ctx.fillText(ln.label,x+6,y+10.5);
        }else{
          ctx.beginPath(); ctx.roundRect(p+3,ca.top+2,w,14,4); ctx.fill();
          ctx.fillStyle='#fff'; ctx.fillText(ln.label,p+9,ca.top+12.5);
        }
      });
      const tr=opts&&opts.trend;
      if(tr&&tr.a!=null&&horiz){
        const xs=scales.x;
        ctx.strokeStyle=tr.color; ctx.lineWidth=2; ctx.setLineDash([7,5]);
        ctx.beginPath();
        const n=tr.n-1;
        ctx.moveTo(xs.getPixelForValue(0), vs.getPixelForValue(tr.b));
        ctx.lineTo(xs.getPixelForValue(n), vs.getPixelForValue(tr.a*n+tr.b));
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
  });
}
