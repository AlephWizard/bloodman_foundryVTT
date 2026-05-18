import assert from "node:assert/strict";
import { createActorLifecycleHooks } from "../../src/hooks/actor-lifecycle.mjs";

function getProperty(source, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), source);
}

async function run() {
  const calls = [];
  const actor = {
    id: "a1",
    uuid: "Actor.a1",
    token: { actorId: "world-a1" },
    items: new Map([["i1", {}]])
  };

  const hooks = createActorLifecycleHooks({
    clearResolvedActorDocumentCaches: () => calls.push(["clear-cache"]),
    onUpdateActorCore: async (actorArg, changes, options, userId) => {
      calls.push(["core", actorArg.id, changes.kind, options.render, userId]);
    },
    getProperty,
    getCurrentUser: () => ({ id: "gm1", isGM: true }),
    isCurrentUserPrimaryPrivilegedOperator: () => false,
    socketEmit: (socketName, payload) => calls.push(["socket", socketName, payload]),
    systemSocket: "system.socket",
    resolveActorBackpackEnabled: (actorArg, context) => {
      calls.push(["resolve-backpack", actorArg.id, context.items.length]);
      return { enabled: true };
    },
    updateOpenActorSheetsBackpackState: (actorArg, enabled) => calls.push(["update-open-sheets", actorArg.id, enabled])
  });

  await hooks.onUpdateActor(
    actor,
    { kind: "bag", system: { equipment: { bagSlotsEnabled: true } } },
    { render: false },
    "u1"
  );

  assert.deepEqual(calls, [
    ["clear-cache"],
    ["core", "a1", "bag", false, "u1"],
    ["resolve-backpack", "a1", 1],
    ["socket", "system.socket", {
      type: "actorBackpackStateChanged",
      requesterId: "gm1",
      actorUuid: "Actor.a1",
      actorId: "a1",
      actorBaseId: "world-a1",
      enabled: true
    }],
    ["update-open-sheets", "a1", true]
  ]);
  calls.length = 0;

  await hooks.onUpdateActor(actor, { kind: "name", name: "Updated" }, {}, "u1");
  assert.deepEqual(calls, [
    ["clear-cache"],
    ["core", "a1", "name", undefined, "u1"]
  ]);
  calls.length = 0;

  const assistantHooks = createActorLifecycleHooks({
    clearResolvedActorDocumentCaches: () => calls.push(["clear-cache"]),
    onUpdateActorCore: async () => calls.push(["core"]),
    getProperty,
    getCurrentUser: () => ({ id: "assistant1", isGM: false }),
    isCurrentUserPrimaryPrivilegedOperator: () => true,
    socketEmit: (socketName, payload) => calls.push(["socket", socketName, payload.requesterId]),
    systemSocket: "system.socket",
    resolveActorBackpackEnabled: () => ({ enabled: false }),
    updateOpenActorSheetsBackpackState: (_actor, enabled) => calls.push(["update-open-sheets", enabled])
  });

  await assistantHooks.onUpdateActor(actor, { system: { equipment: { bagSlotsEnabled: false } } }, {}, "u2");
  assert.deepEqual(calls, [
    ["clear-cache"],
    ["core"],
    ["socket", "system.socket", "assistant1"],
    ["update-open-sheets", false]
  ]);
  calls.length = 0;

  const playerHooks = createActorLifecycleHooks({
    getProperty,
    getCurrentUser: () => ({ id: "p1", isGM: false }),
    socketEmit: () => calls.push(["socket"]),
    resolveActorBackpackEnabled: () => ({ enabled: true }),
    updateOpenActorSheetsBackpackState: (_actor, enabled) => calls.push(["update-open-sheets", enabled])
  });
  assert.equal(
    playerHooks.syncBackpackStateAfterActorUpdate(actor, { system: { equipment: { bagSlotsEnabled: true } } }, "u3"),
    true
  );
  assert.deepEqual(calls, [["update-open-sheets", true]]);
  calls.length = 0;

  hooks.onActorDocumentCacheInvalidated();
  assert.deepEqual(calls, [["clear-cache"]]);
}

run()
  .then(() => {
    console.log("actor-lifecycle.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
