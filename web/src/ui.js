// Petits utilitaires d'interface partagés (index.html + scan.html).
import { isMock, mockWhy } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Création d'élément : h('div.card', {attrs}, ...children) */
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const short = (s, a = 8, b = 6) => (s && s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s || '');

export function fmtXrp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '–');
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' XRP';
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }); // heure du lieu de l'événement
}

export const resultClass = (r) => (r === 'tesSUCCESS' ? 'ok' : /^te[cf]|^tem|^tel/.test(r || '') ? 'ko' : 'warn');

// Libellés lisibles des étapes renvoyées par le backend (step = identifiant technique).
const STEP_LABELS = {
  'primary:sell-offer': 'NFTokenCreateOffer — org vend (Destination = acheteur)',
  'primary:accept': 'NFTokenAcceptOffer — l\'acheteur accepte',
  'direct:seller-sell-offer': 'NFTokenCreateOffer signée par le détenteur (revente directe)',
  'resale:org-buy-offer': 'NFTokenCreateOffer — org rachète (Owner = vendeur)',
  'resale:seller-accept': 'NFTokenAcceptOffer — le vendeur accepte le rachat',
  'resale:org-sell-offer': 'NFTokenCreateOffer — org revend (Destination = acheteur)',
  'resale:buyer-accept': 'NFTokenAcceptOffer — l\'acheteur accepte',
  'gate:checkin-burn': 'NFTokenBurn — check-in (Memo ledgerpass/checkin)',
  'cleanup-cancel': 'NFTokenCancelOffer — nettoyage',
  'cleanup-offers': 'NFTokenCancelOffer — nettoyage',
};

/** Libellé lisible + identifiant technique (le mock envoie déjà des libellés en clair). */
export function stepLabel(step) {
  const s = String(step || '');
  const m = /^mint:(.+)$/.exec(s);
  const label = m ? `NFTokenMint ${m[1]} (tfBurnable, non transférable)` : STEP_LABELS[s];
  return label ? h('span', { title: s }, label, ' ', h('code.step-id', {}, s)) : h('span', {}, s);
}

/** tef/tem/tel : rejetée avant inclusion dans un ledger → le hash n'existe pas sur l'explorer. */
const neverInLedger = (r) => /^(tef|tem|tel)/.test(r || '');

export function txLink(tx, label) {
  if (!tx || !tx.hash || neverInLedger(tx.result)) return h('span.muted', {}, 'rejetée avant ledger (aucun hash sur l\'explorer)');
  return h('a.mono', { href: tx.explorer || `https://testnet.xrpl.org/transactions/${tx.hash}`, target: '_blank', rel: 'noopener' }, label || short(tx.hash, 10, 8), ' ↗');
}

/**
 * Timeline d'une action. Usage :
 *   const tl = timeline(container, 'Revente via LedgerPass', ['étape 1', ...]);
 *   tl.done(txs) | tl.fail(error, extraNode)
 */
