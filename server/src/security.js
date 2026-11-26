// Helpers de sécurité purs (sans réseau, testés par node --test) :
// - comparaison de jetons à temps constant, détection de jetons faibles ;
// - QR code signé à durée courte : le détenteur signe `ledgerpass|nftId|holder|ts` avec sa clé XRPL.
import crypto from 'node:crypto';
import keypairs from 'ripple-keypairs';
import xrpl from 'xrpl';
import { toHex } from './xrpl/memo.js';

/** Comparaison à temps constant (les deux côtés sont hachés : longueur fixe, aucune fuite de longueur). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Jeton vide, valeur d'exemple (`change-me…`) ou trop court (< 16 caractères). */
export function isWeakToken(t) {
  const v = String(t || '').trim();
  return !v || /^change-me/i.test(v) || v.length < 16;
}

export const randomToken = () => crypto.randomBytes(24).toString('hex');

export const QR_PREFIX = 'ledgerpass';
export const DEFAULT_QR_MAX_AGE_S = 60;

/** Message signé (hex UTF-8) : ledgerpass|<nftId>|<holder>|<ts ms>. */
export function qrMessageHex(nftId, holder, ts) {
  return toHex(`${QR_PREFIX}|${String(nftId).toUpperCase()}|${holder}|${ts}`);
}

/** Signe un QR pour `wallet` (xrpl.Wallet). ts = horodatage en millisecondes (epoch). */
export function signQr(wallet, nftId, ts = Date.now()) {
  const id = String(nftId).toUpperCase();
  const holder = wallet.classicAddress;
  const sig = keypairs.sign(qrMessageHex(id, holder, ts), wallet.privateKey);
  return { nftId: id, holder, ts, pubKey: wallet.publicKey, sig };
}

/**
 * Authenticité du QR (sans regarder l'heure) : présent, bien formé, signature valide, pubKey -> holder.
 * @returns {{ok:true} | {ok:false, reason:string, code:string}}
 */
export function verifyQrSignature(qr) {
  const { nftId, holder, ts, pubKey, sig } = qr || {};
  if (!/^[0-9A-Fa-f]{64}$/.test(String(nftId || ''))) return { ok: false, code: 'QR_MALFORMED', reason: 'NFTokenID invalide dans le QR' };
  if (!xrpl.isValidClassicAddress(String(holder || ''))) {
    return { ok: false, code: 'QR_MALFORMED', reason: 'adresse du porteur invalide (format ou checksum)' };
  }
  if (!sig || !pubKey || ts === undefined || ts === null || ts === '') {
    return { ok: false, code: 'QR_UNSIGNED', reason: 'QR non signé : régénérez le QR depuis « Mes billets »' };
  }
  if (!Number.isSafeInteger(Number(ts))) return { ok: false, code: 'QR_MALFORMED', reason: 'horodatage du QR invalide' };
  if (!/^[0-9A-Fa-f]{66}$/.test(String(pubKey)) || !/^[0-9A-Fa-f]+$/.test(String(sig))) {
    return { ok: false, code: 'QR_FORGED', reason: 'QR forgé : clé publique ou signature mal formée' };
  }
  let address;
  try { address = keypairs.deriveAddress(String(pubKey)); } catch { address = null; }
  if (address !== holder) return { ok: false, code: 'QR_FORGED', reason: 'QR forgé : la clé publique ne correspond pas au porteur' };
  let valid = false;
  try { valid = keypairs.verify(qrMessageHex(nftId, holder, Number(ts)), String(sig), String(pubKey)); } catch { valid = false; }
  if (!valid) return { ok: false, code: 'QR_FORGED', reason: 'QR forgé : signature invalide' };
  return { ok: true };
}

export const MAX_QR_CLOCK_SKEW_S = 5; // tolérance d'horloge pour un ts dans le futur

/**
 * Fraîcheur : 0 <= now - ts <= maxAgeS, avec une tolérance de `maxFutureS` (5 s) pour un ts dans le futur.
 * Un ts plus loin dans le futur est refusé (QR_FUTURE) : sinon un QR pré-daté resterait valable plus de 60 s.
 */
export function checkQrFreshness(ts, { now = Date.now(), maxAgeS = DEFAULT_QR_MAX_AGE_S, maxFutureS = MAX_QR_CLOCK_SKEW_S } = {}) {
  const deltaMs = now - Number(ts);
  if (!Number.isFinite(deltaMs)) return { ok: false, code: 'QR_MALFORMED', reason: 'horodatage du QR invalide' };
  if (deltaMs < -maxFutureS * 1000) {
    return { ok: false, code: 'QR_FUTURE', reason: `QR daté dans le futur (+${Math.round(-deltaMs / 1000)} s, tolérance ${maxFutureS} s) : horloge incohérente ou QR forgé` };
  }
  const age = Math.round(deltaMs / 1000);
  if (deltaMs > maxAgeS * 1000) {
    return { ok: false, code: 'QR_EXPIRED', reason: `QR expiré (${age} s, validité ${maxAgeS} s) : le porteur doit afficher le QR à jour` };
  }
  return { ok: true, age: Math.max(0, age) };
}

/** Vérification complète (authenticité puis fraîcheur). */
export function verifyQr(qr, opts = {}) {
  const a = verifyQrSignature(qr);
  if (!a.ok) return a;
  return checkQrFreshness(qr.ts, opts);
}
