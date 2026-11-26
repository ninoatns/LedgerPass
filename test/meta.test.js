import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOfferId, extractNFTokenId } from '../server/src/xrpl/meta.js';

const OFFER = '5A1B9C2D3E4F5061728394A5B6C7D8E9F0A1B2C3D4E5F60718293A4B5C6D7E8F';

// Meta d'exemple (structure d'une NFTokenCreateOffer validée)
const createOfferMeta = {
  AffectedNodes: [
    { ModifiedNode: { LedgerEntryType: 'AccountRoot', LedgerIndex: 'AA'.repeat(32) } },
    { CreatedNode: { LedgerEntryType: 'DirectoryNode', LedgerIndex: 'BB'.repeat(32) } },
    { CreatedNode: { LedgerEntryType: 'NFTokenOffer', LedgerIndex: OFFER.toLowerCase(), NewFields: { Amount: '10000000' } } },
  ],
  TransactionIndex: 0,
  TransactionResult: 'tesSUCCESS',
};

test('offerId depuis CreatedNode NFTokenOffer', () => {
  assert.equal(extractOfferId(createOfferMeta), OFFER);
});

test('offerId depuis meta.offer_id (champ synthétique rippled)', () => {
  assert.equal(extractOfferId({ ...createOfferMeta, offer_id: 'abc' }), 'ABC');
});

test('pas d offre -> null', () => {
  assert.equal(extractOfferId({ AffectedNodes: [] }), null);
  assert.equal(extractOfferId(null), null);
});

test('nftoken_id synthétique prioritaire', () => {
  assert.equal(extractNFTokenId({ nftoken_id: 'ff', AffectedNodes: [] }), 'FF');
  assert.equal(extractNFTokenId(undefined), null);
});
