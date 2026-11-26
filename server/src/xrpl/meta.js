// Extraction pure d'informations depuis la meta d'une transaction validée.
import xrpl from 'xrpl';

export function extractNFTokenId(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.nftoken_id) return String(meta.nftoken_id).toUpperCase();
  try {
    const id = xrpl.getNFTokenID(meta);
    return id ? String(id).toUpperCase() : null;
  } catch { return null; }
}

export function extractOfferId(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.offer_id) return String(meta.offer_id).toUpperCase();
  for (const n of meta.AffectedNodes || []) {
    const c = n.CreatedNode;
    if (c && c.LedgerEntryType === 'NFTokenOffer') return String(c.LedgerIndex).toUpperCase();
  }
  return null;
}
