// Panel de accesos de los administradores: solicitudes pendientes, usuarios con acceso (lector / editor /
// administrador), restablecer contraseñas, accesos retirados o rechazados y cambio de la contraseña propia.
import { modal, toast } from './ui/components.js';
import { esc } from './ui/format.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '–');

async function api(method, body) {
  const r = await fetch('/api/admin', { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/** Muestra el enlace de un solo uso para que el administrador lo copie o lo envíe por WhatsApp. */
function showResetLink(email, link) {
  const text = `Hola. Para crear tu nueva contraseña del panel del laboratorio entra en este enlace (sirve una vez y caduca en 48 horas): ${link}`;
  const m = modal({
    title: 'Enlace para restablecer la contraseña',
    body: `<p>Envía este enlace a <b>${esc(email)}</b>. Sirve <b>una sola vez</b> y caduca en <b>48 horas</b>. Al usarlo, su contraseña anterior deja de valer.</p>
      <div class="pw-row"><input class="date-input" id="rl-link" readonly value="${esc(link)}"><button class="btn primary" id="rl-copy">Copiar enlace</button></div>
      <p style="margin-top:12px"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Enviar por WhatsApp</a>
      <a class="btn" href="mailto:${esc(email)}?subject=${encodeURIComponent('Restablecer tu contraseña del panel del laboratorio')}&body=${encodeURIComponent(text)}">Enviar por correo</a></p>
      <p class="muted small">Por seguridad el enlace no se guarda: si lo pierdes, genera otro (el anterior deja de valer).</p>`,
    foot: '<button class="btn primary" data-close>Hecho</button>', width: 640,
  });
  m.body.querySelector('#rl-copy').onclick = async () => {
    const i = m.body.querySelector('#rl-link');
    try { await navigator.clipboard.writeText(link); toast('Enlace copiado.'); } catch (e) { i.select(); document.execCommand('copy'); toast('Enlace copiado.'); }
  };
}

/** Restablecer la contraseña de un usuario: enlace para que la cree él, o contraseña provisional. */
function openResetChooser(email, name, after) {
  const gen = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint32Array(10)); return [...r].map((x) => c[x % c.length]).join(''); };
  const m = modal({
    title: `Restablecer la contraseña de ${name || email}`,
    body: `<p class="muted small" style="margin-top:0">${esc(email)}</p>
      <div class="reset-opt"><h4>Opción 1 · Enlace para que la cree él <span class="pill good">recomendado</span></h4>
        <p class="small">Se genera un enlace de un solo uso (válido 48 horas) que le envías por WhatsApp o correo. Nadie más conoce la contraseña nueva.</p>
        <button class="btn primary" id="rc-link">Generar enlace</button></div>
      <div class="reset-opt"><h4>Opción 2 · Ponerle una contraseña provisional</h4>
        <p class="small">La pones tú (o usas la generada) y se la dices. Su contraseña anterior deja de valer al momento.</p>
        <div class="pw-row"><input class="date-input" id="rc-pw" value="${gen()}" autocomplete="off" aria-label="Contraseña provisional"><button class="btn" id="rc-gen" title="Generar otra">⟳</button><button class="btn" id="rc-set">Guardar contraseña</button></div></div>`,
    foot: '<button class="btn" data-close>Cancelar</button>', width: 640,
  });
  m.body.querySelector('#rc-gen').onclick = () => { m.body.querySelector('#rc-pw').value = gen(); };
  m.body.querySelector('#rc-link').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api('POST', { action: 'resetlink', email }); m.close(); showResetLink(email, r.link); after(); } catch (ex) { toast(ex.message, 'warn'); e.target.disabled = false; }
  };
  m.body.querySelector('#rc-set').onclick = async (e) => {
    const pw = m.body.querySelector('#rc-pw').value.trim();
    e.target.disabled = true;
    try {
      await api('POST', { action: 'setpassword', email, password: pw });
      m.close(); after();
      const text = `Hola. Tu contraseña provisional del panel del laboratorio es: ${pw}`;
      const done = modal({
        title: 'Contraseña provisional guardada',
        body: `<p><b>${esc(email)}</b> ya puede entrar con esta contraseña:</p>
          <div class="pw-row"><input class="date-input" id="pp" readonly value="${esc(pw)}"><button class="btn primary" id="pp-copy">Copiar</button></div>
          <p style="margin-top:12px"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Enviar por WhatsApp</a></p>
          <p class="muted small">Por seguridad no se guarda en claro: si la pierdes, pon otra. Si quiere cambiarla, puede usar «¿Has olvidado tu contraseña?» en la entrada.</p>`,
        foot: '<button class="btn primary" data-close>Hecho</button>', width: 560,
      });
      done.body.querySelector('#pp-copy').onclick = async () => { try { await navigator.clipboard.writeText(pw); toast('Copiada.'); } catch (ex) { done.body.querySelector('#pp').select(); document.execCommand('copy'); toast('Copiada.'); } };
    } catch (ex) { toast(ex.message, 'warn'); e.target.disabled = false; }
  };
}

