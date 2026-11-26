import { Router } from 'express';
import { primaryBuy } from '../services/offers.js';
import { resale, directResale } from '../services/resale.js';

const r = Router();
r.post('/primary/buy', async (req, res) => res.json(await primaryBuy(req.body || {})));
r.post('/resale', async (req, res) => res.json(await resale(req.body || {})));
r.post('/resale/direct', async (req, res) => res.json(await directResale(req.body || {}))); // lève toujours 409
export default r;
