// Avisos por correo al administrador con Resend (https://resend.com). Sin RESEND_API_KEY no se envía nada.
// Con el remitente de pruebas de Resend (onboarding@resend.dev) solo se puede escribir al correo con el que se
// creó la cuenta de Resend, que debe ser el del administrador. Con un dominio verificado, usar RESEND_FROM.
import { env, adminEmail } from './auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const mailConfigured = () => !!env('RESEND_API_KEY');
const base = (origin) => env('PUBLIC_URL') || origin;
const button = (href, txt) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#1c2e46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${esc(txt)}</a></p>`;
const wrap = (title, body) => `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;color:#111827">
  <h2 style="margin:0 0 6px;font-size:18px">${esc(title)}</h2><p style="margin:0 0 16px;color:#6b7280">Laboratorio depuradora · Revizo</p>${body}</div>`;
const row = (k, v) => `<tr><td style="padding:6px 0;color:#6b7280;width:110px;vertical-align:top">${esc(k)}</td><td>${v}</td></tr>`;

async function sendToAdmin({ subject, html, replyTo }) {
  if (!mailConfigured()) return { sent: false, reason: 'RESEND_API_KEY no configurada' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env('RESEND_FROM') || 'Laboratorio Revizo <onboarding@resend.dev>',
        to: [adminEmail()],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
      }),
    });
    if (!r.ok) return { sent: false, reason: `Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

export function notifyAccessRequest(req, origin) {
  return sendToAdmin({
    subject: `Solicitud de acceso: ${req.name} (${req.email})`,
    replyTo: req.email,
    html: wrap('Nueva solicitud de acceso', `<table style="border-collapse:collapse;font-size:14px;width:100%">
      ${row('Nombre', `<b>${esc(req.name)}</b>`)}${row('Correo', esc(req.email))}${row('Empresa', esc(req.company || '-'))}${row('Motivo', esc(req.reason || '-'))}
      </table>${button(`${base(origin)}/#accesos`, 'Revisar en el panel')}<p style="font-size:12px;color:#6b7280">Mientras no la apruebes, esta persona no puede entrar.</p>`),
  });
}

/** Un usuario ha pedido restablecer su contraseña: el administrador genera el enlace en el panel. */
export function notifyResetRequest(user, origin) {
  return sendToAdmin({
    subject: `Restablecer contraseña: ${user.name || user.email} (${user.email})`,
    replyTo: user.email,
    html: wrap('Petición para restablecer contraseña', `<p style="font-size:14px"><b>${esc(user.name || user.email)}</b> (${esc(user.email)}) dice que ha olvidado su contraseña.</p>
      <p style="font-size:14px">En el panel, en <b>Accesos</b>, pulsa <b>Restablecer contraseña</b> en su fila: se genera un enlace de un solo uso (válido 48 horas) para que se lo envíes.</p>
      ${button(`${base(origin)}/#accesos`, 'Abrir Accesos')}<p style="font-size:12px;color:#6b7280">Si no la ha pedido esa persona, no hagas nada: su contraseña sigue igual.</p>`),
  });
}

/** El administrador ha olvidado su contraseña: se le envía el enlace directamente. */
export function sendAdminResetLink(link) {
  return sendToAdmin({
    subject: 'Restablecer tu contraseña de administrador',
    html: wrap('Restablecer tu contraseña', `<p style="font-size:14px">Has pedido restablecer la contraseña de administrador del panel. El enlace sirve una sola vez y caduca en 48 horas.</p>
      ${button(link, 'Crear contraseña nueva')}<p style="font-size:12px;color:#6b7280">Si no lo has pedido tú, ignora este correo: tu contraseña sigue igual.</p>`),
  });
}
