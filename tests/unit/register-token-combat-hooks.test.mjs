import assert from "node:assert/strict";

import { registerTokenCombatHooks } from "../../src/hooks/register-token-combat-hooks.mjs";

function createTokenCombatHooks() {
  const handler = () => {};
  return {
    onPreCreateToken: handler,
    onDrawToken: handler,
    onRefreshToken: handler,
    onCreateToken: handler,
    onDeleteToken: handler,
    onPreCreateCombatant: handler,
    onUpdateCombat: handler,
    onCombatTurnChange: handler,
    onCombatStart: handler,
    onDeleteCombat: handler,
    onPreUpdateToken: handler,
    onUpdateToken: handler
  };
}

function run() {
  const calls = [];
  const hooks = {
    on: (hookName, handler) => calls.push({ hookName, handler })
  };
  const cacheHandler = () => {};
  const registered = registerTokenCombatHooks({
    hooks,
    tokenCombatHooks: createTokenCombatHooks(),
    clearResolvedActorDocumentCaches: cacheHandler,
    syncNpcDeadStatusToZeroPvFromActiveEffect: async () => {}
  });

  assert.deepEqual(registered, [
    "preCreateToken",
    "drawToken",
    "refreshToken",
    "createToken",
    "deleteToken",
    "createToken",
    "updateToken",
    "deleteToken",
    "preCreateCombatant",
    "updateCombat",
    "combatTurnChange",
    "combatStart",
    "deleteCombat",
    "preUpdateToken",
    "updateToken",
    "createActiveEffect",
    "updateActiveEffect"
  ]);
  assert.equal(calls.length, registered.length);
  assert.equal(calls[5].handler, cacheHandler);
  assert.equal(calls[6].handler, cacheHandler);
  assert.equal(calls[7].handler, cacheHandler);

  assert.deepEqual(registerTokenCombatHooks({ hooks: null, tokenCombatHooks: createTokenCombatHooks() }), []);
  assert.deepEqual(registerTokenCombatHooks({ hooks, tokenCombatHooks: null }), []);
}

run();
console.log("register-token-combat-hooks.test.mjs: OK");
