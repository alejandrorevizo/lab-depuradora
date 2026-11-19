// Área Calderas y torres: matriz de equipos por día con semáforo, ciclos de concentración,
// tendencias de calderas y torres, glicol, verificación de reactivos y observaciones.
import { state, series } from '../store.js';
import { card, disposeIn } from '../ui/charts.js';
import { fmtNum, fmtDate, fmtDateLong, esc } from '../ui/format.js';
import { calderasSVG, torresSVG } from '../ui/synoptic.js';
import { kpi, explorer, dateStepper, matrix, obsList, wireDays, datesOf, statusDot } from '../ui/kit.js';
import { limitText, SRC_LABEL } from '../limits.js';
import { areaHead } from './head.js';
import { areaById } from './areas.js';
import { NOTES, paramNote } from '../notes.js';

const BOILERS = ['Caldera 1', 'Caldera 2', 'Condensado 1', 'Condensado 2', 'Descalcificador'];
const BCOLS = [{ param: 'Conductividad', unit: 'µS/cm' }, { param: 'pH' }, { param: 'Dureza (titulación)', label: 'Dureza' }, { param: 'Turbidez', unit: 'NTU' }];
const TOWERS = ['INOX (T1)', 'ITR (T2)', 'ALT (T3)', 'EOS 3 (T4)', 'EOS 1', 'EOS 2'];
const TCOLS = [{ param: 'pH' }, { param: 'Temperatura', unit: '°C' }, { param: 'Conductividad', unit: 'µS/cm' }, { param: 'Turbidez', unit: 'NTU' }, { param: 'Biocida', unit: 'ppm' }];
const GCOLS = [{ param: 'T Cg.', label: 'Temperatura congelación', unit: '°C' }, { param: 'pH' }];

