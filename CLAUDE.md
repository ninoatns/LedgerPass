# CLAUDE.md — LedgerPass (Billetterie NFT sur XRPL Testnet)

Hackathon XRPL Bac+5 ING5 CReATE — 25→27/11/2026. Soutenance **ven. 27/11, 14h** (10 min présentation + 5 min démo + 10 min questions).

## Règles de travail (pour Claude)

1. **Toujours utiliser des sous-agents** pour l'analyse, la recherche, l'implémentation de modules indépendants et la revue. Paralléliser ce qui est indépendant. Garder dans le fil principal la synthèse et les décisions.
2. **Être critique** envers les demandes de l'utilisateur, la fiche de cadrage et les sujets : signaler incohérences, risques, contournements et mauvais ratio points/effort *avant* d'exécuter. Ne pas valider par complaisance ; proposer une alternative chiffrée quand on n'est pas d'accord.
3. **Vérifier plutôt que supposer** : tout comportement XRPL (flags, burn, royalty, broker…) est confirmé par la doc xrpl.org / js.xrpl.org ou par une vraie transaction Testnet avant d'être affirmé dans le code, le README ou les slides.
4. **Prioriser selon le barème** (/20) : Pertinence blockchain 6 · Étude technique 5 · PoC & démo 4 · Organisation 3 · Soutenance 2. Le MVP qui marche passe avant tout bonus.
5. Répondre en **français**.
6. **Claude réalise tout le projet** (code, README, docs, slides) — les rôles de la fiche ne servent pas à répartir le travail. L'utilisateur fournit uniquement les accès et les décisions ; Claude le guide point par point.

## Règles de sécurité (obligatoires — consignes du challenge)

- **Testnet uniquement.** Jamais de seed Mainnet, nulle part.
- **Aucune seed / aucun secret sur Git.** Seeds dans `.env` (listé dans `.gitignore`), fournir un `.env.example` sans valeur. Vérifier que `wallets.json` n'est jamais commité. Ne jamais afficher une seed dans le README, les slides, les logs ou le chat.
- **Aucune donnée personnelle on-chain** : uniquement identifiants fictifs ou hash.
- Pour demander de l'aide : adresses publiques, hash de tx, codes résultat — jamais la seed.

## Règles techniques XRPL

- Lib : **xrpl.js** sur **Node.js LTS**. Fixer les versions dans `package.json`.
- Connexion avec **fallback** : `wss://s.altnet.rippletest.net:51233` → `wss://testnet.xrpl-labs.com` → `wss://testnet.honeycluster.io` (le Wi-Fi de l'école bloque le port 51233).
- Toujours `submitAndWait` puis vérifier `meta.TransactionResult === "tesSUCCESS"` ; logguer le hash + lien `https://testnet.xrpl.org/transactions/<hash>`.
- Faucet saturé : créer les comptes **une seule fois** (script dédié), les réutiliser via `.env`. Le Testnet peut être réinitialisé → le README explique comment **recréer** les comptes, pas seulement les lister.
- Seul le **back-end signe** ; le front ne détient aucune seed. Le modèle custodial du PoC doit être **assumé explicitement** (README + soutenance).

## Décisions actées

- **Option B** : mint `Flags = tfBurnable` **sans** `tfTransferable`, pas de TransferFee. Revente uniquement via l'organisateur (offre d'achat org → accept vendeur, puis offre de vente org Destination=acheteur → accept), prix ≤ plafond (25 XRP), commission 5 %. Revente directe bloquée par le protocole (`tefNFTOKEN_IS_NOT_TRANSFERABLE`).
- Contrat d'API figé : `LedgerPass/docs/api-contract.md`.
- Dépôt : `ninoatns/LedgerPass`. Slides : `.pptx` (`docs/LedgerPass_Soutenance.pptx`).
- Dans le conteneur cloud : Node passe par `HTTPS_PROXY` (https-proxy-agent) + `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` ; seul `wss://testnet.xrpl-labs.com` est joignable.

## Faits XRPL vérifiés (doc + code rippled 2.5.0 — à confirmer sur Testnet)

- `TransferFee` exige `tfTransferable` ; pas de royalty si l'émetteur est partie à la vente ; vente à 0 XRP = 0 royalty.
- Sans `tfTransferable`, seul l'émetteur/minter peut créer des offres → revente plafonnée imposée par le protocole.
- Émetteur (et son `NFTokenMinter`) peut brûler un NFT `tfBurnable` détenu par un tiers (`NFTokenBurn` + `Owner`).
- Offre avec `Destination` : seule la destination accepte → signer pour l'acheteur = custodial.
- `nft_info` = Clio uniquement (`wss://clio.altnet.rippletest.net:51233`) ; utiliser `account_nfts` pour vérifier.
- Réserve : 1 XRP base + 0,2 XRP par objet (NFTokenPage, offre). Faucet ≈ 100 XRP.
- Une seule couche `services/` partagée par l'API Express et le script e2e.

## Règles d'organisation (notées)

- Dépôt GitHub d'équipe : commits réguliers et répartis entre les 4 membres, une issue par fonctionnalité, branches courtes.
- README obligatoire : installation, réseau, adresses de test, lancement, scénario de démo, recréation des comptes.
- Un script e2e rejoue le scénario de démo et sort les hashs (sert de test ET de plan B).
- Plan B démo : vidéo enregistrée + liens des transactions déjà confirmées.
- Chaque membre doit pouvoir expliquer tout le projet et sa contribution.
