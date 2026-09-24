// Motor de datos: convierte el libro "COMPORTAMIENTO DE LA DQO OFICIAL" a formato largo.
// Cada registro: { d, inst, point, param, unit, v, flag, raw, sheet, cell, time?, shift?, bound? }
// v === null  => sin dato (el motivo está en flag). Nunca se sustituye por 0.

import {
  FLAG, classify, classifyAt, isValue, getCell, text, rawText, readDate, readTime, sheetBounds,
  addr, colName, tidy, splitLabel, normUnit, norm, mergedInfo, headerText, isCrossSheetFormula,
} from './util.js';

export const INST = {
  EDARI: 'EDARI',
  TORRES: 'Torres',
  CALDERAS: 'Calderas',
  GLICOL: 'Glicol',
  POTABLE: 'Agua potable',
  OSMO_O: 'Ósmosis O',
  OSMO_P: 'Ósmosis P',
  FRUCTALYS: 'Fructalys',
};

// Hojas que se esperan en el libro y cómo se tratan.
export const EXPECTED_SHEETS = [
  'EDARI', 'DQO', 'SST LM', 'PH', 'C.E.', 'O.D. B2', 'NITRITO NO2', 'NITRATOS', 'FÓSFORO', 'AMONIACO',
  'D. UREA', 'Hoja1', 'Hoja2', 'TORRES', 'CALDERAS Y TORRES', 'AGUA POTABLE', 'PAR. PLANTA O',
  'PAR. PLANTA P', 'FRUCTALYS', 'Reportes', 'Reg. Fot.',
];
// Reportes: el cliente decidió no mostrarlos.
const OMITTED = { Reportes: 'Omitida por decisión del cliente (correos de laboratorio).' };

// Límites que figuran en el propio Excel; si faltan las hojas, se usan los indicados en el encargo.
const FALLBACK_LIMITS = {
  efectividad: { low: 90, high: 98, src: 'encargo (hoja DQO no disponible)' },
  sst: { min: 8000, max: 12000, src: 'encargo (hoja SST LM no disponible)' },
};

class Ctx {
  constructor() {
    this.records = [];
    this.obs = [];
    this.issues = [];
    this.sheets = {};
    this.tables = { regFot: [], hoja2: null, reactivos: [], refRanges: {} };
    this.limits = {};
  }
  sheet(name) {
    if (!this.sheets[name]) this.sheets[name] = { name, status: 'ok', rows: 0, records: 0, values: 0, dmin: null, dmax: null, discarded: {}, notes: [] };
    return this.sheets[name];
  }
  add(rec) {
    const r = { unit: '', time: null, shift: null, ...rec };
    r.unit = normUnit(r.unit);
    this.records.push(r);
    const s = this.sheet(r.sheet);
    s.records++;
    if (isValue(r.flag)) {
      s.values++;
      if (!s.dmin || r.d < s.dmin) s.dmin = r.d;
      if (!s.dmax || r.d > s.dmax) s.dmax = r.d;
    } else {
      s.discarded[r.flag] = (s.discarded[r.flag] || 0) + 1;
    }
    return r;
  }
  issue(i) {
    this.issues.push({ level: 'info', ...i });
  }
}

// ---------------------------------------------------------------------------
// EDARI
// ---------------------------------------------------------------------------
const EDARI_EXPECTED = [
  ['B', 'Agua sin tratar', 'm3/día'], ['C', 'Rendimiento depuradora', 'Permeado (m3/día)'], ['D', 'Efectividad', '% de depuración'],
  ['E', 'DQO (mg/L)', 'Entrada'], ['F', 'DQO (mg/L)', 'Homo'], ['G', 'DQO (mg/L)', 'DAF'], ['H', 'DQO (mg/L)', 'Permeado'],
  ['I', 'DQO (mg/L)', 'Balsa N'], ['J', 'DQO (mg/L)', 'Chulives'], ['K', 'DQO (mg/L)', 'Tanque gris'],
  ['L', 'pH', 'Entrada'], ['O', 'pH', 'Permeado'], ['T', 'Temperatura', 'Entrada'], ['AB', 'Conductividad (μS/cm)', 'Entrada'],
  ['AJ', 'SST (mg/L)', 'Entrada'], ['AN', 'SST (mg/L)', 'Bio 2 (1:10)'], ['AO', 'SST (mg/L)', 'Bio 2'],
  ['AS', 'Amonio', 'DAF'], ['AU', 'Fósforo total', 'DAF'], ['AW', 'Observaciones', ''],
];

