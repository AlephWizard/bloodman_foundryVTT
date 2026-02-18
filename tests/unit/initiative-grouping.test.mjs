import assert from "node:assert/strict";
import { buildInitiativeGroupingHooks } from "../../src/hooks/initiative-grouping.mjs";

async function run() {
  const created = [];
  const deleted = [];
  const combat = {
    id: "c1",
    name: "Combat Test",
    combatants: new Map([
      ["cb1", { id: "cb1", name: "Alpha", initiative: 3 }],
      ["cb2", { id: "cb2", name: "Bravo", initiative: 8 }]
    ])
  };
  const gameRef = {
    user: { id: "u1" },
    combats: new Map([["c1", combat]])
  };

  const hooks = buildInitiativeGroupingHooks({
    initiativeGroupBufferMs: 5,
    getProperty: (object, path) => String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object),
    getCombatantDisplayName: combatant => combatant.name,
    escapeChatMarkup: value => String(value).replace(/</g, "&lt;"),
    getGame: () => gameRef,
    createChatMessage: async data => {
      created.push(data);
      return data;
    }
  });

  assert.equal(hooks.isInitiativeRollMessage({
    flags: { bloodman: { initiativeGroupSummary: true } }
  }), false);
  assert.equal(hooks.isInitiativeRollMessage({
    flags: { core: { initiativeRoll: true } }
  }), true);
  assert.equal(hooks.isInitiativeRollMessage({
    speaker: { combatant: "cb1" },
    rolls: [{ total: 5 }],
    flavor: "Jet Initiative"
  }), true);
  assert.equal(hooks.isInitiativeRollMessage({
    speaker: { combatant: "cb1" },
    rolls: [],
    flavor: "Jet Initiative"
  }), false);

  const m1 = {
    id: "m1",
    deleted: false,
    isOwner: true,
    speaker: { combat: "c1", combatant: "cb1" },
    rolls: [{ total: 5 }],
    delete: async () => {
      deleted.push("m1");
    }
  };
  const m2 = {
    id: "m2",
    deleted: false,
    isOwner: true,
    speaker: { combat: "c1", combatant: "cb2" },
    rolls: [{ total: 9 }],
    delete: async () => {
      deleted.push("m2");
    }
  };

  hooks.queueInitiativeRollMessage(m1);
  hooks.queueInitiativeRollMessage(m2);
  await hooks.flushInitiativeGroupBuffer("c1:u1");

  assert.equal(created.length, 1);
  assert.equal(created[0].flags.bloodman.initiativeGroupSummary, true);
  assert.equal(created[0].content.includes("Bravo"), true);
  assert.equal(created[0].content.includes("Alpha"), true);
  assert.deepEqual(deleted.sort(), ["m1", "m2"]);
}

run()
  .then(() => {
    console.log("initiative-grouping.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
