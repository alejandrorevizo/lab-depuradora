// Capa de gráficos: ECharts, tokens de tema, tarjetas con herramientas (tabla, PNG, CSV, ampliar),
// marcadores de bitácora, selección cruzada por fecha y zoom convertible en filtro.
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, HeatmapChart, BoxplotChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent,
  MarkAreaComponent, MarkPointComponent, VisualMapComponent, TitleComponent, GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LabelLayout, UniversalTransition, LegacyGridContainLabel } from 'echarts/features';
import { state, selectDate, obsOn, sel, setFilters } from '../store.js';
import { fmtDate, fmtDateLong, fmtNum, fmtVal, esc, isoToMs, msToIso } from './format.js';
import { openTable, toast } from './components.js';

echarts.use([
  LineChart, BarChart, ScatterChart, HeatmapChart, BoxplotChart, GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkAreaComponent, MarkPointComponent, VisualMapComponent, TitleComponent,
  GraphicComponent, CanvasRenderer, LabelLayout, UniversalTransition, LegacyGridContainLabel,
]);
export { echarts };

// Paleta categórica validada (orden fijo, nunca cíclico). Distinta del azul marino y verde agua de la marca.
const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const STATUS = { good: '#0ca30c', critical: '#d03b3b', above: '#fab219' };
export const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const SEQ_DARK = ['#1a2a40', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  return {
    surface: g('--surface'), surface2: g('--surface-2'), ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
    muted: g('--muted'), grid: g('--grid'), axis: g('--axis'), border: g('--border-strong'),
    single: isDark() ? '#6cb3ac' : '#1c2e46', accent: isDark() ? '#6cb3ac' : '#1c2e46',
    cat: isDark() ? CAT_DARK : CAT_LIGHT, seq: isDark() ? SEQ_DARK : SEQ,
  };
}

// Orden estable de puntos: el color sigue a la entidad, no a su posición en el filtro.
export const POINT_ORDER = [
  'Entrada', 'Homo', 'DAF', 'Permeado', 'Bio 2', 'Balsa N', 'Chulives', 'Tanque gris',
  'Agua sin tratar', 'Bio 2 (1:10)', 'Licor mezcla', 'Homogenizador', 'Pozo entrada', 'Entrada dil. 1:10',
];
export function orderPoints(list) {
  return [...list].sort((a, b) => {
    const ia = POINT_ORDER.indexOf(a), ib = POINT_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
}
/** Color de una entidad dentro de su universo completo (no del subconjunto filtrado). Más de 8 → gris punteado. */
export function colorOf(name, universe) {
  const t = tokens();
  const i = orderPoints(universe).indexOf(name);
  return i >= 0 && i < 8 ? t.cat[i] : t.muted;
}

// ---------- Registro de gráficos (redimensionar, tema, liberar) ----------
const live = new Set();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
  for (const e of entries) { const c = echarts.getInstanceByDom(e.target); if (c && e.contentRect.width) c.resize({ width: 'auto', height: 'auto' }); }
}) : null;

export function makeChart(el) {
  // Si el contenedor aún no está en la página, se inicia con un tamaño provisional; el ResizeObserver lo ajusta.
  const size = el.isConnected && el.clientWidth ? {} : { width: 600, height: parseInt(getComputedStyle(el).height, 10) || 320 };
  const c = echarts.init(el, null, { renderer: 'canvas', ...size });
  live.add(c);
  ro && ro.observe(el);
  return c;
}
export function disposeAll() {
  for (const c of live) { try { ro && ro.unobserve(c.getDom()); c.dispose(); } catch (e) { /* */ } }
  live.clear();
}

// ---------- Opciones comunes ----------
export function baseAxis(t) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    nameTextStyle: { color: t.ink3, fontSize: 11 },
  };
}
export function baseTooltip(t) {
  return {
    backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, padding: [8, 10],
    textStyle: { color: t.ink, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,.18); border-radius: 10px; max-width: 360px; white-space: normal;',
    confine: true,
  };
}

