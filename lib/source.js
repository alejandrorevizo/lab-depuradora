// Origen del Excel para la sincronización automática: un enlace de Google Drive o de OneDrive
// compartido como "cualquier persona con el enlace". Devuelve { buf, fileName, lastModified }.
import { downloadShared } from './onedrive.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function sourceName(url) {
  return /google\.com/i.test(url || '') ? 'Google Drive' : 'OneDrive';
}

export async function downloadSource(url) {
  return /google\.com/i.test(url) ? downloadGoogle(url) : downloadShared(url);
}

/** Id del archivo en enlaces de Drive y de Hojas de cálculo (…/d/<id>/… o ?id=<id>). */
function googleId(url) {
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url);
  if (!m) throw new Error('No se reconoce el enlace de Google Drive.');
  return m[1];
}

async function downloadGoogle(url, { timeoutMs = 25000 } = {}) {
  const id = googleId(url);
  // Un .xlsx subido a Drive se descarga tal cual; una hoja nativa de Google se exporta a .xlsx.
  const tries = [
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
  ];
  let last = '';
  for (const u of tries) {
    const res = await fetch(u, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (res.ok && buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b) {
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)/i.exec(cd);
      return { buf, fileName: m ? decodeURIComponent(m[1] || m[2]) : 'COMPORTAMIENTO DE LA DQO OFICIAL.xlsx', lastModified: res.headers.get('last-modified') };
    }
    last = `Google respondió ${res.status}`;
  }
  throw new Error(`${last}: no se pudo descargar el Excel. Comprueba que esté compartido como "Cualquier persona con el enlace".`);
}
