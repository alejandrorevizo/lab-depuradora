// Utilidades compartidas por las páginas.
import { state, sel, series, seriesUnion } from '../store.js';
import { orderPoints } from '../ui/charts.js';

export const EDARI = 'EDARI';

/** Series canónicas usadas en KPIs y páginas (todas salen del Excel). */
export const S = {
  dqoPerm: { inst: EDARI, param: 'DQO', point: 'Permeado' },
  dqoHomo: { inst: EDARI, param: 'DQO', point: 'Homo' },
  efect: { inst: EDARI, param: 'Efectividad', point: 'Homo → Permeado' },
  efectDQO: { inst: EDARI, param: 'Efectividad', point: 'DAF → Permeado (hoja DQO)' },
  qBruta: { inst: EDARI, param: 'Caudal', point: 'Agua sin tratar' },
  qPerm: { inst: EDARI, param: 'Caudal', point: 'Permeado' },
  phPerm: { inst: EDARI, param: 'pH', point: 'Permeado' },
};
// SST licor mezcla = hoja SST LM "Licor mezcla" + EDARI "SST Bio 2" (confirmado por el cliente).
export const SST_LM_SPECS = [
  { inst: EDARI, param: 'SST', point: 'Licor mezcla', sheet: 'SST LM' },
  { inst: EDARI, param: 'SST', point: 'Bio 2', sheet: 'EDARI' },
];
export const sstLM = (opts) => seriesUnion(SST_LM_SPECS, opts);

export const TRAIN = ['Entrada', 'Homo', 'DAF', 'Permeado'];

/** Estado frente a una banda del Excel. Solo para efectividad y SST licor mezcla. */
export function bandStatus(v, lo, hi, { aboveIsSeparate = true } = {}) {
  if (v == null) return 'none';
  if (v < lo) return 'critical';
  if (v > hi) return aboveIsSeparate ? 'above' : 'critical';
  return 'good';
}
export const STATUS_LABEL = { good: 'Dentro del rango', critical: 'Por debajo', above: 'Por encima', none: 'Sin dato' };

/** KPI: último valor, anterior y media de los 7 registros previos. */
export function kpiStats(s) {
  if (!s.length) return null;
  const last = s[s.length - 1];
  const prev = s.length > 1 ? s[s.length - 2] : null;
  const prev7 = s.slice(Math.max(0, s.length - 8), s.length - 1);
  const mean7 = prev7.length ? prev7.reduce((a, x) => a + x.v, 0) / prev7.length : null;
  return {
    last, prev, mean7, n7: prev7.length,
    dPrev: prev ? last.v - prev.v : null,
    dPrevPct: prev && prev.v !== 0 ? ((last.v - prev.v) / Math.abs(prev.v)) * 100 : null,
    dMean: mean7 != null ? last.v - mean7 : null,
    dMeanPct: mean7 ? ((last.v - mean7) / Math.abs(mean7)) * 100 : null,
  };
}

export function stats(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  const n = v.length;
  if (!n) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...v].sort((a, b) => a - b);
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], q1: q(0.25), median: q(0.5), q3: q(0.75) };
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!sxx || !syy) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  const b = sxy / sxx, a = my - b * mx;
  return { r, r2: r * r, a, b, n };
}

/** Opciones agrupadas "Instalación · Parámetro · Punto" para selectores de series. */
export function seriesOptions({ minCount = 2 } = {}) {
  const cat = sel().catalog;
  const out = [];
  for (const inst of Object.keys(cat).sort(instSort)) {
    for (const param of Object.keys(cat[inst]).sort((a, b) => a.localeCompare(b, 'es'))) {
      const info = cat[inst][param];
      for (const point of orderPoints(Object.keys(info.points))) {
        if (info.points[point] < minCount) continue;
        out.push({ value: JSON.stringify({ inst, param, point }), label: `${param} · ${point}${info.unit ? ' (' + info.unit + ')' : ''}`, group: inst, count: info.points[point] });
      }
    }
  }
  return out;
}
export const INST_ORDER = ['EDARI', 'Torres', 'Calderas', 'Glicol', 'Agua potable', 'Ósmosis O', 'Ósmosis P', 'Fructalys'];
export function instSort(a, b) {
  const ia = INST_ORDER.indexOf(a), ib = INST_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}
export function specLabel(sp) { return `${sp.param} · ${sp.point}`; }

export function pointsOf(inst, param) {
  const c = sel().catalog[inst];
  return c && c[param] ? orderPoints(Object.keys(c[param].points)) : [];
}
export function paramsOf(inst) {
  const c = sel().catalog[inst];
  return c ? Object.keys(c).sort((a, b) => a.localeCompare(b, 'es')) : [];
}

/** Aplica el filtro global de puntos (si hay) a una lista. */
export function applyPointFilter(points) {
  const f = state.filters.point;
  return f.length ? points.filter((p) => f.includes(p)) : points;
}
export function applyParamFilter(params) {
  const f = state.filters.param;
  return f.length ? params.filter((p) => f.includes(p)) : params;
}

/**
 * Mínimo del eje para la efectividad: deja ver la banda aunque haya valores muy negativos.
 * Los valores por debajo se dibujan en el borde con su valor real en la etiqueta y el tooltip.
 */
export function effAxisMin(values, low) {
  const inner = values.filter((v) => v >= low - 60);
  const m = Math.min(low - 20, ...(inner.length ? inner : [low - 20]));
  return Math.floor(m / 10) * 10;
}

export { series, seriesUnion };
