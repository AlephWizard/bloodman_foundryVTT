import assert from "node:assert/strict";
import { buildDamageCurrentHelpers } from "../../src/rules/damage-current.mjs";

async function run() {
  const helpers = buildDamageCurrentHelpers({
    getProperty: (object, path) => {
      return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
    }
  });

  assert.equal(
    helpers.resolveDamageCurrent(null, null, 12),
    12
  );

  assert.equal(
    helpers.resolveDamageCurrent(
      { delta: { system: { resources: { pv: { current: 8 } } } } },
      { system: { resources: { pv: { current: 5 } } } },
      Number.NaN
    ),
    5
  );

  assert.equal(
    helpers.resolveDamageCurrent(
      { delta: { system: { resources: { pv: { current: 9 } } } } },
      null,
      Number.NaN
    ),
    9
  );

  assert.equal(
    helpers.resolveDamageCurrent(
      { actorData: { system: { resources: { pv: { current: 3 } } } } },
      null,
      Number.NaN
    ),
    3
  );
}

run()
  .then(() => {
    console.log("damage-current.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
