// POST /api/request-access { name, email, company, reason, password } -> crea una solicitud pendiente
// y avisa al administrador (panel + correo). Es pública: no requiere sesión.
import { hashPassword, adminEmail, normEmail } from '../lib/auth.js';
import { updateUsers } from '../lib/users.js';
import { notifyAccessRequest } from '../lib/mail.js';
import { json } from './_common.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const MAX_PENDING = 100;
const clip = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: 'Petición no válida.' }, 400); }
  if (b.website) return json({ ok: true }); // campo trampa para robots: se ignora en silencio
  const req = { name: clip(b.name, 80), email: normEmail(b.email).slice(0, 200), company: clip(b.company, 80), reason: clip(b.reason, 500) };
  const password = String(b.password || '');
  if (req.name.length < 2) return json({ error: 'Escribe tu nombre.' }, 400);
  if (!EMAIL.test(req.email)) return json({ error: 'El correo no es válido.' }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
  if (req.email === adminEmail()) return json({ error: 'Este correo es el del administrador: entra directamente.' }, 400);

  const hash = await hashPassword(password);
  let result;
  try {
    result = await updateUsers((db) => {
      const cur = db.users[req.email];
      if (cur && cur.status === 'approved') return { error: 'Ya tienes acceso: entra con tu correo y tu contraseña.', status: 409 };
      if (cur && cur.status === 'pending') return { error: 'Ya hay una solicitud pendiente con este correo. Te avisaremos cuando se revise.', status: 409 };
      const pending = Object.values(db.users).filter((u) => u.status === 'pending').length;
      if (pending >= MAX_PENDING) return { error: 'Hay demasiadas solicitudes pendientes. Inténtalo más tarde.', status: 429 };
      db.users[req.email] = { ...(cur || {}), ...req, hash, status: 'pending', role: (cur && cur.role) || 'viewer', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null };
      return { ok: true };
    });
  } catch (e) {
    return json({ error: `No se pudo guardar la solicitud: ${e.message}` }, 500);
  }
  if (!result.ok) return json({ error: result.error }, result.status);
  const mail = await notifyAccessRequest(req, new URL(request.url).origin);
  if (!mail.sent) console.warn('Aviso por correo no enviado:', mail.reason);
  return json({ ok: true });
}
