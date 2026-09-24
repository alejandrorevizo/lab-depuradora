// Utilidades de bajo nivel para leer celdas de SheetJS sin inventar valores.
// Toda celda se clasifica: un número válido, o "sin dato" con el motivo.

export const FLAG = {
  OK: 'ok',                 // número leído tal cual
  TEXTNUM: 'textnum',       // número guardado como texto ("4.19"), se usa como número
  EMPTY: 'empty',           // celda vacía
  DASH: 'dash',             // "-"
  GT: 'gt',                 // ">60000", ">32,6": fuera de rango del método
  LT: 'lt',                 // "<0,5"
  ERROR: 'error',           // #DIV/0!, #VALUE!, #N/A...
  TEXT: 'text',             // texto no numérico
  EXCLUDED: 'excluded',     // descartada a propósito (p. ej. BUSCARV a otra hoja)
  MERGED: 'merged',         // parte no superior de una celda combinada
};

export const FLAG_LABEL = {
  ok: 'Número',
  textnum: 'Número guardado como texto',
  empty: 'Celda vacía',
  dash: 'Guion "-"',
  gt: 'Fuera de rango (">")',
  lt: 'Fuera de rango ("<")',
  error: 'Error de fórmula',
  text: 'Texto no numérico',
  excluded: 'Descartada (BUSCARV a otra hoja)',
  merged: 'Celda combinada (sin valor propio)',
};

export function colName(c) {
  let s = '';
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}
export const addr = (r, c) => colName(c) + (r + 1);

/** Límites reales de una hoja (ignora !ref inflados como A1:XFD45). */
export function sheetBounds(ws) {
  let maxR = -1, maxC = -1;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const m = /^([A-Z]+)(\d+)$/.exec(k);
    if (!m) continue;
    const cell = ws[k];
    if (cell == null || (cell.v == null && !cell.f)) continue;
    if (typeof cell.v === 'string' && cell.v.trim() === '' && !cell.f) continue;
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    c -= 1;
    const r = parseInt(m[2], 10) - 1;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { maxR, maxC };
}

export function getCell(ws, r, c) {
  return ws[addr(r, c)] || null;
}

/** Texto limpio de una celda (para cabeceras y etiquetas). */
export function text(ws, r, c) {
  const cell = getCell(ws, r, c);
  if (!cell || cell.v == null) return '';
  if (cell.t === 'e') return String(cell.w || '');
  return String(cell.w != null && cell.t !== 'n' ? cell.v : cell.v).replace(/\s+/g, ' ').trim();
}

export function rawText(cell) {
  if (!cell || cell.v == null) return '';
  if (cell.t === 'e') return String(cell.w || '#ERROR');
  if (cell.t === 'n') return String(cell.v);
  return String(cell.v);
}

const NUM_RE = /^[-+]?\d+(?:[.,]\d+)?$/;

/** ¿La fórmula consulta otra hoja? (BUSCARV/VLOOKUP a EDARI, referencias 'Hoja'!A1...) */
export function isCrossSheetFormula(cell) {
  return !!(cell && cell.f && /!/.test(cell.f));
}

/**
 * Clasifica una celda como valor numérico o "sin dato".
 * Devuelve { v: number|null, flag, raw, bound? }
 * Nunca convierte "-", vacío, ">60000" o errores en 0.
 */
