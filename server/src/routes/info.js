import { Router } from 'express';
import * as query from '../services/query.js';

const r = Router();
r.get('/health', async (_req, res) => res.json(await query.health()));
r.get('/events', (_req, res) => res.json(query.events()));
r.get('/balances', async (_req, res) => res.json(await query.balances()));
r.get('/tx', (_req, res) => res.json(query.txLog()));
export default r;
