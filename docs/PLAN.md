# PLAN — LedgerPass (billetterie NFT, XRPL Testnet)

> Synthèse de 5 sous-agents : 3 analyses de documents, 1 vérification XRPL (doc officielle + code rippled 2.5.0) et 1 plan d'architecture.
> Statut au **jeu. 26/11/2026** : la fiche de cadrage est rendue, **le lien GitHub est dû ce soir** et la **soutenance a lieu demain à 14 h**.

## 0. Décision à trancher en premier : transférable ou non ?

| | A. Garder `tfTransferable` + TransferFee 5 % (version de la fiche) | B. **Ne pas mettre `tfTransferable`**, revente uniquement via l'organisateur (recommandé) |
|---|---|---|
| Royalty | Native, mais contournée par une vente à 0 XRP payée hors chaîne | Pas de TransferFee : il exige `tfTransferable`. La marge de l'organisateur vient de l'écart de prix |
| Prix plafond / anti-marché noir | Appliqué par l'application seulement, donc contournable (offre directe) | **Imposé par le protocole** : sinon `tefNFTOKEN_IS_NOT_TRANSFERABLE` |
| Démo | Royalty visible (+1 XRP pour l'organisateur) | Échec visible d'une revente directe, preuve forte devant le jury |
| Coût | 1 transaction par revente (atomique) | 2 étapes non atomiques : offre d'achat de l'orga acceptée par le vendeur, puis offre de vente de l'orga acceptée par l'acheteur |
| Barème | Faille à justifier à l'oral | Corrige la principale incohérence de la fiche (6 pts « pertinence ») |

**Recommandation : B.** Le changement par rapport à la fiche se justifie à l'oral (« on a testé, et le plafond n'était pas applicable »), ce qui valorise le critère « choix justifiés ».

## 1. Faits XRPL vérifiés (doc et code, pas encore sur le réseau)

- **Burn :** l'émetteur (et son `NFTokenMinter`) peut brûler un NFT `tfBurnable` détenu par un tiers, avec `NFTokenBurn` + `Owner`.
- **TransferFee :** il exige `tfTransferable`. Il ne s'applique pas si l'émetteur est acheteur ou vendeur. Une vente à 0 XRP donne une royalty de 0.
- **Offre avec `Destination` :** seule la destination peut l'accepter. Le backend signe pour Alice et Bob, donc le modèle est **custodial**, à assumer.
- **Vérifier le propriétaire :** `nft_info` n'existe que sur Clio (`wss://clio.altnet.rippletest.net:51233`). Utiliser `account_nfts`.
- **Réserves :** 1 XRP de base, plus 0,2 XRP par NFTokenPage (environ 24 à 32 NFT) et par offre. Le faucet donne environ 100 XRP.
- **Wallet utilisateur le plus rapide :** GemWallet (`@gemwallet/api`). C'est un bonus, **à ne pas commencer avant que le MVP soit stable**.

## 2. Architecture

```
ledgerpass/
├─ server/src/
│  ├─ xrpl/{client.js (fallback wss), wallets.js, tx.js (submitAndWait + tesSUCCESS), memo.js}
│  ├─ services/{mint.js, offers.js, gate.js, query.js}   ← partagé par l'API ET le script e2e
│  ├─ store.js (data/db.json, écriture atomique)
│  └─ routes/{admin, market, wallet, gate}.js            ← simples wrappers
├─ scripts/{check-network.js, setup-accounts.js, e2e-demo.js, cleanup-offers.js}
├─ web/ (Vite) index.html + scan.html (html5-qrcode)
├─ metadata/evt-1/*.json   (commités AVANT le mint ; URI = raw GitHub figée sur un SHA, sha256 dans le Memo)
├─ docs/  demo/last-run.md  README.md  .env.example  .gitignore
```

- **On-chain :** NFT (Taxon = événement), propriété, offres, burn avec Memo `ledgerpass/checkin`.
- **Off-chain :** catalogue, métadonnées, alias de démo, plafond, journal des hash.
- **Règle :** le statut d'un billet (actif ou brûlé) est **toujours relu on-chain**, jamais stocké.
- **Contrôle d'entrée :** le burn **est** la vérification. L'entrée est accordée seulement si le burn renvoie `tesSUCCESS`, ce qui supprime la course entre vérification et burn. On ajoute un verrou par nftId.
- **Protection des routes :** `X-Admin-Token` et `X-Gate-Token` dans `.env`.

## 3. Planning (jeudi après-midi, puis vendredi)

| Créneau | Lucien | Basile | Aurore | Nino |
|---|---|---|---|---|
| T0 → +30 min | Repo, `.gitignore`, `.env.example`, **contrat d'API figé** | `check-network`, `setup-accounts` (faucet une seule fois) | Init Vite, maquettes | JSON de métadonnées commités |
| → **Jalon J1 (16 h)** | store + routes, début e2e | `tx.js`, mint, vente primaire | Front sur mock | `gate.js`, scan sur mock |
| → **Jalon J2 (18 h)** | e2e complet, README | Revente (option B), `query.js` | Branchement à l'API réelle | Brancher le contrôle d'entrée, `securite.md` |
| 18 h 30 | **Envoi du lien GitHub**, tag `v0.9` | | | |
| Soirée | Slides : comparaison avec une BDD, choix XRPL | Tests unitaires, nettoyage des offres | Historique, soldes | **Vidéo plan B** |
| Ven. 8 h 30–11 h | Répétition sur le Wi-Fi de l'école, e2e frais. **Gel des fonctionnalités à 11 h** | | | |
| Ven. 11 h–13 h 45 | 2 répétitions chronométrées (10 + 5 min), entraînement aux questions, machine de démo prête (4G, onglets explorer) | | | |

- **Chemin critique :** setup → tx.js → mint → vente primaire → revente → burn → e2e → README.
- **Ordre des coupures si on prend du retard :** bonus wallet/broker, puis scan caméra (remplacé par une saisie de l'ID), puis page historique, puis revente dans le front, puis front entier (démo par le script `e2e --step` et l'explorateur).
- **Ne jamais couper :** mint, vente primaire, revente, burn, e2e, README, `.env.example`.

## 4. Tests et plan B

- **`npm run e2e` :** rejoue la démo avec des assertions sur `account_nfts`, les soldes, les échecs attendus (rescan, revente après burn, revente directe refusée en option B) et le dépassement du plafond. Il génère `demo/last-run.md` (hash et liens explorer).
- **`node --test` :** couvre les fonctions pures (memos, flags, URI ≤ 256 octets, plafond, extraction de l'offerId).
- **Plan B, dans l'ordre :** front en direct, puis 4G, puis `e2e --step`, puis vidéo + `last-run.md` + captures d'écran de l'explorateur. En cas de reset du Testnet : `npm run setup`, puis `npm run e2e`.

## 5. À assumer à l'oral

- **Custodial :** l'utilisateur signerait en cible avec GemWallet ou Xaman.
- **QR statique :** il est à usage unique grâce au burn ; la cible est un défi signé.
- **Pouvoir de burn de l'organisateur :** il est public et traçable.
- **Pas d'IPFS :** on utilise une URI figée sur un SHA de commit, avec le hash du fichier dans le Memo.
- **Cible production :** émetteur en clé froide, `NFTokenMinter` chaud, KMS.
