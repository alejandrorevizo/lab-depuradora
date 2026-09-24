// Página Bitácora: observaciones en la línea de tiempo, listado filtrable, Reg. Fot. y tabla puntual de Hoja2.
import { state, sel, selectDate } from '../store.js';
import { card, tokens, baseAxis, baseTooltip, timeXAxis, timeGrid, dataZoom } from '../ui/charts.js';
import { fmtDate, fmtDateLong, esc, isoToMs } from '../ui/format.js';
import { tableHTML, segmented } from '../ui/components.js';

const KINDS = [
  { id: 'EDARI', label: 'EDARI (Observaciones)' },
  { id: 'Urea', label: 'Urea' },
  { id: 'Torres', label: 'Torres' },
  { id: 'Calderas', label: 'Calderas' },
];

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Bitácora</h2><p>Observaciones escritas en el Excel. Las de la columna Observaciones de EDARI aparecen como marcas ✎ en todos los gráficos temporales y su texto se ve en el tooltip.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  let kind = 'all', q = '';
  const cTl = card({ title: 'Línea de tiempo', sub: 'Una fila por origen. Clic en una marca: detalle del día.', cls: 'col-12', height: 'short' });
  const cList = card({ title: 'Observaciones', sub: '', cls: 'col-12', chart: false, controls: '' });
  const seg = segmented([{ value: 'all', label: 'Todas' }, ...KINDS.map((k) => ({ value: k.id, label: k.id }))], kind, (v) => { kind = v; renderList(); });
  cList.controls.appendChild(seg);
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar texto…';
  search.className = 'date-input';
  search.style.minWidth = '220px';
  search.oninput = () => { q = search.value.toLowerCase(); renderList(); };
  cList.controls.appendChild(search);
  const cFot = card({ title: 'Registro fotográfico', sub: 'Hoja Reg. Fot. Las rutas son de un equipo local y no se pueden abrir desde la web: solo se listan.', cls: 'col-6', chart: false });
  const cH2 = card({ title: 'Análisis puntual (Hoja2)', sub: 'Tabla sin fecha, tal como está en el Excel.', cls: 'col-6', chart: false });
  grid.append(cTl.el, cList.el, cFot.el, cH2.el);
  cTl.chart.on('click', (p) => { if (p.data && p.data.d) selectDate(p.data.d); });

  const inRange = (d) => { const f = state.filters; return (!f.from || d >= f.from) && (!f.to || d <= f.to); };

  function renderTl() {
    const t = tokens();
    const obs = state.data.obs.filter((o) => inRange(o.d));
    const lanes = KINDS.filter((k) => obs.some((o) => o.kind === k.id));
    cTl.chartEl.style.height = Math.max(160, 70 + lanes.length * 36) + 'px';
    cTl.chart.resize();
    cTl.chart.setOption({
      grid: timeGrid({ bottom: 44, top: 10 }),
      tooltip: { ...baseTooltip(t), trigger: 'item', formatter: (p) => `<b>${fmtDateLong(p.data.d)}</b> · ${esc(p.data.kind)}<br>${p.data.texts.map((x) => '✎ ' + esc(x.length > 260 ? x.slice(0, 260) + '…' : x)).join('<br>')}` },
      xAxis: timeXAxis(t),
      yAxis: { type: 'category', data: lanes.map((k) => k.id), ...baseAxis(t), inverse: true, splitLine: { show: true, lineStyle: { color: t.grid } } },
      dataZoom: dataZoom(t),
      series: [{
        type: 'scatter', symbol: 'pin', symbolSize: 20,
        data: groupBy(obs, (o) => o.d + '|' + o.kind).map((g) => ({ value: [isoToMs(g[0].d), lanes.findIndex((k) => k.id === g[0].kind)], d: g[0].d, kind: g[0].kind, texts: g.map((o) => o.text), itemStyle: { color: t.cat[KINDS.findIndex((k) => k.id === g[0].kind)] } })),
      }],
    }, { replaceMerge: ['series'] });
  }

  function renderList() {
    const list = state.data.obs.filter((o) => inRange(o.d) && (kind === 'all' || o.kind === kind) && (!q || o.text.toLowerCase().includes(q))).slice().reverse();
    cList.setTitle('Observaciones', `${list.length} en el rango seleccionado`);
    cList.body.querySelector('.timeline-host')?.remove();
    const host = document.createElement('div');
    host.className = 'timeline-host';
    host.innerHTML = list.length ? `<ul class="timeline">${list.map((o) => `<li><time><a href="#" data-d="${o.d}">${fmtDate(o.d)}</a></time><div><span class="tag">${esc(o.kind)}</span><span class="muted small">${esc(o.sheet)}!${esc(o.cell)}</span><p>${esc(o.text)}</p></div></li>`).join('')}</ul>` : '<p class="muted">Sin observaciones con estos filtros.</p>';
    host.querySelectorAll('a[data-d]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); selectDate(a.dataset.d); }));
    cList.body.appendChild(host);
    cList.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'kind', label: 'Origen' }, { key: 'text', label: 'Observación' }, { key: 'sheet', label: 'Hoja' }, { key: 'cell', label: 'Celda' }], list);
  }

  function renderFot() {
    const rows = state.data.tables.regFot;
    const cols = [{ key: 'n', label: 'Nº' }, { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'ruta', label: 'Ruta (solo texto)' }, { key: 'muestra', label: 'Toma de muestras' }];
    cFot.body.innerHTML = rows.length ? tableHTML(cols, rows) : '<p class="muted">La hoja Reg. Fot. no está en el Excel o no tiene filas.</p>';
    cFot.setRows(cols, rows);
  }

  function renderH2() {
    const g = state.data.tables.hoja2;
    if (!g || !g.length) { cH2.body.innerHTML = '<p class="muted">La hoja Hoja2 no está en el Excel.</p>'; cH2.setRows([], []); return; }
    const w = Math.max(...g.map((r) => r.length));
    // quitar columnas totalmente vacías
    const keep = [...Array(w).keys()].filter((c) => g.some((r) => r[c]));
    const cols = keep.map((c, i) => ({ key: 'c' + i, label: '' }));
    const rows = g.map((r) => Object.fromEntries(keep.map((c, i) => [`c${i}`, r[c] || ''])));
    cH2.body.innerHTML = tableHTML(cols, rows).replace('<thead><tr>' + cols.map(() => '<th class=""></th>').join('') + '</tr></thead>', '');
    cH2.setRows(cols.map((c, i) => ({ ...c, label: `Columna ${i + 1}` })), rows);
  }

  function update() { renderTl(); renderList(); renderFot(); renderH2(); }
  update();
  return { el: root, update };
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.values()];
}