/** Líneas verticales: observaciones de la bitácora (EDARI) y fecha seleccionada. */
export function markLines(t, { obsKinds = ['EDARI'], range } = {}) {
  const s = sel();
  const data = [];
  const from = range ? range[0] : state.filters.from, to = range ? range[1] : state.filters.to;
  for (const [d, list] of s.obsByDate) {
    if ((from && d < from) || (to && d > to)) continue;
    const ok = list.filter((o) => obsKinds.includes(o.kind));
    if (!ok.length) continue;
    data.push({ xAxis: isoToMs(d), lineStyle: { color: t.muted, type: [3, 3], width: 1 }, label: { show: true, formatter: '✎', color: t.ink3, fontSize: 11, position: 'end' }, obs: true });
  }
  if (state.sel.date) {
    data.push({ xAxis: isoToMs(state.sel.date), lineStyle: { color: t.accent, type: 'solid', width: 2 }, label: { show: true, formatter: fmtDate(state.sel.date, true), color: t.accent, fontWeight: 700, fontSize: 11, position: 'end' } });
  }
  return { symbol: 'none', silent: true, animation: false, data };
}

/** Tooltip de eje: fecha, valores con unidad, nº de muestras y observación del día. */
export function axisTooltip(t, { unitOf = () => '', paramOf = () => '', extra } = {}) {
  return {
    ...baseTooltip(t),
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: t.axis } },
    formatter: (items) => {
      if (!items || !items.length) return '';
      const ms = Array.isArray(items[0].value) ? items[0].value[0] : items[0].axisValue;
      const d = msToIso(ms);
      let h = `<div style="font-weight:700;margin-bottom:4px">${fmtDateLong(d)}</div>`;
      for (const it of items) {
        const meta = Array.isArray(it.value) ? it.value[2] : null;
        const v = meta && meta.real != null ? meta.real : Array.isArray(it.value) ? it.value[1] : it.value;
        if (v == null || it.seriesType === 'custom') continue;
        const n = meta && meta.n > 1 ? ` <span style="color:${t.ink3}">(media de ${meta.n})</span>` : '';
        const time = meta && meta.time ? ` <span style="color:${t.ink3}">${meta.time}</span>` : '';
        if (meta && meta.real != null) h += `<div style="font-size:11px;color:${t.ink3}">Fuera de la escala del gráfico: se dibuja en el borde inferior</div>`;
        h += `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${it.marker}${esc(it.seriesName)}</span><b style="font-variant-numeric:tabular-nums">${esc(fmtVal(v, unitOf(it), paramOf(it)))}</b></div>${n || time ? `<div style="text-align:right;font-size:11px">${n}${time}</div>` : ''}${meta && meta.note ? `<div style="font-size:11px;color:${t.ink2};margin:2px 0 4px">Nota de celda: ${esc(meta.note.length > 160 ? meta.note.slice(0, 160) + '…' : meta.note)}</div>` : ''}`;
      }
      if (extra) h += extra(d) || '';
      const obs = obsOn(d);
      if (obs.length) {
        h += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${t.border};color:${t.ink2}">`;
        for (const o of obs.slice(0, 3)) h += `<div style="margin-top:2px">✎ <b>${esc(o.kind)}</b>: ${esc(o.text.length > 220 ? o.text.slice(0, 220) + '…' : o.text)}</div>`;
        if (obs.length > 3) h += `<div>+${obs.length - 3} más en Bitácora</div>`;
        h += '</div>';
      }
      h += `<div style="margin-top:6px;font-size:11px;color:${t.ink3}">Clic para ver el detalle del día</div>`;
      return h;
    },
  };
}

export function timeGrid(opts = {}) {
  return { left: 8, right: opts.right ?? 16, top: opts.top ?? 28, bottom: opts.bottom ?? 44, containLabel: true };
}

export function timeXAxis(t, range) {
  const r = range || [state.filters.from, state.filters.to];
  return {
    type: 'time', ...baseAxis(t), splitLine: { show: false },
    min: r[0] ? isoToMs(r[0]) : undefined, max: r[1] ? isoToMs(r[1]) : undefined,
    axisLabel: { color: t.ink3, fontSize: 11, hideOverlap: true, formatter: (v) => fmtDate(msToIso(v), true) },
  };
}

export function valueYAxis(t, { unit, log = false, min, max, scale = true } = {}) {
  return {
    type: log ? 'log' : 'value', ...baseAxis(t), scale, min, max,
    name: unit || '', nameLocation: 'end', nameGap: 12,
    axisLabel: { color: t.ink3, fontSize: 11, formatter: (v) => fmtNum(v, '', Math.abs(v) >= 100 ? 0 : 2) },
  };
}

