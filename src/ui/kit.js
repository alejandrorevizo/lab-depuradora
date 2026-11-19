// Piezas de interfaz de las áreas: KPI con semáforo, chips de filtro, matriz de equipos,
// paso de fecha y explorador de tendencias con banda de límites.
import { state, sel, series, aggregate, selectDate } from '../store.js';
import { card, tokens, makeChart, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, colorOf, orderPoints } from './charts.js';
import { fmtNum, fmtVal, fmtSigned, fmtDate, fmtDateLong, esc, unitSuffix, isoToMs } from './format.js';
import { limitFor, evaluate, limitText, SRC_LABEL, worst } from '../limits.js';

export const STATUS_TEXT = { good: 'En rango', warn: 'Cerca del límite', bad: 'Fuera de límite', none: 'Sin límite' };
export const STATUS_COLOR = { good: '#14a44d', warn: '#e8a317', bad: '#dc3545' };

export const statusDot = (s, title = '') => `<i class="dot ${s}" ${title ? `title="${esc(title)}"` : ''}></i>`;
export function pill(s, txt) { return `<span class="pill ${s}">${statusDot(s)}${esc(txt || STATUS_TEXT[s])}</span>`; }

/** Último valor diario (dentro del rango de fechas) de una serie. */
export function lastOf(spec) {
  const s = series(spec);
  return s.length ? s[s.length - 1] : null;
}

/** Fechas (ordenadas) con al menos un valor de la instalación dentro del rango. */
export function datesOf(insts, params) {
  const set = new Set();
  for (const r of sel().ranged) if (insts.includes(r.inst) && (!params || params.includes(r.param))) set.add(r.d);
  return [...set].sort();
}

/** Días desde la última muestra hasta el final del rango. */
export function ageText(d) {
  if (!d) return 'sin datos';
  const end = state.filters.to || d;
  const n = Math.round((isoToMs(end) - isoToMs(d)) / 86400000);
  return n <= 0 ? 'al día' : n === 1 ? 'hace 1 día' : `hace ${n} días`;
}

// ---------- KPI ----------
/**
 * Tarjeta KPI. opts: { label, spec | data (serie diaria), param, unit, inst, point, hint, onClick, extra }
 * El estado sale del límite activo (Excel o referencia) del (inst, point, param).
 */
export function kpi(opts) {
  const t = tokens();
  const s = opts.data || series(opts.spec);
  const el = document.createElement(opts.onClick ? 'button' : 'div');
  el.className = 'kpi2';
  if (opts.onClick) { el.type = 'button'; el.onclick = opts.onClick; }
  const sp = opts.spec || {};
  const inst = opts.inst || sp.inst, point = opts.point || sp.point, param = opts.param || sp.param;
  const lim = inst ? limitFor(state.data, inst, point, param) : null;
  if (!s.length) {
    el.innerHTML = `<div class="kpi2-top"><span class="kpi2-label">${esc(opts.label)}</span></div><div class="kpi2-val"><b class="muted">n/d</b></div><p class="kpi2-foot muted">Sin datos en el rango</p>`;
    return { el, status: 'none' };
  }
  const last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
  const st = evaluate(lim, last.v);
  const unit = opts.unit != null ? opts.unit : sp.unit || '';
  const d = prev ? last.v - prev.v : null;
  const dTxt = d == null ? '' : `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${fmtSigned(d, Math.abs(d) >= 100 ? 0 : 2)}</span>`;
  el.title = opts.hint || '';
  el.innerHTML = `
    <div class="kpi2-top"><span class="kpi2-label">${esc(opts.label)}</span>${lim ? statusDot(st, STATUS_TEXT[st]) : ''}</div>
    <div class="kpi2-val"><b>${fmtNum(last.v, param)}</b><span>${esc(unit)}</span>${dTxt}</div>
    <div class="kpi2-spark"></div>
    <p class="kpi2-foot">${fmtDate(last.d)}${lim ? ` · <span class="lim" title="${esc(lim.note || '')}">${esc(SRC_LABEL[lim.src])} ${esc(limitText(lim))}</span>` : ''}${opts.extra ? ' · ' + opts.extra : ''}</p>`;
  if (lim) el.classList.add('st-' + st);
  const host = el.querySelector('.kpi2-spark');
  requestAnimationFrame(() => {
    if (!host.isConnected) return;
    const c = makeChart(host);
    const color = st === 'bad' ? STATUS_COLOR.bad : st === 'warn' ? STATUS_COLOR.warn : t.single;
    c.setOption({
      animation: false,
      grid: { left: 0, right: 4, top: 4, bottom: 2 },
      xAxis: { type: 'time', show: false, min: 'dataMin', max: 'dataMax' },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { trigger: 'axis', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink, fontSize: 11 }, formatter: (p) => `${fmtDate(p[0].value[2].d)}: <b>${fmtVal(p[0].value[1], unit, param)}</b>`, confine: true },
      series: [{
        type: 'line', data: toData(s.slice(-30)), showSymbol: false, smooth: 0.2,
        lineStyle: { width: 1.6, color }, itemStyle: { color }, areaStyle: { color: color + '18' },
        markArea: lim && lim.min != null && lim.max != null ? { silent: true, itemStyle: { color: 'rgba(20,164,77,0.07)' }, data: [[{ yAxis: lim.min }, { yAxis: lim.max }]] } : undefined,
      }],
    });
  });
  return { el, status: lim ? st : 'none', last, lim };
}

