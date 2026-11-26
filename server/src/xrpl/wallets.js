// Wallets custodial de démo (Testnet uniquement). Les seeds ne quittent jamais ce module.
import xrpl from 'xrpl';
import { WHO, AppError } from '../config.js';

const cache = new Map();
const SEED_VAR = { org: 'ORG_SEED', alice: 'ALICE_SEED', bob: 'BOB_SEED' };

export function hasWallet(who) {
  return Boolean(process.env[SEED_VAR[who]]);
}

export function getWallet(who) {
  if (!WHO.includes(who)) throw new AppError(400, `acteur inconnu: ${who}`, 'HTTP');
  const seed = process.env[SEED_VAR[who]];
  if (!seed) throw new AppError(500, `${SEED_VAR[who]} absent de .env (lancer npm run setup)`, 'HTTP');
  if (!cache.has(who) || cache.get(who).seed !== seed) cache.set(who, { seed, wallet: xrpl.Wallet.fromSeed(seed) });
  return cache.get(who).wallet;
}

export const address = (who) => getWallet(who).classicAddress;

export function addresses() {
  const out = {};
  for (const w of WHO) out[w] = hasWallet(w) ? address(w) : null;
  return out;
}

/** Accepte 'org'|'alice'|'bob' ou une adresse r... connue. Retourne { who, address }. */
export function resolve(whoOrAddress) {
  const v = String(whoOrAddress || '').trim();
  if (WHO.includes(v.toLowerCase())) return { who: v.toLowerCase(), address: address(v.toLowerCase()) };
  for (const w of WHO) if (hasWallet(w) && address(w) === v) return { who: w, address: v };
  throw new AppError(400, `acteur inconnu: ${v || '(vide)'} (attendu org|alice|bob ou adresse connue)`, 'HTTP');
}

export const SEED_VARS = SEED_VAR;
