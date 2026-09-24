// Componentes de interfaz sin dependencias: modal, tabla, aviso, cajón y selector múltiple.
import { esc } from './format.js';

export function toast(msg, kind = '') {
  const host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3800);
  setTimeout(() => t.remove(), 4200);
}

/** Modal genérico. Devuelve { el, body, close }. */
export function modal({ title, body = '', foot = '', width }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${width ? `style="width:min(${width}px,100%)"` : ''}>
    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost" style="margin-left:auto" data-close aria-label="Cerrar">Cerrar</button></div>
    <div class="modal-body"></div>
    ${foot !== null ? `<div class="modal-foot"></div>` : ''}</div>`;
  const b = ov.querySelector('.modal-body');
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  const f = ov.querySelector('.modal-foot');
  if (f) { if (typeof foot === 'string') f.innerHTML = foot; else if (foot) f.appendChild(foot); if (!foot) f.remove(); }
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  return { el: ov, body: b, foot: ov.querySelector('.modal-foot'), close };
}

/** HTML de tabla. columns: [{ key, label, num, fmt(row) }] */
export function tableHTML(columns, rows, { limit = 5000, rowAttr } = {}) {
  const head = columns.map((c) => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.slice(0, limit).map((r, i) => {
    const attr = rowAttr ? rowAttr(r, i) : '';
    return `<tr ${attr}>${columns.map((c) => {
      const v = c.fmt ? c.fmt(r) : r[c.key];
      return `<td class="${c.num ? 'n' : ''}">${c.html ? v : esc(v == null ? '' : v)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  const more = rows.length > limit ? `<p class="muted small">Se muestran ${limit} de ${rows.length} filas. Exporta a CSV para verlas todas.</p>` : '';
  return `<div class="table-wrap"><table class="t"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="muted">Sin datos con los filtros actuales.</td></tr>`}</tbody></table></div>${more}`;
}

let csvHook = null;
export function setCsvHook(fn) { csvHook = fn; }

export function openTable(title, columns, rows) {
  const foot = document.createElement('div');
  foot.innerHTML = `<span class="muted small" style="margin-right:auto">${rows.length} filas</span><button class="btn" data-csv>Exportar CSV</button><button class="btn primary" data-close>Cerrar</button>`;
  const m = modal({ title: `Datos · ${title}`, body: tableHTML(columns, rows), foot, width: 1100 });
  foot.querySelector('[data-csv]').onclick = () => csvHook && csvHook(title, columns, rows);
  return m;
}

/** Selector múltiple con búsqueda. options: [{ value, label, group, count }] */
export function multiSelect({ label, options, selected, onChange, placeholder = 'Todos' }) {
  const wrap = document.createElement('div');
  wrap.className = 'ms';
  const sel = new Set(selected);
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  const paint = () => {
    btn.innerHTML = `<span>${esc(label)}: ${sel.size ? '' : esc(placeholder)}</span>${sel.size ? `<span class="count">${sel.size}</span>` : ''}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
  };
  paint();
  wrap.appendChild(btn);
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside); } };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  btn.onclick = () => {
    if (pop) return close();
    pop = document.createElement('div');
    pop.className = 'ms-pop';
    pop.setAttribute('role', 'listbox');
    pop.innerHTML = `<div class="ms-head"><input type="search" placeholder="Buscar…" aria-label="Buscar"><button class="btn" data-clear type="button">Todos</button></div><div class="ms-list"></div>`;
    const list = pop.querySelector('.ms-list');
    const draw = (q = '') => {
      let g = null, h = '';
      for (const o of options) {
        if (q && !o.label.toLowerCase().includes(q.toLowerCase())) continue;
        if (o.group && o.group !== g) { g = o.group; h += `<div class="ms-group">${esc(g)}</div>`; }
        h += `<label class="ms-opt"><input type="checkbox" value="${esc(o.value)}" ${sel.has(o.value) ? 'checked' : ''}> <span>${esc(o.label)}</span>${o.count != null ? `<small>${o.count}</small>` : ''}</label>`;
      }
      list.innerHTML = h || '<p class="muted small" style="padding:8px">Sin coincidencias</p>';
    };
    draw();
    pop.querySelector('input[type=search]').oninput = (e) => draw(e.target.value);
    pop.querySelector('[data-clear]').onclick = () => { sel.clear(); draw(); paint(); onChange([...sel]); };
    list.addEventListener('change', (e) => {
      const v = e.target.value;
      if (e.target.checked) sel.add(v); else sel.delete(v);
      paint();
      onChange([...sel]);
    });
    wrap.appendChild(pop);
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    pop.querySelector('input[type=search]').focus();
  };
  return wrap;
}

/** Control segmentado. items: [{ value, label }] */
export function segmented(items, value, onChange) {
  const el = document.createElement('div');
  el.className = 'seg';
  el.setAttribute('role', 'group');
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.label;
    b.setAttribute('aria-pressed', String(it.value === value));
    b.onclick = () => {
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onChange(it.value);
    };
    el.appendChild(b);
  }
  return el;
}

export function selectEl(options, value, onChange, aria) {
  const s = document.createElement('select');
  s.className = 'sel';
  if (aria) s.setAttribute('aria-label', aria);
  let g = null, grp = null;
  for (const o of options) {
    if (o.group && o.group !== g) { g = o.group; grp = document.createElement('optgroup'); grp.label = g; s.appendChild(grp); }
    const op = document.createElement('option');
    op.value = o.value;
    op.textContent = o.label;
    if (o.value === value) op.selected = true;
    (o.group ? grp : s).appendChild(op);
  }
  s.onchange = () => onChange(s.value);
  return s;
}

export function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}