export async function openAdmin(onChange) {
  const m = modal({ title: 'Accesos al panel', body: '<div class="spinner"></div>', foot: '<button class="btn primary" data-close>Cerrar</button>', width: 980 });
  async function draw() {
    let d;
    try { d = await api('GET'); } catch (e) { m.body.innerHTML = `<div class="notice">${esc(e.message)}</div>`; return; }
    const by = (s) => d.users.filter((u) => s.includes(u.status)).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    const pend = by(['pending']), ok = by(['approved']), off = by(['denied', 'revoked']);
    const resets = ok.filter((u) => u.resetPending);
    const person = (u) => `<b>${esc(u.name)}</b><br><span class="muted small">${esc(u.email)}${u.company ? ' · ' + esc(u.company) : ''}</span>`;
    m.body.innerHTML = `
      ${d.mail ? '' : `<div class="notice info">El aviso por correo a <b>${esc(d.admin)}</b> aún no está activo (falta la clave de Resend). Las solicitudes aparecen igualmente aquí.</div>`}
      ${resets.length ? `<div class="notice"><span>🔑</span><div><b>${resets.length === 1 ? '1 persona ha pedido' : resets.length + ' personas han pedido'} restablecer su contraseña:</b> ${resets.map((u) => esc(u.name || u.email)).join(', ')}. Pulsa <b>Restablecer contraseña</b> en su fila y envíale el enlace.</div></div>` : ''}
      <h4 class="sub-h">Solicitudes pendientes <span class="pill ${pend.length ? 'warn' : ''}">${pend.length}</span></h4>
      ${pend.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Persona</th><th>Motivo</th><th>Solicitado</th><th></th></tr></thead><tbody>
        ${pend.map((u) => `<tr><td>${person(u)}</td><td class="small">${esc(u.reason || '–')}</td><td class="small">${when(u.requestedAt)}</td>
          <td class="n"><div class="row-actions"><button class="btn primary" data-a="approve" data-e="${esc(u.email)}">Aprobar</button><button class="btn" data-a="deny" data-e="${esc(u.email)}">Rechazar</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">No hay solicitudes pendientes.</p>'}

      <h4 class="sub-h">Con acceso <span class="pill good">${ok.length}</span></h4>
      ${ok.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Persona</th><th>Permiso</th><th>Último acceso</th><th>Aprobado</th><th></th></tr></thead><tbody>
        ${ok.map((u) => `<tr><td>${person(u)}${u.resetPending ? '<br><span class="pill warn">Ha pedido restablecer la contraseña</span>' : ''}</td>
          <td><select class="sel" data-role="${esc(u.email)}" aria-label="Permiso" ${u.email === d.self ? 'disabled' : ''}><option value="viewer" ${!['editor', 'admin'].includes(u.role) ? 'selected' : ''}>Lector: solo consulta</option><option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor: publica Excel y límites</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador: además gestiona accesos</option></select></td>
          <td class="small">${when(u.lastLogin)}</td><td class="small">${when(u.decidedAt)}</td>
          <td class="n">${u.email === d.self ? '<span class="muted small">Tú</span>' : `<div class="row-actions"><button class="btn ${u.resetPending ? 'primary' : ''}" data-reset="${esc(u.email)}" data-name="${esc(u.name || '')}">Restablecer contraseña</button><button class="btn" data-a="revoke" data-e="${esc(u.email)}">Retirar acceso</button></div>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Todavía no has aprobado a nadie.</p>'}

      <h4 class="sub-h">Sin acceso (rechazados o retirados) <span class="pill">${off.length}</span></h4>
      ${off.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Persona</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>
        ${off.map((u) => `<tr><td>${person(u)}</td><td>${u.status === 'denied' ? 'Rechazada' : 'Acceso retirado'}</td><td class="small">${when(u.decidedAt)}</td>
          <td class="n"><div class="row-actions"><button class="btn" data-a="restore" data-e="${esc(u.email)}">Dar acceso</button><button class="btn ghost" data-a="delete" data-e="${esc(u.email)}">Borrar</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Nadie.</p>'}

      <h4 class="sub-h">Tu contraseña</h4>
      <p class="muted small" style="margin-top:0">Entras con <b>${esc(d.self)}</b>. ${!d.main ? '' : d.adminPasswordSet ? 'Ya tienes una contraseña propia.' : 'Ahora usas la contraseña común de Vercel (DASHBOARD_PASSWORD); te recomiendo poner una propia.'}</p>
      <div class="pw-row"><input type="password" class="date-input" id="adm-pw" placeholder="Nueva contraseña (mín. 10)" autocomplete="new-password"><input type="password" class="date-input" id="adm-pw2" placeholder="Repítela" autocomplete="new-password"><button class="btn" id="adm-pw-go">Cambiar</button></div>
      <p class="muted small">Si retiras el acceso a alguien, deja de ver los datos en unos segundos. Los lectores solo consultan; los editores además pueden publicar el Excel y cambiar los límites; los administradores además gestionan los accesos y las contraseñas (no pueden tocar la cuenta principal, ${esc(d.admin)}).</p>`;

    m.body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a, email = b.dataset.e;
      if (a === 'delete' && !confirm(`¿Borrar a ${email}? Tendrá que volver a solicitar acceso.`)) return;
      if (a === 'revoke' && !confirm(`¿Retirar el acceso a ${email}?`)) return;
      b.disabled = true;
      try { await api('POST', { action: a, email }); toast({ approve: 'Acceso aprobado.', deny: 'Solicitud rechazada.', revoke: 'Acceso retirado.', restore: 'Acceso concedido.', delete: 'Usuario borrado.' }[a]); await draw(); onChange && onChange(); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
    }));
    m.body.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => openResetChooser(b.dataset.reset, b.dataset.name, async () => { await draw(); onChange && onChange(); })));
    m.body.querySelectorAll('[data-role]').forEach((s) => (s.onchange = async () => {
      try { await api('POST', { action: 'role', email: s.dataset.role, role: s.value }); toast('Permiso actualizado.'); } catch (e) { toast(e.message, 'warn'); }
    }));
    m.body.querySelector('#adm-pw-go').onclick = async () => {
      const a = m.body.querySelector('#adm-pw').value, b = m.body.querySelector('#adm-pw2').value;
      if (a !== b) { toast('Las contraseñas no coinciden.', 'warn'); return; }
      try { await api('POST', { action: 'password', password: a }); toast('Contraseña cambiada. Úsala la próxima vez que entres.'); await draw(); } catch (e) { toast(e.message, 'warn'); }
    };
  }
  await draw();
}
