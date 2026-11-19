// Las cuatro áreas protagonistas y el cálculo de alertas por área.
import { state, sel, series } from '../store.js';
import { limitFor, evaluate, RANK, worst } from '../limits.js';
import { addDays } from '../ui/format.js';
import { orderPoints } from '../ui/charts.js';

export const AREAS = [
  { id: 'edari', label: 'EDARI', insts: ['EDARI'], sheet: 'EDARI y hojas de laboratorio' },
  { id: 'calderas', label: 'Calderas y torres', insts: ['Calderas', 'Torres', 'Glicol'], sheet: 'INFORME CALDERAS Y TORRES, CALDERAS Y TORRES y TORRES' },
  { id: 'fructalys', label: 'Fructalys', insts: ['Fructalys'], sheet: 'FRUCTALYS' },
  { id: 'potable', label: 'Agua potable', insts: ['Agua potable'], sheet: 'AGUA POTABLE' },
];
export const areaById = (id) => AREAS.find((a) => a.id === id);

/** Última fecha con algún valor del área dentro del rango. */
export function areaLast(area) {
  let d = null;
  for (const r of sel().ranged) if (area.insts.includes(r.inst) && (!d || r.d > d)) d = r.d;
  return d;
}

/**
 * Valores con límite del último registro de cada serie del área (solo si es de la última semana con datos del área).
 * Devuelve [{ area, inst, point, param, unit, v, d, lim, st }] ordenado de peor a mejor.
 */
export function areaChecks(area) {
  const last = areaLast(area);
  if (!last) return [];
  const since = addDays(last, -7);
  const cat = sel().catalog;
  const out = [];
  for (const inst of area.insts) {
    for (const [param, info] of Object.entries(cat[inst] || {})) {
      for (const point of orderPoints(Object.keys(info.points))) {
        const lim = limitFor(state.data, inst, point, param);
        if (!lim) continue;
        const s = series({ inst, param, point });
        const x = s[s.length - 1];
        if (!x || x.d < since) continue;
        out.push({ area, inst, point, param, unit: info.unit, v: x.v, d: x.d, lim, st: evaluate(lim, x.v) });
      }
    }
  }
  return out.sort((a, b) => RANK[b.st] - RANK[a.st] || (a.d < b.d ? 1 : -1));
}

export function areaStatus(area) {
  return worst(areaChecks(area).map((c) => c.st));
}