function parseEDARI(ctx, ws) {
  const name = 'EDARI';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);

  // Mapa de columnas por nombre (fila 1 = grupo con combinadas, fila 2 = punto).
  const cols = [];
  let obsCol = -1, dateCol = -1, lastTableCol = -1;
  for (let c = 0; c <= maxC; c++) {
    const g = headerText(ws, 0, c).trim();
    const p = text(ws, 1, c);
    if (!g && !p) continue;
    const ng = norm(g);
    if (ng === 'fecha') { dateCol = c; continue; }
    if (ng.startsWith('observacion')) { obsCol = c; lastTableCol = Math.max(lastTableCol, c); continue; }
    lastTableCol = Math.max(lastTableCol, c);
    if (ng === 'agua sin tratar') cols.push({ c, point: 'Agua sin tratar', param: 'Caudal', unit: normUnit(p) || 'm³/día' });
    else if (ng.startsWith('rendimiento') || norm(p).startsWith('permeado (m3')) {
      const u = /\(([^)]*)\)/.exec(p);
      cols.push({ c, point: 'Permeado', param: 'Caudal', unit: u ? u[1] : '' });
    } else if (ng === 'efectividad') cols.push({ c, special: 'efectividad' });
    else {
      const sl = splitLabel(g);
      cols.push({ c, point: tidy(p), param: sl.main, unit: sl.unit });
    }
  }
  if (dateCol < 0) dateCol = 0;

  // Comprobación de cabecera frente a la estructura conocida.
  const changed = [];
  for (const [L, g, p] of EDARI_EXPECTED) {
    let c = 0;
    for (const ch of L) c = c * 26 + (ch.charCodeAt(0) - 64);
    c -= 1;
    const gg = headerText(ws, 0, c).trim(), pp = text(ws, 1, c);
    if (norm(gg) !== norm(g) || (p && norm(pp) !== norm(p))) changed.push(`${L}: se esperaba "${g}${p ? ' / ' + p : ''}" y hay "${gg}${pp ? ' / ' + pp : ''}"`);
  }
  if (changed.length) {
    S.status = 'header-changed';
    ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: `La cabecera de EDARI no coincide con la estructura conocida. Las columnas se leen por su nombre. ${changed.slice(0, 6).join('; ')}${changed.length > 6 ? '…' : ''}` });
  }

  const dqo = (pt) => cols.find((x) => norm(x.param) === 'dqo' && norm(x.point) === norm(pt));
  const homoCol = dqo('Homo'), permCol = dqo('Permeado');
  if (!homoCol || !permCol) ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: 'No se encuentran las columnas DQO Homo y/o DQO Permeado: no se puede calcular la efectividad.' });

  // Celdas fuera de la tabla
  for (let r = 0; r <= maxR; r++) for (let c = lastTableCol + 1; c <= maxC; c++) {
    const cell = getCell(ws, r, c);
    if (cell && (cell.v != null || cell.f)) ctx.issue({ sheet: name, cell: addr(r, c), type: 'outside', msg: 'Celda fuera de la tabla de EDARI, ignorada.', raw: rawText(cell) || cell.f });
  }

  for (let r = 2; r <= maxR; r++) {
    const dcell = getCell(ws, r, dateCol);
    const d = readDate(dcell);
    if (!d) {
      const has = cols.some((x) => { const k = getCell(ws, r, x.c); return k && k.v != null && String(k.v).trim() !== ''; });
      if (has || (dcell && dcell.v != null)) ctx.issue({ sheet: name, cell: addr(r, dateCol), level: 'warn', type: 'nodate', msg: `Fila ${r + 1} con datos pero sin fecha válida: se ignora.`, raw: rawText(dcell) });
      continue;
    }
    S.rows++;
    let anyValue = false;
    let homo = null, perm = null;
    for (const col of cols) {
      if (col.special) continue;
      const cell = getCell(ws, r, col.c);
      const mi = mergedInfo(ws, r, col.c);
      let cl;
      if (mi && !mi.top) {
        cl = { v: null, flag: FLAG.MERGED, raw: '' };
        ctx.issue({ sheet: name, cell: addr(r, col.c), level: 'warn', type: 'merged', msg: `Celda combinada ${mi.range}: el valor pertenece a la primera fila; ${fmt(d)} queda sin dato de ${col.param} ${col.point}.` });
      } else cl = classifyAt(ws, r, col.c);
      const rec = ctx.add({ d, inst: INST.EDARI, point: col.point, param: col.param, unit: col.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, col.c) });
      if (isValue(cl.flag)) {
        anyValue = true;
        if (cl.flag === FLAG.TEXTNUM) ctx.issue({ sheet: name, cell: rec.cell, type: 'textnum', msg: `Número guardado como texto ("${cl.raw}"), se usa como ${cl.v}.`, raw: cl.raw });
        if (cl.v < 0 && col.param === 'Caudal') {
          ctx.issue({ sheet: name, cell: rec.cell, level: col.point === 'Agua sin tratar' ? 'info' : 'warn', type: 'negative', msg: `${col.param} ${col.point} negativo (${cl.v} ${rec.unit}) el ${fmt(d)}. ${col.point === 'Agua sin tratar' ? 'Tratado como dato válido (confirmado por el cliente).' : 'Se muestra tal cual.'}`, raw: cl.raw });
        }
      } else if (cl.flag === FLAG.GT || cl.flag === FLAG.LT || cl.flag === FLAG.ERROR || cl.flag === FLAG.TEXT) {
        ctx.issue({ sheet: name, cell: rec.cell, type: cl.flag, msg: `${col.param} ${col.point} el ${fmt(d)}: "${cl.raw}" (sin valor numérico).`, raw: cl.raw });
      }
      if (col === homoCol) homo = cl;
      if (col === permCol) perm = cl;
    }

    // Efectividad = ((Homo − Permeado) / Homo) × 100, igual que la fórmula del Excel.
    const ec = cols.find((x) => x.special === 'efectividad');
    if (ec) {
      const cached = classifyAt(ws, r, ec.c);
      let v = null, flag = FLAG.EMPTY;
      if (homo && perm && isValue(homo.flag) && isValue(perm.flag) && homo.v !== 0) {
        v = ((homo.v - perm.v) / homo.v) * 100;
        flag = FLAG.OK;
        if (isValue(cached.flag) && Math.abs(cached.v - v) > 1e-6) {
          ctx.issue({ sheet: name, cell: addr(r, ec.c), level: 'warn', type: 'efectividad', msg: `La efectividad guardada (${cached.v.toFixed(2)} %) no coincide con ((Homo−Permeado)/Homo)×100 = ${v.toFixed(2)} %. Se muestra la calculada.` });
        }
      } else {
        flag = cached.flag === FLAG.ERROR ? FLAG.ERROR : FLAG.EMPTY;
      }
      ctx.add({ d, inst: INST.EDARI, point: 'Homo → Permeado', param: 'Efectividad', unit: '%', v, flag, raw: cached.raw, sheet: name, cell: addr(r, ec.c) });
      if (v != null) anyValue = true;
      if (v != null && v < 0) ctx.issue({ sheet: name, cell: addr(r, ec.c), type: 'negative', msg: `Efectividad negativa (${v.toFixed(2)} %) el ${fmt(d)}: la DQO del permeado supera a la del homogeneizador.` });
    }

    if (obsCol >= 0) {
      const t = text(ws, r, obsCol);
      if (t) ctx.obs.push({ d, inst: INST.EDARI, text: t, sheet: name, cell: addr(r, obsCol), kind: 'EDARI' });
    }
    if (!anyValue) ctx.issue({ sheet: name, cell: addr(r, dateCol), level: 'warn', type: 'emptyrow', msg: `Fila ${r + 1} (${fmt(d)}) tiene fecha pero ningún dato.` });
  }
}