export function dataZoom(t, { slider = true } = {}) {
  const dz = [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseWheel: false }];
  if (slider) dz.push({
    type: 'slider', xAxisIndex: 0, height: 16, bottom: 8, filterMode: 'none', borderColor: 'transparent',
    backgroundColor: t.surface2, fillerColor: 'rgba(108,179,172,.18)', handleStyle: { color: t.surface, borderColor: t.axis },
    moveHandleStyle: { color: t.axis }, textStyle: { color: t.ink3, fontSize: 10 }, labelFormatter: (v) => fmtDate(msToIso(v), true),
    dataBackground: { lineStyle: { color: t.axis }, areaStyle: { color: t.grid } },
  });
  return dz;
}

export function lineSeries(t, { name, data, color, dashed = false, area = false, step = false, symbolSize = 5, z }) {
  return {
    type: 'line', name, data, showSymbol: true, symbol: 'circle', symbolSize, connectNulls: false, step: step ? 'middle' : false, z,
    lineStyle: { width: 2, color, type: dashed ? [5, 4] : 'solid' },
    itemStyle: { color, borderColor: t.surface, borderWidth: 1 },
    emphasis: { focus: 'series', lineStyle: { width: 3 } },
    areaStyle: area ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + '33' }, { offset: 1, color: color + '00' }]) } : undefined,
    universalTransition: true,
    animationDuration: 600, animationDurationUpdate: 500, animationEasingUpdate: 'cubicOut',
  };
}

/** Convierte una serie diaria del store a datos ECharts [t, v, meta]. */
export const toData = (s) => s.map((x) => [x.t, x.v, { n: x.n, d: x.d, time: x.recs && x.recs.length === 1 ? x.recs[0].time : null, note: x.recs ? x.recs.map((r) => r.note).filter(Boolean).join(' | ') : '' }]);

/** Clic en cualquier punto del área de trazado → selecciona la fecha más cercana con datos. */
export function attachDateClick(chart, datesFn) {
  chart.getZr().on('click', (e) => {
    const pt = [e.offsetX, e.offsetY];
    if (!chart.containPixel({ gridIndex: 0 }, pt)) return;
    const x = chart.convertFromPixel({ gridIndex: 0 }, pt)[0];
    const dates = datesFn();
    if (!dates.length) return;
    let best = dates[0], bd = Infinity;
    for (const d of dates) { const k = Math.abs(isoToMs(d) - x); if (k < bd) { bd = k; best = d; } }
    if (bd > 3 * 86400000) return;
    selectDate(best);
  });
}

// ---------- Tarjeta con herramientas ----------
const ICONS = {
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>',
  png: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3 3 3-3"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
};

/**
 * Crea una tarjeta. opts: { title, sub, cls, chart: true|false, height: 'tall'|'short', tools: true, controls: html }
 * Devuelve { el, body, chartEl, chart, controls, setRows(columns, rows), setTitle(t,s), setFoot(html) }
 */
export function card(opts) {
  const el = document.createElement('section');
  el.className = `card ${opts.cls || 'col-12'}`;
  el.innerHTML = `
    <div class="card-head">
      <div><h3 class="card-title"></h3><p class="card-sub"></p></div>
      <div class="card-tools">
        ${opts.tools === false ? '' : `
        <button class="btn ghost icon" data-t="table" title="Ver datos" aria-label="Ver datos">${ICONS.table}</button>
        ${opts.chart === false ? '' : `<button class="btn ghost icon" data-t="png" title="Exportar PNG" aria-label="Exportar PNG">${ICONS.png}</button>`}
        <button class="btn ghost icon" data-t="csv" title="Exportar CSV" aria-label="Exportar CSV">${ICONS.csv}</button>
        ${opts.chart === false ? '' : `<button class="btn ghost icon" data-t="expand" title="Ampliar" aria-label="Ampliar">${ICONS.expand}</button>`}`}
      </div>
    </div>
    ${opts.controls != null ? `<div class="card-controls">${opts.controls}</div>` : ''}
    <div class="card-body">${opts.chart === false ? '' : `<div class="chart ${opts.height || ''}"></div>`}</div>
    <div class="card-foot hidden"></div>`;
  const api = {
    el,
    body: el.querySelector('.card-body'),
    chartEl: el.querySelector('.chart'),
    controls: el.querySelector('.card-controls'),
    chart: null,
    columns: [], rows: [],
    setTitle(t, s) { el.querySelector('.card-title').textContent = t; el.querySelector('.card-sub').textContent = s || ''; },
    setRows(columns, rows) { api.columns = columns; api.rows = rows; },
    setFoot(html) { const f = el.querySelector('.card-foot'); f.innerHTML = html || ''; f.classList.toggle('hidden', !html); },
  };
  api.setTitle(opts.title, opts.sub);
  if (api.chartEl) {
    api.chart = makeChart(api.chartEl);
    // Zoom → botón para convertirlo en filtro de fechas global
    api.chart.on('datazoom', () => {
      const o = api.chart.getOption();
      const x = o.xAxis && o.xAxis[0];
      if (!x || x.type !== 'time') return;
      const dz = o.dataZoom && o.dataZoom[0];
      if (!dz || (dz.start === 0 && dz.end === 100)) { api.el.querySelector('.zoom-apply')?.remove(); return; }
      const [a, b] = [dz.startValue, dz.endValue];
      if (a == null || b == null) return;
      let btn = api.el.querySelector('.zoom-apply');
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'btn primary zoom-apply';
        api.body.appendChild(btn);
      }
      btn.textContent = `Filtrar ${fmtDate(msToIso(a), true)} - ${fmtDate(msToIso(b), true)}`;
      btn.onclick = () => { setFilters({ from: msToIso(a), to: msToIso(b), preset: 'custom' }); btn.remove(); };
    });
  }
  el.querySelector('.card-tools').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const title = el.querySelector('.card-title').textContent;
    if (b.dataset.t === 'table') openTable(title, api.columns, api.rows);
    if (b.dataset.t === 'csv') downloadCSV(slug(title), api.columns, api.rows);
    if (b.dataset.t === 'png' && api.chart) exportPNG(api.chart, slug(title));
    if (b.dataset.t === 'expand') expand(api, title);
  });
  return api;
}

