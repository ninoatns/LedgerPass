#!/usr/bin/env node
// Scénario de démo complet sur le Testnet (test d'intégration + plan B).
// Usage : npm run e2e            (enchaîne tout)
//         npm run e2e -- --step  (pause « Entrée » entre les étapes, pour la soutenance)
// Utilise directement la couche services/ (pas d'HTTP). Code de sortie ≠ 0 si une assertion échoue.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline/promises';
import { ROOT, config } from '../server/src/config.js';
import * as wallets from '../server/src/xrpl/wallets.js';
import { getClient, getNetworkUrl, disconnect } from '../server/src/xrpl/client.js';
import { fundAddress } from '../server/src/xrpl/faucet.js';
import { xrpToDrops, dropsToXrp } from '../server/src/xrpl/amounts.js';
import { TF_BURNABLE, TF_TRANSFERABLE } from '../server/src/xrpl/memo.js';
import { mintTickets } from '../server/src/services/mint.js';
import { primaryBuy } from '../server/src/services/offers.js';
import { resale, directResale } from '../server/src/services/resale.js';
import { checkin, ticketQr } from '../server/src/services/gate.js';
import { signQr } from '../server/src/security.js';
import * as query from '../server/src/services/query.js';

// --step n'a de sens qu'en terminal interactif (sinon readline se ferme à la fin de stdin).
const STEP_MODE = process.argv.includes('--step') && Boolean(process.stdin.isTTY);
if (process.argv.includes('--step') && !STEP_MODE) console.log('(--step ignoré : stdin n\'est pas un terminal)');
const EVENT_ID = 1;
const rows = []; // { step, hash, result, explorer }
const ticketInfo = {}; // NFTokenID + siège du billet suivi, écrits dans demo/last-run.md
const rl = STEP_MODE ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

class AssertionFailed extends Error {}
function assert(cond, msg) { if (!cond) throw new AssertionFailed(msg); }
const short = (h) => (h && h !== '-' ? `${h.slice(0, 10)}…` : '-');

function record(label, txOrList, note) {
  const list = Array.isArray(txOrList) ? txOrList : [txOrList];
  for (const t of list) rows.push({ label, step: t?.step || '-', hash: t?.hash || '-', result: t?.result || note || '-', explorer: t?.explorer || '' });
  if (!list.length) rows.push({ label, step: '-', hash: '-', result: note || '-', explorer: '' });
}

