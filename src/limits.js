// Límites del semáforo.
// - Excel: los que figuran en el propio libro (efectividad, SST licor mezcla, rangos del informe de calderas y glicol).
//   Son de solo lectura: si cambian, se cambian en el Excel.
// - Referencia: valores habituales del sector para lo que el Excel no acota. Se marcan como referencia y se pueden
//   editar o desactivar desde la web; los cambios se comparten (Vercel Blob) o, sin almacenamiento, quedan en el navegador.

export const REF_DEFAULTS = [
  { id: 'edari-od', inst: 'EDARI', param: 'O.D.', points: '*', min: 1.5, max: 3, unit: 'ppm', note: 'Oxígeno disuelto habitual en el reactor biológico (fangos activados).' },
  { id: 'edari-ph-perm', inst: 'EDARI', param: 'pH', points: ['Permeado'], min: 6, max: 9, unit: '', note: 'Rango habitual de vertido del efluente tratado.' },
  { id: 'potable-cl', inst: 'Agua potable', param: 'Cloro libre', points: ['Tanque "P"', 'Salida "P"'], min: 0.2, max: 1, unit: 'mg/L', note: 'Cloro libre residual habitual en agua de consumo (mínimo 0,2, máximo 1,0 mg/L).' },
  { id: 'potable-ce', inst: 'Agua potable', param: 'Conductividad', points: '*', min: null, max: 2500, unit: 'µS/cm', note: 'Valor paramétrico de agua de consumo (RD 3/2023).' },
  { id: 'torres-ph', inst: 'Torres', param: 'pH', points: '*', min: 6.5, max: 9, unit: '', note: 'Control de torres de refrigeración (RD 487/2022).' },
  { id: 'torres-turb', inst: 'Torres', param: 'Turbidez', points: '*', min: null, max: 15, unit: 'NTU', note: 'Control de torres de refrigeración (RD 487/2022).' },
  { id: 'fru-ph', inst: 'Fructalys', param: 'pH', points: '*', min: 5.5, max: 9.5, unit: '', note: 'Rango típico de ordenanza de vertido. Ajústalo a la autorización de Fructalys.' },
  { id: 'fru-t', inst: 'Fructalys', param: 'Temperatura', points: '*', min: null, max: 40, unit: '°C', note: 'Temperatura máxima típica de ordenanza de vertido.' },
];

const LS_KEY = 'revizo-lab-limits';
let overrides = {};
let storage = 'local'; // 'shared' | 'local'
let built = null; // { data, list }

export const limitsStorage = () => storage;

/** "< 2000 uS/cm" -> { max: 2000 }; "6,00 - 9,00" -> { min: 6, max: 9 }; ">9,00" -> { min: 9 }. */
export function parseRange(s) {
  const num = (x) => parseFloat(String(x).replace(/\./g, '').replace(',', '.'));
  const t = String(s || '').trim();
  let m = /^([\d.,]+)\s*[-–]\s*([\d.,]+)/.exec(t);
  if (m) return { min: num(m[1]), max: num(m[2]) };
  m = /^[<≤]\s*=?\s*([\d.,]+)/.exec(t);
  if (m) return { min: null, max: num(m[1]) };
  m = /^[>≥]\s*=?\s*([\d.,]+)/.exec(t);
  if (m) return { min: num(m[1]), max: null };
  return null;
}

function build(data) {
  const list = [];
  const L = data.limits || {};
  if (L.efectividad) list.push({ id: 'excel-efect', src: 'excel', inst: 'EDARI', param: 'Efectividad', points: '*', min: L.efectividad.low, max: L.efectividad.high, unit: '%', highIsWarn: true, note: `Excel: ${L.efectividad.src}.` });
  if (L.sst) list.push({ id: 'excel-sst', src: 'excel', inst: 'EDARI', param: 'SST', points: ['Licor mezcla', 'Bio 2'], min: L.sst.min, max: L.sst.max, unit: 'mg/L', note: `Excel: ${L.sst.src}.` });
  for (const [k, txt] of Object.entries(data.tables.refRanges || {})) {
    const [inst, point, param] = k.split('|');
    const r = parseRange(txt);
    if (!r) continue;
    list.push({ id: `excel-${k}`, src: 'excel', inst, param, points: [point], ...r, unit: '', note: `Rango del informe de laboratorio: "${txt}".` });
  }
  for (const d of REF_DEFAULTS) {
    const o = overrides[d.id] || {};
    list.push({ ...d, src: 'ref', min: 'min' in o ? o.min : d.min, max: 'max' in o ? o.max : d.max, off: !!o.off, edited: 'min' in o || 'max' in o });
  }
  built = { data, list };
  return list;
}

