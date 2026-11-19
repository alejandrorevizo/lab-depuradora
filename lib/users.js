// Registro de usuarios y solicitudes de acceso, guardado en Vercel Blob (config/users.json).
// Solo se usa desde las funciones /api (Node). Sin Blob configurado (desarrollo, pruebas) se guarda en memoria.
//
// Estructura: { users: { "<email>": { name, company, reason, hash, status, role, requestedAt, decidedAt, decidedBy, lastLogin } } }
// status: 'pending' (solicitud) | 'approved' | 'denied' (rechazada) | 'revoked' (acceso retirado)
import { put, get } from '@vercel/blob';
import { env, adminEmail, normEmail } from './auth.js';

const PATH = 'config/users.json';
const blobOn = () => !!(env('BLOB_READ_WRITE_TOKEN') || env('BLOB_STORE_ID'));
const access = () => (env('BLOB_ACCESS') === 'public' ? 'public' : 'private');

let memory = { users: {} };
let cache = null; // { at, db } — se relee como mucho cada 15 s para no ir a Blob en cada petición
const TTL = 15000;

export async function loadUsers({ fresh = false } = {}) {
  if (!blobOn()) return memory;
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.db;
  let db = { users: {} };
  try {
    const res = await get(PATH, { access: access(), useCache: false });
    if (res && res.stream) db = JSON.parse((await new Response(res.stream).text()) || '{}');
  } catch (e) {
    if (!(/not.?found|404/i.test(e.message || '') || e.name === 'BlobNotFoundError')) throw e;
  }
  if (!db.users) db.users = {};
  cache = { at: Date.now(), db };
  return db;
}

export async function saveUsers(db) {
  if (!blobOn()) { memory = db; return; }
  await put(PATH, JSON.stringify(db), { access: access(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  cache = { at: Date.now(), db };
}

/** Lee, modifica y guarda (siempre sobre la versión más reciente). */
export async function updateUsers(fn) {
  const db = await loadUsers({ fresh: true });
  const out = await fn(db);
  await saveUsers(db);
  return out;
}

/** ¿La sesión sigue siendo válida? El administrador siempre; el resto, solo si su cuenta está aprobada. */
export async function sessionAllowed(session) {
  if (!session) return false;
  const email = normEmail(session.u);
  if (email === adminEmail()) return true;
  const db = await loadUsers();
  const u = db.users[email];
  return !!(u && u.status === 'approved');
}

export const isAdmin = (session) => !!session && normEmail(session.u) === adminEmail();

/**
 * Rol actual de la sesión: 'admin' (gestiona accesos; el principal es ADMIN_EMAIL y otros usuarios pueden tener
 * este rol) | 'editor' (publica Excel y edita límites) | 'viewer' (solo consulta) | null.
 */
export async function roleOf(session) {
  if (!session) return null;
  if (isAdmin(session)) return 'admin';
  const u = (await loadUsers()).users[normEmail(session.u)];
  if (!u || u.status !== 'approved') return null;
  return u.role === 'admin' ? 'admin' : u.role === 'editor' ? 'editor' : 'viewer';
}

/** Datos públicos de un usuario para el panel de administración (sin la contraseña). */
export function publicUser(email, u) {
  const { hash, reset, ...rest } = u;
  return { email, ...rest, resetPending: !!(u.resetRequestedAt && (!u.resetLinkAt || u.resetLinkAt < u.resetRequestedAt)) };
}

export function resetMemory() { memory = { users: {} }; cache = null; }
