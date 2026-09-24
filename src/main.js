// Arranque de la aplicación: carga de datos, barra de filtros, pestañas, detalle del día,
// subida de Excel, marcadores, historial, tema y modo presentación.
import './styles.css';
import { state, subscribe, setData, setFilters, setTab, selectDate, clearSelection, sel, PRESETS, presetRange, toHash, fromHash } from './store.js';
import { disposeAll, downloadCSV, RECORD_COLUMNS } from './ui/charts.js';
import { toast, modal, tableHTML, multiSelect, setCsvHook, el } from './ui/components.js';
import { fmtDate, fmtDateLong, fmtNum, esc } from './ui/format.js';
import { FLAG_LABEL } from './parser/util.js';
import { parseBuffer, fetchShared, fetchHistory, uploadShared, logout } from './data.js';
import { instSort } from './pages/common.js';
import { orderPoints } from './ui/charts.js';

import resumen from './pages/resumen.js';
import proceso from './pages/proceso.js';
import efectividad from './pages/efectividad.js';
import parametros from './pages/parametros.js';
import biologico from './pages/biologico.js';
import instalaciones from './pages/instalaciones.js';
import analisis from './pages/analisis.js';
import bitacora from './pages/bitacora.js';
import calidad from './pages/calidad.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', create: resumen },
  { id: 'proceso', label: 'Proceso DQO', create: proceso },
  { id: 'efectividad', label: 'Efectividad', create: efectividad },
  { id: 'parametros', label: 'Parámetros por punto', create: parametros },
  { id: 'biologico', label: 'Biológico', create: biologico },
  { id: 'instalaciones', label: 'Instalaciones', create: instalaciones },
  { id: 'analisis', label: 'Análisis', create: analisis },
  { id: 'bitacora', label: 'Bitácora', create: bitacora },
  { id: 'calidad', label: 'Calidad de datos', create: calidad },
];

const $ = (s) => document.querySelector(s);
const main = $('#main');
let page = null;
let apiMode = 'unknown'; // 'api' | 'noapi'
setCsvHook((title, cols, rows) => downloadCSV(title.toLowerCase().replace(/[^a-z0-9]+/gi, '-'), cols, rows));

// ---------------------------------------------------------------------------
// Tema y presentación
// ---------------------------------------------------------------------------
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
$('#btn-theme').onclick = () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('revizo-lab-theme', next); } catch (e) { /* */ }
  if (state.data) mountPage();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme && state.data) mountPage(); });

let rotateTimer = null;
$('#btn-present').onclick = async () => {
  const on = !document.body.classList.contains('present');
  if (on) {
    document.body.classList.add('present');
    try { await document.documentElement.requestFullscreen?.(); } catch (e) { /* */ }
    const m = modal({
      title: 'Modo presentación',
      body: '<p>Pantalla completa sin barra de filtros. Pulsa <b>Esc</b> o el botón de presentación para salir.</p><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rot"> Pasar de página automáticamente cada 20 segundos</label>',
      foot: '<button class="btn primary" data-close>Empezar</button>',
      width: 480,
    });
    m.el.querySelector('#rot').onchange = (e) => {
      clearInterval(rotateTimer);
      if (e.target.checked) rotateTimer = setInterval(() => { const i = TABS.findIndex((t) => t.id === state.tab); setTab(TABS[(i + 1) % TABS.length].id); }, 20000);
    };
  } else exitPresent();
};
function exitPresent() {
  document.body.classList.remove('present');
  clearInterval(rotateTimer);
  if (document.fullscreenElement) document.exitFullscreen?.();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('present')) exitPresent(); });

