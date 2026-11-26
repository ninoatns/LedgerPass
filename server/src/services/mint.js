// Mint des billets : NFTokenMint Flags=tfBurnable (sans tfTransferable), Taxon=eventId,
// URI = URL des métadonnées, Memo ledgerpass/mint avec le sha256 du fichier JSON. Mints en séquence.
import fs from 'node:fs';
import path from 'node:path';
import { config, AppError } from '../config.js';
import { submit } from '../xrpl/tx.js';
import { extractNFTokenId } from '../xrpl/meta.js';
import { buildMemo, metadataUrl, uriToHex, sha256, TF_BURNABLE } from '../xrpl/memo.js';
import * as wallets from '../xrpl/wallets.js';
import * as store from '../store.js';
import { eventOrThrow } from './query.js';

export const MAX_MINT_PER_CALL = 10;

export function metadataJson(event, seat) {
  return {
    name: `${event.name} — siège ${seat}`,
    description: `Billet LedgerPass (PoC, XRPL Testnet). Non transférable hors organisateur, brûlé à l'entrée.`,
    eventId: Number(event.id),
    seat,
    attributes: [
      { trait_type: 'event', value: event.name },
      { trait_type: 'date', value: event.date },
      { trait_type: 'venue', value: event.venue },
      { trait_type: 'seat', value: seat },
    ],
  };
}

/** Sérialisation canonique d'un fichier de métadonnées (indentation 2, saut de ligne final). */
export const serializeMetadata = (event, seat) => `${JSON.stringify(metadataJson(event, seat), null, 2)}\n`;

/** Retourne le contenu exact (bytes) des métadonnées ; génère le fichier s'il n'existe pas encore. */
export function loadOrCreateMetadata(event, seat) {
  const rel = path.join(`evt-${event.id}`, `${seat}.json`);
  const committed = path.join(config.metadataDir, rel);
  if (fs.existsSync(committed)) return fs.readFileSync(committed);
  const generated = path.join(config.generatedMetadataDir, rel);
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.publicBaseUrl)) {
    console.warn(`[mint] ${rel} absent de metadata/ (pré-générés : A-001..A-300) : fichier généré localement, `
      + `son URI ${config.publicBaseUrl} ne se résoudra qu'après commit + push de metadata/${rel}`);
  }
  if (!fs.existsSync(generated)) {
    fs.mkdirSync(path.dirname(generated), { recursive: true });
    fs.writeFileSync(generated, serializeMetadata(event, seat));
  }
  return fs.readFileSync(generated);
}

export async function mintTickets({ eventId, count = 1 }) {
  const event = eventOrThrow(eventId);
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MINT_PER_CALL) {
    throw new AppError(400, `count doit être un entier entre 1 et ${MAX_MINT_PER_CALL}`, 'HTTP');
  }
  const org = wallets.getWallet('org');
  const seats = store.reserveSeats(event.id, n);
  const tickets = [];
  const txs = [];
  for (const seat of seats) {
    const bytes = loadOrCreateMetadata(event, seat);
    const metaSha256 = sha256(bytes);
    const uri = metadataUrl(config.publicBaseUrl, event.id, seat);
    const tx = {
      TransactionType: 'NFTokenMint',
      NFTokenTaxon: Number(event.id),
      Flags: TF_BURNABLE, // PAS de tfTransferable : seul l'émetteur peut créer des offres
      URI: uriToHex(uri),
      Memos: [buildMemo('ledgerpass/mint', { v: 1, eventId: Number(event.id), seat, sha256: metaSha256 })],
    };
    let r;
    try {
      r = await submit(tx, org, { step: `mint:${seat}` });
    } catch (e) {
      e.extra = { tickets, txs };
      throw e;
    }
    const nftId = extractNFTokenId(r.meta);
    if (!nftId) throw new AppError(500, `NFTokenID introuvable dans la meta (${r.tx.hash})`, 'HTTP', r.tx.hash);
    store.tagTx(r.tx.hash, nftId);
    store.saveTicket(nftId, { eventId: Number(event.id), seat, uri, metaSha256, mintTx: r.tx.hash });
    tickets.push({ nftId, seat, uri, metaSha256 });
    txs.push(r.tx);
  }
  return { tickets, txs };
}
