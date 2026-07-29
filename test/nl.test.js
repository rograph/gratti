import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/state.js';
import { offlineSpec, clean } from '../src/nl.js';

const COLS = [
  { name: 'Month', type: 'date' },
  { name: 'Location', type: 'category' },
  { name: 'Channel', type: 'category' },
  { name: 'Latitude', type: 'number' },
  { name: 'Longitude', type: 'number' },
  { name: 'Units', type: 'number' },
  { name: 'Revenue', type: 'number' }
];

beforeEach(() => {
  S.setDataset({ data: [{ Month: '2026-01', Location: 'Delray', Revenue: 10 }], cols: COLS });
});

describe('offlineSpec picks a visual from the wording', () => {
  const type = q => offlineSpec(q).type;

  it('defaults to a column chart', () => {
    expect(type('revenue by channel')).toBe('bar');
  });

  it.each([
    ['revenue over time', 'line'],
    ['revenue as an area chart', 'area'],
    ['revenue by channel stacked', 'stack'],
    ['100% revenue by channel', 'stack100'],
    ['revenue and units as a combo chart', 'combo'],
    ['revenue as a table', 'table'],
    ['revenue breakdown', 'pie'],
    ['revenue as a donut', 'doughnut'],
    ['revenue radar', 'radar'],
    ['revenue ranked', 'hbar'],
    ['revenue by channel in 3d', 'bar3d'],
    ['revenue 3d scatter', 'scatter3d'],
    ['revenue per state', 'choropleth']
  ])('%s -> %s', (q, want) => expect(type(q)).toBe(want));

  it('only reaches for a map when latitude and longitude exist', () => {
    expect(type('revenue by location on a map')).toBe('map');
    S.setDataset({ data: [], cols: COLS.filter(c => c.name !== 'Latitude') });
    expect(type('revenue on a map')).not.toBe('map');
  });

  /*
   * KNOWN BUG, pinned so a fix shows up as a failing test.
   *
   * The rules run in order and the last match wins, and the map rule matches
   * the bare word "location". So an incidental mention of location beats an
   * explicit request for a table or a stack. Asking for "revenue by location
   * as a table" gets you a bubble map.
   *
   * The one-line fix is to only consider map and choropleth when nothing
   * more explicit matched: `if (type === 'bar' && /.../.test(s))`.
   */
  it('lets an incidental "location" override an explicit chart type', () => {
    expect(type('revenue by location as a table')).toBe('map');
    expect(type('revenue by location stacked by channel')).toBe('map');
  });
});

describe('offlineSpec reads the rest of the request', () => {
  it.each([
    ['average revenue by location', 'avg'],
    ['how many rows by location', 'count'],
    ['highest revenue by location', 'max'],
    ['lowest revenue by location', 'min'],
    ['share of revenue by location', 'pct']
  ])('%s -> agg %s', (q, want) => expect(offlineSpec(q).agg).toBe(want));

  it('drops the measure for a count', () => {
    expect(offlineSpec('how many by location').y).toBeNull();
  });

  it('matches columns the request names, and falls back when it names none', () => {
    expect(offlineSpec('units by channel')).toMatchObject({ x: 'Channel', y: 'Units' });
    expect(offlineSpec('show me something')).toMatchObject({ x: 'Month', y: 'Latitude' });
  });

  it('splits by a second category, never by the one on the axis', () => {
    expect(offlineSpec('revenue by location split by channel').series).toBe('Channel');
    expect(offlineSpec('revenue by location').series).toBeNull();
  });

  it('reads top N, and leaves it at zero otherwise', () => {
    expect(offlineSpec('top 5 location by revenue').topN).toBe(5);
    expect(offlineSpec('location by revenue').topN).toBe(0);
  });

  it('turns on the analytics lines only when asked', () => {
    expect(offlineSpec('revenue by month with a trend line').analytics).toEqual({ avg: false, trend: true });
    expect(offlineSpec('revenue by month show average').analytics).toEqual({ avg: true, trend: false });
  });

  it('formats money as currency and asks for the prior period', () => {
    const s = offlineSpec('revenue by month versus last month');
    expect(s.numfmt).toBe('currency');
    expect(s.compare).toBe('prev');
  });

  it('rolls a date axis up to month', () => {
    expect(offlineSpec('revenue by month').dateGroup).toBe('month');
    expect(offlineSpec('revenue by location').dateGroup).toBe('raw');
  });
});

describe('clean guards whatever the model sends back', () => {
  const base = () => ({ type: 'bar', x: 'Location', y: 'Revenue', agg: 'sum', analytics: {} });

  it('nulls columns that do not exist and picks a real axis', () => {
    const s = clean({ ...base(), x: 'Nope', y: 'AlsoNope', series: 'Ghost' });
    expect(s.x).toBe('Month');
    expect(s.y).toBeNull();
    expect(s.series).toBeNull();
  });

  it('refuses to split a chart by its own axis', () => {
    expect(clean({ ...base(), series: 'Location' }).series).toBeNull();
  });

  it('falls back to a column chart for an unknown type', () => {
    expect(clean({ ...base(), type: 'sankey' }).type).toBe('bar');
  });

  it('downgrades 3D and maps when Plotly is missing', () => {
    expect(clean({ ...base(), type: 'bar3d' }).type).toBe('bar');
    expect(clean({ ...base(), type: 'choropleth' }).type).toBe('bar');
  });

  it('drops the series on a pie, and invents one for a stack', () => {
    expect(clean({ ...base(), type: 'pie', series: 'Channel' }).series).toBeNull();
    expect(clean({ ...base(), type: 'stack' }).series).toBe('Month');
  });

  it('switches to count when there is no measure left', () => {
    expect(clean({ ...base(), y: 'Nope' }).agg).toBe('count');
  });

  it('validates the aggregation and the number format', () => {
    expect(clean({ ...base(), agg: 'median' }).agg).toBe('sum');
    expect(clean({ ...base(), numfmt: 'scientific' }).numfmt).toBe('auto');
    expect(clean({ ...base(), agg: 'pct', numfmt: 'currency' }).numfmt).toBe('pct1');
  });

  it('clamps top N into range', () => {
    expect(clean({ ...base(), topN: 500 }).topN).toBe(25);
    expect(clean({ ...base(), topN: -3 }).topN).toBe(0);
    expect(clean({ ...base(), topN: 'lots' }).topN).toBe(0);
  });

  it('keeps a numeric target and discards anything else', () => {
    expect(clean({ ...base(), target: '250' }).target).toBe(250);
    expect(clean({ ...base(), target: 'soon' }).target).toBeNull();
  });

  it('defaults the rollup from the axis type', () => {
    expect(clean({ ...base(), x: 'Month', dateGroup: 'fortnight' }).dateGroup).toBe('month');
    expect(clean({ ...base(), x: 'Location', dateGroup: 'fortnight' }).dateGroup).toBe('raw');
  });

  it('repairs a missing analytics object and a missing sort', () => {
    const s = clean({ ...base(), analytics: 'yes', sort: 'random' });
    expect(s.analytics).toEqual({});
    expect(s.sort).toBe('auto');
  });

  it('caps the title', () => {
    expect(clean({ ...base(), title: 'x'.repeat(200) }).title).toHaveLength(52);
    expect(clean({ ...base(), title: '' }).title).toBe('Chart');
  });
});
