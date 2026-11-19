// Portada "Planta hoy": estado de las cuatro áreas, alertas activas y últimas observaciones.
import { state, series, setTab } from '../store.js';
import { card } from '../ui/charts.js';
import { fmtNum, fmtDate, fmtDateLong, esc } from '../ui/format.js';
import { statusDot, pill, STATUS_TEXT, STATUS_COLOR, ageText, obsList, wireDays } from '../ui/kit.js';
import { limitFor, evaluate, limitText, SRC_LABEL, worst } from '../limits.js';
import { S, sstLM } from './common.js';
import { AREAS, areaChecks, areaLast } from './areas.js';
import { NOTES, HOWTO, SEMAFORO } from '../notes.js';

let howtoOpen = false;

const sp = (inst, param, point, unit) => ({ inst, param, point, unit });
const METRICS = {
  edari: [
    { label: 'Efectividad', ...sp('EDARI', 'Efectividad', S.efect.point, '%') },
    { label: 'DQO permeado', ...sp('EDARI', 'DQO', 'Permeado', 'mg/L') },
    { label: 'Caudal permeado', ...sp('EDARI', 'Caudal', 'Permeado', 'm³/día') },
    { label: 'SST licor mezcla', ...sp('EDARI', 'SST', 'Licor mezcla', 'mg/L'), data: () => sstLM() },
  ],
  calderas: [
    { label: 'Cond. Caldera 1', ...sp('Calderas', 'Conductividad', 'Caldera 1', 'µS/cm') },
    { label: 'Cond. Caldera 2', ...sp('Calderas', 'Conductividad', 'Caldera 2', 'µS/cm') },
    { label: 'Dureza descalcificador', ...sp('Calderas', 'Dureza (titulación)', 'Descalcificador', '') },
    { label: 'pH glicol', ...sp('Glicol', 'pH', 'Glicol', '') },
  ],
  fructalys: [
    { label: 'DQO', ...sp('Fructalys', 'DQO', 'Fructalys', 'mg/L') },
    { label: 'pH', ...sp('Fructalys', 'pH', 'Fructalys', '') },
    { label: 'Conductividad', ...sp('Fructalys', 'Conductividad', 'Fructalys', 'µS/cm') },
    { label: 'Temperatura', ...sp('Fructalys', 'Temperatura', 'Fructalys', '°C') },
  ],
  potable: [
    { label: 'Cloro libre salida', ...sp('Agua potable', 'Cloro libre', 'Salida "P"', 'mg/L') },
    { label: 'Cloro libre tanque', ...sp('Agua potable', 'Cloro libre', 'Tanque "P"', 'mg/L') },
    { label: 'Cloro total salida', ...sp('Agua potable', 'Cloro total', 'Salida "P"', 'mg/L') },
    { label: 'Conductividad salida', ...sp('Agua potable', 'Conductividad', 'Salida "P"', 'µS/cm') },
  ],
};

