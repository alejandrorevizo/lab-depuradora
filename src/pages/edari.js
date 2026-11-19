// Área EDARI: KPIs, tren de DQO, efectividad, explorador por punto, biológico, urea y observaciones.
import { state, sel, series, aggregate } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, disposeIn } from '../ui/charts.js';
import { fmtNum, fmtDate, fmtDateLong, esc } from '../ui/format.js';
import { S, sstLM, TRAIN, effAxisMin } from './common.js';
import { kpi, explorer, dateStepper, limitMarks, mergeMarkLines, obsList, wireDays, STATUS_COLOR, STATUS_TEXT, statusDot, datesOf } from '../ui/kit.js';
import { edariSVG } from '../ui/synoptic.js';
import { limitFor, evaluate, limitText, SRC_LABEL } from '../limits.js';
import { areaHead } from './head.js';
import { areaById } from './areas.js';
import { NOTES, paramNote } from '../notes.js';

const OD = { inst: 'EDARI', param: 'O.D.' };
const UREA = { inst: 'EDARI', param: 'Urea dosificada (kilos)', point: 'Urea' };

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="head-host"></div><div class="kpis2"></div><div class="grid"></div>';
  const head = root.querySelector('.head-host');
  const kpis = root.querySelector('.kpis2');
  const grid = root.querySelector('.grid');
  let trainDate = null;

  const cSyn = card({ title: 'Sinóptico de la EDARI', sub: '', cls: 'col-12', chart: false, tools: false, controls: '', info: NOTES.sinoptico });
  grid.appendChild(cSyn.el);
  let synDate = null;
  function renderSyn() {
    const ds = datesOf(['EDARI'], ['DQO']);
    if (!ds.length) { cSyn.body.innerHTML = '<p class="muted">Sin datos en el rango.</p>'; return; }
    if (!synDate || !ds.includes(synDate)) synDate = state.sel.date && ds.includes(state.sel.date) ? state.sel.date : ds[ds.length - 1];
    cSyn.controls.innerHTML = '';
    cSyn.controls.appendChild(dateStepper(ds, synDate, (d) => { synDate = d; renderSyn(); }));
    cSyn.setTitle('Sinóptico de la EDARI', `Análisis de laboratorio del ${fmtDateLong(synDate)} · esquema orientativo`);
    cSyn.body.innerHTML = `<div class="syn-wrap">${edariSVG(synDate)}</div>`;
  }
  const cTrain = card({ title: 'Tren de tratamiento · DQO', sub: '', cls: 'col-5', chart: false, controls: '', info: NOTES.tren });
  const cEf = card({ title: 'Efectividad de depuración', sub: '', cls: 'col-7', info: NOTES.efectividad });
  grid.append(cTrain.el, cEf.el);
  const ex = explorer({
    key: 'edari', title: 'Evolución por punto', inst: 'EDARI', log: true, defaultParam: 'DQO', info: (p) => paramNote(NOTES.edariParam, p),
    params: ['DQO', 'pH', 'Temperatura', 'Conductividad', 'SST', 'Amonio', 'Fósforo total', 'Caudal', 'Efectividad'],
    defaultPoints: (p, u) => (p === 'DQO' || p === 'pH' ? TRAIN.filter((x) => u.includes(x)) : u.slice(0, 4)),
  });
  grid.appendChild(ex.el);
  const cSst = card({ title: 'Biológico · SST licor mezcla', sub: '', cls: 'col-6', info: NOTES.sst });
  const cOd = card({ title: 'Biológico · Oxígeno disuelto B2', sub: '', cls: 'col-6', info: NOTES.od });
  const cUrea = card({ title: 'Dosificación de urea', sub: 'Kilos por día (hoja D. UREA)', cls: 'col-6', info: NOTES.urea });
  const cObs = card({ title: 'Observaciones', sub: 'Columna Observaciones de EDARI y hoja D. UREA', cls: 'col-6', chart: false, info: NOTES.obsEdari });
  grid.append(cSst.el, cOd.el, cUrea.el, cObs.el);
  attachDateClick(cEf.chart, () => series(S.efect).map((x) => x.d));
  attachDateClick(cSst.chart, () => sstLM().map((x) => x.d));
  attachDateClick(cOd.chart, () => series(OD).map((x) => x.d));
  attachDateClick(cUrea.chart, () => series(UREA).map((x) => x.d));

  function renderKpis() {
    disposeIn(kpis);
    kpis.innerHTML = '';
    const items = [
      { label: 'Efectividad', spec: { ...S.efect, unit: '%' }, hint: '((DQO Homo − DQO Permeado) / DQO Homo) × 100' },
      { label: 'DQO permeado', spec: { ...S.dqoPerm, unit: 'mg/L' } },
      { label: 'Caudal permeado', spec: { ...S.qPerm, unit: 'm³/día' } },
      { label: 'Agua sin tratar', spec: { ...S.qBruta, unit: 'm³/día' } },
      { label: 'SST licor mezcla', data: sstLM(), inst: 'EDARI', point: 'Licor mezcla', param: 'SST', unit: 'mg/L', hint: 'Hoja SST LM hasta el 22/07 y EDARI "SST Bio 2" desde el 23/07' },
      { label: 'O.D. B2 (media turnos)', data: series(OD), inst: 'EDARI', point: 'B2 · Mañana', param: 'O.D.', unit: 'ppm' },
    ];
    for (const k of items) kpis.appendChild(kpi(k).el);
  }

  function renderTrain() {
    const dates = [...new Set(series({ inst: 'EDARI', param: 'DQO', point: 'Permeado' }).map((x) => x.d))].sort();
    if (!dates.length) { cTrain.body.innerHTML = '<p class="muted">Sin datos de DQO en el rango.</p>'; return; }
    if (!trainDate || !dates.includes(trainDate)) trainDate = state.sel.date && dates.includes(state.sel.date) ? state.sel.date : dates[dates.length - 1];
    cTrain.controls.innerHTML = '';
    cTrain.controls.appendChild(dateStepper(dates, trainDate, (d) => { trainDate = d; renderTrain(); }));
    const val = (pt) => { const r = state.data.records.find((x) => x.inst === 'EDARI' && x.sheet === 'EDARI' && x.param === 'DQO' && x.point === pt && x.d === trainDate); return r ? r.v : null; };
    const st = TRAIN.map((p) => ({ p, v: val(p) }));
    const max = Math.max(...st.map((x) => x.v || 0)) || 1;
    const ef = series(S.efect).find((x) => x.d === trainDate);
    const lim = limitFor(state.data, 'EDARI', 'Homo → Permeado', 'Efectividad');
    const est = ef ? evaluate(lim, ef.v) : 'none';
    const glob = st[0].v && st[3].v != null ? ((st[0].v - st[3].v) / st[0].v) * 100 : null;
    cTrain.setTitle('Tren de tratamiento · DQO', fmtDateLong(trainDate));
    cTrain.body.innerHTML = `
      <div class="train2">${st.map((x, i) => {
        const prev = i ? st[i - 1].v : null;
        const pct = prev && x.v != null ? ((prev - x.v) / prev) * 100 : null;
        return `${i ? `<div class="train2-link ${pct != null && pct < 0 ? 'up' : ''}"><span>${pct == null ? '–' : pct >= 0 ? '−' + fmtNum(pct, '', 0) + ' %' : '+' + fmtNum(-pct, '', 0) + ' %'}</span></div>` : ''}
          <div class="train2-stage"><small>${esc(x.p)}</small><b>${x.v == null ? 'n/d' : fmtNum(x.v, 'DQO')}</b><div class="bar"><i style="width:${x.v == null ? 0 : Math.max(2, (x.v / max) * 100)}%"></i></div></div>`;
      }).join('')}</div>
      <div class="train2-foot">
        <div><span class="muted small">Efectividad Homo → Permeado</span><b>${ef ? fmtNum(ef.v, 'Efectividad') + ' %' : 'n/d'}</b>${lim && ef ? `<span class="pill ${est}">${statusDot(est)}${STATUS_TEXT[est]} ${esc(limitText(lim))}</span>` : ''}</div>
        <div><span class="muted small">Eliminación global Entrada → Permeado</span><b>${glob == null ? 'n/d' : fmtNum(glob, '', 1) + ' %'}</b></div>
      </div>
      <p class="muted small" style="margin:10px 0 0">mg/L DQO. El porcentaje entre etapas es la reducción respecto a la etapa anterior; en rojo si la DQO sube.</p>`;
    cTrain.setRows([{ key: 'p', label: 'Etapa' }, { key: 'v', label: 'DQO (mg/L)', num: true, fmt: (r) => fmtNum(r.v, 'DQO') }], st);
  }

  function renderEf() {
    const t = tokens();
    const lim = limitFor(state.data, 'EDARI', 'Homo → Permeado', 'Efectividad');
    const s = aggregate(series(S.efect));
    const low = lim ? lim.min : 90;
    cEf.setTitle('Efectividad de depuración', `${lim ? `Banda ${limitText(lim)} (${SRC_LABEL[lim.src].toLowerCase()}). ` : ''}Verde en rango, ámbar cerca o por encima, rojo por debajo.`);
    const yMin = effAxisMin(s.map((x) => x.v), low);
    const data = s.map((x) => {
      const b = evaluate(lim, x.v);
      const out = x.v < yMin;
      return { value: [x.t, out ? yMin : x.v, { n: x.n, d: x.d, real: out ? x.v : null }], itemStyle: { color: STATUS_COLOR[b] || t.single, borderRadius: [3, 3, 0, 0], opacity: 0.9 }, label: out ? { show: true, position: 'insideBottom', formatter: fmtNum(x.v, 'Efectividad'), color: '#fff', fontSize: 9 } : undefined };
    });
    const band = lim ? limitMarks(t, lim) : {};
    cEf.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => '%', paramOf: () => 'Efectividad', extra: (d) => { const x = s.find((y) => y.d === d); if (!x || !lim) return ''; const b = evaluate(lim, x.v); return `<div style="margin-top:4px">${statusDot(b)} ${STATUS_TEXT[b]}</div>`; } }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: '%', min: yMin, max: 100, scale: false }),
      dataZoom: dataZoom(t),
      series: [{ type: 'bar', name: 'Efectividad', data, barMaxWidth: 12, markLine: mergeMarkLines(markLines(t), band.markLine), markArea: band.markArea }],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'Efectividad', unit: '%', param: 'Efectividad', data: s }]);
    tb.cols.splice(2, 0, { key: 'st', label: 'Estado', fmt: (r) => STATUS_TEXT[evaluate(lim, r.s0)] });
    cEf.setRows(tb.cols, tb.rows);
    const n = { good: 0, warn: 0, bad: 0 };
    for (const x of s) { const b = evaluate(lim, x.v); if (n[b] != null) n[b]++; }
    cEf.setFoot(s.length ? `${s.length} ${state.filters.agg === 'd' ? 'días' : 'periodos'}: <b>${n.good}</b> en rango · <b>${n.warn}</b> cerca o por encima · <b>${n.bad}</b> por debajo (${fmtNum((n.bad / s.length) * 100, '', 0)} %).` : '');
  }

  function renderSst() {
    const t = tokens();
    const s = aggregate(sstLM());
    const lim = limitFor(state.data, 'EDARI', 'Licor mezcla', 'SST');
    const band = lim ? limitMarks(t, lim) : {};
    cSst.setTitle('Biológico · SST licor mezcla', `mg/L${lim ? ` · banda ${limitText(lim)} (${SRC_LABEL[lim.src].toLowerCase()})` : ''}`);
    cSst.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => 'mg/L', paramOf: () => 'SST' }),
      xAxis: timeXAxis(t), yAxis: valueYAxis(t, { unit: 'mg/L' }), dataZoom: dataZoom(t),
      series: [{ ...lineSeries(t, { name: 'SST licor mezcla', data: toData(s), color: t.single, area: true }), markLine: mergeMarkLines(markLines(t), band.markLine), markArea: band.markArea }],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'SST licor mezcla', unit: 'mg/L', param: 'SST', data: s }]);
    cSst.setRows(tb.cols, tb.rows);
  }

  function renderOd() {
    const t = tokens();
    const pts = ['B2 · Mañana', 'B2 · Tarde', 'B2 · Noche'];
    const named = pts.map((p) => ({ name: p.replace('B2 · ', ''), unit: 'ppm', param: 'O.D.', data: aggregate(series({ ...OD, point: p })) })).filter((x) => x.data.length);
    const lim = limitFor(state.data, 'EDARI', pts[0], 'O.D.');
    const band = lim ? limitMarks(t, lim) : {};
    cOd.setTitle('Biológico · Oxígeno disuelto B2', `ppm por turno${lim ? ` · ${SRC_LABEL[lim.src].toLowerCase()} ${limitText(lim)}` : ''}`);
    cOd.chart.setOption({
      grid: timeGrid({ top: 34, bottom: 44 }),
      legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: axisTooltip(t, { unitOf: () => 'ppm', paramOf: () => 'O.D.' }),
      xAxis: timeXAxis(t), yAxis: valueYAxis(t, { unit: 'ppm' }), dataZoom: dataZoom(t),
      series: named.map((x, i) => ({ ...lineSeries(t, { name: x.name, data: toData(x.data), color: t.cat[i] }), ...(i === 0 ? { markLine: mergeMarkLines(markLines(t), band.markLine), markArea: band.markArea } : {}) })),
    }, { replaceMerge: ['series'] });
    const tb = seriesRows(named);
    cOd.setRows(tb.cols, tb.rows);
    const last = named.flatMap((x) => x.data).reduce((m, x) => (x.d > m ? x.d : m), '');
    cOd.setFoot(last && state.filters.to && last < state.filters.to ? `Último registro de O.D. el ${fmtDate(last)} (hoja O.D. B2).` : '');
  }

  function renderUrea() {
    const t = tokens();
    const s = aggregate(series(UREA));
    cUrea.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => 'kg', paramOf: () => 'Urea' }),
      xAxis: timeXAxis(t), yAxis: valueYAxis(t, { unit: 'kg', scale: false }), dataZoom: dataZoom(t),
      series: [{ type: 'bar', name: 'Urea', data: toData(s), barMaxWidth: 12, itemStyle: { color: t.cat[2], borderRadius: [3, 3, 0, 0] }, markLine: markLines(t) }],
    }, { replaceMerge: ['series'] });
    const total = s.reduce((a, x) => a + x.v * (state.filters.agg === 'd' ? 1 : x.n), 0);
    cUrea.setFoot(s.length ? `Total en el rango: <b>${fmtNum(total, '', 0)} kg</b>.` : 'Sin dosificación registrada en el rango.');
    const tb = seriesRows([{ name: 'Urea', unit: 'kg', data: s }]);
    cUrea.setRows(tb.cols, tb.rows);
  }

  function renderObs() {
    const f = state.filters;
    const list = state.data.obs.filter((o) => ['EDARI', 'Urea'].includes(o.kind) && (!f.from || o.d >= f.from) && (!f.to || o.d <= f.to)).slice().reverse();
    cObs.body.innerHTML = `<div class="timeline-host">${obsList(list.slice(0, 14))}</div>`;
    wireDays(cObs.body);
    cObs.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'kind', label: 'Origen' }, { key: 'text', label: 'Observación' }, { key: 'cell', label: 'Celda' }], list);
  }

  function update(reason) {
    head.innerHTML = '';
    head.appendChild(areaHead(areaById('edari'), 'Depuradora: DQO por etapa, efectividad, biológico y caudales.', NOTES.edariKpis));
    renderKpis();
    renderSyn();
    renderTrain();
    renderEf(); renderSst(); renderOd(); renderUrea(); renderObs();
    if (reason !== 'init') ex.redraw();
  }
  update('init');
  return { el: root, update: (r) => { if (r.startsWith('sel') && state.sel.date) { trainDate = state.sel.date; synDate = state.sel.date; } update(r); } };
}