// ---------------------------------------------------------------------------
// Hojas de laboratorio por parámetro (cabecera en fila 1)
// ---------------------------------------------------------------------------
const META = new Set(['nº', 'n°', 'no', 'n', 'unidad', 'hora', 'hora de muestreo', 'efectividad', 'bajo', 'alto', 'minimo', 'maximo']);

const LAB_CFG = {
  DQO: { param: 'DQO', unit: 'mg/L' },
  'SST LM': { param: 'SST', unit: 'mg/L' },
  PH: { param: 'pH', unit: '' },
  'C.E.': { param: 'Conductividad', unit: 'µS/cm' },
  'O.D. B2': { param: 'O.D.', unit: 'ppm', shifts: true, pointPrefix: 'B2 · ' },
  'NITRITO NO2': { param: 'Nitrito (NO2)', unit: 'mg/L' },
  NITRATOS: { param: 'Nitratos', unit: 'mg/L' },
  'FÓSFORO': { param: 'Fósforo', unit: 'mg/L' },
  AMONIACO: { param: 'Amoniaco', unit: 'mg/L' },
  Hoja1: { param: 'DQO', unit: 'mg/L' },
};

function parseLab(ctx, ws, name) {
  const cfg = LAB_CFG[name];
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  const heads = [];
  for (let c = 0; c <= maxC; c++) heads.push(text(ws, 0, c));
  const dateCol = heads.findIndex((h) => ['fecha', 'fechas'].includes(norm(h)));
  if (dateCol < 0) {
    S.status = 'header-changed';
    ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: `No se encuentra la columna FECHA en la fila 1 de "${name}": hoja no leída.` });
    return;
  }
  const unitCol = heads.findIndex((h) => norm(h) === 'unidad');
  const hourCols = heads.map((h, i) => (norm(h).startsWith('hora') ? i : -1)).filter((i) => i >= 0);
  const limitCols = {};
  heads.forEach((h, i) => { const n = norm(h); if (['bajo', 'alto', 'minimo', 'maximo'].includes(n)) limitCols[n] = i; });
  const effCol = heads.findIndex((h) => norm(h) === 'efectividad');

  // Columnas de valores: con cabecera en fila 1, o con sub-cabecera más abajo.
  const vcols = [];
  for (let c = 0; c <= maxC; c++) {
    if (c === dateCol) continue;
    const h = heads[c];
    if (h) {
      if (META.has(norm(h))) continue;
      const sl = splitLabel(rawText(getCell(ws, 0, c)));
      vcols.push({ c, from: 1, point: tidy(sl.main), unit: sl.unit || cfg.unit, header: h });
    } else {
      for (let r = 1; r <= maxR; r++) {
        const cell = getCell(ws, r, c);
        if (cell && cell.t === 's' && classify(cell).flag === FLAG.TEXT) {
          const sl = splitLabel(String(cell.v));
          vcols.push({ c, from: r + 1, point: tidy(sl.main), unit: sl.unit || cfg.unit, header: String(cell.v), sub: addr(r, c) });
          ctx.issue({ sheet: name, cell: addr(r, c), type: 'subheader', msg: `Columna ${colName(c)} con cabecera propia "${tidy(sl.main)}" a partir de la fila ${r + 2}.` });
          break;
        }
      }
    }
  }
  // Hora asociada: la columna HORA siguiente a cada valor (O.D. B2) o una única HORA para toda la fila.
  for (const vc of vcols) {
    const next = hourCols.find((h) => h === vc.c + 1);
    vc.hourCol = next != null ? next : hourCols.length === 1 ? hourCols[0] : -1;
    if (cfg.shifts) vc.shift = vc.point;
    if (cfg.pointPrefix) vc.point = cfg.pointPrefix + vc.point;
  }

  const limitVals = {};
  let excluded = 0;
  for (let r = 1; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, dateCol));
    if (!d) continue;
    S.rows++;
    const unitRow = unitCol >= 0 ? text(ws, r, unitCol) : '';
    const rowCl = {};
    for (const vc of vcols) {
      if (r < vc.from) continue;
      const cell = getCell(ws, r, vc.c);
      const cl = classifyAt(ws, r, vc.c, { excludeCrossSheet: true });
      if (cl.flag === FLAG.EXCLUDED) excluded++;
      rowCl[vc.c] = cl;
      const time = vc.hourCol >= 0 ? readTime(getCell(ws, r, vc.hourCol)) : null;
      const unit = vc.from === 1 && unitRow ? unitRow : vc.unit;
      ctx.add({ d, inst: INST.EDARI, point: vc.point, param: cfg.param, unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, vc.c), time, shift: vc.shift || null });
      if (cl.flag === FLAG.TEXTNUM) ctx.issue({ sheet: name, cell: addr(r, vc.c), type: 'textnum', msg: `Número guardado como texto ("${cl.raw}").`, raw: cl.raw });
      if (cl.flag === FLAG.GT || cl.flag === FLAG.ERROR) ctx.issue({ sheet: name, cell: addr(r, vc.c), type: cl.flag, msg: `${cfg.param} ${vc.point} el ${fmt(d)}: "${cl.raw}".`, raw: cl.raw });
    }
    for (const [k, c] of Object.entries(limitCols)) {
      const cl = classifyAt(ws, r, c);
      if (isValue(cl.flag)) (limitVals[k] = limitVals[k] || new Set()).add(cl.v);
    }
    // Efectividad propia de la hoja DQO (DAF → Permeado). Solo si DAF y Permeado son datos propios.
    if (effCol >= 0) {
      const daf = vcols.find((x) => norm(x.point) === 'daf'), per = vcols.find((x) => norm(x.point) === 'permeado');
      const okBoth = daf && per && rowCl[daf.c] && rowCl[per.c] && isValue(rowCl[daf.c].flag) && isValue(rowCl[per.c].flag);
      const cell = getCell(ws, r, effCol);
      const cl = okBoth ? classify(cell) : { v: null, flag: isCrossSheetFormula(getCell(ws, r, daf ? daf.c : effCol)) ? FLAG.EXCLUDED : classify(cell).flag, raw: rawText(cell) };
      ctx.add({ d, inst: INST.EDARI, point: 'DAF → Permeado (hoja DQO)', param: 'Efectividad', unit: '%', v: cl.v, flag: cl.flag, raw: cl.raw, sheet: name, cell: addr(r, effCol) });
    }
  }
  if (excluded) {
    ctx.issue({ sheet: name, level: 'warn', type: 'excluded', msg: `${excluded} celdas son fórmulas BUSCARV que copian de EDARI con columnas desplazadas (p. ej. efectividad en la columna DAF). Se descartan: desde el 23/07 la fuente es EDARI.` });
    S.notes.push(`${excluded} celdas BUSCARV a EDARI descartadas`);
  }
  const lv = (k) => (limitVals[k] && limitVals[k].size === 1 ? [...limitVals[k]][0] : null);
  if (name === 'DQO' && lv('bajo') != null && lv('alto') != null) ctx.limits.efectividad = { low: lv('bajo'), high: lv('alto'), src: 'hoja DQO, columnas BAJO/ALTO' };
  if (name === 'SST LM' && lv('minimo') != null && lv('maximo') != null) ctx.limits.sst = { min: lv('minimo'), max: lv('maximo'), src: 'hoja SST LM, columnas MÍNIMO/MÁXIMO' };
  for (const [k, set] of Object.entries(limitVals)) if (set.size > 1) ctx.issue({ sheet: name, level: 'warn', type: 'limits', msg: `La columna ${k.toUpperCase()} tiene varios valores (${[...set].join(', ')}); no se usa como límite.` });
}

