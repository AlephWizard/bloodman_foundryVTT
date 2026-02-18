# Bloodman Smoke Checklist

1. Lancer Foundry VTT et ouvrir une world avec le systeme Bloodman.
2. Verifier la console:
- Absence d'erreur au chargement.
- Presence d'un log `compat:init` avec version/generation Foundry.
3. Creer un actor `personnage` et un actor `personnage-non-joueur`.
4. Ouvrir les sheets, verifier:
- Valeurs PV/PP et jauges visibles.
- Aucune boucle de rerender apparente.
5. Creer un item `arme`, lancer un jet de degats avec cible selectionnee.
6. Verifier les messages chat:
- Affichage normal des jets.
- Message de synthese initiative sans HTML non echappe.
7. Tester drag-and-drop d'un Actor PNJ vers la fiche personnage.
8. Tester suppression/reordonnancement d'items cote joueur non-GM (fallback socket).
9. Redemarrer la world:
- Verifier que la migration `schemaVersion` n'est pas rejouee inutilement.
10. Migration (GM):
- Verifier dans les settings world que `bloodman.lastMigrationReport` contient un JSON valide apres chargement.
- Optionnel: activer `bloodman.includeCompendiumMigrations`, relancer la world, puis verifier que le report indique `includeCompendiums: true`.
11. Perf UI Sheets:
- Ouvrir une fiche personnage, modifier rapidement PV/PP et notes textarea: verifier absence de saccades majeures et resize de fenetre stable.
- Ouvrir une fiche item avec prix/vente, saisir rapidement dans les deux champs: verifier preview fluide sans cloture/reouverture de sheet.
