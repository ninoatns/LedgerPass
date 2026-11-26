// Pré-génère les métadonnées publiques metadata/evt-<id>/A-001.json .. A-<count>.json (format identique au mint).
// Idempotent : ne réécrit JAMAIS un fichier existant (son sha256 est déjà ancré on-chain dans des Memos de mint).
// Usage : npm run gen:metadata -- [--count 300] [--event 1]
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/src/config.js';
import { serializeMetadata } from '../server/src/services/mint.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const count = Number(arg('count', 300));
const eventId = Number(arg('event', 1));
if (!Number.isInteger(count) || count < 1 || count > 999) {
  console.error('--count doit être un entier entre 1 et 999 (format de siège A-001..A-999)');
  process.exit(1);
}

// Catalogue versionné (data/db.sample.json) : même source que data/db.json sur une installation neuve.
const catalogue = JSON.parse(fs.readFileSync(config.dbSamplePath, 'utf8'));
const event = (catalogue.events || []).find((e) => Number(e.id) === eventId);
if (!event) {
  console.error(`événement ${eventId} absent de ${path.relative(config.root, config.dbSamplePath)}`);
  process.exit(1);
}

const dir = path.join(config.metadataDir, `evt-${event.id}`);
fs.mkdirSync(dir, { recursive: true });
let created = 0;
let kept = 0;
for (let i = 1; i <= count; i += 1) {
  const seat = `A-${String(i).padStart(3, '0')}`; // même format que store.reserveSeats
  const file = path.join(dir, `${seat}.json`);
  if (fs.existsSync(file)) { kept += 1; continue; }
  fs.writeFileSync(file, serializeMetadata(event, seat), { flag: 'wx' });
  created += 1;
}
console.log(`[gen:metadata] evt-${event.id} : ${created} créé(s), ${kept} existant(s) conservé(s) (A-001..A-${String(count).padStart(3, '0')})`);
