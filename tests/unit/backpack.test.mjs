import assert from "node:assert/strict";
import {
  actorHasPersistedBackpackItems,
  isItemPersistedInBackpack,
  normalizeBackpackBoolean,
  resolveActorBackpackEnabled
} from "../../src/rules/backpack.mjs";

async function run() {
  assert.equal(normalizeBackpackBoolean("yes"), true);
  assert.equal(normalizeBackpackBoolean("false"), false);
  assert.equal(normalizeBackpackBoolean("", true), false);
  assert.equal(normalizeBackpackBoolean(undefined, true), true);

  assert.equal(
    isItemPersistedInBackpack({
      type: "objet",
      flags: { bloodman: { carryColumn: "bag" } }
    }),
    true
  );
  assert.equal(
    isItemPersistedInBackpack({
      type: "objet",
      flags: { bloodman: { inBag: "yes" } }
    }),
    true
  );
  assert.equal(
    isItemPersistedInBackpack({
      type: "aptitude",
      flags: { bloodman: { carryColumn: "bag" } }
    }),
    false
  );

  const actor = {
    system: { equipment: { bagSlotsEnabled: false } },
    items: [
      { type: "objet", flags: { bloodman: { carryColumn: "bag" } } }
    ]
  };
  assert.equal(actorHasPersistedBackpackItems(actor), true);
  assert.deepEqual(resolveActorBackpackEnabled(actor), {
    enabled: true,
    source: "item-flags"
  });
  assert.deepEqual(resolveActorBackpackEnabled({
    system: { equipment: { bagSlotsEnabled: "no" } },
    items: []
  }), {
    enabled: false,
    source: "actor"
  });
  assert.deepEqual(resolveActorBackpackEnabled({
    isToken: true,
    token: { actorLink: true },
    baseActor: { system: { equipment: { bagSlotsEnabled: true } } },
    system: { equipment: { bagSlotsEnabled: false } },
    items: []
  }), {
    enabled: true,
    source: "base-actor"
  });
}

run()
  .then(() => {
    console.log("backpack.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
