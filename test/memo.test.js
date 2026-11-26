import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toHex, fromHex, buildMemo, decodeMemos, uriToHex, metadataUrl, parseTicketUri, hasFlag,
  TF_BURNABLE, TF_TRANSFERABLE, MAX_URI_BYTES,
} from '../server/src/xrpl/memo.js';

test('toHex / fromHex aller-retour (UTF-8, majuscules)', () => {
  assert.equal(toHex('ledgerpass/mint'), '6C6564676572706173732F6D696E74');
  assert.equal(fromHex(toHex('siège é')), 'siège é');
});

test('buildMemo encode type/data/format en hex et se décode', () => {
  const m = buildMemo('ledgerpass/checkin', { nftId: 'AB' });
  assert.match(m.Memo.MemoType, /^[0-9A-F]+$/);
  const [d] = decodeMemos([m]);
  assert.deepEqual(d, { type: 'ledgerpass/checkin', data: '{"nftId":"AB"}', format: 'application/json' });
});

test('URI : construction, hex, limite 256 octets', () => {
  const uri = metadataUrl('http://localhost:3000/', 1, 'A-001');
  assert.equal(uri, 'http://localhost:3000/metadata/evt-1/A-001.json');
  assert.equal(fromHex(uriToHex(uri)), uri);
  assert.throws(() => uriToHex(`http://x/${'a'.repeat(MAX_URI_BYTES)}`), /trop longue/);
  assert.doesNotThrow(() => uriToHex('a'.repeat(MAX_URI_BYTES)));
});

test('parseTicketUri depuis hex ou texte', () => {
  const uri = metadataUrl('http://h', 7, 'A-012');
  assert.deepEqual(parseTicketUri(uriToHex(uri)), { eventId: 7, seat: 'A-012', uri });
  assert.equal(parseTicketUri('http://h/autre').seat, null);
});

test('flags : billet = tfBurnable seul (pas transférable)', () => {
  assert.equal(TF_BURNABLE, 1);
  assert.equal(TF_TRANSFERABLE, 8);
  assert.ok(hasFlag(1, TF_BURNABLE));
  assert.ok(!hasFlag(1, TF_TRANSFERABLE));
  assert.ok(hasFlag(9, TF_TRANSFERABLE));
});
