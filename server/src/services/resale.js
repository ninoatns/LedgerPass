// Revente encadrée (option B) : le billet n'a pas tfTransferable, donc seul l'organisateur peut créer des offres.
// 1) org : offre d'ACHAT (Owner=seller, Destination=seller) à price*(1-commission)
// 2) seller accepte -> org détient le billet, seller payé
// 3) org : offre de VENTE (Destination=buyer) à price
// 4) buyer accepte -> buyer détient le billet ; org garde la commission
// Non atomique : en cas d'échec après 2), le billet reste chez org (remboursement/relance manuels, tracé).
import { AppError } from '../config.js';
import * as wallets from '../xrpl/wallets.js';
import { splitResale, withinCap, assertPositiveXrp, dropsToXrp, xrpToDrops } from '../xrpl/amounts.js';
import * as query from './query.js';
import * as offers from './offers.js';
import { XrplTxError } from '../xrpl/tx.js';
import * as locks from './locks.js';
import * as store from '../store.js';

export const MIN_RESALE_XRP = 1;

async function validate({ nftId, seller, buyer, priceXrp }) {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide', 'HTTP');
  const s = wallets.resolve(seller);
  const b = wallets.resolve(buyer);
  if (s.address === b.address) throw new AppError(400, 'vendeur et acheteur identiques', 'HTTP');
  if (s.who === 'org' || b.who === 'org') throw new AppError(400, "la revente se fait entre détenteurs (pas l'organisateur)", 'HTTP');
  try { assertPositiveXrp(priceXrp); } catch (e) { throw new AppError(400, e.message, 'HTTP'); }
  if (xrpToDrops(priceXrp) < xrpToDrops(MIN_RESALE_XRP)) {
    throw new AppError(400, `prix minimum de revente : ${MIN_RESALE_XRP} XRP`, 'HTTP');
  }
  return { id, s, b };
}

/** Relit on-chain le détenteur actuel après un échec (best-effort). */
async function readCurrentOwner(id) {
  try {
    const h = await query.findHolder(id);
    return h ? { who: h.who, address: h.address } : { who: null, address: null };
  } catch (e) {
    return { who: 'inconnu', address: null, error: e.message };
  }
}

function failureMessage(stage, owner, seller, buyer, cause) {
  let state;
  if (owner.who === 'org') state = "billet conservé par l'organisateur, vendeur payé — marqué « en suspens », retiré de la Boutique (remboursement ou relance manuels, voir le Journal)";
  else if (owner.who === seller) state = 'billet toujours chez le vendeur, aucun paiement effectué';
  else if (owner.who === buyer) state = "billet chez l'acheteur : la dernière transaction a abouti malgré l'erreur (vérifiez le Journal)";
  else if (owner.who === 'inconnu') state = `détenteur actuel illisible (${owner.error}) : vérifiez le Journal`;
  else state = 'billet introuvable chez org/vendeur/acheteur';
  return `revente interrompue à l'étape ${stage} : ${state}. Cause : ${cause}`;
}

