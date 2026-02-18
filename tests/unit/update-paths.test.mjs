import assert from "node:assert/strict";
import { createUpdatePathHelpers } from "../../src/rules/update-paths.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

async function run() {
  const helpers = createUpdatePathHelpers({ getProperty });

  const updateData = {
    "system.resources.pv.current": 8,
    system: {
      resources: {
        pp: { current: 4 },
        ammo: { stock: 3 }
      }
    }
  };

  assert.equal(helpers.hasUpdatePath(updateData, "system.resources.pv.current"), true);
  assert.equal(helpers.hasUpdatePath(updateData, "system.resources.pp.current"), true);
  assert.equal(helpers.hasUpdatePath(updateData, "system.resources.ammo.stock"), true);
  assert.equal(helpers.hasUpdatePath(updateData, "system.resources.pv.max"), false);

  assert.equal(helpers.getUpdatedPathValue(updateData, "system.resources.pv.current", 0), 8);
  assert.equal(helpers.getUpdatedPathValue(updateData, "system.resources.pp.current", 0), 4);
  assert.equal(helpers.getUpdatedPathValue(updateData, "system.resources.ammo.stock", 0), 3);
  assert.equal(helpers.getUpdatedPathValue(updateData, "system.resources.pv.max", 12), 12);
}

run()
  .then(() => {
    console.log("update-paths.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
