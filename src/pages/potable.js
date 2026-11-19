// Área Agua potable: tarjeta por punto (entrada, tanque, salida) con semáforo, cloro combinado y tendencias.
import { state, series } from '../store.js';
import { card } from '../ui/charts.js';
import { fmtNum, fmtDate, esc } from '../ui/format.js';
import { explorer, statusDot, STATUS_TEXT, datesOf, ageText, synopticCard } from '../ui/kit.js';
import { potableSVG } from '../ui/synoptic.js';
import { limitFor, evaluate, limitText, SRC_LABEL } from '../limits.js';
import { areaHead } from './head.js';
import { areaById } from './areas.js';
import { NOTES, paramNote } from '../notes.js';

const P = 'Agua potable';
const POINTS = ['Entrada "P"', 'Tanque "P"', 'Salida "P"'];
const PARAMS = [
  { param: 'Cloro libre', unit: 'mg/L' },
  { param: 'Cloro total', unit: 'mg/L' },
  { param: 'Cloro combinado', unit: 'mg/L', derived: true },
  { param: 'Conductividad', unit: 'µS/cm' },
];

/** Cloro combinado = cloro total − cloro libre, el mismo día y punto. */
function combined(point) {
  const free = new Map(series({ inst: P, param: 'Cloro libre', point }).map((x) => [x.d, x.v]));
  return series({ inst: P, param: 'Cloro total', point }).filter((x) => free.has(x.d)).map((x) => ({ ...x, v: Math.max(0, x.v - free.get(x.d)) }));
}
const seriesOf = (param, point) => (param === 'Cloro combinado' ? combined(point) : series({ inst: P, param, point }));

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="head-host"></div><div class="points3"></div><div class="grid"></div>';
  const head = root.querySelector('.head-host');
  const pts = root.querySelector('.points3');
  const grid = root.querySelector('.grid');
  const syn = synopticCard({ title: 'Sinóptico de agua potable', insts: [P], draw: potableSVG, info: NOTES.sinoptico });
  syn.el.style.marginBottom = '16px';
  pts.before(syn.el);
  const ex = explorer({
    key: 'potable', title: 'Evolución', inst: P, defaultParam: 'Cloro libre', obsKinds: [],
    params: ['Cloro libre', 'Cloro total', 'Cloro combinado', 'Conductividad'],
    derived: { 'Cloro combinado': { unit: 'mg/L', points: POINTS, series: combined } },
    info: (p) => paramNote(NOTES.potableParam, p),
  });
  const cTbl = card({ title: 'Registro diario', sub: 'Hoja AGUA POTABLE', cls: 'col-12', chart: false, info: NOTES.registro });
  grid.append(ex.el, cTbl.el);

  function renderPoints() {
    pts.innerHTML = POINTS.map((pt) => {
      const rows = PARAMS.map((p) => {
        const s = seriesOf(p.param, pt);
        const x = s[s.length - 1];
        const lim = p.derived ? null : limitFor(state.data, P, pt, p.param);
        const st = x ? evaluate(lim, x.v) : 'none';
        return { ...p, x, lim, st };
      });
      const worstSt = rows.reduce((a, r) => (r.st === 'bad' || (r.st === 'warn' && a !== 'bad') ? r.st : a), rows.some((r) => r.lim) ? 'good' : 'none');
      const last = rows.map((r) => r.x && r.x.d).filter(Boolean).sort().pop();
      return `<section class="pcard st-${worstSt}">
        <header><h3>${esc(pt.replace(' "P"', ''))}</h3><span class="muted small">${last ? `${fmtDate(last)} · ${esc(ageText(last))}` : 'sin datos'}</span></header>
        <dl>${rows.map((r) => `<div class="prow"><dt>${esc(r.param)}${r.derived ? ' <small title="Cloro total − cloro libre">calc.</small>' : ''}</dt>
          <dd><b>${r.x ? fmtNum(r.x.v, r.param) : '–'}</b><span>${esc(r.unit)}</span>${r.lim ? `<em title="${esc(r.lim.note || '')}">${statusDot(r.st)}${esc(SRC_LABEL[r.lim.src])} ${esc(limitText(r.lim))}</em>` : ''}</dd></div>`).join('')}</dl>
      </section>`;
    }).join('');
  }

  function renderTable() {
    const ds = datesOf([P]).slice().reverse();
    const cols = [{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }];
    for (const p of PARAMS) for (const pt of POINTS) cols.push({ key: `${p.param}|${pt}`, label: `${p.param} ${pt.replace(' "P"', '')}`, num: true, html: true, csv: (r) => r[`${p.param}|${pt}`], fmt: (r) => cellFmt(r, p.param, pt) });
    const idx = {};
    for (const p of PARAMS) for (const pt of POINTS) idx[`${p.param}|${pt}`] = new Map(seriesOf(p.param, pt).map((x) => [x.d, x.v]));
    const rows = ds.map((d) => { const r = { d }; for (const k of Object.keys(idx)) r[k] = idx[k].has(d) ? idx[k].get(d) : null; return r; });
    function cellFmt(r, param, pt) {
      const v = r[`${param}|${pt}`];
      if (v == null) return '<span class="muted">–</span>';
      const lim = param === 'Cloro combinado' ? null : limitFor(state.data, P, pt, param);
      const st = evaluate(lim, v);
      return `<span class="cell-${st}">${fmtNum(v, param)}${lim ? statusDot(st, STATUS_TEXT[st]) : ''}</span>`;
    }
    cTbl.body.innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th rowspan="2">Fecha</th>${PARAMS.map((p) => `<th colspan="3" class="n grp">${esc(p.param)} <small>${esc(p.unit)}</small></th>`).join('')}</tr><tr>${PARAMS.map(() => POINTS.map((pt) => `<th class="n">${esc(pt.replace(' "P"', ''))}</th>`).join('')).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${fmtDate(r.d)}</td>${PARAMS.map((p) => POINTS.map((pt) => `<td class="n">${cellFmt(r, p.param, pt)}</td>`).join('')).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin datos en el rango.</p>';
    cTbl.setRows(cols, rows);
  }

  function update(reason) {
    head.innerHTML = '';
    head.appendChild(areaHead(areaById('potable'), 'Cloro libre, total y combinado y conductividad en entrada, tanque y salida.', NOTES.puntosKpi));
    syn.render(reason && reason.startsWith('sel') ? state.sel.date : null);
    renderPoints(); renderTable();
    if (reason !== 'init') ex.redraw();
  }
  update('init');
  return { el: root, update };
}
