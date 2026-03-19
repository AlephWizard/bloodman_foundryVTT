import assert from "node:assert/strict";
import {
  buildBloodmanSupplementalStatusEffects,
  registerBloodmanSupplementalStatusEffects
} from "../../src/rules/status-effects.mjs";

async function run() {
  const definitions = buildBloodmanSupplementalStatusEffects({ systemRootPath: "systems/bloodman" });
  assert.equal(definitions.length, 3);
  assert.deepEqual(
    definitions.map(effect => effect.id),
    ["rage", "support", "hide"]
  );
  assert.deepEqual(
    definitions.map(effect => effect.img),
    [
      "systems/bloodman/images/rage.svg",
      "systems/bloodman/images/support.svg",
      "systems/bloodman/images/hide.svg"
    ]
  );
  assert.deepEqual(
    definitions.map(effect => effect.statuses),
    [["rage"], ["support"], ["hide"]]
  );

  const configured = [
    { id: "dead", statuses: ["dead"], name: "Dead", img: "icons/svg/skull.svg" },
    { id: "support", statuses: ["support"], name: "Support", img: "icons/svg/aura.svg" }
  ];

  const added = registerBloodmanSupplementalStatusEffects(configured, definitions);
  assert.deepEqual(added.map(effect => effect.id), ["rage", "hide"]);
  assert.deepEqual(
    configured.map(effect => effect.id),
    ["dead", "support", "rage", "hide"]
  );
}

run()
  .then(() => {
    console.log("status-effects.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
