// Connexion XRPL avec fallback : essaie chaque URL de XRPL_WS_URLS dans l'ordre.
// Si HTTPS_PROXY est défini (réseau d'entreprise / conteneur), passe par HttpsProxyAgent.
import xrpl from 'xrpl';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config.js';

let client = null;
let currentUrl = null;
let connecting = null;
const MAX_LEDGER_AGE_S = 60;

export function proxyAgent() {
  return config.proxy ? new HttpsProxyAgent(config.proxy) : undefined;
}

async function tryConnect(url) {
  const opts = { connectionTimeout: config.connectTimeoutMs, timeout: 20000 };
  const agent = proxyAgent();
  if (agent) opts.agent = agent;
  const c = new xrpl.Client(url, opts);
  c.on('error', () => {}); // évite un crash sur erreur réseau asynchrone
  const timer = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`timeout ${config.connectTimeoutMs} ms`)), config.connectTimeoutMs + 500));
  try {
    await Promise.race([c.connect(), timer]);
    // Un noeud peut répondre mais être figé sur un ancien Testnet (ex. après un reset) : on le rejette.
    const info = (await c.request({ command: 'server_info' })).result.info;
    const age = info.validated_ledger?.age;
    if (age === undefined || age > MAX_LEDGER_AGE_S) {
      throw new Error(`noeud désynchronisé (dernier ledger validé il y a ${age ?? '?'} s, état ${info.server_state})`);
    }
    return c;
  } catch (e) {
    try { await c.disconnect(); } catch { /* ignore */ }
    throw e;
  }
}

export async function connectAny(urls = config.wsUrls, { log = () => {} } = {}) {
  const errors = [];
  for (const url of urls) {
    try {
      const c = await tryConnect(url);
      log(`[xrpl] connecté à ${url}`);
      return { client: c, url };
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
      log(`[xrpl] échec ${url} (${e.message})`);
    }
  }
  throw new Error(`Aucun noeud XRPL joignable :\n  ${errors.join('\n  ')}`);
}

/** Client partagé (reconnecte si nécessaire). */
export async function getClient() {
  if (client && client.isConnected()) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    try { if (client) await client.disconnect(); } catch { /* ignore */ }
    const r = await connectAny(config.wsUrls, { log: (m) => console.log(m) });
    client = r.client;
    currentUrl = r.url;
    return client;
  })();
  try { return await connecting; } finally { connecting = null; }
}

export const getNetworkUrl = () => currentUrl;

export async function disconnect() {
  if (client) { try { await client.disconnect(); } catch { /* ignore */ } }
  client = null;
  currentUrl = null;
}
