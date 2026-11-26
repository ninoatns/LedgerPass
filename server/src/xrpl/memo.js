// Helpers purs : memos hex, URI, flags. Aucune dépendance réseau (testés par node --test).
import crypto from 'node:crypto';

export const TF_BURNABLE = 0x00000001;
export const TF_ONLY_XRP = 0x00000002;
export const TF_TRANSFERABLE = 0x00000008;
export const TF_SELL_NFTOKEN = 0x00000001;
export const MAX_URI_BYTES = 256;

export const toHex = (s) => Buffer.from(String(s), 'utf8').toString('hex').toUpperCase();
export const fromHex = (h) => Buffer.from(String(h || ''), 'hex').toString('utf8');
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** Memo XRPL { Memo: { MemoType, MemoData, MemoFormat } } en hex. */
export function buildMemo(type, data, format = 'application/json') {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return { Memo: { MemoType: toHex(type), MemoData: toHex(payload), MemoFormat: toHex(format) } };
}

export function decodeMemos(memos = []) {
  return memos.map(({ Memo = {} }) => ({
    type: fromHex(Memo.MemoType),
    data: fromHex(Memo.MemoData),
    format: fromHex(Memo.MemoFormat),
  }));
}

export function metadataUrl(baseUrl, eventId, seat) {
  return `${String(baseUrl).replace(/\/+$/, '')}/metadata/evt-${eventId}/${seat}.json`;
}

/** URI hex pour NFTokenMint ; lève si > 256 octets. */
export function uriToHex(uri) {
  const hex = toHex(uri);
  if (hex.length / 2 > MAX_URI_BYTES) throw new Error(`URI trop longue (${hex.length / 2} > ${MAX_URI_BYTES} octets)`);
  return hex;
}

/** Extrait { eventId, seat } d'une URI (hex ou claire) de la forme .../evt-<id>/<seat>.json */
export function parseTicketUri(uriHexOrText) {
  if (!uriHexOrText) return { eventId: null, seat: null };
  const text = /^[0-9A-Fa-f]+$/.test(uriHexOrText) ? fromHex(uriHexOrText) : uriHexOrText;
  const m = text.match(/evt-(\d+)\/([^/]+)\.json$/);
  return m ? { eventId: Number(m[1]), seat: m[2], uri: text } : { eventId: null, seat: null, uri: text };
}

export const hasFlag = (flags, f) => (Number(flags) & f) === f;
