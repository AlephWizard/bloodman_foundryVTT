## Objectif
Donner aux agents IA le contexte minimal pour contribuer vite et proprement au systeme Foundry VTT `bloodman`.

### Contexte rapide
- Systeme Foundry v13, entree principale: `bloodman.mjs` (declare dans `system.json`).
- Types de document:
  - Actor: `personnage`, `personnage-non-joueur`
  - Item: `arme`, `objet`, `ration`, `soin`, `protection`, `aptitude`, `pouvoir`
- Templates runtime actifs:
  - `templates/actor-joueur.html`
  - `templates/actor-non-joueur.html`
  - `templates/item-unified.html`
- Localisation FR: `lang/fr.json`.

### Architecture utile
- `bloodman.mjs`: orchestration principale (hooks, sheets, UI, gameplay).
- `rollHelpers.mjs`: jets/degats/soins et helpers associes.
- `src/rules/`: logique metier testable (munitions, rerolls, drops, ressources, etc.).
- `src/hooks/`: integration Foundry (socket/chat/canvas/updates).
- `src/ui/`: regles UI (layout sheets, previews).
- `src/compat/`: wrappers de compatibilite Foundry.
- `src/migrations/`: migrations versionnees et idempotentes.

### Conventions a respecter
- Conserver les chemins de donnees `system.*` utilises par les templates.
- Isoler la logique metier dans `src/rules/` quand possible.
- Eviter les acces Foundry instables hors `src/compat/`.
- Toute migration doit etre idempotente et testee.

### Points d attention
- Les sheets runtime utilisent un template item unifie (`item-unified.html`).
- Les listeners UI doivent correspondre a des selecteurs reellement presents dans les templates.
- Les types declares dans `system.json` doivent rester coherents avec l enregistrement des sheets dans `bloodman.mjs`.

### Validation rapide
- Tests unitaires: `node --test tests/unit/*.test.mjs`
- Verification syntaxe: `node --check bloodman.mjs` et `node --check rollHelpers.mjs`

### Fichiers clefs
- `system.json`
- `bloodman.mjs`
- `templates/actor-joueur.html`
- `templates/actor-non-joueur.html`
- `templates/item-unified.html`
- `lang/fr.json`
