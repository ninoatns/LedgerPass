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

const app = express();
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use('/metadata', express.static(config.metadataDir, { fallthrough: true }));
app.use('/metadata', express.static(config.generatedMetadataDir));
app.use('/api', info, admin, market, wallet, gate);
app.use('/api', (_req, _res, next) => next(new AppError(404, 'route inconnue', 'HTTP')));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[api] LedgerPass sur http://localhost:${config.port}/api`);
  console.log('[api] comptes :', addresses());
  getClient().catch((e) => console.error('[xrpl] connexion initiale échouée :', e.message));
});
