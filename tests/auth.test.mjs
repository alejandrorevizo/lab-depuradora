// Pruebas de acceso: administrador, solicitudes, aprobación, permisos, retirada, cookie firmada y middleware.
// Sin Vercel Blob: los usuarios se guardan en memoria (lib/users.js).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DASHBOARD_PASSWORD = 'prueba-segura';
process.env.AUTH_SECRET = 'secreto-de-prueba';
process.env.ADMIN_EMAIL = 'admin@revizo.es';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.RESEND_API_KEY;

const auth = await import('../lib/auth.js');
const users = await import('../lib/users.js');
const mw = (await import('../middleware.js')).default;
const login = await import('../api/login.js');
const reqAccess = await import('../api/request-access.js');
const admin = await import('../api/admin.js');
const me = await import('../api/me.js');
const latest = await import('../api/latest.js');
const upload = await import('../api/upload.js');
const limits = await import('../api/limits.js');

const post = (fn, url, body, cookie) => fn.POST(new Request(`https://x${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
const get = (fn, url, cookie) => fn.GET(new Request(`https://x${url}`, { headers: cookie ? { cookie } : {} }));
const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
const doLogin = (user, password) => post(login, '/api/login', { user, password });

test('contraseñas PBKDF2: correcta, incorrecta y con sal distinta', async () => {
  const h = await auth.hashPassword('una-clave-larga');
  assert.match(h, /^pbkdf2\$100000\$/);
  assert.equal(await auth.verifyPassword('una-clave-larga', h), true);
  assert.equal(await auth.verifyPassword('otra', h), false);
  assert.notEqual(await auth.hashPassword('una-clave-larga'), h);
});

test('token firmado: válido, manipulado, caducado y de la versión anterior', async () => {
  const t = await auth.createToken('admin@revizo.es', 30, 'admin');
  assert.equal((await auth.verifyToken(t)).u, 'admin@revizo.es');
  assert.equal(await auth.verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(await auth.verifyToken(await auth.createToken('x', -1)), null);
  // Sesión con el formato antiguo (contraseña común, sin versión): ya no vale.
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const crypto = await import('node:crypto');
  const payload = b64(JSON.stringify({ u: 'revizo', exp: Date.now() + 86400000 }));
  const sig = crypto.createHmac('sha256', 'secreto-de-prueba').update(payload).digest('base64url');
  assert.equal(await auth.verifyToken(`${payload}.${sig}`), null);
});

test('middleware: sin sesión redirige a login, protege /api y deja pasar la solicitud de acceso', async () => {
  const r = await mw(new Request('https://x.vercel.app/'));
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/login\.html/);
  assert.equal((await mw(new Request('https://x.vercel.app/api/latest'))).status, 401);
  const ok = await mw(new Request('https://x.vercel.app/', { headers: { cookie: `${auth.COOKIE}=${await auth.createToken('a@b.es')}` } }));
  assert.equal(ok.headers.get('x-middleware-next'), '1');
  const { config } = await import('../middleware.js');
  const re = new RegExp(`^${config.matcher[0]}$`);
  assert.equal(re.test('/api/request-access'), false, 'la solicitud de acceso es pública');
  assert.equal(re.test('/api/admin'), true, 'el panel de accesos está protegido');
});

test('administrador: entra con DASHBOARD_PASSWORD y cookie HttpOnly', async () => {
  users.resetMemory();
  assert.equal((await doLogin('admin@revizo.es', 'mala')).status, 401);
  assert.equal((await doLogin('otro@revizo.es', 'prueba-segura')).status, 401, 'la contraseña común ya no sirve a otros');
  const good = await doLogin('Admin@Revizo.es', 'prueba-segura');
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await good.json()).role, 'admin');
});

