// Página Análisis: gráfico de control (media ± 2σ), dispersión con correlación y comparación de dos periodos.
import { state, sel, series, selectDate } from '../store.js';
import { card, tokens, baseAxis, baseTooltip, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, toData, attachDateClick, seriesRows, dataZoom, STATUS } from '../ui/charts.js';
import { fmtNum, fmtVal, fmtDate, fmtDateLong, fmtSigned, esc, isoToMs, addDays } from '../ui/format.js';
import { selectEl, segmented, tableHTML } from '../ui/components.js';
import { seriesOptions, stats, pearson, S } from './common.js';

const key = (sp) => JSON.stringify({ inst: sp.inst, param: sp.param, point: sp.point });

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Análisis</h2><p>Herramientas estadísticas calculadas con los datos cargados y el rango de fechas seleccionado. Los límites ±2σ son estadísticos, no límites de proceso ni legales.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  let spC = key(S.dqoPerm), spX = key(S.dqoHomo), spY = key(S.dqoPerm), spP = key(S.efect);
  let pA = null, pB = null;

  const cCtl = card({ title: 'Gráfico de control', sub: '', cls: 'col-12', height: 'tall', controls: '' });
  const cSc = card({ title: 'Dispersión y correlación', sub: '', cls: 'col-6', height: 'tall', controls: '' });
  const cCmp = card({ title: 'Comparación de dos periodos', sub: '', cls: 'col-6', height: 'tall', controls: '' });
  grid.append(cCtl.el, cSc.el, cCmp.el);
  attachDateClick(cCtl.chart, () => series(JSON.parse(spC)).map((x) => x.d));
  cSc.chart.on('click', (p) => { if (p.data && p.data.d) selectDate(p.data.d); });

  function pickers() {
    const opts = seriesOptions({ minCount: 3 });
    const ensure = (v) => (opts.some((o) => o.value === v) ? v : opts[0] && opts[0].value);
    spC = ensure(spC); spX = ensure(spX); spY = ensure(spY); spP = ensure(spP);
    cCtl.controls.innerHTML = '<span class="filter-label">Serie</span>';
    cCtl.controls.appendChild(selectEl(opts, spC, (v) => { spC = v; renderCtl(); }, 'Serie del gráfico de control'));
    cSc.controls.innerHTML = '<span class="filter-label">X</span>';
    cSc.controls.appendChild(selectEl(opts, spX, (v) => { spX = v; renderSc(); }, 'Serie eje X'));
    cSc.controls.insertAdjacentHTML('beforeend', '<span class="filter-label">Y</span>');
    cSc.controls.appendChild(selectEl(opts, spY, (v) => { spY = v; renderSc(); }, 'Serie eje Y'));
    cCmp.controls.innerHTML = '<span class="filter-label">Serie</span>';
    cCmp.controls.appendChild(selectEl(opts, spP, (v) => { spP = v; if (pA && pA.auto) { pA = null; pickers(); } renderCmp(); }, 'Serie a comparar'));
    const f = state.filters;
    // Por defecto: mitades del periodo con datos de la serie elegida dentro del rango global.
    const sdates = series(JSON.parse(spP)).map((x) => x.d);
    const lo = sdates[0] || f.from, hi = sdates[sdates.length - 1] || f.to;
    const mid = midDate(lo, hi);
    if (!pA || pA[0] < f.from || pB[1] > f.to || pA.auto) { pA = [lo, mid]; pB = [addDays(mid, 1), hi]; pA.auto = true; }
    const mk = (lbl, arr, i) => {
      const w = document.createElement('span');
      w.className = 'filter-group';
      w.innerHTML = `<span class="filter-label">${lbl}</span><input type="date" class="date-input" value="${arr[0]}" aria-label="${lbl} desde"><input type="date" class="date-input" value="${arr[1]}" aria-label="${lbl} hasta">`;
      const [a, b] = w.querySelectorAll('input');
      a.onchange = () => { arr[0] = a.value; pA.auto = false; renderCmp(); };
      b.onchange = () => { arr[1] = b.value; pA.auto = false; renderCmp(); };
      return w;
    };
    cCmp.controls.append(mk('A', pA), mk('B', pB));
  }

  function renderCtl() {
    const t = tokens();
    const sp = JSON.parse(spC);
    const s = series(sp);
    const unit = s[0] ? s[0].recs[0].unit : '';
    const st = stats(s.map((x) => x.v));
    const ucl = st.mean + 2 * st.sd, lcl = st.mean - 2 * st.sd;
    const out = s.filter((x) => x.v > ucl || x.v < lcl);
    cCtl.setTitle(`Gráfico de control · ${sp.param} · ${sp.point} (${sp.inst})`, st.n ? `n = ${st.n} · media ${fmtVal(st.mean, unit, sp.param)} · σ ${fmtNum(st.sd, sp.param)} · ±2σ: ${fmtNum(lcl, sp.param)} - ${fmtNum(ucl, sp.param)} · ${out.length} puntos fuera de ±2σ` : 'Sin datos');
    cCtl.chart.setOption({
      grid: timeGrid({ right: 90, bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => unit, paramOf: () => sp.param, extra: (d) => { const x = s.find((y) => y.d === d); if (!x || !st.sd) return ''; const z = (x.v - st.mean) / st.sd; return `<div style="margin-top:4px">Desviación: <b>${fmtSigned(z, 2)} σ</b>${Math.abs(z) > 2 ? ' · fuera de ±2σ' : ''}</div>`; } }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit }),
      dataZoom: dataZoom(t),
      series: [{
        type: 'line', name: `${sp.param} · ${sp.point}`,
        data: s.map((x) => { const o = x.v > ucl || x.v < lcl; return { value: [x.t, x.v, { n: x.n, d: x.d }], symbolSize: o ? 11 : 6, symbol: o ? 'diamond' : 'circle', itemStyle: { color: o ? STATUS.critical : t.single, borderColor: t.surface, borderWidth: 1 } }; }),
        lineStyle: { width: 1.5, color: t.single }, showSymbol: true,
        markArea: st.n ? { silent: true, itemStyle: { color: t.single + '10' }, data: [[{ yAxis: lcl }, { yAxis: ucl }]] } : undefined,
        markLine: st.n ? { ...markLines(t), data: [...markLines(t).data,
          { yAxis: st.mean, lineStyle: { color: t.ink2, type: 'solid', width: 1 }, label: { formatter: `Media ${fmtNum(st.mean, sp.param)}`, position: 'end', color: t.ink2, fontSize: 10 } },
          { yAxis: ucl, lineStyle: { color: t.ink3, type: [5, 4], width: 1 }, label: { formatter: `+2σ ${fmtNum(ucl, sp.param)}`, position: 'end', color: t.ink3, fontSize: 10 } },
          { yAxis: lcl, lineStyle: { color: t.ink3, type: [5, 4], width: 1 }, label: { formatter: `−2σ ${fmtNum(lcl, sp.param)}`, position: 'end', color: t.ink3, fontSize: 10 } }] } : markLines(t),
      }],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: `${sp.param} · ${sp.point}`, unit, param: sp.param, data: s }]);
    tb.cols.splice(2, 0, { key: 'z', label: 'Desviación (σ)', num: true, fmt: (r) => (st.sd ? fmtNum((r.s0 - st.mean) / st.sd, '', 2) : 'n/d') });
    cCtl.setRows(tb.cols, tb.rows);
    cCtl.setFoot('Media y σ (desviación típica muestral) calculadas con los valores del rango de fechas actual. Los puntos en rombo rojo quedan fuera de ±2σ.');
  }

  function renderSc() {
    const t = tokens();
    const x = JSON.parse(spX), y = JSON.parse(spY);
    const sx = series(x), sy = series(y);
    const my = new Map(sy.map((q) => [q.d, q]));
    const pairs = sx.filter((q) => my.has(q.d)).map((q) => ({ d: q.d, x: q.v, y: my.get(q.d).v }));
    const ux = sx[0] ? sx[0].recs[0].unit : '', uy = sy[0] ? sy[0].recs[0].unit : '';
    const pr = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y));
    cSc.setTitle('Dispersión y correlación', pr ? `n = ${pr.n} días con ambos datos · r = ${fmtNum(pr.r, '', 3)} · r² = ${fmtNum(pr.r2, '', 3)} · y = ${fmtNum(pr.a, '', 3)} ${pr.b >= 0 ? '+' : '−'} ${fmtNum(Math.abs(pr.b), '', 4)}·x` : `n = ${pairs.length} días con ambos datos: se necesitan al menos 3 para calcular la correlación`);
    const xs = pairs.map((p) => p.x);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    cSc.chart.setOption({
      grid: { left: 8, right: 24, top: 24, bottom: 28, containLabel: true },
      tooltip: { ...baseTooltip(t), trigger: 'item', formatter: (p) => (p.seriesType === 'scatter' ? `<b>${fmtDateLong(p.data.d)}</b><br>X · ${esc(x.param)} ${esc(x.point)}: <b>${esc(fmtVal(p.data.value[0], ux, x.param))}</b><br>Y · ${esc(y.param)} ${esc(y.point)}: <b>${esc(fmtVal(p.data.value[1], uy, y.param))}</b><div style="font-size:11px;color:${t.ink3};margin-top:4px">Clic: detalle del día</div>` : 'Recta de regresión (mínimos cuadrados)') },
      xAxis: { type: 'value', ...baseAxis(t), scale: true, name: `${x.param} · ${x.point}${ux ? ' (' + ux + ')' : ''}`, nameLocation: 'middle', nameGap: 26 },
      yAxis: { type: 'value', ...baseAxis(t), scale: true, name: `${y.param} · ${y.point}${uy ? ' (' + uy + ')' : ''}`, nameLocation: 'end', nameTextStyle: { color: t.ink3, fontSize: 11, align: 'left' } },
      series: [
        { type: 'scatter', data: pairs.map((p) => ({ value: [p.x, p.y], d: p.d })), symbolSize: 9, itemStyle: { color: t.cat[0], opacity: 0.85, borderColor: t.surface, borderWidth: 1 } },
        ...(pr ? [{ type: 'line', data: [[xmin, pr.a + pr.b * xmin], [xmax, pr.a + pr.b * xmax]], showSymbol: false, lineStyle: { color: t.cat[1], width: 2, type: [6, 4] }, silent: false }] : []),
      ],
    }, { replaceMerge: ['series'] });
    const cols = [{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'x', label: `X · ${x.param} ${x.point}`, num: true, fmt: (r) => fmtNum(r.x, x.param) }, { key: 'y', label: `Y · ${y.param} ${y.point}`, num: true, fmt: (r) => fmtNum(r.y, y.param) }];
    cSc.setRows(cols, pairs);
    cSc.setFoot('Se emparejan los días en que hay dato de ambas series (media diaria). Correlación de Pearson. Una correlación no implica causa.');
  }

  function renderCmp() {
    const t = tokens();
    const sp = JSON.parse(spP);
    const all = series({ ...sp, ignoreRange: true });
    const inP = (p) => all.filter((x) => x.d >= p[0] && x.d <= p[1]);
    const a = inP(pA), b = inP(pB);
    const unit = all[0] ? all[0].recs[0].unit : '';
    const sa = stats(a.map((x) => x.v)), sb = stats(b.map((x) => x.v));
    const dm = sa.n && sb.n ? sb.mean - sa.mean : null;
    cCmp.setTitle(`Comparación · ${sp.param} · ${sp.point}`, `A: ${fmtDate(pA[0])}-${fmtDate(pA[1])} · B: ${fmtDate(pB[0])}-${fmtDate(pB[1])}`);
    const cA = t.cat[0], cB = t.cat[1];
    cCmp.chart.setOption({
      grid: [{ left: 8, right: 16, top: 30, height: '48%', containLabel: true }, { left: 8, right: 16, top: '68%', bottom: 8, containLabel: true }],
      legend: { top: 0, left: 0, textStyle: { color: t.ink2, fontSize: 11 }, data: ['Periodo A', 'Periodo B'] },
      tooltip: { ...baseTooltip(t), trigger: 'item', formatter: (p) => (p.seriesType === 'boxplot' ? `<b>${p.name}</b><br>mín ${fmtNum(p.data[1], sp.param)} · Q1 ${fmtNum(p.data[2], sp.param)}<br>mediana ${fmtNum(p.data[3], sp.param)}<br>Q3 ${fmtNum(p.data[4], sp.param)} · máx ${fmtNum(p.data[5], sp.param)}` : `<b>${p.seriesName}</b> · día ${p.data.value[0]}<br>${fmtDateLong(p.data.d)}: <b>${esc(fmtVal(p.data.value[1], unit, sp.param))}</b>`) },
      xAxis: [
        { type: 'value', gridIndex: 0, ...baseAxis(t), name: 'Día desde el inicio del periodo', nameLocation: 'middle', nameGap: 22, minInterval: 1, splitLine: { show: false } },
        { type: 'value', gridIndex: 1, ...baseAxis(t), scale: true },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, ...baseAxis(t), scale: true, name: unit },
        { type: 'category', gridIndex: 1, data: ['Periodo A', 'Periodo B'], ...baseAxis(t), inverse: true, splitLine: { show: false } },
      ],
      series: [
        { type: 'line', name: 'Periodo A', xAxisIndex: 0, yAxisIndex: 0, data: a.map((x) => ({ value: [dayIdx(pA[0], x.d), x.v], d: x.d })), lineStyle: { color: cA, width: 2 }, itemStyle: { color: cA }, symbolSize: 5 },
        { type: 'line', name: 'Periodo B', xAxisIndex: 0, yAxisIndex: 0, data: b.map((x) => ({ value: [dayIdx(pB[0], x.d), x.v], d: x.d })), lineStyle: { color: cB, width: 2 }, itemStyle: { color: cB }, symbolSize: 5 },
        { type: 'boxplot', xAxisIndex: 1, yAxisIndex: 1, data: [sa.n ? { name: 'Periodo A', value: [sa.min, sa.q1, sa.median, sa.q3, sa.max], itemStyle: { color: cA + '33', borderColor: cA } } : { name: 'Periodo A', value: [] }, sb.n ? { name: 'Periodo B', value: [sb.min, sb.q1, sb.median, sb.q3, sb.max], itemStyle: { color: cB + '33', borderColor: cB } } : { name: 'Periodo B', value: [] }], boxWidth: [8, 22] },
      ],
    }, { replaceMerge: ['series'] });
    const rows = [
      { m: 'Nº de días', a: sa.n || 0, b: sb.n || 0 },
      { m: 'Media', a: sa.mean, b: sb.mean }, { m: 'Mediana', a: sa.median, b: sb.median },
      { m: 'Mínimo', a: sa.min, b: sb.min }, { m: 'Máximo', a: sa.max, b: sb.max }, { m: 'σ', a: sa.sd, b: sb.sd },
    ];
    const cols = [{ key: 'm', label: 'Estadístico' }, { key: 'a', label: 'Periodo A', num: true, fmt: (r) => (r.m === 'Nº de días' ? r.a : fmtNum(r.a, sp.param)) }, { key: 'b', label: 'Periodo B', num: true, fmt: (r) => (r.m === 'Nº de días' ? r.b : fmtNum(r.b, sp.param)) }];
    cCmp.setRows(cols, rows);
    cCmp.setFoot(dm != null ? `Media B − media A: <b>${fmtSigned(dm, 2)}${unit ? ' ' + esc(unit) : ''}</b>${sa.mean ? ` (${fmtSigned((dm / Math.abs(sa.mean)) * 100, 1)} %)` : ''}. Los periodos pueden estar fuera del rango de fechas global.` : 'Uno de los periodos no tiene datos de esta serie.');
  }

  function update() { pickers(); renderCtl(); renderSc(); renderCmp(); }
  update();
  return { el: root, update };
}

function midDate(a, b) {
  const m = (isoToMs(a) + isoToMs(b)) / 2;
  const d = new Date(m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayIdx(start, d) { return Math.round((isoToMs(d) - isoToMs(start)) / 86400000) + 1; }
