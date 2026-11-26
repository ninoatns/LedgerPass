// Contrôle d'entrée : le burn EST la vérification. Accès accordé uniquement si NFTokenBurn = tesSUCCESS.
import { AppError } from '../config.js';
import * as wallets from '../xrpl/wallets.js';
import { submit, XrplTxError } from '../xrpl/tx.js';
import { buildMemo } from '../xrpl/memo.js';
import * as query from './query.js';

const locks = new Set();

export class GateRefusal extends AppError {
  constructor(reason, code = 'HTTP', hash) {
    super(409, reason, code, hash);
    this.reason = reason;
  }
}

/** Le holder peut être une adresse r... (QR code) ou un alias de démo. */
function holderAddress(holder) {
  const v = String(holder || '').trim();
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(v)) return v;
  return wallets.resolve(v).address;
}

export async function checkin({ nftId, holder }) {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide', 'HTTP');
  const addr = holderAddress(holder);
  if (locks.has(id)) throw new GateRefusal('contrôle déjà en cours pour ce billet');
  locks.add(id);
  try {
    const nft = await query.holds(addr, id);
    if (!nft) {
      const burnHash = await query.findBurn(id);
      throw new GateRefusal(burnHash ? 'billet déjà utilisé (brûlé)' : 'billet absent du portefeuille présenté (mauvais détenteur ou inexistant)',
        'HTTP', burnHash || undefined);
    }
    const org = wallets.getWallet('org');
    const tx = {
      TransactionType: 'NFTokenBurn',
      NFTokenID: id,
      Memos: [buildMemo('ledgerpass/checkin', { v: 1, nftId: id, eventId: nft.NFTokenTaxon, at: new Date().toISOString() })],
    };
    if (addr !== org.classicAddress) tx.Owner = addr;
    try {
      const r = await submit(tx, org, { step: 'gate:checkin-burn', nftId: id });
      return { granted: true, tx: r.tx };
    } catch (e) {
      if (e instanceof XrplTxError) throw new GateRefusal(`burn refusé par le ledger (${e.code})`, e.code, e.hash);
      throw e;
    }
  } finally {
    locks.delete(id);
  }
}
