// Página Parámetros por punto: mapa de calor fecha × punto y pequeños múltiplos por punto.
import { state, sel, series, setFilters, selectDate } from '../store.js';
import { card, tokens, makeChart, baseAxis, baseTooltip, timeXAxis, valueYAxis, axisTooltip, markLines, lineSeries, toData, colorOf, seriesRows, attachDateClick } from '../ui/charts.js';
import { fmtNum, fmtVal, fmtDate, fmtDateLong, esc, isoToMs } from '../ui/format.js';
import { selectEl, segmented } from '../ui/components.js';
import { EDARI, paramsOf, pointsOf, applyPointFilter, instSort } from './common.js';

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Parámetros por punto</h2><p>Mapa de calor de la media diaria por punto de muestreo y un mini gráfico por punto. Sin semáforo: solo tendencia. Las celdas vacías son días sin dato numérico.</p></div></div>
    <div class="card-controls" style="padding:0 0 12px" id="pp-controls"></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  const ctr = root.querySelector('#pp-controls');
  let inst = EDARI, param = 'DQO', scale = 'auto', sameY = false;

  const cHeat = card({ title: 'Mapa de calor', sub: '', cls: 'col-12', height: 'tall' });
  const cMult = card({ title: 'Pequeños múltiplos', sub: 'Un gráfico por punto. Clic en el título para filtrar ese punto.', cls: 'col-12', chart: false, controls: '' });
  cMult.controls.appendChild(segmented([{ value: false, label: 'Escala propia' }, { value: true, label: 'Misma escala' }], sameY, (v) => { sameY = v; renderMult(); }));
  grid.append(cHeat.el, cMult.el);
  const minis = [];

  function controls() {
    ctr.innerHTML = '';
    const insts = Object.keys(sel().catalog).sort(instSort);
    if (!insts.includes(inst)) inst = insts[0];
    const params = paramsOf(inst);
    if (!params.includes(param)) param = params.includes('DQO') ? 'DQO' : params[0];
    ctr.append(
      Object.assign(document.createElement('span'), { className: 'filter-label', textContent: 'Instalación' }),
      selectEl(insts.map((i) => ({ value: i, label: i })), inst, (v) => { inst = v; update(); }, 'Instalación'),
      Object.assign(document.createElement('span'), { className: 'filter-label', textContent: 'Parámetro' }),
      selectEl(params.map((p) => ({ value: p, label: p + (sel().catalog[inst][p].unit ? ` (${sel().catalog[inst][p].unit})` : '') })), param, (v) => { param = v; update(); }, 'Parámetro'),
      Object.assign(document.createElement('span'), { className: 'filter-label', textContent: 'Color' }),
      segmented([{ value: 'auto', label: 'Auto' }, { value: 'linear', label: 'Lineal' }, { value: 'log', label: 'Logarítmica' }], scale, (v) => { scale = v; renderHeat(); }),
    );
  }

  const unit = () => (sel().catalog[inst] && sel().catalog[inst][param] ? sel().catalog[inst][param].unit : '');

  function renderHeat() {
    const t = tokens();
    const universe = pointsOf(inst, param);
    const pts = applyPointFilter(universe);
    const s = sel();
    const recs = s.ranged.filter((r) => r.inst === inst && r.param === param && pts.includes(r.point));
    const dates = [...new Set(recs.map((r) => r.d))].sort();
    // Celdas "fuera de rango" (">60000") en el rango: se muestran aparte, sin valor
    const f = state.filters;
    const gt = state.data.records.filter((r) => r.inst === inst && r.param === param && pts.includes(r.point) && (r.flag === 'gt' || r.flag === 'lt') && (!f.from || r.d >= f.from) && (!f.to || r.d <= f.to));
    for (const r of gt) if (!dates.includes(r.d)) dates.push(r.d);
    dates.sort();
    const agg = new Map();
    for (const r of recs) {
      const k = r.d + '|' + r.point;
      const a = agg.get(k) || { sum: 0, n: 0, recs: [] };
      a.sum += r.v; a.n++; a.recs.push(r);
      agg.set(k, a);
    }
    const data = [];
    for (const [k, a] of agg) {
      const [d, p] = k.split('|');
      data.push([dates.indexOf(d), pts.indexOf(p), a.sum / a.n, a.n]);
    }
    const vals = data.map((x) => x[2]);
    const posMin = Math.min(...vals.filter((v) => v > 0));
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    const useLog = scale === 'log' || (scale === 'auto' && vmin > 0 && vmax / posMin > 50);
    const tr = (v) => (useLog ? Math.log10(Math.max(v, posMin)) : v);
    const heat = data.map((x) => [x[0], x[1], tr(x[2]), x[2], x[3]]);
    cHeat.setTitle(`${param} · ${inst}`, `${pts.length} puntos · ${dates.length} fechas · color ${useLog ? 'logarítmico' : 'lineal'} (${unit() || 'sin unidad en el Excel'})`);
    const h = Math.max(260, 60 + pts.length * 34);
    cHeat.chartEl.style.height = h + 'px';
    cHeat.chart.resize();
    cHeat.chart.setOption({
      grid: { left: 8, right: 70, top: 10, bottom: 60, containLabel: true },
      tooltip: {
        ...baseTooltip(t), trigger: 'item',
        formatter: (p) => {
          if (p.seriesType === 'scatter') return `<b>${fmtDateLong(dates[p.value[0]])}</b><br>${esc(pts[p.value[1]])}: <b>${esc(p.value[2])}</b><br><span style="color:${t.ink3}">Fuera del rango del método, sin valor numérico</span>`;
          const d = dates[p.value[0]];
          const obs = (s.obsByDate.get(d) || []).filter((o) => o.kind === 'EDARI');
          return `<b>${fmtDateLong(d)}</b><br>${esc(pts[p.value[1]])}: <b>${esc(fmtVal(p.value[3], unit(), param))}</b>${p.value[4] > 1 ? ` <span style="color:${t.ink3}">(media de ${p.value[4]})</span>` : ''}${obs.length ? `<div style="margin-top:6px;color:${t.ink2}">✎ ${esc(obs[0].text.slice(0, 200))}</div>` : ''}<div style="margin-top:4px;font-size:11px;color:${t.ink3}">Clic: detalle del día</div>`;
        },
      },
      xAxis: { type: 'category', data: dates.map((d) => fmtDate(d, true)), ...baseAxis(t), splitArea: { show: false }, axisLabel: { color: t.ink3, fontSize: 10, rotate: dates.length > 30 ? 45 : 0, hideOverlap: true } },
      yAxis: { type: 'category', data: pts, ...baseAxis(t), inverse: true, triggerEvent: true, axisLabel: { color: t.ink2, fontSize: 11 } },
      visualMap: {
        type: 'continuous', dimension: 2, min: tr(vmin), max: tr(vmax), calculable: true, orient: 'vertical', right: 0, top: 'middle', itemHeight: Math.min(200, h - 80),
        inRange: { color: t.seq }, textStyle: { color: t.ink3, fontSize: 10 },
        formatter: (v) => fmtNum(useLog ? 10 ** v : v, param, Math.abs(useLog ? 10 ** v : v) >= 100 ? 0 : 2),
        seriesIndex: 0,
      },
      series: [
        { type: 'heatmap', data: heat, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } }, progressive: 0, animation: true },
        { type: 'scatter', data: gt.map((r) => [dates.indexOf(r.d), pts.indexOf(r.point), r.raw]), symbol: 'rect', symbolSize: [18, 18], itemStyle: { color: t.surface2, borderColor: t.muted, borderWidth: 1 }, label: { show: true, formatter: '>', color: t.ink2, fontSize: 11, fontWeight: 700 } },
      ],
    }, { replaceMerge: ['series', 'visualMap'] });
    cHeat.chart.off('click');
    cHeat.chart.on('click', (p) => {
      if (p.componentType === 'yAxis') { toggle(p.value); return; }
      if (p.componentType === 'series') selectDate(dates[p.value[0]]);
    });
    cHeat.setFoot(gt.length ? `${gt.length} celdas con texto "${esc(gt[0].raw)}" o similar: fuera del rango del método, se marcan con ">" y no tienen valor.` : 'Clic en el nombre de un punto para filtrarlo; clic en una celda para ver el detalle del día.');
    // Tabla
    const cols = [{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, ...pts.map((p, i) => ({ key: 'p' + i, label: p, num: true, fmt: (r) => (r['p' + i] == null ? '' : fmtNum(r['p' + i], param)) }))];
    const rows = dates.map((d, di) => { const r = { d }; pts.forEach((p, i) => { const a = agg.get(d + '|' + p); r['p' + i] = a ? a.sum / a.n : null; }); return r; });
    cHeat.setRows(cols, rows);
    cMult.setRows(cols, rows);
  }

  function toggle(point) {
    const cur = state.filters.point;
    setFilters({ point: cur.includes(point) ? cur.filter((p) => p !== point) : [...cur, point] });
  }

  function renderMult() {
    const t = tokens();
    minis.splice(0).forEach((c) => { try { c.dispose(); } catch (e) { /* */ } });
    const universe = pointsOf(inst, param);
    const pts = applyPointFilter(universe);
    const named = pts.map((p) => ({ p, s: series({ inst, param, point: p }) }));
    const all = named.flatMap((x) => x.s.map((y) => y.v));
    const gmin = Math.min(...all), gmax = Math.max(...all);
    let body = cMult.body.querySelector('.multiples');
    if (!body) { body = document.createElement('div'); body.className = 'multiples'; cMult.body.appendChild(body); }
    body.innerHTML = named.map((x, i) => {
      const last = x.s[x.s.length - 1];
      return `<div class="multiple"><h4 data-p="${esc(x.p)}" title="Filtrar este punto"><span class="legend-dot" style="background:${colorOf(x.p, universe)}"></span>${esc(x.p)}<small>${last ? `${fmtNum(last.v, param)} · ${fmtDate(last.d, true)}` : 'sin datos'}</small></h4><div class="chart" data-i="${i}"></div></div>`;
    }).join('') || '<p class="muted">Sin datos para este parámetro en el rango seleccionado.</p>';
    body.querySelectorAll('h4[data-p]').forEach((h) => (h.onclick = () => toggle(h.dataset.p)));
    body.querySelectorAll('.chart').forEach((elc) => {
      const x = named[+elc.dataset.i];
      const c = makeChart(elc);
      minis.push(c);
      const col = colorOf(x.p, universe);
      c.setOption({
        animationDuration: 500,
        grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
        xAxis: { ...timeXAxis(t), axisLabel: { show: false } },
        yAxis: { ...valueYAxis(t, {}), min: sameY ? gmin : undefined, max: sameY ? gmax : undefined, splitNumber: 2, name: '', axisLabel: { color: t.ink3, fontSize: 9, formatter: (v) => fmtNum(v, '', Math.abs(v) >= 100 ? 0 : 1) } },
        tooltip: axisTooltip(t, { unitOf: () => unit(), paramOf: () => param }),
        series: [{ ...lineSeries(t, { name: x.p, data: toData(x.s), color: col, symbolSize: 3 }), markLine: markLines(t) }],
      });
      attachDateClick(c, () => x.s.map((y) => y.d));
    });
  }

  function update() { controls(); renderHeat(); renderMult(); }
  update();
  return { el: root, update };
}
