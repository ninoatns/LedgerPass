// Mise à jour de .env sans jamais afficher les valeurs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ENV_PATH } from '../server/src/config.js';
import { isWeakToken, randomToken } from '../server/src/security.js';

export function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) return false;
  const example = path.join(ROOT, '.env.example');
  fs.copyFileSync(example, ENV_PATH);
  fs.chmodSync(ENV_PATH, 0o600);
  return true;
}

export function setEnvVars(vars) {
  let text = fs.readFileSync(ENV_PATH, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.replace(/\n?$/, '\n')}${k}=${v}\n`;
    process.env[k] = v;
  }
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

/**
 * Remplace ADMIN_TOKEN / GATE_TOKEN vides ou d'exemple par des jetons aléatoires (crypto.randomBytes).
 * N'affiche jamais les valeurs. Retourne la liste des variables régénérées.
 */
export function ensureTokens() {
  const changed = {};
  for (const k of ['ADMIN_TOKEN', 'GATE_TOKEN']) {
    if (isWeakToken(process.env[k])) changed[k] = randomToken();
  }
  if (Object.keys(changed).length) setEnvVars(changed);
  return Object.keys(changed);
}
