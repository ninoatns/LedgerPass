import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitResale, withinCap, xrpToDrops, dropsToXrp, pctToBps } from '../server/src/xrpl/amounts.js';

test('xrp <-> drops', () => {
  assert.equal(xrpToDrops(10), 10_000_000n);
  assert.equal(xrpToDrops('0.000001'), 1n);
  assert.equal(dropsToXrp(19_000_000n), '19');
});

test('commission 5 % sur 20 XRP : 19 XRP vendeur, 1 XRP org (entiers de drops)', () => {
  const s = splitResale(20, 5);
  assert.equal(s.priceDrops, 20_000_000n);
  assert.equal(s.sellerDrops, 19_000_000n);
  assert.equal(s.commissionDrops, 1_000_000n);
});

test('commission : arrondi en faveur de org, somme exacte', () => {
  const s = splitResale('0.000033', 5); // 33 drops
  assert.equal(s.sellerDrops, 31n);
  assert.equal(s.commissionDrops, 2n);
  assert.equal(s.sellerDrops + s.commissionDrops, s.priceDrops);
  assert.equal(pctToBps(2.5), 250n);
  assert.throws(() => pctToBps(150));
});

test('plafond', () => {
  assert.ok(withinCap(25, 25));
  assert.ok(withinCap('24.999999', 25));
  assert.ok(!withinCap('25.000001', 25));
  assert.ok(!withinCap(30, 25));
});
