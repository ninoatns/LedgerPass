// API Express LedgerPass. Toute la logique est dans services/ (partagée avec scripts/).
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getClient } from './xrpl/client.js';
import { addresses } from './xrpl/wallets.js';
import info from './routes/info.js';
import admin from './routes/admin.js';
import market from './routes/market.js';
import wallet from './routes/wallet.js';
import gate from './routes/gate.js';
import { errorHandler } from './routes/util.js';
import { AppError } from './config.js';
import { isWeakToken } from './security.js';

// Refus de démarrer avec des jetons vides / d'exemple (`change-me…`) : `npm run setup` en génère des aléatoires.
const weak = [['ADMIN_TOKEN', config.adminToken], ['GATE_TOKEN', config.gateToken]].filter(([, v]) => isWeakToken(v)).map(([k]) => k);
if (weak.length) {
  console.error(`[api] refus de démarrer : ${weak.join(', ')} vide(s), par défaut ou trop court(s) (< 16 car.).`);
  console.error('[api] lancez `npm run setup` (génère des jetons aléatoires dans .env sans toucher aux comptes).');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: config.corsOrigins })); // front Vite uniquement (configurable : CORS_ORIGINS)
app.use(express.json({ limit: '50kb' }));
app.use('/metadata', express.static(config.metadataDir, { fallthrough: true }));
app.use('/metadata', express.static(config.generatedMetadataDir));
app.use('/api', info, admin, market, wallet, gate);
app.use('/api', (_req, _res, next) => next(new AppError(404, 'route inconnue', 'HTTP')));
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(`[api] LedgerPass sur http://${config.host}:${config.port}/api (CORS : ${config.corsOrigins.join(', ')})`);
  console.log('[api] comptes :', addresses());
  getClient().catch((e) => console.error('[xrpl] connexion initiale échouée :', e.message));
});
