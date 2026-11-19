// Sinópticos (esquemas de instalación) dibujados en SVG con el análisis de laboratorio de un día.
// Son orientativos: muestran el orden del proceso y los puntos de muestreo del Excel, no la planta en tiempo real
// ni niveles de depósito (no se miden). Colores: semáforo del límite activo de cada valor.
import { state, sel } from '../store.js';
import { fmtNum, esc } from './format.js';
import { limitFor, evaluate, limitText, SRC_LABEL } from '../limits.js';

const val = (inst, point, param, d) => {
  const r = state.data.records.find((x) => x.inst === inst && x.point === point && x.param === param && x.d === d && x.v != null);
  return r ? r.v : null;
};
const raw = (inst, point, param, d) => {
  const r = state.data.records.find((x) => x.inst === inst && x.point === point && x.param === param && x.d === d);
  // Solo textos con sentido (p. ej. ">60000"); una fórmula sin resultado se muestra como sin dato.
  return r && r.v == null && r.raw && !String(r.raw).startsWith('=') ? r.raw : null;
};
const worstOf = (sts) => (sts.includes('bad') ? 'bad' : sts.includes('warn') ? 'warn' : sts.includes('good') ? 'good' : 'none');

/** Valor con su estado frente al límite activo. */
function reading(inst, point, param, d, unit = '') {
  const v = val(inst, point, param, d);
  const lim = limitFor(state.data, inst, point, param);
  return { param, v, raw: raw(inst, point, param, d), unit, lim, st: v == null ? 'none' : evaluate(lim, v) };
}

