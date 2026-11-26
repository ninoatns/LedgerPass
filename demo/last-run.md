# Dernière exécution du scénario e2e

- Date : 2026-11-26T11:11:04.507Z
- Réseau : `wss://testnet.xrpl-labs.com`
- Comptes : org `rhbNH2oD69dnQ6jebAmqkuTezt1YNa5qwu`, alice `rpcVkpNjwZ5UXpPnwtJufvDoe7cjrVUy3p`, bob `rGtCFKQrUnHa1XjjqM7oo98mdmc7CMZKQj`
- Statut : **SUCCÈS**

| Étape | Transaction | Hash | Résultat | Lien |
|---|---|---|---|---|
| 1 mint | mint:A-023 | `F0F47FF9635542AF694FC31196A7A83C97A872399A3CDAB535E01049C7381D52` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/F0F47FF9635542AF694FC31196A7A83C97A872399A3CDAB535E01049C7381D52) |
| 1 mint | mint:A-024 | `9C73D880DF207FB3C4EE9F2D0911DB6CE331C5265F10740C8BD041032805ADC4` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/9C73D880DF207FB3C4EE9F2D0911DB6CE331C5265F10740C8BD041032805ADC4) |
| 1 mint | mint:A-025 | `867B1CF52FDB63D9CB08076A0711CBD165C35B8D07BF88886FBD78A4B90909EA` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/867B1CF52FDB63D9CB08076A0711CBD165C35B8D07BF88886FBD78A4B90909EA) |
| 2 vente primaire | primary:sell-offer | `FD10590CE27A7D0CE8C0A934F442B305D62E1A7F72CAFAE540F69565E8F181A4` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/FD10590CE27A7D0CE8C0A934F442B305D62E1A7F72CAFAE540F69565E8F181A4) |
| 2 vente primaire | primary:accept | `FF85399852DC4CAC2A7AD898D9157F3D065C35358D50C10D31BC3643A5D20E1C` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/FF85399852DC4CAC2A7AD898D9157F3D065C35358D50C10D31BC3643A5D20E1C) |
| 3 revente directe | direct:seller-sell-offer | `2EEAF419EF13BAC24AC30A4DF9B257258215C302E0F2501A23BC3F10E5D9B5D8` | tefNFTOKEN_IS_NOT_TRANSFERABLE | non appliquée au ledger |
| 4 revente via org | resale:org-buy-offer | `A9143808A86510DDBF69568E19A6AF8FC622B10399DE491382EC871A3E366EE0` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/A9143808A86510DDBF69568E19A6AF8FC622B10399DE491382EC871A3E366EE0) |
| 4 revente via org | resale:seller-accept | `364BC5D95DEEF0305B8E6D4707DD4291D4CB3F54F6212ED1E316561ECCC0A818` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/364BC5D95DEEF0305B8E6D4707DD4291D4CB3F54F6212ED1E316561ECCC0A818) |
| 4 revente via org | resale:org-sell-offer | `845C6C359512C6BE26392E36D0AB7E9A2B2E3EC27ABFAF9B51EBF250FE6CA097` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/845C6C359512C6BE26392E36D0AB7E9A2B2E3EC27ABFAF9B51EBF250FE6CA097) |
| 4 revente via org | resale:buyer-accept | `6DEC094C2F4BB654BD615EB105EC0DF6FEEDF1A348E252B6D884C859580AB2E7` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/6DEC094C2F4BB654BD615EB105EC0DF6FEEDF1A348E252B6D884C859580AB2E7) |
| 5 plafond | - | - | refusé (HTTP 400) : prix 30 XRP supérieur au plafond 25 XRP | - |
| 6 check-in | gate:checkin-burn | `B59331C9F3E7033695522DBF3041374F780B80616008A3C43ED15C1277104B65` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/B59331C9F3E7033695522DBF3041374F780B80616008A3C43ED15C1277104B65) |
| 7 rescan | - | - | refusé : billet déjà utilisé (brûlé) | - |
| 8 revente billet brûlé | - | - | refusé : bob ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu) | - |

_tef*/tem* : transaction rejetée avant inclusion dans un ledger (aucun frais, hash introuvable sur l'explorer)._
