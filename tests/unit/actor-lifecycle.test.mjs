import assert from "node:assert/strict";
import { createActorLifecycleHooks } from "../../src/hooks/actor-lifecycle.mjs";

async function run() {
  const calls = [];
  const actor = {
    id: "a1",
    uuid: "Actor.a1"
  };

  const hooks = createActorLifecycleHooks({
    clearResolvedActorDocumentCaches: () => calls.push(["clear-cache"]),
    onUpdateActorCore: async (actorArg, changes, options, userId) => {
      calls.push(["core", actorArg.id, changes.kind, options.render, userId]);
    }
  });

  await hooks.onUpdateActor(
    actor,
    { kind: "equipment", system: { equipment: { carriedItemsMax: 12 } } },
    { render: false },
    "u1"
  );

  assert.deepEqual(calls, [
    ["clear-cache"],
    ["core", "a1", "equipment", false, "u1"]
  ]);
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
