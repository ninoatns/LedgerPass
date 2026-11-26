import { Router } from 'express';
import { mintTickets } from '../services/mint.js';
import { adminAuth } from './util.js';

const r = Router();
r.post('/admin/mint', adminAuth(), async (req, res) => {
  const { eventId, count } = req.body || {};
  res.json(await mintTickets({ eventId, count: count ?? 1 }));
});
export default r;
