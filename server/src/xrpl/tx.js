// SEUL point de soumission de transactions.
// autofill -> sign -> submit -> attente de validation. Lève XrplTxError si le résultat n'est pas tesSUCCESS.
// Note : xrpl.js submitAndWait ne lève pas immédiatement sur tef* (il attend l'expiration
// LastLedgerSequence, ~1 min). On reproduit donc sa logique en levant tout de suite sur tef/tem/tel.
import xrpl from 'xrpl';
import { config, AppError } from '../config.js';
import { getClient } from './client.js';
import * as store from '../store.js';

export class XrplTxError extends AppError {
  constructor(code, hash, step, message) {
    super(409, message || `${step}: ${code}`, code, hash);
    this.result = code;
    this.step = step;
  }
}

const explorer = (hash) => `${config.explorerTx}${hash}`;
const queues = new Map(); // une file par compte -> pas de conflit de Sequence

function serialize(account, fn) {
  const prev = queues.get(account) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  queues.set(account, run.catch(() => {}));
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitValidated(client, hash, lastLedger) {
  for (;;) {
    await sleep(1000);
    try {
      const r = await client.request({ command: 'tx', transaction: hash });
      if (r.result.validated) return r.result;
    } catch (e) {
      if (e?.data?.error !== 'txnNotFound') throw e;
    }
    const current = await client.getLedgerIndex();
    if (current > lastLedger) return null;
  }
}

function log(entry) {
  try { store.appendTx({ ...entry, at: new Date().toISOString() }); } catch (e) { console.error('[txLog]', e.message); }
}

/**
 * Soumet `tx` signé par `wallet`.
 * @returns {Promise<{tx:{step,hash,result,explorer}, meta, fee:bigint, account}>}
 */
export function submit(tx, wallet, { step = tx.TransactionType, nftId } = {}) {
  return serialize(wallet.classicAddress, async () => {
    const client = await getClient();
    const prepared = await client.autofill({ ...tx, Account: wallet.classicAddress });
    const signed = wallet.sign(prepared);
    const hash = signed.hash;
    let prelim;
    try {
      const res = await client.request({ command: 'submit', tx_blob: signed.tx_blob });
      prelim = res.result.engine_result;
    } catch (e) {
      const code = e?.data?.error || 'SUBMIT_ERROR';
      log({ step, hash, result: code, explorer: explorer(hash), nftId });
      throw new XrplTxError(code, hash, step, `${step}: soumission refusée (${code})`);
    }
    if (/^(tef|tem|tel)/.test(prelim)) {
      // Jamais appliquée au ledger (pas de frais) : échec immédiat et définitif.
      log({ step, hash, result: prelim, explorer: explorer(hash), nftId });
      throw new XrplTxError(prelim, hash, step);
    }
    const final = await waitValidated(client, hash, prepared.LastLedgerSequence);
    if (!final) {
      log({ step, hash, result: prelim || 'EXPIRED', explorer: explorer(hash), nftId });
      throw new XrplTxError(prelim && prelim !== 'tesSUCCESS' ? prelim : 'TX_EXPIRED', hash, step,
        `${step}: non validée avant LastLedgerSequence (préliminaire ${prelim})`);
    }
    const meta = final.meta;
    const result = meta?.TransactionResult || 'UNKNOWN';
    const entry = { step, hash, result, explorer: explorer(hash) };
    log({ ...entry, nftId });
    if (result !== 'tesSUCCESS') throw new XrplTxError(result, hash, step);
    const fee = BigInt(final.tx_json?.Fee ?? final.Fee ?? prepared.Fee);
    return { tx: entry, meta, fee, account: wallet.classicAddress };
  });
}

export const rippleExpiration = (seconds = config.offerTtlSeconds) =>
  xrpl.unixTimeToRippleTime(Date.now() + seconds * 1000);