// ---------------------------------------------------------------------------
// D. UREA
// ---------------------------------------------------------------------------
function parseUrea(ctx, ws) {
  const name = 'D. UREA';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  const heads = [];
  for (let c = 0; c <= Math.min(maxC, 10); c++) heads.push(norm(text(ws, 0, c)));
  const cQty = heads.indexOf('cantidad'), cKg = heads.indexOf('kilos'), cUnit = heads.indexOf('unidad'), cDate = heads.indexOf('fecha'), cObs = heads.findIndex((h) => h.startsWith('observacion'));
  if (cDate < 0 || (cQty < 0 && cKg < 0)) {
    S.status = 'header-changed';
    ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: 'No se encuentran las columnas CANTIDAD/KILOS/FECHA en D. UREA.' });
    return;
  }
  for (let r = 1; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, cDate));
    if (!d) continue;
    S.rows++;
    if (cQty >= 0) {
      const cl = classifyAt(ws, r, cQty);
      const u = cUnit >= 0 ? text(ws, r, cUnit) : '';
      ctx.add({ d, inst: INST.EDARI, point: 'Urea', param: 'Urea dosificada (cantidad)', unit: u ? u.toLowerCase() : '', v: cl.v, flag: cl.flag, raw: cl.raw, sheet: name, cell: addr(r, cQty) });
    }
    if (cKg >= 0) {
      const cl = classifyAt(ws, r, cKg);
      ctx.add({ d, inst: INST.EDARI, point: 'Urea', param: 'Urea dosificada (kilos)', unit: 'kg', v: cl.v, flag: cl.flag, raw: cl.raw, sheet: name, cell: addr(r, cKg) });
    }
    if (cObs >= 0) {
      const t = text(ws, r, cObs);
      if (t) ctx.obs.push({ d, inst: INST.EDARI, text: t, sheet: name, cell: addr(r, cObs), kind: 'Urea' });
    }
  }
  if (maxC > 6) S.notes.push('Tabla de cálculo de sacos (columnas G en adelante) no se usa: es un cálculo auxiliar sin fecha.');
}

// ---------------------------------------------------------------------------
// Parámetros canónicos para torres / calderas
// ---------------------------------------------------------------------------
function canonParam(label) {
  const { main, rest, unit } = splitLabel(label);
  const n = norm(main);
  const ref = rest || '';
  if (n.startsWith('conductividad')) return { param: 'Conductividad', unit: unit || (/(u|µ|μ)s\/cm/i.exec(ref) ? 'µS/cm' : ''), ref };
  if (n.startsWith('dureza')) return { param: 'Dureza (titulación)', unit: '', ref: ref.replace(/^titulaci[oó]n\s*/i, '') };
  if (n.startsWith('turbidez')) return { param: 'Turbidez', unit: unit || (/ntu/i.test(ref) ? 'NTU' : ''), ref: /ntu/i.test(ref) ? '' : ref };
  if (n === 'ph') return { param: 'pH', unit: '', ref };
  if (n.startsWith('biocida')) return { param: 'Biocida', unit: unit || '', ref };
  if (n.startsWith('cloro libre')) return { param: 'Cloro libre', unit, ref };
  if (n === 't °c' || n === 't° (ºc)' || n === 't°' || n === 't °c' || /^t\s*°\s*\(?º?c/.test(n) || n === 't ºc') return { param: 'Temperatura', unit: '°C', ref };
  if (n.startsWith('t cg')) return { param: 'T Cg.', unit: '°C', ref };
  if (n.startsWith('observacion') || n.startsWith('comentario')) return { param: '__obs', unit: '', ref };
  return null;
}
function tempLabelUnit(label) {
  // "T° (ºC)" -> Temperatura °C
  const n = norm(label);
  if (/^t\s*°/.test(n) || /^t\s+°c/.test(n)) return { param: 'Temperatura', unit: '°C' };
  return null;
}
function canon(label) {
  const t = tempLabelUnit(label);
  if (t) return { ...t, ref: '' };
  return canonParam(label);
}

// ---------------------------------------------------------------------------
// TORRES (fecha solo en la primera fila de cada bloque)
// ---------------------------------------------------------------------------
function parseTorres(ctx, ws) {
  const name = 'TORRES';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  const heads = [];
  for (let c = 0; c <= maxC; c++) heads.push(rawText(getCell(ws, 0, c)));
  const locCol = heads.findIndex((h) => norm(h).startsWith('ubicacion'));
  if (locCol < 0) {
    S.status = 'header-changed';
    ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: 'No se encuentra la columna "Ubicación" en TORRES.' });
    return;
  }
  const pcols = [];
  let obsCol = -1;
  heads.forEach((h, c) => {
    if (c <= locCol || !h) return;
    const cp = canon(h);
    if (cp && cp.param === '__obs') obsCol = c;
    else if (cp) pcols.push({ c, ...cp });
    else pcols.push({ c, param: tidy(splitLabel(h).main), unit: splitLabel(h).unit, ref: '' });
  });
  let cur = null;
  const blockHas = {};
  for (let r = 1; r <= maxR; r++) {
    const dc = getCell(ws, r, 0);
    const d = readDate(dc);
    if (d) cur = d;
    const loc = text(ws, r, locCol);
    if (!loc) continue;
    if (!cur) { ctx.issue({ sheet: name, cell: addr(r, 0), level: 'warn', type: 'nodate', msg: `Fila ${r + 1} sin fecha previa: se ignora.` }); continue; }
    S.rows++;
    for (const pc of pcols) {
      const cl = classifyAt(ws, r, pc.c);
      ctx.add({ d: cur, inst: INST.TORRES, point: tidy(loc), param: pc.param, unit: pc.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, pc.c) });
      if (isValue(cl.flag)) blockHas[cur] = true;
      else blockHas[cur] = blockHas[cur] || false;
      if (cl.flag === FLAG.TEXT || cl.flag === FLAG.GT) ctx.issue({ sheet: name, cell: addr(r, pc.c), type: cl.flag, msg: `${pc.param} ${loc}: "${cl.raw}" no es numérico.`, raw: cl.raw });
    }
    if (obsCol >= 0) {
      const t = text(ws, r, obsCol);
      if (t) ctx.obs.push({ d: cur, inst: INST.TORRES, point: tidy(loc), text: t, sheet: name, cell: addr(r, obsCol), kind: 'Torres' });
    }
  }
  const empty = Object.entries(blockHas).filter(([, v]) => !v).map(([d]) => fmt(d));
  if (empty.length) ctx.issue({ sheet: name, level: 'warn', type: 'emptyrow', msg: `Fechas con bloque de torres sin ningún dato: ${empty.join(', ')}.` });
}

