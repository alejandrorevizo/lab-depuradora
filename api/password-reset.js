// Restablecer contraseña (pública, sin sesión).
// POST { action: 'request', email }                 -> pide restablecerla
//   - Administrador: recibe por correo un enlace de un solo uso.
//   - Usuario con acceso: se avisa al administrador (panel + correo), que genera el enlace en «Accesos».
//   - Cualquier otro correo: misma respuesta, para no revelar quién tiene cuenta.
// POST { action: 'set', email, token, password }    -> fija la contraseña nueva con el enlace
import { hashPassword, adminEmail, normEmail } from '../lib/auth.js';
import { updateUsers } from '../lib/users.js';
import { newResetLink, resetValid } from '../lib/reset.js';
import { notifyResetRequest, sendAdminResetLink } from '../lib/mail.js';
import { json } from './_common.js';

const slow = () => new Promise((r) => setTimeout(r, 500));
const REPEAT_MS = 10 * 60 * 1000; // no se repite el aviso si ya se pidió hace menos de 10 minutos

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: 'Petición no válida.' }, 400); }
  const email = normEmail(b.email);
  const origin = new URL(request.url).origin;

  if (b.action === 'request') {
    if (!email) return json({ error: 'Escribe tu correo.' }, 400);
    try {
      const todo = await updateUsers(async (db) => {
        if (email === adminEmail()) {
          const me = db.users[email] || (db.users[email] = { name: 'Administrador', status: 'approved', role: 'admin' });
          return { admin: await newResetLink(me, email, origin) };
        }
        const u = db.users[email];
        if (!u || u.status !== 'approved') return {};
        if (u.resetRequestedAt && Date.now() - new Date(u.resetRequestedAt).getTime() < REPEAT_MS) return {};
        u.resetRequestedAt = new Date().toISOString();
        return { notify: { email, name: u.name } };
      });
      if (todo.admin) { const m = await sendAdminResetLink(todo.admin); if (!m.sent) console.warn('Enlace de administrador no enviado:', m.reason); }
      if (todo.notify) { const m = await notifyResetRequest(todo.notify, origin); if (!m.sent) console.warn('Aviso de restablecimiento no enviado:', m.reason); }
    } catch (e) {
      return json({ error: `No se pudo registrar la petición: ${e.message}` }, 500);
    }
    await slow();
    return json({ ok: true });
  }

  if (b.action === 'set') {
    const pw = String(b.password || '');
    const min = email === adminEmail() ? 10 : 8;
    if (pw.length < min || pw.length > 200) return json({ error: `La contraseña debe tener al menos ${min} caracteres.` }, 400);
    try {
      const ok = await updateUsers(async (db) => {
        const u = db.users[email];
        if (!(await resetValid(u, b.token))) return false;
        u.hash = await hashPassword(pw);
        u.passwordChangedAt = new Date().toISOString();
        delete u.reset;
        delete u.resetRequestedAt;
        return true;
      });
      if (!ok) { await slow(); return json({ error: 'El enlace no es válido o ha caducado. Pide uno nuevo.' }, 400); }
      return json({ ok: true });
    } catch (e) {
      return json({ error: `No se pudo guardar: ${e.message}` }, 500);
    }
  }

  return json({ error: 'Acción no válida.' }, 400);
}
