// Application principale (index.html) : Organisateur / Boutique / Mes billets / Journal.
import QRCode from 'qrcode';
import { api, init, isMock, resetMock } from './api.js';
import {
  $, $$, h, short, fmtXrp, fmtDate, timeline, errorBox, busy, toast, renderStatus,
  txLink, resultClass, sessionGet, sessionSet, stepLabel, fatalScreen,
} from './ui.js';

const MAX_MINT = 10; // = MAX_MINT_PER_CALL du backend
const QR_REFRESH_MS = 30000; // le QR signé vaut 60 s côté contrôle : régénéré toutes les 30 s
const QR_RETRY_MS = 5000; // nouvel essai rapide après un échec passager de régénération
const qrTimers = new Map(); // nftId -> minuteurs du QR de CETTE carte (nettoyés au rendu ou à la revente)

function stopQr(nftId) {
  (qrTimers.get(nftId) || []).forEach((id) => { clearInterval(id); clearTimeout(id); });
  qrTimers.delete(nftId);
}
const stopAllQr = () => [...qrTimers.keys()].forEach(stopQr);

const NAMES = { org: 'Organisateur', alice: 'Alice', bob: 'Bob' };
const S = {
  health: null,
  events: [],
  actor: sessionGet('lp.actor') || 'alice',
  minted: [],
  lastBalances: null,
};

const eventOf = (id) => S.events.find((e) => String(e.id) === String(id));
const addr = (who) => (S.health && S.health.accounts && S.health.accounts[who]) || '';

/* ------------------------------ Démarrage ------------------------------ */

async function boot() {
  try {
    S.health = await init();
  } catch (e) {
    $('#status').replaceChildren(errorBox(e));
    fatalScreen(e); // bloquant : pas de bascule silencieuse vers les données simulées
    return;
  }
  renderStatus($('#status'), S.health);
  if (isMock()) {
    $('#scan-link').href = './scan.html?mock=1';
    $('#status').append(h('button.btn.ghost.small', { onclick: () => { resetMock(); location.reload(); } }, 'Réinitialiser la démo simulée'));
  }
  try {
    S.events = await api.events();
  } catch (e) {
    $('#event-info').replaceChildren(errorBox(e));
  }
  api.balances().then((b) => { S.lastBalances = S.lastBalances || b; }).catch(() => {});
  setupActor();
  setupOrg();
  setupTabs();
  setInterval(refreshLedger, 10000);
}

async function refreshLedger() {
  try {
    const hl = await api.health();
    const n = $('#ledger-idx');
    if (n) n.textContent = hl.ledgerIndex ?? '?';
    if (hl.network !== S.health.network) {
      S.health = { ...S.health, ...hl };
      renderStatus($('#status'), S.health);
    }
  } catch { /* silencieux */ }
}

/* ------------------------------ Acteur ------------------------------ */

function setupActor() {
  $$('.actor').forEach((b) => b.addEventListener('click', () => {
    S.actor = b.dataset.who;
    sessionSet('lp.actor', S.actor);
    paintActor();
    renderCurrentTab();
  }));
  paintActor();
}

function paintActor() {
  $$('.actor').forEach((b) => {
    const on = b.dataset.who === S.actor;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.title = addr(b.dataset.who);
  });
}

/* ------------------------------ Onglets ------------------------------ */

const TABS = ['org', 'shop', 'mine', 'log'];
const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'org');

function setupTabs() {
  window.addEventListener('hashchange', renderCurrentTab);
  renderCurrentTab();
}

function renderCurrentTab() {
  const t = currentTab();
  TABS.forEach((id) => {
    $(`#tab-${id}`).hidden = id !== t;
    const a = $(`.tabs a[data-tab="${id}"]`);
    a.classList.toggle('on', id === t);
    a.setAttribute('aria-selected', id === t);
  });
  ({ org: renderOrgStock, shop: renderShop, mine: renderMine, log: renderLog })[t]();
}

/* ------------------------------ 1. Organisateur ------------------------------ */

