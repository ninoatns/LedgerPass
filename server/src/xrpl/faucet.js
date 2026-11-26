// Faucet Testnet : POST {destination} -> crédite une adresse générée localement
// (la seed ne transite jamais par le réseau). Passe par HTTPS_PROXY si défini. Retry avec backoff.
import https from 'node:https';
import { config } from '../config.js';
import { proxyAgent } from './client.js';

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'user-agent': 'ledgerpass-poc' },
      agent: proxyAgent(), timeout: 60000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text: buf.slice(0, 300) });
      });
    });
    req.on('timeout', () => req.destroy(new Error('faucet timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

export async function fundAddress(address, { attempts = 6, log = console.log } = {}) {
  let delay = 3000;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await postJson(config.faucetUrl, { destination: address, userAgent: 'ledgerpass-poc' });
      if (r.status >= 200 && r.status < 300 && r.json) {
        return { amount: r.json.amount, hash: r.json.transactionHash || null };
      }
      log(`[faucet] tentative ${i}/${attempts} : HTTP ${r.status} ${r.text}`);
    } catch (e) {
      log(`[faucet] tentative ${i}/${attempts} : ${e.message}`);
    }
    if (i < attempts) { await new Promise((res) => setTimeout(res, delay)); delay = Math.min(delay * 2, 30000); }
  }
  throw new Error(`faucet indisponible après ${attempts} tentatives`);
}
