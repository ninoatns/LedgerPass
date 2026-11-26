// Configuration centrale : lit .env (racine du projet) une seule fois.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ENV_PATH = path.join(ROOT, '.env');

dotenv.config({ path: ENV_PATH, quiet: true });

const DEFAULT_WS = [
  'wss://s.altnet.rippletest.net:51233',
  'wss://testnet.xrpl-labs.com',
  'wss://testnet.honeycluster.io',
];

export const config = {
  root: ROOT,
  envPath: ENV_PATH,
  port: Number(process.env.PORT || 3000),
  wsUrls: (process.env.XRPL_WS_URLS || DEFAULT_WS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean),
  connectTimeoutMs: Number(process.env.XRPL_CONNECT_TIMEOUT_MS || 10000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  adminToken: process.env.ADMIN_TOKEN || 'change-me-admin',
  gateToken: process.env.GATE_TOKEN || 'change-me-gate',
  faucetUrl: process.env.XRPL_FAUCET_URL || 'https://faucet.altnet.rippletest.net/accounts',
  proxy: process.env.HTTPS_PROXY || process.env.https_proxy || '',
  dbPath: path.join(ROOT, 'data', 'db.json'),
  dbSamplePath: path.join(ROOT, 'data', 'db.sample.json'),
  metadataDir: path.join(ROOT, 'metadata'),
  generatedMetadataDir: path.join(ROOT, 'data', 'generated-metadata'),
  explorerTx: 'https://testnet.xrpl.org/transactions/',
  explorerNft: 'https://testnet.xrpl.org/nft/',
  explorerAccount: 'https://testnet.xrpl.org/accounts/',
  offerTtlSeconds: 2 * 3600,
};

export const WHO = ['org', 'alice', 'bob'];

/** Erreur applicative sérialisée en { error, code, hash? } */
export class AppError extends Error {
  constructor(status, message, code = 'HTTP', hash, extra) {
    super(message);
    this.status = status;
    this.code = code;
    if (hash) this.hash = hash;
    if (extra) this.extra = extra;
  }
}
