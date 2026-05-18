# Bloodman Developer Guide

## Project Structure
- `bloodman.mjs`: point d'entree principal, hooks, sheets et orchestration.
- `src/dice/roll-helpers.mjs`: orchestration publique des jets, degats, ressources et fallback socket.
- `src/dice/damage-config-options.mjs`: options et validation des formules de degats.
- `src/dice/damage-dialog-memory.mjs`: persistance utilisateur de la configuration de degats.
- `src/dice/weapon-category.mjs`: normalisation des types/catégories d'armes.
- `src/compat/`: couche de compatibilite Foundry (version + wrappers API instables).
- `src/migrations/`: migrations de donnees versionnees et idempotentes.
- `src/hooks/`: handlers et wrappers de hooks Foundry extraits par domaine (canvas, cycles de vie actor/item, items derives, combat/tokens, HUD).
- `src/hooks/actor-lifecycle.mjs`: orchestration `updateActor` et invalidation des caches de fiches ouvertes, incluant la propagation de l'etat des sacs.
- `src/hooks/item-lifecycle.mjs`: orchestration `createItem` / `preCreateItem` / `preUpdateItem` / `updateItem` / `deleteItem`, en gardant l'ordre des normalisations.
- `src/hooks/token-hud-lifecycle.mjs`: hooks Foundry du TokenHUD (`renderTokenHUD`, `canvasReady`, `controlToken`, `ready`) et activation defensive des patches HUD.
- `src/sheets/`: enregistrement, partials Handlebars, options de rendu et glue des sheets Foundry.
- `src/sheets/actor-item-dnd.mjs`: orchestration drag/drop acteur (payloads, handlers DOM, survols, tri, colonnes et relais de reorder) appelee par `BloodmanActorSheet`.
- `src/sheets/drop-document-resolution.mjs`: adaptateur Foundry pour resoudre et cacher les documents Item issus des drag/drop.
- `src/sheets/open-actor-sheets.mjs`: cache des acteurs/tokens resolus, matching des fiches ouvertes et patch DOM backpack.
- `src/sheets/sheet-dom.mjs`: helpers DOM/base-data partages par les sheets v1/v2.
- `src/ui/`: helpers UI extraits des sheets et dialogues (chat, layout, dialogues, panneau du chaos, decoration des types de documents).
- `src/ui/actor-sheet-layout.mjs`: regles pures de layout de la fiche acteur (auto-resize, taille/position de fenetre, mode responsive).
- `src/ui/actor-sheet-numeric-focus.mjs`: conservation/restauration du focus des champs numeriques des fiches acteurs.
- `src/ui/actor-sheet-permissions.mjs`: application DOM des permissions interactives GM/Joueur sur les fiches acteurs.
- `src/ui/dialog-rendering.mjs`: facade Dialog/DialogV2 compatible Foundry v14 pour les dialogues Bloodman.
- `src/ui/file-picker.mjs`: resolution et rendu defensif du FilePicker Foundry.
- `src/ui/item-sheet-controls.mjs`: controles UI de la fiche Item pour FilePicker audio, preview prix et champs dependants des interrupteurs.
- `src/ui/item-sheet-equip-with.mjs`: drag/drop et gestion des templates `Equiper avec` de la fiche Item.
- `src/ui/item-sheet-layout.mjs`: layout responsive, observateurs et autogrow textarea de la fiche Item.
- `src/ui/token-hud.mjs`: orchestration TokenHUD Foundry v14 (fondations DOM, resolution multi-token, cache SVG, compteurs d'effets, selecteur de tours, bindings et patches render/observer).
- `src/ui/token-effect-background.mjs`: patch visuel des fonds d'icones d'effets token.
- `src/rules/`: calculs metier purs (ressources/caracteristiques) reutilisables et testables.
- `src/rules/status-effect-sync.mjs`: resolution, familles et synchronisation defensive des statuts Actor/Token.
- `src/rules/zero-pv-status.mjs`: orchestration PV a zero, statut bleeding/dead et preset corporel associe.
- `src/rules/token-images.mjs`: validation, reparation et synchronisation des images Actor/Token/prototype token.
- `src/rules/player-resource-actions.mjs`: actions GM sur les ressources joueurs selectionnees (XP voyage, restauration PP/PV) avec dependances Foundry injectees pour les tests.
- `src/core/`: constantes systeme, logger, localisation, settings et utilitaires de permissions.
- `utils/`: points de compatibilite (re-exports) pour anciens chemins.
- `templates/`: vues Handlebars des sheets Actor/Item.
- `templates/partials/`: fragments Handlebars partages et precharges au `init`.
- `styles/`: CSS du systeme, avec `styles/bloodman.css` comme facade d'imports.
- `styles/base/`: fondations partagees et surcharges communes.
- `styles/actors/`: sections CSS de la fiche acteur `personnage` / `personnage-non-joueur`.
- `styles/dialogs/`: styles des dialogues Bloodman.
- `styles/items/`: sections CSS de la fiche item unifiee.
- `styles/ui/`: panneaux et widgets UI hors sheets.
- `lang/`: traductions.
- `tests/`: tests unitaires minimaux, fixtures migration, checklist smoke.

## Conventions
- Eviter d'acceder directement aux API Foundry instables.
- Utiliser `src/compat/index.mjs` pour:
- version Foundry (`foundryVersion`, `isV10Plus...`),
- resolution UUID (`compatFromUuid`, `compatFromUuidSync`),
- sockets (`socketEmit`, `socketOn`, `socketOff`),
- drag/drop et enrichissement texte.
- Prioriser des fonctions pures pour les calculs metier (testables hors Foundry).
- Toute migration doit etre idempotente et journalisee.

## Refactorisation Progressive
- `bloodman.mjs` reste le point d'entree charge par le manifest Foundry v14, mais les helpers transverses doivent etre extraits progressivement vers `src/`.
- Les extractions doivent conserver les signatures publiques appelees par les sheets/hooks existants.
- Les helpers de dialogue et FilePicker passent par les facades compat pour supporter l'API v14 tout en gardant les fallbacks legacy.
- La synchro des statuts Actor/Token est isolee dans `src/rules/status-effect-sync.mjs`; garder les seuils/metiers de PV dans l'orchestration appelante.
- Le domaine TokenHUD est maintenant regroupe dans `src/ui/token-hud.mjs`; conserver `bloodman.mjs` comme simple point d'attache des hooks Foundry.
- Le patch visuel des fonds d'effets token est isole dans `src/ui/token-effect-background.mjs` et reste appele par les hooks canvas/combat.
- Passage C: la logique PV a zero est isolee dans `src/rules/zero-pv-status.mjs`; `bloodman.mjs` conserve des wrappers stables pour les hooks Foundry v14 existants.
- Passage D: la logique images Actor/Token/prototype est isolee dans `src/rules/token-images.mjs`; les hooks continuent d'utiliser les wrappers de `bloodman.mjs`.
- Passage E: la glue acteurs/tokens resolus, fiches ouvertes et backpack DOM est isolee dans `src/sheets/open-actor-sheets.mjs`.
- Passage G: la resolution Foundry des drag/drop Item est isolee dans `src/sheets/drop-document-resolution.mjs`, avec cache TTL et fallback Actor.Item.
- Passage H1: le layout responsive et l'autogrow de `BloodmanItemSheet` sont isoles dans `src/ui/item-sheet-layout.mjs`.
- Passage H2: les controles audio FilePicker et preview prix de `BloodmanItemSheet` sont isoles dans `src/ui/item-sheet-controls.mjs`.
- Passage H3: le drag/drop `Equiper avec` de `BloodmanItemSheet` est isole dans `src/ui/item-sheet-equip-with.mjs`.
- Passage I: les actions GM de ressources joueurs (XP voyage, restauration PP/PV) sont isolees dans `src/rules/player-resource-actions.mjs`; `bloodman.mjs` conserve les wrappers appeles par le panneau du chaos et les dialogues. Le CSS de ces dialogues est separe dans `styles/dialogs/player-resource-actions.css`.
- Passage J: compatibilite Foundry v14 nettoyee sur les partials Handlebars (`foundry.applications.handlebars.loadTemplates`) et les popups de suivi degats, qui passent par la facade DialogV2. Le cache de resolution drag/drop Item ne conserve plus les echecs temporaires.
- Passage K: le coeur drag/drop acteur (helpers DOM, payloads, dragover/dragstart, reorder et handler binding) est isole dans `src/sheets/actor-item-dnd.mjs`; `BloodmanActorSheet` garde les wrappers et les regles metier sac/liens existantes.

### Points a reduire en priorite
- `bloodman.mjs`: concentre encore les classes de sheets Actor/Item et les flux inventaire complexes; les domaines TokenHUD, PV a zero, images token, fiches ouvertes, resolution drop Item, layout/permissions/focus Actor, layout/controles Item, cycle de vie Actor/Item et drag/drop Equiper avec sont maintenant des modules appeles par wrappers.
- `bloodman.mjs`: les prochains blocs a extraire proprement sont les dialogues de cout XP voyage a la creation, les flux d'inventaire acteur restants (etat des colonnes/sac et payload equipement) et les classes de sheets elles-memes, idealement par facade `src/sheets/` avant de deplacer les classes.
- `styles/dialogs/bloodman-dialog-overrides.css`: regroupe plusieurs familles de dialogues; le separer par domaine visuel gardera l'ordre d'import actuel plus lisible.
- `src/dice/roll-helpers.mjs`: orchestre de nombreux flux de jets; les branches pures devraient continuer a migrer vers `src/rules/` et les rendus vers `src/ui/`.
- `templates/actor-joueur.html` et `templates/actor-non-joueur.html`: fortement charges; extraire de nouveaux partials par section reduira le risque lors des evolutions de fiche.

## Ajouter une Feature
1. Isoler la logique metier dans une fonction utilitaire (eviter de gonfler les hooks).
2. Brancher la logique dans les hooks/sheets existants.
3. Ajouter un test unitaire minimal si la logique est pure.
4. Mettre a jour la checklist smoke si la feature touche UI/combat/chat.

## Ajouter une Migration
1. Ajouter/adapter une etape dans `src/migrations/index.mjs` avec un `version` strictement croissant.
2. Garantir l'idempotence:
- ne modifier que si necessaire,
- supporter la reexecution sans effet secondaire.
3. Journaliser les erreurs avec un resultat explicite (`failedUpdates`) et ne pas faire avancer `schemaVersion` en cas d'echec.
4. Ajouter une fixture JSON dans `tests/fixtures/migrations/`.
5. Ajouter/mettre a jour un test unitaire de transformation.
6. Parametrage runtime migration:
- `bloodman.schemaVersion` (version appliquee),
- `bloodman.includeCompendiumMigrations` (migration des packs Actor/Item non verrouilles),
- `bloodman.lastMigrationReport` (JSON du dernier run pour audit/diagnostic).

## Supporter une Nouvelle Version Foundry
1. Mettre a jour `src/compat/version.mjs` si la detection evolue.
2. Verifier les wrappers `src/compat/foundry-api.mjs` (UUID, socket, TextEditor, document class).
3. Remplacer dans le code les acces directs a une API instable par le wrapper compat correspondant.
4. Executer la checklist smoke `tests/smoke/manual-checklist.md`.
5. Ajuster `system.json` (`compatibility.minimum/verified/maximum`) seulement apres validation.

## Tests Locaux
- Unitaires (si Node disponible):
- `node tests/unit/actor-item-dnd.test.mjs`
- `node tests/unit/compat-version.test.mjs`
- `node tests/unit/migrations-note.test.mjs`
- `node tests/unit/migrations-actor-structure.test.mjs`
- `node tests/unit/derived-resources.test.mjs`
- `node tests/unit/actor-updates.test.mjs`
- `node tests/unit/actor-lifecycle.test.mjs`
- `node tests/unit/actor-sheet-layout.test.mjs`
- `node tests/unit/actor-sheet-numeric-focus.test.mjs`
- `node tests/unit/actor-sheet-permissions.test.mjs`
- `node tests/unit/item-lifecycle.test.mjs`
- `node tests/unit/item-sheet-price-preview.test.mjs`
- `node tests/unit/item-sheet-controls.test.mjs`
- `node tests/unit/item-sheet-equip-with.test.mjs`
- `node tests/unit/item-sheet-layout.test.mjs`
- `node tests/unit/ui-refresh-queue.test.mjs`
- `node tests/unit/css-architecture.test.mjs`
- `node tests/unit/handlebars-helpers.test.mjs`
- `node tests/unit/render-options.test.mjs`
- `node tests/unit/template-partials.test.mjs`
- `node tests/unit/drop-document-resolution.test.mjs`
- `node tests/unit/open-actor-sheets.test.mjs`
- `node tests/unit/player-resource-actions.test.mjs`
- `node tests/unit/token-hud-lifecycle.test.mjs`
- `node tests/unit/token-images.test.mjs`
- `node tests/unit/zero-pv-status.test.mjs`
- `node tests/unit/module-linkage.test.mjs`
- Smoke Foundry:
- suivre `tests/smoke/manual-checklist.md`
