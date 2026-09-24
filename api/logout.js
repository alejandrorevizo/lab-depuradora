// POST /api/logout -> borra la cookie de sesión
import { clearCookie } from '../lib/auth.js';
import { json } from './_common.js';

export async function POST() {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
