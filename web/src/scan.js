// Page de contrôle d'entrée (scan.html) : QR caméra ou saisie manuelle → POST /gate/checkin.
import { api, init, isMock } from './api.js';
import { $, h, short, errorBox, busy, renderStatus, txLink, sessionGet, sessionSet, toast } from './ui.js';

let health = null;
let scanner = null;
let locked = false; // évite les doubles check-ins pendant qu'un verdict est affiché
const history = [];

async function boot() {
  try {
    health = await init();
    renderStatus($('#status'), health);
  } catch (e) {
    $('#status').replaceChildren(errorBox(e));
  }
  if (isMock()) $('#back-link').href = './index.html?mock=1';

  const tok = $('#gate-token');
  tok.value = sessionGet('lp.gateToken') || (isMock() ? 'demo' : '');
  paintGate();
  $('#gate-save').addEventListener('click', () => { sessionSet('lp.gateToken', tok.value.trim()); paintGate(); toast('Jeton enregistré pour cette session', 'ok'); });
  tok.addEventListener('change', () => { sessionSet('lp.gateToken', tok.value.trim()); paintGate(); });

  $('#cam-start').addEventListener('click', startCam);
  $('#cam-stop').addEventListener('click', stopCam);
  $('#manual-btn').addEventListener('click', onManual);
  $('#verdict-close').addEventListener('click', closeVerdict);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#verdict').hidden) closeVerdict(); });
}

const token = () => $('#gate-token').value.trim();

function paintGate() {
  $('#gate-state').replaceChildren(token()
    ? h('span.ok', {}, '✓ Jeton renseigné (stocké en sessionStorage, effacé à la fermeture de l\'onglet).')
    : h('span.warn', {}, 'Renseignez le jeton de contrôle avant de scanner.'));
}

/** Accepte : JSON {nftId, holder} | NFTokenID seul (+ holder saisi à part). */
export function parsePayload(raw, holderField = '') {
  const txt = String(raw || '').trim();
  let nftId = '';
  let holder = holderField.trim();
  if (txt.startsWith('{')) {
    let o;
    try { o = JSON.parse(txt); } catch { throw new Error('JSON illisible : vérifiez le contenu collé.'); }
    nftId = String(o.nftId || '').trim();
    holder = String(o.holder || holder).trim();
  } else {
    nftId = txt;
  }
  if (!/^[0-9A-Fa-f]{64}$/.test(nftId)) throw new Error('NFTokenID invalide (64 caractères hexadécimaux attendus).');
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(holder)) throw new Error('Adresse du porteur invalide (adresse XRPL r… attendue).');
  return { nftId: nftId.toUpperCase(), holder };
}

async function checkin({ nftId, holder }) {
  if (!token()) { toast('Jeton de contrôle manquant', 'ko'); $('#gate-token').focus(); return; }
  locked = true;
  showVerdict('pending', '…', 'Vérification on-chain et NFTokenBurn en cours (≈ 4 s)…');
  try {
    const r = await api.checkin(nftId, holder, token());
    if (r && r.granted) {
      showVerdict('granted', 'ACCÈS AUTORISÉ', h('div', {},
        h('p', {}, 'Billet ', h('span.mono', {}, short(nftId, 10, 6)), ' brûlé : il ne pourra plus jamais être présenté.'),
        h('p', {}, 'Transaction du burn : ', txLink(r.tx, r.tx && r.tx.hash ? short(r.tx.hash, 12, 8) : null))));
      log(nftId, true, 'Accès autorisé', r.tx);
    } else {
      const reason = (r && r.reason) || 'Réponse inattendue du serveur';
      showVerdict('denied', 'REFUSÉ', reason);
      log(nftId, false, reason);
    }
  } catch (e) {
    const reason = (e.body && e.body.reason) || e.message;
    showVerdict('denied', 'REFUSÉ', h('div', {}, h('p', {}, reason), e.code && e.status !== 409 ? h('p.code', {}, e.code) : null));
    log(nftId, false, reason);
  }
}

function showVerdict(kind, title, detail) {
  const v = $('#verdict');
  v.className = 'verdict ' + kind;
  v.hidden = false;
  $('#verdict-icon').textContent = { granted: '✓', denied: '✕', pending: '' }[kind];
  $('#verdict-title').textContent = title;
  $('#verdict-detail').replaceChildren(typeof detail === 'string' ? h('p', {}, detail) : detail);
  $('#verdict-close').hidden = kind === 'pending';
  if (kind !== 'pending') $('#verdict-close').focus();
}

function closeVerdict() {
  $('#verdict').hidden = true;
  locked = false;
}

function log(nftId, ok, reason, tx) {
  history.unshift({ nftId, ok, reason, tx, at: new Date() });
  $('#history').classList.remove('muted');
  $('#history').replaceChildren(h('table.tbl', {},
    h('tbody', {}, history.slice(0, 10).map((x) => h('tr', {},
      h('td.muted', {}, x.at.toLocaleTimeString('fr-FR')),
      h('td', {}, h('span.res.' + (x.ok ? 'ok' : 'ko'), {}, x.ok ? 'AUTORISÉ' : 'REFUSÉ')),
      h('td.mono', { title: x.nftId }, short(x.nftId, 10, 6)),
      h('td', {}, x.reason),
      h('td', {}, x.tx ? txLink(x.tx) : ''))))));
}

async function onManual(ev) {
  const msg = $('#manual-msg');
  msg.innerHTML = '';
  let p;
  try { p = parsePayload($('#manual-json').value, $('#manual-holder').value); } catch (e) { msg.append(errorBox(e)); return; }
  await busy(ev.currentTarget, () => checkin(p));
}

async function startCam() {
  const msg = $('#cam-msg');
  msg.innerHTML = '';
  if (!window.isSecureContext) {
    msg.append(errorBox(new Error('Contexte non sécurisé : la caméra exige HTTPS ou localhost. Utilisez la saisie manuelle.')));
    return;
  }
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    scanner = scanner || new Html5Qrcode('reader', { verbose: false });
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 260 } }, onScan, () => {});
    $('#cam-start').disabled = true;
    $('#cam-stop').disabled = false;
  } catch (e) {
    msg.append(errorBox(new Error('Caméra indisponible : ' + (e && e.message ? e.message : e))));
  }
}

async function stopCam() {
  try { if (scanner) await scanner.stop(); } catch { /* déjà arrêtée */ }
  $('#cam-start').disabled = false;
  $('#cam-stop').disabled = true;
}

function onScan(text) {
  if (locked) return;
  let p;
  try { p = parsePayload(text); } catch (e) {
    locked = true;
    showVerdict('denied', 'REFUSÉ', 'QR code non reconnu : ' + e.message);
    return;
  }
  checkin(p);
}

boot();
