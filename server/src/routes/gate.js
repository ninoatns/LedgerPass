import { Router } from 'express';
import { checkin } from '../services/gate.js';
import { gateAuth } from './util.js';

const r = Router();
r.post('/gate/checkin', gateAuth(), async (req, res) => res.json(await checkin(req.body || {})));
export default r;
