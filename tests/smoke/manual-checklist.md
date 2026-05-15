# Bloodman Smoke Checklist

Objectif: valider rapidement le systeme Bloodman dans Foundry VTT v14 apres une refactorisation, sans tester l'equilibrage ni inventer de nouveaux comportements.

## Preconditions

- [ ] Lancer Foundry VTT v14 avec une world utilisant le systeme `bloodman`.
- [ ] Ouvrir les outils navigateur et garder l'onglet Console visible.
- [ ] Avoir au moins un utilisateur GM et un utilisateur joueur connectables.
- [ ] Creer ou preparer:
  - [ ] un acteur `personnage`;
  - [ ] un acteur `personnage-non-joueur`;
  - [ ] un item `arme`;
  - [ ] un item `objet`;
  - [ ] un item `aptitude`;
  - [ ] un item `pouvoir`;
  - [ ] une scene avec un token joueur et un token PNJ.

## Chargement Et Console

- [ ] Charger la world sans erreur rouge dans la console.
- [ ] Verifier la presence du log `compat:init` avec version/generation Foundry.
- [ ] Verifier que les avertissements eventuels ne bloquent pas le chargement.
- [ ] Verifier que les fichiers CSS et images du systeme se chargent sans 404.
- [ ] Redemarrer la world une fois et confirmer que la migration `schemaVersion` n'est pas rejouee inutilement.
- [ ] Comme GM, verifier que `bloodman.lastMigrationReport` contient un JSON valide apres chargement.

## Fiches Acteurs

- [ ] Ouvrir la fiche joueur depuis la barre laterale.
- [ ] Ouvrir la meme fiche joueur depuis un token sur la scene.
- [ ] Ouvrir la fiche PNJ depuis la barre laterale.
- [ ] Ouvrir la meme fiche PNJ depuis un token sur la scene.
- [ ] Verifier que les tabs s'ouvrent sans erreur: caracteristiques, equipement, aptitudes, pouvoirs, notes si presents.
- [ ] Verifier que PV/PP/PM/voyage sont visibles et coherents.
- [ ] Modifier PV/PP cote GM et verifier que la fiche ouverte se met a jour sans boucle de rerender visible.
- [ ] Modifier une note textarea et verifier que la fenetre ne saute pas et que la saisie reste fluide.
- [ ] Sur fiche joueur, cliquer le bouton Chance et verifier qu'un message de chat est cree.
- [ ] Sur fiche PNJ, verifier que les cases `JET CACHE` sont visibles, cliquables et alignees.
- [ ] En v14, verifier que les fiches utilisent les controles ApplicationV2 attendus, dont le menu d'actions et le detachement de fenetre.

## Droits Joueur Et GM

- [ ] Se connecter comme joueur non-GM.
- [ ] Ouvrir la fiche joueur possedee par ce joueur.
- [ ] Verifier que les champs non autorises restent verrouilles.
- [ ] Verifier que le joueur peut utiliser les actions attendues sur ses items.
- [ ] Depuis le GM, modifier un parametre visible et confirmer que le joueur voit la mise a jour.
- [ ] Verifier qu'une action joueur necessitant relais GM ne produit pas d'erreur socket ou console.

## Inventaire, Sacs Et Equipement

- [ ] Ajouter une arme, un objet, une aptitude et un pouvoir sur la fiche joueur.
- [ ] Verifier que chaque item apparait dans la bonne section.
- [ ] Activer le sac cote GM avec la bascule `Oui`.
- [ ] Verifier que la bascule `Oui/Non` se comporte comme un choix exclusif sur PJ et PNJ.
- [ ] Verifier que le joueur voit le sac deverrouille.
- [ ] Glisser un objet dans le sac cote joueur.
- [ ] Fermer et rouvrir la fiche, puis confirmer que l'objet reste dans le sac.
- [ ] Desactiver le sac et verifier que la zone sac devient inactive sans perdre les items existants.
- [ ] Tester le reordonnancement d'items cote GM.
- [ ] Tester le reordonnancement d'items cote joueur non-GM si l'acteur lui appartient.
- [ ] Supprimer un item lie/equipe et verifier que les liens enfants sont nettoyes sans erreur console.

## Drag And Drop

- [ ] Glisser un item depuis la sidebar vers une fiche joueur.
- [ ] Glisser un item depuis une fiche vers une autre fiche.
- [ ] Glisser un item entre sections compatibles d'une meme fiche.
- [ ] Verifier que les aptitudes ne vont que dans la zone aptitude.
- [ ] Verifier que les pouvoirs ne vont que dans la zone pouvoir.
- [ ] Glisser un Actor PNJ vers la fiche personnage si cette interaction est attendue.
- [ ] Verifier qu'un drop interdit affiche le dialogue ou le warning attendu, sans mutation partielle.
- [ ] Verifier qu'aucune erreur console n'apparait pendant les drops.

## Jets Simples Et Rerolls

- [ ] Faire un jet de caracteristique joueur.
- [ ] Faire un jet de caracteristique PNJ visible.
- [ ] Faire un jet de caracteristique PNJ cache.
- [ ] Tester le reroll joueur et verifier le cout PP/chaos attendu.
- [ ] Tester le reroll PNJ comme GM et verifier la consommation du chaos.
- [ ] Verifier que les messages chat affichent formule, total et contexte lisiblement.