export function classify(cell, { excludeCrossSheet = false } = {}) {
  if (!cell || (cell.v == null && !cell.f)) return { v: null, flag: FLAG.EMPTY, raw: '' };
  const raw = rawText(cell);
  if (excludeCrossSheet && isCrossSheetFormula(cell)) {
    return { v: null, flag: FLAG.EXCLUDED, raw, formula: cell.f };
  }
  if (cell.t === 'e') return { v: null, flag: FLAG.ERROR, raw };
  if (cell.t === 'n') {
    if (!Number.isFinite(cell.v)) return { v: null, flag: FLAG.ERROR, raw };
    return { v: cell.v, flag: FLAG.OK, raw };
  }
  if (cell.t === 'b') return { v: null, flag: FLAG.TEXT, raw };
  const s = String(cell.v).trim();
  if (s === '') return { v: null, flag: FLAG.EMPTY, raw: '' };
  if (/^[-–—]+$/.test(s)) return { v: null, flag: FLAG.DASH, raw: s };
  if (/^#/.test(s)) return { v: null, flag: FLAG.ERROR, raw: s };
  const gt = /^>\s*=?\s*([-+]?\d+(?:[.,]\d+)?)$/.exec(s);
  if (gt) return { v: null, flag: FLAG.GT, raw: s, bound: parseFloat(gt[1].replace(',', '.')) };
  const lt = /^<\s*=?\s*([-+]?\d+(?:[.,]\d+)?)$/.exec(s);
  if (lt) return { v: null, flag: FLAG.LT, raw: s, bound: parseFloat(lt[1].replace(',', '.')) };
  if (NUM_RE.test(s)) return { v: parseFloat(s.replace(',', '.')), flag: FLAG.TEXTNUM, raw: s };
  return { v: null, flag: FLAG.TEXT, raw: s };
}

export const isValue = (flag) => flag === FLAG.OK || flag === FLAG.TEXTNUM;

// ---------- Fechas y horas ----------
const pad = (n) => String(n).padStart(2, '0');

/** Serial de Excel (sistema 1900) -> 'YYYY-MM-DD' en UTC. */
export function serialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Fracción de día -> 'HH:MM'. */
export function fractionToTime(f) {
  const frac = f - Math.floor(f);
  let mins = Math.round(frac * 1440);
  if (mins >= 1440) mins = 0;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** Lee una fecha de una celda. Devuelve 'YYYY-MM-DD' o null. */
export function readDate(cell) {
  if (!cell || cell.v == null) return null;
  if (cell.t === 'n') {
    // Rango razonable 2000-2100
    if (cell.v >= 36526 && cell.v < 73051) return serialToISO(cell.v);
    return null;
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (cell.t === 's') {
    const s = String(cell.v).trim();
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

/** Lee una hora. Devuelve 'HH:MM' o null. */
export function readTime(cell) {
  if (!cell || cell.v == null) return null;
  if (cell.t === 'n') return fractionToTime(cell.v);
  if (cell.t === 's') {
    const m = /^(\d{1,2})[:.](\d{2})/.exec(String(cell.v).trim());
    if (m) return `${pad(+m[1])}:${m[2]}`;
  }
  return null;
}

// ---------- Nombres ----------
const KEEP_UPPER = new Set(['DAF', 'MBR', 'EOS', 'ITR', 'ALT', 'INOX', 'NO2', 'DQO', 'SST', 'C.E.', 'O.D.', 'P', 'O', 'T1', 'T2', 'T3', 'T4', 'B2', 'M-1', 'M-2', 'M-3', 'M-4', 'M-5', 'M-6', 'M-7', 'M-8']);

/**
 * Limpia una etiqueta: espacios, saltos de línea y MAYÚSCULAS completas
 * ("PERMEADO" -> "Permeado"). No cambia el significado ni fusiona nombres.
 */
export function tidy(s) {
  if (s == null) return '';
  let t = String(s).replace(/\s+/g, ' ').trim();
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase() && !KEEP_UPPER.has(t)) {
    t = t
      .split(' ')
      .map((w, i) => {
        const bare = w.replace(/[()]/g, '');
        if (KEEP_UPPER.has(bare) || /\d/.test(bare)) return w;
        const low = w.toLowerCase();
        return i === 0 ? low.charAt(0).toUpperCase() + low.slice(1) : low;
      })
      .join(' ');
  }
  return t;
}

/** Separa "Conductividad\n< 2000 uS/cm" o "DQO\nmg/L" o "Cloro libre (mg/L)". */
export function splitLabel(s) {
  const rawS = String(s || '');
  const lines = rawS.split(/\n/).map((x) => x.trim()).filter(Boolean);
  let main = lines[0] || '';
  let rest = lines.slice(1).join(' ');
  let unit = '';
  const par = /\(([^)]*)\)\s*$/.exec(main);
  if (par && /(mg|µS|μS|uS|us|ppm|NTU|Bar|bar|°C|ºC|m3|m³|L\/h|kg|%)/i.test(par[1])) {
    unit = par[1].trim();
    main = main.slice(0, par.index).trim();
  }
  return { main: main.replace(/\s+/g, ' ').trim(), rest: rest.trim(), unit };
}

export function normUnit(u) {
  if (!u) return '';
  let s = u.trim();
  s = s.replace(/^u[sS]\/cm$/, 'µS/cm').replace(/^μS\/cm$/, 'µS/cm').replace(/^us\/cm$/i, 'µS/cm');
  s = s.replace(/^ºC$/, '°C').replace(/^m3\/día$/, 'm³/día').replace(/^mg\/l$/, 'mg/L');
  if (/^bar$/i.test(s)) s = 'bar';
  return s;
}

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** ¿Está (r,c) dentro de una celda combinada y no es su esquina superior izquierda? */
export function mergedInfo(ws, r, c) {
  const merges = ws['!merges'] || [];
  for (const m of merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      return { top: m.s.r === r && m.s.c === c, range: `${addr(m.s.r, m.s.c)}:${addr(m.e.r, m.e.c)}`, m };
    }
  }
  return null;
}

/** Valor de cabecera con celdas combinadas propagadas. */
export function headerText(ws, r, c) {
  const mi = mergedInfo(ws, r, c);
  if (mi) return rawText(getCell(ws, mi.m.s.r, mi.m.s.c));
  return rawText(getCell(ws, r, c));
}

/** Referencias simples de una fórmula a celdas de la misma hoja (A1, $B$3...). null si hay otras hojas o rangos. */
function sameSheetRefs(f) {
  if (!f || /!/.test(f) || /:/.test(f)) return null;
  const refs = f.replace(/"[^"]*"/g, '').match(/\$?[A-Z]{1,3}\$?\d+/g);
  return refs ? refs.map((x) => x.replace(/\$/g, '')) : null;
}

/**
 * Como classify, pero una fórmula que solo depende de celdas vacías de la misma hoja
 * (p. ej. =AN49*10 con AN49 vacía, que Excel muestra como 0) se trata como "sin dato".
 */
export function classifyAt(ws, r, c, opts) {
  const cell = getCell(ws, r, c);
  const cl = classify(cell, opts);
  if (cell && cell.f && cl.flag === FLAG.OK) {
    const refs = sameSheetRefs(cell.f);
    if (refs && refs.length && refs.every((a) => { const k = ws[a]; return !k || k.v == null || (typeof k.v === 'string' && k.v.trim() === ''); })) {
      return { v: null, flag: FLAG.EMPTY, raw: `=${cell.f}`, formulaOfEmpty: true };
    }
  }
  return cl;
}
