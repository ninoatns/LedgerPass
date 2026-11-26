# Contrat d'API — LedgerPass (FIGÉ)

Base : `http://localhost:3000/api`. JSON partout. Erreur : `{ "error": "message", "code": "tecXXX|tefXXX|HTTP", "hash"?: "..." }` avec status 4xx/5xx.
Toute transaction renvoyée a la forme `Tx = { step, hash, result, explorer }` (`explorer = https://testnet.xrpl.org/transactions/<hash>`).

**Modèle choisi (option B)** : billets mintés avec `Flags = tfBurnable` (1) **sans** `tfTransferable`.
→ seul l'organisateur (émetteur) peut créer des offres ; un détenteur ne peut pas revendre en direct (`tefNFTOKEN_IS_NOT_TRANSFERABLE`).
→ revente = rachat par l'organisateur puis revente à l'acheteur, prix ≤ plafond, commission organisateur 5 %.
**Mode démo custodial** : le backend détient les seeds Testnet de `org`, `alice`, `bob` et signe pour eux.

Acteurs (`who`) : `org` | `alice` | `bob`.

| Méthode & route | Auth | Corps | Signe | Réponse |
|---|---|---|---|---|
| GET `/health` | – | – | – | `{ network: wss_url, ledgerIndex, accounts: { org, alice, bob } }` (adresses publiques) |
| GET `/events` | – | – | – | `[{ id, name, date, venue, priceXrp, capXrp, commissionPct }]` |
| GET `/balances` | – | – | – | `{ org: xrp, alice: xrp, bob: xrp }` (string XRP) |
| POST `/admin/mint` | `X-Admin-Token` | `{ eventId, count }` | org | `{ tickets: [{ nftId, seat, uri, metaSha256 }], txs: Tx[] }` |
| POST `/primary/buy` | – | `{ nftId, buyer }` | org (offre vente → Destination buyer) puis buyer (accept) | `{ nftId, owner, txs: Tx[] }` |
| GET `/wallets/:who/tickets` | – | – | – | `[{ nftId, eventId, seat, flags, uri, explorer }]` (lu via `account_nfts`, filtré Issuer = org) |
| GET `/tickets/:nftId` | – | – | – | `{ nftId, eventId, seat, owner \| null, burned: bool, history: Tx[] }` (statut relu on-chain) |
| POST `/resale` | – | `{ nftId, seller, buyer, priceXrp }` | org (offre achat Owner=seller à `price*(1-commission)`), seller (accept), org (offre vente Destination=buyer à `price`), buyer (accept) | `{ nftId, owner, sellerReceivedXrp, orgCommissionXrp, txs: Tx[] }` — 400 si `priceXrp > capXrp` |
| POST `/resale/direct` | – | `{ nftId, seller, buyer, priceXrp }` | seller (tentative d'offre directe) | **toujours** erreur 409 `{ code: "tefNFTOKEN_IS_NOT_TRANSFERABLE" }` — preuve que le protocole bloque le marché noir |
| POST `/gate/checkin` | `X-Gate-Token` | `{ nftId, holder }` | org (`NFTokenBurn` Owner=holder + Memo `ledgerpass/checkin`) | 200 `{ granted: true, tx: Tx }` ; 409 `{ granted: false, reason }` si billet absent/déjà brûlé/mauvais détenteur |
| GET `/tx` | – | – | – | `Tx[]` (journal de la session, plus récent en premier) |

Contenu du QR code : `JSON.stringify({ nftId, holder })` (holder = adresse r...).

Métadonnées : `metadata/evt-<id>/<seat>.json`, servies en statique par `/metadata/...` ; `sha256` du fichier mis dans le Memo du mint (`ledgerpass/mint`).
