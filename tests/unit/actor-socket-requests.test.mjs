import assert from "node:assert/strict";
import { buildActorSocketRequestHandlers } from "../../src/hooks/actor-socket-requests.mjs";

function withGameContext(gameConfig, callback) {
  const previousGame = globalThis.game;
  globalThis.game = {
    user: { isGM: Boolean(gameConfig?.isGM) },
    users: new Map(gameConfig?.users || []),
    actors: new Map(gameConfig?.actors || [])
  };
  try {
    return callback();
  } finally {
    globalThis.game = previousGame;
  }
}

async function run() {
  await withGameContext({
    isGM: false,
    users: [["u1", { role: 1 }]]
  }, async () => {
    let updateCalled = false;
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(["system.resources.pv.current"]),
      resolveActorForVitalResourceUpdate: async () => ({
        type: "personnage",
        system: { resources: { pv: { max: 5 }, pp: { max: 3 } } },
        update: async () => {
          updateCalled = true;
        }
      }),
      resolveActorForSheetRequest: async () => null
    });
    await handlers.handleVitalResourceUpdateRequest({
      requesterId: "u1",
      path: "system.resources.pv.current",
      value: 10
    });
    assert.equal(updateCalled, false);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 1 }]]
  }, async () => {
    const updates = [];
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(["system.resources.pv.current"]),
      resolveActorForVitalResourceUpdate: async () => ({
        type: "personnage",
        system: { resources: { pv: { max: 5 }, pp: { max: 3 } } },
        update: async data => updates.push(data)
      }),
      normalizeVitalResourceValue: ({ value, pvMax }) => Math.min(Number(value), Number(pvMax)),
      resolveActorForSheetRequest: async () => null
    });
    await handlers.handleVitalResourceUpdateRequest({
      requesterId: "u1",
      path: "system.resources.pv.current",
      value: 10
    });
    assert.deepEqual(updates, [{ "system.resources.pv.current": 5 }]);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 1 }]]
  }, async () => {
    const updates = [];
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(["system.resources.pp.current"]),
      resolveActorForVitalResourceUpdate: async () => ({
        type: "personnage",
        system: { resources: { pv: { max: 5 }, pp: { max: 3 } } },
        update: async data => updates.push(data)
      }),
      resolveActorForSheetRequest: async () => null
    });
    await handlers.handleVitalResourceUpdateRequest({
      requesterId: "u1",
      path: "system.resources.pv.current",
      value: 10
    });
    assert.deepEqual(updates, []);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 2 }]]
  }, async () => {
    const updateCalls = [];
    const sanitizeCalls = [];
    const actor = {
      type: "personnage-non-joueur",
      update: async (data, options) => updateCalls.push({ data, options })
    };
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(),
      resolveActorForVitalResourceUpdate: async () => null,
      resolveActorForSheetRequest: async () => actor,
      sanitizeActorUpdateForRole: (updateData, role, options) => {
        sanitizeCalls.push({ updateData, role, options });
        return { "system.resources.pv.current": 2 };
      },
      hasActorUpdatePayload: () => true,
      flattenObject: value => value
    });
    await handlers.handleActorSheetUpdateRequest({
      requesterId: "u1",
      updateData: { "system.resources.pv.current": 8 },
      options: {
        allowCharacteristicBase: true,
        allowVitalResourceUpdate: false,
        allowAmmoUpdate: true
      }
    });
    assert.equal(sanitizeCalls.length, 1);
    assert.equal(sanitizeCalls[0].role, 2);
    assert.equal(sanitizeCalls[0].options.enforceCharacteristicBaseRange, false);
    assert.deepEqual(updateCalls, [{
      data: { "system.resources.pv.current": 2 },
      options: {
        bloodmanAllowCharacteristicBase: true,
        bloodmanAllowVitalResourceUpdate: false,
        bloodmanAllowAmmoUpdate: true
      }
    }]);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 2 }]]
  }, async () => {
    let updateCalled = false;
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(),
      resolveActorForVitalResourceUpdate: async () => null,
      resolveActorForSheetRequest: async () => ({
        type: "personnage",
        update: async () => {
          updateCalled = true;
        }
      }),
      sanitizeActorUpdateForRole: updateData => updateData,
      hasActorUpdatePayload: () => false,
      flattenObject: value => value
    });
    await handlers.handleActorSheetUpdateRequest({
      requesterId: "u1",
      updateData: { foo: 1 }
    });
    assert.equal(updateCalled, false);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 2 }]]
  }, async () => {
    const deleted = [];
    const actor = {
      type: "personnage",
      id: "a1",
      uuid: "Actor.a1",
      items: {
        has: id => id === "it1",
        get: _id => ({ delete: async () => null }),
        find: () => null
      },
      deleteEmbeddedDocuments: async (_type, ids) => {
        deleted.push(ids);
      }
    };
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(),
      resolveActorForVitalResourceUpdate: async () => null,
      resolveActorForSheetRequest: async () => actor
    });
    await handlers.handleDeleteItemRequest({
      requesterId: "u1",
      actorId: "a1",
      itemId: "it1",
      itemUuid: "Actor.a1.Item.it1"
    });
    assert.deepEqual(deleted, [["it1"]]);
  });

  await withGameContext({
    isGM: true,
    users: [["u1", { role: 2 }]]
  }, async () => {
    const updates = [];
    const actor = {
      type: "personnage-non-joueur",
      items: {
        has: id => id === "it1" || id === "it2",
        get: id => ({ sort: id === "it1" ? 7 : 3 })
      },
      testUserPermission: () => true,
      updateEmbeddedDocuments: async (_type, payload) => updates.push(payload)
    };
    const handlers = buildActorSocketRequestHandlers({
      canUserRoleEditCharacteristics: () => true,
      vitalResourcePaths: new Set(),
      resolveActorForVitalResourceUpdate: async () => null,
      resolveActorForSheetRequest: async () => actor,
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      }
    });
    await handlers.handleReorderActorItemsRequest({
      requesterId: "u1",
      updates: [
        { _id: "it1", sort: "12.7" },
        { _id: "itX", sort: 99 },
        { _id: "it2", sort: "invalid" }
      ]
    });
    assert.deepEqual(updates, [[
      { _id: "it1", sort: 12 },
      { _id: "it2", sort: 3 }
    ]]);
  });
}

run()
  .then(() => {
    console.log("actor-socket-requests.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