// ---------------------------------------------------------------------------
// Carga inicial
// ---------------------------------------------------------------------------
async function boot() {
  const h = fromHash(location.hash);
  if (h.tab && TABS.some((t) => t.id === h.tab)) state.tab = h.tab;
  Object.assign(state.filters, h.filters);
  if (h.date) state.sel.date = h.date;

  const r = await fetchShared();
  if (r.status === 'auth') { location.href = '/login.html'; return; }
  apiMode = r.status === 'noapi' ? 'noapi' : 'api';
  state.storage = r.status === 'ok' || r.status === 'empty' ? 'blob' : 'none';
  state.blobAccess = r.access || 'private';
  if (apiMode === 'noapi') { $('#btn-logout').classList.add('hidden'); $('#btn-history').classList.add('hidden'); }
  if (state.storage !== 'blob') $('#btn-history').classList.add('hidden');
  if (r.status === 'ok') {
    try {
      const data = await parseBuffer(r.buf, r.meta.fileName);
      applyData(data, { mode: 'shared', ...r.meta });
      return;
    } catch (e) {
      toast(`No se pudo leer el Excel guardado: ${e.message}`, 'warn');
    }
  }
  showEmpty(r.status);
}

function showEmpty(status) {
  $('#filterbar').classList.add('hidden');
  $('#tabs').classList.add('hidden');
  const note = {
    empty: 'Todavía no hay ningún Excel guardado. El que subas quedará disponible para todos los usuarios.',
    nostorage: 'El almacenamiento compartido no está configurado en Vercel: el Excel se leerá solo en esta sesión.',
    noapi: 'Modo local: el Excel se lee en tu navegador y no se guarda en ningún servidor.',
    error: 'No se pudo consultar el Excel guardado. Puedes subir uno para verlo.',
  }[status] || '';
  main.innerHTML = `<div class="empty"><div class="drop" id="drop">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--brand-teal-strong)"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>
    <h2>Sube el Excel del laboratorio</h2>
    <p>Arrastra aquí "COMPORTAMIENTO DE LA DQO OFICIAL.xlsx" o elígelo desde tu equipo. Se lee en el navegador y todo se recalcula con sus datos.</p>
    <button class="btn primary" id="pick">Elegir archivo…</button>
    ${note ? `<p class="small" style="margin:16px 0 0">${esc(note)}</p>` : ''}
  </div></div>`;
  $('#pick').onclick = () => $('#file-input').click();
  $('#source-label').textContent = 'Sin datos cargados';
}

function applyData(data, source) {
  setData(data, source);
}

subscribe((reason) => {
  if (reason === 'data') { renderSource(); renderFilterBar(); renderTabs(); mountPage(); syncHash(); return; }
  if (reason === 'tab') { renderTabs(); mountPage(); syncHash(); window.scrollTo({ top: 0 }); return; }
  if (reason === 'filters') { renderFilterBar(); page && page.update('filters'); syncHash(); return; }
  if (reason === 'sel') { renderFilterBar(); page && page.update('sel'); syncHash(); if (state.sel.date) openDay(state.sel.date); else closeDrawer(); return; }
  if (reason === 'sel-quiet') { renderFilterBar(); page && page.update('sel-train'); syncHash(); }
});

function syncHash() {
  const h = toHash();
  if (location.hash !== h) history.replaceState(null, '', h);
}
window.addEventListener('hashchange', () => {
  const h = fromHash(location.hash);
  if (h.tab && h.tab !== state.tab && TABS.some((t) => t.id === h.tab)) setTab(h.tab);
});