// ---------------------------------------------------------------------------
// CALDERAS Y TORRES (bloques repetidos por fecha; tres formatos a lo largo de la hoja)
// ---------------------------------------------------------------------------
const EQUIP = ['caldera 1', 'caldera 2', 'condensada 1', 'condensada 2', 'condensado 1', 'condensado 2', 'descalcificador'];

function parseCalderas(ctx, ws) {
  const name = 'CALDERAS Y TORRES';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  let cur = null;
  let section = null; // 'torres' | 'calderas' | 'glicol'
  let undated = [];
  const dates = new Set();
  const addVal = (r, c, inst, point, cp) => {
    if (!cur) { undated.push(r + 1); return; }
    const cl = classifyAt(ws, r, c);
    ctx.add({ d: cur, inst, point: tidy(point), param: cp.param, unit: cp.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, c) });
    if (cp.ref) ctx.tables.refRanges[`${inst}|${tidy(point)}|${cp.param}`] = cp.ref;
    if (cl.flag === FLAG.TEXT) ctx.issue({ sheet: name, cell: addr(r, c), level: 'warn', type: 'text', msg: `${cp.param} ${tidy(point)} el ${fmt(cur)}: "${cl.raw}" no es un número válido (no se interpreta).`, raw: cl.raw });
  };
  const rowTexts = (r) => { const out = []; for (let c = 0; c <= maxC; c++) out.push(text(ws, r, c)); return out; };
  const nextNonEmpty = (r) => { for (let k = r + 1; k <= Math.min(maxR, r + 3); k++) if (rowTexts(k).some(Boolean)) return k; return -1; };

  const handleEstado = (r, row) => {
    const estadoCol = row.findIndex((t) => norm(t) === 'estado');
    if (estadoCol < 0) return -1;
    const siCol = row.findIndex((t, i) => i > estadoCol && norm(t) === 'si');
    const noCol = row.findIndex((t, i) => i > estadoCol && norm(t) === 'no');
    const obCol = row.findIndex((t, i) => i > estadoCol && norm(t).startsWith('observacion'));
    const q = r + 1;
    const question = text(ws, q, estadoCol);
    if (question && cur) {
      const si = siCol >= 0 && norm(text(ws, q, siCol)) === 'x', no = noCol >= 0 && norm(text(ws, q, noCol)) === 'x';
      ctx.tables.reactivos.push({ d: cur, pregunta: question, respuesta: si ? 'SI' : no ? 'NO' : 'n/d', obs: obCol >= 0 ? text(ws, q, obCol) : '', cell: addr(q, estadoCol) });
    } else if (question && !cur) undated.push(q + 1);
    return estadoCol;
  };

  for (let r = 0; r <= maxR; r++) {
    const row = rowTexts(r);
    if (!row.some(Boolean)) continue;
    const b = getCell(ws, r, 1);
    const bn = norm(row[1]);
    // Fecha: celda de fecha en B, o "FECHA:" en B con la fecha en C
    const dB = readDate(b);
    if (dB && b.t !== 's') { cur = dB; dates.add(cur); continue; }
    if (bn.startsWith('fecha')) { const dC = readDate(getCell(ws, r, 2)); if (dC) { cur = dC; dates.add(cur); } continue; }
    // Secciones
    if (/control de torres/.test(bn)) { section = 'torres'; continue; }
    if (/control de calderas/.test(bn) || /agua de alimentacion/.test(bn)) { section = 'calderas'; continue; }
    if (/control de glicol/.test(bn)) {
      section = 'glicol';
      // formato informe: "Observación general" en la misma fila
      const og = row.findIndex((t) => norm(t) === 'observacion general');
      if (og >= 0) {
        const t = text(ws, r + 1, og);
        if (t && cur) ctx.obs.push({ d: cur, inst: INST.CALDERAS, text: t, sheet: name, cell: addr(r + 1, og), kind: 'Calderas' });
      }
      continue;
    }
    // Reactivos: fila "Estado" con SI / NO / Observación
    const estadoCol = handleEstado(r, row);
    if (estadoCol >= 0 && estadoCol <= 2) { r = r + 1; continue; }
    // "Observación general" (formato informe)
    const ogCol = row.findIndex((t) => norm(t) === 'observacion general');
    if (ogCol >= 0) {
      const t = text(ws, r + 1, ogCol);
      if (t && cur) ctx.obs.push({ d: cur, inst: INST.CALDERAS, text: t, sheet: name, cell: addr(r + 1, ogCol), kind: 'Calderas' });
    }
    // Formato vertical: fila "Parámetros"
    if (bn === 'parametros') {
      const heads = row.map((t, c) => ({ c, t: rawText(getCell(ws, r, c)) })).filter((x) => x.c >= 2 && x.t);
      const asParams = heads.map((h) => ({ ...h, cp: canon(h.t) })).filter((h) => h.cp && h.cp.param !== '__obs');
      const asEquip = heads.filter((h) => EQUIP.includes(norm(h.t)));
      let k = r + 1;
      for (; k <= maxR; k++) {
        const lab = text(ws, k, 1);
        if (!lab) break;
        const nl = norm(lab);
        if (/^(\d\.|control|parametros|torres$|fecha|estado|informe|laboratorista|agua de)/.test(nl)) break;
        if (asParams.length && section === 'glicol' && nl !== 'glicol') break;
        if (asEquip.length) {
          const cp = canon(rawText(getCell(ws, k, 1)));
          if (!cp) continue;
          for (const h of asEquip) addVal(k, h.c, INST.CALDERAS, h.t, cp);
        } else if (asParams.length) {
          const inst = section === 'glicol' || norm(lab) === 'glicol' ? INST.GLICOL : INST.TORRES;
          for (const h of asParams) addVal(k, h.c, inst, lab, h.cp);
        }
      }
      r = k - 1;
      continue;
    }
    // Formato informe: fila con nombres de equipos (Condensado 1 / Condensado 2 / Descalcificador / Caldera 1 / Caldera 2)
    const eqCols = row.map((t, c) => (EQUIP.includes(norm(t)) ? c : -1)).filter((c) => c >= 0);
    if (eqCols.length) {
      const hr = nextNonEmpty(r);
      const vr = hr >= 0 ? nextNonEmpty(hr) : -1;
      if (hr >= 0 && vr >= 0) {
        handleEstado(hr, rowTexts(hr));
        for (let c = eqCols[0]; c <= maxC; c++) {
          const ht = rawText(getCell(ws, hr, c));
          const cp = ht ? canon(ht) : null;
          if (!cp || cp.param === '__obs') continue;
          const owner = eqCols.filter((e) => e <= c).pop();
          if (owner == null) continue;
          addVal(vr, c, INST.CALDERAS, row[owner], cp);
        }
        r = vr;
      }
      continue;
    }
    // Formato informe: tabla de torres ("TORREs" | Biocida | Turbidez | Conductividad | pH | T °C | COMENTARIO)
    if (bn === 'torres' && row.some((t, i) => i > 1 && canon(t))) {
      const heads = row.map((t, c) => ({ c, t: rawText(getCell(ws, r, c)) })).filter((x) => x.c >= 2 && x.t).map((h) => ({ ...h, cp: canon(h.t) })).filter((h) => h.cp);
      let k = r + 1;
      for (; k <= maxR; k++) {
        const lab = text(ws, k, 1);
        if (!lab || norm(lab).startsWith('fecha')) break;
        for (const h of heads) {
          if (h.cp.param === '__obs') {
            const t = text(ws, k, h.c);
            if (t && cur) ctx.obs.push({ d: cur, inst: INST.TORRES, text: t, sheet: name, cell: addr(k, h.c), kind: 'Torres' });
          } else addVal(k, h.c, INST.TORRES, lab, h.cp);
        }
      }
      r = k - 1;
      continue;
    }
    // Glicol en formato informe: fila "Parámetros" ya tratada; fila "Glicol" suelta
  }
  S.rows = dates.size;
  if (undated.length) {
    const lo = Math.min(...undated), hi = Math.max(...undated);
    ctx.issue({ sheet: name, level: 'warn', type: 'nodate', msg: `Hay un bloque sin fecha al principio de la hoja (filas ${lo}-${hi}): sus valores no se cargan porque no se puede saber a qué día pertenecen.` });
    S.notes.push(`Bloque sin fecha (filas ${lo}-${hi}) descartado`);
  }
}

