// Autenticación con cuentas individuales y cookie firmada (HMAC-SHA256).
// - Administrador: ADMIN_EMAIL (por defecto alejandro@revizo.es). Su contraseña inicial es DASHBOARD_PASSWORD;
//   puede cambiarla desde el panel de accesos (se guarda cifrada en lib/users.js).
// - Resto de usuarios: solicitan acceso, el administrador los aprueba (lib/users.js).
// Este archivo funciona en Edge (middleware) y en Node (funciones /api): solo usa Web Crypto.
// El middleware solo comprueba la firma; las funciones /api comprueban además que la cuenta siga aprobada.

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

// Lectura de variables con referencias ESTÁTICAS (process.env.NOMBRE): en el middleware de Vercel (Edge)
// solo se sustituyen las referencias escritas así; una lectura dinámica process.env[name] llega vacía.
function readEnv() {
  try {
    return {
      DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
      DASHBOARD_USERS: process.env.DASHBOARD_USERS,
      AUTH_SECRET: process.env.AUTH_SECRET,
      SESSION_DAYS: process.env.SESSION_DAYS,
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      BLOB_STORE_ID: process.env.BLOB_STORE_ID,
      BLOB_ACCESS: process.env.BLOB_ACCESS,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      RESEND_FROM: process.env.RESEND_FROM,
      PUBLIC_URL: process.env.PUBLIC_URL,
      ONEDRIVE_URL: process.env.ONEDRIVE_URL,
      EXCEL_URL: process.env.EXCEL_URL,
      CRON_SECRET: process.env.CRON_SECRET,
      CAMARAS_SECRET: process.env.CAMARAS_SECRET,
      CAMARAS_URL: process.env.CAMARAS_URL,
    };
  } catch (e) {
    return {};
  }
}
export function env(name) {
  return (readEnv()[name] || '').trim();
}

/** ¿Hay alguna forma de entrar configurada? Si no, el sitio queda cerrado. */
export function authConfigured() {
  return !!env('DASHBOARD_PASSWORD');
}
function secret() {
  // AUTH_SECRET recomendado; si no existe, se deriva de DASHBOARD_PASSWORD (cambiarla cierra todas las sesiones).
  return env('AUTH_SECRET') || `rl:${env('DASHBOARD_PASSWORD')}`;
}
export const adminEmail = () => (env('ADMIN_EMAIL') || 'alejandro@revizo.es').toLowerCase();
export const normEmail = (s) => String(s || '').trim().toLowerCase();

/** Contraseña maestra del administrador (DASHBOARD_PASSWORD), mientras no la cambie desde el panel. */
export async function checkMasterPassword(password) {
  const pw = env('DASHBOARD_PASSWORD');
  if (!pw || !password) return false;
  return safeEqual(await sha256hex(password), await sha256hex(pw));
}

// ---------- Contraseñas de usuario (PBKDF2-SHA256) ----------
const ITER = 100000;
export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
  return `pbkdf2$${iter}$${b64url(salt)}$${b64url(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !password || !salt || !hash) return false;
  const again = await hashPassword(password, fromB64url(salt), Number(iter));
  return safeEqual(again, stored);
}

// Versión del formato de sesión: las sesiones de la contraseña común (sin "v") dejan de valer.
const TOKEN_V = 2;
export async function createToken(user, days = Number(env('SESSION_DAYS')) || 30, role = 'user') {
  const payload = b64url(enc.encode(JSON.stringify({ v: TOKEN_V, u: user, r: role, exp: Date.now() + days * 86400000 })));
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
    if (!data.exp || data.exp < Date.now() || data.v !== TOKEN_V) return null;
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
