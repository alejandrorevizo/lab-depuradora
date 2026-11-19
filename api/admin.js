// Panel de accesos (administrador principal y usuarios con rol de administrador).
// GET  /api/admin -> lista de usuarios y solicitudes
// POST /api/admin { action, email?, role?, password? }
//   approve | deny | revoke | restore | delete | role (viewer|editor) | password (cambia la del administrador)
//   resetlink: genera un enlace de un solo uso (48 h) para que el usuario cree una contraseña nueva
//   setpassword { email, password }: pone una contraseña provisional al usuario
//   role admite viewer | editor | admin (administrador adicional: gestiona accesos)
import { json, requireSession } from './_common.js';
import { loadUsers, updateUsers, publicUser } from '../lib/users.js';
import { normEmail, adminEmail, hashPassword } from '../lib/auth.js';
import { mailConfigured } from '../lib/mail.js';
import { newResetLink } from '../lib/reset.js';

async function admin(request) {
  const s = await requireSession(request);
  return s && s.role === 'admin' ? s : null;
}

export async function GET(request) {
  const s = await admin(request);
  if (!s) return json({ error: 'Solo el administrador.' }, 403);
  const db = await loadUsers({ fresh: true });
  const users = Object.entries(db.users).filter(([e]) => e !== adminEmail()).map(([e, u]) => publicUser(e, u));
  const self = normEmail(s.u);
  return json({ users, admin: adminEmail(), self, main: self === adminEmail(), mail: mailConfigured(), adminPasswordSet: !!(db.users[self] && db.users[self].hash) });
}

const STATUS = { approve: 'approved', deny: 'denied', revoke: 'revoked', restore: 'approved' };

export async function POST(request) {
  const s = await admin(request);
  if (!s) return json({ error: 'Solo el administrador.' }, 403);
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: 'Petición no válida.' }, 400); }
  const email = normEmail(b.email);
  try {
    const out = await updateUsers(async (db) => {
      if (b.action === 'password') {
        // Cada administrador cambia solo su propia contraseña.
        const pw = String(b.password || '');
        if (pw.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
        const self = normEmail(s.u);
        const me = db.users[self] || { name: 'Administrador', status: 'approved', role: 'admin' };
        db.users[self] = { ...me, hash: await hashPassword(pw), passwordChangedAt: new Date().toISOString() };
        return { ok: true };
      }
      const u = db.users[email];
      if (!u || email === adminEmail()) return { error: 'Usuario no encontrado.' };
      if (email === normEmail(s.u) && ['delete', 'revoke', 'deny'].includes(b.action)) return { error: 'No puedes retirarte el acceso a ti mismo.' };
      if (b.action === 'delete') { delete db.users[email]; return { ok: true }; }
      if (b.action === 'setpassword') {
        if (u.status !== 'approved') return { error: 'Solo se puede poner contraseña a un usuario con acceso.' };
        const pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 200) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
        u.hash = await hashPassword(pw);
        u.passwordChangedAt = new Date().toISOString();
        u.passwordSetBy = normEmail(s.u);
        delete u.reset;
        delete u.resetRequestedAt;
        return { ok: true };
      }
      if (b.action === 'resetlink') {
        if (u.status !== 'approved') return { error: 'Solo se puede restablecer la contraseña de un usuario con acceso.' };
        return { ok: true, link: await newResetLink(u, email, new URL(request.url).origin) };
      }
      if (b.action === 'role') {
        if (!['viewer', 'editor', 'admin'].includes(b.role)) return { error: 'Rol no válido.' };
        if (email === normEmail(s.u) && b.role !== 'admin') return { error: 'No puedes quitarte a ti mismo el rol de administrador.' };
        u.role = b.role;
        return { ok: true };
      }
      if (!STATUS[b.action]) return { error: 'Acción no válida.' };
      u.status = STATUS[b.action];
      u.decidedAt = new Date().toISOString();
      u.decidedBy = normEmail(s.u);
      return { ok: true };
    });
    return out.ok ? json({ ok: true, ...(out.link ? { link: out.link } : {}) }) : json({ error: out.error }, 400);
  } catch (e) {
    return json({ error: `No se pudo guardar: ${e.message}` }, 500);
  }
}