test('solicitud → pendiente → aprobada → lector → editor → retirada', async () => {
  users.resetMemory();
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  // Validaciones
  assert.equal((await post(reqAccess, '/api/request-access', { name: 'Ana', email: 'no-es-correo', password: 'clave-de-ana' })).status, 400);
  assert.equal((await post(reqAccess, '/api/request-access', { name: 'Ana', email: 'ana@planta.es', password: 'corta' })).status, 400);
  // Solicitud
  const r = await post(reqAccess, '/api/request-access', { name: 'Ana Pérez', email: 'Ana@Planta.es', company: 'Planta', reason: 'Mantenimiento', password: 'clave-de-ana' });
  assert.equal(r.status, 200);
  assert.equal((await post(reqAccess, '/api/request-access', { name: 'Ana', email: 'ana@planta.es', password: 'clave-de-ana' })).status, 409, 'no se duplica');
  // Pendiente: con contraseña correcta informa; con incorrecta, error genérico
  assert.equal((await doLogin('ana@planta.es', 'mala-clave')).status, 401);
  const p = await doLogin('ana@planta.es', 'clave-de-ana');
  assert.equal(p.status, 403);
  assert.equal((await p.json()).status, 'pending');
  // El administrador lo ve y aprueba; un no administrador no puede
  const list = await (await get(admin, '/api/admin', adm)).json();
  assert.equal(list.users.length, 1);
  assert.equal(list.users[0].hash, undefined, 'la contraseña nunca sale');
  assert.equal((await (await get(me, '/api/me', adm)).json()).pending, 1);
  assert.equal((await post(admin, '/api/admin', { action: 'approve', email: 'ana@planta.es' }, adm)).status, 200);
  // Ana entra como lectora: ve datos, no publica ni cambia límites ni administra
  const ana = cookieOf(await doLogin('ana@planta.es', 'clave-de-ana'));
  assert.equal((await (await get(me, '/api/me', ana)).json()).role, 'viewer');
  assert.equal((await get(latest, '/api/latest', ana)).status, 503, 'sesión válida (503 = sin Blob en pruebas)');
  assert.equal((await post(limits, '/api/limits', { overrides: {} }, ana)).status, 403);
  assert.equal((await get(admin, '/api/admin', ana)).status, 403);
  assert.equal((await post(admin, '/api/admin', { action: 'approve', email: 'ana@planta.es' }, ana)).status, 403);
  // Editora
  await post(admin, '/api/admin', { action: 'role', email: 'ana@planta.es', role: 'editor' }, adm);
  assert.equal((await (await get(me, '/api/me', ana)).json()).role, 'editor');
  // Retirada: su cookie deja de valer al momento
  await post(admin, '/api/admin', { action: 'revoke', email: 'ana@planta.es' }, adm);
  assert.equal((await get(latest, '/api/latest', ana)).status, 401);
  assert.equal((await doLogin('ana@planta.es', 'clave-de-ana')).status, 403);
});

test('el administrador cambia su contraseña y deja de valer la común', async () => {
  users.resetMemory();
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  assert.equal((await post(admin, '/api/admin', { action: 'password', password: 'corta' }, adm)).status, 400);
  assert.equal((await post(admin, '/api/admin', { action: 'password', password: 'nueva-clave-admin' }, adm)).status, 200);
  assert.equal((await doLogin('admin@revizo.es', 'prueba-segura')).status, 401);
  assert.equal((await doLogin('admin@revizo.es', 'nueva-clave-admin')).status, 200);
});

test('contraseña olvidada: petición → enlace del administrador → contraseña nueva (un solo uso)', async () => {
  users.resetMemory();
  const reset = await import('../api/password-reset.js');
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  await post(reqAccess, '/api/request-access', { name: 'Eva', email: 'eva@planta.es', password: 'clave-de-eva' });
  await post(admin, '/api/admin', { action: 'approve', email: 'eva@planta.es' }, adm);
  // Petición: misma respuesta exista o no el correo
  assert.equal((await post(reset, '/api/password-reset', { action: 'request', email: 'eva@planta.es' })).status, 200);
  assert.equal((await post(reset, '/api/password-reset', { action: 'request', email: 'nadie@planta.es' })).status, 200);
  assert.equal((await (await get(me, '/api/me', adm)).json()).resets, 1);
  const row = (await (await get(admin, '/api/admin', adm)).json()).users.find((u) => u.email === 'eva@planta.es');
  assert.equal(row.resetPending, true);
  assert.equal(row.reset, undefined, 'la huella del enlace no sale del servidor');
  // El administrador genera el enlace
  const { link } = await (await post(admin, '/api/admin', { action: 'resetlink', email: 'eva@planta.es' }, adm)).json();
  const u = new URL(link);
  const token = u.searchParams.get('reset');
  assert.equal(u.searchParams.get('u'), 'eva@planta.es');
  assert.equal((await (await get(me, '/api/me', adm)).json()).resets, 0, 'atendida');
  // Token falso o contraseña corta: no
  assert.equal((await post(reset, '/api/password-reset', { action: 'set', email: 'eva@planta.es', token: 'falso', password: 'nueva-de-eva' })).status, 400);
  assert.equal((await post(reset, '/api/password-reset', { action: 'set', email: 'eva@planta.es', token, password: 'corta' })).status, 400);
  // Bien: cambia la contraseña, la vieja deja de valer y el enlace no se reutiliza
  assert.equal((await post(reset, '/api/password-reset', { action: 'set', email: 'eva@planta.es', token, password: 'nueva-de-eva' })).status, 200);
  assert.equal((await doLogin('eva@planta.es', 'clave-de-eva')).status, 401);
  assert.equal((await doLogin('eva@planta.es', 'nueva-de-eva')).status, 200);
  assert.equal((await post(reset, '/api/password-reset', { action: 'set', email: 'eva@planta.es', token, password: 'otra-mas-de-eva' })).status, 400, 'un solo uso');
  // Contraseña provisional puesta por el administrador
  assert.equal((await post(admin, '/api/admin', { action: 'setpassword', email: 'eva@planta.es', password: 'Provisional9' }, adm)).status, 200);
  assert.equal((await doLogin('eva@planta.es', 'nueva-de-eva')).status, 401);
  assert.equal((await doLogin('eva@planta.es', 'Provisional9')).status, 200);
});

