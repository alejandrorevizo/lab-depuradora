// POST /api/login  { user: email, password }  -> cookie de sesión
// El administrador (ADMIN_EMAIL) entra con su contraseña del panel o, si no la ha cambiado, con DASHBOARD_PASSWORD.
// El resto solo entra si su solicitud está aprobada.
import { createToken, sessionCookie, authConfigured, adminEmail, normEmail, checkMasterPassword, verifyPassword } from '../lib/auth.js';
import { loadUsers, updateUsers } from '../lib/users.js';
import { json } from './_common.js';

export async function GET() {
  return json({ configured: authConfigured() });
}

const slow = () => new Promise((r) => setTimeout(r, 600)); // frena intentos repetidos

export async function POST(request) {
  if (!authConfigured()) return json({ error: 'Acceso no configurado en Vercel (DASHBOARD_PASSWORD).' }, 503);
  let body = {};
  const ct = request.headers.get('content-type') || '';
  try {
    body = ct.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch (e) { /* cuerpo vacío */ }
  const email = normEmail(body.user);
  const password = String(body.password || '');
  const bad = async () => { await slow(); return json({ error: 'Correo o contraseña incorrectos.' }, 401); };
  if (!email || !password) return bad();

  let db;
  try { db = await loadUsers({ fresh: true }); } catch (e) { return json({ error: `No se pudo comprobar el acceso: ${e.message}` }, 500); }
  const u = db.users[email];

  if (email === adminEmail()) {
    const ok = u && u.hash ? await verifyPassword(password, u.hash) : await checkMasterPassword(password);
    if (!ok) return bad();
    await touch(email);
    return json({ ok: true, user: email, role: 'admin' }, 200, { 'set-cookie': sessionCookie(await createToken(email, undefined, 'admin')) });
  }

  if (!u || !(await verifyPassword(password, u.hash))) return bad();
  // Con la contraseña correcta ya se puede informar del estado de la solicitud.
  if (u.status === 'pending') return json({ error: 'Tu solicitud está pendiente de aprobación. Te avisaremos cuando tengas acceso.', status: 'pending' }, 403);
  if (u.status !== 'approved') return json({ error: 'No tienes acceso a este panel. Si crees que es un error, contacta con el administrador.', status: u.status }, 403);
  await touch(email);
  return json({ ok: true, user: email, role: u.role || 'viewer' }, 200, { 'set-cookie': sessionCookie(await createToken(email)) });
}

async function touch(email) {
  try {
    await updateUsers((db) => { if (db.users[email]) db.users[email].lastLogin = new Date().toISOString(); });
  } catch (e) { /* no impide entrar */ }
}
