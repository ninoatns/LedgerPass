// Client HTTP de l'API LedgerPass (routes décrites dans le README, § 3).
// Mode MOCK : activé UNIQUEMENT par ?mock=1 (jamais de bascule silencieuse : si /api/health échoue,
// init() lève et la page affiche un écran d'erreur bloquant). Le mock reprend les formes du contrat.

const BASE = '/api';
const EXPLORER = 'https://testnet.xrpl.org';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'HTTP', hash = null, body = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.hash = hash;
    this.body = body;
  }
}

const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const mockReason = MOCK ? 'forcé par ?mock=1' : '';

export const isMock = () => MOCK;
export const mockWhy = () => mockReason;

/* ------------------------------------------------------------------ */
/* Transport réel                                                      */
/* ------------------------------------------------------------------ */

async function http(method, path, { body, headers = {}, timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(
      e.name === 'AbortError' ? 'Délai dépassé : le backend ne répond pas.' : 'Backend injoignable (vérifiez que le serveur tourne sur le port 3000).',
      { code: 'NETWORK' },
    );
  } finally {
    clearTimeout(t);
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    throw new ApiError((data && (data.error || data.reason)) || `Erreur HTTP ${res.status}`, {
      status: res.status,
      code: (data && data.code) || `HTTP ${res.status}`,
      hash: data && data.hash,
      body: data,
    });
  }
  return data;
}

/**
 * Vérifie le backend. Lève ApiError si /api/health échoue (la page affiche alors un écran bloquant).
 * /health répond tout de suite ; si XRPL est en (re)connexion (network null), on réessaie ~20 s.
 */
export async function init() {
  if (MOCK) return mock.health();
  let hl = await http('GET', '/health', { timeoutMs: 8000 });
  for (let i = 0; i < 10 && hl && hl.status !== 'connected'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    hl = await http('GET', '/health', { timeoutMs: 8000 });
  }
  return hl;
}

const call = (name, real) => (...args) => (MOCK ? mock[name](...args) : real(...args));

export const api = {
  health: call('health', () => http('GET', '/health')),
  events: call('events', () => http('GET', '/events')),
  balances: call('balances', () => http('GET', '/balances')),
  mint: call('mint', (eventId, count, token) =>
    http('POST', '/admin/mint', { body: { eventId, count }, headers: { 'X-Admin-Token': token } })),
  buy: call('buy', (nftId, buyer) => http('POST', '/primary/buy', { body: { nftId, buyer } })),
  walletTickets: call('walletTickets', (who) => http('GET', `/wallets/${encodeURIComponent(who)}/tickets`)),
  ticket: call('ticket', (nftId) => http('GET', `/tickets/${encodeURIComponent(nftId)}`)),
  ticketQr: call('ticketQr', (who, nftId) =>
    http('GET', `/wallets/${encodeURIComponent(who)}/tickets/${encodeURIComponent(nftId)}/qr`, { timeoutMs: 20000 })),
  // 4 transactions validées en série (+ reconnexions éventuelles) : délai large.
  resale: call('resale', (nftId, seller, buyer, priceXrp) =>
    http('POST', '/resale', { body: { nftId, seller, buyer, priceXrp }, timeoutMs: 300000 })),
  resaleDirect: call('resaleDirect', (nftId, seller, buyer, priceXrp) =>
    http('POST', '/resale/direct', { body: { nftId, seller, buyer, priceXrp } })),
  // qr = contenu du QR { nftId, holder, ts, pubKey, sig } ; eventId = événement contrôlé (défaut 1).
  checkin: call('checkin', (qr, token, eventId = 1) =>
    http('POST', '/gate/checkin', { body: { ...qr, eventId }, headers: { 'X-Gate-Token': token } })),
  txLog: call('txLog', () => http('GET', '/tx')),
};

/* ------------------------------------------------------------------ */
/* Mock : état en localStorage (partagé entre index.html et scan.html) */
/* ------------------------------------------------------------------ */

const STORE_KEY = 'ledgerpass.mock.v2';
const TX_DELAY = 650; // ms par transaction simulée (≈ 3-5 s en réel)

// Adresses fictives (format r..., aucune n'est une vraie adresse connue).
const ACCOUNTS = {
  org: 'rLPorgDEMoXq7nT3kV9wYbC2fHsJ4mPa1Z',
  alice: 'rLPa1iceDEMo5uR8sK2xNqW7eGtHvB3cMd',
  bob: 'rLPbobDEMo9pL4jF6yTzQ1aXcVnE8hUkWs',
};

// Aligné sur data/db.sample.json (catalogue réel).
const EVENTS = [
  { id: 1, name: 'XRPL Night Live — Démo LedgerPass', date: '2026-12-12T20:00:00+01:00', venue: 'Salle fictive, Paris', priceXrp: 10, capXrp: 25, commissionPct: 5 },
];
const MAX_MINT = 10;
const QR_MAX_AGE_S = 60;

const FEE = 0.000012;