test('administradores adicionales: gestionan accesos pero no la cuenta principal ni la suya', async () => {
  users.resetMemory();
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  for (const [n, e] of [['Ana', 'ana@planta.es'], ['Luis', 'luis@planta.es']]) {
    await post(reqAccess, '/api/request-access', { name: n, email: e, password: `clave-de-${n}` });
    await post(admin, '/api/admin', { action: 'approve', email: e }, adm);
  }
  await post(admin, '/api/admin', { action: 'role', email: 'ana@planta.es', role: 'admin' }, adm);
  const ana = cookieOf(await doLogin('ana@planta.es', 'clave-de-Ana'));
  assert.equal((await (await get(me, '/api/me', ana)).json()).role, 'admin');
  // Puede restablecer la contraseña de otro usuario
  assert.equal((await post(admin, '/api/admin', { action: 'setpassword', email: 'luis@planta.es', password: 'Provisional9' }, ana)).status, 200);
  assert.equal((await doLogin('luis@planta.es', 'Provisional9')).status, 200);
  // No puede tocar la cuenta principal ni retirarse a sí misma
  assert.equal((await post(admin, '/api/admin', { action: 'setpassword', email: 'admin@revizo.es', password: 'Provisional9' }, ana)).status, 400);
  assert.equal((await post(admin, '/api/admin', { action: 'revoke', email: 'ana@planta.es' }, ana)).status, 400);
  assert.equal((await post(admin, '/api/admin', { action: 'role', email: 'ana@planta.es', role: 'viewer' }, ana)).status, 400);
  // Su «cambiar contraseña» cambia la suya, no la del administrador principal
  assert.equal((await post(admin, '/api/admin', { action: 'password', password: 'nueva-clave-de-ana' }, ana)).status, 200);
  assert.equal((await doLogin('ana@planta.es', 'nueva-clave-de-ana')).status, 200);
  assert.equal((await doLogin('admin@revizo.es', 'prueba-segura')).status, 200);
});

test('sincronización con OneDrive: protegida y sin efecto si no está configurada', async () => {
  users.resetMemory();
  const sync = await import('../api/sync.js');
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  process.env.ONEDRIVE_URL = 'https://1drv.ms/x/c/abc/def';
  process.env.CRON_SECRET = 'cron-de-prueba';
  assert.equal((await get(sync, '/api/sync')).status, 401, 'sin sesión ni CRON_SECRET');
  const wrongCron = await sync.GET(new Request('https://x/api/sync', { headers: { authorization: 'Bearer otro' } }));
  assert.equal(wrongCron.status, 401);
  // Con la clave de la tarea programada pasa la autorización (503 = sin Blob en pruebas)
  const cron = await sync.GET(new Request('https://x/api/sync', { headers: { authorization: 'Bearer cron-de-prueba' } }));
  assert.equal(cron.status, 503);
  // Un usuario aprobado lector no puede forzar la actualización
  await post(reqAccess, '/api/request-access', { name: 'Luis', email: 'luis@planta.es', password: 'clave-de-luis' });
  await post(admin, '/api/admin', { action: 'approve', email: 'luis@planta.es' }, adm);
  const luis = cookieOf(await doLogin('luis@planta.es', 'clave-de-luis'));
  assert.equal((await post(sync, '/api/sync', {}, luis)).status, 403);
  assert.equal((await post(sync, '/api/sync', {}, adm)).status, 503, 'el administrador sí (503 = sin Blob)');
  delete process.env.ONEDRIVE_URL;
  assert.equal((await (await get(sync, '/api/sync', adm)).json()).configured, false);
  const { config } = await import('../middleware.js');
  assert.equal(new RegExp(`^${config.matcher[0]}$`).test('/api/sync'), false, 'la tarea programada llega sin cookie');
});

test('sin Vercel Blob: /api/latest avisa y /api/upload no genera permisos', async () => {
  users.resetMemory();
  const adm = cookieOf(await doLogin('admin@revizo.es', 'prueba-segura'));
  const r = await get(latest, '/api/latest', adm);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).storage, false);
  assert.equal((await get(latest, '/api/latest')).status, 401);
  assert.equal((await upload.POST(new Request('https://x/api/upload', { method: 'POST', body: '{}' }))).status, 503);
});
