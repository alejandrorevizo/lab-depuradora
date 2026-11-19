// GET /api/me -> usuario de la sesión, su rol y, para el administrador, cuántas solicitudes hay pendientes.
// GET /api/me?camaras=1 -> cámaras con la dirección del directo y un pase temporal para cada una.
// Va en la misma función porque el plan Hobby de Vercel admite como máximo 12.
import { json, requireSession } from './_common.js';
import { loadUsers } from '../lib/users.js';
import { normEmail } from '../lib/auth.js';
import { CAMARAS, camarasConfigured, paseCamara, baseCamaras } from '../lib/camaras.js';

async function camaras() {
  if (!camarasConfigured()) return json({ configured: false, camaras: CAMARAS });
  const base = baseCamaras();
  const lista = await Promise.all(CAMARAS.map(async (c) => {
    const t = await paseCamara(c.id);
    return { ...c, url: `${base}/${c.id}/index.m3u8?t=${encodeURIComponent(t)}`, t };
  }));
  return json({ configured: true, camaras: lista });
}

export async function GET(request) {
  const s = await requireSession(request);
  if (!s) return json({ error: 'No autorizado' }, 401);
  if (new URL(request.url).searchParams.has('camaras')) return camaras();
  const db = await loadUsers();
  const email = normEmail(s.u);
  const u = db.users[email] || {};
  const out = { email, name: u.name || '', role: s.role };
  if (s.role === 'admin') {
    out.pending = Object.values(db.users).filter((x) => x.status === 'pending').length;
    out.resets = Object.values(db.users).filter((x) => x.status === 'approved' && x.resetRequestedAt && (!x.resetLinkAt || x.resetLinkAt < x.resetRequestedAt)).length;
  }
  return json(out);
}
