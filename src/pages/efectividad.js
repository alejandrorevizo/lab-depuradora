// Página Efectividad: serie diaria con banda del Excel y semáforo, distribución y tabla.
import { state, sel, series } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, toData, attachDateClick, dataZoom, STATUS, baseAxis, baseTooltip } from '../ui/charts.js';
import { fmtNum, fmtDate, esc } from '../ui/format.js';
import { segmented, tableHTML } from '../ui/components.js';
import { S, bandStatus, STATUS_LABEL, stats, effAxisMin } from './common.js';

const SYMBOL = { good: 'circle', critical: 'triangle', above: 'triangle' };

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Efectividad</h2><p>Efectividad (% de depuración) de EDARI calculada con la fórmula del Excel: ((DQO Homo − DQO Permeado) / DQO Homo) × 100. La banda es la de las columnas BAJO/ALTO de la hoja DQO.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  let showDQO = false;
  const cStats = card({ title: 'Resumen del periodo', cls: 'col-12', chart: false, tools: false });
  const cMain = card({ title: 'Efectividad diaria', sub: '', cls: 'col-8', height: 'tall', controls: '' });
  cMain.controls.appendChild(segmented([{ value: false, label: 'Solo EDARI' }, { value: true, label: '+ hoja DQO (DAF → Permeado)' }], showDQO, (v) => { showDQO = v; render(); }));
  const cHist = card({ title: 'Distribución', sub: 'Nº de días por intervalo', cls: 'col-4', height: 'tall' });
  const cTable = card({ title: 'Detalle diario', sub: '', cls: 'col-12', chart: false });
  grid.append(cStats.el, cMain.el, cHist.el, cTable.el);
  attachDateClick(cMain.chart, () => series(S.efect).map((x) => x.d));
  cHist.chart.on('click', (p) => { /* sin filtro: la distribución es informativa */ });

  function render() {
    const t = tokens();
    const lim = state.data.limits.efectividad;
    const s = series(S.efect);
    const st = stats(s.map((x) => x.v));
    const cnt = { good: 0, critical: 0, above: 0 };
    s.forEach((x) => cnt[bandStatus(x.v, lim.low, lim.high)]++);
    cStats.body.innerHTML = s.length ? `<div class="stats">
      <div><b>${s.length}</b><span>días con dato</span></div>
      <div><b style="color:var(--good-ink)">● ${cnt.good}</b><span>dentro ${fmtNum(lim.low)}-${fmtNum(lim.high)} % (${fmtNum((cnt.good / s.length) * 100, '', 0)} %)</span></div>
      <div><b style="color:var(--critical-ink)">▼ ${cnt.critical}</b><span>por debajo de ${fmtNum(lim.low)} %</span></div>
      <div><b style="color:var(--warning-ink)">▲ ${cnt.above}</b><span>por encima de ${fmtNum(lim.high)} %</span></div>
      <div><b>${fmtNum(st.mean, 'Efectividad')} %</b><span>media</span></div>
      <div><b>${fmtNum(st.median, 'Efectividad')} %</b><span>mediana</span></div>
      <div><b>${fmtNum(st.min, 'Efectividad')} %</b><span>mínimo</span></div>
      <div><b>${fmtNum(st.max, 'Efectividad')} %</b><span>máximo</span></div></div>
      <p class="muted small" style="margin:8px 0 0">Límites: ${esc(lim.src)}.</p>` : '<p class="muted">Sin datos de efectividad en el rango seleccionado.</p>';

    cMain.setTitle('Efectividad diaria', `● dentro de ${fmtNum(lim.low)}-${fmtNum(lim.high)} % · ▼ por debajo · ▲ por encima (marcado aparte)`);
    const sd = showDQO ? series(S.efectDQO) : [];
    const all = [...s, ...sd].map((x) => x.v);
    const yMin = effAxisMin(all, lim.low);
    const pts = s.map((x) => {
      const b = bandStatus(x.v, lim.low, lim.high);
      const out = x.v < yMin;
      return { value: [x.t, out ? yMin : x.v, { n: x.n, d: x.d, real: out ? x.v : null }], symbol: out ? 'pin' : SYMBOL[b], symbolRotate: b === 'critical' && !out ? 180 : 0, symbolSize: out ? 22 : b === 'good' ? 9 : 12, itemStyle: { color: STATUS[b], borderColor: t.surface, borderWidth: 1.5 }, label: out ? { show: true, position: 'right', formatter: `${fmtNum(x.v, 'Efectividad')} %`, color: t.ink2, fontSize: 10, fontWeight: 700 } : undefined };
    });
    cMain.chart.setOption({
      grid: timeGrid({ top: 36, bottom: 44 }),
      legend: { top: 0, left: 0, textStyle: { color: t.ink2, fontSize: 11 }, data: ['Efectividad EDARI', ...(showDQO ? ['Efectividad hoja DQO (DAF → Permeado)'] : [])] },
      tooltip: axisTooltip(t, { unitOf: () => '%', paramOf: () => 'Efectividad', extra: (d) => { const x = s.find((y) => y.d === d); return x ? `<div style="margin-top:4px">Estado EDARI: <b>${STATUS_LABEL[bandStatus(x.v, lim.low, lim.high)]}</b></div>` : ''; } }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: '%', min: yMin, max: 100, scale: false }),
      dataZoom: dataZoom(t),
      series: [
        {
          type: 'line', name: 'Efectividad EDARI', data: pts, lineStyle: { width: 1.5, color: t.axis }, itemStyle: { color: t.single }, showSymbol: true, z: 3,
          markArea: { silent: true, itemStyle: { color: 'rgba(12,163,12,0.08)' }, label: { show: true, position: 'insideTopLeft', color: t.ink3, fontSize: 10, formatter: `Banda ${fmtNum(lim.low)}-${fmtNum(lim.high)} %` }, data: [[{ yAxis: lim.low }, { yAxis: lim.high }]] },
          markLine: { ...markLines(t), data: [...markLines(t).data, { yAxis: lim.low, lineStyle: { color: STATUS.critical, type: [4, 4], width: 1 }, label: { formatter: `BAJO ${fmtNum(lim.low)} %`, position: 'insideEndTop', color: t.ink2, fontSize: 10 } }, { yAxis: lim.high, lineStyle: { color: t.ink3, type: [4, 4], width: 1 }, label: { formatter: `ALTO ${fmtNum(lim.high)} %`, position: 'insideEndBottom', color: t.ink2, fontSize: 10 } }] },
          animationDurationUpdate: 500,
        },
        ...(showDQO ? [{ type: 'line', name: 'Efectividad hoja DQO (DAF → Permeado)', data: sd.map((x) => [x.t, Math.max(x.v, yMin), { n: x.n, d: x.d, real: x.v < yMin ? x.v : null }]), lineStyle: { width: 1.5, type: [5, 4], color: t.muted }, itemStyle: { color: t.muted }, symbolSize: 5 }] : []),
      ],
    }, { replaceMerge: ['series'] });
    cMain.setFoot(showDQO ? 'La efectividad de la hoja DQO usa otra fórmula (DAF contra Permeado) y cubre junio y julio: se muestra solo como referencia, sin semáforo.' : '');

    // Distribución
    const bins = [
      { l: `< 80`, f: (v) => v < 80 }, { l: '80-85', f: (v) => v >= 80 && v < 85 }, { l: `85-${fmtNum(lim.low)}`, f: (v) => v >= 85 && v < lim.low },
      { l: `${fmtNum(lim.low)}-92`, f: (v) => v >= lim.low && v < 92 }, { l: '92-94', f: (v) => v >= 92 && v < 94 }, { l: '94-96', f: (v) => v >= 94 && v < 96 },
      { l: `96-${fmtNum(lim.high)}`, f: (v) => v >= 96 && v <= lim.high }, { l: `> ${fmtNum(lim.high)}`, f: (v) => v > lim.high },
    ];
    const counts = bins.map((b) => s.filter((x) => b.f(x.v)).length);
    const binStatus = (i) => (i < 3 ? 'critical' : i < 7 ? 'good' : 'above');
    cHist.chart.setOption({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: { ...baseTooltip(t), trigger: 'item', formatter: (p) => `${p.name} %: <b>${p.value}</b> días<br>${STATUS_LABEL[binStatus(p.dataIndex)]}` },
      xAxis: { type: 'value', ...baseAxis(t), minInterval: 1 },
      yAxis: { type: 'category', data: bins.map((b) => b.l + ' %'), ...baseAxis(t), inverse: true, splitLine: { show: false } },
      series: [{ type: 'bar', data: counts.map((c, i) => ({ value: c, itemStyle: { color: STATUS[binStatus(i)], borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 20, label: { show: true, position: 'right', color: t.ink2, fontSize: 11 } }],
    }, { replaceMerge: ['series'] });
    cHist.setRows([{ key: 'l', label: 'Intervalo (%)' }, { key: 'c', label: 'Días', num: true }, { key: 's', label: 'Estado' }], bins.map((b, i) => ({ l: b.l, c: counts[i], s: STATUS_LABEL[binStatus(i)] })));

    // Tabla
    const cols = [
      { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) },
      { key: 'homo', label: 'DQO Homo (mg/L)', num: true, fmt: (r) => fmtNum(r.homo, 'DQO') },
      { key: 'perm', label: 'DQO Permeado (mg/L)', num: true, fmt: (r) => fmtNum(r.perm, 'DQO') },
      { key: 'ef', label: 'Efectividad (%)', num: true, fmt: (r) => fmtNum(r.ef, 'Efectividad') },
      { key: 'st', label: 'Estado', html: true, fmt: (r) => `<span class="status ${r.stc}">${r.stc === 'good' ? '●' : r.stc === 'critical' ? '▼' : '▲'} ${r.st}</span>`, csv: (r) => r.st },
      { key: 'obs', label: 'Observación' },
    ];
    const byD = (spec) => new Map(series(spec).map((x) => [x.d, x.v]));
    const H = byD(S.dqoHomo), P = byD(S.dqoPerm);
    const rows = [...s].reverse().map((x) => {
      const stc = bandStatus(x.v, lim.low, lim.high);
      return { d: x.d, homo: H.get(x.d), perm: P.get(x.d), ef: x.v, stc, st: STATUS_LABEL[stc], obs: (sel().obsByDate.get(x.d) || []).filter((o) => o.kind === 'EDARI').map((o) => o.text).join(' | ') };
    });
    cTable.setRows(cols, rows);
    cTable.body.innerHTML = tableHTML(cols, rows);
    cMain.setRows(cols, rows);
  }
  render();
  return { el: root, update: render };
}
