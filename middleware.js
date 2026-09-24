// Vercel Routing Middleware: protege todo el sitio con la sesión de lib/auth.js.
// Quedan fuera la página de acceso, su logo, el login y la subida (que valida la sesión por su cuenta
// porque Vercel Blob la llama también para confirmar la subida).
import { next } from '@vercel/functions';
import { sessionFrom, authConfigured } from './lib/auth.js';

export const config = {
  matcher: ['/((?!login\\.html|api/login|api/upload|favicon\\.svg|logo-revizo-crop\\.jpg|logo-revizo-dark-crop\\.png).*)'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  if (!authConfigured()) {
    return new Response('Acceso no configurado: define DASHBOARD_PASSWORD en las variables de entorno de Vercel.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const s = await sessionFrom(request);
  if (s) return next();
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const to = new URL('/login.html', url);
  if (url.pathname !== '/' || url.search) to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to, 302);
}
