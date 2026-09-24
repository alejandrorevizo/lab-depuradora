// Página Instalaciones: Torres, Calderas y glicol, Agua potable, Ósmosis O y P, Fructalys.
import { state, sel, series } from '../store.js';
import { card, tokens, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, colorOf, RECORD_COLUMNS } from '../ui/charts.js';
import { fmtNum, fmtDate, fmtDateLong, esc } from '../ui/format.js';
import { selectEl, segmented, tableHTML } from '../ui/components.js';
import { paramsOf, pointsOf, applyPointFilter } from './common.js';

const VIEWS = [
  { id: 'torres', label: 'Torres', insts: ['Torres'], note: 'Hoja TORRES (23/07-31/08) y sección "Control de torres" de CALDERAS Y TORRES (desde el 02/09).' },
  { id: 'calderas', label: 'Calderas y glicol', insts: ['Calderas', 'Glicol'], note: 'Hoja CALDERAS Y TORRES. Los rangos que aparecen en el informe del laboratorio se muestran como texto informativo, sin semáforo.' },
  { id: 'potable', label: 'Agua potable', insts: ['Agua potable'], note: 'Hoja AGUA POTABLE.' },
  { id: 'osmo', label: 'Ósmosis O', insts: ['Ósmosis O'], note: 'Hoja PAR. PLANTA O.' },
  { id: 'osmp', label: 'Ósmosis P', insts: ['Ósmosis P'], note: 'Hoja PAR. PLANTA P.' },
  { id: 'fructalys', label: 'Fructalys', insts: ['Fructalys'], note: 'Hoja FRUCTALYS. Los valores ">60000" no tienen valor numérico y se marcan aparte.' },
];

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Instalaciones</h2><p>Tendencias por equipo y último registro de cada instalación. Sin semáforo: solo tendencia.</p></div></div>
    <div class="sub-tabs" role="tablist"></div>
    <div class="grid"></div>`;
  const subs = root.querySelector('.sub-tabs');
  const grid = root.querySelector('.grid');
  let view = sessionGet('inst-view') || 'torres';
  const params = {};

  function drawTabs() {
    subs.innerHTML = '';
    for (const v of VIEWS) {
      const has = v.insts.some((i) => sel().catalog[i]);
      const b = document.createElement('button');
      b.className = 'preset';
      b.textContent = v.label + (has ? '' : ' (sin datos)');
      b.setAttribute('aria-pressed', String(v.id === view));
      b.onclick = () => { view = v.id; sessionSet('inst-view', view); render(); };
      subs.appendChild(b);
    }
  }

  function render() {
    drawTabs();
    grid.innerHTML = '';
    const v = VIEWS.find((x) => x.id === view);
    const main = v.insts[0];
    if (!sel().catalog[main]) {
      grid.innerHTML = `<div class="card col-12"><div class="card-body" style="padding:20px"><p>No hay datos de <b>${esc(v.label)}</b> en el Excel cargado.</p><p class="muted small">${esc(v.note)}</p></div></div>`;
      return;
    }
    for (const inst of v.insts) if (sel().catalog[inst]) trendCard(inst, v, v.insts.length > 1 ? (inst === main ? 'col-8' : 'col-4') : 'col-12');
    lastCard(main, v);
    if (view === 'calderas') { reactivosCard(); }
    if (view === 'torres' || view === 'calderas') obsCard(v);
  }

  function trendCard(inst, v, cls) {
    const t = tokens();
    const plist = paramsOf(inst);
    let param = params[inst] && plist.includes(params[inst]) ? params[inst] : plist.find((p) => /^(ph|conductividad|c\.e\.)$/i.test(p)) || plist[0];
    const c = card({ title: inst, sub: '', cls, controls: '' });
    c.controls.appendChild(selectEl(plist.map((p) => ({ value: p, label: p + (sel().catalog[inst][p].unit ? ` (${sel().catalog[inst][p].unit})` : '') })), param, (val) => { params[inst] = val; param = val; draw(); }, 'Parámetro'));
    grid.appendChild(c.el);
    attachDateClick(c.chart, () => series({ inst, param }).map((x) => x.d));
    function draw() {
      const unit = sel().catalog[inst][param].unit;
      const universe = pointsOf(inst, param);
      const pts = applyPointFilter(universe).length ? applyPointFilter(universe) : universe;
      const named = pts.map((p) => ({ name: p, unit, param, data: series({ inst, param, point: p }) })).filter((s) => s.data.length);
      c.setTitle(`${inst} · ${param}`, `${unit ? unit + ' · ' : ''}${v.note}`);
      c.chart.setOption({
        grid: timeGrid({ top: 40, bottom: 44 }),
        legend: { top: 0, left: 0, type: 'scroll', textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
        tooltip: axisTooltip(t, { unitOf: () => unit, paramOf: () => param }),
        xAxis: timeXAxis(t),
        yAxis: valueYAxis(t, { unit }),
        dataZoom: dataZoom(t),
        series: named.map((s, i) => ({ ...lineSeries(t, { name: s.name, data: toData(s.data), color: colorOf(s.name, universe), dashed: universe.indexOf(s.name) >= 8 }), ...(i === 0 ? { markLine: markLines(t) } : {}) })),
      }, { replaceMerge: ['series'] });
      const tb = seriesRows(named);
      c.setRows(tb.cols, tb.rows);
      const gt = state.data.records.filter((r) => r.inst === inst && r.param === param && r.flag === 'gt' && inRange(r.d));
      c.setFoot(gt.length ? `${gt.length} registros "${esc(gt[0].raw)}" (fuera de rango del método) no se dibujan: ${gt.map((r) => fmtDate(r.d, true)).join(', ')}.` : named.length > 8 ? 'Más de 8 series: las que pasan de 8 se dibujan en gris discontinuo. Usa el filtro de puntos para compararlas.' : '');
    }
    draw();
  }

  function lastCard(inst, v) {
    const c = card({ title: 'Último registro', sub: '', cls: 'col-12', chart: false });
    grid.appendChild(c.el);
    const recs = state.data.records.filter((r) => r.inst === inst && inRange(r.d));
    const withVal = recs.filter((r) => r.v != null);
    if (!withVal.length) { c.body.innerHTML = '<p class="muted">Sin datos en el rango seleccionado.</p>'; return; }
    const d = withVal.reduce((m, r) => (r.d > m ? r.d : m), withVal[0].d);
    const day = recs.filter((r) => r.d === d);
    c.setTitle('Último registro', fmtDateLong(d));
    const plist = [...new Set(day.map((r) => r.param))];
    const pts = [...new Set(day.map((r) => r.point))];
    const ref = state.data.tables.refRanges;
    const unitOf = (p) => (day.find((x) => x.param === p && x.unit) || {}).unit || '';
    // Una fila por punto/equipo y una columna por parámetro
    const rows = pts.map((pt) => {
      const r = { point: pt };
      for (const p of plist) {
        const x = day.find((y) => y.param === p && y.point === pt);
        r[p] = x ? (x.v != null ? fmtNum(x.v, p) : x.raw ? esc(x.raw) : 'n/d') : '';
        const rr = ref[`${inst}|${pt}|${p}`];
        if (rr) r[p] += ` <span class="muted small" title="Rango indicado en el informe del laboratorio">(${esc(rr)})</span>`;
      }
      return r;
    });
    const cols = [{ key: 'point', label: 'Punto / equipo' }, ...plist.map((p) => ({ key: p, label: p + (unitOf(p) ? ` (${unitOf(p)})` : ''), num: true, html: true, fmt: (r) => r[p] }))];
    c.body.innerHTML = tableHTML(cols, rows);
    c.setRows(RECORD_COLUMNS, day);
    if (Object.keys(ref).some((k) => k.startsWith(inst + '|'))) c.setFoot('Entre paréntesis: rango que figura en el informe del laboratorio (informativo, sin semáforo).');
  }

  function reactivosCard() {
    const c = card({ title: 'Verificación de reactivos', sub: '¿Las torres y calderas cuentan con reactivos suficientes para su dosificación?', cls: 'col-6', chart: false });
    grid.appendChild(c.el);
    const rows = state.data.tables.reactivos.filter((r) => inRange(r.d)).reverse();
    const cols = [{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'respuesta', label: 'Respuesta', html: true, fmt: (r) => `<span class="flag ${r.respuesta === 'SI' ? 'ok' : r.respuesta === 'NO' ? 'bad' : ''}">${r.respuesta}</span>`, csv: (r) => r.respuesta }, { key: 'obs', label: 'Observación' }];
    c.body.innerHTML = tableHTML(cols, rows);
    c.setRows(cols, rows);
  }

  function obsCard(v) {
    const c = card({ title: 'Observaciones y comentarios', sub: v.label, cls: 'col-6', chart: false });
    grid.appendChild(c.el);
    const kinds = view === 'torres' ? ['Torres'] : ['Calderas'];
    const list = state.data.obs.filter((o) => kinds.includes(o.kind) && inRange(o.d)).reverse();
    c.body.innerHTML = list.length ? `<ul class="timeline">${list.map((o) => `<li><time>${fmtDate(o.d)}</time><div><p>${esc(o.text)}</p></div></li>`).join('')}</ul>` : '<p class="muted">Sin observaciones en el rango.</p>';
    c.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'text', label: 'Texto' }, { key: 'cell', label: 'Celda' }], list);
  }

  const inRange = (d) => { const f = state.filters; return (!f.from || d >= f.from) && (!f.to || d <= f.to); };
  render();
  return { el: root, update: render };
}

function sessionGet(k) { try { return sessionStorage.getItem('revizo-lab-' + k); } catch (e) { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem('revizo-lab-' + k, v); } catch (e) { /* */ } }
