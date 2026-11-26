// Verrou unique par NFTokenID, partagé par vente primaire, revente et contrôle d'entrée :
// une seule opération à la fois sur un billet donné (dans ce process).
import { AppError } from '../config.js';

const held = new Map(); // nftId -> libellé de l'opération en cours

/** Prend le verrou ou lève 409. Retourne la fonction de libération. */
export function acquire(nftId, label) {
  const id = String(nftId).toUpperCase();
  if (held.has(id)) throw new AppError(409, `billet verrouillé : ${held.get(id)} déjà en cours sur ce billet`, 'LOCKED');
  held.set(id, label);
  let released = false;
  return () => { if (!released) { released = true; held.delete(id); } };
}

export const isLocked = (nftId) => held.has(String(nftId).toUpperCase());