// ---------------------------------------------------------------------------
// Tablas con cabecera de dos filas (AGUA POTABLE) o de tres (ÓSMOSIS)
// ---------------------------------------------------------------------------
function parseAguaPotable(ctx, ws) {
  const name = 'AGUA POTABLE';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  const cols = [];
  for (let c = 1; c <= maxC; c++) {
    const g = headerText(ws, 0, c), p = text(ws, 1, c);
    if (!g || !p) continue;
    const sl = splitLabel(g);
    cols.push({ c, param: sl.main, unit: sl.unit, point: p.replace(/"/g, '"') });
  }
  if (!cols.length) { S.status = 'header-changed'; ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: 'Cabecera de AGUA POTABLE no reconocida.' }); return; }
  const emptyDates = [];
  for (let r = 2; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, 0));
    if (!d) continue;
    S.rows++;
    let any = false;
    for (const col of cols) {
      const cl = classifyAt(ws, r, col.c);
      ctx.add({ d, inst: INST.POTABLE, point: col.point, param: col.param, unit: col.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, col.c) });
      if (isValue(cl.flag)) any = true;
    }
    if (!any) emptyDates.push(fmt(d));
  }
  if (emptyDates.length) ctx.issue({ sheet: name, level: 'info', type: 'emptyrow', msg: `Fechas sin ningún dato: ${emptyDates.join(', ')}.` });
}