export async function resale({ nftId, seller, buyer, priceXrp }) {
  const { id, s, b } = await validate({ nftId, seller, buyer, priceXrp });
  const release = locks.acquire(id, 'revente');
  try {
    const nft = await query.holds(s.address, id);
    if (!nft) throw new AppError(409, `${s.who} ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu)`, 'HTTP');
    const event = query.eventOrThrow(nft.NFTokenTaxon);
    if (!withinCap(priceXrp, event.capXrp)) {
      throw new AppError(400, `prix ${priceXrp} XRP supérieur au plafond ${event.capXrp} XRP`, 'HTTP');
    }
    const { priceDrops, sellerDrops, commissionDrops } = splitResale(priceXrp, event.commissionPct);
    if (sellerDrops <= 0n) throw new AppError(400, 'montant vendeur nul après commission', 'HTTP');
    const txs = [];
    let stage = 'buy-offer';
    const pending = [];
    try {
      const buy = await offers.createBuyOffer({
        who: 'org', nftId: id, owner: s.address, amountDrops: sellerDrops, destination: s.address, step: 'resale:org-buy-offer',
      });
      txs.push(buy.tx); pending.push(buy.offerId);
      stage = 'seller-accept';
      txs.push((await offers.acceptOffer({ who: s.who, offerId: buy.offerId, kind: 'buy', nftId: id, step: 'resale:seller-accept' })).tx);
      pending.length = 0;
      stage = 'sell-offer';
      const sell = await offers.createSellOffer({
        who: 'org', nftId: id, amountDrops: priceDrops, destination: b.address, step: 'resale:org-sell-offer',
      });
      txs.push(sell.tx); pending.push(sell.offerId);
      stage = 'buyer-accept';
      txs.push((await offers.acceptOffer({ who: b.who, offerId: sell.offerId, kind: 'sell', nftId: id, step: 'resale:buyer-accept' })).tx);
      pending.length = 0;
      return {
        nftId: id,
        owner: b.address,
        sellerReceivedXrp: dropsToXrp(sellerDrops),
        orgCommissionXrp: dropsToXrp(commissionDrops),
        txs,
      };
    } catch (e) {
      const c = await offers.cancelQuietly('org', pending, id);
      if (c) txs.push(c);
      if (e instanceof XrplTxError && e.hash && !txs.some((t) => t.hash === e.hash)) {
        txs.push({ step: e.step, hash: e.hash, result: e.code, explorer: `https://testnet.xrpl.org/transactions/${e.hash}` });
      }
      const currentOwner = await readCurrentOwner(id);
      // Billet resté chez l'org (vendeur payé), ou détenteur illisible après le rachat : « en suspens »,
      // exclu de la Boutique jusqu'à résolution manuelle (cf. README § Limites).
      const afterBuyback = ['seller-accept', 'sell-offer', 'buyer-accept'].includes(stage); // rachat possiblement passé
      if (currentOwner.who === 'org' || (currentOwner.who === 'inconnu' && afterBuyback)) {
        try {
          store.setPendingResale(id, { stage, seller: s.who, buyer: b.who, priceXrp: Number(priceXrp), txs: txs.map((t) => t.hash) });
        } catch (se) { console.error('[resale] marquage pendingResale impossible :', se.message); }
        currentOwner.pendingResale = true;
      }
      const err = e instanceof AppError ? e : new AppError(502, e.message || String(e), 'NETWORK');
      err.message = failureMessage(stage, currentOwner, s.who, b.who, e.message);
      err.extra = { txs, stage, currentOwner };
      throw err;
    }
  } finally {
    release();
  }
}

/**
 * Tentative de revente DIRECTE seller -> buyer (sans l'organisateur).
 * Le protocole doit refuser (tefNFTOKEN_IS_NOT_TRANSFERABLE). Lève toujours une erreur 409.
 */
export async function directResale({ nftId, seller, buyer, priceXrp }) {
  const { id, s, b } = await validate({ nftId, seller, buyer, priceXrp });
  try {
    const r = await offers.createSellOffer({
      who: s.who, nftId: id, amountDrops: xrpToDrops(priceXrp), destination: b.address, step: 'direct:seller-sell-offer',
    });
    // Ne devrait jamais arriver avec des billets sans tfTransferable : on annule et on signale.
    await offers.cancelQuietly(s.who, [r.offerId], id);
    throw new AppError(500, 'offre directe acceptée par le ledger : billet transférable ?!', 'tesSUCCESS', r.tx.hash);
  } catch (e) {
    if (e instanceof XrplTxError) {
      const proto = /^tef/.test(String(e.code));
      const err = new AppError(409, proto
        ? `revente directe refusée par le protocole XRPL (${e.code})`
        : `revente directe échouée (${e.code})`, e.code, e.hash);
      err.extra = { txs: [{ step: e.step, hash: e.hash, result: e.code, explorer: `https://testnet.xrpl.org/transactions/${e.hash}` }] };
      throw err;
    }
    throw e;
  }
}
