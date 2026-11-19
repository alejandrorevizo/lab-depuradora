// Descarga de un archivo compartido de OneDrive personal ("cualquier persona con el vínculo").
// OneDrive rechaza la descarga directa sin sesión de navegador: primero se abre el enlace (como haría un
// navegador) para recoger las cookies y después se pide la descarga del mismo elemento con ?download=1.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export async function downloadShared(shareUrl, { timeoutMs = 25000 } = {}) {
  const jar = new Map();
  const headers = () => ({
    'user-agent': UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'es-ES,es;q=0.9',
    ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
  });
  const keep = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
  };
  const signal = AbortSignal.timeout(timeoutMs);

  // 1) Abrir el enlace siguiendo las redirecciones a mano para guardar las cookies de cada paso.
  let url = shareUrl, item = null;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { headers: headers(), redirect: 'manual', signal });
    keep(res);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).href;
      // Primer salto a onedrive.live.com/:x:/g/personal/<cid>/<id>: es la dirección del elemento.
      if (!item && /\/:[a-z]:\/g\/personal\//i.test(url)) { const u = new URL(url); item = u.origin + u.pathname; }
      continue;
    }
    await res.arrayBuffer().catch(() => {});
    if (!res.ok) throw new Error(`OneDrive respondió ${res.status} al abrir el enlace. Comprueba que siga compartido como "Cualquier persona con el vínculo".`);
    break;
  }
  if (!item) {
    const u = new URL(shareUrl);
    if (/\/:[a-z]:\/g\/personal\//i.test(u.pathname)) item = u.origin + u.pathname;
    else throw new Error('No se reconoce el enlace de OneDrive (se espera un enlace 1drv.ms o onedrive.live.com de "Compartir").');
  }

  // 2) Descargar.
  const res = await fetch(`${item}?download=1`, { headers: headers(), redirect: 'follow', signal });
  if (!res.ok) throw new Error(`OneDrive respondió ${res.status} a la descarga.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('OneDrive no ha devuelto un archivo Excel (.xlsx).');
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)/i.exec(cd);
  const fileName = m ? decodeURIComponent(m[1] || m[2]) : 'COMPORTAMIENTO DE LA DQO OFICIAL.xlsx';
  return { buf, fileName, lastModified: res.headers.get('last-modified') };
}
