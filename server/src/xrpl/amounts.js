// Calculs monétaires en entiers de drops (BigInt) — jamais de flottants pour l'argent.
import xrpl from 'xrpl';

export const xrpToDrops = (xrp) => BigInt(xrpl.xrpToDrops(String(xrp)));
export const dropsToXrp = (drops) => String(xrpl.dropsToXrp(String(drops)));

/** Pourcentage -> points de base entiers (5 -> 500, 2.5 -> 250). */
export const pctToBps = (pct) => {
  const bps = Math.round(Number(pct) * 100);
  if (!Number.isFinite(bps) || bps < 0 || bps > 10000) throw new Error(`commission invalide: ${pct}`);
  return BigInt(bps);
};

/** Répartition d'une revente : vendeur = floor(price * (1 - c)), commission = reste (exact en drops). */
export function splitResale(priceXrp, commissionPct) {
  const priceDrops = xrpToDrops(priceXrp);
  const bps = pctToBps(commissionPct);
  const sellerDrops = (priceDrops * (10000n - bps)) / 10000n;
  const commissionDrops = priceDrops - sellerDrops;
  return { priceDrops, sellerDrops, commissionDrops };
}

/** true si price <= cap (comparaison en drops). */
export function withinCap(priceXrp, capXrp) {
  return xrpToDrops(priceXrp) <= xrpToDrops(capXrp);
}

export function assertPositiveXrp(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`montant XRP invalide: ${v}`);
  return xrpToDrops(v);
}
