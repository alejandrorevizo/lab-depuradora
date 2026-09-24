// Página Calidad de datos: resumen de carga, días sin muestra por punto, valores no numéricos y avisos.
import { state, sel, selectDate } from '../store.js';
import { card, tokens, baseAxis, baseTooltip } from '../ui/charts.js';
import { fmtDate, fmtNum, esc } from '../ui/format.js';
import { tableHTML, segmented } from '../ui/components.js';
import { FLAG_LABEL } from '../parser/util.js';
import { orderPoints } from '../ui/charts.js';

const STATUS_TXT = { ok: 'Leída', missing: 'Falta', 'header-changed': 'Cabecera cambiada', omitted: 'Omitida', unknown: 'No reconocida', error: 'Error' };
const STATUS_CLS = { ok: 'ok', missing: 'bad', 'header-changed': 'warn', omitted: '', unknown: '', error: 'bad' };

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Calidad de datos</h2><p>Qué se ha leído de cada hoja, qué se ha descartado y por qué. Ningún "-", celda vacía, ">60000" o error de fórmula se convierte en 0.</p></div></div>
    <div class="grid"></div>`;
  const grid = root.querySelector('.grid');
  const cSheets = card({ title: 'Hojas leídas', sub: '', cls: 'col-12', chart: false });
  const cMiss = card({ title: 'Días sin muestra por punto · EDARI', sub: '', cls: 'col-12', height: 'tall' });
  const cSpecial = card({ title: 'Valores no numéricos, negativos y descartes', sub: '', cls: 'col-12', chart: false, controls: '' });
  const cIssues = card({ title: 'Avisos de la carga', sub: '', cls: 'col-12', chart: false, controls: '' });
  grid.append(cSheets.el, cMiss.el, cSpecial.el, cIssues.el);
  let spFilter = 'all', lvl = 'all';
  cSpecial.controls.appendChild(segmented([
    { value: 'all', label: 'Todo' }, { value: 'gt', label: '">…"' }, { value: 'error', label: 'Errores' }, { value: 'negative', label: 'Negativos' },
    { value: 'excluded', label: 'BUSCARV descartados' }, { value: 'text', label: 'Texto' }, { value: 'textnum', label: 'Número como texto' }, { value: 'merged', label: 'Combinadas' },
  ], spFilter, (v) => { spFilter = v; renderSpecial(); }));
  cIssues.controls.appendChild(segmented([{ value: 'all', label: 'Todos' }, { value: 'warn', label: 'Avisos' }, { value: 'info', label: 'Información' }], lvl, (v) => { lvl = v; renderIssues(); }));

  const inRange = (d) => { const f = state.filters; return (!f.from || d >= f.from) && (!f.to || d <= f.to); };

  function renderSheets() {
    const d = state.data;
    const rows = Object.values(d.sheets);
    const cols = [
      { key: 'name', label: 'Hoja' },
      { key: 'status', label: 'Estado', html: true, fmt: (r) => `<span class="flag ${STATUS_CLS[r.status]}">${STATUS_TXT[r.status] || r.status}</span>`, csv: (r) => STATUS_TXT[r.status] || r.status },
      { key: 'rows', label: 'Filas con fecha', num: true },
      { key: 'records', label: 'Celdas leídas', num: true },
      { key: 'values', label: 'Valores numéricos', num: true },
      { key: 'range', label: 'Rango de fechas', fmt: (r) => (r.dmin ? `${fmtDate(r.dmin)} - ${fmtDate(r.dmax)}` : 'n/d'), csv: (r) => (r.dmin ? `${r.dmin} - ${r.dmax}` : '') },
      { key: 'disc', label: 'Sin dato (motivo)', fmt: (r) => Object.entries(r.discarded).map(([k, v]) => `${FLAG_LABEL[k] || k}: ${v}`).join(' · ') || 'n/d', csv: (r) => Object.entries(r.discarded).map(([k, v]) => `${FLAG_LABEL[k] || k}: ${v}`).join(' | ') },
      { key: 'notes', label: 'Notas', fmt: (r) => r.notes.join(' · '), csv: (r) => r.notes.join(' | ') },
    ];
    cSheets.setTitle('Hojas leídas', `${d.meta.fileName || ''} · ${d.meta.sheetCount} hojas en el libro · ${fmtNum(d.meta.values)} valores numéricos · datos del ${fmtDate(d.meta.dmin)} al ${fmtDate(d.meta.dmax)}`);
    cSheets.body.innerHTML = tableHTML(cols, rows);
    cSheets.setRows(cols, rows);
  }

  function renderMiss() {
    const t = tokens();
    const recs = state.data.records.filter((r) => r.sheet === 'EDARI' && inRange(r.d));
    const dates = [...new Set(recs.map((r) => r.d))].sort();
    const params = [...new Set(recs.map((r) => r.param))];
    const combos = [];
    for (const p of params) {
      const pts = orderPoints([...new Set(recs.filter((r) => r.param === p).map((r) => r.point))]);
      for (const pt of pts) {
        const rr = recs.filter((r) => r.param === p && r.point === pt);
        const withV = new Set(rr.filter((r) => r.v != null).map((r) => r.d));
        const miss = dates.filter((d) => !withV.has(d));
        const byFlag = {};
        rr.filter((r) => r.v == null).forEach((r) => { byFlag[r.flag] = (byFlag[r.flag] || 0) + 1; });
        combos.push({ label: `${p} · ${pt}`, param: p, point: pt, total: dates.length, miss: miss.length, pct: dates.length ? (withV.size / dates.length) * 100 : 0, missDates: miss, byFlag });
      }
    }
    cMiss.setTitle('Días sin muestra por punto · EDARI', `${dates.length} fechas de EDARI en el rango. Barra = % de fechas con dato numérico.`);
    const h = Math.max(300, 40 + combos.length * 16);
    cMiss.chartEl.style.height = h + 'px';
    cMiss.chart.resize();
    cMiss.chart.setOption({
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...baseTooltip(t), trigger: 'item', formatter: (p) => { const c = combos[p.dataIndex]; return `<b>${esc(c.label)}</b><br>Con dato: ${c.total - c.miss} de ${c.total} fechas (${fmtNum(c.pct, '', 0)} %)<br>Sin dato: ${c.miss}${Object.keys(c.byFlag).length ? '<br>' + Object.entries(c.byFlag).map(([k, v]) => `${esc(FLAG_LABEL[k] || k)}: ${v}`).join('<br>') : ''}`; } },
      xAxis: { type: 'value', max: 100, ...baseAxis(t), axisLabel: { color: t.ink3, formatter: '{value} %' } },
      yAxis: { type: 'category', data: combos.map((c) => c.label), ...baseAxis(t), inverse: true, splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 10 } },
      series: [{ type: 'bar', data: combos.map((c) => ({ value: c.pct, itemStyle: { color: c.pct >= 90 ? t.cat[0] : c.pct >= 50 ? t.seq[2] : t.muted, borderRadius: [0, 3, 3, 0] } })), barMaxWidth: 11, label: { show: true, position: 'right', color: t.ink3, fontSize: 10, formatter: (p) => `${fmtNum(p.value, '', 0)} %` } }],
    }, { replaceMerge: ['series'] });
    const cols = [
      { key: 'param', label: 'Parámetro' }, { key: 'point', label: 'Punto' },
      { key: 'total', label: 'Fechas', num: true }, { key: 'miss', label: 'Sin dato', num: true },
      { key: 'pct', label: '% con dato', num: true, fmt: (r) => fmtNum(r.pct, '', 0) },
      { key: 'why', label: 'Motivo', fmt: (r) => Object.entries(r.byFlag).map(([k, v]) => `${FLAG_LABEL[k] || k}: ${v}`).join(' · ') },
      { key: 'dates', label: 'Fechas sin dato', fmt: (r) => r.missDates.map((d) => fmtDate(d, true)).join(', ') },
    ];
    cMiss.setRows(cols, combos);
    const empty = state.data.issues.filter((i) => i.type === 'emptyrow' && i.sheet === 'EDARI');
    cMiss.setFoot(empty.length ? `Filas con fecha pero sin ningún dato: ${empty.map((i) => esc(i.msg.replace(/^Fila \d+ \(([^)]+)\).*/, '$1'))).join(', ')}.` : '');
  }

  function renderSpecial() {
    const d = state.data;
    const rows = [];
    for (const r of d.records) {
      if (!inRange(r.d)) continue;
      let type = null;
      if (r.flag === 'gt' || r.flag === 'lt') type = 'gt';
      else if (r.flag === 'error') type = 'error';
      else if (r.flag === 'excluded') type = 'excluded';
      else if (r.flag === 'text') type = 'text';
      else if (r.flag === 'textnum') type = 'textnum';
      else if (r.flag === 'merged') type = 'merged';
      else if (r.v != null && r.v < 0) type = 'negative';
      if (!type) continue;
      if (spFilter !== 'all' && spFilter !== type) continue;
      rows.push({ ...r, type });
    }
    const TYPE_TXT = { gt: 'Fuera de rango (">")', error: 'Error de fórmula', excluded: 'BUSCARV desplazado (descartado)', text: 'Texto no numérico', textnum: 'Número guardado como texto (se usa)', merged: 'Celda combinada', negative: 'Valor negativo (se muestra)' };
    const cols = [
      { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'type', label: 'Tipo', fmt: (r) => TYPE_TXT[r.type] },
      { key: 'inst', label: 'Instalación' }, { key: 'param', label: 'Parámetro' }, { key: 'point', label: 'Punto' },
      { key: 'raw', label: 'Texto original' }, { key: 'v', label: 'Valor usado', num: true, fmt: (r) => (r.v == null ? 'sin dato' : fmtNum(r.v, r.param)) },
      { key: 'cell', label: 'Celda', fmt: (r) => `${r.sheet}!${r.cell}` },
    ];
    const neg = rows.filter((r) => r.type === 'negative' && r.param === 'Caudal' && r.point === 'Agua sin tratar').length;
    cSpecial.setTitle('Valores no numéricos, negativos y descartes', `${rows.length} celdas en el rango${neg ? ` · ${neg} negativos de agua sin tratar (dato válido según el cliente)` : ''}`);
    let host = cSpecial.body.querySelector('.sp-host');
    if (!host) { host = document.createElement('div'); host.className = 'sp-host'; cSpecial.body.appendChild(host); }
    host.innerHTML = tableHTML(cols, rows, { rowAttr: (r) => `class="clickable" data-d="${r.d}"` });
    host.querySelectorAll('tr[data-d]').forEach((tr) => (tr.onclick = () => selectDate(tr.dataset.d)));
    cSpecial.setRows(cols, rows);
  }

  function renderIssues() {
    const list = state.data.issues.filter((i) => lvl === 'all' || i.level === lvl).slice().sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1));
    const cols = [
      { key: 'level', label: 'Nivel', html: true, fmt: (r) => `<span class="flag ${r.level === 'warn' ? 'warn' : ''}">${r.level === 'warn' ? 'Aviso' : 'Info'}</span>`, csv: (r) => r.level },
      { key: 'sheet', label: 'Hoja' }, { key: 'cell', label: 'Celda' }, { key: 'msg', label: 'Detalle' },
    ];
    cIssues.setTitle('Avisos de la carga', `${state.data.issues.filter((i) => i.level === 'warn').length} avisos · ${state.data.issues.filter((i) => i.level !== 'warn').length} notas informativas`);
    let host = cIssues.body.querySelector('.is-host');
    if (!host) { host = document.createElement('div'); host.className = 'is-host'; cIssues.body.appendChild(host); }
    host.innerHTML = tableHTML(cols, list);
    cIssues.setRows(cols, list);
  }

  function update() { renderSheets(); renderMiss(); renderSpecial(); renderIssues(); }
  update();
  return { el: root, update };
}