/** Minigráfico SVG de los últimos 20 valores. */
function spark(s, color) {
  const xs = s.slice(-20);
  if (xs.length < 2) return '';
  const vs = xs.map((x) => x.v), lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const pts = xs.map((x, i) => `${((i / (xs.length - 1)) * 100).toFixed(1)},${(22 - ((x.v - lo) / r) * 20).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="hoy-head"></div><div class="areas4"></div><div class="grid"></div>';
  const headEl = root.querySelector('.hoy-head');
  const areasEl = root.querySelector('.areas4');
  const grid = root.querySelector('.grid');
  const cAl = card({ title: 'Alertas', sub: '', cls: 'col-7', chart: false, info: NOTES.alertas });
  const cObs = card({ title: 'Últimas observaciones', sub: 'Todas las áreas', cls: 'col-5', chart: false, info: NOTES.obsTodas });
  grid.append(cAl.el, cObs.el);

  function update() {
    const all = AREAS.map((a) => ({ a, checks: areaChecks(a), last: areaLast(a) }));
    const checks = all.flatMap((x) => x.checks);
    const n = (s) => checks.filter((c) => c.st === s).length;
    const lastAll = all.map((x) => x.last).filter(Boolean).sort().pop();
    headEl.innerHTML = `
      <div><h2>Planta hoy</h2><p>Estado de cada área con su último registro${lastAll ? ` (datos hasta el ${fmtDateLong(lastAll)})` : ''}. El semáforo usa los límites del Excel y, donde el Excel no los da, límites de referencia.</p>
        <details class="howto" ${howtoOpen ? 'open' : ''}>
          <summary>Cómo leer esta página</summary>
          <div class="howto-body">
            <p>${HOWTO.hoy}</p>
            <p><b>Semáforo.</b> ${SEMAFORO}</p>
            <p><b>Más detalle.</b> Cada tarjeta tiene un botón <span class="i-ico">ⓘ ¿Qué es?</span> con su fuente exacta (hoja y columna del Excel) y cómo interpretarlo. La guía completa, con el glosario, está en el botón <b>Ayuda</b> de arriba.</p>
          </div>
        </details></div>
      <div class="hoy-counts">
        <span class="count bad"><b>${n('bad')}</b>fuera de límite</span>
        <span class="count warn"><b>${n('warn')}</b>cerca del límite</span>
        <span class="count good"><b>${n('good')}</b>en rango</span>
      </div>`;

    headEl.querySelector('details').addEventListener('toggle', (e) => { howtoOpen = e.target.open; });

    areasEl.innerHTML = all.map(({ a, checks: ch, last }) => {
      const st = worst(ch.map((c) => c.st));
      const top = ch.find((c) => c.st === 'bad' || c.st === 'warn');
      const rows = METRICS[a.id].map((m) => {
        const s = m.data ? m.data() : series(m);
        const x = s[s.length - 1];
        const lim = limitFor(state.data, m.inst, m.point, m.param);
        const mst = x ? evaluate(lim, x.v) : 'none';
        const color = STATUS_COLOR[mst] || 'var(--ink-3)';
        const extra = m.param === 'DQO' && m.inst === 'Fructalys' ? gtCount() : '';
        return `<div class="m-row" title="${esc(lim ? `${SRC_LABEL[lim.src]} ${limitText(lim, m.unit)}` : 'Sin límite')}">
          <span class="m-lbl">${lim ? statusDot(mst) : '<i class="dot none"></i>'}${esc(m.label)}</span>
          ${spark(s, lim ? color : 'currentColor')}
          <span class="m-val"><b>${x ? fmtNum(x.v, m.param) : '–'}</b> <small>${esc(m.unit)}</small>${extra}</span>
          <span class="m-date">${x ? fmtDate(x.d, true) : ''}</span>
        </div>`;
      }).join('');
      return `<button type="button" class="area-card st-${st}" data-area="${a.id}">
        <header><span class="area-name">${statusDot(st)}${esc(a.label)}</span><span class="area-age">${last ? `${fmtDate(last)} · ${esc(ageText(last))}` : 'sin datos'}</span></header>
        <div class="m-rows">${rows}</div>
        <footer>${top ? `<span class="t-${top.st}">${esc(top.point)} · ${esc(top.param)}: ${fmtNum(top.v, top.param)}${top.unit ? ' ' + esc(top.unit) : ''}</span>` : ch.length ? '<span class="t-good">Todos los controles en rango</span>' : '<span class="muted">Sin controles con límite</span>'}<span class="go">Ver área →</span></footer>
      </button>`;
    }).join('');
    areasEl.querySelectorAll('[data-area]').forEach((b) => (b.onclick = () => setTab(b.dataset.area)));

    const al = checks.filter((c) => c.st === 'bad' || c.st === 'warn');
    cAl.setTitle('Alertas', al.length ? `${al.length} controles fuera o cerca del límite en el último registro de cada serie` : 'Ningún control fuera de límite');
    cAl.body.innerHTML = al.length ? `<div class="table-wrap"><table class="t alerts"><thead><tr><th>Estado</th><th>Área</th><th>Punto</th><th>Parámetro</th><th class="n">Valor</th><th>Límite</th><th>Fecha</th></tr></thead><tbody>
      ${al.map((c) => `<tr class="clickable" data-area="${c.area.id}"><td>${pill(c.st, c.st === 'bad' ? 'Fuera' : 'Cerca')}</td><td>${esc(c.area.label)}</td><td>${esc(c.point)}</td><td>${esc(c.param)}</td><td class="n"><b>${fmtNum(c.v, c.param)}</b> ${esc(c.unit || '')}</td><td><span class="src ${c.lim.src}">${esc(SRC_LABEL[c.lim.src])}</span> ${esc(limitText(c.lim))}</td><td>${fmtDate(c.d)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Todos los controles con límite están en rango.</p>';
    cAl.body.querySelectorAll('tr[data-area]').forEach((tr) => (tr.onclick = () => setTab(tr.dataset.area)));
    cAl.setRows([{ key: 'st', label: 'Estado', fmt: (r) => STATUS_TEXT[r.st] }, { key: 'a', label: 'Área', fmt: (r) => r.area.label }, { key: 'point', label: 'Punto' }, { key: 'param', label: 'Parámetro' }, { key: 'v', label: 'Valor', num: true, fmt: (r) => fmtNum(r.v, r.param) }, { key: 'unit', label: 'Unidad' }, { key: 'l', label: 'Límite', fmt: (r) => `${SRC_LABEL[r.lim.src]} ${limitText(r.lim)}` }, { key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }], al);

    const f = state.filters;
    const obs = state.data.obs.filter((o) => (!f.from || o.d >= f.from) && (!f.to || o.d <= f.to)).slice().sort((a, b) => (a.d < b.d ? 1 : -1));
    cObs.body.innerHTML = `<div class="timeline-host">${obsList(obs.slice(0, 12), { tags: true })}</div>`;
    wireDays(cObs.body);
    cObs.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'kind', label: 'Origen' }, { key: 'text', label: 'Observación' }], obs);
  }

  function gtCount() {
    const f = state.filters;
    const recent = state.data.records.filter((r) => r.inst === 'Fructalys' && r.param === 'DQO' && r.flag === 'gt' && (!f.from || r.d >= f.from) && (!f.to || r.d <= f.to));
    return recent.length ? ` <small class="t-warn" title="Análisis por encima del rango del método">+${recent.length} &gt;60.000</small>` : '';
  }

  update();
  return { el: root, update };
}
