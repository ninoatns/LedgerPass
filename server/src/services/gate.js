// Contrôle d'entrée : le burn EST la vérification. Accès accordé uniquement si NFTokenBurn = tesSUCCESS.
// Le QR est signé par le détenteur (custodial : le backend signe pour lui) et ne vaut que 60 s :
// une capture d'écran / photo du QR ne sert plus une minute plus tard, et un QR inventé est rejeté.
import xrpl from 'xrpl';
import { AppError, config } from '../config.js';
import * as wallets from '../xrpl/wallets.js';
import { submit, XrplTxError } from '../xrpl/tx.js';
import { buildMemo } from '../xrpl/memo.js';
import { signQr, verifyQrSignature, checkQrFreshness } from '../security.js';
import * as query from './query.js';
import * as locks from './locks.js';

export class GateRefusal extends AppError {
  constructor(reason, code = 'HTTP', hash) {
    super(409, reason, code, hash);
    this.reason = reason;
  }
}

const normId = (nftId) => {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide (64 hex attendus)', 'HTTP');
  return id;
};

/**
 * QR signé pour le détenteur `who` (GET /wallets/:who/tickets/:nftId/qr).
 * Refuse si `who` ne détient pas le billet on-chain (pas de QR pour un billet qu'on n'a pas).
 */
export async function ticketQr(who, nftId) {
  const id = normId(nftId);
  const w = wallets.resolve(who);
  if (w.who === 'org') throw new AppError(400, "l'organisateur ne présente pas de billet à l'entrée", 'HTTP');
  if (!(await query.holds(w.address, id))) throw new AppError(404, `${w.who} ne détient pas ce billet (account_nfts)`, 'HTTP');
  return { ...signQr(wallets.getWallet(w.who), id), maxAgeSeconds: config.qrMaxAgeSeconds };
}

/**
 * Body = contenu du QR { nftId, holder, ts, pubKey, sig } + eventId optionnel (événement contrôlé, défaut 1).
 * Ordre : format -> signature -> holder ≠ org -> verrou -> détention on-chain (sinon brûlé / mauvais détenteur)
 *         -> fraîcheur -> événement -> NFTokenBurn.
 */
export async function checkin({ nftId, holder, ts, pubKey, sig, eventId = 1 } = {}) {
  const id = normId(nftId);
  const addr = String(holder || '').trim();
  if (!xrpl.isValidClassicAddress(addr)) throw new GateRefusal('adresse du porteur invalide (format ou checksum)', 'QR_MALFORMED');
  const expectedEvent = Number(eventId ?? 1);
  if (!Number.isInteger(expectedEvent) || expectedEvent < 0) throw new AppError(400, 'eventId invalide', 'HTTP');

  const auth = verifyQrSignature({ nftId: id, holder: addr, ts, pubKey, sig });
  if (!auth.ok) throw new GateRefusal(auth.reason, auth.code);
  if (addr === wallets.address('org')) {
    throw new GateRefusal("porteur = organisateur : billet invendu, il ne donne pas accès", 'HOLDER_IS_ORG');
  }

  let release;
  try { release = locks.acquire(id, 'contrôle d\'entrée'); } catch (e) { throw new GateRefusal(e.message, 'LOCKED'); }
  try {
    const nft = await query.holds(addr, id);
    if (!nft) {
      const burnHash = await query.findBurn(id);
      throw new GateRefusal(burnHash ? 'billet déjà utilisé (brûlé)' : 'le porteur ne détient pas ce billet (mauvais détenteur ou billet inexistant)',
        burnHash ? 'ALREADY_BURNED' : 'NOT_HOLDER', burnHash || undefined);
    }
    const fresh = checkQrFreshness(ts, { maxAgeS: config.qrMaxAgeSeconds });
    if (!fresh.ok) throw new GateRefusal(fresh.reason, fresh.code);
    if (Number(nft.NFTokenTaxon) !== expectedEvent) {
      throw new GateRefusal(`billet de l'événement ${nft.NFTokenTaxon}, contrôle de l'événement ${expectedEvent}`, 'WRONG_EVENT');
    }
    const org = wallets.getWallet('org');
    const tx = {
      TransactionType: 'NFTokenBurn',
      NFTokenID: id,
      Owner: addr,
      Memos: [buildMemo('ledgerpass/checkin', { v: 1, nftId: id, eventId: nft.NFTokenTaxon, at: new Date().toISOString() })],
    };
    try {
      const r = await submit(tx, org, { step: 'gate:checkin-burn', nftId: id });
      return { granted: true, tx: r.tx };
    } catch (e) {
      // Statut inconnu (réseau coupé pendant l'attente) : ni accès, ni refus — l'agent vérifie le hash.
      if (e instanceof XrplTxError && e.code === 'TX_UNKNOWN') {
        throw new AppError(504, `statut inconnu — vérifiez le hash ${e.hash} sur l'explorer avant de laisser entrer`, 'TX_UNKNOWN', e.hash);
      }
      if (e instanceof XrplTxError) throw new GateRefusal(`burn refusé par le ledger (${e.code})`, e.code, e.hash);
      throw e;
    }
  } finally {
    release();
  }
}
