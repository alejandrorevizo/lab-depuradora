// Utilidades compartidas por las funciones /api.
import { sessionFrom, env } from '../lib/auth.js';
import { roleOf } from '../lib/users.js';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

/** Sesión válida y cuenta aún aprobada (si el administrador retira el acceso, deja de valer al momento). */
export async function requireSession(request) {
  const s = await sessionFrom(request);
  if (!s) return null;
  const role = await roleOf(s);
  return role ? { ...s, role } : null;
}
/** Solo administrador o editores: publicar Excel y editar límites. */
export async function requireEditor(request) {
  const s = await requireSession(request);
  return s && (s.role === 'admin' || s.role === 'editor') ? s : null;
}

export const blobConfigured = () => !!(env('BLOB_READ_WRITE_TOKEN') || env('BLOB_STORE_ID'));
/** Acceso del almacén de Vercel Blob: 'private' (recomendado) o 'public'. Debe coincidir con el creado en Vercel. */
export const blobAccess = () => (env('BLOB_ACCESS') === 'public' ? 'public' : 'private');
export const PREFIX = 'excel/';

/** "excel/2026-09-24T10-00-00-000Z__COMPORTAMIENTO_DE_LA_DQO.xlsx" (+ sufijo aleatorio) -> nombre legible. */
export function fileNameOf(pathname) {
  const base = pathname.slice(PREFIX.length);
  const i = base.indexOf('__');
  let name = i >= 0 ? base.slice(i + 2) : base;
  name = name.replace(/-[A-Za-z0-9]{20,}(\.xls[xm]?)$/i, '$1');
  return name.replace(/_/g, ' ');
}
