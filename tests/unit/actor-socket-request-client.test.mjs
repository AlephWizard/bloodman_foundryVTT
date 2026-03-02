import assert from "node:assert/strict";
import { buildActorSocketRequestClient } from "../../src/hooks/actor-socket-request-client.mjs";

function withGameUser(userId, callback) {
  const previousGame = globalThis.game;
  globalThis.game = {
    user: { id: userId }
  };
  try {
    return callback();
  } finally {
    globalThis.game = previousGame;
  }
}

function run() {
  withGameUser("u1", () => {
    const emitted = [];
    const client = buildActorSocketRequestClient({
      systemSocket: "system.bloodman",
      hasSocket: () => true,
      socketEmit: (channel, payload) => {
        emitted.push({ channel, payload });
        return true;
      },
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      vitalResourcePaths: new Set(["system.resources.pv.current"]),
      hasActorUpdatePayload: updateData => Boolean(updateData && Object.keys(updateData).length > 0),
      flattenObject: value => value
    });

    assert.equal(
      client.getSocketActorBaseId({
        token: { actorId: "token-base" },
        parent: { actorId: "parent-base" },
        baseActor: { id: "base-actor" },
        id: "actor-id"
      }),
      "token-base"
    );

    client.requestVitalResourceUpdate(
      { uuid: "Actor.a1", id: "a1", token: { actorId: "base-a1" } },
      "system.resources.pv.current",
      8.9
    );
    client.requestVitalResourceUpdate(
      { uuid: "Actor.a1", id: "a1", token: { actorId: "base-a1" } },
      "system.resources.pp.current",
      4
    );

    const sheetUpdateOk = client.requestActorSheetUpdate(
      { uuid: "Actor.a1", id: "a1", token: { actorId: "base-a1" } },
      { "system.resources.pv.current": 2 },
      { allowCharacteristicBase: true, allowVitalResourceUpdate: false, allowAmmoUpdate: true }
    );
    const sheetUpdateFail = client.requestActorSheetUpdate(
      { uuid: "Actor.a1", id: "a1" },
      {}
    );

    const reorderOk = client.requestReorderActorItems(
      { uuid: "Actor.a1", id: "a1" },
      [{ _id: "it1", sort: "7.8" }, { id: "", sort: 3 }]
    );
    const deleteOk = client.requestDeleteActorItem(
      { uuid: "Actor.a1", id: "a1" },
      { id: "it1", uuid: "Actor.a1.Item.it1", type: "objet", name: "Corde" }
    );
    const reorderFail = client.requestReorderActorItems(
      { uuid: "Actor.a1", id: "a1" },
      [{ id: "" }]
    );

    assert.equal(sheetUpdateOk, true);
    assert.equal(sheetUpdateFail, false);
    assert.equal(deleteOk, true);
    assert.equal(reorderOk, true);
    assert.equal(reorderFail, false);

    assert.equal(emitted.length, 4);
    assert.equal(emitted[0].channel, "system.bloodman");
    assert.deepEqual(emitted[0].payload, {
      type: "updateVitalResources",
      requesterId: "u1",
      actorUuid: "Actor.a1",
      actorId: "a1",
      actorBaseId: "base-a1",
      path: "system.resources.pv.current",
      value: 8
    });
    assert.deepEqual(emitted[1].payload, {
      type: "updateActorSheetData",
      requesterId: "u1",
      actorUuid: "Actor.a1",
      actorId: "a1",
      actorBaseId: "base-a1",
      updateData: { "system.resources.pv.current": 2 },
      options: {
        allowCharacteristicBase: true,
        allowVitalResourceUpdate: false,
        allowAmmoUpdate: true
      }
    });
    assert.deepEqual(emitted[2].payload, {
      type: "reorderActorItems",
      requesterId: "u1",
      actorUuid: "Actor.a1",
      actorId: "a1",
      actorBaseId: "a1",
      updates: [{ _id: "it1", sort: 7 }]
    });
    assert.deepEqual(emitted[3].payload, {
      type: "deleteActorItem",
      requesterId: "u1",
      actorUuid: "Actor.a1",
      actorId: "a1",
      actorBaseId: "a1",
      itemId: "it1",
      itemUuid: "Actor.a1.Item.it1",
      itemType: "objet",
      itemName: "Corde"
    });
  });
}

run();
console.log("actor-socket-request-client.test.mjs: OK");
