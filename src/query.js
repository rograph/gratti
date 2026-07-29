/**
 * The page's view of its data.
 *
 * `rows()` is the single predicate every block filters through. The three
 * adapters feed the current rows and schema into the pure pipeline in core/,
 * so the call sites stay short. `analyticsOpts` turns the core's plain
 * numbers into something Chart.js can draw.
 *
 * No DOM here. This module is the seam between state and the renderers.
 */
import { DATA, COLS, BLOCKS, FILTERS, CROSS } from './state.js';
import { filterRows } from './core/filter.js';
import {
  bucket as bucketRows, aggregate as aggregateRows,
  alignedSeries as alignedSeriesFor, analytics
} from './core/pipeline.js';
import { fmtVal } from './core/format.js';

/* the one row predicate: filter strip + cross-filter + slicer blocks */
export function rows(skipCol,skipSlicer){
  return filterRows(DATA,{
    filters:FILTERS, cross:CROSS, skipCol,
    slicers:BLOCKS.filter(b=>b.kind==='slicer'&&b.id!==skipSlicer).map(b=>b.spec)
  });
}

/* ==========================================================
   DATA PIPELINE — adapters over src/core/pipeline.js
   The core is pure and takes (rows, spec, cols). These wrappers
   supply the page's current rows and schema so the call sites
   below read the same as they always did.
   ========================================================== */
export const bucket=spec=>bucketRows(rows(spec.x),spec,COLS);
export const aggregate=spec=>aggregateRows(rows(spec.x),spec,COLS);
export const alignedSeries=(spec,labels,col,agg)=>alignedSeriesFor(rows(spec.x),spec,COLS,labels,col,agg);

/* ---------- analytics lines ---------- */
/* the math lives in core; colour, label, and dash stay here */
export const LINE_STYLE={
  target:{color:'#0B1220',label:'Target',dash:[5,4]},
  avg:{color:'#5B6A7D',label:'Avg',dash:[4,4]},
  min:{color:'#C0334A',label:'Min',dash:[2,3]},
  max:{color:'#1F7A4C',label:'Max',dash:[2,3]}
};
export function analyticsOpts(spec,matrix,fmtMode){
  const {lines,trend}=analytics(spec,matrix);
  return {
    lines:lines.map(l=>{
      const st=LINE_STYLE[l.kind];
      return {value:l.value,color:st.color,label:`${st.label} ${fmtVal(l.value,fmtMode)}`,dash:st.dash};
    }),
    trend:trend?{...trend,color:'#8A93A3'}:null
  };
}
