// Formato de números y fechas (es-ES). Los valores nunca se redondean en los datos, solo al mostrarlos.

const nfCache = new Map();
function nf(dec) {
  if (!nfCache.has(dec)) {
    nfCache.set(dec, new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: dec, useGrouping: 'always' }));
  }
  return nfCache.get(dec);
}

export function decimalsFor(v, param = '') {
  const a = Math.abs(v);
  if (/^ph$/i.test(param)) return 2;
  if (/efectividad/i.test(param)) return 2;
  if (a >= 1000) return 0;
  if (a >= 100) return 1;
  if (a >= 10) return 2;
  if (a >= 1) return 2;
  return 3;
}

export function fmtNum(v, param = '', dec) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  return nf(dec != null ? dec : decimalsFor(v, param)).format(v);
}

export function fmtVal(v, unit = '', param = '') {
  if (v == null || !Number.isFinite(v)) return 'sin dato';
  return `${fmtNum(v, param)}${unit ? (unit === '%' ? ' %' : ' ' + unit) : ''}`;
}

export function fmtSigned(v, dec = 1) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  const s = nf(dec).format(Math.abs(v));
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + s;
}

export function fmtDate(iso, short = false) {
  if (!iso) return 'n/d';
  const [y, m, d] = iso.split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function fmtDateLong(iso) {
  if (!iso) return 'n/d';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** 'YYYY-MM-DD' -> ms de medianoche local (eje temporal de ECharts). */
export function isoToMs(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function msToIso(ms) {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return msToIso(new Date(y, m - 1, d + n).getTime());
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const unitSuffix = (u) => (u ? (u === '%' ? ' %' : ' ' + u) : '');
