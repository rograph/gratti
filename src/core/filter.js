/**
 * Row filtering: the single predicate that the filter strip, cross-filter,
 * and slicer blocks all feed into. Pure; caller passes all state.
 *
 * filters: [{col, val}]        val '__all__' means inactive
 * cross:   {col, val} | null   click-selection from a chart
 * slicers: [{col, picked: []}] empty picked means inactive
 * skipCol: chart's own x column keeps its bars when it owns the cross-filter
 * skipSlicerIdx: index of the slicer being interacted with, excluded so its
 *                own list does not filter itself
 */
export function filterRows(data, { filters = [], cross = null, slicers = [], skipCol = null, skipSlicerIdx = -1 } = {}) {
  const active = slicers.filter((s, i) =>
    i !== skipSlicerIdx && s.col && Array.isArray(s.picked) && s.picked.length);
  return data.filter(r => {
    if (!filters.every(f => f.val === '__all__' || String(r[f.col]) === String(f.val))) return false;
    if (cross && cross.col !== skipCol && String(r[cross.col]) !== String(cross.val)) return false;
    for (const s of active) {
      if (!s.picked.includes(String(r[s.col]))) return false;
    }
    return true;
  });
}
