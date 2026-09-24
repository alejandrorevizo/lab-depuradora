// Autenticación mínima con contraseña única (DASHBOARD_PASSWORD) y cookie firmada (HMAC-SHA256).
// Preparado para usuarios individuales: DASHBOARD_USERS='{"ana":"<sha256 hex de su contraseña>", ...}'.
// Funciona en Edge (middleware) y en Node (funciones /api): solo usa Web Crypto.

export const COOKIE = 'rl_session';
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export async function sha256hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function env(name) {
  return (typeof process !== 'undefined' && process.env && process.env[name]) || '';
}

/** ¿Hay alguna forma de entrar configurada? Si no, el sitio queda cerrado. */
export function authConfigured() {
  return !!(env('DASHBOARD_PASSWORD') || env('DASHBOARD_USERS'));
}
function secret() {
  // AUTH_SECRET recomendado; si no existe, se deriva de la contraseña (cambiarla cierra todas las sesiones).
  return env('AUTH_SECRET') || `rl:${env('DASHBOARD_PASSWORD')}:${env('DASHBOARD_USERS')}`;
}
export function usersMode() { return !!env('DASHBOARD_USERS'); }

/** Comprueba credenciales. Devuelve el nombre de usuario o null. */
export async function checkCredentials(user, password) {
  if (!password) return null;
  const usersRaw = env('DASHBOARD_USERS');
  if (usersRaw) {
    let users = {};
    try { users = JSON.parse(usersRaw); } catch (e) { return null; }
    const u = String(user || '').trim().toLowerCase();
    const expected = users[u];
    if (!expected) return null;
    return safeEqual(await sha256hex(password), String(expected).toLowerCase()) ? u : null;
  }
  const pw = env('DASHBOARD_PASSWORD');
  if (!pw) return null;
  return safeEqual(await sha256hex(password), await sha256hex(pw)) ? 'revizo' : null;
}

export async function createToken(user, days = Number(env('SESSION_DAYS')) || 30) {
  const payload = b64url(enc.encode(JSON.stringify({ u: user, exp: Date.now() + days * 86400000 })));
  const sig = b64url(await hmac(secret(), payload));
  return `${payload}.${sig}`;
}

export async function verifyToken(token) {
  if (!token || !authConfigured()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const good = b64url(await hmac(secret(), payload));
  if (!safeEqual(sig, good)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

/** Sesión a partir de una Request web. */
export async function sessionFrom(request) {
  return verifyToken(readCookie(request.headers.get('cookie')));
}

export function sessionCookie(token, maxAgeDays = Number(env('SESSION_DAYS')) || 30) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeDays * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
