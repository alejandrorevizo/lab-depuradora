// Página Biológico: SST licor mezcla con banda del Excel, O.D. B2 por turno y dosificación de urea.
import { state, sel, series } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, STATUS } from '../ui/charts.js';
import { fmtNum, fmtVal, fmtDate, esc } from '../ui/format.js';
import { segmented } from '../ui/components.js';
import { EDARI, sstLM, bandStatus, stats } from './common.js';

const SHIFTS = ['Mañana', 'Tarde', 'Noche'];

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Biológico</h2><p>SST del licor mezcla con la banda MÍNIMO/MÁXIMO de la hoja SST LM, oxígeno disuelto del reactor B2 por turno y dosificación de urea.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  let ureaUnit = 'kilos';
  const cSST = card({ title: 'SST licor mezcla', sub: '', cls: 'col-12', height: 'tall' });
  const cOD = card({ title: 'Oxígeno disuelto B2 por turno', sub: 'Hoja O.D. B2 (ppm). Si hay varias lecturas por turno y día, se muestra la media.', cls: 'col-7' });
  const cU = card({ title: 'Dosificación de urea', sub: 'Hoja D. UREA', cls: 'col-5', controls: '' });
  cU.controls.appendChild(segmented([{ value: 'kilos', label: 'Kilos' }, { value: 'cantidad', label: 'Sacos' }], ureaUnit, (v) => { ureaUnit = v; renderU(); }));
  grid.append(cSST.el, cOD.el, cU.el);
  attachDateClick(cSST.chart, () => sstLM().map((x) => x.d));
  attachDateClick(cOD.chart, () => series({ inst: EDARI, param: 'O.D.' }).map((x) => x.d));
  attachDateClick(cU.chart, () => series({ inst: EDARI, param: 'Urea dosificada (kilos)' }).map((x) => x.d));

  function renderSST() {
    const t = tokens();
    const lim = state.data.limits.sst;
    const s = sstLM();
    const st = stats(s.map((x) => x.v));
    const cnt = { in: 0, lo: 0, hi: 0 };
    s.forEach((x) => { if (x.v < lim.min) cnt.lo++; else if (x.v > lim.max) cnt.hi++; else cnt.in++; });
    cSST.setTitle('SST licor mezcla', `Banda ${fmtNum(lim.min)}-${fmtNum(lim.max)} mg/L (${lim.src}) · ● dentro ${cnt.in} · ▼ por debajo ${cnt.lo} · ▲ por encima ${cnt.hi}${st.n ? ` · media ${fmtNum(st.mean, 'SST')} mg/L` : ''}`);
    const pts = s.map((x) => {
      const b = x.v < lim.min ? 'lo' : x.v > lim.max ? 'hi' : 'in';
      const src = [...new Set(x.recs.map((r) => (r.sheet === 'SST LM' ? 'hoja SST LM' : 'EDARI SST Bio 2')))].join(' + ');
      return { value: [x.t, x.v, { n: x.n, d: x.d, src }], symbol: b === 'in' ? 'circle' : 'triangle', symbolRotate: b === 'lo' ? 180 : 0, symbolSize: b === 'in' ? 8 : 11, itemStyle: { color: b === 'in' ? STATUS.good : STATUS.critical, borderColor: t.surface, borderWidth: 1.5 } };
    });
    cSST.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, {
        unitOf: () => 'mg/L', paramOf: () => 'SST',
        extra: (d) => { const x = s.find((y) => y.d === d); if (!x) return ''; const src = [...new Set(x.recs.map((r) => (r.sheet === 'SST LM' ? 'hoja SST LM (Licor mezcla)' : 'EDARI (SST Bio 2)')))].join(' + '); return `<div style="margin-top:4px;font-size:11px">Fuente: ${esc(src)}<br>${x.v < lim.min ? '▼ Por debajo de la banda' : x.v > lim.max ? '▲ Por encima de la banda' : '● Dentro de la banda'}</div>`; },
      }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: 'mg/L' }),
      dataZoom: dataZoom(t),
      series: [{
        type: 'line', name: 'SST licor mezcla', data: pts, lineStyle: { width: 1.5, color: t.axis }, showSymbol: true,
        markArea: { silent: true, itemStyle: { color: 'rgba(12,163,12,0.08)' }, label: { show: true, position: 'insideTopLeft', color: t.ink3, fontSize: 10, formatter: `Banda ${fmtNum(lim.min)}-${fmtNum(lim.max)} mg/L` }, data: [[{ yAxis: lim.min }, { yAxis: lim.max }]] },
        markLine: { ...markLines(t), data: [...markLines(t).data, { yAxis: lim.min, lineStyle: { color: t.ink3, type: [4, 4] }, label: { formatter: `MÍNIMO ${fmtNum(lim.min)}`, position: 'insideEndBottom', color: t.ink2, fontSize: 10 } }, { yAxis: lim.max, lineStyle: { color: t.ink3, type: [4, 4] }, label: { formatter: `MÁXIMO ${fmtNum(lim.max)}`, position: 'insideEndTop', color: t.ink2, fontSize: 10 } }] },
        animationDurationUpdate: 500,
      }],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'SST licor mezcla', unit: 'mg/L', param: 'SST', data: s }]);
    tb.cols.splice(2, 0, { key: 'src', label: 'Fuente', fmt: (r) => { const x = s.find((y) => y.d === r.d); return x ? [...new Set(x.recs.map((q) => `${q.sheet}!${q.cell}`))].join(', ') : ''; } });
    cSST.setRows(tb.cols, tb.rows);
    cSST.setFoot('Hasta el 22/07 se usa "Licor mezcla" de la hoja SST LM; desde el 23/07, "SST Bio 2" de EDARI (confirmado por el cliente). Los datos de la hoja SST LM desde el 23/07 son BUSCARV desplazados y no se usan.');
  }

  function renderOD() {
    const t = tokens();
    const named = SHIFTS.map((sh, i) => ({ name: sh, unit: 'ppm', param: 'O.D.', data: series({ inst: EDARI, param: 'O.D.', shift: sh }), color: t.cat[i] }));
    cOD.chart.setOption({
      grid: timeGrid({ top: 36, bottom: 44 }),
      legend: { top: 0, left: 0, textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: axisTooltip(t, {
        unitOf: () => 'ppm', paramOf: () => 'O.D.',
        extra: (d) => {
          const lines = named.map((s) => { const x = s.data.find((y) => y.d === d); return x ? `${s.name}: ${x.recs.map((r) => `${fmtNum(r.v, 'O.D.')} (${r.time || 's/h'})`).join(', ')}` : ''; }).filter(Boolean);
          return lines.length ? `<div style="margin-top:4px;font-size:11px">Lecturas y hora:<br>${lines.map(esc).join('<br>')}</div>` : '';
        },
      }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: 'ppm' }),
      dataZoom: dataZoom(t),
      series: named.map((s, i) => ({ ...lineSeries(t, { name: s.name, data: toData(s.data), color: s.color }), ...(i === 0 ? { markLine: markLines(t) } : {}) })),
    }, { replaceMerge: ['series'] });
    const recs = sel().ranged.filter((r) => r.param === 'O.D.');
    cOD.setRows([
      { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'shift', label: 'Turno' }, { key: 'time', label: 'Hora' },
      { key: 'v', label: 'O.D. (ppm)', num: true, fmt: (r) => fmtNum(r.v, 'O.D.') }, { key: 'cell', label: 'Celda' },
    ], recs);
    cOD.setFoot(!recs.length ? 'Sin lecturas de O.D. en el rango seleccionado (la hoja O.D. B2 tiene datos de junio y julio).' : '');
  }

  function renderU() {
    const t = tokens();
    const param = ureaUnit === 'kilos' ? 'Urea dosificada (kilos)' : 'Urea dosificada (cantidad)';
    const s = series({ inst: EDARI, param });
    const unit = s[0] ? s[0].recs[0].unit : '';
    const obsU = new Map(state.data.obs.filter((o) => o.kind === 'Urea').map((o) => [o.d, o.text]));
    cU.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => unit, paramOf: () => param, extra: (d) => (obsU.get(d) ? `<div style="margin-top:4px">Observación: ${esc(obsU.get(d))}</div>` : '') }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit, scale: false }),
      dataZoom: dataZoom(t),
      series: [{ type: 'bar', name: ureaUnit === 'kilos' ? 'Urea (kg)' : 'Urea (sacos)', data: toData(s), barMaxWidth: 12, itemStyle: { color: t.single, borderRadius: [3, 3, 0, 0] }, markLine: markLines(t) }],
    }, { replaceMerge: ['series'] });
    const rows = s.map((x) => ({ d: x.d, v: x.v, obs: obsU.get(x.d) || '' }));
    cU.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'v', label: `Urea (${unit})`, num: true, fmt: (r) => fmtNum(r.v) }, { key: 'obs', label: 'Observación' }], rows);
    cU.setFoot(!s.length ? 'Sin dosificación registrada en el rango seleccionado (la hoja D. UREA tiene datos de junio y julio).' : '');
  }

  function update() { renderSST(); renderOD(); renderU(); }
  update();
  return { el: root, update };
}
