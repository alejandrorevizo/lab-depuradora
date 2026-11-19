// Cámaras 4G de la planta (Genbolt). El vídeo lo sirve MediaMTX en el PC de proyectos, publicado con Tailscale Funnel.
// Aquí solo se firman pases temporales: <id>.<caduca>.<firma>, con firma = HMAC-SHA256(CAMARAS_SECRET, "<id>.<caduca>").
// El verificador del PC (camaras-genbolt/servidor/auth.mjs) comprueba la misma firma.
import { env } from './auth.js';

export const CAMARAS = [
  { id: 'cam1', nombre: 'Cámara 1', lugar: 'Tolva y patio de palés' },
  { id: 'cam6', nombre: 'Cámara 6', lugar: 'Balsa y depósitos' },
];

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function firma(secret, texto) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(texto))));
}

export const camarasConfigured = () => !!(env('CAMARAS_SECRET') && env('CAMARAS_URL'));

/** Pase válido unas horas para ver una cámara. */
export async function paseCamara(id, horas = 4) {
  const caduca = Math.floor(Date.now() / 1000) + horas * 3600;
  return `${id}.${caduca}.${await firma(env('CAMARAS_SECRET'), `${id}.${caduca}`)}`;
}

export const baseCamaras = () => env('CAMARAS_URL').replace(/\/+$/, '');