// ---------- Piezas de dibujo ----------
const T = (x, y, s, cls = '', anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${s}</text>`;

/** Etiqueta de equipo: nombre y lista de lecturas, con el punto de color de cada una. */
function tag(x, y, title, rows, w = 150) {
  const h = 22 + rows.length * 17;
  const st = worstOf(rows.map((r) => r.st));
  return `<g class="syn-tag st-${st}" transform="translate(${x - w / 2},${y})">
    <rect width="${w}" height="${h}" rx="9"/>
    ${T(10, 16, esc(title), 'syn-tag-t', 'start')}
    ${rows.map((r, i) => `<g transform="translate(0,${32 + i * 17})">
      <circle cx="13" cy="-4" r="3.6" class="dot-${r.st}"/>
      ${T(22, 0, esc(r.label || r.param), 'syn-k', 'start')}
      ${T(w - 9, 0, r.v == null ? esc(r.raw || '–') : `${fmtNum(r.v, r.param)}${r.unit ? ' ' + esc(r.unit) : ''}`, 'syn-v', 'end')}
      <title>${esc(`${r.param}: ${r.v == null ? r.raw || 'sin dato' : fmtNum(r.v, r.param)} ${r.unit}${r.lim ? ` · ${SRC_LABEL[r.lim.src]} ${limitText(r.lim)}` : ' · sin límite'}`)}</title>
    </g>`).join('')}
  </g>`;
}

/** Depósito vertical (cilindro). */
const tank = (x, y, w, h, st, label) => `<g class="syn-eq st-${st}">
  <path d="M${x},${y + 8} v${h - 16} a${w / 2},8 0 0 0 ${w},0 v${-(h - 16)}" class="syn-body"/>
  <ellipse cx="${x + w / 2}" cy="${y + 8}" rx="${w / 2}" ry="8" class="syn-top"/>
  <path d="M${x + 4},${y + h * 0.42} q${w / 4},-6 ${w / 2 - 4},0 t${w / 2 - 4},0" class="syn-wave"/>
  ${T(x + w / 2, y + h + 22, esc(label), 'syn-name')}</g>`;

/** Balsa o reactor abierto (rectángulo bajo el nivel del suelo). */
const basin = (x, y, w, h, st, label, extra = '') => `<g class="syn-eq st-${st}">
  <path d="M${x},${y} v${h} h${w} v${-h}" class="syn-body"/>
  <rect x="${x + 3}" y="${y + h * 0.28}" width="${w - 6}" height="${h * 0.72 - 3}" class="syn-water"/>
  ${extra}
  ${T(x + w / 2, y + h + 22, esc(label), 'syn-name')}</g>`;

/** Tubería con flecha de sentido y etiqueta opcional encima. */
function pipe(points, label = '', cls = '') {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const [a, b] = [points[points.length - 2], points[points.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const mid = points.length === 2 ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : points[1];
  return `<g class="syn-pipe ${cls}"><path d="${d}"/><path d="${d}" class="syn-flow"/>
    <polygon points="0,-5 9,0 0,5" transform="translate(${b[0]},${b[1]}) rotate(${ang}) translate(-9,0)" class="syn-arrow"/>
    ${label ? `<g transform="translate(${mid[0]},${mid[1] - 12})">${label}</g>` : ''}</g>`;
}
const pct = (txt, up) => `<rect x="-26" y="-11" width="52" height="18" rx="9" class="syn-pct ${up ? 'up' : ''}"/>${T(0, 2, txt, `syn-pct-t ${up ? 'up' : ''}`)}`;

/**
 * Indicador de aguja semicircular: valor frente a su límite. Las zonas verde, ámbar y roja salen del propio
 * semáforo (evaluate), así que sirve igual para límites con máximo, con mínimo o con banda (mín–máx).
 */
function gauge(cx, cy, r, v, lim, label, unit, { scale } = {}) {
  let max = scale || (lim && lim.max != null ? lim.max * 1.4 : lim && lim.min != null ? lim.min * 1.6 : (v || 1) * 1.5);
  const a = (x) => Math.PI * (1 - Math.max(0, Math.min(1, x / max)));
  const pt = (x, rr = r) => [cx + rr * Math.cos(a(x)), cy - rr * Math.sin(a(x))];
  const arc = (from, to, cls) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" class="${cls}"/>`; };
  const st = v == null ? 'none' : evaluate(lim, v);
  let zones = '';
  if (lim) {
    const N = 90;
    let from = 0, cur = evaluate(lim, max * 0.5 / N);
    for (let i = 1; i <= N; i++) {
      const s = i < N ? evaluate(lim, (max * (i + 0.5)) / N) : null;
      if (s !== cur) { zones += arc((max * from) / N, (max * i) / N, `g-${cur}`); from = i; cur = s; }
    }
  } else zones = arc(0, max, 'g-none');
  const [nx, ny] = v == null ? [cx, cy] : pt(Math.min(v, max), r - 8);
  return `<g class="syn-gauge">${zones}
    ${v == null ? '' : `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" class="g-needle"/>`}<circle cx="${cx}" cy="${cy}" r="4" class="g-hub"/>
    ${T(cx, cy + 18, v == null ? '–' : fmtNum(v, ''), `g-val t-${st}`)}${T(cx, cy + 31, esc(unit), 'syn-k')}
    ${T(cx, cy - r - 8, esc(label), 'syn-k')}
    <title>${esc(`${label}: ${v == null ? 'sin dato' : fmtNum(v, '')} ${unit}${lim ? ` · ${SRC_LABEL[lim.src]} ${limitText(lim)}` : ''}`)}</title></g>`;
}

// ---------- EDARI ----------
export function edariSVG(d) {
  const E = 'EDARI';
  const r = (pt, param, unit, label) => ({ ...reading(E, pt, param, d, unit), label: label || param });
  const dqo = (pt) => val(E, pt, 'DQO', d);
  const red = (a, b) => { const x = dqo(a), y = dqo(b); return x && y != null ? ((x - y) / x) * 100 : null; };
  const lbl = (p) => (p == null ? '' : pct(p >= 0 ? `−${fmtNum(p, '', 0)} %` : `+${fmtNum(-p, '', 0)} %`, p < 0));
  const ef = reading(E, 'Homo → Permeado', 'Efectividad', d, '%');
  const odV = ['B2 · Mañana', 'B2 · Tarde', 'B2 · Noche'].map((p) => val(E, p, 'O.D.', d)).filter((x) => x != null);
  const od = { param: 'O.D.', label: 'O.D. medio', v: odV.length ? odV.reduce((a, b) => a + b, 0) / odV.length : null, unit: 'ppm', lim: limitFor(state.data, E, 'B2 · Mañana', 'O.D.') };
  od.st = od.v == null ? 'none' : evaluate(od.lim, od.v);
  const stOf = (rows) => worstOf(rows.map((x) => x.st));
  const tags = {
    ent: [r('Entrada', 'DQO', 'mg/L'), r('Entrada', 'pH', ''), r('Entrada', 'SST', 'mg/L')],
    homo: [r('Homo', 'DQO', 'mg/L'), r('Homo', 'pH', ''), r('Homo', 'Temperatura', '°C', 'Temp.')],
    daf: [r('DAF', 'DQO', 'mg/L'), r('DAF', 'pH', ''), r('DAF', 'SST', 'mg/L')],
    perm: [r('Permeado', 'DQO', 'mg/L'), r('Permeado', 'pH', ''), r('Permeado', 'SST', 'mg/L')],
    side: ['Balsa N', 'Chulives', 'Tanque gris'].map((p) => [p, [r(p, 'DQO', 'mg/L'), r(p, 'pH', '')]]),
  };
  // Reactores biológicos: todos los puntos "Bio N" que trae el Excel (Bio 0, Bio 1, Bio 2…), cada uno con
  // los parámetros que tiene medidos. El O.D. (hoja O.D. B2) solo corresponde a Bio 2.
  const cat = (sel().catalog || {})[E] || {};
  const has = (pt, param) => !!(cat[param] && cat[param].points[pt]);
  const bioPts = [...new Set(state.data.records.filter((x) => x.inst === E && /^Bio \d+$/.test(x.point)).map((x) => x.point))]
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
  if (!bioPts.length) bioPts.push('Bio 2');
  const bios = bioPts.map((pt) => {
    const rows = [];
    if (has(pt, 'SST')) rows.push({ ...reading(E, pt, 'SST', d, 'mg/L'), label: 'SST' });
    if (has(pt, 'pH')) rows.push(r(pt, 'pH', ''));
    if (pt === 'Bio 2') rows.push(od);
    if (has(pt, 'Temperatura')) rows.push(r(pt, 'Temperatura', '°C', 'Temp.'));
    return { pt, rows };
  });
  const BX = 600, BW = bios.length > 1 ? 150 : 200, GAP = 14;
  const bioEnd = BX + bios.length * BW + (bios.length - 1) * GAP;
  const S = Math.max(0, bioEnd - 800); // lo que se desplaza todo lo que va después del biológico
  const bubbles = (x, w) => Array.from({ length: Math.round(w / 15) }, (_, i) => `<circle cx="${x + 12 + (i % Math.ceil(w / 30)) * 26 + (i % 2 ? 13 : 0)}" cy="${232 - (i % 2 ? 22 : 0)}" r="${2 + (i % 3)}" class="syn-bubble" style="animation-delay:${(i * 0.23).toFixed(2)}s"/>`).join('');
  const bioSvg = bios.map((b, i) => {
    const x = BX + i * (BW + GAP);
    return `${basin(x, 186, BW, 120, stOf(b.rows), b.pt, bubbles(x, BW))}${tag(x + BW / 2, 340, b.pt, b.rows, Math.min(168, BW + GAP - 6))}`;
  }).join('');
  return `<svg viewBox="0 0 ${1240 + S} 470" class="synoptic" role="img" aria-label="Esquema de la EDARI con el análisis del día">
    <!-- Entrada -->
    ${basin(40, 186, 90, 120, stOf(tags.ent), 'Entrada')}
    ${pipe([[0, 230], [40, 230]], '', 'in')}
    ${tag(85, 8, 'Entrada', tags.ent, 150)}
    <!-- Homogeneizador -->
    ${pipe([[130, 220], [175, 220], [175, 120], [212, 120]], lbl(red('Entrada', 'Homo')))}
    ${tank(212, 70, 110, 190, stOf(tags.homo), 'Homo')}
    ${tag(267, 330, 'Homo', tags.homo, 150)}
    <!-- DAF -->
    ${pipe([[322, 200], [400, 200]], lbl(red('Homo', 'DAF')))}
    <g class="syn-eq st-${stOf(tags.daf)}">
      <rect x="400" y="130" width="150" height="100" rx="6" class="syn-body"/>
      <rect x="404" y="160" width="142" height="66" class="syn-water"/>
      ${Array.from({ length: 9 }, (_, i) => `<circle cx="${418 + i * 15}" cy="${212 - (i % 3) * 14}" r="2.4" class="syn-bubble" style="animation-delay:${(i * 0.3).toFixed(2)}s"/>`).join('')}
      ${T(475, 252, 'DAF', 'syn-name')}
    </g>
    ${tag(475, 8, 'DAF', tags.daf, 150)}
    <!-- Biológico -->
    ${pipe([[550, 200], [BX, 200]], '')}
    ${bios.length > 1 ? `<rect x="${BX - 8}" y="170" width="${bioEnd - BX + 16}" height="146" rx="10" class="syn-group"/>${T((BX + bioEnd) / 2, 162, 'Biológico', 'syn-k')}` : ''}
    ${bioSvg}
    <!-- Permeado -->
    ${pipe([[bioEnd, 230], [860 + S, 230]], '')}
    <g class="syn-eq st-${stOf(tags.perm)}">
      <rect x="${860 + S}" y="150" width="80" height="120" rx="6" class="syn-body"/>
      ${Array.from({ length: 7 }, (_, i) => `<line x1="${872 + S + i * 9.5}" y1="160" x2="${872 + S + i * 9.5}" y2="260" class="syn-membrane"/>`).join('')}
      ${T(900 + S, 292, 'Permeado', 'syn-name')}
    </g>
    ${pipe([[940 + S, 180], [1040 + S, 180]], lbl(red('DAF', 'Permeado')), 'out')}
    ${tag(990 + S, 8, 'Permeado', tags.perm, 150)}
    <!-- Efectividad -->
    <g class="syn-kpi st-${ef.st}" transform="translate(${1050 + S},120)">
      <rect width="170" height="112" rx="14"/>
      ${T(85, 26, 'Efectividad', 'syn-k')}
      ${T(85, 66, ef.v == null ? '–' : `${fmtNum(ef.v, 'Efectividad')} %`, `syn-big t-${ef.st}`)}
      ${T(85, 90, ef.lim ? `${SRC_LABEL[ef.lim.src]} ${limitText(ef.lim)}` : '', 'syn-k')}
      <title>Efectividad = (DQO Homo − DQO Permeado) / DQO Homo × 100</title>
    </g>
    <!-- Otros puntos -->
    ${T(890 + S, 336, 'Otros puntos de muestreo', 'syn-name', 'start')}
    ${tags.side.map(([p, rows], i) => tag(948 + S + i * 104, 346, p, rows, 98)).join('')}
  </svg>`;
}

// ---------- Calderas y torres ----------
export function calderasSVG(d) {
  const C = 'Calderas';
  const r = (pt, param, unit, label) => ({ ...reading(C, pt, param, d, unit), label: label || param });
  const feed = val(C, 'Descalcificador', 'Conductividad', d);
  const cyc = (b) => { const v = val(C, b, 'Conductividad', d); return v != null && feed ? v / feed : null; };
  const boiler = (x, name) => {
    const rows = [r(name, 'pH', ''), r(name, 'Dureza (titulación)', '', 'Dureza'), r(name, 'Turbidez', 'NTU')];
    const cond = reading(C, name, 'Conductividad', d, 'µS/cm');
    const st = worstOf([cond.st, ...rows.map((z) => z.st)]);
    const c = cyc(name);
    return `<g class="syn-eq st-${st}">
      <rect x="${x}" y="190" width="230" height="96" rx="48" class="syn-body"/>
      <rect x="${x + 22}" y="222" width="186" height="58" rx="22" class="syn-water"/>
      <rect x="${x + 180}" y="140" width="22" height="52" class="syn-body"/>
      <path d="M${x + 186},134 q6,-12 0,-24 M${x + 196},132 q6,-12 0,-24" class="syn-steam"/>
      <path d="M${x - 18},250 l18,-10 v20 z" class="syn-flame"/>
      ${T(x + 115, 310, esc(name), 'syn-name')}
    </g>
    ${pipe([[x + 150, 190], [x + 150, 40]], '', 'steam')}
    ${gauge(x + 66, 136, 44, cond.v, cond.lim, 'Conductividad', 'µS/cm')}
    ${tag(x + 115, 326, name, [...rows, { param: 'Ciclos', label: 'Ciclos conc.', v: c, unit: '', st: 'none' }], 168)}`;
  };
  const cond1 = r('Condensado 1', 'Conductividad', 'µS/cm', 'Cond.'), cond2 = r('Condensado 2', 'Conductividad', 'µS/cm', 'Cond.');
  const desc = [r('Descalcificador', 'Dureza (titulación)', '', 'Dureza'), r('Descalcificador', 'Conductividad', 'µS/cm', 'Cond.'), r('Descalcificador', 'pH', '')];
  const gl = [reading('Glicol', 'Glicol', 'pH', d, ''), { ...reading('Glicol', 'Glicol', 'T Cg.', d, '°C'), label: 'T. congel.' }];
  return `<svg viewBox="0 0 1240 470" class="synoptic" role="img" aria-label="Esquema de calderas con el análisis del día">
    <!-- Descalcificador -->
    <g class="syn-eq st-${worstOf(desc.map((x) => x.st))}">
      <rect x="40" y="140" width="64" height="150" rx="30" class="syn-body"/>
      ${Array.from({ length: 18 }, (_, i) => `<circle cx="${54 + (i % 4) * 12}" cy="${170 + Math.floor(i / 4) * 22}" r="4" class="syn-resin"/>`).join('')}
      ${T(72, 312, 'Descalcificador', 'syn-name')}
    </g>
    ${tag(72, 330, 'Descalcificador', desc, 150)}
    ${pipe([[0, 200], [40, 200]], '', 'in')}
    ${pipe([[104, 215], [180, 215], [180, 240], [230, 240]], '')}
    ${pipe([[180, 215], [180, 72], [610, 72], [610, 240], [640, 240]], '')}
    <!-- Vapor y condensados -->
    ${pipe([[400, 40], [1060, 40]], '', 'steam')}
    ${T(1068, 44, 'Vapor', 'syn-k', 'start')}
    ${boiler(250, 'Caldera 1')}
    ${boiler(660, 'Caldera 2')}
    ${pipe([[1120, 56], [1120, 140]], '', 'cond')}
    <g class="syn-eq st-${worstOf([cond1.st, cond2.st])}">
      <rect x="1080" y="140" width="80" height="90" rx="8" class="syn-body"/><rect x="1084" y="176" width="72" height="50" class="syn-water"/>
      ${T(1120, 252, 'Condensados', 'syn-name')}
    </g>
    ${tag(1120, 270, 'Condensado 1 y 2', [{ ...cond1, label: 'Cond. 1' }, { ...cond2, label: 'Cond. 2' }, r('Condensado 1', 'pH', '', 'pH 1'), r('Condensado 2', 'pH', '', 'pH 2')], 170)}
    ${pipe([[1080, 200], [1000, 200], [1000, 290], [915, 290]], '', 'cond')}
    <!-- Glicol -->
    <g class="syn-eq st-${worstOf(gl.map((x) => x.st))}" transform="translate(960,350)">
      <rect width="70" height="60" rx="10" class="syn-body"/>
      <path d="M35,14 v32 M21,22 l28,16 M21,38 l28,-16" class="syn-snow"/>
      ${T(35, 80, 'Glicol', 'syn-name')}
    </g>
    ${tag(1140, 380, 'Glicol', gl, 150)}
  </svg>`;
}

// ---------- Agua potable ----------
export function potableSVG(d) {
  const P = 'Agua potable';
  const pts = [['Entrada "P"', 'Entrada «P»'], ['Tanque "P"', 'Tanque «P»'], ['Salida "P"', 'Salida «P»']];
  const xs = [150, 620, 1050];
  const block = ([pt, name], i) => {
    const x = xs[i];
    const cl = reading(P, pt, 'Cloro libre', d, 'mg/L');
    const tot = { ...reading(P, pt, 'Cloro total', d, 'mg/L'), label: 'Cloro total' };
    const comb = { param: 'Cloro combinado', label: 'Combinado (calc.)', unit: 'mg/L', st: 'none', v: cl.v != null && tot.v != null ? Math.max(0, tot.v - cl.v) : null };
    const ce = { ...reading(P, pt, 'Conductividad', d, 'µS/cm'), label: 'Conductividad' };
    const st = worstOf([cl.st, ce.st]);
    const shape = i === 1
      ? `<path d="M${x - 75},120 v130 a75,14 0 0 0 150,0 v-130" class="syn-body"/><ellipse cx="${x}" cy="120" rx="75" ry="14" class="syn-top"/><path d="M${x - 70},176 q18,-7 35,0 t35,0 t35,0 t35,0" class="syn-wave"/><rect x="${x - 71}" y="178" width="142" height="80" class="syn-water"/>`
      : `<circle cx="${x}" cy="190" r="34" class="syn-body"/><path d="M${x - 16},190 h32 M${x},174 v32" class="syn-blade"/>`;
    return `<g class="syn-eq st-${st}">${shape}${T(x, 296, esc(name), 'syn-name')}</g>
      ${gauge(x + (i === 1 ? 150 : 110), 120, 44, cl.v, cl.lim, 'Cloro libre', 'mg/L', { scale: 1.5 })}
      ${tag(x + (i === 1 ? 40 : 30), 330, name, [{ ...cl, label: 'Cloro libre' }, tot, comb, ce], 220)}`;
  };
  return `<svg viewBox="0 55 1240 395" class="synoptic" role="img" aria-label="Esquema de agua potable con el análisis del día">
    ${pipe([[0, 190], [116, 190]], '', 'in')}
    ${pipe([[184, 190], [545, 190]], '')}
    ${pipe([[695, 190], [1016, 190]], '')}
    ${pipe([[1084, 190], [1230, 190]], '', 'out')}
    ${pts.map(block).join('')}
  </svg>`;
}

// ---------- Fructalys ----------
export function fructalysSVG(d) {
  const F = 'Fructalys';
  const dqoR = reading(F, F, 'DQO', d, 'mg/L');
  const gtRec = state.data.records.find((x) => x.inst === F && x.param === 'DQO' && x.d === d && x.flag === 'gt');
  const top = 70000, ceiling = 60000;
  const ph = reading(F, F, 'pH', d, '');
  const rows = [{ ...reading(F, F, 'Temperatura', d, '°C'), label: 'Temperatura' }, { ...reading(F, F, 'Conductividad', d, 'µS/cm'), label: 'Conductividad' }, { ...reading(F, F, 'Turbidez', d, 'NTU'), label: 'Turbidez' }];
  const st = worstOf([ph.st, ...rows.map((x) => x.st)]);
  // Medidor vertical de DQO
  const bx = 330, by = 60, bh = 260, bw = 46;
  const yOf = (v) => by + bh - (Math.min(v, top) / top) * bh;
  const level = gtRec ? ceiling : dqoR.v;
  const ticks = [0, 20000, 40000, 60000].map((t) => `<line x1="${bx + bw}" y1="${yOf(t)}" x2="${bx + bw + 6}" y2="${yOf(t)}" class="syn-blade"/>${T(bx + bw + 10, yOf(t) + 4, `${fmtNum(t, '', 0)}${t === ceiling ? ' · máx. del método' : ''}`, 'syn-k', 'start')}`).join('');
  // Últimos 10 análisis de DQO hasta el día elegido
  const hist = [...new Set(state.data.records.filter((x) => x.inst === F && x.param === 'DQO' && x.d <= d && (x.v != null || x.flag === 'gt')).map((x) => x.d))].sort().slice(-10);
  const hx = 760, hy = 250, hw = 440, hh = 150, step = hw / 10;
  const bars = hist.map((day, i) => {
    const rec = state.data.records.find((x) => x.inst === F && x.param === 'DQO' && x.d === day);
    const isGt = rec.flag === 'gt', v = isGt ? ceiling : rec.v;
    const h = (Math.min(v, top) / top) * hh, x = hx + i * step + 6;
    return `<g class="${day === d ? 'syn-hist-sel' : ''}"><rect x="${x}" y="${hy - h}" width="${step - 12}" height="${h}" rx="3" class="syn-hist ${isGt ? 'gt' : ''}"/>
      ${T(x + (step - 12) / 2, hy - h - 6, isGt ? '▲ &gt;60k' : `${fmtNum(v / 1000, '', 1)}k`, 'syn-k')}
      ${T(x + (step - 12) / 2, hy + 16, `${day.slice(8)}/${day.slice(5, 7)}`, 'syn-k')}
      <title>${day.split('-').reverse().join('/')}: ${isGt ? `"${esc(rec.raw)}" (por encima del método)` : `${fmtNum(v, '', 0)} mg/L`}</title></g>`;
  }).join('');
  return `<svg viewBox="0 30 1240 360" class="synoptic" role="img" aria-label="Fructalys con el análisis del día">
    <g class="syn-eq st-${st}">
      <path d="M90,90 v210 a85,16 0 0 0 170,0 v-210" class="syn-body"/><ellipse cx="175" cy="90" rx="85" ry="16" class="syn-top"/>
      <rect x="94" y="150" width="162" height="156" class="syn-water syn-sugar"/>
      <path d="M96,150 q20,-8 40,0 t40,0 t40,0 t38,0" class="syn-wave"/>
      ${T(175, 340, 'Fructalys', 'syn-name')}${T(175, 356, 'hoja FRUCTALYS', 'syn-k')}
    </g>
    <g class="syn-meter">
      ${T(bx + bw / 2, by - 14, 'DQO', 'syn-name')}
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" class="syn-meter-bg"/>
      ${level == null ? '' : `<rect x="${bx + 4}" y="${yOf(level)}" width="${bw - 8}" height="${by + bh - yOf(level) - 4}" rx="5" class="syn-meter-fill ${gtRec ? 'gt' : ''}"/>`}
      <line x1="${bx - 8}" y1="${yOf(ceiling)}" x2="${bx + bw + 8}" y2="${yOf(ceiling)}" class="syn-ceiling"/>
      ${ticks}
      ${T(bx + bw / 2, by + bh + 26, gtRec ? `&gt; ${fmtNum(ceiling, '', 0)}` : dqoR.v == null ? '–' : fmtNum(dqoR.v, '', 0), 'g-val')}
      ${T(bx + bw / 2, by + bh + 42, 'mg/L', 'syn-k')}
      <title>${gtRec ? `DQO "${esc(gtRec.raw)}": por encima de lo que mide el método` : `DQO ${dqoR.v == null ? 'sin dato' : fmtNum(dqoR.v, '', 0) + ' mg/L'}`}</title>
    </g>
    ${gauge(640, 140, 52, ph.v, ph.lim, 'pH', '', { scale: 14 })}
    ${tag(640, 220, 'Otros parámetros', rows, 190)}
    <g>
      ${T(hx, 66, 'Últimos 10 análisis de DQO', 'syn-name', 'start')}
      ${T(hx, 84, '▲ = por encima de 60.000 (fuera del método)', 'syn-k', 'start')}
      <line x1="${hx}" y1="${hy}" x2="${hx + hw}" y2="${hy}" class="syn-ground"/>
      <line x1="${hx}" y1="${hy - (ceiling / top) * hh}" x2="${hx + hw}" y2="${hy - (ceiling / top) * hh}" class="syn-ceiling"/>
      ${bars}
    </g>
  </svg>`;
}

const TOWERS = ['INOX (T1)', 'ITR (T2)', 'ALT (T3)', 'EOS 3 (T4)', 'EOS 1', 'EOS 2'];
export function torresSVG(d) {
  const W = 200;
  return `<svg viewBox="0 0 1240 300" class="synoptic" role="img" aria-label="Torres de refrigeración con el análisis del día">
    ${TOWERS.map((t, i) => {
      const rows = [reading('Torres', t, 'Turbidez', d, 'NTU'), reading('Torres', t, 'pH', d, ''), reading('Torres', t, 'Conductividad', d, 'µS/cm'), { ...reading('Torres', t, 'Biocida', d, 'ppm') }];
      rows[2].label = 'Cond.';
      const st = worstOf(rows.map((x) => x.st));
      const x = 20 + i * (W + 6), cx = x + W / 2;
      return `<g class="syn-eq st-${st}">
        <path d="M${cx - 50},150 L${cx - 36},40 h72 L${cx + 50},150 z" class="syn-body"/>
        <rect x="${cx - 46}" y="128" width="92" height="20" class="syn-water"/>
        <g class="syn-fan" style="transform-origin:${cx}px 32px"><ellipse cx="${cx}" cy="32" rx="30" ry="5" class="syn-top"/><path d="M${cx - 26},32 h52 M${cx},28 v8" class="syn-blade"/></g>
        <path d="M${cx - 14},20 q6,-10 0,-18 M${cx + 10},20 q6,-10 0,-18" class="syn-steam"/>
        ${T(cx, 170, esc(t), 'syn-name')}
      </g>${tag(cx, 180, 'Último análisis', rows, 176)}`;
    }).join('')}
  </svg>`;
}
