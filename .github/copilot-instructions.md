## Objectif
Fournir aux agents IA les informations essentielles pour être immédiatement productifs sur ce dépôt Foundry VTT "Bloodman".

### Contexte rapide
- Système Foundry v13 minimal. Entrée principale : `bloodman.mjs` (déclaré dans `system.json`).
- Types de document custom : Actor `personnage`, Item `arme`.
- Templates Handlebars dans `templates/` ; localisation française dans `lang/fr.json` (actuellement vide).

### Ce que l'agent doit savoir d'emblée
- `system.json` déclare `esmodules: ["bloodman.mjs"]`, styles et languages — modifier seulement si vous ajoutez de nouveaux fichiers.
- `bloodman.mjs` contient : enregistrement des sheets (`Actors.registerSheet`, `Items.registerSheet`), hooks `init`/`ready`, classes `BloodmanActorSheet` et `BloodmanItemSheet`, et handlers de jets.
- Données persistées : structure `actor.system.*` (ex : `characteristics.{KEY}.base`, `modifiers.{KEY}`, `resources`, `ammoPool`). Respecter ces chemins pour les inputs de template.
- Templates utilisent `name="system.*"` bindings `system.*` pour updates automatiques — ne pas renommer sans mettre à jour `getData()`.

### Conventions projet (à respecter)
- Noms de types : utilisez `personnage` pour Actor, `arme` pour Item. Voir `system.json`.
- Caractéristiques : listées dans `CHARACTERISTICS` dans `bloodman.mjs`. Toute modification doit être reflétée dans la création initiale (hook `ready`) et dans `getData()`.
- Jets : mécanique actuelle = `1d100` vs `effective = base + modifiers`. Les handlers sont dans `renderActorSheet` et `BloodmanActorSheet.rollDamage`.
- I18N : créer des clés dans `lang/fr.json` et remplacer chaînes codées en dur dans `bloodman.mjs` et templates via `game.i18n.localize('Key')`.

### Exemples pratiques (copier-coller)
- Ajouter une caractéristique (update `CHARACTERISTICS` + `getData()` behavior):
```js
// bloodman.mjs
const CHARACTERISTICS = [ { key: "MEL", label: "MÊLÉE" }, /* ... */ ];
```
- Centraliser un helper de roll :
```js
function doCharacteristicRoll(actor, key) { /* calcul effective, Roll 1d100, toMessage */ }
```
- Accéder/modifier munitions : `actor.update({"system.ammoPool.0.value": newValue})` (utilisé dans `rollDamage`).

### Flux de développement & tests (rapide)
- Développer dans `d:/FoundryVTT/Data/systems/bloodman`.
- Recharger Foundry en navigateur après modifications : `Ctrl+R` (ou `Ctrl+Shift+R` si cache persiste).
- Ouvrir la console dev (F12) pour erreurs JS et traces. Vérifier permissions utilisateur sur actions (suppression d'item / updates).
- Aucun bundler détecté : éditez directement `bloodman.mjs`. Si vous ajoutez des modules, documentez le build et mettez à jour `system.json`.

### Points sensibles à valider lors de changements
- Ne pas casser les chemins `system.*` attendus par les templates — chaque `name` doit correspondre à une propriété existante.
- Les hooks `init` et `ready` sont utilisés pour l'enregistrement et la migration minimale ; évitez des effets de bord lourds dans `ready`.
- Multi-utilisateurs : les actions qui `update()` doivent vérifier la permission/contrôle si nécessaire.

### Où regarder pour exemples et modifications rapides
- `system.json` — métadonnées et types
- `bloodman.mjs` — logique principale, hooks, sheets, rolls
- `templates/actor-personnage.html` et `templates/item-arme.html` — bindings et UI
- `lang/fr.json` — I18N (à remplir)

### Demande de feedback
Avant d'appliquer des refactors larges (extraction de helpers, i18n complet, ajout de bundler), dites si vous préférez :
- Priorité A : factoriser les jets et extraire helpers.
- Priorité B : internationaliser toutes les chaînes.
- Priorité C : ajouter tests/scripts de build.

Merci — proposez la priorité et j'implémente le patch correspondant.
