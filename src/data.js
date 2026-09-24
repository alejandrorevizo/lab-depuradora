// Carga de datos: Excel compartido (Vercel Blob a través de /api) o archivo subido en la sesión.
import { parseWorkbook } from './parser/index.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function parseBuffer(buf, fileName) {
  const XLSX = await import('xlsx');
  const wb = (XLSX.read || XLSX.default.read)(new Uint8Array(buf), { type: 'array', cellFormula: true, cellDates: false, cellNF: false, cellStyles: false });
  return parseWorkbook(wb, { fileName });
}

const isXlsxResponse = (r) => {
  const ct = r.headers.get('content-type') || '';
  return ct.includes('spreadsheet') || ct.includes('octet-stream');
};

/**
 * Pide el último Excel compartido.
 * Devuelve { status: 'ok', buf, meta } | { status: 'empty' } | { status: 'nostorage' } | { status: 'noapi' } | { status: 'auth' }
 */
export async function fetchShared(pathname) {
  let r;
  try {
    r = await fetch('/api/latest' + (pathname ? `?pathname=${encodeURIComponent(pathname)}` : ''), { cache: 'no-store', credentials: 'same-origin' });
  } catch (e) {
    return { status: 'noapi' };
  }
  if (r.status === 401) return { status: 'auth' };
  const access = r.headers.get('x-blob-access') || undefined;
  if (r.ok && isXlsxResponse(r)) {
    const buf = await r.arrayBuffer();
    return {
      status: 'ok', buf, access,
      meta: {
        fileName: decodeURIComponent(r.headers.get('x-file-name') || 'excel.xlsx'),
        uploadedAt: r.headers.get('x-uploaded-at'),
        uploadedBy: decodeURIComponent(r.headers.get('x-uploaded-by') || ''),
        pathname: decodeURIComponent(r.headers.get('x-pathname') || ''),
      },
    };
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return { status: 'noapi' }; // p. ej. servidor de desarrollo sin funciones
  const j = await r.json().catch(() => ({}));
  if (j.storage === false) return { status: 'nostorage' };
  if (j.empty) return { status: 'empty', access: j.access || access };
  return { status: 'error', message: j.error || `HTTP ${r.status}` };
}

export async function fetchHistory() {
  try {
    const r = await fetch('/api/history', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch (e) { return null; }
}

/** Sube el Excel a Vercel Blob (subida directa desde el navegador, autorizada por /api/upload). */
export async function uploadShared(file, access = 'private') {
  const { upload } = await import('@vercel/blob/client');
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_') || 'excel.xlsx';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const res = await upload(`excel/${stamp}__${safe}`, file, {
    access,
    handleUploadUrl: '/api/upload',
    contentType: file.type || XLSX_MIME,
    clientPayload: JSON.stringify({ fileName: file.name }),
  });
  return res;
}

export async function logout() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* */ }
  location.href = '/login.html';
}
