// Genera el hash SHA-256 de una contraseña para DASHBOARD_USERS.
// Uso: npm run hash-password -- "contraseña"
import { createHash } from 'node:crypto';
const pw = process.argv[2];
if (!pw) { console.error('Uso: npm run hash-password -- "contraseña"'); process.exit(1); }
console.log(createHash('sha256').update(pw).digest('hex'));