// ---------- Chips ----------
/** Grupo de chips. options: [{ value, label, count?, dot? }]. multi: varios a la vez. */
export function chips({ options, selected, multi = false, onChange, allLabel }) {
  const el = document.createElement('div');
  el.className = 'chipset';
  let cur = new Set(multi ? selected : [selected]);
  const draw = () => {
    el.innerHTML = '';
    if (multi && allLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip2';
      b.textContent = allLabel;
      b.setAttribute('aria-pressed', String(cur.size === options.length));
      b.onclick = () => { cur = new Set(options.map((o) => o.value)); draw(); onChange([...cur]); };
      el.appendChild(b);
    }
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip2';
      b.setAttribute('aria-pressed', String(cur.has(o.value)));
      b.innerHTML = `${o.dot ? `<i class="sw" style="background:${o.dot}"></i>` : ''}${esc(o.label)}${o.count != null ? `<small>${o.count}</small>` : ''}`;
      b.onclick = () => {
        if (multi) {
          if (cur.has(o.value) && cur.size > 1) cur.delete(o.value); else cur.add(o.value);
          onChange(options.map((x) => x.value).filter((v) => cur.has(v)));
        } else { cur = new Set([o.value]); onChange(o.value); }
        draw();
      };
      el.appendChild(b);
    }
  };
  draw();
  return el;
}

// ---------- Paso de fecha ----------
export function dateStepper(dates, value, onChange) {
  const el = document.createElement('div');
  el.className = 'stepper';
  const i = Math.max(0, dates.indexOf(value));
  el.innerHTML = `<button type="button" class="btn ghost icon" data-p aria-label="Día anterior" ${i <= 0 ? 'disabled' : ''}>‹</button>
    <select class="sel" aria-label="Fecha">${[...dates].reverse().map((d) => `<option value="${d}" ${d === value ? 'selected' : ''}>${fmtDateLong(d)}</option>`).join('')}</select>
    <button type="button" class="btn ghost icon" data-n aria-label="Día siguiente" ${i >= dates.length - 1 ? 'disabled' : ''}>›</button>`;
  el.querySelector('select').onchange = (e) => onChange(e.target.value);
  el.querySelector('[data-p]').onclick = () => i > 0 && onChange(dates[i - 1]);
  el.querySelector('[data-n]').onclick = () => i < dates.length - 1 && onChange(dates[i + 1]);
  return el;
}

