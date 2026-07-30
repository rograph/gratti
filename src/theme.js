/**
 * The palette registry and the live theme.
 *
 * applyTheme() stays in main.js: it writes CSS custom properties and redraws
 * the board, which is page work. This module holds only the values.
 */

export const THEMES = {
  indigo:{name:'Indigo', accent:'#3D3AF5',
    pal:['#3D3AF5','#00BFA6','#9B5DE5','#FFB627','#FF5D73','#00A3FF','#5D6BFF','#FF8A4C']},
  teal:{name:'Teal', accent:'#0E9A8A',
    pal:['#0E9A8A','#2E7DD1','#7BC950','#F4A261','#E76F63','#5C6F7E','#37B3A0','#C2A83E']},
  plum:{name:'Plum', accent:'#7B3FD4',
    pal:['#7B3FD4','#E5487F','#26A0A8','#F2A43B','#4B5CC4','#8FB339','#C55FA6','#E0714A']},
  slate:{name:'Slate', accent:'#334155',
    pal:['#334155','#2E7DD1','#0E9A8A','#C2853A','#B4535F','#6B7B8C','#4C6B8A','#8A9BAA']},
  amber:{name:'Amber', accent:'#C9721A',
    pal:['#C9721A','#2F6F8F','#7A9E3F','#B03F55','#5C5470','#D9A441','#3F8F7A','#A8552E']},
  ink:{name:'Ink', accent:'#0B1220',
    pal:['#0B1220','#3D3AF5','#00BFA6','#FFB627','#FF5D73','#7C889D','#5D6BFF','#00A3FF']}
};
export let THEME = {key:'indigo', accent:THEMES.indigo.accent, pal:[...THEMES.indigo.pal], logo:null, hideBrand:false};
export let PAL = [...THEME.pal];

/** Replace the whole theme. Callers redraw; this only stores. */
export const setTheme = v => { THEME = v; };

/** The active series palette, derived from the theme on apply. */
export const setPal = v => { PAL = v; };