## Degats, Soins Et Dialogues

- [ ] Selectionner une cible token et lancer un jet de degats avec une arme.
- [ ] Lancer une attaque simple depuis l'equipement.
- [ ] Verifier que la formule de l'attaque simple peut etre modifiee (`1d6`, `1d8`, etc.).
- [ ] Ouvrir la fenetre de configuration des degats cote GM.
- [ ] Ouvrir la fenetre de configuration des degats cote joueur.
- [ ] Verifier bonus brut, penetration, formule, source et stepper.
- [ ] Verifier que la configuration de degats memorisee est reprise au prochain dialogue.
- [ ] Appliquer des degats a une cible avec armure/protection.
- [ ] Verifier que le recap chat affiche attaquant, cible, formule, penetration, armure, perte reelle et total.
- [ ] Tester un soin.
- [ ] Tester un pouvoir qui fait des degats.
- [ ] Tester un pouvoir qui soigne.
- [ ] Tester un partage de degats si plusieurs cibles sont selectionnees.
- [ ] Verifier qu'aucun message HTML non echappe n'apparait dans le chat.

## PV Critiques Et Statuts

- [ ] Mettre un PJ a `0 PV`.
- [ ] Verifier que le token PJ affiche le statut saignement sans erreur `ActiveEffect ... does not exist`.
- [ ] Remonter le PJ au-dessus de `0 PV`.
- [ ] Verifier que le statut saignement disparait sans message rouge.
- [ ] Mettre un PNJ a `0 PV`.
- [ ] Verifier que le token PNJ affiche le statut mort sans statut saignement concurrent.
- [ ] Remonter le PNJ au-dessus de `0 PV`.
- [ ] Verifier que le statut mort disparait sans message rouge.

## Combat, Tokens Et HUD

- [ ] Ajouter PJ et PNJ au combat.
- [ ] Lancer l'initiative.
- [ ] Verifier que le nom des combatants est lisible et stable.
- [ ] Passer plusieurs tours et verifier le reset PM attendu.
- [ ] Verifier le focus du token actif si attendu.
- [ ] Ouvrir le TokenHUD et verifier que les icones/statuts Bloodman restent visibles.
- [ ] Tester le compteur HUD de tour si utilise.

## Panneau Du Chaos

- [ ] Comme GM, verifier que le panneau `Bloodman` du chaos apparait.
- [ ] Cliquer `+` et verifier que la valeur augmente.
- [ ] Cliquer `-` et verifier que la valeur baisse sans passer sous `0`.
- [ ] Deplacer le panneau et verifier qu'il reste dans le viewport.
- [ ] Recharger la world et verifier que la position client est conservee.
- [ ] Cliquer `XP`, attribuer de l'XP voyage a un token joueur, puis verifier le chat et la ressource voyage.
- [ ] Cliquer `FULL PV` avec un token joueur selectionne et verifier la restauration.
- [ ] Cliquer `FULL PP` avec un token joueur selectionne et verifier la restauration.
- [ ] Comme joueur, provoquer une demande d'ajustement chaos via reroll et verifier que le GM la recoit/applique sans erreur.

## Fiches Items

- [ ] Ouvrir une fiche item `arme`.
- [ ] Modifier type d'arme, munition, degats, soin et prix.
- [ ] Verifier que la preview prix/vente reste fluide.
- [ ] Ouvrir une fiche `aptitude` et verifier cout XP voyage et options de degats/soin.
- [ ] Ouvrir une fiche `pouvoir` et verifier cout PP et options de degats/soin.
- [ ] Glisser l'image/header d'un item et verifier que les donnees drag sont publiees.

## Performance UI

- [ ] Ouvrir une fiche joueur avec plusieurs items.
- [ ] Changer rapidement de tabs.
- [ ] Modifier rapidement PV/PP/notes.
- [ ] Faire plusieurs drag and drop successifs.
- [ ] Verifier absence de saccade majeure et absence de render infini.
- [ ] Activer temporairement le setting `Bloodman debug sheet performance` si necessaire, puis verifier les logs.

## Modules Bloodman v14 Optionnels

- [ ] `bm-gestion-image`: clic droit/partage d'image depuis une fiche, affichage cote joueur et accuse socket.
- [ ] `bm-horloge`: ouverture de l'horloge, changement des ratios, pop-up lever/coucher du soleil.
- [ ] `bm-lampe-torche`: bouton de HUD token et remise a zero des presets lumiere.
- [ ] `bm-oracle-destin`: macro GM creee, jet du destin et carte chat.
- [ ] `bm-redimensionnement-token` / `bm-resize-token`: champs de cadrage/echelle, persistance apres rechargement.
- [ ] `bm-ui-joueur`: ajustements UI joueur sans masquer les controles GM.

## Criteres De Sortie

- [ ] Aucune erreur rouge persistante au lancement.
- [ ] Aucune erreur console pendant ouverture de fiches, drops, jets, degats et dialogs.
- [ ] Sheets PJ/PNJ ouvrables depuis sidebar et token.
- [ ] Inventaire, sac, aptitudes et pouvoirs stables apres fermeture/reouverture.
- [ ] Jets simples, degats, soins et rerolls fonctionnels cote GM et joueur.
- [ ] Panneau du chaos fonctionnel et position conservee.
- [ ] Aucun ralentissement majeur ou rerender continu observe.
