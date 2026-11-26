import { config, AppError } from '../config.js';

export function requireToken(header, expected) {
  return (req, _res, next) => {
    if (req.get(header) !== expected) return next(new AppError(401, `${header} manquant ou invalide`, 'HTTP'));
    return next();
  };
}
export const adminAuth = () => requireToken('X-Admin-Token', config.adminToken);
export const gateAuth = () => requireToken('X-Gate-Token', config.gateToken);

/** Middleware d'erreur : { error, code, hash? } (+ txs déjà passées si échec partiel). */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 502);
  const body = { error: err.message || String(err), code: err.code && typeof err.code === 'string' ? err.code : 'HTTP' };
  if (err.hash) body.hash = err.hash;
  if (err.reason !== undefined) { body.granted = false; body.reason = err.reason; }
  if (err.extra?.txs?.length) body.txs = err.extra.txs;
  if (status >= 500) console.error('[api]', err.stack || err);
  res.status(status).json(body);
}
