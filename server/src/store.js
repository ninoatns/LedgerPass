// Stockage off-chain minimal : data/db.json (catalogue, métadonnées des billets mintés, journal des tx).
// Lecture/écriture synchrones + écriture atomique (tmp + rename). Le statut d'un billet n'est JAMAIS stocké ici.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const EMPTY = { events: [], tickets: {}, seatCounters: {}, txLog: [] };
const MAX_LOG = 500;

function ensure() {
  if (fs.existsSync(config.dbPath)) return;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const init = fs.existsSync(config.dbSamplePath)
    ? fs.readFileSync(config.dbSamplePath, 'utf8')
    : JSON.stringify(EMPTY, null, 2);
  writeAtomic(JSON.parse(init));
}

function writeAtomic(db) {
  const tmp = `${config.dbPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, config.dbPath);
}

export function read() {
  ensure();
  const db = JSON.parse(fs.readFileSync(config.dbPath, 'utf8'));
  return { ...EMPTY, ...db };
}

/** Lecture-modification-écriture (synchrone, donc pas d'entrelacement dans un même process). */
export function update(fn) {
  const db = read();
  const out = fn(db);
  writeAtomic(db);
  return out;
}

export const getEvents = () => read().events;
export function getEvent(id) {
  return read().events.find((e) => String(e.id) === String(id));
}
export const getTicketMeta = (nftId) => read().tickets[String(nftId).toUpperCase()];

export function saveTicket(nftId, data) {
  update((db) => { db.tickets[nftId.toUpperCase()] = data; });
}

/** Réserve `count` numéros de siège consécutifs pour l'événement. */
export function reserveSeats(eventId, count) {
  return update((db) => {
    const start = Number(db.seatCounters[eventId] || 0);
    db.seatCounters[eventId] = start + count;
    return Array.from({ length: count }, (_, i) => `A-${String(start + i + 1).padStart(3, '0')}`);
  });
}

export function appendTx(entry) {
  update((db) => {
    db.txLog.push(entry);
    if (db.txLog.length > MAX_LOG) db.txLog = db.txLog.slice(-MAX_LOG);
  });
}

export const getTxLog = () => read().txLog;

/** Associe a posteriori un nftId à une entrée du journal (ex. mint : l'id n'est connu qu'après validation). */
export function tagTx(hash, nftId) {
  update((db) => { for (const t of db.txLog) if (t.hash === hash) t.nftId = nftId; });
}
