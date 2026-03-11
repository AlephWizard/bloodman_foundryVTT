import assert from "node:assert/strict";
import { buildSystemSocketHooks } from "../../src/hooks/system-socket.mjs";

async function run() {
  const previousHandler = () => {};
  globalThis.__bmDamageSocketHandler = previousHandler;
  globalThis.__bmDamageSocketReady = false;

  const calls = [];
  let privileged = true;
  let currentChaos = 10;
  const remembered = new Set();
  let registeredHandler = null;

  const hooks = buildSystemSocketHooks({
    systemSocket: "system.bloodman",
    hasSocket: () => true,
    socketOn: (_channel, handler) => {
      registeredHandler = handler;
      calls.push("socket:on");
      return true;
    },
    socketOff: (_channel, handler) => {
      if (handler === previousHandler) calls.push("socket:off-prev");
    },
    isCurrentUserPrimaryPrivilegedOperator: () => privileged,
    handleDamageConfigPopupMessage: async () => calls.push("msg:damage-config"),
    handleDamageSplitPopupMessage: async () => calls.push("msg:damage-split"),
    handlePowerUsePopupMessage: async () => calls.push("msg:power-popup"),
    handleDamageAppliedMessage: async () => calls.push("msg:damage-applied"),
    handleDamageRerollRequest: async () => calls.push("msg:reroll"),
    handleVitalResourceUpdateRequest: async () => calls.push("msg:vital"),
    handleActorSheetUpdateRequest: async () => calls.push("msg:sheet"),
    handleDeleteItemRequest: async () => calls.push("msg:delete-item"),
    handleReorderActorItemsRequest: async () => calls.push("msg:reorder-item"),
    wasChaosRequestProcessed: id => remembered.has(id),
    rememberChaosRequest: id => {
      remembered.add(id);
      calls.push(`chaos:remember:${id}`);
    },
    setChaosValue: async value => {
      currentChaos = value;
      calls.push(`chaos:set:${value}`);
    },
    getChaosValue: () => currentChaos,
    handleIncomingDamageRequest: async () => calls.push("msg:apply-damage")
  });

  hooks.registerDamageSocketHandlers();
  assert.deepEqual(calls.slice(0, 2), ["socket:off-prev", "socket:on"]);
  assert.equal(typeof registeredHandler, "function");
  assert.equal(globalThis.__bmDamageSocketReady, true);

  await registeredHandler({ type: "damageConfigPopup" });
  await registeredHandler({ type: "damageSplitPopup" });
  await registeredHandler({ type: "powerUsePopup" });
  await registeredHandler({ type: "damageApplied" });
  await registeredHandler({ type: "rerollDamage" });
  await registeredHandler({ type: "updateVitalResources" });
  await registeredHandler({ type: "updateActorSheetData" });
  await registeredHandler({ type: "deleteActorItem" });
  await registeredHandler({ type: "reorderActorItems" });
  await registeredHandler({ type: "adjustChaosDice", delta: 3, requestId: "r1" });
  await registeredHandler({ type: "adjustChaosDice", delta: 3, requestId: "r1" });
  await registeredHandler({ type: "applyDamage" });
  assert.equal(currentChaos, 13);

  privileged = false;
  await registeredHandler({ type: "rerollDamage" });
  await registeredHandler({ type: "updateVitalResources" });
  await registeredHandler({ type: "applyDamage" });
  await registeredHandler({ type: "adjustChaosDice", delta: 2, requestId: "r2" });
  assert.equal(currentChaos, 13);

  assert.deepEqual(calls, [
    "socket:off-prev",
    "socket:on",
    "msg:damage-config",
    "msg:damage-split",
    "msg:power-popup",
    "msg:damage-applied",
    "msg:reroll",
    "msg:vital",
    "msg:sheet",
    "msg:delete-item",
    "msg:reorder-item",
    "chaos:remember:r1",
    "chaos:set:13",
    "msg:apply-damage"
  ]);
}

run()
  .then(() => {
    console.log("system-socket.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
