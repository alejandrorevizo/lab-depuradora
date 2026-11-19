// Sincronización con OneDrive: descarga el Excel del enlace ONEDRIVE_URL y, si ha cambiado, lo publica
// como versión nueva (igual que "Publicar para todos").
//   GET  /api/sync            -> desde el panel al abrirlo: solo comprueba si la última comprobación tiene más de 10 min
//   GET  /api/sync (cron)     -> tarea programada de Vercel (Authorization: Bearer CRON_SECRET): comprueba siempre
//   POST /api/sync            -> botón "Actualizar desde OneDrive" (administrador y editores): comprueba siempre
import { put, get, del } from '@vercel/blob';
import { json, requireSession, requireEditor, blobConfigured, blobAccess, PREFIX } from './_common.js';
import { env } from '../lib/auth.js';
import { downloadSource, sourceName } from '../lib/source.js';
import { listAll } from './latest.js';

const STATE = 'config/sync.json';
const STALE_MS = 10 * 60 * 1000;
const KEEP_VERSIONS = 120;

async function readState() {
  try {
    const r = await get(STATE, { access: blobAccess(), useCache: false });
    return r && r.stream ? JSON.parse((await new Response(r.stream).text()) || '{}') : {};
  } catch (e) { return {}; }
}
const writeState = (s) => put(STATE, JSON.stringify(s), { access: blobAccess(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function runSync(state, by) {
  const now = new Date().toISOString();
  const next = { ...state, lastCheck: now };
  // Se marca la comprobación antes de descargar: si otra persona abre el panel a la vez, no repite la descarga.
  await writeState(next).catch(() => {});
  try {
    const { buf, fileName, lastModified } = await downloadSource(srcUrl());
    const hash = await sha256(buf);
    if (hash === state.lastHash) {
      next.lastError = null;
      await writeState(next);
      return { changed: false, ...pub(next) };
    }
    const safe = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_') || 'excel.xlsx';
    const stamp = now.replace(/[:.]/g, '-');
    const blob = await put(`${PREFIX}${stamp}__${safe}`, buf, {
      access: blobAccess(), addRandomSuffix: true,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.assign(next, { lastHash: hash, lastChange: now, lastModified, lastPathname: blob.pathname, lastBy: by, lastError: null });
    await writeState(next);
    await prune();
    return { changed: true, pathname: blob.pathname, ...pub(next) };
  } catch (e) {
    next.lastError = e.message;
    await writeState(next).catch(() => {});
    return { changed: false, error: e.message, ...pub(next) };
  }
}

/** Conserva las últimas KEEP_VERSIONS versiones del Excel. */
async function prune() {
  try {
    const all = await listAll();
    const old = all.slice(KEEP_VERSIONS).map((b) => b.url);
    if (old.length) await del(old);
  } catch (e) { /* no es crítico */ }
}

const srcUrl = () => env('EXCEL_URL') || env('ONEDRIVE_URL');
const pub = (s) => ({ source: sourceName(srcUrl()), lastCheck: s.lastCheck || null, lastChange: s.lastChange || null, lastModified: s.lastModified || null, lastError: s.lastError || null });

function fromCron(request) {
  const secret = env('CRON_SECRET');
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request) {
  const cron = fromCron(request);
  if (!cron && !(await requireSession(request))) return json({ error: 'No autorizado' }, 401);
  if (!srcUrl()) return json({ configured: false });
  if (!blobConfigured()) return json({ configured: false, error: 'Vercel Blob no está configurado.' }, 503);
  const state = await readState();
  if (!cron && state.lastCheck && Date.now() - new Date(state.lastCheck).getTime() < STALE_MS) {
    return json({ configured: true, changed: false, skipped: true, ...pub(state) });
  }
  return json({ configured: true, ...(await runSync(state, cron ? 'cron' : 'panel')) });
}

export async function POST(request) {
  const s = await requireEditor(request);
  if (!s) return json({ error: 'Solo el administrador y los editores pueden actualizar.' }, 403);
  if (!srcUrl()) return json({ configured: false, error: 'Falta EXCEL_URL en Vercel.' }, 400);
  if (!blobConfigured()) return json({ error: 'Vercel Blob no está configurado.' }, 503);
  return json({ configured: true, ...(await runSync(await readState(), s.u)) });
}
