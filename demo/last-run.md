# Dernière exécution du scénario e2e

- Date : 2026-11-26T13:58:12.679Z
- Réseau : `wss://testnet.xrpl-labs.com`
- Comptes : org `rE8mC4pJ59CXpjN3NUap9Yjx3qBH2GJxxy`, alice `rZNNhwpHAyChhdVgGxo3ZMjARB89ETExZ`, bob `rKNDW4wkuRuHD7NTJE9F46pcYb8E57DXqS`
- Statut : **SUCCÈS**
- Billet suivi : siège **A-001**, NFTokenID `00010000A239C2BF3FD6E1D88655029843C244EAAD595B2BB441F07D000035E1` ([explorer](https://testnet.xrpl.org/nft/00010000A239C2BF3FD6E1D88655029843C244EAAD595B2BB441F07D000035E1))

| Étape | Transaction | Hash | Résultat | Lien |
|---|---|---|---|---|
| 1 mint | mint:A-001 | `92EED249BC908067E7051382629011423306B1EF120B26FE7DB10F90C47A1276` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/92EED249BC908067E7051382629011423306B1EF120B26FE7DB10F90C47A1276) |
| 1 mint | mint:A-002 | `EB48F274AFBD4B95E0474368DFCF58D017A64D22C168B20E62BF2FEC891F74C6` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/EB48F274AFBD4B95E0474368DFCF58D017A64D22C168B20E62BF2FEC891F74C6) |
| 1 mint | mint:A-003 | `DC1D547232FA6AE55FB868546EE5613D4C3D295A6A22EA755A9B17FA5D01AA66` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/DC1D547232FA6AE55FB868546EE5613D4C3D295A6A22EA755A9B17FA5D01AA66) |
| 2 vente primaire | primary:sell-offer | `2408A6FB5B05F4D8C060A44835D19C10C48DA563D7C38C87D58EDA6528EB1845` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/2408A6FB5B05F4D8C060A44835D19C10C48DA563D7C38C87D58EDA6528EB1845) |
| 2 vente primaire | primary:accept | `35528258BB6B2D7769AC7A1113A288DF904F20EB0050563FB57682BAFE260EE8` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/35528258BB6B2D7769AC7A1113A288DF904F20EB0050563FB57682BAFE260EE8) |
| 3 revente directe | direct:seller-sell-offer | `0A127F0F5F148D93C4DC1E47D74BC0245678B3187989553BA1766B2CE45890E0` | tefNFTOKEN_IS_NOT_TRANSFERABLE | non appliquée au ledger |
| 4 revente via org | resale:org-buy-offer | `849FCE4B1DFA7D597BA938B1733AC5C3C501FB577DE924C2D7231460ECE81D4F` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/849FCE4B1DFA7D597BA938B1733AC5C3C501FB577DE924C2D7231460ECE81D4F) |
| 4 revente via org | resale:seller-accept | `2FB18CD916427549FF3264C23040BD13DBB54487EF9A13663B4FE432CE9F63E9` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/2FB18CD916427549FF3264C23040BD13DBB54487EF9A13663B4FE432CE9F63E9) |
| 4 revente via org | resale:org-sell-offer | `B45CB3019F122F0D15FD18C28D0BE1FFF075A9EE3E18A38A8AE59BB18D00029B` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/B45CB3019F122F0D15FD18C28D0BE1FFF075A9EE3E18A38A8AE59BB18D00029B) |
| 4 revente via org | resale:buyer-accept | `099DACB4FCA6EE92AE622896EEAF9CD44FF35A32A6208523F1D093FE4A71584C` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/099DACB4FCA6EE92AE622896EEAF9CD44FF35A32A6208523F1D093FE4A71584C) |
| 5 plafond | - | - | refusé (HTTP 400) : prix 30 XRP supérieur au plafond 25 XRP | - |
| 6 refus | - | - | QR non signé : QR non signé : régénérez le QR depuis « Mes billets » | - |
| 6 refus | - | - | QR expiré : QR expiré (120 s, validité 60 s) : le porteur doit afficher le QR à jour | - |
| 6 refus | - | - | QR daté dans le futur (+60 s) : QR daté dans le futur (+60 s, tolérance 5 s) : horloge incohérente ou QR forgé | - |
| 6 refus | - | - | QR forgé (ts modifié) : QR forgé : signature invalide | - |
| 6 refus | - | - | QR au nom de bob signé par alice : QR forgé : la clé publique ne correspond pas au porteur | - |
| 6 refus | - | - | mauvais détenteur (alice) : le porteur ne détient pas ce billet (mauvais détenteur ou billet inexistant) | - |
| 6 refus | - | - | porteur = org (billet invendu) : porteur = organisateur : billet invendu, il ne donne pas accès | - |
| 6 refus | - | - | autre événement contrôlé : billet de l'événement 1, contrôle de l'événement 2 | - |
| 7 check-in | gate:checkin-burn | `BFBC1D3706B31EA011603497251532F23F1F0374BB46097EB6E2A9FEDF44AA49` | tesSUCCESS | [explorer](https://testnet.xrpl.org/transactions/BFBC1D3706B31EA011603497251532F23F1F0374BB46097EB6E2A9FEDF44AA49) |
| 8 rescan | - | - | refusé : billet déjà utilisé (brûlé) | - |
| 9 revente billet brûlé | - | - | refusé : bob ne détient pas ce billet (absent de account_nfts : brûlé ou déjà revendu) | - |

_tef*/tem* : transaction rejetée avant inclusion dans un ledger (aucun frais, hash introuvable sur l'explorer)._
