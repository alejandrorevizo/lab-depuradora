// GET  /api/limits -> límites de referencia editados (compartidos para todos los usuarios)
// POST /api/limits -> guarda los límites editados en Vercel Blob (config/limits.json)
import { put, get } from '@vercel/blob';
import { json, requireSession, requireEditor, blobConfigured, blobAccess } from './_common.js';

const PATH = 'config/limits.json';

export async function GET(request) {
  if (!(await requireSession(request))) return json({ error: 'No autorizado' }, 401);
  if (!blobConfigured()) return json({ storage: false, overrides: {} });
  try {
    const res = await get(PATH, { access: blobAccess(), useCache: false });
    if (!res || !res.stream) return json({ storage: true, overrides: {} });
    const txt = await new Response(res.stream).text();
    return json({ storage: true, overrides: JSON.parse(txt || '{}') });
  } catch (e) {
    if (/not.?found|404/i.test(e.message || '') || e.name === 'BlobNotFoundError') return json({ storage: true, overrides: {} });
    return json({ error: `Error de almacenamiento: ${e.message}` }, 500);
  }
}

export async function POST(request) {
  if (!(await requireEditor(request))) return json({ error: 'Solo el administrador y los editores pueden cambiar los límites.' }, 403);
  if (!blobConfigured()) return json({ storage: false, error: 'Vercel Blob no está configurado.' }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Petición no válida' }, 400); }
  const o = body && body.overrides;
  if (!o || typeof o !== 'object' || Array.isArray(o) || JSON.stringify(o).length > 20000) return json({ error: 'Formato no válido' }, 400);
  const clean = {};
  for (const [id, v] of Object.entries(o)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !v || typeof v !== 'object') continue;
    const e = {};
    for (const k of ['min', 'max']) if (k in v && (v[k] === null || Number.isFinite(v[k]))) e[k] = v[k];
    if (v.off === true) e.off = true;
    clean[id] = e;
  }
  try {
    await put(PATH, JSON.stringify(clean), { access: blobAccess(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return json({ ok: true });
  } catch (e) {
    return json({ error: `No se pudo guardar: ${e.message}` }, 500);
  }
}
