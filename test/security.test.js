import { test } from 'node:test';
import assert from 'node:assert/strict';
import xrpl from 'xrpl';
import {
  safeEqual, isWeakToken, randomToken, signQr, verifyQr, verifyQrSignature, checkQrFreshness,
} from '../server/src/security.js';

const NFT = '0001000027619C4E54C6A0E857636B4A0FEBCC54695C89F4FB6DFDA60000280C';
const bob = xrpl.Wallet.generate(); // ed25519
const alice = xrpl.Wallet.generate(xrpl.ECDSA.secp256k1);

test('QR signé valide (ed25519 et secp256k1)', () => {
  for (const w of [bob, alice]) {
    const qr = signQr(w, NFT);
    assert.equal(qr.holder, w.classicAddress);
    assert.deepEqual(verifyQr(qr).ok, true);
  }
  // nftId en minuscules dans le QR : même message signé
  const qr = signQr(bob, NFT);
  assert.equal(verifyQr({ ...qr, nftId: NFT.toLowerCase() }).ok, true);
});

test('QR expiré (> 60 s dans le passé)', () => {
  const now = Date.now();
  const old = signQr(bob, NFT, now - 61_000);
  assert.equal(verifyQrSignature(old).ok, true); // authentique…
  const r = verifyQr(old, { now });
  assert.equal(r.ok, false); // …mais périmé
  assert.equal(r.code, 'QR_EXPIRED');
  assert.equal(checkQrFreshness(now - 59_000, { now }).ok, true);
});

test('QR daté dans le futur : tolérance 5 s, au-delà refusé (QR_FUTURE)', () => {
  const now = Date.now();
  assert.equal(checkQrFreshness(now + 4_000, { now }).ok, true); // petit décalage d'horloge toléré
  assert.equal(checkQrFreshness(now + 5_000, { now }).ok, true);
  const r = checkQrFreshness(now + 6_000, { now });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'QR_FUTURE');
  assert.match(r.reason, /futur/);
  // un QR pré-daté de 50 s ne doit pas rester valable ~110 s
  const predated = signQr(bob, NFT, now + 50_000);
  assert.equal(verifyQrSignature(predated).ok, true);
  assert.equal(verifyQr(predated, { now }).code, 'QR_FUTURE');
  assert.equal(checkQrFreshness('abc', { now }).ok, false);
});

test('QR forgé : ts, nftId ou signature modifiés', () => {
  const qr = signQr(bob, NFT);
  assert.equal(verifyQr({ ...qr, ts: qr.ts + 1 }).code, 'QR_FORGED');
  assert.equal(verifyQr({ ...qr, nftId: NFT.replace(/C$/, 'D') }).code, 'QR_FORGED');
  const flipped = qr.sig.slice(0, -2) + (qr.sig.endsWith('00') ? '01' : '00');
  assert.equal(verifyQr({ ...qr, sig: flipped }).code, 'QR_FORGED');
  assert.equal(verifyQr({ ...qr, sig: 'zz' }).code, 'QR_FORGED');
});

test('QR au nom d\'un autre détenteur (pubKey ≠ holder) refusé', () => {
  const byAlice = signQr(alice, NFT);
  const r = verifyQr({ ...byAlice, holder: bob.classicAddress });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'QR_FORGED');
  assert.match(r.reason, /ne correspond pas au porteur/);
});

test('QR non signé / mal formé', () => {
  assert.equal(verifyQr({ nftId: NFT, holder: bob.classicAddress }).code, 'QR_UNSIGNED');
  assert.equal(verifyQr({ nftId: 'abc', holder: bob.classicAddress }).code, 'QR_MALFORMED');
  // adresse avec checksum invalide (dernier caractère modifié)
  const bad = bob.classicAddress.slice(0, -1) + (bob.classicAddress.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyQr({ ...signQr(bob, NFT), holder: bad }).code, 'QR_MALFORMED');
});

test('comparaison de jetons à temps constant', () => {
  const t = randomToken();
  assert.equal(t.length, 48);
  assert.ok(safeEqual(t, t.slice()));
  assert.ok(!safeEqual(t, t.slice(0, -1)));
  assert.ok(!safeEqual(t, `${t}x`));
  assert.ok(!safeEqual('', ''));
  assert.ok(!safeEqual(undefined, t));
});

test('jetons faibles refusés', () => {
  for (const v of ['', undefined, 'change-me-admin', 'change-me-gate', 'court']) assert.ok(isWeakToken(v), String(v));
  assert.ok(!isWeakToken(randomToken()));
});
