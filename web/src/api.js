// Client du contrat d'API LedgerPass (docs/api-contract.md, FIGÉ).
// Mode MOCK : activé par ?mock=1 ou automatiquement si /api/health échoue.
// Le mock simule les mêmes réponses (formes identiques au contrat) pour démontrer l'UI sans backend.

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
let MOCK = params.get('mock') === '1';
let mockReason = MOCK ? 'forcé par ?mock=1' : '';

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

/** Détecte le backend ; bascule en mock s'il est absent. */
export async function init() {
  if (MOCK) return mock.health();
  try {
    return await http('GET', '/health', { timeoutMs: 20000 }); // 1re connexion XRPL (fallback) peut prendre > 10 s
  } catch (e) {
    MOCK = true;
    mockReason = 'backend injoignable (' + e.message + ')';
    return mock.health();
  }
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
  resale: call('resale', (nftId, seller, buyer, priceXrp) =>
    http('POST', '/resale', { body: { nftId, seller, buyer, priceXrp } })),
  resaleDirect: call('resaleDirect', (nftId, seller, buyer, priceXrp) =>
    http('POST', '/resale/direct', { body: { nftId, seller, buyer, priceXrp } })),
  checkin: call('checkin', (nftId, holder, token) =>
    http('POST', '/gate/checkin', { body: { nftId, holder }, headers: { 'X-Gate-Token': token } })),
  txLog: call('txLog', () => http('GET', '/tx')),
};

/* ------------------------------------------------------------------ */
/* Mock : état en localStorage (partagé entre index.html et scan.html) */
/* ------------------------------------------------------------------ */

const STORE_KEY = 'ledgerpass.mock.v1';
const TX_DELAY = 650; // ms par transaction simulée (≈ 3-5 s en réel)

// Adresses fictives (format r..., aucune n'est une vraie adresse connue).
const ACCOUNTS = {
  org: 'rLPorgDEMoXq7nT3kV9wYbC2fHsJ4mPa1Z',
  alice: 'rLPa1iceDEMo5uR8sK2xNqW7eGtHvB3cMd',
  bob: 'rLPbobDEMo9pL4jF6yTzQ1aXcVnE8hUkWs',
};

const EVENTS = [
  { id: '1', name: 'Nuit XRPL — Concert de clôture', date: '2026-12-12T20:30:00+01:00', venue: 'Salle Polyvalente (fictive), Paris', priceXrp: '10', capXrp: '12', commissionPct: 5 },
  { id: '2', name: 'Gala CReATE 2026', date: '2027-01-22T19:00:00+01:00', venue: 'Auditorium Campus (fictif)', priceXrp: '15', capXrp: '18', commissionPct: 5 },
];

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
    return { network: 'wss://s.altnet.rippletest.net:51233 (simulé)', ledgerIndex: s.ledger, accounts: { ...ACCOUNTS } };
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
    if (!Number.isInteger(n) || n < 1 || n > 20) throw err(400, 'HTTP 400', 'count doit être un entier entre 1 et 20');
    const s = state();
    const tickets = [];
    const txs = [];
    for (let i = 0; i < n; i++) {
      s.seatCounter[ev.id] = (s.seatCounter[ev.id] || 0) + 1;
      const seat = 'A-' + String(s.seatCounter[ev.id]).padStart(2, '0');
      // NFTokenID : Flags(0001) TransferFee(0000) Issuer(20o) Taxon(4o) Seq(4o)
      const nftId = '00010000' + hex(20) + '0000000' + ev.id + hex(4);
      const tx = await mkTx(s, `NFTokenMint ${seat} (tfBurnable, non transférable)`, 'org');
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
    if (!t || t.burned) throw err(404, 'HTTP 404', 'Billet introuvable');
    if (t.owner !== 'org') throw err(409, 'tecNO_PERMISSION', 'Billet déjà vendu');
    const price = Number(eventById(t.eventId).priceXrp);
    if (s.balances[buyer] < price + 1) throw err(400, 'tecUNFUNDED_OFFER', 'Solde insuffisant');
    const txs = [];
    txs.push(await mkTx(s, `NFTokenCreateOffer — org vend ${price} XRP, Destination=${buyer}`, 'org'));
    save(s);
    txs.push(await mkTx(s, `NFTokenAcceptOffer — ${buyer} accepte`, buyer));
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
    if (!t) throw err(404, 'HTTP 404', 'Billet introuvable');
    return { nftId, eventId: t.eventId, seat: t.seat, owner: t.owner ? ACCOUNTS[t.owner] : null, burned: t.burned, history: t.history };
  },
  async resale(nftId, seller, buyer, priceXrp) {
    checkWho(seller); checkWho(buyer);
    if (seller === buyer) throw err(400, 'HTTP 400', 'Vendeur et acheteur identiques');
    const s = state();
    const t = s.tickets[nftId];
    if (!t || t.burned) throw err(404, 'HTTP 404', 'Billet introuvable');
    if (t.owner !== seller) throw err(409, 'tecNO_PERMISSION', `Le billet n'appartient pas à ${seller}`);
    const ev = eventById(t.eventId);
    const price = Number(priceXrp);
    if (!(price > 0)) throw err(400, 'HTTP 400', 'Prix invalide');
    if (price > Number(ev.capXrp)) throw err(400, 'HTTP 400', `Prix ${price} XRP > plafond ${ev.capXrp} XRP fixé par l'organisateur`);
    const toSeller = price * (1 - ev.commissionPct / 100);
    const txs = [];
    txs.push(await mkTx(s, `NFTokenCreateOffer — org rachète ${fmt(toSeller)} XRP (Owner=${seller})`, 'org')); save(s);
    txs.push(await mkTx(s, `NFTokenAcceptOffer — ${seller} accepte le rachat`, seller));
    s.balances.org -= toSeller; s.balances[seller] += toSeller; t.owner = 'org'; save(s);
    txs.push(await mkTx(s, `NFTokenCreateOffer — org revend ${fmt(price)} XRP, Destination=${buyer}`, 'org')); save(s);
    txs.push(await mkTx(s, `NFTokenAcceptOffer — ${buyer} accepte`, buyer));
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
    throw err(409, 'tefNFTOKEN_IS_NOT_TRANSFERABLE',
      `NFTokenCreateOffer signée par ${seller} rejetée : billet émis sans tfTransferable, seul l'émetteur peut créer une offre.`,
      { ledgerIndex: s.ledger });
  },
  async checkin(nftId, holder, token) {
    if (!token) throw err(401, 'HTTP 401', 'Jeton de contrôle manquant ou invalide');
    await sleep(200);
    const s = state();
    const t = s.tickets[nftId];
    const refuse = (reason) => err(409, 'HTTP 409', reason, { granted: false, reason });
    if (!t) throw refuse('Billet inconnu : aucun NFT LedgerPass avec cet identifiant');
    if (t.burned) throw refuse('Billet déjà utilisé (NFT brûlé à l\'entrée)');
    if (!t.owner || ACCOUNTS[t.owner] !== holder) throw refuse('Le porteur présenté ne détient pas ce billet on-chain');
    const tx = await mkTx(s, `NFTokenBurn — check-in ${t.seat} (Memo ledgerpass/checkin)`, 'org');
    t.burned = true; t.owner = null; t.history.push(tx);
    save(s);
    return { granted: true, tx };
  },
  async txLog() {
    await sleep(120);
    return state().tx.slice();
  },
};
