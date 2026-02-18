# Bloodman Developer Guide

## Project Structure
- `bloodman.mjs`: point d'entree principal, hooks, sheets et orchestration.
- `rollHelpers.mjs`: logique de jets, degats, ressources et fallback socket.
- `src/compat/`: couche de compatibilite Foundry (version + wrappers API instables).
- `src/migrations/`: migrations de donnees versionnees et idempotentes.
- `src/hooks/`: handlers de hooks Foundry extraits par domaine (canvas, items derives, actors, combat/tokens).
- `src/rules/`: calculs metier purs (ressources/caracteristiques) reutilisables et testables.
- `utils/`: logger, settings et utilitaires de permissions.
- `templates/`: vues Handlebars des sheets Actor/Item.
- `styles/`: CSS du systeme.
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
- `node tests/unit/compat-version.test.mjs`
- `node tests/unit/migrations-note.test.mjs`
- `node tests/unit/migrations-actor-structure.test.mjs`
- `node tests/unit/derived-resources.test.mjs`
- `node tests/unit/actor-updates.test.mjs`
- `node tests/unit/actor-sheet-layout.test.mjs`
- `node tests/unit/item-sheet-price-preview.test.mjs`
- `node tests/unit/ui-refresh-queue.test.mjs`
- Smoke Foundry:
- suivre `tests/smoke/manual-checklist.md`
