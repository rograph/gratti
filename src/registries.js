/**
 * Static option lists and the inline icon set.
 *
 * Every dropdown, toggle row, and visual-type button in the panel reads from
 * here, and clean() validates incoming specs against the same lists, so a
 * chart type the UI cannot offer can never be saved either. Pairs are
 * [value, label] in the order they should appear.
 */

export const ICON = {
  bar:'<rect x="3" y="9" width="3.4" height="10" rx="1"/><rect x="8.3" y="5" width="3.4" height="14" rx="1"/><rect x="13.6" y="12" width="3.4" height="7" rx="1"/>',
  stack:'<rect x="3.5" y="12" width="4" height="7" rx="1"/><rect x="3.5" y="7.5" width="4" height="4" rx="1" opacity=".5"/><rect x="9.5" y="9" width="4" height="10" rx="1"/><rect x="9.5" y="4.5" width="4" height="4" rx="1" opacity=".5"/><rect x="15.5" y="13" width="4" height="6" rx="1"/><rect x="15.5" y="8.5" width="4" height="4" rx="1" opacity=".5"/>',
  stack100:'<rect x="3.5" y="4" width="4" height="15" rx="1.2" opacity=".45"/><rect x="3.5" y="11" width="4" height="8" rx="1.2"/><rect x="9.5" y="4" width="4" height="15" rx="1.2" opacity=".45"/><rect x="9.5" y="9" width="4" height="10" rx="1.2"/><rect x="15.5" y="4" width="4" height="15" rx="1.2" opacity=".45"/><rect x="15.5" y="13" width="4" height="6" rx="1.2"/>',
  hbar:'<rect x="3" y="4" width="12" height="3.2" rx="1"/><rect x="3" y="9.4" width="16" height="3.2" rx="1"/><rect x="3" y="14.8" width="8" height="3.2" rx="1"/>',
  line:'<path d="M3 15l4.5-5 4 3L19 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  area:'<path d="M3 16l4.5-5 4 3L19 6v10z"/>',
  combo:'<rect x="3.2" y="11" width="3.6" height="8" rx="1"/><rect x="9.2" y="13" width="3.6" height="6" rx="1"/><rect x="15.2" y="9" width="3.6" height="10" rx="1"/><path d="M5 8l6 3 6-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  pie:'<path d="M11 3a8 8 0 108 8h-8z"/><path d="M13 2.4A8 8 0 0119.6 9H13z" opacity=".45"/>',
  doughnut:'<path d="M11 3a8 8 0 108 8h-4a4 4 0 11-4-4z"/>',
  radar:'<path d="M11 3l7 5-2.7 8.4H6.7L4 8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M11 7l3.4 2.4-1.3 4H8.9l-1.3-4z"/>',
  scatter:'<circle cx="5.5" cy="15" r="1.9"/><circle cx="10" cy="8.5" r="1.9"/><circle cx="15" cy="12" r="1.9"/><circle cx="17.5" cy="6" r="1.9"/>',
  table:'<rect x="3" y="4.5" width="16" height="13" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.8h16M3 13.1h16M9.4 4.5v13" stroke="currentColor" stroke-width="1.4"/>',
  map:'<path d="M3 6.2 8 4.4v11.4L3 17.6z" opacity=".45"/><path d="M8 4.4l6 1.9v11.3L8 15.8z" opacity=".7"/><path d="M14 6.3l5-1.9v11.4l-5 1.8z" opacity=".45"/><circle cx="11" cy="9.4" r="2.3"/>',
  choropleth:'<path d="M3.5 5.5h7v6h-7z" opacity=".8"/><path d="M10.5 5.5h8v3.4h-8z" opacity=".45"/><path d="M10.5 8.9h8v6.2h-8z" opacity=".65"/><path d="M3.5 11.5h7v5h-7z" opacity=".35"/>',
  bar3d:'<path d="M4 10l3-1.6L10 10v7l-3 1.6L4 17z"/><path d="M9 6.5L12 5l3 1.5v10.5l-3 1.5-3-1.5z" opacity=".62"/><path d="M14 9l3-1.5 3 1.5v8l-3 1.5-3-1.5z" opacity=".38"/>',
  scatter3d:'<path d="M11 3l8 4.5v9L11 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="10" r="1.6"/><circle cx="14" cy="13" r="1.6"/><circle cx="12" cy="7.5" r="1.4"/>',
  surface3d:'<path d="M3 14l5-4 4 2.6 5-4.6 2 1.4v5.2l-8 4.4-8-4.4z" opacity=".55"/><path d="M3 13.6l5-4 4 2.6 5-4.6 2 1.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>'
};
export const T2D=[['bar','Column'],['stack','Stacked'],['stack100','100%'],['hbar','Bar'],
           ['line','Line'],['area','Area'],['combo','Combo'],['table','Table'],
           ['pie','Pie'],['doughnut','Donut'],['radar','Radar'],['scatter','Scatter']];
export const T3D=[['bar3d','3D Col'],['scatter3d','3D Points'],['surface3d','3D Surface']];
export const TGEO=[['map','Bubble map'],['choropleth','Region map']];
export const CFMODES=[['none','None'],['bars','Data bars'],['scale','Colour scale'],['arrows','Up/down arrows']];
export const LINES=[['avg','Average'],['min','Minimum'],['max','Maximum'],['trend','Trend']];
export const GEOMODE=[['USA-states','US states'],['country names','Countries'],['ISO-3','Country codes']];
export const AGGS=[['sum','Sum'],['avg','Average'],['count','Count'],['min','Minimum'],['max','Maximum'],['pct','% of total']];
export const FMTS=[['auto','Auto'],['currency','Currency'],['int','Whole number'],['pct1','Percent']];
export const DGROUP=[['raw','Exact date'],['month','Month'],['quarter','Quarter'],['year','Year']];
export const SORTS=[['auto','Automatic'],['value-desc','Value, high to low'],['value-asc','Value, low to high'],
             ['label-asc','Label A-Z'],['label-desc','Label Z-A']];

/* Layout bounds. The pane's sliders and the canvas resize logic must agree
   on these, so they live here rather than in either module. */
export const SPAN_MIN=3, SPAN_MAX=12, H_MIN=120, H_MAX=760;