export function timeline(container, title, expectedSteps = []) {
  container.innerHTML = '';
  const started = Date.now();
  const timer = h('span.timer', {}, '0,0 s');
  const list = h('ol.tl');
  const head = h('div.tl-head', {}, h('span.spinner', { 'aria-hidden': 'true' }), h('strong', {}, title), timer);
  const box = h('div.tl-box.pending', { role: 'status', 'aria-live': 'polite' }, head, list);
  expectedSteps.forEach((s, i) => list.append(h('li.step.wait', {}, h('span.dot', {}, i + 1),
    h('div.step-body', {}, h('span.label', {}, s), h('div.step-meta', {}, h('span.res.muted', {}, 'en attente'))))));
  if (expectedSteps.length) list.firstChild.classList.add('active');
  container.append(box);

  // anime les étapes attendues (estimation ~4 s/tx en réel)
  const per = isMock() ? 650 : 4000;
  const iv = setInterval(() => {
    const el = (Date.now() - started) / 1000;
    timer.textContent = el.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' s';
    const idx = Math.min(expectedSteps.length - 1, Math.floor((el * 1000) / per));
    [...list.children].forEach((li, i) => { li.classList.toggle('active', i === idx); li.classList.toggle('past', i < idx); });
  }, 100);

  const finish = (cls) => {
    clearInterval(iv);
    box.classList.remove('pending');
    box.classList.add(cls);
    head.querySelector('.spinner').remove();
  };

  return {
    done(txs = [], summary) {
      finish('success');
      list.innerHTML = '';
      txs.forEach((tx, i) =>
        list.append(h('li.step', {}, h('span.dot.' + resultClass(tx.result), {}, i + 1),
          h('div.step-body', {}, h('span.label', {}, stepLabel(tx.step)),
            h('div.step-meta', {}, h('span.res.' + resultClass(tx.result), {}, tx.result), txLink(tx))))));
      if (summary) box.append(h('div.tl-summary', {}, summary));
    },
    fail(e, extra, { hideError = false } = {}) {
      finish('failure');
      list.innerHTML = '';
      // Transactions déjà passées avant l'échec (échec partiel : revente 4 tx, vente primaire…)
      const body = (e && e.body) || {};
      (body.txs || []).forEach((tx, i) =>
        list.append(h('li.step', {}, h('span.dot.' + resultClass(tx.result), {}, i + 1),
          h('div.step-body', {}, h('span.label', {}, stepLabel(tx.step)),
            h('div.step-meta', {}, h('span.res.' + resultClass(tx.result), {}, tx.result), txLink(tx))))));
      if (!hideError) box.append(errorBox(e));
      if (body.stage) {
        const owner = body.currentOwner;
        box.append(h('p.small', {}, 'Étape en échec : ', h('code', {}, body.stage),
          owner ? [' · détenteur actuel (relu on-chain) : ', h('b', {}, owner.who || 'aucun'), owner.address ? h('span.mono.muted', {}, ` ${short(owner.address)}`) : null] : null));
      }
      if (extra) box.append(extra);
    },
  };
}

export function errorBox(e) {
  return h('div.error', { role: 'alert' },
    h('strong', {}, 'Échec : '), e.message || String(e),
    e.code ? h('span.code', {}, e.code) : null,
    e.hash ? h('div', {}, 'Transaction : ', txLink({ hash: e.hash })) : null);
}

/** Exécute fn en mettant le bouton en état « chargement ». */
export async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = label;
  }
}

export function toast(msg, kind = 'info') {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts' }); document.body.append(wrap); }
  const t = h('div.toast.' + kind, {}, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 3500);
  setTimeout(() => t.remove(), 4000);
}

/**
 * Écran d'erreur BLOQUANT (backend injoignable) : pas de bascule silencieuse vers le mock.
 * Le mock reste accessible explicitement par ?mock=1.
 */
export function fatalScreen(e) {
  const url = new URL(location.href);
  url.searchParams.set('mock', '1');
  const wrap = h('div.fatal', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'fatal-title' },
    h('div.fatal-inner', {},
      h('h2', { id: 'fatal-title' }, 'Backend LedgerPass injoignable'),
      h('p', {}, (e && e.message) || String(e)),
      h('p', {}, 'Lancez l\'API (', h('code', {}, 'npm run dev'), ', http://127.0.0.1:3000/api/health) puis réessayez. ',
        'Aucune donnée affichée ici ne proviendrait du Testnet.'),
      h('div.row', {},
        h('button.btn.primary', { onclick: () => location.reload() }, 'Réessayer'),
        h('a.btn.ghost', { href: url.toString() }, 'Ouvrir la démo simulée (?mock=1)'))));
  document.body.append(wrap);
  return wrap;
}

/** Bandeau réseau + badges, commun aux deux pages. */
export function renderStatus(node, health) {
  node.innerHTML = '';
  node.append(
    h('span.pill', { title: 'Nœud XRPL utilisé par le backend' }, h('span.led'), 'Réseau : ',
      health.network ? h('b', {}, health.network) : h('b.warn', {}, `XRPL en reconnexion (${health.status || '?'})`)),
    h('span.pill', {}, 'Ledger : ', h('b.mono', { id: 'ledger-idx' }, health.ledgerIndex ?? '?')),
    h('span.badge.custodial', { title: 'Le backend détient les seeds Testnet et signe pour org/alice/bob' },
      'Mode démo custodial — en production l\'utilisateur signe avec son wallet (GemWallet/Xaman)'),
  );
  if (isMock()) node.append(h('span.badge.mock', { title: mockWhy() }, 'DONNÉES SIMULÉES (mock) — ' + mockWhy()));
}

export function sessionGet(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }
export function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
