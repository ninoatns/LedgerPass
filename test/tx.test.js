import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitValidated, XrplTxError } from '../server/src/xrpl/tx.js';

const HASH = 'A'.repeat(64);
const notFound = () => Object.assign(new Error('txnNotFound'), { data: { error: 'txnNotFound' } });

test('waitValidated : coupure réseau prolongée -> TX_UNKNOWN (borné dans le temps)', async () => {
  const down = async () => { throw new Error('socket fermée'); };
  const t0 = Date.now();
  await assert.rejects(
    waitValidated(HASH, 100, { step: 'test', timeoutMs: 60, pollMs: 5, clientFn: down }),
    (e) => e instanceof XrplTxError && e.code === 'TX_UNKNOWN' && e.hash === HASH && e.status === 504
      && /statut inconnu/.test(e.message) && e.message.includes(HASH),
  );
  assert.ok(Date.now() - t0 < 2000, 'doit rendre la main rapidement après le délai');
});

test('waitValidated : tx validée -> résultat ; LastLedgerSequence dépassé -> null', async () => {
  const ok = { request: async () => ({ result: { validated: true, meta: { TransactionResult: 'tesSUCCESS' } } }) };
  const r = await waitValidated(HASH, 100, { timeoutMs: 1000, pollMs: 1, clientFn: async () => ok });
  assert.equal(r.meta.TransactionResult, 'tesSUCCESS');
  const expired = { request: async () => { throw notFound(); }, getLedgerIndex: async () => 101 };
  assert.equal(await waitValidated(HASH, 100, { timeoutMs: 1000, pollMs: 1, clientFn: async () => expired }), null);
});
