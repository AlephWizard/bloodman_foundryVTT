import assert from "node:assert/strict";
import {
  buildDamageRollFlavorMarkup,
  buildGmDamageSummaryMarkup,
  summarizeDamageTargets
} from "../../src/ui/damage-chat.mjs";

async function run() {
  assert.deepEqual(
    summarizeDamageTargets(["Cible A", "Cible B", "Cible C"]),
    { count: 3, label: "Cible A +2" }
  );

  const publicMarkup = buildDamageRollFlavorMarkup({
    attackerName: "Croize",
    targetNames: ["Goule"],
    bonusBrut: 1,
    penetration: 2,
    totalDamage: 9
  });
  assert.equal(publicMarkup.includes("Croize"), true);
  assert.equal(publicMarkup.includes("Goule"), true);
  assert.equal(publicMarkup.includes("Degats bruts"), true);
  assert.equal(publicMarkup.includes("Penetration"), true);
  assert.equal(publicMarkup.includes("Resultat final"), true);
  assert.equal(publicMarkup.includes("PA 2"), false);
  assert.equal(publicMarkup.includes(">2<"), true);
  assert.equal(publicMarkup.includes("Source :"), false);
  assert.equal(publicMarkup.includes(">G<"), false);

  const gmMarkup = buildGmDamageSummaryMarkup({
    attackerName: "Croize",
    targetName: "Goule",
    bonusBrut: 1,
    penetration: 2,
    rolledTotalDamage: 9,
    assignedDamage: 6,
    paInitial: 3,
    paEffective: 1,
    finalDamage: 5,
    hpAfter: 7
  });
  assert.equal(gmMarkup.includes("Suivi MJ"), true);
  assert.equal(gmMarkup.includes(">G<"), false);
  assert.equal(gmMarkup.includes("Degats bruts"), true);
  assert.equal(gmMarkup.includes("Penetration"), true);
  assert.equal(gmMarkup.includes("Resultat final"), true);
  assert.equal(gmMarkup.includes("PA 2"), false);
  assert.equal(gmMarkup.includes("Total avant armure"), true);
  assert.equal(gmMarkup.includes("Armure"), true);
  assert.equal(gmMarkup.includes("Perte reelle"), true);
  assert.equal(gmMarkup.includes("PV actuels"), true);
  assert.equal(gmMarkup.includes("Source :"), false);
}

run()
  .then(() => {
    console.log("damage-chat-ui.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
