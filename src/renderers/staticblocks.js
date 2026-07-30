/** Text and image blocks, and the dispatcher for every non-chart block. */
import { find, VIEWER } from '../state.js';
import { esc } from '../core/format.js';
import { scheduleAutosave } from '../actions.js';
import { renderCard } from './card.js';
import { renderSlicer } from './slicer.js';

export function renderStatic(id){
  const b=find(id), w=document.getElementById('w-'+id); if(!b||!w) return;
  if(b.kind==='card') return renderCard(id,b,w);
  if(b.kind==='slicer') return renderSlicer(id,b,w);
  if(b.kind==='text'){
    w.innerHTML=`<div class="tb ${b.spec.align==='center'?'center':''}">
      <div class="tb-head" contenteditable="${!VIEWER}" spellcheck="false" data-th="${id}">${esc(b.spec.heading||'')}</div>
      <div class="tb-body" contenteditable="${!VIEWER}" spellcheck="false" data-tx="${id}">${esc(b.spec.body||'')}</div></div>`;
    w.querySelector(`[data-th="${id}"]`).addEventListener('blur',e=>{ b.spec.heading=e.target.textContent; scheduleAutosave(); });
    w.querySelector(`[data-tx="${id}"]`).addEventListener('blur',e=>{ b.spec.body=e.target.textContent; scheduleAutosave(); });
  }else{
    w.className='plot-wrap imgbox'+(b.spec.fit==='cover'?' cover':'');
    w.style.height=b.spec.h+'px';
    w.innerHTML=b.spec.src?`<img src="${b.spec.src}" alt="${esc(b.spec.alt||'')}">`
      :`<div class="ph">No image yet.<br>Add one from the panel on the right.</div>`;
  }
}