function setupOrg() {
  const sel = $('#event-select');
  sel.replaceChildren(...S.events.map((e) => h('option', { value: e.id }, `${e.name} — ${fmtDate(e.date)}`)));
  sel.addEventListener('change', paintEventInfo);
  paintEventInfo();

  const tok = $('#admin-token');
  tok.value = tok.value || sessionGet('lp.adminToken');
  if (isMock() && !tok.value) tok.value = 'demo';
  tok.addEventListener('change', () => sessionSet('lp.adminToken', tok.value));

  $('#mint-btn').addEventListener('click', onMint);
  $('#org-refresh').addEventListener('click', renderOrgStock);
  $('#lookup-btn').addEventListener('click', onLookup);
}

function paintEventInfo() {
  const e = eventOf($('#event-select').value);
  if (!e) { $('#event-info').textContent = 'Aucun événement.'; return; }
  $('#event-info').replaceChildren(
    h('div.kv', {}, h('span', {}, 'Lieu'), h('b', {}, e.venue)),
    h('div.kv', {}, h('span', {}, 'Prix'), h('b', {}, fmtXrp(e.priceXrp))),
    h('div.kv', {}, h('span', {}, 'Plafond revente'), h('b', {}, fmtXrp(e.capXrp))),
    h('div.kv', {}, h('span', {}, 'Commission'), h('b', {}, `${e.commissionPct} %`)),
  );
}

async function onMint(ev) {
  const eventId = $('#event-select').value;
  const count = Number($('#mint-count').value);
  const token = $('#admin-token').value.trim();
  sessionSet('lp.adminToken', token);
  if (!token) { toast('Saisissez le jeton admin', 'ko'); $('#admin-token').focus(); return; }
  if (!Number.isInteger(count) || count < 1 || count > MAX_MINT) { toast(`Nombre de billets : 1 à ${MAX_MINT}`, 'ko'); return; }
  const tl = timeline($('#mint-tl'), `Mint de ${count} billet(s)`, Array.from({ length: count }, (_, i) => `NFTokenMint #${i + 1}`));
  await busy(ev.currentTarget, async () => {
    try {
      const r = await api.mint(eventId, count, token);
      S.minted.unshift(...r.tickets.map((t) => ({ ...t, eventId })));
      tl.done(r.txs, `${r.tickets.length} billet(s) émis par l'organisateur.`);
      paintMinted();
      renderOrgStock();
    } catch (e) { tl.fail(e); }
  });
}

function paintMinted() {
  const box = $('#minted-list');
  if (!S.minted.length) { box.textContent = 'Aucun pour l\'instant.'; return; }
  box.classList.remove('muted');
  box.replaceChildren(h('table.tbl', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Place'), h('th', {}, 'NFTokenID'), h('th', {}, 'Métadonnées'), h('th', {}, 'SHA-256 (Memo)'))),
    h('tbody', {}, S.minted.map((t) => h('tr', {},
      h('td', {}, h('b', {}, t.seat)),
      h('td', {}, h('a.mono', { href: `https://testnet.xrpl.org/nft/${t.nftId}`, target: '_blank', rel: 'noopener', title: t.nftId }, short(t.nftId, 10, 6), ' ↗')),
      h('td', {}, t.uri ? h('a', { href: t.uri, target: '_blank', rel: 'noopener' }, 'JSON') : '–'),
      h('td.mono.muted', { title: t.metaSha256 }, short(t.metaSha256, 8, 4)))))));
}

async function renderOrgStock() {
  const box = $('#org-stock');
  box.replaceChildren(h('p.muted', {}, 'Lecture de account_nfts…'));
  try {
    const list = await api.walletTickets('org');
    if (!list.length) { box.replaceChildren(h('p.muted', {}, 'Aucun billet en stock : mintez-en à gauche.')); return; }
    box.replaceChildren(h('p', {}, h('b.big', {}, list.length), ' billet(s) détenus par l\'organisateur'),
      h('div.chips', {}, list.map((t) => h('span.chip', { title: t.nftId }, `${eventOf(t.eventId)?.name ? 'Évt ' + t.eventId : ''} · ${t.seat}`))));
  } catch (e) { box.replaceChildren(errorBox(e)); }
}

