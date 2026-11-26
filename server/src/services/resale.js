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

const locks = new Set();

async function validate({ nftId, seller, buyer, priceXrp }) {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide', 'HTTP');
  const s = wallets.resolve(seller);
  const b = wallets.resolve(buyer);
  if (s.address === b.address) throw new AppError(400, 'vendeur et acheteur identiques', 'HTTP');
  if (s.who === 'org' || b.who === 'org') throw new AppError(400, "la revente se fait entre détenteurs (pas l'organisateur)", 'HTTP');
  try { assertPositiveXrp(priceXrp); } catch (e) { throw new AppError(400, e.message, 'HTTP'); }
  return { id, s, b };
}

export async function resale({ nftId, seller, buyer, priceXrp }) {
  const { id, s, b } = await validate({ nftId, seller, buyer, priceXrp });
  const nft = await query.holds(s.address, id);
  if (!nft) throw new AppError(409, `${s.who} ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu)`, 'HTTP');
  const event = query.eventOrThrow(nft.NFTokenTaxon);
  if (!withinCap(priceXrp, event.capXrp)) {
    throw new AppError(400, `prix ${priceXrp} XRP supérieur au plafond ${event.capXrp} XRP`, 'HTTP');
  }
  if (locks.has(id)) throw new AppError(409, 'revente déjà en cours pour ce billet', 'HTTP');
  locks.add(id);
  const { priceDrops, sellerDrops, commissionDrops } = splitResale(priceXrp, event.commissionPct);
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
    if (e instanceof AppError) {
      e.message = `revente échouée à l'étape ${stage}${stage === 'sell-offer' || stage === 'buyer-accept' ? " (billet conservé par l'organisateur)" : ''}: ${e.message}`;
      e.extra = { txs, stage };
    }
    throw e;
  } finally {
    locks.delete(id);
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
      const err = new AppError(409, `revente directe refusée par le protocole XRPL (${e.code})`, e.code, e.hash);
      err.extra = { txs: [{ step: e.step, hash: e.hash, result: e.code, explorer: `https://testnet.xrpl.org/transactions/${e.hash}` }] };
      throw err;
    }
    throw e;
  }
}
