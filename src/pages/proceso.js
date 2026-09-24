// Página Proceso DQO: tren Entrada → Homo → DAF → Permeado para una fecha y evolución por punto.
import { state, sel, series, setSelDate } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, colorOf, RECORD_COLUMNS } from '../ui/charts.js';
import { fmtNum, fmtDate, fmtDateLong, fmtSigned, esc } from '../ui/format.js';
import { segmented } from '../ui/components.js';
import { S, TRAIN, EDARI, pointsOf, applyPointFilter } from './common.js';

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Proceso DQO</h2><p>DQO en cada etapa del tren de tratamiento y porcentaje de eliminación entre etapas, calculado como (DQO anterior − DQO siguiente) / DQO anterior × 100. La efectividad del Excel compara Homo con Permeado.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  const cTrain = card({ title: 'Tren de tratamiento', sub: '', cls: 'col-12', chart: false });
  let log = true;
  const cEvo = card({ title: 'Evolución de la DQO por punto', sub: 'Media diaria (mg/L). Los filtros de punto de la barra superior se aplican aquí.', cls: 'col-12', height: 'tall', controls: '<span class="muted small">Escala</span>' });
  cEvo.controls.appendChild(segmented([{ value: true, label: 'Logarítmica' }, { value: false, label: 'Lineal' }], log, (v) => { log = v; renderEvo(); }));
  grid.append(cTrain.el, cEvo.el);
  attachDateClick(cEvo.chart, () => trainDates());

  const trainDates = () => {
    const s = sel();
    const set = new Set();
    for (const r of s.ranged) if (r.inst === EDARI && r.param === 'DQO' && r.sheet === 'EDARI' && TRAIN.includes(r.point)) set.add(r.d);
    return [...set].sort();
  };
  const valueOn = (d, point) => {
    const r = sel().values.find((x) => x.d === d && x.inst === EDARI && x.param === 'DQO' && x.point === point && x.sheet === 'EDARI');
    return r || null;
  };
  const rawOn = (d, point) => state.data.records.find((x) => x.d === d && x.inst === EDARI && x.param === 'DQO' && x.point === point && x.sheet === 'EDARI');

  function renderTrain() {
    const dates = trainDates();
    if (!dates.length) { cTrain.body.innerHTML = '<p class="muted">Sin datos de DQO de EDARI en el rango seleccionado.</p>'; return; }
    let d = state.sel.date && dates.includes(state.sel.date) ? state.sel.date : null;
    if (!d) {
      // último día con permeado
      d = [...dates].reverse().find((x) => valueOn(x, 'Permeado')) || dates[dates.length - 1];
    }
    const idx = dates.indexOf(d);
    const vals = TRAIN.map((p) => ({ p, r: valueOn(d, p), raw: rawOn(d, p) }));
    const max = Math.max(...vals.map((x) => (x.r ? x.r.v : 0)), 1);
    const ef = sel().values.find((x) => x.d === d && x.param === 'Efectividad' && x.point === 'Homo → Permeado');
    const others = ['Balsa N', 'Chulives', 'Tanque gris'].map((p) => ({ p, r: valueOn(d, p) }));
    cTrain.setTitle('Tren de tratamiento', `${fmtDateLong(d)}${state.sel.date === d ? ' · fecha seleccionada' : ' · último día con DQO de permeado'}`);
    let html = `<div class="card-controls" style="padding:0 0 6px">
      <div class="date-stepper">
        <button class="btn icon" data-step="-1" aria-label="Día anterior" ${idx <= 0 ? 'disabled' : ''}>‹</button>
        <input type="range" min="0" max="${dates.length - 1}" value="${idx}" aria-label="Fecha">
        <button class="btn icon" data-step="1" aria-label="Día siguiente" ${idx >= dates.length - 1 ? 'disabled' : ''}>›</button>
        <b class="num">${fmtDate(d)}</b>
      </div>
      <span style="margin-left:auto" class="status ${ef ? 'none' : 'none'}">Efectividad del día (Homo → Permeado): <b style="margin-left:4px">${ef ? fmtNum(ef.v, 'Efectividad') + ' %' : 'sin dato'}</b></span>
    </div><div class="train">`;
    vals.forEach((x, i) => {
      if (i > 0) {
        const a = vals[i - 1].r, b = x.r;
        let pct = null;
        if (a && b && a.v !== 0) pct = ((a.v - b.v) / a.v) * 100;
        html += `<div class="link"><svg class="arrow" viewBox="0 0 100 18" preserveAspectRatio="none"><path d="M0 9h92" stroke="currentColor" stroke-width="2" fill="none"/><path d="M90 3l8 6-8 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span class="pct ${pct != null && pct < 0 ? 'up' : ''}">${pct == null ? 'n/d' : (pct >= 0 ? '' : '+') + fmtNum(Math.abs(pct), '', 1) + ' %'}</span>
          <span>${pct == null ? 'sin dato' : pct >= 0 ? 'eliminación' : 'aumento'}</span></div>`;
      }
      const w = x.r ? Math.max(2, (x.r.v / max) * 100) : 0;
      html += `<div class="stage ${x.r ? '' : 'nodata'}" data-point="${esc(x.p)}" title="${x.raw ? `Celda ${x.raw.cell} · texto original: ${esc(x.raw.raw || 'vacía')}` : ''}">
        <h4>${esc(x.p)}</h4>
        <div class="v num">${x.r ? fmtNum(x.r.v, 'DQO') : x.raw && x.raw.raw ? esc(x.raw.raw) : 'sin dato'}</div>
        <div class="u">mg/L DQO</div>
        <div class="bar"><i style="width:${w}%"></i></div></div>`;
    });
    html += `</div><div class="muted small" style="margin-top:8px">Otros puntos ese día: ${others.map((o) => `${esc(o.p)} <b class="num">${o.r ? fmtNum(o.r.v, 'DQO') + ' mg/L' : 'sin dato'}</b>`).join(' · ')}</div>`;
    cTrain.body.innerHTML = html;
    const range = cTrain.body.querySelector('input[type=range]');
    range.oninput = () => { state.sel.date = dates[+range.value]; renderTrain(); };
    range.onchange = () => setSelDate(dates[+range.value]);
    cTrain.body.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => { const n = dates[idx + +b.dataset.step]; if (n) setSelDate(n); }));
    cTrain.setRows(RECORD_COLUMNS, [...vals.map((x) => x.raw).filter(Boolean), ...others.map((o) => rawOn(d, o.p)).filter(Boolean)]);
  }

  function renderEvo() {
    const t = tokens();
    const universe = pointsOf(EDARI, 'DQO');
    const pts = applyPointFilter(universe);
    const named = pts.map((p) => ({ name: p, unit: 'mg/L', param: 'DQO', data: series({ inst: EDARI, param: 'DQO', point: p }) })).filter((s) => s.data.length);
    cEvo.chart.setOption({
      grid: timeGrid({ top: 56, bottom: 44 }),
      legend: { top: 0, left: 0, type: 'scroll', textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4, selected: Object.fromEntries(named.map((s) => [s.name, ['Entrada', 'Homo', 'DAF', 'Permeado'].includes(s.name) || named.length <= 5])) },
      tooltip: axisTooltip(t, { unitOf: () => 'mg/L', paramOf: () => 'DQO' }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: 'mg/L', log }),
      dataZoom: dataZoom(t),
      series: named.map((s, i) => {
        const col = colorOf(s.name, universe);
        const ls = lineSeries(t, { name: s.name, data: toData(s.data.filter((x) => !log || x.v > 0)), color: col, dashed: orderIdx(s.name, universe) >= 8 });
        if (i === 0) ls.markLine = markLines(t);
        return ls;
      }),
    }, { replaceMerge: ['series'] });
    const tb = seriesRows(named);
    cEvo.setRows(tb.cols, tb.rows);
    const nonPos = named.reduce((a, s) => a + s.data.filter((x) => x.v <= 0).length, 0);
    cEvo.setFoot(log && nonPos ? `${nonPos} valores ≤ 0 no se pueden dibujar en escala logarítmica. Cambia a lineal para verlos.` : 'La DQO de "Homogenizador" y "Pozo entrada" viene de las hojas de laboratorio (junio y julio) y se muestra con sus propios nombres.');
  }
  const orderIdx = (name, universe) => universe.indexOf(name);

  function update(reason) {
    renderTrain();
    if (reason !== 'sel-train') renderEvo();
  }
  update();
  return { el: root, update };
}