async function onLookup(ev) {
  const id = $('#lookup-id').value.trim();
  if (!id) return;
  const box = $('#lookup-res');
  await busy(ev.currentTarget, async () => {
    try {
      if (!/^[0-9A-Fa-f]{64}$/.test(id)) throw new Error('NFTokenID invalide (64 caractères hexadécimaux attendus)');
      const t = await api.ticket(id);
      box.replaceChildren(h('div.lookup', {},
        h('div.kv', {}, h('span', {}, 'Place'), h('b', {}, t.seat)),
        h('div.kv', {}, h('span', {}, 'Statut'), t.burned ? h('b.ko', {}, 'Brûlé (utilisé)') : h('b.ok', {}, 'Valide')),
        h('div.kv', {}, h('span', {}, 'Détenteur'), h('b.mono', {}, t.owner ? `${whoOf(t.owner)} (${short(t.owner)})` : '—')),
        h('ol.tl.compact', {}, (t.history || []).map((tx) => h('li.step', {}, h('span.dot.' + resultClass(tx.result)), h('span.label', {}, stepLabel(tx.step)), txLink(tx))))));
    } catch (e) {
      box.replaceChildren(e.status === 404
        ? h('div.lookup', {}, h('div.kv', {}, h('span', {}, 'Statut'), h('b.ko', {}, 'Introuvable')),
          h('p.muted.small', {}, 'Aucun détenteur on-chain, aucun burn, et billet inconnu de LedgerPass.'))
        : errorBox(e));
    }
  });
}

function whoOf(address) {
  const e = Object.entries(S.health.accounts || {}).find(([, a]) => a === address);
  return e ? NAMES[e[0]] : 'inconnu';
}

/* ------------------------------ 2. Boutique ------------------------------ */

async function renderShop() {
  const list = $('#shop-list');
  const buyer = S.actor;
  $('#shop-hint').replaceChildren(buyer === 'org'
    ? h('span.warn', {}, 'Choisissez Alice ou Bob en haut à droite pour acheter.')
    : h('span', {}, 'Achat en tant que ', h('b', {}, NAMES[buyer]), ' — 2 transactions : offre de vente de l\'organisateur (Destination = acheteur), puis acceptation.'));
  list.replaceChildren(h('p.muted', {}, 'Chargement…'));
  try {
    const tickets = await api.walletTickets('org');
    if (!tickets.length) { list.replaceChildren(h('p.empty', {}, 'Aucun billet en vente. L\'organisateur doit d\'abord en minter (onglet 1).')); return; }
    list.replaceChildren(...tickets.map((t) => {
      const e = eventOf(t.eventId) || {};
      return h('article.ticket', {},
        h('div.ticket-top', {}, h('span.seat', {}, t.seat), h('span.price', {}, fmtXrp(e.priceXrp))),
        h('h3', {}, e.name || `Événement ${t.eventId}`),
        h('p.muted', {}, fmtDate(e.date), h('br'), e.venue || ''),
        h('p.mono.small', { title: t.nftId }, short(t.nftId, 12, 6)),
        h('button.btn.primary', { disabled: buyer === 'org', onclick: (ev) => onBuy(ev, t) },
          buyer === 'org' ? 'Acheter (choisir Alice/Bob)' : `Acheter en tant que ${NAMES[buyer]}`));
    }));
  } catch (e) { list.replaceChildren(errorBox(e)); }
}

async function onBuy(ev, t) {
  const buyer = S.actor;
  const tl = timeline($('#buy-tl'), `Achat ${t.seat} par ${NAMES[buyer]}`, ['NFTokenCreateOffer (org → ' + NAMES[buyer] + ')', 'NFTokenAcceptOffer (' + NAMES[buyer] + ')']);
  $('#buy-tl').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $$('#shop-list button').forEach((b) => { b.disabled = true; });
  await busy(ev.currentTarget, async () => {
    try {
      const r = await api.buy(t.nftId, buyer);
      tl.done(r.txs, h('span', {}, `Billet ${t.seat} détenu par ${NAMES[buyer]}. `, h('a', { href: '#mine' }, 'Voir « Mes billets » →')));
      toast(`${NAMES[buyer]} a acheté ${t.seat}`, 'ok');
    } catch (e) { tl.fail(e); }
  });
  renderShop();
}