/** Ciclos de concentración = conductividad de la caldera / conductividad del agua de alimentación (descalcificador). */
function cycles(boiler) {
  const feed = new Map(series({ inst: 'Calderas', param: 'Conductividad', point: 'Descalcificador' }).map((x) => [x.d, x.v]));
  return series({ inst: 'Calderas', param: 'Conductividad', point: boiler })
    .filter((x) => feed.get(x.d) > 0)
    .map((x) => ({ ...x, v: x.v / feed.get(x.d) }));
}

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="head-host"></div><div class="kpis2"></div><div class="grid"></div>';
  const head = root.querySelector('.head-host');
  const kpis = root.querySelector('.kpis2');
  const grid = root.querySelector('.grid');
  const dates = { b: null, t: null };

  const cSynB = card({ title: 'Sinóptico de calderas', sub: '', cls: 'col-12', chart: false, tools: false, controls: '', info: NOTES.sinoptico });
  const cSynT = card({ title: 'Sinóptico de torres', sub: '', cls: 'col-12', chart: false, tools: false, controls: '', info: NOTES.sinoptico });
  grid.append(cSynB.el, cSynT.el);
  const synDates = { b: null, t: null };
  function renderSyn(c, key, inst, title, draw) {
    const ds = datesOf([inst]);
    if (!ds.length) { c.body.innerHTML = '<p class="muted">Sin datos en el rango.</p>'; c.controls.innerHTML = ''; return; }
    if (!synDates[key] || !ds.includes(synDates[key])) synDates[key] = state.sel.date && ds.includes(state.sel.date) ? state.sel.date : ds[ds.length - 1];
    const d = synDates[key];
    c.controls.innerHTML = '';
    c.controls.appendChild(dateStepper(ds, d, (nd) => { synDates[key] = nd; renderSyn(c, key, inst, title, draw); }));
    c.setTitle(title, `Análisis de laboratorio del ${fmtDateLong(d)} · esquema orientativo`);
    c.body.innerHTML = `<div class="syn-wrap">${draw(d)}</div>`;
  }
  const cB = card({ title: 'Calderas · estado del día', sub: '', cls: 'col-7', chart: false, controls: '', info: NOTES.calderas });
  const cG = card({ title: 'Glicol y reactivos', sub: '', cls: 'col-5', chart: false, info: NOTES.glicol });
  const cT = card({ title: 'Torres de refrigeración · estado del día', sub: '', cls: 'col-12', chart: false, controls: '', info: NOTES.torres });
  grid.append(cB.el, cG.el, cT.el);
  const exB = explorer({
    key: 'calderas', title: 'Calderas', inst: 'Calderas', defaultParam: 'Conductividad', obsKinds: ['Calderas'],
    info: (p) => (p === 'Ciclos de concentración' ? NOTES.ciclos : paramNote(NOTES.calderasParam, p)),
    params: ['Conductividad', 'Ciclos de concentración', 'pH', 'Dureza (titulación)', 'Turbidez'],
    derived: { 'Ciclos de concentración': { unit: 'ciclos', points: ['Caldera 1', 'Caldera 2'], series: (p) => cycles(p) } },
    defaultPoints: (p, u) => (p === 'Conductividad' ? u.filter((x) => x.startsWith('Caldera')) : u),
  });
  exB.el.classList.replace('col-12', 'col-6');
  const exT = explorer({ key: 'torres', title: 'Torres', inst: 'Torres', defaultParam: 'Turbidez', obsKinds: ['Torres'], params: ['Turbidez', 'pH', 'Conductividad', 'Temperatura', 'Biocida'], info: (p) => paramNote(NOTES.torresParam, p) });
  exT.el.classList.replace('col-12', 'col-6');
  const cObs = card({ title: 'Observaciones', sub: 'Calderas y torres', cls: 'col-12', chart: false, info: NOTES.obsCalderas });
  grid.append(exB.el, exT.el, cObs.el);

  function renderKpis() {
    disposeIn(kpis);
    kpis.innerHTML = '';
    const items = [
      { label: 'Conductividad Caldera 1', spec: { inst: 'Calderas', param: 'Conductividad', point: 'Caldera 1', unit: 'µS/cm' } },
      { label: 'Conductividad Caldera 2', spec: { inst: 'Calderas', param: 'Conductividad', point: 'Caldera 2', unit: 'µS/cm' } },
      { label: 'Ciclos Caldera 1', data: cycles('Caldera 1'), unit: 'ciclos', param: 'Ciclos', hint: 'Conductividad caldera / conductividad descalcificador' },
      { label: 'Ciclos Caldera 2', data: cycles('Caldera 2'), unit: 'ciclos', param: 'Ciclos', hint: 'Conductividad caldera / conductividad descalcificador' },
      { label: 'Dureza descalcificador', spec: { inst: 'Calderas', param: 'Dureza (titulación)', point: 'Descalcificador', unit: '' } },
      { label: 'pH glicol', spec: { inst: 'Glicol', param: 'pH', point: 'Glicol', unit: '' } },
    ];
    for (const k of items) kpis.appendChild(kpi(k).el);
  }

  function renderMatrix(c, key, inst, rows, cols, title) {
    const ds = datesOf([inst]);
    if (!ds.length) { c.controls.innerHTML = ''; c.body.innerHTML = '<p class="muted">Sin datos en el rango seleccionado.</p>'; return; }
    if (!dates[key] || !ds.includes(dates[key])) dates[key] = state.sel.date && ds.includes(state.sel.date) ? state.sel.date : ds[ds.length - 1];
    const d = dates[key];
    c.controls.innerHTML = '';
    c.controls.appendChild(dateStepper(ds, d, (nd) => { dates[key] = nd; renderMatrix(c, key, inst, rows, cols, title); }));
    const present = rows.filter((r) => state.data.records.some((x) => x.inst === inst && x.d === d && x.point === r));
    const others = [...new Set(state.data.records.filter((x) => x.inst === inst && x.d === d && x.v != null).map((x) => x.point))].filter((p) => !rows.includes(p));
    const m = matrix(inst, [...present, ...others], cols, d);
    const bad = m.statuses.filter((s) => s.st === 'bad'), warn = m.statuses.filter((s) => s.st === 'warn');
    c.setTitle(title, `${fmtDate(d)} · ${bad.length ? `${bad.length} fuera de límite` : 'ninguno fuera de límite'}${warn.length ? ` · ${warn.length} cerca` : ''}`);
    c.body.innerHTML = m.html + (bad.length || warn.length ? `<ul class="alert-list">${[...bad, ...warn].map((s) => `<li>${statusDot(s.st)}<b>${esc(s.pt)}</b> ${esc(s.param)} <span class="num">${fmtNum(s.v, s.param)}</span> <span class="muted">(${esc(SRC_LABEL[s.lim.src].toLowerCase())} ${esc(limitText(s.lim))})</span></li>`).join('')}</ul>` : '');
    c.setRows([{ key: 'point', label: 'Equipo' }, { key: 'param', label: 'Parámetro' }, { key: 'v', label: 'Valor', num: true, fmt: (r) => (r.v == null ? r.raw || 'n/d' : fmtNum(r.v, r.param)) }, { key: 'unit', label: 'Unidad' }, { key: 'cell', label: 'Celda' }], m.recs);
  }

  function renderGlicol() {
    const gd = datesOf(['Glicol']);
    const d = gd[gd.length - 1];
    const f = state.filters;
    const reac = state.data.tables.reactivos.filter((r) => (!f.from || r.d >= f.from) && (!f.to || r.d <= f.to));
    const last14 = reac.slice(-14);
    const no = reac.filter((r) => r.respuesta === 'NO');
    const m = d ? matrix('Glicol', ['Glicol'], GCOLS, d) : null;
    cG.setTitle('Glicol y reactivos', d ? `Glicol ${fmtDate(d)}` : 'Sin datos de glicol');
    cG.body.innerHTML = `${m ? m.html : ''}
      <h4 class="sub-h">¿Reactivos suficientes para la dosificación?</h4>
      ${last14.length ? `<div class="strip">${last14.map((r) => `<span class="strip-day ${r.respuesta === 'SI' ? 'good' : r.respuesta === 'NO' ? 'bad' : 'none'}" title="${esc(fmtDate(r.d))}: ${esc(r.respuesta)}${r.obs ? ' · ' + esc(r.obs) : ''}"><small>${fmtDate(r.d, true)}</small>${esc(r.respuesta)}</span>`).join('')}</div>
      <p class="muted small">${reac.length} verificaciones en el rango · ${no.length ? `<b class="t-bad">${no.length} con respuesta NO</b>` : 'ninguna con respuesta NO'}.</p>` : '<p class="muted">Sin verificaciones en el rango.</p>'}`;
    cG.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'respuesta', label: 'Respuesta' }, { key: 'obs', label: 'Observación' }], reac);
  }

  function renderObs() {
    const f = state.filters;
    const list = state.data.obs.filter((o) => ['Calderas', 'Torres'].includes(o.kind) && (!f.from || o.d >= f.from) && (!f.to || o.d <= f.to)).slice().reverse();
    cObs.body.innerHTML = `<div class="timeline-host">${obsList(list.slice(0, 40), { tags: true })}</div>`;
    wireDays(cObs.body);
    cObs.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'kind', label: 'Origen' }, { key: 'text', label: 'Observación' }, { key: 'cell', label: 'Celda' }], list);
  }

  function update(reason) {
    if (reason && reason.startsWith('sel') && state.sel.date) { dates.b = state.sel.date; dates.t = state.sel.date; }
    head.innerHTML = '';
    head.appendChild(areaHead(areaById('calderas'), 'Calderas, condensados y descalcificador, torres de refrigeración y circuito de glicol.', NOTES.calderasKpis));
    renderKpis();
    if (reason && reason.startsWith('sel') && state.sel.date) { synDates.b = state.sel.date; synDates.t = state.sel.date; }
    renderSyn(cSynB, 'b', 'Calderas', 'Sinóptico de calderas', calderasSVG);
    renderSyn(cSynT, 't', 'Torres', 'Sinóptico de torres de refrigeración', torresSVG);
    renderMatrix(cB, 'b', 'Calderas', BOILERS, BCOLS, 'Calderas · estado del día');
    renderMatrix(cT, 't', 'Torres', TOWERS, TCOLS, 'Torres de refrigeración · estado del día');
    renderGlicol();
    renderObs();
    if (reason !== 'init') { exB.redraw(); exT.redraw(); }
  }
  update('init');
  return { el: root, update };
}