function expand(api, title) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" style="width:min(1400px,100%);height:calc(100vh - 32px)"><div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost" style="margin-left:auto" data-close>Cerrar</button></div><div class="modal-body" style="flex:1;display:flex"><div style="flex:1;min-height:300px"></div></div></div>`;
  document.body.appendChild(ov);
  const host = ov.querySelector('.modal-body > div');
  const c = makeChart(host);
  const opt = api.chart.getOption();
  c.setOption(opt);
  const close = () => { live.delete(c); c.dispose(); ov.remove(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
}

export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export function exportPNG(chart, name) {
  const t = tokens();
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: t.surface });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'grafico'}.png`;
  a.click();
}

export function toCSV(columns, rows) {
  const q = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => q(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => q(typeof c.csv === 'function' ? c.csv(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}
export function downloadCSV(name, columns, rows) {
  if (!rows || !rows.length) { toast('No hay datos para exportar con los filtros actuales.'); return; }
  const blob = new Blob([toCSV(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name || 'datos'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Columnas estándar para tablas de registros en formato largo. */
export const RECORD_COLUMNS = [
  { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) },
  { key: 'inst', label: 'Instalación' },
  { key: 'point', label: 'Punto' },
  { key: 'param', label: 'Parámetro' },
  { key: 'v', label: 'Valor', num: true, fmt: (r) => (r.v == null ? 'n/d' : fmtNum(r.v, r.param)) },
  { key: 'unit', label: 'Unidad' },
  { key: 'raw', label: 'Texto original' },
  { key: 'time', label: 'Hora' },
  { key: 'sheet', label: 'Hoja' },
  { key: 'cell', label: 'Celda' },
  { key: 'note', label: 'Nota de celda' },
];

/** Filas de tabla a partir de series diarias (una columna por serie). */
export function seriesRows(named) {
  const dates = new Set();
  for (const s of named) for (const x of s.data) dates.add(x.d);
  const idx = named.map((s) => new Map(s.data.map((x) => [x.d, x])));
  const rows = [...dates].sort().map((d) => {
    const r = { d };
    named.forEach((s, i) => { const x = idx[i].get(d); r['s' + i] = x ? x.v : null; r['n' + i] = x ? x.n : null; });
    const o = obsOn(d);
    r.obs = o.map((x) => `${x.kind}: ${x.text}`).join(' | ');
    return r;
  });
  const cols = [{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }];
  named.forEach((s, i) => cols.push({ key: 's' + i, label: `${s.name}${s.unit ? ' (' + s.unit + ')' : ''}`, num: true, fmt: (r) => (r['s' + i] == null ? 'n/d' : fmtNum(r['s' + i], s.param)) }));
  cols.push({ key: 'obs', label: 'Observación del día' });
  return { cols, rows };
}
