#!/usr/bin/env node
// Crée (une seule fois) les comptes Testnet org / alice / bob, finance via faucet, écrit les seeds dans .env.
// Usage : npm run setup [-- --force]   (--force : régénère les 3 comptes)
// Les seeds ne sont JAMAIS affichées ; seules les adresses publiques le sont (et écrites dans docs/accounts.md).
import fs from 'node:fs';
import path from 'node:path';
import xrpl from 'xrpl';
import { ensureEnvFile, setEnvVars } from './lib-env.js';
import { config, WHO, ROOT } from '../server/src/config.js';
import { SEED_VARS } from '../server/src/xrpl/wallets.js';
import { connectAny } from '../server/src/xrpl/client.js';
import { fundAddress } from '../server/src/xrpl/faucet.js';

const force = process.argv.includes('--force');
if (ensureEnvFile()) console.log('.env créé depuis .env.example');

const { client, url } = await connectAny(config.wsUrls, { log: console.log });

async function balance(address) {
  try {
    const r = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' });
    return BigInt(r.result.account_data.Balance);
  } catch (e) {
    if (e?.data?.error === 'actNotFound') return null;
    throw e;
  }
}

async function waitFunded(address, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const b = await balance(address);
    if (b !== null) return b;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`compte ${address} toujours absent du ledger après financement`);
}

const result = {};
try {
  for (const who of WHO) {
    const varName = SEED_VARS[who];
    let seed = force ? '' : (process.env[varName] || '').trim();
    let wallet;
    if (seed) {
      try { wallet = xrpl.Wallet.fromSeed(seed); } catch { console.log(`${varName} invalide -> régénération`); seed = ''; }
    }
    if (!wallet) {
      wallet = xrpl.Wallet.generate();
      setEnvVars({ [varName]: wallet.seed });
      console.log(`${who}: nouveau compte généré (seed écrite dans .env)`);
    }
    let bal = await balance(wallet.classicAddress);
    if (bal === null) {
      console.log(`${who}: financement faucet de ${wallet.classicAddress} ...`);
      await fundAddress(wallet.classicAddress);
      bal = await waitFunded(wallet.classicAddress);
    } else {
      console.log(`${who}: compte existant réutilisé`);
    }
    result[who] = { address: wallet.classicAddress, xrp: xrpl.dropsToXrp(String(bal)) };
  }
} finally {
  await client.disconnect();
}

console.log(`\nRéseau : ${url}`);
console.table(Object.fromEntries(Object.entries(result).map(([w, v]) => [w, { adresse: v.address, solde_XRP: v.xrp }])));

const lines = [
  '# Comptes de test (XRPL Testnet)',
  '',
  `Générés par \`npm run setup\` le ${new Date().toISOString()} — réseau : \`${url}\`.`,
  '',
  'Adresses **publiques** uniquement. Les seeds sont dans `.env` (non commité). Le Testnet peut être réinitialisé :',
  'relancer `npm run setup` (refinance les mêmes adresses si elles ont disparu) ou `npm run setup -- --force` (nouveaux comptes).',
  '',
  '| Rôle | Adresse | Explorer |',
  '|---|---|---|',
  ...WHO.map((w) => `| ${w} | \`${result[w].address}\` | [voir](${config.explorerAccount}${result[w].address}) |`),
  '',
];
fs.writeFileSync(path.join(ROOT, 'docs', 'accounts.md'), lines.join('\n'));
console.log('docs/accounts.md écrit.');