// ---------- Matriz de equipos ----------
/**
 * Tabla equipo × parámetro con el valor del día y su semáforo.
 * rows: puntos/equipos; cols: [{ param, label, unit }]. Devuelve { html, statuses, recs }.
 */
export function matrix(inst, rows, cols, d) {
  const recs = state.data.records.filter((r) => r.inst === inst && r.d === d);
  const statuses = [];
  const body = rows.map((pt) => {
    const cells = cols.map((c) => {
      const r = recs.find((x) => x.point === pt && x.param === c.param);
      if (!r) return '<td class="n muted">-</td>';
      const rawTxt = r.raw && !String(r.raw).startsWith('=') ? r.raw : '';
      if (r.v == null) return `<td class="n muted" title="${esc(rawTxt || 'Sin dato')}">${esc(rawTxt || '-')}</td>`;
      const lim = limitFor(state.data, inst, pt, c.param);
      const st = evaluate(lim, r.v);
      if (lim) statuses.push({ st, pt, param: c.param, v: r.v, lim, d });
      return `<td class="n cell-${st}" title="${esc(lim ? `${STATUS_TEXT[st]} · ${SRC_LABEL[lim.src]} ${limitText(lim, c.unit)}` : 'Sin límite definido')}">${fmtNum(r.v, c.param)}${lim ? statusDot(st) : ''}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(pt)}</th>${cells}</tr>`;
  }).join('');
  const head = `<tr><th></th>${cols.map((c) => `<th class="n">${esc(c.label || c.param)}${c.unit ? `<small>${esc(c.unit)}</small>` : ''}</th>`).join('')}</tr>`;
  return { html: `<div class="table-wrap matrix-wrap"><table class="t matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>`, statuses, recs };
}

// ---------- Explorador de tendencias ----------
/**
 * Tarjeta con chips de parámetro (uno) y de punto (varios) y la gráfica con la banda de límites.
 * opts: { title, cls, inst, params: [param], defaultParam, defaultPoints(param)?, log?, derived?: { [param]: { unit, points, series(point) } } }
 */
export function explorer(opts) {
  const c = card({ title: opts.title, sub: '', cls: opts.cls || 'col-12', controls: '', info: opts.info ? ' ' : null });
  const memo = explorer.memo[opts.key || opts.title] || (explorer.memo[opts.key || opts.title] = {});
  const cat = () => sel().catalog[opts.inst] || {};
  const derived = opts.derived || {};
  const allParams = opts.params.filter((p) => cat()[p] || derived[p]);
  let param = memo.param && allParams.includes(memo.param) ? memo.param : opts.defaultParam && allParams.includes(opts.defaultParam) ? opts.defaultParam : allParams[0];
  let log = false;
  const ptsOf = (p) => (derived[p] ? derived[p].points : orderPoints(Object.keys((cat()[p] || {}).points || {})).filter((pt) => series({ inst: opts.inst, param: p, point: pt }).length));
  const unitOf = (p) => (derived[p] ? derived[p].unit : (cat()[p] || {}).unit || '');
  let points = memo.points && memo.points[param] ? memo.points[param] : null;

  const ctrls = c.controls;
  ctrls.classList.add('explorer-ctrls');
  function drawCtrls() {
    ctrls.innerHTML = '';
    const row1 = document.createElement('div');
    row1.className = 'ctrl-row';
    row1.innerHTML = '<span class="ctrl-lbl">Parámetro</span>';
    row1.appendChild(chips({ options: allParams.map((p) => ({ value: p, label: p })), selected: param, onChange: (v) => { param = v; memo.param = v; points = (memo.points || {})[v] || null; drawCtrls(); draw(); } }));
    const universe = ptsOf(param);
    if (!points || !points.some((p) => universe.includes(p))) points = opts.defaultPoints ? opts.defaultPoints(param, universe) : universe;
    points = points.filter((p) => universe.includes(p));
    if (!points.length) points = universe;
    const row2 = document.createElement('div');
    row2.className = 'ctrl-row';
    row2.innerHTML = '<span class="ctrl-lbl">Puntos</span>';
    row2.appendChild(chips({ options: universe.map((p) => ({ value: p, label: p, dot: colorOf(p, universe) })), selected: points, multi: true, allLabel: universe.length > 2 ? 'Todos' : null, onChange: (v) => { points = v; memo.points = { ...(memo.points || {}), [param]: v }; draw(); } }));
    if (opts.log) {
      const lb = document.createElement('button');
      lb.type = 'button';
      lb.className = 'chip2 ghosty';
      lb.setAttribute('aria-pressed', String(log));
      lb.textContent = 'Escala log';
      lb.onclick = () => { log = !log; lb.setAttribute('aria-pressed', String(log)); draw(); };
      row2.appendChild(lb);
    }
    ctrls.append(row1, row2);
  }

  attachDateClick(c.chart, () => points.flatMap((p) => getSeries(p).map((x) => x.d)));
  function getSeries(p) {
    const raw = derived[param] ? derived[param].series(p) : series({ inst: opts.inst, param, point: p });
    return aggregate(raw);
  }

  function draw() {
    const t = tokens();
    const unit = unitOf(param);
    const universe = ptsOf(param);
    const named = points.map((p) => ({ name: p, unit, param, data: getSeries(p) })).filter((s) => s.data.length);
    const lims = points.map((p) => limitFor(state.data, opts.inst, p, param)).filter(Boolean);
    const lim = lims.length && lims.every((l) => l.id === lims[0].id) ? lims[0] : null;
    const allV = named.flatMap((s) => s.data.map((x) => x.v));
    const canLog = log && allV.every((v) => v > 0);
    const agg = state.filters.agg;
    c.setTitle(`${opts.title} · ${param}`, `${unit ? unit + ' · ' : ''}${agg === 'w' ? 'media semanal' : agg === 'm' ? 'media mensual' : 'valor diario'}${lim ? ` · límite ${SRC_LABEL[lim.src].toLowerCase()} ${limitText(lim, unit)}` : ''}`);
    const band = lim ? limitMarks(t, lim) : {};
    const range = dataRange(named.flatMap((s) => s.data.map((x) => x.d)));
    if (opts.info) c.setInfo(opts.info(param));
    c.chart.setOption({
      grid: timeGrid({ top: 34, bottom: 44 }),
      legend: { show: named.length > 1, top: 0, right: 0, type: 'scroll', textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: axisTooltip(t, { unitOf: () => unit, paramOf: () => param, extra: lim ? (d) => limitTooltip(named, d, lim, unit) : null }),
      xAxis: timeXAxis(t, range),
      yAxis: valueYAxis(t, { unit, log: canLog }),
      dataZoom: dataZoom(t),
      series: named.map((s, i) => ({
        ...lineSeries(t, { name: s.name, data: toData(s.data), color: colorOf(s.name, universe), dashed: universe.indexOf(s.name) >= 8 }),
        ...(i === 0 ? { markLine: mergeMarkLines(markLines(t, { obsKinds: opts.obsKinds, range }), band.markLine), markArea: band.markArea } : {}),
      })),
    }, { replaceMerge: ['series'] });
    const tb = seriesRows(named);
    c.setRows(tb.cols, tb.rows);
    const gt = state.data.records.filter((r) => r.inst === opts.inst && r.param === param && points.includes(r.point) && r.flag === 'gt' && inR(r.d));
    c.setFoot(gt.length ? `${gt.length} registros "${esc(gt[0].raw)}" (fuera de rango del método) no tienen valor numérico y no se dibujan.` : '');
  }
  drawCtrls();
  draw();
  return { el: c.el, card: c, redraw: () => { drawCtrls(); draw(); } };
}
explorer.memo = {};

/** Eje de fechas: desde el primer dato (si es posterior al inicio del filtro) hasta el final del filtro. */
export function dataRange(dates) {
  const f = state.filters;
  const first = dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : null;
  return [first && (!f.from || first > f.from) ? first : f.from, f.to];
}
const inR = (d) => { const f = state.filters; return (!f.from || d >= f.from) && (!f.to || d <= f.to); };

/** Banda verde entre mínimo y máximo y líneas discontinuas en los límites. */
export function limitMarks(t, lim) {
  const lines = [];
  const lbl = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v);
  if (lim.min != null) lines.push({ yAxis: lim.min, label: { formatter: `mín ${lbl(lim.min)}` } });
  if (lim.max != null) lines.push({ yAxis: lim.max, label: { formatter: `máx ${lbl(lim.max)}` } });
  return {
    markLine: { silent: true, symbol: 'none', lineStyle: { color: lim.src === 'excel' ? '#14a44d' : '#7a8696', type: [5, 4], width: 1.2 }, label: { color: t.ink3, fontSize: 10, position: 'insideEndTop' }, data: lines },
    markArea: lim.min != null && lim.max != null ? { silent: true, itemStyle: { color: 'rgba(20,164,77,0.07)' }, data: [[{ yAxis: lim.min }, { yAxis: lim.max }]] } : undefined,
  };
}
export function mergeMarkLines(a, b) {
  if (!b) return a;
  return { ...a, data: [...(a.data || []), ...b.data.map((x) => ({ ...x, lineStyle: b.lineStyle, label: { ...b.label, ...x.label, show: true } }))] };
}
function limitTooltip(named, d, lim, unit) {
  const out = named.map((s) => { const x = s.data.find((y) => y.d === d); return x ? evaluate(lim, x.v) : null; }).filter(Boolean);
  if (!out.length) return '';
  const w = worst(out);
  return `<div style="margin-top:4px;font-size:11px">${statusDot(w)} ${STATUS_TEXT[w]} · ${SRC_LABEL[lim.src]} ${esc(limitText(lim, unit))}</div>`;
}

/**
 * Tarjeta de sinóptico con paso de fecha. draw(d) devuelve el SVG del día.
 * Devuelve { el, render(selDate?) }.
 */
export function synopticCard({ title, insts, params, draw, info }) {
  const c = card({ title, sub: '', cls: 'col-12', chart: false, tools: false, controls: '', info });
  let d = null;
  function render(prefer) {
    const ds = datesOf(insts, params);
    if (!ds.length) { c.controls.innerHTML = ''; c.body.innerHTML = '<p class="muted">Sin datos en el rango.</p>'; return; }
    if (prefer && ds.includes(prefer)) d = prefer;
    if (!d || !ds.includes(d)) d = state.sel.date && ds.includes(state.sel.date) ? state.sel.date : ds[ds.length - 1];
    c.controls.innerHTML = '';
    c.controls.appendChild(dateStepper(ds, d, (nd) => { d = nd; render(); }));
    c.setTitle(title, `Análisis de laboratorio del ${fmtDateLong(d)} · esquema orientativo`);
    c.body.innerHTML = `<div class="syn-wrap">${draw(d)}</div>`;
  }
  return { el: c.el, render };
}

/** Línea de tiempo de observaciones. */
export function obsList(list, { empty = 'Sin observaciones en el rango seleccionado.', tags = false } = {}) {
  if (!list.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="timeline">${list.map((o) => `<li><time><a href="#" data-day="${o.d}">${fmtDate(o.d)}</a></time><div><p>${tags ? `<span class="tag">${esc(o.kind)}</span>` : ''}${esc(o.text)}</p></div></li>`).join('')}</ul>`;
}
export function wireDays(root) {
  root.querySelectorAll('[data-day]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); selectDate(a.dataset.day); }));
}
export { unitSuffix };
