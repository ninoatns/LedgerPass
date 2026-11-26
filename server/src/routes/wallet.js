import { Router } from 'express';
import * as query from '../services/query.js';
import { ticketQr } from '../services/gate.js';

const r = Router();
r.get('/wallets/:who/tickets', async (req, res) => res.json(await query.walletTickets(req.params.who)));
// QR signé (custodial : le backend signe pour le détenteur), valable 60 s.
r.get('/wallets/:who/tickets/:nftId/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await ticketQr(req.params.who, req.params.nftId));
});
r.get('/tickets/:nftId', async (req, res) => res.json(await query.ticket(req.params.nftId)));
export default r;
