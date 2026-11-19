// Cabecera de área: nombre, estado general, último dato y recuento de controles.
import { fmtDateLong, esc } from '../ui/format.js';
import { pill, ageText, STATUS_TEXT } from '../ui/kit.js';
import { areaChecks, areaLast } from './areas.js';
import { worst } from '../limits.js';
import { HOWTO, SEMAFORO } from '../notes.js';

const howtoOpen = {};

export function areaHead(area, desc, kpiNote = '') {
  const checks = areaChecks(area);
  const st = worst(checks.map((c) => c.st));
  const last = areaLast(area);
  const n = (s) => checks.filter((c) => c.st === s).length;
  const el = document.createElement('div');
  el.className = 'area-head';
  el.innerHTML = `
    <div class="area-title">
      <h2>${esc(area.label)}</h2>
      <p>${esc(desc)}</p>
    </div>
    <div class="area-meta">
      ${checks.length ? pill(st, st === 'good' ? 'Todo en rango' : STATUS_TEXT[st]) : ''}
      <span class="meta-item"><small>Último dato</small><b>${last ? fmtDateLong(last) : 'n/d'}</b><em>${esc(ageText(last))}</em></span>
      ${checks.length ? `<span class="meta-item"><small>Controles con límite</small><b>${checks.length}</b><em>${n('bad') ? `<span class="t-bad">${n('bad')} fuera</span> · ` : ''}${n('warn') ? `<span class="t-warn">${n('warn')} cerca</span> · ` : ''}${n('good')} en rango</em></span>` : ''}
      <span class="meta-item"><small>Fuente</small><b>${esc(area.sheet)}</b></span>
    </div>
    <details class="howto" ${howtoOpen[area.id] ? 'open' : ''}>
      <summary>Cómo leer esta página</summary>
      <div class="howto-body">
        <p>${HOWTO[area.id] || ''}</p>
        ${kpiNote ? `<p><b>Tarjetas de arriba.</b> ${kpiNote}</p>` : ''}
        <p><b>Semáforo.</b> ${SEMAFORO}</p>
        <p><b>Más detalle.</b> Cada gráfico tiene un botón <span class="i-ico">ⓘ</span> con su fuente exacta (hoja y columna del Excel) y cómo interpretarlo. Al hacer clic en cualquier punto de un gráfico se abre el detalle de ese día, con la celda de origen de cada valor. La guía completa está en <b>Más → Guía y fuentes</b>.</p>
      </div>
    </details>`;
  el.querySelector('details').addEventListener('toggle', (e) => { howtoOpen[area.id] = e.target.open; });
  return el;
}
