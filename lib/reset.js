// Enlaces de un solo uso para restablecer la contraseña. En el registro de usuarios solo se guarda la huella
// SHA-256 del enlace y su caducidad; el enlace en claro solo lo ve quien lo genera.
import { sha256hex } from './auth.js';

export const RESET_HOURS = 48;

export async function newResetLink(user, email, origin) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  user.reset = { hash: await sha256hex(token), exp: Date.now() + RESET_HOURS * 3600000 };
  user.resetLinkAt = new Date().toISOString();
  return `${origin}/login.html?reset=${token}&u=${encodeURIComponent(email)}`;
}

export async function resetValid(user, token) {
  if (!user || !user.reset || !token || user.reset.exp < Date.now()) return false;
  return (await sha256hex(String(token))) === user.reset.hash;
}
