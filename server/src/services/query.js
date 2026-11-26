// Lectures on-chain (account_nfts, account_info, account_tx) + catalogue off-chain.
import { config, AppError, WHO } from '../config.js';
import { getClient, getNetworkUrl } from '../xrpl/client.js';
import * as wallets from '../xrpl/wallets.js';
import { dropsToXrp } from '../xrpl/amounts.js';
import { parseTicketUri } from '../xrpl/memo.js';
import * as store from '../store.js';

export async function accountNfts(address) {
  const client = await getClient();
  const out = [];
  let marker;
  do {
    let r;
    try {
      r = await client.request({ command: 'account_nfts', account: address, limit: 400, marker, ledger_index: 'validated' });
    } catch (e) {
      if (e?.data?.error === 'actNotFound') return [];
      throw e;
    }
    out.push(...r.result.account_nfts);
    marker = r.result.marker;
  } while (marker);
  return out;
}

export function ticketView(nft) {
  const nftId = String(nft.NFTokenID).toUpperCase();
  const meta = store.getTicketMeta(nftId);
  const parsed = parseTicketUri(nft.URI);
  return {
    nftId,
    eventId: Number(nft.NFTokenTaxon ?? meta?.eventId ?? parsed.eventId),
    seat: meta?.seat ?? parsed.seat,
    flags: nft.Flags,
    uri: meta?.uri ?? parsed.uri ?? null,
    explorer: `${config.explorerNft}${nftId}`,
  };
}

/** Billets LedgerPass détenus par `who` (filtré Issuer = org). */
export async function walletTickets(whoOrAddress) {
  const { address } = wallets.resolve(whoOrAddress);
  const org = wallets.address('org');
  const nfts = await accountNfts(address);
  return nfts.filter((n) => n.Issuer === org).map(ticketView);
}

/** Cherche le NFT chez org/alice/bob. Retourne { who, address, nft } ou null. */
export async function findHolder(nftId) {
  const id = String(nftId).toUpperCase();
  for (const who of WHO) {
    if (!wallets.hasWallet(who)) continue;
    const address = wallets.address(who);
    const nft = (await accountNfts(address)).find((n) => n.NFTokenID.toUpperCase() === id);
    if (nft) return { who, address, nft };
  }
  return null;
}

/** true si `address` détient `nftId` émis par org (lecture account_nfts validée). */
export async function holds(address, nftId) {
  const id = String(nftId).toUpperCase();
  const org = wallets.address('org');
  return (await accountNfts(address)).find((n) => n.NFTokenID.toUpperCase() === id && n.Issuer === org) || null;
}

/** Cherche un NFTokenBurn réussi de ce NFT dans l'historique on-chain de org. */
export async function findBurn(nftId) {
  const id = String(nftId).toUpperCase();
  const client = await getClient();
  let marker;
  for (let page = 0; page < 10; page++) {
    let r;
    try {
      r = await client.request({ command: 'account_tx', account: wallets.address('org'), limit: 200, marker, forward: false });
    } catch { return null; }
    for (const t of r.result.transactions) {
      const tx = t.tx_json || t.tx;
      const meta = t.meta;
      if (tx?.TransactionType === 'NFTokenBurn' && String(tx.NFTokenID).toUpperCase() === id
        && meta?.TransactionResult === 'tesSUCCESS') return t.hash || tx.hash;
    }
    marker = r.result.marker;
    if (!marker) break;
  }
  return null;
}

export async function ticket(nftId) {
  const id = String(nftId || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) throw new AppError(400, 'nftId invalide (64 hex attendus)', 'HTTP');
  const holder = await findHolder(id);
  const meta = store.getTicketMeta(id);
  const parsed = holder ? parseTicketUri(holder.nft.URI) : {};
  const burned = holder ? false : Boolean(await findBurn(id));
  const history = store.getTxLog().filter((t) => t.nftId === id)
    .map(({ step, hash, result, explorer }) => ({ step, hash, result, explorer }));
  return {
    nftId: id,
    eventId: holder ? holder.nft.NFTokenTaxon : (meta?.eventId ?? null),
    seat: meta?.seat ?? parsed.seat ?? null,
    owner: holder ? holder.address : null,
    burned,
    history,
  };
}

export async function balanceDrops(address) {
  const client = await getClient();
  try {
    const r = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' });
    return BigInt(r.result.account_data.Balance);
  } catch (e) {
    if (e?.data?.error === 'actNotFound') return 0n;
    throw e;
  }
}

export async function balances() {
  const out = {};
  for (const who of WHO) out[who] = wallets.hasWallet(who) ? dropsToXrp(await balanceDrops(wallets.address(who))) : null;
  return out;
}

export async function health() {
  const client = await getClient();
  const ledgerIndex = await client.getLedgerIndex();
  return { network: getNetworkUrl(), ledgerIndex, accounts: wallets.addresses() };
}

export const events = () => store.getEvents();

export function eventOrThrow(eventId) {
  const ev = store.getEvent(eventId);
  if (!ev) throw new AppError(404, `événement ${eventId} inconnu`, 'HTTP');
  return ev;
}

export function txLog() {
  return store.getTxLog().slice().reverse().map(({ step, hash, result, explorer }) => ({ step, hash, result, explorer }));
}
