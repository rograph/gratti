/** Picks the renderer for a chart block and clears whatever was there before. */
import { PLOT } from '../libs.js';
import { is3D, isGeo } from '../core/pipeline.js';
import { drawTable } from './table.js';
import { draw2D } from './chart2d.js';
import { drawGeo } from './geo.js';
import { draw3D } from './three.js';

export { renderStatic } from './staticblocks.js';
export { renderCard } from './card.js';
export { renderSlicer } from './slicer.js';
export { guessLat, guessLon } from './geo.js';

export function draw(id,spec){
  const wrap=document.getElementById('w-'+id); if(!wrap) return;
  const prev=Chart.getChart('cv-'+id); if(prev) prev.destroy();
  if(PLOT) try{Plotly.purge('pl-'+id);}catch(e){}
  wrap.className='plot-wrap'+(spec.type==='table'?' scrolls':'');
  wrap.style.height=spec.h+'px';
  wrap.innerHTML='';
  if(spec.type==='table') return drawTable(id,spec,wrap);
  if(isGeo(spec.type)) return drawGeo(id,spec,wrap);
  if(is3D(spec.type)) return draw3D(id,spec,wrap);
  draw2D(id,spec,wrap);
}