function parseFructalys(ctx, ws) {
  const name = 'FRUCTALYS';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  let dateCol = -1;
  const cols = [];
  for (let c = 0; c <= maxC; c++) {
    const h = rawText(getCell(ws, 0, c));
    if (!h) continue;
    if (norm(h).startsWith('fecha')) { dateCol = c; continue; }
    const sl = splitLabel(h);
    const unit = sl.unit || (sl.rest && /^(u|µ|μ)?s\/cm|mg\/l|ntu|ppm$/i.test(sl.rest) ? sl.rest : '');
    cols.push({ c, param: sl.main, unit });
  }
  if (dateCol < 0) { S.status = 'header-changed'; ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: 'No se encuentra la columna de fechas en FRUCTALYS.' }); return; }
  const emptyDates = [];
  for (let r = 1; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, dateCol));
    if (!d) continue;
    S.rows++;
    let any = false;
    for (const col of cols) {
      const cl = classifyAt(ws, r, col.c);
      ctx.add({ d, inst: INST.FRUCTALYS, point: 'Fructalys', param: col.param, unit: col.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, col.c) });
      if (isValue(cl.flag)) any = true;
      if (cl.flag === FLAG.GT) ctx.issue({ sheet: name, cell: addr(r, col.c), type: 'gt', msg: `${col.param} el ${fmt(d)}: "${cl.raw}" (fuera de rango del método, sin valor numérico).`, raw: cl.raw });
    }
    if (!any) emptyDates.push(fmt(d));
  }
  if (emptyDates.length) ctx.issue({ sheet: name, level: 'info', type: 'emptyrow', msg: `Fechas sin ningún dato: ${emptyDates.join(', ')}.` });
}

function parseOsmosis(ctx, ws, name, inst) {
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  let dateCol = -1;
  const cols = [];
  for (let c = 0; c <= maxC; c++) {
    const g1 = headerText(ws, 0, c), g2 = headerText(ws, 1, c), g3 = rawText(getCell(ws, 2, c));
    if (!g1 && !g2 && !g3) continue;
    const n1 = norm(g1);
    if (n1 === 'fecha') { dateCol = c; continue; }
    if (n1 === 'nº' || n1 === 'n°') continue;
    let point, label;
    if (n1 === 'modulos') { point = tidy(g2); label = g3; }
    else if (g2 && g2 !== g1) { point = tidy(splitLabel(g1).main); label = g3 && g3 !== g2 ? g3 : g2; }
    else { point = tidy(splitLabel(g1).main); label = g1; }
    const sl = splitLabel(label);
    let param = sl.main, unit = sl.unit;
    if (!unit && sl.rest) unit = normUnit(sl.rest.replace(/[()]/g, '').trim());
    if (norm(param) === 'ph') param = 'pH';
    if (/^c\.e\.$/i.test(param)) param = 'C.E.';
    if (label === g1 && label.includes('\n')) { param = tidy(sl.main); unit = sl.rest; }
    if (/\(L\/M\)/.test(label) && /m³\/h/.test(label)) {
      unit = '';
      param = label.replace(/\s+/g, ' ').trim().replace(/^CAUDAL PRODUCTO/, 'Caudal producto');
      point = 'Caudal producto';
      ctx.issue({ sheet: name, cell: addr(0, c), level: 'warn', type: 'header', msg: `Cabecera con dos unidades ("${label.replace(/\n/g, ' ')}"): se muestra sin unidad.` });
    }
    if (norm(point) === 'consumo electrico' && !unit && /^hz/i.test(param)) unit = 'Hz';
    cols.push({ c, point, param: tidy(param), unit });
  }
  if (dateCol < 0) { S.status = 'header-changed'; ctx.issue({ sheet: name, level: 'warn', type: 'header', msg: `No se encuentra la columna FECHA en ${name}.` }); return; }
  let template = 0;
  const emptyDates = [];
  for (let r = 3; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, dateCol));
    if (!d) { template++; continue; }
    S.rows++;
    let any = false;
    for (const col of cols) {
      const cl = classifyAt(ws, r, col.c);
      ctx.add({ d, inst, point: col.point, param: col.param, unit: col.unit, v: cl.v, flag: cl.flag, raw: cl.raw, bound: cl.bound, sheet: name, cell: addr(r, col.c) });
      if (isValue(cl.flag)) any = true;
    }
    if (!any) emptyDates.push(fmt(d));
  }
  if (template) ctx.issue({ sheet: name, level: 'info', type: 'template', msg: `${template} filas de plantilla vacías (solo con Nº, sin fecha) al final de la hoja.` });
  if (emptyDates.length) ctx.issue({ sheet: name, level: 'warn', type: 'emptyrow', msg: `Fechas sin ningún dato: ${emptyDates.join(', ')}.` });
}

// ---------------------------------------------------------------------------
// Reg. Fot. y Hoja2 (solo tablas de consulta)
// ---------------------------------------------------------------------------
function parseRegFot(ctx, ws) {
  const name = 'Reg. Fot.';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  let siCol = -1, noCol = -1;
  for (let c = 0; c <= maxC; c++) { const t = norm(text(ws, 1, c)); if (t === 'si') siCol = c; if (t === 'no') noCol = c; }
  for (let r = 2; r <= maxR; r++) {
    const d = readDate(getCell(ws, r, 1));
    if (!d) continue;
    S.rows++;
    ctx.tables.regFot.push({
      d, n: text(ws, r, 0), ruta: text(ws, r, 2),
      muestra: siCol >= 0 && norm(text(ws, r, siCol)) === 'x' ? 'SI' : noCol >= 0 && norm(text(ws, r, noCol)) === 'x' ? 'NO' : 'n/d',
      cell: addr(r, 2),
    });
  }
  S.notes.push('Rutas locales de otro equipo: solo se listan, sin enlace.');
}

