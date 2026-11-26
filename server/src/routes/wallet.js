import { Router } from 'express';
import * as query from '../services/query.js';

const r = Router();
r.get('/wallets/:who/tickets', async (req, res) => res.json(await query.walletTickets(req.params.who)));
r.get('/tickets/:nftId', async (req, res) => res.json(await query.ticket(req.params.nftId)));
export default r;
