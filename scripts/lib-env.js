// Mise à jour de .env sans jamais afficher les valeurs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ENV_PATH } from '../server/src/config.js';

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
