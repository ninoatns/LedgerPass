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
    super(code === 'TX_UNKNOWN' ? 504 : 409, message || `${step}: ${code}`, code, hash);
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

export const WAIT_VALIDATION_MS = 90_000; // borne dure de l'attente de validation (≈ 90 s)

/**
 * Attend la validation de `hash`. Utilise le client COURANT à chaque itération (getClient reconnecte
 * si la WebSocket est tombée) et réessaie sur erreur réseau.
 * - résultat validé -> renvoyé ;
 * - LastLedgerSequence dépassé sans trace de la tx -> null (expirée, définitivement non appliquée) ;
 * - au-delà de `timeoutMs` (coupure réseau prolongée, nœud muet) -> XrplTxError('TX_UNKNOWN') :
 *   la tx a pu être validée ou non, il faut vérifier le hash sur l'explorer.
 */
export async function waitValidated(hash, lastLedger, {
  step = 'tx', timeoutMs = WAIT_VALIDATION_MS, pollMs = 1000, clientFn = getClient,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let transient = 0;
  const onTransient = (e) => {
    transient += 1;
    if (transient === 1 || transient % 10 === 0) console.warn(`[xrpl] attente ${hash.slice(0, 10)}… : erreur réseau (${e.message}), nouvel essai`);
  };
  while (Date.now() < deadline) {
    await sleep(pollMs);
    let client;
    try {
      client = await clientFn();
      const r = await client.request({ command: 'tx', transaction: hash });
      if (r.result.validated) return r.result;
    } catch (e) {
      if (e?.data?.error !== 'txnNotFound') { onTransient(e); continue; }
    }
    try {
      const current = await client.getLedgerIndex();
      if (lastLedger && current > lastLedger) return null;
    } catch (e) { onTransient(e); }
  }
  throw new XrplTxError('TX_UNKNOWN', hash, step,
    `${step}: statut inconnu après ${Math.round(timeoutMs / 1000)} s (réseau) — vérifiez le hash ${explorer(hash)}`);
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
      // Erreur rippled explicite -> refus net. Erreur réseau (pas de e.data) -> la tx a pu partir : statut inconnu.
      const code = e?.data?.error || 'TX_UNKNOWN';
      log({ step, hash, result: code, explorer: explorer(hash), nftId });
      throw new XrplTxError(code, hash, step, code === 'TX_UNKNOWN'
        ? `${step}: statut inconnu (soumission interrompue : ${e.message}) — vérifiez le hash ${explorer(hash)}`
        : `${step}: soumission refusée (${code})`);
    }
    if (/^(tef|tem|tel)/.test(prelim)) {
      // Jamais appliquée au ledger (pas de frais) : échec immédiat et définitif.
      log({ step, hash, result: prelim, explorer: explorer(hash), nftId });
      throw new XrplTxError(prelim, hash, step);
    }
    let final;
    try {
      final = await waitValidated(hash, prepared.LastLedgerSequence, { step });
    } catch (e) {
      if (e instanceof XrplTxError) log({ step, hash, result: e.code, explorer: explorer(hash), nftId });
      throw e;
    }
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
