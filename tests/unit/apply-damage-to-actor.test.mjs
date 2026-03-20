import assert from "node:assert/strict";
import { applyDamageToActor } from "../../rollHelpers.mjs";

function buildActor({
  id,
  name,
  type,
  currentPv,
  pa = 0
}) {
  const actor = {
    id,
    name,
    type,
    isOwner: true,
    system: {
      resources: {
        pv: { current: Number(currentPv) }
      }
    },
    items: pa > 0 ? [{ type: "protection", system: { pa } }] : [],
    updateCalls: [],
    async update(updateData) {
      this.updateCalls.push(updateData);
      const nextPv = Number(updateData?.["system.resources.pv.current"]);
      if (Number.isFinite(nextPv)) this.system.resources.pv.current = nextPv;
      return this;
    }
  };
  return actor;
}

async function withContext(callback) {
  const previous = {
    game: globalThis.game,
    ChatMessage: globalThis.ChatMessage,
    CONST: globalThis.CONST,
    foundry: globalThis.foundry
  };
  const createdMessages = [];

  globalThis.game = {
    user: { isGM: false, active: true, role: 1 },
    users: [{ id: "gm1", isGM: true, active: true, role: 4 }]
  };
  globalThis.ChatMessage = {
    create: async data => {
      createdMessages.push(data);
      return data;
    }
  };
  globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
  globalThis.foundry = {
    utils: {
      flattenObject: source => {
        if (!source || typeof source !== "object") return {};
        return source;
      },
      getProperty: () => undefined,
      escapeHTML: value => String(value ?? "")
    }
  };

  try {
    await callback(createdMessages);
  } finally {
    globalThis.game = previous.game;
    globalThis.ChatMessage = previous.ChatMessage;
    globalThis.CONST = previous.CONST;
    globalThis.foundry = previous.foundry;
  }
}

async function run() {
  await withContext(async createdMessages => {
    const playerActor = buildActor({
      id: "player-1",
      name: "Joueur",
      type: "personnage",
      currentPv: 12,
      pa: 2
    });
    const playerResult = await applyDamageToActor(playerActor, 5, { penetration: 1, targetName: "Joueur" });

    assert.equal(playerActor.system.resources.pv.current, 8);
    assert.equal(playerActor.updateCalls.length, 1);
    assert.equal(playerActor.updateCalls[0]["system.resources.pv.current"], 8);
    assert.equal(playerResult?.hpBefore, 12);
    assert.equal(playerResult?.hpAfter, 8);
    assert.equal(playerResult?.finalDamage, 4);
    assert.equal(playerResult?.paInitial, 2);
    assert.equal(playerResult?.paEffective, 1);
    assert.equal(createdMessages.length, 1);
    assert.equal(createdMessages[0].whisper.includes("gm1"), true);

    const npcActor = buildActor({
      id: "npc-1",
      name: "PNJ",
      type: "personnage-non-joueur",
      currentPv: 9,
      pa: 0
    });
    const npcResult = await applyDamageToActor(npcActor, 3, { penetration: 0, targetName: "PNJ" });

    assert.equal(npcActor.system.resources.pv.current, 6);
    assert.equal(npcActor.updateCalls.length, 1);
    assert.equal(npcActor.updateCalls[0]["system.resources.pv.current"], 6);
    assert.equal(npcResult?.hpBefore, 9);
    assert.equal(npcResult?.hpAfter, 6);
    assert.equal(npcResult?.finalDamage, 3);
    assert.equal(npcResult?.paInitial, 0);
    assert.equal(npcResult?.paEffective, 0);
    assert.equal(createdMessages.length, 2);
  });
}

run()
  .then(() => {
    console.log("apply-damage-to-actor.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
