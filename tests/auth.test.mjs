// Pruebas de acceso: contraseña única, cookie firmada, middleware y funciones /api sin almacenamiento.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DASHBOARD_PASSWORD = 'prueba-segura';
process.env.AUTH_SECRET = 'secreto-de-prueba';
delete process.env.BLOB_READ_WRITE_TOKEN;

const auth = await import('../lib/auth.js');
const mw = (await import('../middleware.js')).default;
const login = await import('../api/login.js');
const latest = await import('../api/latest.js');
const upload = await import('../api/upload.js');

test('contraseña correcta e incorrecta', async () => {
  assert.equal(await auth.checkCredentials('', 'prueba-segura'), 'revizo');
  assert.equal(await auth.checkCredentials('', 'mala'), null);
  assert.equal(await auth.checkCredentials('', ''), null);
});

test('token firmado: válido, manipulado y caducado', async () => {
  const t = await auth.createToken('revizo');
  assert.equal((await auth.verifyToken(t)).u, 'revizo');
  assert.equal(await auth.verifyToken(t.slice(0, -2) + 'xx'), null);
  const old = await auth.createToken('revizo', -1);
  assert.equal(await auth.verifyToken(old), null);
});

test('middleware: sin sesión redirige a login y protege /api', async () => {
  const r = await mw(new Request('https://x.vercel.app/'));
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/login\.html/);
  const a = await mw(new Request('https://x.vercel.app/api/latest'));
  assert.equal(a.status, 401);
  const t = await auth.createToken('revizo');
  const ok = await mw(new Request('https://x.vercel.app/', { headers: { cookie: `${auth.COOKIE}=${t}` } }));
  assert.equal(ok.headers.get('x-middleware-next'), '1');
});

test('login devuelve cookie HttpOnly', async () => {
  const bad = await login.POST(new Request('https://x/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'mala' }) }));
  assert.equal(bad.status, 401);
  const good = await login.POST(new Request('https://x/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) }));
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('sin Vercel Blob: /api/latest avisa y /api/upload no genera permisos', async () => {
  const t = await auth.createToken('revizo');
  const r = await latest.GET(new Request('https://x/api/latest', { headers: { cookie: `${auth.COOKIE}=${t}` } }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).storage, false);
  const noSess = await latest.GET(new Request('https://x/api/latest'));
  assert.equal(noSess.status, 401);
  const u = await upload.POST(new Request('https://x/api/upload', { method: 'POST', body: '{}' }));
  assert.equal(u.status, 503);
});

test('usuarios individuales (DASHBOARD_USERS)', async () => {
  process.env.DASHBOARD_USERS = JSON.stringify({ ana: await auth.sha256hex('clave-ana') });
  assert.equal(await auth.checkCredentials('Ana', 'clave-ana'), 'ana');
  assert.equal(await auth.checkCredentials('ana', 'prueba-segura'), null);
  delete process.env.DASHBOARD_USERS;
});
