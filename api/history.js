// GET /api/history -> versiones publicadas del Excel (más reciente primero)
import { json, requireSession, blobConfigured, fileNameOf } from './_common.js';
import { listAll } from './latest.js';

export async function GET(request) {
  if (!(await requireSession(request))) return json({ error: 'No autorizado' }, 401);
  if (!blobConfigured()) return json({ storage: false }, 503);
  try {
    const blobs = await listAll();
    return json(blobs.slice(0, 60).map((b) => ({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt).toISOString(), size: b.size, fileName: fileNameOf(b.pathname) })));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