function hex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function freshState() {
  return {
    ledger: 4200000 + Math.floor(Math.random() * 90000),
    balances: { org: 99.99, alice: 100, bob: 100 },
    tickets: {}, // nftId -> { nftId, eventId, seat, owner(who)|null, burned, history: Tx[] }
    seatCounter: {},
    tx: [],
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.tickets) return s;
  } catch { /* stockage indisponible */ }
  return freshState();
}
let memState = null;
function state() {
  if (!memState) memState = load();
  // relire à chaque appel pour partager avec l'autre page
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.tickets) memState = s;
  } catch { /* ignore */ }
  return memState;
}
function save(s) {
  memState = s;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function resetMock() {
  memState = freshState();
  save(memState);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => (Math.round(n * 1e6) / 1e6).toString();

async function mkTx(s, step, payer, result = 'tesSUCCESS') {
  await sleep(TX_DELAY);
  const hash = hex(32);
  s.ledger += 1 + Math.floor(Math.random() * 2);
  if (payer) s.balances[payer] -= FEE;
  const tx = { step, hash, result, explorer: `${EXPLORER}/transactions/${hash}` };
  s.tx.unshift(tx);
  return tx;
}

function eventById(id) {
  const ev = EVENTS.find((e) => String(e.id) === String(id));
  if (!ev) throw new ApiError('Événement inconnu', { status: 404, code: 'HTTP 404' });
  return ev;
}

function err(status, code, message, extra = {}) {
  return new ApiError(message, { status, code, body: { error: message, code, ...extra }, hash: extra.hash });
}

function checkWho(w) {
  if (!ACCOUNTS[w]) throw err(400, 'HTTP 400', `Acteur inconnu : ${w}`);
}

function ticketView(t) {
  return {
    nftId: t.nftId,
    eventId: t.eventId,
    seat: t.seat,
    flags: 1,
    uri: `/metadata/evt-${t.eventId}/${t.seat}.json`,
    explorer: `${EXPLORER}/nft/${t.nftId}`,
  };
}

const mock = {
  async health() {
    const s = state();
    return { network: 'wss://testnet.xrpl-labs.com (simulé)', status: 'connected', ledgerIndex: s.ledger, accounts: { ...ACCOUNTS } };
  },
  async events() {
    await sleep(120);
    return EVENTS.map((e) => ({ ...e }));
  },
  async balances() {
    await sleep(150);
    const s = state();
    return Object.fromEntries(Object.entries(s.balances).map(([k, v]) => [k, fmt(v)]));
  },
  async mint(eventId, count, token) {
    if (!token) throw err(401, 'HTTP 401', 'Jeton admin manquant ou invalide');
    const ev = eventById(eventId);
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_MINT) throw err(400, 'HTTP 400', `count doit être un entier entre 1 et ${MAX_MINT}`);
    const s = state();
    const tickets = [];
    const txs = [];
    for (let i = 0; i < n; i++) {
      s.seatCounter[ev.id] = (s.seatCounter[ev.id] || 0) + 1;
      const seat = 'A-' + String(s.seatCounter[ev.id]).padStart(3, '0');
      // NFTokenID : Flags(0001) TransferFee(0000) Issuer(20o) Taxon(4o) Seq(4o)
      const nftId = '00010000' + hex(20) + '0000000' + ev.id + hex(4);
      const tx = await mkTx(s, `mint:${seat}`, 'org');
      const t = { nftId, eventId: ev.id, seat, owner: 'org', burned: false, history: [tx] };
      s.tickets[nftId] = t;
      tickets.push({ nftId, seat, uri: `/metadata/evt-${ev.id}/${seat}.json`, metaSha256: hex(32).toLowerCase() });
      txs.push(tx);
      save(s);
    }
    return { tickets, txs };
  },
  async buy(nftId, buyer) {
    checkWho(buyer);
    if (buyer === 'org') throw err(400, 'HTTP 400', "L'organisateur ne peut pas s'acheter un billet");
    const s = state();
    const t = s.tickets[nftId];
    if (!t || t.burned || t.owner !== 'org') throw err(409, 'HTTP', "billet non disponible à la vente primaire (l'organisateur ne le détient pas)");
    const price = Number(eventById(t.eventId).priceXrp);
    if (s.balances[buyer] < price + 1) throw err(400, 'tecUNFUNDED_OFFER', 'Solde insuffisant');
    const txs = [];
    txs.push(await mkTx(s, 'primary:sell-offer', 'org'));
    save(s);
    txs.push(await mkTx(s, 'primary:accept', buyer));
    s.balances[buyer] -= price;
    s.balances.org += price;
    t.owner = buyer;
    t.history.push(...txs);
    save(s);
    return { nftId, owner: ACCOUNTS[buyer], txs };
  },
  async walletTickets(who) {
    checkWho(who);
    await sleep(200);
    const s = state();
    return Object.values(s.tickets).filter((t) => !t.burned && t.owner === who).map(ticketView);
  },
  async ticket(nftId) {
    await sleep(150);
    const s = state();
    const t = s.tickets[nftId];
    if (!t) throw err(404, 'HTTP', 'billet introuvable : aucun détenteur connu, aucun burn, inconnu de LedgerPass');
    return { nftId, eventId: t.eventId, seat: t.seat, owner: t.owner ? ACCOUNTS[t.owner] : null, burned: t.burned, history: t.history };
  },
  async resale(nftId, seller, buyer, priceXrp) {
    checkWho(seller); checkWho(buyer);
    if (seller === buyer) throw err(400, 'HTTP 400', 'Vendeur et acheteur identiques');
    const s = state();
    const t = s.tickets[nftId];
    const price = Number(priceXrp);
    if (!(price >= 1)) throw err(400, 'HTTP', 'prix minimum de revente : 1 XRP');
    if (!t || t.burned || t.owner !== seller) throw err(409, 'HTTP', `${seller} ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu)`);
    const ev = eventById(t.eventId);
    if (price > Number(ev.capXrp)) throw err(400, 'HTTP', `prix ${price} XRP supérieur au plafond ${ev.capXrp} XRP`);
    const toSeller = price * (1 - ev.commissionPct / 100);
    const txs = [];
    txs.push(await mkTx(s, 'resale:org-buy-offer', 'org')); save(s);
    txs.push(await mkTx(s, 'resale:seller-accept', seller));
    s.balances.org -= toSeller; s.balances[seller] += toSeller; t.owner = 'org'; save(s);
    txs.push(await mkTx(s, 'resale:org-sell-offer', 'org')); save(s);
    txs.push(await mkTx(s, 'resale:buyer-accept', buyer));
    s.balances[buyer] -= price; s.balances.org += price; t.owner = buyer;
    t.history.push(...txs);
    save(s);
    return { nftId, owner: ACCOUNTS[buyer], sellerReceivedXrp: fmt(toSeller), orgCommissionXrp: fmt(price - toSeller), txs };
  },
  async resaleDirect(nftId, seller) {
    checkWho(seller);
    await sleep(TX_DELAY);
    const s = state();
    // Le protocole rejette l'offre AVANT inclusion dans un ledger (tef = pas de hash validé).
    const hash = hex(32);
    throw err(409, 'tefNFTOKEN_IS_NOT_TRANSFERABLE', 'revente directe refusée par le protocole XRPL (tefNFTOKEN_IS_NOT_TRANSFERABLE)',
      { ledgerIndex: s.ledger, txs: [{ step: 'direct:seller-sell-offer', hash, result: 'tefNFTOKEN_IS_NOT_TRANSFERABLE', explorer: `${EXPLORER}/transactions/${hash}` }] });
  },
  // QR « signé » simulé : mêmes champs que le réel ; la signature n'est vérifiée que par le vrai backend.
  async ticketQr(who, nftId) {
    checkWho(who);
    await sleep(80);
    const t = state().tickets[nftId];
    if (!t || t.burned || t.owner !== who) throw err(404, 'HTTP', `${who} ne détient pas ce billet (account_nfts)`);
    return { nftId, holder: ACCOUNTS[who], ts: Date.now(), pubKey: 'ED' + 'MOCK'.repeat(16), sig: 'MOCK' + hex(30), maxAgeSeconds: QR_MAX_AGE_S };
  },
  async checkin(qr, token, eventId = 1) {
    if (!token) throw err(401, 'HTTP', 'X-Gate-Token manquant ou invalide');
    await sleep(200);
    const s = state();
    const { nftId, holder, ts, sig, pubKey } = qr || {};
    const refuse = (reason) => err(409, 'HTTP', reason, { granted: false, reason });
    if (!sig || !pubKey || !ts) throw refuse('QR non signé : régénérez le QR depuis « Mes billets »');
    if (!String(sig).startsWith('MOCK')) throw refuse('QR forgé : signature invalide');
    if (holder === ACCOUNTS.org) throw refuse('porteur = organisateur : billet invendu, il ne donne pas accès');
    const t = s.tickets[nftId];
    if (t && t.burned) throw refuse('billet déjà utilisé (brûlé)');
    if (!t || !t.owner || ACCOUNTS[t.owner] !== holder) throw refuse('le porteur ne détient pas ce billet (mauvais détenteur ou billet inexistant)');
    const age = Math.round((Date.now() - Number(ts)) / 1000);
    if (Math.abs(age) > QR_MAX_AGE_S) throw refuse(`QR expiré (${age} s, validité ${QR_MAX_AGE_S} s) : le porteur doit afficher le QR à jour`);
    if (Number(t.eventId) !== Number(eventId)) throw refuse(`billet de l'événement ${t.eventId}, contrôle de l'événement ${eventId}`);
    const tx = await mkTx(s, 'gate:checkin-burn', 'org');
    t.burned = true; t.owner = null; t.history.push(tx);
    save(s);
    return { granted: true, tx };
  },
  async txLog() {
    await sleep(120);
    return state().tx.slice();
  },
};