async function step(n, title, fn) {
  if (STEP_MODE) await rl.question(`\n⏎  Étape ${n} — ${title} (Entrée pour lancer)`);
  else console.log(`\n=== Étape ${n} — ${title}`);
  const t0 = Date.now();
  await fn();
  console.log(`    ✔ OK (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

/** Attend une erreur ; retourne l'erreur. */
async function expectError(fn, predicate, msg) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AssertionFailed) throw e;
    assert(predicate(e), `${msg} — erreur inattendue : ${e.code || ''} ${e.message}`);
    return e;
  }
  throw new AssertionFailed(`${msg} — l'opération aurait dû échouer`);
}

async function feesByAccount(txs) {
  const client = await getClient();
  const out = {};
  for (const t of txs) {
    const r = await client.request({ command: 'tx', transaction: t.hash });
    const tx = r.result.tx_json || r.result;
    out[tx.Account] = (out[tx.Account] || 0n) + BigInt(tx.Fee);
  }
  return out;
}

async function snapshot() {
  const s = {};
  for (const w of ['org', 'alice', 'bob']) s[w] = await query.balanceDrops(wallets.address(w));
  return s;
}

async function ensureFunds() {
  const min = { org: 40, alice: 20, bob: 40 };
  for (const [who, xrp] of Object.entries(min)) {
    const bal = await query.balanceDrops(wallets.address(who));
    if (bal < xrpToDrops(xrp)) {
      console.log(`    ${who} : ${dropsToXrp(bal)} XRP < ${xrp} -> recharge faucet`);
      await fundAddress(wallets.address(who));
      let now = bal;
      for (let i = 0; i < 20 && now <= bal; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        now = await query.balanceDrops(wallets.address(who));
      }
      assert(now > bal, `recharge faucet de ${who} non constatée on-chain (solde inchangé ${dropsToXrp(bal)} XRP)`);
      console.log(`    ${who} : ${dropsToXrp(now)} XRP après recharge`);
    }
  }
}

function writeReport(ok, error) {
  const lines = [
    '# Dernière exécution du scénario e2e',
    '',
    `- Date : ${new Date().toISOString()}`,
    `- Réseau : \`${getNetworkUrl() || '?'}\``,
    `- Comptes : org \`${wallets.address('org')}\`, alice \`${wallets.address('alice')}\`, bob \`${wallets.address('bob')}\``,
    `- Statut : **${ok ? 'SUCCÈS' : `ÉCHEC — ${error}`}**`,
    `- Billet suivi : siège **${ticketInfo.seat || '?'}**, NFTokenID \`${ticketInfo.nftId || '?'}\`${ticketInfo.nftId ? ` ([explorer](https://testnet.xrpl.org/nft/${ticketInfo.nftId}))` : ''}`,
    '',
    '| Étape | Transaction | Hash | Résultat | Lien |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.label} | ${r.step} | ${r.hash === '-' ? '-' : `\`${r.hash}\``} | ${r.result} | ${r.explorer && !/^te[fml]/.test(r.result) ? `[explorer](${r.explorer})` : (r.explorer ? 'non appliquée au ledger' : '-')} |`),
    '',
    '_tef*/tem* : transaction rejetée avant inclusion dans un ledger (aucun frais, hash introuvable sur l\'explorer)._',
    '',
  ];
  fs.mkdirSync(path.join(ROOT, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'demo', 'last-run.md'), lines.join('\n'));
}

/** Le serveur API utilise les MÊMES comptes : actions UI simultanées = conflits (Sequence, billets, soldes). */
function apiServerRunning() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: config.port, path: '/api/health', timeout: 1500 }, (res) => { res.resume(); resolve(true); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

let ok = false;
let errMsg = '';
try {
  if (await apiServerRunning()) {
    console.warn(`⚠  Serveur API détecté sur 127.0.0.1:${config.port} : il utilise les mêmes comptes que ce script.`);
    console.warn('   N\'agissez pas dans l\'interface pendant l\'e2e (conflits de Sequence / soldes faussés), ou arrêtez le serveur.');
  }
  await getClient();
  console.log(`Réseau : ${getNetworkUrl()}`);
  console.log(`org=${wallets.address('org')}  alice=${wallets.address('alice')}  bob=${wallets.address('bob')}`);
  await ensureFunds();
  const event = query.eventOrThrow(EVENT_ID);
  const org = wallets.address('org');
  const alice = wallets.address('alice');
  const bob = wallets.address('bob');
  let tickets;
  let nftId;

  await step(1, 'Mint de 3 billets (tfBurnable, non transférables)', async () => {
    const r = await mintTickets({ eventId: EVENT_ID, count: 3 });
    tickets = r.tickets;
    record('1 mint', r.txs);
    assert(tickets.length === 3, '3 billets attendus');
    const held = await query.accountNfts(org);
    for (const t of tickets) {
      const nft = held.find((n) => n.NFTokenID === t.nftId);
      assert(nft, `billet ${t.seat} absent de account_nfts(org)`);
      assert(nft.Flags === TF_BURNABLE, `Flags=${nft.Flags} (attendu 1)`);
      assert(!(nft.Flags & TF_TRANSFERABLE), 'le billet ne doit pas être transférable');
      assert(nft.NFTokenTaxon === EVENT_ID, 'Taxon = eventId');
      assert(!nft.TransferFee, 'pas de TransferFee');
      console.log(`    ${t.seat} ${t.nftId}  flags=${nft.Flags}`);
    }
    nftId = tickets[0].nftId;
    Object.assign(ticketInfo, { nftId, seat: tickets[0].seat, unsoldNftId: tickets[1].nftId });
  });

  await step(2, `Vente primaire billet ${tickets?.[0]?.seat} à alice (${event.priceXrp} XRP)`, async () => {
    const r = await primaryBuy({ nftId, buyer: 'alice' });
    record('2 vente primaire', r.txs);
    assert(r.owner === alice, 'owner = alice');
    assert(await query.holds(alice, nftId), 'alice détient le billet (account_nfts)');
  });

  await step(3, 'Revente DIRECTE alice -> bob (doit être bloquée par le protocole)', async () => {
    const e = await expectError(() => directResale({ nftId, seller: 'alice', buyer: 'bob', priceXrp: 50 }),
      (err) => err.code === 'tefNFTOKEN_IS_NOT_TRANSFERABLE', 'revente directe');
    record('3 revente directe', e.extra?.txs || [], e.code);
    assert(await query.holds(alice, nftId), 'alice détient toujours le billet');
    console.log(`    refusée : ${e.code}`);
  });

  await step(4, 'Revente encadrée alice -> bob via org à 20 XRP (commission 5 %)', async () => {
    const before = await snapshot();
    const r = await resale({ nftId, seller: 'alice', buyer: 'bob', priceXrp: 20 });
    record('4 revente via org', r.txs);
    const after = await snapshot();
    const fees = await feesByAccount(r.txs);
    assert(r.owner === bob && await query.holds(bob, nftId), 'bob détient le billet');
    assert(!(await query.holds(alice, nftId)), 'alice ne détient plus le billet');
    assert(r.sellerReceivedXrp === '19' && r.orgCommissionXrp === '1', `répartition ${r.sellerReceivedXrp}/${r.orgCommissionXrp}`);
    const d = (w) => after[w] - before[w];
    const f = (a) => fees[a] || 0n;
    assert(d('alice') === xrpToDrops(19) - f(alice), `alice Δ=${dropsToXrp(d('alice'))} (attendu 19 - frais ${dropsToXrp(f(alice))})`);
    assert(d('bob') === -xrpToDrops(20) - f(bob), `bob Δ=${dropsToXrp(d('bob'))}`);
    assert(d('org') === xrpToDrops(1) - f(org), `org Δ=${dropsToXrp(d('org'))} (attendu 1 - frais ${dropsToXrp(f(org))})`);
    console.log(`    Δ alice=${dropsToXrp(d('alice'))} (frais ${dropsToXrp(f(alice))})  Δ bob=${dropsToXrp(d('bob'))}  Δ org=${dropsToXrp(d('org'))} (commission 1 XRP - frais ${dropsToXrp(f(org))})`);
  });

  await step(5, `Revente au-dessus du plafond (30 > ${event.capXrp} XRP)`, async () => {
    const e = await expectError(() => resale({ nftId, seller: 'bob', buyer: 'alice', priceXrp: 30 }),
      (err) => err.status === 400 && /plafond/.test(err.message), 'plafond');
    record('5 plafond', [], `refusé (HTTP 400) : ${e.message}`);
    assert(await query.holds(bob, nftId), 'bob détient toujours le billet');
  });

  let qr;
  await step(6, 'Contrôles refusés AVANT le check-in (QR non signé, expiré, futur, forgé, mauvais détenteur, org, autre événement)', async () => {
    qr = await ticketQr('bob', nftId); // QR signé par (le backend pour) bob, valable 60 s
    const bobW = wallets.getWallet('bob');
    const cases = [
      ['QR non signé', { nftId, holder: bob }, /non signé/],
      ['QR expiré', signQr(bobW, nftId, Date.now() - 120_000), /expiré/],
      ['QR daté dans le futur (+60 s)', signQr(bobW, nftId, Date.now() + 60_000), /futur/],
      ['QR forgé (ts modifié)', { ...qr, ts: qr.ts + 1 }, /forgé/],
      ['QR au nom de bob signé par alice', { ...signQr(wallets.getWallet('alice'), nftId), holder: bob }, /forgé/],
      ['mauvais détenteur (alice)', signQr(wallets.getWallet('alice'), nftId), /ne détient pas/],
      ['porteur = org (billet invendu)', signQr(wallets.getWallet('org'), ticketInfo.unsoldNftId), /organisateur/],
      ['autre événement contrôlé', { ...qr, eventId: 2 }, /événement/],
    ];
    for (const [label, body, re] of cases) {
      const e = await expectError(() => checkin(body), (err) => err.status === 409 && re.test(err.reason || ''), label);
      record('6 refus', [], `${label} : ${e.reason}`);
      console.log(`    ${label.padEnd(34)} -> ${e.reason}`);
    }
    assert(await query.holds(bob, nftId), 'bob détient toujours le billet');
  });

  await step(7, 'Check-in de bob avec QR signé : NFTokenBurn (Owner=bob) + memo ledgerpass/checkin', async () => {
    qr = await ticketQr('bob', nftId); // QR régénéré (comme l'UI toutes les 30 s ; utile en mode --step)
    const r = await checkin({ ...qr, eventId: EVENT_ID });
    record('7 check-in', r.tx);
    ticketInfo.burnHash = r.tx.hash;
    assert(r.granted === true && r.tx.result === 'tesSUCCESS', 'accès accordé');
    assert(!(await query.holds(bob, nftId)), 'billet absent de account_nfts(bob)');
    const client = await getClient();
    const t = await client.request({ command: 'tx', transaction: r.tx.hash });
    const memo = (t.result.tx_json || t.result).Memos?.[0]?.Memo;
    assert(memo && Buffer.from(memo.MemoType, 'hex').toString() === 'ledgerpass/checkin', 'memo ledgerpass/checkin présent');
  });

  await step(8, 'Re-scan du même QR -> refusé (billet brûlé)', async () => {
    const e = await expectError(() => checkin(qr), (err) => err.status === 409 && /brûlé/.test(err.reason || ''), 'rescan');
    record('8 rescan', [], `refusé : ${e.reason}`);
    console.log(`    ${e.reason}`);
  });

  await step(9, 'bob tente de revendre le billet brûlé -> refusé', async () => {
    const e = await expectError(() => resale({ nftId, seller: 'bob', buyer: 'alice', priceXrp: 15 }),
      (err) => err.status === 409 && /ne détient pas/.test(err.message), 'revente billet brûlé');
    record('9 revente billet brûlé', [], `refusé : ${e.message}`);
    const t = await query.ticket(nftId);
    assert(t.burned === true && t.owner === null, `statut on-chain burned=${t.burned} owner=${t.owner}`);
  });
  ok = true;
} catch (e) {
  errMsg = e.message;
  console.error(`\n✘ ÉCHEC : ${e.code ? `[${e.code}] ` : ''}${e.message}${e.hash ? ` (hash ${e.hash})` : ''}`);
  if (!(e instanceof AssertionFailed) && !e.code) console.error(e.stack);
} finally {
  writeReport(ok, errMsg);
  console.log('\nÉtape                  | Hash        | Résultat                 | Lien');
  console.log('-'.repeat(110));
  for (const r of rows) console.log(`${r.label.padEnd(22)} | ${short(r.hash).padEnd(11)} | ${r.result.slice(0, 24).padEnd(24)} | ${r.explorer}`);
  console.log(`\n${ok ? '✔ SCÉNARIO COMPLET OK' : '✘ SCÉNARIO EN ÉCHEC'} — rapport : demo/last-run.md`);
  rl?.close();
  await disconnect();
  process.exit(ok ? 0 : 1);
}
