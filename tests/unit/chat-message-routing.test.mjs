import assert from "node:assert/strict";
import { buildChatMessageRoutingHooks } from "../../src/hooks/chat-message-routing.mjs";

async function run() {
  const calls = [];
  let privileged = true;
  let initiative = false;
  const rememberedChaos = new Set();
  let chaosValue = 4;

  const hooks = buildChatMessageRoutingHooks({
    getProperty: (object, path) => String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object),
    handleDamageConfigPopupMessage: async () => calls.push("damage-config"),
    handleDamageSplitPopupMessage: async () => calls.push("damage-split"),
    handlePowerUsePopupMessage: async () => calls.push("power-popup"),
    isCurrentUserPrimaryPrivilegedOperator: () => privileged,
    isInitiativeRollMessage: () => initiative,
    queueInitiativeRollMessage: () => calls.push("initiative"),
    wasChaosRequestProcessed: requestId => rememberedChaos.has(requestId),
    rememberChaosRequest: requestId => {
      rememberedChaos.add(requestId);
      calls.push(`remember-chaos:${requestId}`);
    },
    setChaosValue: async value => {
      chaosValue = value;
      calls.push(`set-chaos:${value}`);
    },
    getChaosValue: () => chaosValue,
    handleIncomingDamageRequest: async () => calls.push("damage-request"),
    handleDamageRerollRequest: async () => calls.push("reroll-request"),
    scheduleTransientChatMessageDeletion: (_message, delay) => calls.push(`delete:${delay}`),
    isTransportRelayChatMessage: message => message?.relay === true,
    hideTransientRelayChatMessage: () => calls.push("hide-relay"),
    decorateBloodmanChatRollMessage: message => {
      if (message?.throwDecorate) throw new Error("decorate");
      calls.push("decorate");
    },
    logWarn: (...args) => calls.push(`warn:${String(args[0] || "")}`)
  });

  await hooks.onCreateChatMessage({ flags: { bloodman: { damageConfigPopup: { ok: true } } } });
  await hooks.onCreateChatMessage({ flags: { bloodman: { damageSplitPopup: { ok: true } } } });
  await hooks.onCreateChatMessage({ flags: { bloodman: { powerUsePopup: { ok: true } } } });
  assert.deepEqual(calls.slice(0, 6), ["damage-config", "delete:250", "damage-split", "delete:250", "power-popup", "delete:250"]);

  privileged = false;
  await hooks.onCreateChatMessage({ flags: { bloodman: { chaosDeltaRequest: { delta: 2, requestId: "c1" } } } });
  assert.equal(calls.includes("set-chaos:6"), false);

  privileged = true;
  initiative = true;
  await hooks.onCreateChatMessage({ flags: { bloodman: {} } });
  assert.equal(calls.includes("initiative"), true);
  initiative = false;

  await hooks.onCreateChatMessage({ flags: { bloodman: { chaosDeltaRequest: { delta: 2, requestId: "c2" } } } });
  assert.equal(calls.includes("remember-chaos:c2"), true);
  assert.equal(calls.includes("set-chaos:6"), true);
  assert.equal(calls.includes("delete:250"), true);

  await hooks.onCreateChatMessage({ flags: { bloodman: { damageRequest: { amount: 1 } } } });
  await hooks.onCreateChatMessage({ flags: { bloodman: { rerollDamageRequest: { amount: 1 } } } });
  assert.equal(calls.includes("damage-request"), true);
  assert.equal(calls.includes("reroll-request"), true);

  hooks.onRenderChatMessage({ relay: true }, {});
  assert.equal(calls.includes("hide-relay"), true);

  hooks.onRenderChatMessage({ relay: false }, {});
  assert.equal(calls.includes("decorate"), true);

  hooks.onRenderChatMessageHTML({ relay: false, throwDecorate: true }, {});
  assert.equal(calls.some(entry => entry.startsWith("warn:chat:roll decorate skipped")), true);
}

run()
  .then(() => {
    console.log("chat-message-routing.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
