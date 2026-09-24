// POST /api/upload -> autoriza la subida directa del navegador a Vercel Blob (client upload).
// Solo genera el permiso si la petición trae una sesión válida.
import { handleUpload } from '@vercel/blob/client';
import { json, requireSession, blobConfigured, blobAccess, PREFIX } from './_common.js';

const TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
];

export async function POST(request) {
  if (!blobConfigured()) return json({ storage: false, error: 'Vercel Blob no está configurado.' }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Petición no válida' }, 400); }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const s = await requireSession(request);
        if (!s) throw new Error('No autorizado');
        if (!pathname.startsWith(PREFIX) || !/\.xls[xm]$/i.test(pathname) || pathname.includes('..')) throw new Error('Nombre de archivo no permitido');
        return {
          allowedContentTypes: TYPES,
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ user: s.u }),
        };
      },
    });
    return json(result);
  } catch (e) {
    return json({ error: e.message }, /autorizado/i.test(e.message) ? 401 : 400);
  }
}
