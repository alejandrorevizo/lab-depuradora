// Área Fructalys: KPIs, DQO con los valores ">60000" marcados en el techo del método, tendencias y observaciones.
import { state, series, aggregate } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, disposeIn } from '../ui/charts.js';
import { fmtNum, fmtDate, isoToMs } from '../ui/format.js';
import { kpi, explorer, obsList, wireDays, datesOf, dataRange, synopticCard } from '../ui/kit.js';
import { fructalysSVG } from '../ui/synoptic.js';
import { areaHead } from './head.js';
import { areaById } from './areas.js';
import { NOTES, paramNote } from '../notes.js';

const F = 'Fructalys';
const spec = (param, unit) => ({ inst: F, param, point: F, unit });

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="head-host"></div><div class="kpis2"></div><div class="grid"></div>';
  const head = root.querySelector('.head-host');
  const kpis = root.querySelector('.kpis2');
  const grid = root.querySelector('.grid');
  const syn = synopticCard({ title: 'Sinóptico de Fructalys', insts: [F], draw: fructalysSVG, info: NOTES.sinoptico });
  grid.appendChild(syn.el);
  const cDqo = card({ title: 'DQO de Fructalys', sub: '', cls: 'col-8', info: NOTES.dqoFru });
  const cSum = card({ title: 'Muestreo y carga', sub: '', cls: 'col-4', chart: false, tools: false, info: NOTES.fruSum });
  grid.append(cDqo.el, cSum.el);
  const ex = explorer({ key: 'fructalys', title: 'Parámetros', inst: F, defaultParam: 'pH', obsKinds: ['Fructalys'], params: ['pH', 'Conductividad', 'Temperatura', 'Turbidez', 'DQO'], info: (p) => paramNote(NOTES.fruParam, p) });
  const cObs = card({ title: 'Observaciones', sub: 'Columna OBSERVACIÓN de FRUCTALYS', cls: 'col-12', chart: false, info: NOTES.obsFru });
  grid.append(ex.el, cObs.el);
  attachDateClick(cDqo.chart, () => datesOf([F]));

  const inR = (d) => { const f = state.filters; return (!f.from || d >= f.from) && (!f.to || d <= f.to); };
  const gtRecs = () => state.data.records.filter((r) => r.inst === F && r.param === 'DQO' && r.flag === 'gt' && inR(r.d));

  function renderKpis() {
    disposeIn(kpis);
    kpis.innerHTML = '';
    const gt = gtRecs();
    const items = [
      { label: 'DQO', spec: spec('DQO', 'mg/L'), extra: gt.length ? `<span class="t-warn">${gt.length} × "&gt;60.000"</span>` : '' },
      { label: 'pH', spec: spec('pH', '') },
      { label: 'Conductividad', spec: spec('Conductividad', 'µS/cm') },
      { label: 'Temperatura', spec: spec('Temperatura', '°C') },
      { label: 'Turbidez', spec: spec('Turbidez', 'NTU') },
    ];
    for (const k of items) kpis.appendChild(kpi(k).el);
  }

  function renderDqo() {
    const t = tokens();
    const s = aggregate(series(spec('DQO')));
    const gt = gtRecs();
    const top = gt.length ? Math.max(...gt.map((r) => r.bound || 60000)) : null;
    const range = dataRange(datesOf([F]));
    cDqo.setTitle('DQO de Fructalys', `mg/L${gt.length ? ` · ▲ ${gt.length} días por encima del rango del método (">${fmtNum(top, '', 0)}"): se dibujan en el techo` : ''}`);
    cDqo.chart.setOption({
      grid: timeGrid({ top: 34, bottom: 44 }),
      legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: axisTooltip(t, { unitOf: (it) => (it.seriesName.startsWith('>') ? '' : 'mg/L'), paramOf: () => 'DQO' }),
      xAxis: timeXAxis(t, range), yAxis: valueYAxis(t, { unit: 'mg/L', scale: false }), dataZoom: dataZoom(t),
      series: [
        { ...lineSeries(t, { name: 'DQO', data: toData(s), color: t.cat[1], area: true }), markLine: markLines(t, { obsKinds: ['Fructalys'], range }) },
        ...(gt.length ? [{
          type: 'scatter', name: `>${fmtNum(top, '', 0)} (fuera del método)`, symbol: 'triangle', symbolSize: 11,
          itemStyle: { color: 'transparent', borderColor: t.cat[1], borderWidth: 2 },
          data: gt.map((r) => [isoToMs(r.d), r.bound || top, { d: r.d, note: `Valor del Excel: "${r.raw}" (sin valor numérico)` }]),
        }] : []),
      ],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'DQO', unit: 'mg/L', param: 'DQO', data: s }]);
    const rows = [...tb.rows, ...gt.map((r) => ({ d: r.d, s0: null, raw: r.raw }))].sort((a, b) => (a.d < b.d ? -1 : 1));
    cDqo.setRows([...tb.cols.slice(0, 2), { key: 'raw', label: 'Texto en el Excel' }, tb.cols[tb.cols.length - 1]], rows);
  }

  function renderSum() {
    const ds = datesOf([F]);
    const dq = series(spec('DQO'));
    const gt = gtRecs();
    const n = dq.length + gt.length;
    const mean = dq.length ? dq.reduce((a, x) => a + x.v, 0) / dq.length : null;
    const max = dq.length ? Math.max(...dq.map((x) => x.v)) : null;
    const first = ds[0], last = ds[ds.length - 1];
    const weekdays = first ? countWeekdays(first, last) : 0;
    cSum.setTitle('Muestreo y carga', first ? `${fmtDate(first)} – ${fmtDate(last)}` : '');
    cSum.body.innerHTML = first ? `
      <div class="facts">
        <div><b>${ds.length}</b><span>días con muestra</span><em>de ${weekdays} laborables (${fmtNum((ds.length / Math.max(1, weekdays)) * 100, '', 0)} %)</em></div>
        <div><b>${n ? fmtNum((gt.length / n) * 100, '', 0) + ' %' : 'n/d'}</b><span>de las DQO por encima de 60.000</span><em>${gt.length} de ${n} análisis</em></div>
        <div><b>${mean == null ? 'n/d' : fmtNum(mean, '', 0)}</b><span>DQO media medible (mg/L)</span><em>sin contar los "&gt;60.000": la media real es mayor</em></div>
        <div><b>${max == null ? 'n/d' : fmtNum(max, '', 0)}</b><span>DQO máxima medida (mg/L)</span></div>
      </div>` : '<p class="muted">Sin datos en el rango.</p>';
  }

  function renderObs() {
    const list = state.data.obs.filter((o) => o.kind === 'Fructalys' && inR(o.d)).slice().reverse();
    cObs.body.innerHTML = obsList(list);
    wireDays(cObs.body);
    cObs.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'text', label: 'Observación' }, { key: 'cell', label: 'Celda' }], list);
  }

  function update(reason) {
    head.innerHTML = '';
    head.appendChild(areaHead(areaById('fructalys'), 'Hoja FRUCTALYS del Excel: DQO, pH, conductividad, temperatura y turbidez, un análisis por día.', NOTES.fructalysKpis));
    renderKpis();
    syn.render(reason && reason.startsWith('sel') ? state.sel.date : null);
    renderDqo(); renderSum(); renderObs();
    if (reason !== 'init') ex.redraw();
  }
  update('init');
  return { el: root, update };
}

function countWeekdays(a, b) {
  let n = 0;
  const end = isoToMs(b);
  for (const dt = new Date(isoToMs(a)); dt.getTime() <= end; dt.setDate(dt.getDate() + 1)) { const g = dt.getDay(); if (g && g !== 6) n++; }
  return n;
}
