// Connexion XRPL avec fallback : essaie chaque URL de XRPL_WS_URLS dans l'ordre.
// Si HTTPS_PROXY est défini (réseau d'entreprise / conteneur), passe par HttpsProxyAgent.
import xrpl from 'xrpl';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config.js';

let client = null;
let currentUrl = null;
let connecting = null;
let lastError = null;
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
  let timerId;
  const timer = new Promise((_, rej) => {
    timerId = setTimeout(() => rej(new Error(`timeout ${config.connectTimeoutMs} ms`)), config.connectTimeoutMs + 500);
  });
  try {
    await Promise.race([c.connect(), timer]);
    // Un noeud peut répondre mais être figé sur un ancien Testnet (ex. après un reset) : on le rejette.
    const info = (await c.request({ command: 'server_info' })).result.info;
    const age = info.validated_ledger?.age;
    if (age === undefined || age > MAX_LEDGER_AGE_S) {
      throw new Error(`noeud désynchronisé (dernier ledger validé il y a ${age ?? '?'} s, état ${info.server_state})`);
    }
    // Garde-fou Testnet : network_id 1. Certains noeuds ne le renvoient pas -> simple avertissement.
    if (info.network_id === undefined || info.network_id === null) {
      console.warn(`[xrpl] ${url} ne renvoie pas network_id : impossible de vérifier qu'il s'agit du Testnet`);
    } else if (Number(info.network_id) !== config.testnetNetworkId) {
      throw new Error(`network_id ${info.network_id} ≠ ${config.testnetNetworkId} : ce noeud n'est pas le Testnet`);
    }
    return c;
  } catch (e) {
    try { await c.disconnect(); } catch { /* ignore */ }
    throw e;
  } finally {
    clearTimeout(timerId);
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
    client = null;
    currentUrl = null;
    try {
      const r = await connectAny(config.wsUrls, { log: (m) => console.log(m) });
      client = r.client;
      currentUrl = r.url;
      lastError = null;
      return client;
    } catch (e) {
      lastError = e.message;
      throw e;
    }
  })();
  try { return await connecting; } finally { connecting = null; }
}

/** État de connexion sans attendre (pour /health) : 'connected' | 'connecting' | 'disconnected'. */
export function connectionState() {
  if (client && client.isConnected()) return { status: 'connected', client, url: currentUrl };
  return { status: connecting ? 'connecting' : 'disconnected', client: null, url: null, lastError };
}

export const getNetworkUrl = () => currentUrl;

export async function disconnect() {
  if (client) { try { await client.disconnect(); } catch { /* ignore */ } }
  client = null;
  currentUrl = null;
}