/* ------------------------------ 3. Mes billets ------------------------------ */

async function renderMine() {
  const who = S.actor;
  const list = $('#mine-list');
  $('#mine-title').textContent = `Billets de ${NAMES[who]}`;
  stopAllQr();
  list.replaceChildren(h('p.muted', {}, 'Lecture de account_nfts…'));
  if (who === 'org') {
    list.replaceChildren(h('p.empty', {}, 'L\'organisateur détient le stock (onglet Organisateur). Choisissez Alice ou Bob en haut à droite.'));
    return;
  }
  try {
    const tickets = await api.walletTickets(who);
    if (!tickets.length) { list.replaceChildren(h('p.empty', {}, `${NAMES[who]} n'a aucun billet. Achetez-en un dans la Boutique.`)); return; }
    list.replaceChildren(...tickets.map((t) => myTicketCard(t, who)));
  } catch (e) { list.replaceChildren(errorBox(e)); }
}

function myTicketCard(t, who) {
  const e = eventOf(t.eventId) || {};
  const img = h('img.qr', { alt: `QR code du billet ${t.seat}`, width: 220, height: 220 });
  const payloadNode = h('code.qrpayload', {}, '…');
  const timerNode = h('p.qr-timer.small.muted', {}, 'Génération du QR signé…');
  let payload = '';
  let expiresAt = 0;
  let qrError = ''; // dernier échec de régénération (affiché tant qu'aucun QR plus récent n'a été obtenu)
  const timers = [];
  qrTimers.set(t.nftId, timers);
  const valid = () => expiresAt > Date.now();
  const dropImage = () => { img.removeAttribute('src'); img.alt = 'QR indisponible'; payload = ''; payloadNode.textContent = '…'; };
  const tick = () => {
    const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    if (expiresAt && left > 0) {
      const next = Math.max(0, Math.round((expiresAt - 30000 - Date.now()) / 1000));
      timerNode.textContent = qrError
        ? `QR signé valable encore ${left} s · renouvellement échoué (${qrError}), nouvel essai…`
        : `QR signé valable encore ${left} s · renouvelé dans ${next} s`;
    } else if (qrError) {
      if (img.getAttribute('src')) dropImage(); // un QR expiré ne doit plus être présenté
      timerNode.textContent = `QR indisponible : ${qrError}`;
    } else if (expiresAt) {
      if (img.getAttribute('src')) dropImage();
      timerNode.textContent = 'QR expiré : rafraîchissement…';
    }
  };
  const active = () => qrTimers.get(t.nftId) === timers; // faux après revente ou nouveau rendu
  const refreshQr = async () => {
    if (!active()) return;
    if (!img.isConnected && payload) { stopQr(t.nftId); return; } // carte retirée du DOM
    try {
      const qr = await api.ticketQr(who, t.nftId); // signé par le backend pour le détenteur (custodial)
      const { maxAgeSeconds = 60, ...content } = qr;
      const nextPayload = JSON.stringify(content);
      const dataUrl = await QRCode.toDataURL(nextPayload, { width: 440, margin: 1, errorCorrectionLevel: 'M' });
      if (!active()) return; // billet revendu pendant la requête : ne pas réafficher de QR
      img.src = dataUrl;
      img.alt = `QR code du billet ${t.seat}`;
      payload = nextPayload;
      expiresAt = Number(qr.ts) + maxAgeSeconds * 1000;
      payloadNode.textContent = payload;
      qrError = '';
    } catch (e) {
      // Échec passager : on GARDE l'ancien QR tant qu'il est valable, et on réessaie vite.
      if (!active()) return;
      qrError = e.message || String(e);
      if (!valid()) dropImage();
      timers.push(setTimeout(refreshQr, QR_RETRY_MS));
    }
    tick();
  };
  refreshQr();
  timers.push(setInterval(refreshQr, QR_REFRESH_MS), setInterval(tick, 1000));

  const others = ['alice', 'bob'].filter((w) => w !== who);
  const price = h('input', { type: 'number', step: '0.1', min: '1', value: Number(e.priceXrp) || 10, 'aria-label': 'Prix de revente (XRP)' });
  const buyerSel = h('select', { 'aria-label': 'Acheteur' }, others.map((w) => h('option', { value: w }, NAMES[w])));
  const capWarn = h('p.capwarn', { hidden: true });
  const out = h('div.ticket-out');
  const checkCap = () => {
    const p = Number(price.value);
    const cap = Number(e.capXrp);
    const over = Number.isFinite(cap) && p > cap;
    capWarn.hidden = !over;
    capWarn.textContent = over ? `⚠ ${fmtXrp(p)} dépasse le plafond de ${fmtXrp(cap)} : LedgerPass refusera la revente.` : '';
  };
  price.addEventListener('input', checkCap);

  const resaleBtn = h('button.btn.primary', { onclick: (ev) => onResale(ev, t, who, buyerSel.value, price.value, out, e) }, 'Revendre via LedgerPass');
  const directBtn = h('button.btn.danger', { onclick: (ev) => onDirect(ev, t, who, buyerSel.value, price.value, out) }, 'Tenter une revente directe (hors plateforme)');

  return h('article.myticket', { dataset: { nft: t.nftId } },
    h('div.myticket-qr', {}, img, timerNode,
      h('details', {}, h('summary', {}, 'Contenu du QR (signé, 60 s)'), payloadNode,
        h('button.btn.ghost.small', { onclick: () => (payload && navigator.clipboard
          ? navigator.clipboard.writeText(payload).then(() => toast('Copié', 'ok'))
          : Promise.reject(new Error('presse-papiers indisponible'))).catch(() => toast('Copie impossible : sélectionnez le texte ci-dessus', 'ko')) }, 'Copier'))),
    h('div.myticket-body', {},
      h('div.ticket-top', {}, h('span.seat', {}, t.seat), h('span.muted', {}, `Plafond ${fmtXrp(e.capXrp)} · commission ${e.commissionPct ?? '?'} %`)),
      h('h3', {}, e.name || `Événement ${t.eventId}`),
      h('p.muted', {}, fmtDate(e.date), ' · ', e.venue || ''),
      h('p.small', {}, 'NFT : ', h('a.mono', { href: t.explorer, target: '_blank', rel: 'noopener', title: t.nftId }, short(t.nftId, 12, 6), ' ↗'),
        ' · Flags ', h('code', {}, t.flags), ' (tfBurnable seul)'),
      h('div.resale', {},
        h('label', {}, 'Prix (XRP)', price),
        h('label', {}, 'Acheteur', buyerSel),
        resaleBtn, directBtn),
      capWarn,
      out));
}

