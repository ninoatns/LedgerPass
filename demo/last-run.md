# Dernière exécution du scénario e2e

- Date : 2026-11-26T11:45:50.757Z
- Réseau : `wss://testnet.xrpl-labs.com`
- Comptes : org `rhbNH2oD69dnQ6jebAmqkuTezt1YNa5qwu`, alice `rpcVkpNjwZ5UXpPnwtJufvDoe7cjrVUy3p`, bob `rGtCFKQrUnHa1XjjqM7oo98mdmc7CMZKQj`
- Statut : **SUCCÈS**
- Billet suivi : siège **A-044**, NFTokenID `0001000027619C4E54C6A0E857636B4A0FEBCC54695C89F48F56A5CE00002834` ([explorer](https://testnet.xrpl.org/nft/0001000027619C4E54C6A0E857636B4A0FEBCC54695C89F48F56A5CE00002834))

| Étape | Transaction | Hash | Résultat | Lien |
|---|---|---|---|---|
| 1 mint | mint:A-044 | `2D35D979168E2A02731CAF26082FB55E294F1B3E39B284DA7C5954B2463A7A80` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/2D35D979168E2A02731CAF26082FB55E294F1B3E39B284DA7C5954B2463A7A80) |
| 1 mint | mint:A-045 | `B6EAF62480D15E8DF4CD37CB703CA71BFCE26A079498AD2D72D0053AC4FE5569` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/B6EAF62480D15E8DF4CD37CB703CA71BFCE26A079498AD2D72D0053AC4FE5569) |
| 1 mint | mint:A-046 | `77FC1CA1DC576B68BBE4807721BC5A2EE2A8D149A6670722A684933EC4E945E2` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/77FC1CA1DC576B68BBE4807721BC5A2EE2A8D149A6670722A684933EC4E945E2) |
| 2 vente primaire | primary:sell-offer | `D58F6677E379B4B3922A86BA2C4BDD195BA71F38C8BAE6D5062EE757D82D225F` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/D58F6677E379B4B3922A86BA2C4BDD195BA71F38C8BAE6D5062EE757D82D225F) |
| 2 vente primaire | primary:accept | `804DE65F0CEB387F2FB681F4E4443DDE96EFBEF58D54C61B57116240529411CA` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/804DE65F0CEB387F2FB681F4E4443DDE96EFBEF58D54C61B57116240529411CA) |
| 3 revente directe | direct:seller-sell-offer | `2674A8C9C508EC39BE37C5D5145603C7F5BCAD0BEC3C351F2624BCDFD6CCB46C` | tefNFTOKEN_IS_NOT_TRANSFERABLE | non appliquée au ledger |
| 4 revente via org | resale:org-buy-offer | `03A52CB5ADFBA18CD86748FBA5A5D8C24F928004068812D94F71948C63D4A65F` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/03A52CB5ADFBA18CD86748FBA5A5D8C24F928004068812D94F71948C63D4A65F) |
| 4 revente via org | resale:seller-accept | `9F91DE2A096514B490450DC1F7FE1779B6F5C4040BC9911BC73A58FAD2A75D1A` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/9F91DE2A096514B490450DC1F7FE1779B6F5C4040BC9911BC73A58FAD2A75D1A) |
| 4 revente via org | resale:org-sell-offer | `0328D1DBB8E17B46AFCADC63311FDAC2A74D7054CF4FBE6EC4E609E7579A40C9` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/0328D1DBB8E17B46AFCADC63311FDAC2A74D7054CF4FBE6EC4E609E7579A40C9) |
| 4 revente via org | resale:buyer-accept | `43CD4E49D764BBA15EFEAF72638C44DD91EB6F1558CF7FDF7214A2CD64C5E378` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/43CD4E49D764BBA15EFEAF72638C44DD91EB6F1558CF7FDF7214A2CD64C5E378) |
| 5 plafond | - | - | refusé (HTTP 400) : prix 30 XRP supérieur au plafond 25 XRP | - |
| 6 refus | - | - | QR non signé : QR non signé : régénérez le QR depuis « Mes billets » | - |
| 6 refus | - | - | QR expiré : QR expiré (120 s, validité 60 s) : le porteur doit afficher le QR à jour | - |
| 6 refus | - | - | QR daté dans le futur (+60 s) : QR daté dans le futur (+60 s, tolérance 5 s) : horloge incohérente ou QR forgé | - |
| 6 refus | - | - | QR forgé (ts modifié) : QR forgé : signature invalide | - |
| 6 refus | - | - | QR au nom de bob signé par alice : QR forgé : la clé publique ne correspond pas au porteur | - |
| 6 refus | - | - | mauvais détenteur (alice) : le porteur ne détient pas ce billet (mauvais détenteur ou billet inexistant) | - |
| 6 refus | - | - | porteur = org (billet invendu) : porteur = organisateur : billet invendu, il ne donne pas accès | - |
| 6 refus | - | - | autre événement contrôlé : billet de l'événement 1, contrôle de l'événement 2 | - |
| 7 check-in | gate:checkin-burn | `DFB989352F29BD9DAB049D400A0FBDE49DF93A4835FDE5A158D412CF271D2C8B` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/DFB989352F29BD9DAB049D400A0FBDE49DF93A4835FDE5A158D412CF271D2C8B) |
| 8 rescan | - | - | refusé : billet déjà utilisé (brûlé) | - |
| 9 revente billet brûlé | - | - | refusé : bob ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu) | - |

_tef*/tem* : transaction rejetée avant inclusion dans un ledger (aucun frais, hash introuvable sur l'explorer)._