export function allLimits(data) {
  if (!built || built.data !== data) build(data);
  return built.list;
}
const ptMatch = (l, point) => l.points === '*' || l.points.includes(point);

/** Límite activo para (inst, punto, parámetro). Manda el del Excel sobre el de referencia. */
export function limitFor(data, inst, point, param) {
  const list = allLimits(data).filter((l) => !l.off && l.inst === inst && l.param === param && ptMatch(l, point));
  return list.find((l) => l.src === 'excel') || list[0] || null;
}

/** 'good' | 'warn' | 'bad' | 'none'. Ámbar si está fuera pero el límite lo permite (efectividad > 98) o a menos del 10 % del borde. */
export function evaluate(lim, v) {
  if (!lim || v == null || !Number.isFinite(v)) return 'none';
  const { min, max } = lim;
  if (min != null && v < min) return 'bad';
  if (max != null && v > max) return lim.highIsWarn ? 'warn' : 'bad';
  const band = min != null && max != null ? max - min : null;
  const mMin = band != null ? band * 0.1 : Math.abs(min || 0) * 0.1;
  const mMax = band != null ? band * 0.1 : Math.abs(max || 0) * 0.1;
  if (min != null && v < min + mMin) return 'warn';
  if (max != null && v > max - mMax && !lim.highIsWarn) return 'warn';
  return 'good';
}
export const RANK = { bad: 3, warn: 2, good: 1, none: 0 };
export const worst = (list) => list.reduce((a, s) => (RANK[s] > RANK[a] ? s : a), 'none');

export function limitText(lim, unit = '') {
  if (!lim) return '';
  const f = (x) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(x);
  const u = unit || lim.unit ? ` ${unit || lim.unit}` : '';
  if (lim.min != null && lim.max != null) return `${f(lim.min)}–${f(lim.max)}${u}`;
  if (lim.max != null) return `≤ ${f(lim.max)}${u}`;
  if (lim.min != null) return `≥ ${f(lim.min)}${u}`;
  return '';
}
export const SRC_LABEL = { excel: 'Excel', ref: 'Referencia' };

// ---------- Persistencia ----------
export async function loadLimits() {
  try {
    const r = await fetch('/api/limits', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const j = await r.json();
      if (j.storage) { overrides = clean(j.overrides); storage = 'shared'; built = null; return; }
    }
  } catch (e) { /* sin API: modo local */ }
  storage = 'local';
  try { overrides = clean(JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { overrides = {}; }
  built = null;
}

export async function saveLimits(next) {
  const c = clean(next);
  if (storage === 'shared') {
    const r = await fetch('/api/limits', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides: c }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  } else {
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch (e) { throw new Error('Este navegador no permite guardar los límites.'); }
  }
  overrides = c;
  built = null;
}
export const currentOverrides = () => JSON.parse(JSON.stringify(overrides));

function clean(o) {
  const out = {};
  const ids = new Set(REF_DEFAULTS.map((d) => d.id));
  for (const [id, v] of Object.entries(o || {})) {
    if (!ids.has(id) || !v || typeof v !== 'object') continue;
    const e = {};
    for (const k of ['min', 'max']) if (k in v) e[k] = v[k] == null || v[k] === '' ? null : Number.isFinite(+v[k]) ? +v[k] : undefined;
    for (const k of ['min', 'max']) if (e[k] === undefined) delete e[k];
    if (v.off) e.off = true;
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}
