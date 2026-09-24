// GET /api/latest[?pathname=excel/...]  -> el último Excel publicado (o la versión pedida)
import { list, get } from '@vercel/blob';
import { json, requireSession, blobConfigured, blobAccess, PREFIX, fileNameOf } from './_common.js';

export async function GET(request) {
  if (!(await requireSession(request))) return json({ error: 'No autorizado' }, 401);
  if (!blobConfigured()) return json({ storage: false }, 503);
  const url = new URL(request.url);
  const wanted = url.searchParams.get('pathname');
  try {
    const blobs = await listAll();
    if (!blobs.length) return json({ empty: true, access: blobAccess() }, 404, { 'x-blob-access': blobAccess() });
    const b = wanted ? blobs.find((x) => x.pathname === wanted) : blobs[0];
    if (!b) return json({ error: 'Versión no encontrada' }, 404);
    const res = await get(b.pathname, { access: blobAccess(), useCache: false });
    if (!res || !res.stream) return json({ error: 'No se pudo leer el archivo guardado' }, 502);
    return new Response(res.stream, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'cache-control': 'no-store',
        'x-file-name': encodeURIComponent(fileNameOf(b.pathname)),
        'x-uploaded-at': new Date(b.uploadedAt).toISOString(),
        'x-pathname': encodeURIComponent(b.pathname),
        'x-blob-access': blobAccess(),
      },
    });
  } catch (e) {
    return json({ error: `Error de almacenamiento: ${e.message}` }, 500);
  }
}

export async function listAll() {
  let cursor, out = [];
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    out = out.concat(r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}