function renderSource() {
  const s = state.source || {};
  const when = s.uploadedAt ? new Date(s.uploadedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const mode = s.mode === 'shared' ? 'compartido' : s.mode === 'history' ? 'versión anterior' : 'solo en esta sesión';
  $('#source-label').textContent = `${s.fileName || 'Excel'} · ${mode}${when ? ' · subido ' + when : ''}${s.uploadedBy ? ' por ' + s.uploadedBy : ''}`;
  $('#source-label').title = $('#source-label').textContent;
}

// ---------------------------------------------------------------------------
// Barra de filtros
// ---------------------------------------------------------------------------
function renderFilterBar() {
  const bar = $('#filterbar');
  bar.classList.remove('hidden');
  const f = state.filters;
  const m = state.data.meta;
  bar.innerHTML = '';
  const tgl = el('button', { class: 'btn filter-toggle', type: 'button', 'aria-expanded': String(bar.classList.contains('open')) }, 'Filtros');
  tgl.onclick = () => { bar.classList.toggle('open'); tgl.setAttribute('aria-expanded', String(bar.classList.contains('open'))); };
  const dates = el('div', { class: 'filter-group always' });
  dates.innerHTML = `<span class="filter-label">Fechas</span>
    <input type="date" class="date-input" id="f-from" value="${f.from || ''}" min="${m.dmin}" max="${m.dmax}" aria-label="Desde">
    <span class="muted">-</span>
    <input type="date" class="date-input" id="f-to" value="${f.to || ''}" min="${m.dmin}" max="${m.dmax}" aria-label="Hasta">`;
  dates.querySelector('#f-from').onchange = (e) => e.target.value && setFilters({ from: e.target.value, preset: 'custom' });
  dates.querySelector('#f-to').onchange = (e) => e.target.value && setFilters({ to: e.target.value, preset: 'custom' });
  const presets = el('div', { class: 'filter-group presets' });
  for (const p of PRESETS) {
    const b = el('button', { class: 'preset', type: 'button', 'aria-pressed': String(f.preset === p.id) }, esc(p.label));
    b.onclick = () => setFilters({ ...presetRange(p.id), preset: p.id });
    presets.appendChild(b);
  }
  const dims = el('div', { class: 'filter-group' });
  const cat = sel().catalog;
  const instOpts = Object.keys(cat).sort(instSort).map((i) => ({ value: i, label: i }));
  const pointSet = new Map();
  const paramSet = new Map();
  for (const [inst, ps] of Object.entries(cat)) {
    if (f.inst.length && !f.inst.includes(inst)) continue;
    for (const [param, info] of Object.entries(ps)) {
      paramSet.set(param, (paramSet.get(param) || 0) + Object.values(info.points).reduce((a, b) => a + b, 0));
      for (const [pt, n] of Object.entries(info.points)) pointSet.set(pt, (pointSet.get(pt) || 0) + n);
    }
  }
  dims.append(
    multiSelect({ label: 'Instalación', options: instOpts, selected: f.inst, onChange: (v) => setFilters({ inst: v }) }),
    multiSelect({ label: 'Punto', options: orderPoints([...pointSet.keys()]).map((p) => ({ value: p, label: p, count: pointSet.get(p) })), selected: f.point, onChange: (v) => setFilters({ point: v }) }),
    multiSelect({ label: 'Parámetro', options: [...paramSet.keys()].sort((a, b) => a.localeCompare(b, 'es')).map((p) => ({ value: p, label: p, count: paramSet.get(p) })), selected: f.param, onChange: (v) => setFilters({ param: v }) }),
  );
  const chips = el('div', { class: 'chips' });
  const chip = (txt, onX) => { const c = el('span', { class: 'chip' }, `${esc(txt)}<button type="button" aria-label="Quitar">✕</button>`); c.querySelector('button').onclick = onX; chips.appendChild(c); };
  if (state.sel.date) chip(`Día ${fmtDate(state.sel.date)}`, () => clearSelection());
  for (const p of f.point) chip(`Punto: ${p}`, () => setFilters({ point: f.point.filter((x) => x !== p) }));
  for (const p of f.param) chip(`Parámetro: ${p}`, () => setFilters({ param: f.param.filter((x) => x !== p) }));
  for (const p of f.inst) chip(`Instalación: ${p}`, () => setFilters({ inst: f.inst.filter((x) => x !== p) }));
  if (f.point.length || f.param.length || f.inst.length || state.sel.date || f.preset !== 'all') {
    const clr = el('button', { class: 'btn ghost', type: 'button', title: 'Quitar todos los filtros' }, 'Limpiar');
    clr.onclick = () => { state.sel.date = null; setFilters({ ...presetRange('all'), preset: 'all', inst: [], point: [], param: [] }); };
    chips.appendChild(clr);
  }
  bar.append(tgl, dates, presets, dims, chips);
}

// ---------------------------------------------------------------------------
// Pestañas y páginas
// ---------------------------------------------------------------------------
function renderTabs() {
  const nav = $('#tabs');
  nav.classList.remove('hidden');
  const warns = state.data.issues.filter((i) => i.level === 'warn' && (i.type === 'missing' || i.type === 'header')).length;
  nav.innerHTML = TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">${t.label}${t.id === 'calidad' && warns ? `<span class="badge" title="Hojas que faltan o con cabecera cambiada">${warns}</span>` : ''}</button>`).join('');
  nav.querySelectorAll('.tab').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  nav.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function mountPage() {
  disposeAll();
  const t = TABS.find((x) => x.id === state.tab) || TABS[0];
  main.innerHTML = '';
  const warn = pageWarnings();
  if (warn) main.insertAdjacentHTML('beforeend', warn);
  try {
    page = t.create();
    main.appendChild(page.el);
  } catch (e) {
    console.error(e);
    page = null;
    main.insertAdjacentHTML('beforeend', `<div class="notice"><b>No se pudo dibujar esta página.</b> ${esc(e.message)}. El resto de páginas siguen disponibles.</div>`);
  }
}

function pageWarnings() {
  const d = state.data;
  const miss = Object.values(d.sheets).filter((s) => s.status === 'missing').map((s) => s.name);
  const hdr = Object.values(d.sheets).filter((s) => s.status === 'header-changed').map((s) => s.name);
  const src = state.source || {};
  let h = '';
  if (miss.length || hdr.length) {
    h += `<div class="notice"><span>⚠</span><div>${miss.length ? `<b>Faltan hojas en el Excel:</b> ${esc(miss.join(', '))}. ` : ''}${hdr.length ? `<b>Cabecera distinta a la esperada:</b> ${esc(hdr.join(', '))} (se lee por nombre de columna). ` : ''}El resto del dashboard funciona con normalidad. <a href="#calidad" data-go-cal>Ver detalle</a></div></div>`;
  }
  if (src.mode === 'session' && state.storage === 'blob') h += '<div class="notice info">Estás viendo un Excel que solo está en tu sesión: no se ha publicado para el resto de usuarios.</div>';
  if (src.mode === 'history') h += `<div class="notice info">Estás viendo una versión anterior (${esc(src.fileName || '')}). <a href="#" data-latest>Volver a la última</a></div>`;
  setTimeout(() => {
    document.querySelector('[data-go-cal]')?.addEventListener('click', (e) => { e.preventDefault(); setTab('calidad'); });
    document.querySelector('[data-latest]')?.addEventListener('click', async (e) => { e.preventDefault(); const r = await fetchShared(); if (r.status === 'ok') applyData(await parseBuffer(r.buf, r.meta.fileName), { mode: 'shared', ...r.meta }); });
  }, 0);
  return h;
}

// ---------------------------------------------------------------------------
// Detalle del día (desglose por fecha)
// ---------------------------------------------------------------------------
const drawer = $('#drawer');
function openDay(d) {
  const recs = state.data.records.filter((r) => r.d === d && (r.v != null || r.raw));
  const obs = state.data.obs.filter((o) => o.d === d);
  const reac = state.data.tables.reactivos.filter((r) => r.d === d);
  const groups = {};
  for (const r of recs) (groups[r.inst] = groups[r.inst] || []).push(r);
  let h = `<div class="modal-head"><h3>${fmtDateLong(d)}</h3><button class="btn ghost" style="margin-left:auto" data-close>Cerrar</button></div><div class="modal-body">`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"><button class="btn" data-prev>‹ Día anterior</button><button class="btn" data-next>Día siguiente ›</button><button class="btn" data-go="proceso">Ver en Proceso DQO</button><button class="btn ghost" data-clear>Quitar selección</button></div>`;
  if (obs.length) h += `<div class="notice info" style="display:block">${obs.map((o) => `<div style="margin:2px 0">✎ <b>${esc(o.kind)}</b>: ${esc(o.text)}</div>`).join('')}</div>`;
  if (!recs.length) h += '<p class="muted">No hay datos en esta fecha.</p>';
  for (const inst of Object.keys(groups).sort(instSort)) {
    const ord = orderPoints([...new Set(groups[inst].map((r) => r.point))]);
    const rows = groups[inst].sort((a, b) => a.param.localeCompare(b.param, 'es') || ord.indexOf(a.point) - ord.indexOf(b.point));
    h += `<h4 style="margin:14px 0 6px">${esc(inst)}</h4>` + tableHTML([
      { key: 'param', label: 'Parámetro' }, { key: 'point', label: 'Punto' },
      { key: 'v', label: 'Valor', num: true, fmt: (r) => (r.v != null ? fmtNum(r.v, r.param) : r.raw || 'vacía') },
      { key: 'unit', label: 'Unidad' }, { key: 'cell', label: 'Celda', fmt: (r) => `${r.sheet}!${r.cell}${r.time ? ' · ' + r.time : ''}` },
      { key: 'note', label: 'Nota de celda' },
    ], rows);
  }
  if (reac.length) h += `<h4 style="margin:14px 0 6px">Verificación de reactivos</h4>${reac.map((r) => `<p class="small">${esc(r.respuesta)} · ${esc(r.obs)}</p>`).join('')}`;
  h += '</div>';
  drawer.innerHTML = h;
  drawer.classList.add('open');
  const allDates = [...new Set(state.data.records.filter((r) => r.v != null).map((r) => r.d))].sort();
  const i = allDates.indexOf(d);
  drawer.querySelector('[data-close]').onclick = closeDrawer;
  drawer.querySelector('[data-clear]').onclick = () => { closeDrawer(); clearSelection(); };
  drawer.querySelector('[data-prev]').onclick = () => { if (i > 0) { state.sel.date = null; selectDate(allDates[i - 1]); } };
  drawer.querySelector('[data-next]').onclick = () => { if (i < allDates.length - 1) { state.sel.date = null; selectDate(allDates[i + 1]); } };
  drawer.querySelector('[data-go]').onclick = () => { closeDrawer(); setTab('proceso'); };
}
function closeDrawer() { drawer.classList.remove('open'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

// ---------------------------------------------------------------------------
// Subida de Excel
// ---------------------------------------------------------------------------
$('#btn-upload').onclick = () => $('#file-input').click();
$('#file-input').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handleFile(f); };
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

async function handleFile(file) {
  if (!/\.xls[xm]?$/i.test(file.name)) { toast('El archivo debe ser un Excel (.xlsx).', 'warn'); return; }
  const wait = modal({ title: 'Leyendo el Excel…', body: '<div class="spinner"></div>', foot: null, width: 360 });
  let data;
  try {
    const buf = await file.arrayBuffer();
    data = await parseBuffer(buf, file.name);
  } catch (e) {
    wait.close();
    modal({ title: 'No se pudo leer el archivo', body: `<p>${esc(e.message)}</p><p class="muted">Comprueba que es el libro de laboratorio en formato .xlsx.</p>`, foot: '<button class="btn primary" data-close>Cerrar</button>', width: 520 });
    return;
  }
  wait.close();
  showSummary(file, data);
}

function showSummary(file, data) {
  const sheets = Object.values(data.sheets);
  const disc = {};
  for (const s of sheets) for (const [k, v] of Object.entries(s.discarded)) disc[k] = (disc[k] || 0) + v;
  const rows = sheets.reduce((a, s) => a + s.rows, 0);
  const warns = data.issues.filter((i) => i.level === 'warn');
  const read = sheets.filter((s) => s.status === 'ok' || s.status === 'header-changed').length;
  const body = `
    <div class="summary-grid">
      <div class="s"><b>${read} / ${sheets.filter((s) => s.status !== 'unknown').length}</b><span>hojas leídas</span></div>
      <div class="s"><b>${fmtNum(rows)}</b><span>filas con fecha</span></div>
      <div class="s"><b>${fmtNum(data.meta.values)}</b><span>valores numéricos</span></div>
      <div class="s"><b>${fmtDate(data.meta.dmin)} - ${fmtDate(data.meta.dmax)}</b><span>rango de fechas</span></div>
      <div class="s"><b>${fmtDate(data.meta.edariMin)} - ${fmtDate(data.meta.edariMax)}</b><span>rango EDARI</span></div>
    </div>
    <h4 style="margin:4px 0 6px">Celdas sin valor numérico y motivo</h4>
    <p class="small">${Object.entries(disc).map(([k, v]) => `${esc(FLAG_LABEL[k] || k)}: <b>${v}</b>`).join(' · ') || 'Ninguna'}</p>
    ${warns.length ? `<h4 style="margin:12px 0 6px">Avisos (${warns.length})</h4><ul class="small" style="margin:0;padding-left:18px">${warns.slice(0, 12).map((w) => `<li><b>${esc(w.sheet)}</b>${w.cell ? ' ' + esc(w.cell) : ''}: ${esc(w.msg)}</li>`).join('')}${warns.length > 12 ? `<li>… y ${warns.length - 12} más en Calidad de datos</li>` : ''}</ul>` : ''}
    <h4 style="margin:12px 0 6px">Hojas</h4>
    ${tableHTML([
      { key: 'name', label: 'Hoja' }, { key: 'status', label: 'Estado', fmt: (s) => ({ ok: 'Leída', missing: 'Falta', 'header-changed': 'Cabecera cambiada', omitted: 'Omitida', unknown: 'No reconocida', error: 'Error' })[s.status] },
      { key: 'rows', label: 'Filas', num: true }, { key: 'values', label: 'Valores', num: true },
      { key: 'r', label: 'Rango', fmt: (s) => (s.dmin ? `${fmtDate(s.dmin, true)}-${fmtDate(s.dmax, true)}` : 'n/d') },
    ], sheets)}`;
  const foot = document.createElement('div');
  foot.style.display = 'contents';
  const canPublish = state.storage === 'blob';
  foot.innerHTML = `${canPublish ? '<span class="muted small" style="margin-right:auto">Al publicar, todos los usuarios verán este Excel.</span>' : '<span class="muted small" style="margin-right:auto">Sin almacenamiento compartido: se verá solo en esta sesión.</span>'}
    <button class="btn" data-cancel>Cancelar</button>
    <button class="btn ${canPublish ? '' : 'primary'}" data-view>${canPublish ? 'Ver sin publicar' : 'Ver dashboard'}</button>
    ${canPublish ? '<button class="btn primary" data-pub>Publicar para todos</button>' : ''}`;
  const m = modal({ title: `Resumen de carga · ${file.name}`, body, foot, width: 860 });
  foot.querySelector('[data-cancel]').onclick = m.close;
  foot.querySelector('[data-view]').onclick = () => { m.close(); applyData(data, { mode: 'session', fileName: file.name }); };
  const pub = foot.querySelector('[data-pub]');
  if (pub) pub.onclick = async () => {
    pub.disabled = true;
    pub.textContent = 'Publicando…';
    try {
      const res = await uploadShared(file, state.blobAccess);
      m.close();
      applyData(data, { mode: 'shared', fileName: file.name, uploadedAt: new Date().toISOString(), pathname: res.pathname });
      toast('Excel publicado: todos los usuarios verán estos datos.');
    } catch (e) {
      pub.disabled = false;
      pub.textContent = 'Publicar para todos';
      toast(`No se pudo publicar: ${e.message}`, 'warn');
    }
  };
}

// ---------------------------------------------------------------------------
// Marcadores (vistas guardadas), historial, exportar, cerrar sesión
// ---------------------------------------------------------------------------
const BM_KEY = 'revizo-lab-bookmarks';
const readBM = () => { try { return JSON.parse(localStorage.getItem(BM_KEY) || '[]'); } catch (e) { return []; } };
const writeBM = (l) => { try { localStorage.setItem(BM_KEY, JSON.stringify(l)); return true; } catch (e) { return false; } };

$('#btn-bookmarks').onclick = () => {
  if (!state.data) { toast('Carga primero un Excel.'); return; }
  const draw = () => {
    const list = readBM();
    return `<div style="display:flex;gap:8px;margin-bottom:14px"><input id="bm-name" class="date-input" style="flex:1" placeholder="Nombre de la vista (p. ej. Reunión cliente · septiembre)" maxlength="80"><button class="btn primary" id="bm-save">Guardar vista actual</button></div>
      ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Vista</th><th>Página</th><th>Guardada</th><th></th></tr></thead><tbody>${list.map((b, i) => `<tr><td><a href="#" data-apply="${i}">${esc(b.name)}</a></td><td>${esc(TABS.find((t) => t.id === b.tab)?.label || b.tab)}</td><td class="muted">${new Date(b.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="n"><button class="btn ghost" data-del="${i}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay vistas guardadas. Una vista recuerda la página, las fechas, los filtros y el día seleccionado.</p>'}
      <p class="muted small" style="margin-top:12px">Las vistas se guardan en este navegador. También puedes copiar la dirección de la página: el enlace reproduce la vista.</p>`;
  };
  const m = modal({ title: 'Vistas guardadas', body: draw(), foot: '<button class="btn" data-copy>Copiar enlace de la vista actual</button><button class="btn primary" data-close>Cerrar</button>', width: 720 });
  const wire = () => {
    m.body.querySelector('#bm-save').onclick = () => {
      const name = m.body.querySelector('#bm-name').value.trim() || `Vista ${new Date().toLocaleString('es-ES')}`;
      const l = readBM();
      l.unshift({ name, tab: state.tab, filters: JSON.parse(JSON.stringify(state.filters)), date: state.sel.date, at: Date.now() });
      if (!writeBM(l)) toast('Este navegador no permite guardar vistas.', 'warn');
      m.body.innerHTML = draw(); wire();
    };
    m.body.querySelectorAll('[data-apply]').forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const b = readBM()[+a.dataset.apply];
      m.close();
      state.sel.date = b.date || null;
      state.tab = b.tab;
      const f = { ...b.filters };
      if (f.preset && f.preset !== 'custom') Object.assign(f, presetRange(f.preset));
      setFilters(f, 'data');
    }));
    m.body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { const l = readBM(); l.splice(+b.dataset.del, 1); writeBM(l); m.body.innerHTML = draw(); wire(); }));
  };
  wire();
  m.foot.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast('Enlace copiado.'); } catch (e) { toast(location.href); } };
};

$('#btn-history').onclick = async () => {
  const list = await fetchHistory();
  if (!list) { toast('No se pudo consultar el historial.', 'warn'); return; }
  const m = modal({
    title: 'Versiones del Excel',
    body: list.length ? tableHTML([
      { key: 'fileName', label: 'Archivo' }, { key: 'uploadedAt', label: 'Subido', fmt: (r) => new Date(r.uploadedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) },
      { key: 'size', label: 'Tamaño', num: true, fmt: (r) => `${fmtNum(r.size / 1024, '', 0)} KB` },
      { key: 'a', label: '', html: true, fmt: (r, i) => `<button class="btn ghost" data-p="${esc(r.pathname)}">Ver</button>` },
    ], list) : '<p class="muted">Todavía no hay versiones guardadas.</p>',
    foot: '<button class="btn primary" data-close>Cerrar</button>', width: 760,
  });
  m.body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const r = await fetchShared(b.dataset.p);
    if (r.status !== 'ok') { toast('No se pudo abrir esa versión.', 'warn'); b.disabled = false; return; }
    const data = await parseBuffer(r.buf, r.meta.fileName);
    m.close();
    const latest = list[0] && list[0].pathname === b.dataset.p;
    applyData(data, { mode: latest ? 'shared' : 'history', ...r.meta });
  }));
};

$('#btn-export').onclick = () => {
  if (!state.data) { toast('Carga primero un Excel.'); return; }
  const rows = sel().filtered;
  const f = state.filters;
  downloadCSV(`laboratorio-depuradora_${f.from}_${f.to}`, RECORD_COLUMNS.map((c) => ({ ...c, csv: c.key === 'v' ? (r) => r.v : undefined })), rows);
};
$('#btn-logout').onclick = () => logout();

boot();
