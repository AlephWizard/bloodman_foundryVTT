import assert from "node:assert/strict";

import {
  DAMAGE_DIALOG_CONFIG_USER_FLAG,
  getRememberedDamageDialogConfig,
  rememberDamageDialogConfig
} from "../../src/dice/damage-dialog-memory.mjs";

function createUserMock(initialFlag = null) {
  let storedFlag = initialFlag;
  return {
    getFlag: (systemId, flagKey) => {
      if (systemId !== "bloodman" || flagKey !== DAMAGE_DIALOG_CONFIG_USER_FLAG) return null;
      return storedFlag;
    },
    setFlag: async (systemId, flagKey, payload) => {
      assert.equal(systemId, "bloodman");
      assert.equal(flagKey, DAMAGE_DIALOG_CONFIG_USER_FLAG);
      storedFlag = payload;
      return payload;
    },
    readFlag: () => storedFlag
  };
}

async function run() {
  assert.equal(getRememberedDamageDialogConfig({ user: null }), null);
  assert.equal(getRememberedDamageDialogConfig({ user: createUserMock("bad") }), null);

  const user = createUserMock({
    formula: " 1D10 + 1D4 ",
    bonusBrut: "3.9",
    penetration: "-2"
  });
  assert.deepEqual(getRememberedDamageDialogConfig({ user }), {
    formula: "1d10+1d4",
    bonusBrut: 3,
    penetration: 0
  });

  await rememberDamageDialogConfig({
    formula: "2D6",
    bonusBrut: "4",
    penetration: "1"
  }, { user });

  const stored = user.readFlag();
  assert.equal(stored.formula, "2d6");
  assert.equal(stored.bonusBrut, 4);
  assert.equal(stored.penetration, 1);
  assert.equal(Number.isFinite(stored.updatedAt), true);
}

await run();
console.log("damage-dialog-memory.test.mjs: OK");
