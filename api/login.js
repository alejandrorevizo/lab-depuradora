// POST /api/login  { user?, password }  -> cookie de sesión
import { checkCredentials, createToken, sessionCookie, authConfigured, usersMode } from '../lib/auth.js';
import { json } from './_common.js';

export async function GET() {
  return json({ configured: authConfigured(), users: usersMode() });
}

export async function POST(request) {
  if (!authConfigured()) return json({ error: 'Acceso no configurado en Vercel (DASHBOARD_PASSWORD).' }, 503);
  let body = {};
  const ct = request.headers.get('content-type') || '';
  try {
    body = ct.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch (e) { /* cuerpo vacío */ }
  const user = await checkCredentials(body.user, body.password);
  if (!user) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos repetidos
    return json({ error: usersMode() ? 'Usuario o contraseña incorrectos.' : 'Contraseña incorrecta.' }, 401);
  }
  const token = await createToken(user);
  return json({ ok: true, user }, 200, { 'set-cookie': sessionCookie(token) });
}
