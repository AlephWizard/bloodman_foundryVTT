# Bloodman Smoke Checklist

1. Lancer Foundry VTT et ouvrir une world avec le systeme Bloodman.
2. Verifier la console:
- Absence d'erreur au chargement.
- Presence d'un log `compat:init` avec version/generation Foundry.
- En v14, verifier que les avertissements restants concernent uniquement des API depreciees (`appv1`) et pas des erreurs bloquantes.
3. Creer un actor `personnage` et un actor `personnage-non-joueur`.
4. Ouvrir les sheets, verifier:
- Valeurs PV/PP et jauges visibles.
- Aucune boucle de rerender apparente.
- Sur fiche joueur, le bouton Chance dans l'en-tete se clique facilement sur toute sa zone et poste un message de chat.
- Sur fiches joueur et PNJ, les caracteristiques gardent un espacement lisible entre la valeur, `/100` et le nom.
- Sur fiche PNJ, les cases `JET CACHE` sont visibles, cliquables et alignees avec les caracteristiques.
- En v14, verifier que les fiches PJ/PNJ utilisent les controles natifs ApplicationV2, avec le menu d'actions en haut a droite et l'action de detachement de fenetre.
5. Creer un item `arme`, lancer un jet de degats avec cible selectionnee.
- Verifier que `Attaque simple` dans l'equipement permet de modifier librement la formule (`1d6`, `1d8`, etc.) sur fiche joueur et PNJ.
- Verifier dans l'onglet equipement que le bouton `+` des munitions est noir, que la selection de ligne est facile a cliquer, et que recharger consomme la ligne active.
- Verifier que la bascule de sac `Oui/Non` se comporte comme un choix exclusif et reste lisible sur fiches joueur et PNJ.
6. Tester les PV et statuts critiques:
- PJ a `0 PV`: le token affiche le statut saignement, sans erreur console `ActiveEffect ... does not exist`.
- PJ remonte au-dessus de `0 PV`: le statut saignement disparait sans message rouge.
- PNJ a `0 PV`: le token affiche le statut mort, sans statut saignement concurrent.
- PNJ remonte au-dessus de `0 PV`: le statut mort disparait sans message rouge.
7. Verifier les messages chat:
- Affichage normal des jets.
- Le message de degats affiche attaquant, cible, formule et total de facon lisible.
- Le recap MJ reste reserve au GM, affiche formule/jet/penetration/armure/perte reelle et reste visuellement distinct.
- Message de synthese initiative sans HTML non echappe.
8. Tester drag-and-drop d'un Actor PNJ vers la fiche personnage.
9. Tester suppression/reordonnancement d'items cote joueur non-GM (fallback socket).
10. Redemarrer la world:
- Verifier que la migration `schemaVersion` n'est pas rejouee inutilement.
11. Migration (GM):
- Verifier dans les settings world que `bloodman.lastMigrationReport` contient un JSON valide apres chargement.
- Optionnel: activer `bloodman.includeCompendiumMigrations`, relancer la world, puis verifier que le report indique `includeCompendiums: true`.
12. Perf UI Sheets:
- Ouvrir une fiche personnage, modifier rapidement PV/PP et notes textarea: verifier absence de saccades majeures et resize de fenetre stable.
- Ouvrir une fiche item avec prix/vente, saisir rapidement dans les deux champs: verifier preview fluide sans cloture/reouverture de sheet.
13. Modules Bloodman v14:
- `bm-gestion-image`: clic droit/partage d'image depuis une fiche, affichage cote joueur et accuse socket.
- `bm-horloge`: ouverture de l'horloge, changement des ratios, pop-up lever/coucher du soleil.
- `bm-lampe-torche`: bouton de HUD token et remise a zero des presets lumiere.
- `bm-oracle-destin`: macro GM creee, jet du destin et carte chat.
- `bm-redimensionnement-token` / `bm-resize-token`: champs de cadrage et echelle sur fiche/token, persistance apres rechargement.
- `bm-ui-joueur`: masquage/ajustements UI joueur sans masquer les controles GM.

## Checklist minimale apres refactorisation

- Ouvrir une fiche joueur depuis le menu lateral.
- Ouvrir la meme fiche joueur depuis un token sur la scene.
- Modifier un parametre cote GM et verifier qu'il apparait cote joueur.
- Activer le bouton oui du sac objet cote GM.
- Verifier que le joueur voit le sac deverrouille.
- Glisser un objet dans le sac cote joueur.
- Verifier que l'objet reste bien dans le sac apres fermeture et reouverture de la fiche.
- Tester les jets de degats cote GM.
- Tester les jets de degats cote joueur.
- Comparer les fenetres de configuration GM et joueur.
- Verifier la console navigateur.
- Verifier qu'il n'y a pas d'erreur au lancement du monde.
- Verifier qu'il n'y a pas d'erreur lors du drag and drop d'un objet.
- Verifier qu'il n'y a pas de ralentissement important sur les fiches.
