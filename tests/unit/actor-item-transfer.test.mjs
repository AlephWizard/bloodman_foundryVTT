import assert from "node:assert/strict";
import { createActorItemTransferRules } from "../../src/rules/actor-item-transfer.mjs";

function buildRules({ warnings = [], logs = [] } = {}) {
  return createActorItemTransferRules({
    translate: key => key,
    warn: message => warnings.push(message),
    deepClone: value => JSON.parse(JSON.stringify(value)),
    logWarn: (...args) => logs.push(args)
  });
}

function createDroppedItem(id, { isOwner = false } = {}) {
  return {
    id,
    isOwner,
    toObject: () => ({
      _id: id,
      name: `Item-${id}`,
      type: "objet",
      system: { quantity: 1 }
    })
  };
}

async function run() {
  const rules = buildRules();
  assert.equal(
    await rules.applyActorToActorItemTransfer({
      targetActor: null,
      transferEntries: [{ droppedItem: createDroppedItem("i0"), sourceActor: { id: "s0" } }]
    }),
    null
  );
  assert.equal(
    await rules.applyActorToActorItemTransfer({
      targetActor: { id: "target" },
      transferEntries: []
    }),
    null
  );

  const deniedWarnings = [];
  const deniedRules = buildRules({ warnings: deniedWarnings });
  const deniedResult = await deniedRules.applyActorToActorItemTransfer({
    targetActor: {
      id: "target",
      isOwner: false,
      testUserPermission: () => false
    },
    transferEntries: [
      {
        droppedItem: createDroppedItem("i1"),
        sourceActor: { id: "source", isOwner: true, deleteEmbeddedDocuments: async () => {} }
      }
    ],
    currentUser: { id: "u1" },
    ownerLevel: 3,
    isGM: false
  });
  assert.equal(deniedResult, null);
  assert.equal(deniedWarnings.length, 1);

  const mixedWarnings = [];
  const mixedLogs = [];
  const createdPayloads = [];
  const createdOptions = [];
  const sourceDeletes = [];
  let renderCount = 0;
  const mixedRules = buildRules({ warnings: mixedWarnings, logs: mixedLogs });
  const mixedTarget = {
    id: "target",
    isOwner: true,
    createEmbeddedDocuments: async (_type, docs, options) => {
      createdPayloads.push(docs[0]);
      createdOptions.push(options);
      return [{ id: `created-${createdPayloads.length}` }];
    },
    deleteEmbeddedDocuments: async () => {}
  };
  const deniedSource = {
    id: "source-denied",
    isOwner: false,
    testUserPermission: () => false,
    deleteEmbeddedDocuments: async () => {
      throw new Error("should-not-run");
    }
  };
  const allowedSource = {
    id: "source-allowed",
    isOwner: true,
    deleteEmbeddedDocuments: async (_type, ids) => {
      sourceDeletes.push(ids[0]);
    }
  };
  const mixedResult = await mixedRules.applyActorToActorItemTransfer({
    targetActor: mixedTarget,
    transferEntries: [
      { droppedItem: createDroppedItem("i2"), sourceActor: deniedSource },
      { droppedItem: createDroppedItem("i3"), sourceActor: allowedSource }
    ],
    currentUser: { id: "u1" },
    ownerLevel: 3,
    isGM: false,
    renderTarget: () => {
      renderCount += 1;
    }
  });
  assert.deepEqual(mixedResult, { id: "created-1" });
  assert.equal(mixedWarnings.length, 1);
  assert.equal(mixedLogs.length, 0);
  assert.equal(sourceDeletes.length, 1);
  assert.deepEqual(sourceDeletes, ["i3"]);
  assert.equal(createdPayloads.length, 1);
  assert.equal(createdPayloads[0]._id, undefined);
  assert.equal(createdOptions[0], undefined);
  assert.equal(renderCount, 1);

  const createFailLogs = [];
  const createFailRules = buildRules({ logs: createFailLogs });
  const createFailResult = await createFailRules.applyActorToActorItemTransfer({
    targetActor: {
      id: "target",
      isOwner: true,
      createEmbeddedDocuments: async () => {
        throw new Error("create-fail");
      },
      deleteEmbeddedDocuments: async () => {}
    },
    transferEntries: [
      {
        droppedItem: createDroppedItem("i4"),
        sourceActor: { id: "source-create-fail", isOwner: true, deleteEmbeddedDocuments: async () => {} }
      }
    ],
    isGM: false
  });
  assert.equal(createFailResult, null);
  assert.equal(createFailLogs.length, 1);

  const rollbackLogs = [];
  const rollbackDeletes = [];
  const rollbackRules = buildRules({ logs: rollbackLogs });
  const rollbackTarget = {
    id: "target",
    isOwner: true,
    createEmbeddedDocuments: async () => [{ id: "created-roll" }],
    deleteEmbeddedDocuments: async (_type, ids) => {
      rollbackDeletes.push(ids[0]);
    }
  };
  const rollbackResult = await rollbackRules.applyActorToActorItemTransfer({
    targetActor: rollbackTarget,
    transferEntries: [
      {
        droppedItem: createDroppedItem("i5"),
        sourceActor: {
          id: "source-delete-fail",
          isOwner: true,
          deleteEmbeddedDocuments: async () => {
            throw new Error("delete-fail");
          }
        }
      }
    ],
    isGM: false
  });
  assert.equal(rollbackResult, null);
  assert.equal(rollbackLogs.length, 1);
  assert.deepEqual(rollbackDeletes, ["created-roll"]);

  const multiRules = buildRules();
  let multiRenderCount = 0;
  let multiCreateCount = 0;
  const multiTarget = {
    id: "target",
    isOwner: true,
    createEmbeddedDocuments: async () => {
      multiCreateCount += 1;
      return [{ id: `created-multi-${multiCreateCount}` }];
    },
    deleteEmbeddedDocuments: async () => {}
  };
  const multiSourceA = { id: "source-a", isOwner: true, deleteEmbeddedDocuments: async () => {} };
  const multiSourceB = { id: "source-b", isOwner: true, deleteEmbeddedDocuments: async () => {} };
  const multiResult = await multiRules.applyActorToActorItemTransfer({
    targetActor: multiTarget,
    transferEntries: [
      { droppedItem: createDroppedItem("i6"), sourceActor: multiSourceA },
      { droppedItem: createDroppedItem("i7"), sourceActor: multiSourceB }
    ],
    isGM: false,
    renderTarget: () => {
      multiRenderCount += 1;
    }
  });
  assert.equal(Array.isArray(multiResult), true);
  assert.equal(multiResult.length, 2);
  assert.equal(multiRenderCount, 1);

  const optionsRules = buildRules();
  const transferCreateOptions = [];
  await optionsRules.applyActorToActorItemTransfer({
    targetActor: {
      id: "target",
      isOwner: true,
      createEmbeddedDocuments: async (_type, _docs, options) => {
        transferCreateOptions.push(options);
        return [{ id: "created-options" }];
      },
      deleteEmbeddedDocuments: async () => {}
    },
    transferEntries: [
      {
        droppedItem: createDroppedItem("i8"),
        sourceActor: { id: "source-options", isOwner: true, deleteEmbeddedDocuments: async () => {} }
      }
    ],
    isGM: false,
    createItemOptions: { bloodmanSkipVoyageXPCost: true }
  });
  assert.deepEqual(transferCreateOptions, [{ bloodmanSkipVoyageXPCost: true }]);
}

run()
  .then(() => {
    console.log("actor-item-transfer.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
