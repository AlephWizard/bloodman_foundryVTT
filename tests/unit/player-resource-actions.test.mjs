import assert from "node:assert/strict";
import { createPlayerResourceActionRules } from "../../src/rules/player-resource-actions.mjs";

function createActor({
  id,
  name,
  type = "personnage",
  voyage = { current: 2, total: 5, max: 5 },
  pp = { current: 1, max: 4 },
  pv = { current: 3, max: 7 },
  update = async () => {}
} = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    name,
    type,
    system: {
      resources: { voyage, pp, pv }
    },
    update
  };
}

async function run() {
  const updates = [];
  const chatMessages = [];
  const player = createActor({
    id: "a1",
    name: "Ada",
    update: async (data, options) => {
      updates.push({ data, options });
    }
  });
  const npc = createActor({ id: "n1", name: "Boss", type: "personnage-non-joueur" });
  const selectedTokens = [
    { document: { id: "t1", actorId: "a1" }, actor: player },
    { document: { id: "t1-duplicate", actorId: "a1" }, actor: player },
    { document: { id: "t2", actorId: "n1" }, actor: npc }
  ];

  const rules = createPlayerResourceActionRules({
    getCanvas: () => ({ tokens: { controlled: selectedTokens } }),
    createChatMessage: async data => {
      chatMessages.push(data);
    },
    translate: (_key, fallback, data = {}) => String(fallback).replace(/\{([^}]+)\}/g, (_match, key) => data[key])
  });

  assert.deepEqual(rules.getSelectedPlayerActors().map(actor => actor.id), ["a1"]);

  const grant = await rules.grantVoyageXpToSelectedPlayers(3);
  assert.equal(grant.reason, "ok");
  assert.deepEqual(grant.grants, [{ actorName: "Ada", amount: 3 }]);
  assert.deepEqual(updates.at(-1).data, {
    "system.resources.voyage.total": 8,
    "system.resources.voyage.current": 5,
    "system.resources.voyage.max": 8
  });

  const ppRestore = await rules.restoreFullPpToSelectedPlayers({ selectedTokens });
  assert.equal(ppRestore.reason, "ok");
  assert.deepEqual(ppRestore.restores, [{ actorName: "Ada", previousPp: 1, maxPp: 4, changed: true }]);
  assert.deepEqual(updates.at(-1), {
    data: { "system.resources.pp.current": 4 },
    options: { bloodmanAllowVitalResourceUpdate: true }
  });

  const pvRestore = await rules.restoreFullPvToSelectedPlayers({ selectedTokens });
  assert.equal(pvRestore.reason, "ok");
  assert.deepEqual(pvRestore.restores, [{ actorName: "Ada", previousPv: 3, maxPv: 7, changed: true }]);
  assert.deepEqual(updates.at(-1), {
    data: { "system.resources.pv.current": 7 },
    options: { bloodmanAllowVitalResourceUpdate: true }
  });

  await rules.postVoyageXpGrantSummary({
    reason: "ok",
    grants: [{ actorName: "<Ada>", amount: 1 }],
    failures: []
  });
  assert.equal(chatMessages.length, 1);
  assert.match(chatMessages[0].content, /&lt;Ada&gt; a recu 1 point d&#39;experience/);
}

run()
  .then(() => {
    console.log("player-resource-actions.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