async function onResale(ev, t, seller, buyer, priceXrp, out, e) {
  const card = ev.currentTarget.closest('.myticket');
  const steps = [
    `Organisateur : offre de rachat (Owner = ${NAMES[seller]})`,
    `${NAMES[seller]} accepte le rachat`,
    `Organisateur : offre de vente (Destination = ${NAMES[buyer]})`,
    `${NAMES[buyer]} accepte`,
  ];
  const tl = timeline(out, `Revente ${t.seat} : ${NAMES[seller]} → ${NAMES[buyer]} à ${fmtXrp(priceXrp)}`, steps);
  card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  await busy(ev.currentTarget, async () => {
    try {
      const r = await api.resale(t.nftId, seller, buyer, Number(priceXrp));
      tl.done(r.txs, h('span', {}, `${NAMES[seller]} reçoit `, h('b', {}, fmtXrp(r.sellerReceivedXrp)), ' · commission organisateur ',
        h('b', {}, fmtXrp(r.orgCommissionXrp)), ` · nouveau détenteur : ${NAMES[buyer]}. `, h('a', { href: '#log' }, 'Voir les soldes →')));
      card.classList.add('sold');
      stopQr(t.nftId); // seuls les minuteurs de CETTE carte : les autres billets gardent leur QR à jour
      const qrImg = card.querySelector('img.qr');
      qrImg.removeAttribute('src');
      qrImg.alt = 'QR invalide : billet transféré';
      qrImg.style.visibility = 'hidden'; // pas d'icône d'image cassée sur une carte vendue
      card.querySelector('.qr-timer').textContent = '';
      card.querySelector('.myticket-qr').append(h('p.ko.small', {}, 'QR invalide : billet transféré'));
      card.querySelector('.resale').replaceChildren(h('p.ok.big', {}, `Revendu à ${NAMES[buyer]} ✓`));
    } catch (err) {
      tl.fail(err, err.status === 400 && Number(priceXrp) > Number(e.capXrp)
        ? h('p.hint', {}, 'Le plafond est appliqué par LedgerPass, seul acteur capable de créer une offre sur ce NFT.')
        : (err.code === 'NETWORK' || (err.body && err.body.stage)
          ? h('p.hint', {}, 'Revente non atomique (4 tx) : vérifiez le Journal (onglet 4) et « Mes billets » de chaque acteur avant de relancer.')
          : null));
      card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  });
}

async function onDirect(ev, t, seller, buyer, priceXrp, out) {
  const tl = timeline(out, `Revente directe ${NAMES[seller]} → ${NAMES[buyer]} (sans LedgerPass)`, [`NFTokenCreateOffer signée par ${NAMES[seller]}`]);
  await busy(ev.currentTarget, async () => {
    try {
      const r = await api.resaleDirect(t.nftId, seller, buyer, Number(priceXrp));
      tl.done(r.txs || [], h('span.warn', {}, 'Inattendu : le backend n\'a pas renvoyé de refus.'));
    } catch (err) {
      const isProto = err.code === 'tefNFTOKEN_IS_NOT_TRANSFERABLE';
      tl.fail(err, h('div.refusal', { role: 'alert' },
        h('div.refusal-title', {}, isProto ? '⛔ Refusé par le protocole XRPL' : '⛔ Revente directe refusée'),
        h('div.refusal-code', {}, err.code || ''),
        h('p.refusal-msg', {}, err.message),
        h('p', {}, 'Le billet a été minté sans ', h('code', {}, 'tfTransferable'), ' : seul l\'émetteur (l\'organisateur) peut créer une offre. ',
          'Le marché noir est bloqué par le ledger lui-même, pas par notre application.')), { hideError: isProto });
    }
  });
}

/* ------------------------------ 4. Journal ------------------------------ */

async function renderLog() {
  await Promise.all([renderBalances(), renderTx()]);
}

async function renderBalances() {
  const box = $('#balances');
  try {
    const b = await api.balances();
    const prev = S.lastBalances;
    box.replaceChildren(...['org', 'alice', 'bob'].map((w) => {
      const d = prev ? Number(b[w]) - Number(prev[w]) : 0;
      return h('div.bal', {},
        h('span.bal-who', {}, NAMES[w]),
        h('span.bal-val', {}, fmtXrp(b[w])),
        h('span.mono.muted.small', { title: addr(w) }, short(addr(w), 6, 4)),
        prev && Math.abs(d) > 1e-7 ? h('span.delta.' + (d > 0 ? 'ok' : 'ko'), {}, (d > 0 ? '+' : '') + fmtXrp(d)) : h('span.delta.muted', {}, prev ? '±0' : '—'));
    }));
    S.lastBalances = b;
  } catch (e) { box.replaceChildren(errorBox(e)); }
}

async function renderTx() {
  const box = $('#tx-log');
  try {
    const txs = await api.txLog();
    if (!txs.length) { box.replaceChildren(h('p.empty', {}, 'Aucune transaction pour l\'instant.')); return; }
    box.replaceChildren(h('table.tbl', {},
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Étape'), h('th', {}, 'Résultat'), h('th', {}, 'Explorer'))),
      h('tbody', {}, txs.map((tx, i) => h('tr', {},
        h('td.muted.nowrap', {}, txs.length - i),
        h('td', {}, stepLabel(tx.step)),
        h('td', {}, h('span.res.' + resultClass(tx.result), {}, tx.result)),
        h('td', {}, txLink(tx)))))));
  } catch (e) { box.replaceChildren(errorBox(e)); }
}

$('#bal-refresh').addEventListener('click', renderBalances);
$('#tx-refresh').addEventListener('click', renderTx);
$('#shop-refresh').addEventListener('click', renderShop);
$('#mine-refresh').addEventListener('click', renderMine);

boot();
