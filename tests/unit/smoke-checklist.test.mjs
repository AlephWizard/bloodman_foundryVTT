import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");

function run() {
  const checklist = fs.readFileSync(path.join(SYSTEM_ROOT, "tests/smoke/manual-checklist.md"), "utf8");
  const requiredHeadings = [
    "## Preconditions",
    "## Chargement Et Console",
    "## Fiches Acteurs",
    "## Droits Joueur Et GM",
    "## Inventaire, Portage Et Equipement",
    "## Drag And Drop",
    "## Jets Simples Et Rerolls",
    "## Degats, Soins Et Dialogues",
    "## PV Critiques Et Statuts",
    "## Combat, Tokens Et HUD",
    "## Panneau Du Chaos",
    "## Fiches Items",
    "## Performance UI",
    "## Criteres De Sortie"
  ];

  for (const heading of requiredHeadings) {
    assert.equal(checklist.includes(heading), true, `Smoke checklist should include ${heading}`);
  }

  const requiredChecks = [
    "Ouvrir la fiche joueur depuis la barre laterale",
    "Ouvrir la meme fiche joueur depuis un token sur la scene",
    "Modifier la limite maximale d'objets transportables cote GM sur PJ et PNJ",
    "Ouvrir la fenetre de configuration des degats cote GM",
    "Ouvrir la fenetre de configuration des degats cote joueur",
    "Comme GM, verifier que le panneau `Bloodman` du chaos apparait",
    "Aucune erreur console pendant ouverture de fiches, drops, jets, degats et dialogs"
  ];

  for (const check of requiredChecks) {
    assert.equal(checklist.includes(check), true, `Smoke checklist should cover: ${check}`);
  }
}

run();
console.log("smoke-checklist.test.mjs: OK");