function parseHoja2(ctx, ws) {
  const name = 'Hoja2';
  const S = ctx.sheet(name);
  const { maxR, maxC } = sheetBounds(ws);
  // Rejilla de celdas no vacías (tabla puntual sin fecha)
  let r0 = Infinity, c0 = Infinity;
  for (let r = 0; r <= maxR; r++) for (let c = 0; c <= maxC; c++) if (text(ws, r, c)) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); }
  const grid = [];
  for (let r = r0; r <= maxR; r++) {
    const row = [];
    for (let c = c0; c <= maxC; c++) row.push(rawText(getCell(ws, r, c)));
    if (row.some(Boolean)) grid.push(row);
  }
  ctx.tables.hoja2 = grid;
  S.rows = grid.length;
  S.notes.push('Tabla puntual sin fecha: se muestra solo como consulta.');
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------
const PARSERS = {
  EDARI: parseEDARI,
  DQO: (c, w) => parseLab(c, w, 'DQO'),
  'SST LM': (c, w) => parseLab(c, w, 'SST LM'),
  PH: (c, w) => parseLab(c, w, 'PH'),
  'C.E.': (c, w) => parseLab(c, w, 'C.E.'),
  'O.D. B2': (c, w) => parseLab(c, w, 'O.D. B2'),
  'NITRITO NO2': (c, w) => parseLab(c, w, 'NITRITO NO2'),
  NITRATOS: (c, w) => parseLab(c, w, 'NITRATOS'),
  'FÓSFORO': (c, w) => parseLab(c, w, 'FÓSFORO'),
  AMONIACO: (c, w) => parseLab(c, w, 'AMONIACO'),
  Hoja1: (c, w) => parseLab(c, w, 'Hoja1'),
  'D. UREA': parseUrea,
  TORRES: parseTorres,
  'CALDERAS Y TORRES': parseCalderas,
  'AGUA POTABLE': parseAguaPotable,
  FRUCTALYS: parseFructalys,
  'PAR. PLANTA O': (c, w) => parseOsmosis(c, w, 'PAR. PLANTA O', INST.OSMO_O),
  'PAR. PLANTA P': (c, w) => parseOsmosis(c, w, 'PAR. PLANTA P', INST.OSMO_P),
  'Reg. Fot.': parseRegFot,
  Hoja2: parseHoja2,
};

function fixMojibake(s) {
  if (!/[ÃÂ]/.test(s)) return s;
  try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
}

function fmt(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

/** Busca una hoja tolerando mayúsculas, tildes y espacios. */
function findSheet(wb, expected) {
  if (wb.Sheets[expected]) return expected;
  const n = norm(expected);
  return wb.SheetNames.find((s) => norm(s) === n) || null;
}

/**
 * Punto de entrada. Recibe un workbook de SheetJS (leído con cellFormula: true).
 * Devuelve { records, obs, issues, sheets, tables, limits, meta }.
 */
export function parseWorkbook(wb, { fileName = '' } = {}) {
  const ctx = new Ctx();
  const used = new Set();
  for (const exp of EXPECTED_SHEETS) {
    const real = findSheet(wb, exp);
    const S = ctx.sheet(exp);
    if (!real) {
      S.status = 'missing';
      ctx.issue({ sheet: exp, level: 'warn', type: 'missing', msg: `Falta la hoja "${exp}". El resto del dashboard sigue funcionando.` });
      continue;
    }
    used.add(real);
    if (real !== exp) S.notes.push(`Leída como "${real}"`);
    if (OMITTED[exp]) { S.status = 'omitted'; S.notes.push(OMITTED[exp]); continue; }
    try {
      PARSERS[exp](ctx, wb.Sheets[real]);
    } catch (e) {
      S.status = 'error';
      ctx.issue({ sheet: exp, level: 'warn', type: 'error', msg: `Error al leer la hoja "${exp}": ${e.message}. Se continúa con el resto.` });
    }
  }
  for (const s of wb.SheetNames) {
    if (!used.has(s)) {
      const S = ctx.sheet(s);
      S.status = 'unknown';
      ctx.issue({ sheet: s, level: 'info', type: 'unknown', msg: `Hoja "${s}" no reconocida: se ignora.` });
    }
  }

  // Comentarios de celda del Excel (p. ej. notas de dilución): se adjuntan al registro.
  let empties = 0;
  for (const r of ctx.records) {
    if (r.flag === FLAG.EMPTY && String(r.raw).startsWith('=')) empties++;
    const real = findSheet(wb, r.sheet);
    const cell = real && wb.Sheets[real][r.cell];
    if (cell && cell.c && cell.c.length) r.note = cell.c.map((x) => fixMojibake(String(x.t || '')).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
  }
  if (empties) ctx.issue({ sheet: 'EDARI', level: 'info', type: 'formulaEmpty', msg: `${empties} celdas con fórmula que depende de celdas vacías (Excel muestra 0): se tratan como sin dato.` });

  // Duplicados exactos entre hojas (p. ej. Hoja1 repite la DQO de julio de la hoja DQO).
  const seen = new Map();
  let dups = 0;
  const keep = [];
  for (const r of ctx.records) {
    if (isValue(r.flag)) {
      const k = `${r.d}|${r.inst}|${r.point}|${r.param}|${r.v}|${r.shift || ''}`;
      const prev = seen.get(k);
      if (prev && prev.sheet !== r.sheet) {
        dups++;
        if (!prev.time && r.time) prev.time = r.time;
        prev.alsoIn = (prev.alsoIn ? prev.alsoIn + ', ' : '') + `${r.sheet}!${r.cell}`;
        continue;
      }
      seen.set(k, r);
    }
    keep.push(r);
  }
  if (dups) ctx.issue({ sheet: 'Hoja1', level: 'info', type: 'duplicate', msg: `${dups} valores repetidos idénticos en otra hoja (misma fecha, punto y valor): se cuentan una sola vez.` });
  ctx.records = keep;

  ctx.limits.efectividad = ctx.limits.efectividad || FALLBACK_LIMITS.efectividad;
  ctx.limits.sst = ctx.limits.sst || FALLBACK_LIMITS.sst;

  ctx.obs.sort((a, b) => (a.d < b.d ? -1 : 1));
  const vals = ctx.records.filter((r) => isValue(r.flag));
  const edari = vals.filter((r) => r.sheet === 'EDARI');
  const meta = {
    fileName,
    parsedAt: new Date().toISOString(),
    sheetCount: wb.SheetNames.length,
    records: ctx.records.length,
    values: vals.length,
    dmin: vals.reduce((m, r) => (!m || r.d < m ? r.d : m), null),
    dmax: vals.reduce((m, r) => (!m || r.d > m ? r.d : m), null),
    edariMin: edari.reduce((m, r) => (!m || r.d < m ? r.d : m), null),
    edariMax: edari.reduce((m, r) => (!m || r.d > m ? r.d : m), null),
  };
  return { records: ctx.records, obs: ctx.obs, issues: ctx.issues, sheets: ctx.sheets, tables: ctx.tables, limits: ctx.limits, meta };
}
