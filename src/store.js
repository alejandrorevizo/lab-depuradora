// Estado global: datos cargados, filtros, selección cruzada y utilidades de series.
import { isoToMs, addDays } from './ui/format.js';

const listeners = new Set();

export const state = {
  data: null,        // salida de parseWorkbook
  source: null,      // { mode: 'shared'|'session'|'history', fileName, uploadedAt, uploadedBy, pathname }
  storage: 'unknown',// 'blob' | 'none' | 'unknown'
  tab: 'resumen',
  filters: { from: null, to: null, preset: 'all', inst: [], point: [], param: [] },
  sel: { date: null },
};

let cache = null;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(reason) { for (const fn of listeners) fn(reason); }

export function setData(data, source) {
  state.data = data;
  state.source = source;
  cache = null;
  // Rango por defecto: todo el periodo con datos.
  const f = state.filters;
  if (!f.from || f.from < data.meta.dmin || f.from > data.meta.dmax) f.from = data.meta.dmin;
  if (!f.to || f.to > data.meta.dmax || f.to < data.meta.dmin || f.preset === 'all') f.to = data.meta.dmax;
  if (f.preset === 'all') f.from = data.meta.dmin;
  emit('data');
}

export function setFilters(patch, reason = 'filters') {
  Object.assign(state.filters, patch);
  cache = null;
  emit(reason);
}
export function selectDate(d) {
  state.sel.date = state.sel.date === d ? null : d;
  emit('sel');
}
/** Fija la fecha seleccionada sin alternar (sliders, flechas). No abre el detalle del día. */
export function setSelDate(d) { state.sel.date = d; emit('sel-quiet'); }
export function clearSelection() { state.sel.date = null; emit('sel'); }
export function setTab(tab) { state.tab = tab; emit('tab'); }

// ---------- Presets de fechas ----------
export const PRESETS = [
  { id: 'all', label: 'Todo' },
  { id: 'edari', label: 'Periodo EDARI' },
  { id: '90', label: '90 días' },
  { id: '30', label: '30 días' },
  { id: '7', label: '7 días' },
  { id: 'month', label: 'Mes actual' },
  { id: 'prevmonth', label: 'Mes anterior' },
];
export function presetRange(id) {
  const m = state.data.meta;
  const end = m.dmax;
  switch (id) {
    case 'all': return { from: m.dmin, to: m.dmax };
    case 'edari': return { from: m.edariMin || m.dmin, to: m.edariMax || m.dmax };
    case '90': case '30': case '7': return { from: maxIso(addDays(end, -(+id - 1)), m.dmin), to: end };
    case 'month': return { from: end.slice(0, 8) + '01', to: end };
    case 'prevmonth': {
      const [y, mo] = end.split('-').map(Number);
      const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1;
      const last = new Date(py, pm, 0).getDate();
      return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: `${py}-${String(pm).padStart(2, '0')}-${last}` };
    }
    default: return { from: m.dmin, to: m.dmax };
  }
}
const maxIso = (a, b) => (a > b ? a : b);

// ---------- Selectores ----------
function build() {
  const d = state.data;
  const f = state.filters;
  const values = d.records.filter((r) => r.v != null);
  const inRange = (r) => (!f.from || r.d >= f.from) && (!f.to || r.d <= f.to);
  const dim = (r) =>
    (!f.inst.length || f.inst.includes(r.inst)) &&
    (!f.point.length || f.point.includes(r.point)) &&
    (!f.param.length || f.param.includes(r.param));
  const ranged = values.filter(inRange);
  const filtered = ranged.filter(dim);
  const obsByDate = new Map();
  for (const o of d.obs) {
    if (!obsByDate.has(o.d)) obsByDate.set(o.d, []);
    obsByDate.get(o.d).push(o);
  }
  // Catálogo inst -> param -> point
  const catalog = {};
  for (const r of values) {
    const i = (catalog[r.inst] = catalog[r.inst] || {});
    const p = (i[r.param] = i[r.param] || { unit: r.unit, points: {} });
    p.points[r.point] = (p.points[r.point] || 0) + 1;
    if (!p.unit && r.unit) p.unit = r.unit;
  }
  cache = { values, ranged, filtered, obsByDate, catalog, inRange, dim };
  return cache;
}
export function sel() { return cache || build(); }

export const dimActive = () => {
  const f = state.filters;
  return f.inst.length || f.point.length || f.param.length;
};

/**
 * Serie diaria de un (inst, param, point). Varios valores el mismo día se promedian
 * (el tooltip muestra cuántos y cuáles). Devuelve [{ d, t, v, n, recs }].
 */
export function series({ inst, param, point, sheet, shift, ignoreRange = false, ignoreDims = true }) {
  const s = sel();
  const src = ignoreRange ? s.values : s.ranged;
  const groups = new Map();
  for (const r of src) {
    if (inst && r.inst !== inst) continue;
    if (param && r.param !== param) continue;
    if (point && r.point !== point) continue;
    if (sheet && r.sheet !== sheet) continue;
    if (shift && r.shift !== shift) continue;
    if (!ignoreDims && !s.dim(r)) continue;
    if (!groups.has(r.d)) groups.set(r.d, []);
    groups.get(r.d).push(r);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, recs]) => ({ d, t: isoToMs(d), v: recs.reduce((a, r) => a + r.v, 0) / recs.length, n: recs.length, recs }));
}

/** Une varias series (p. ej. SST licor mezcla = hoja SST LM + EDARI Bio 2). Si coinciden fechas, se promedian. */
export function seriesUnion(specs, opts = {}) {
  const all = specs.flatMap((sp) => series({ ...sp, ...opts }).flatMap((x) => x.recs));
  const groups = new Map();
  for (const r of all) {
    if (!groups.has(r.d)) groups.set(r.d, []);
    groups.get(r.d).push(r);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, recs]) => ({ d, t: isoToMs(d), v: recs.reduce((a, r) => a + r.v, 0) / recs.length, n: recs.length, recs }));
}

export function unitOf(inst, param) {
  const c = sel().catalog[inst];
  return (c && c[param] && c[param].unit) || '';
}

export function obsOn(d, kinds) {
  const list = sel().obsByDate.get(d) || [];
  return kinds ? list.filter((o) => kinds.includes(o.kind)) : list;
}

// ---------- Estado en la URL (enlaces que reproducen la vista) ----------
export function toHash() {
  const f = state.filters;
  const p = new URLSearchParams();
  if (f.preset && f.preset !== 'custom') p.set('p', f.preset);
  else { if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to); }
  if (f.inst.length) p.set('inst', f.inst.join('|'));
  if (f.point.length) p.set('point', f.point.join('|'));
  if (f.param.length) p.set('param', f.param.join('|'));
  if (state.sel.date) p.set('d', state.sel.date);
  const q = p.toString();
  return `#${state.tab}${q ? '?' + q : ''}`;
}
export function fromHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  const [tab, q] = h.split('?');
  const p = new URLSearchParams(q || '');
  const out = { tab: tab || null, filters: {}, date: p.get('d') };
  if (p.get('p')) out.filters.preset = p.get('p');
  if (p.get('from')) { out.filters.from = p.get('from'); out.filters.preset = 'custom'; }
  if (p.get('to')) { out.filters.to = p.get('to'); out.filters.preset = 'custom'; }
  for (const k of ['inst', 'point', 'param']) out.filters[k] = p.get(k) ? p.get(k).split('|') : [];
  return out;
}
