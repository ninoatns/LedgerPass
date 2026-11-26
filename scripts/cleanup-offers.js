#!/usr/bin/env node
// Annule toutes les NFTokenOffer appartenant à org / alice / bob (libère la réserve de 0,2 XRP par offre).
import { WHO } from '../server/src/config.js';
import * as wallets from '../server/src/xrpl/wallets.js';
import { listOwnOffers, cancelOffers } from '../server/src/services/offers.js';
import { disconnect } from '../server/src/xrpl/client.js';

let total = 0;
try {
  for (const who of WHO) {
    if (!wallets.hasWallet(who)) continue;
    const offers = await listOwnOffers(wallets.address(who));
    const ids = offers.map((o) => o.index);
    if (!ids.length) { console.log(`${who}: aucune offre`); continue; }
    for (let i = 0; i < ids.length; i += 200) {
      const r = await cancelOffers({ who, offerIds: ids.slice(i, i + 200), step: 'cleanup-offers' });
      console.log(`${who}: ${Math.min(200, ids.length - i)} offre(s) annulée(s) -> ${r.tx.result} ${r.tx.explorer}`);
    }
    total += ids.length;
  }
  console.log(`Terminé : ${total} offre(s) annulée(s).`);
} finally {
  await disconnect();
}
