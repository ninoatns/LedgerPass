// Primitives NFTokenOffer (création / acceptation / annulation) + vente primaire.
import { AppError } from '../config.js';
import { submit, rippleExpiration } from '../xrpl/tx.js';
import { extractOfferId } from '../xrpl/meta.js';
import { TF_SELL_NFTOKEN } from '../xrpl/memo.js';
import * as wallets from '../xrpl/wallets.js';
import { getClient } from '../xrpl/client.js';
import * as query from './query.js';
import { xrpToDrops } from '../xrpl/amounts.js';

/** Offre de VENTE par `who` (Destination optionnelle). */
export async function createSellOffer({ who, nftId, amountDrops, destination, step = 'sell-offer' }) {
  const tx = {
    TransactionType: 'NFTokenCreateOffer',
    NFTokenID: nftId,
    Amount: String(amountDrops),
    Flags: TF_SELL_NFTOKEN,
    Expiration: rippleExpiration(),
  };
  if (destination) tx.Destination = destination;
  const r = await submit(tx, wallets.getWallet(who), { step, nftId });
  return { ...r, offerId: extractOfferId(r.meta) };
}

/** Offre d'ACHAT par `who` d'un NFT détenu par `owner`. */
export async function createBuyOffer({ who, nftId, owner, amountDrops, destination, step = 'buy-offer' }) {
  const tx = {
    TransactionType: 'NFTokenCreateOffer',
    NFTokenID: nftId,
    Owner: owner,
    Amount: String(amountDrops),
    Flags: 0,
    Expiration: rippleExpiration(),
  };
  if (destination) tx.Destination = destination;
  const r = await submit(tx, wallets.getWallet(who), { step, nftId });
  return { ...r, offerId: extractOfferId(r.meta) };
}

export function acceptOffer({ who, offerId, kind, nftId, step = 'accept-offer' }) {
  const tx = { TransactionType: 'NFTokenAcceptOffer' };
  tx[kind === 'buy' ? 'NFTokenBuyOffer' : 'NFTokenSellOffer'] = offerId;
  return submit(tx, wallets.getWallet(who), { step, nftId });
}

export function cancelOffers({ who, offerIds, step = 'cancel-offers', nftId }) {
  return submit({ TransactionType: 'NFTokenCancelOffer', NFTokenOffers: offerIds }, wallets.getWallet(who), { step, nftId });
}

/** Annulation best-effort (nettoyage après échec partiel). */
export async function cancelQuietly(who, offerIds, nftId) {
  const ids = offerIds.filter(Boolean);
  if (!ids.length) return null;
  try { return (await cancelOffers({ who, offerIds: ids, nftId, step: 'cleanup-cancel' })).tx; } catch { return null; }
}

/** Offres NFT dont `address` est propriétaire (account_objects type nft_offer). */
export async function listOwnOffers(address) {
  const client = await getClient();
  const out = [];
  let marker;
  do {
    let r;
    try {
      r = await client.request({ command: 'account_objects', account: address, type: 'nft_offer', limit: 400, marker });
    } catch (e) {
      if (e?.data?.error === 'actNotFound') return [];
      throw e;
    }
    out.push(...r.result.account_objects);
    marker = r.result.marker;
  } while (marker);
  return out;
}

/** Vente primaire : org (offre de vente Destination=buyer au prix de l'événement) puis buyer accepte. */
export async function primaryBuy({ nftId, buyer }) {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide', 'HTTP');
  const b = wallets.resolve(buyer);
  if (b.who === 'org') throw new AppError(400, "l'acheteur ne peut pas être l'organisateur", 'HTTP');
  const nft = await query.holds(wallets.address('org'), id);
  if (!nft) throw new AppError(409, "billet non disponible à la vente primaire (l'organisateur ne le détient pas)", 'HTTP');
  const event = query.eventOrThrow(nft.NFTokenTaxon);
  const txs = [];
  const offer = await createSellOffer({
    who: 'org', nftId: id, amountDrops: xrpToDrops(event.priceXrp), destination: b.address, step: 'primary:sell-offer',
  });
  txs.push(offer.tx);
  try {
    const acc = await acceptOffer({ who: b.who, offerId: offer.offerId, kind: 'sell', nftId: id, step: 'primary:accept' });
    txs.push(acc.tx);
  } catch (e) {
    const c = await cancelQuietly('org', [offer.offerId], id);
    if (c) txs.push(c);
    e.extra = { txs };
    throw e;
  }
  return { nftId: id, owner: b.address, txs };
}
