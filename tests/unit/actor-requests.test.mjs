import assert from "node:assert/strict";
import {
  hasActorUpdatePayload,
  normalizeVitalResourceValue
} from "../../src/rules/actor-requests.mjs";

function run() {
  const flattenObject = object => {
    const flat = {};
    const walk = (value, prefix = "") => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) {
          const path = prefix ? `${prefix}.${key}` : key;
          walk(child, path);
        }
        return;
      }
      if (prefix) flat[prefix] = value;
    };
    walk(object);
    return flat;
  };

  assert.equal(hasActorUpdatePayload(null, flattenObject), false);
  assert.equal(hasActorUpdatePayload({}, flattenObject), false);
  assert.equal(hasActorUpdatePayload({ system: { resources: { pv: { current: 1 } } } }, flattenObject), true);
  assert.equal(hasActorUpdatePayload({ foo: 1 }), true);

  assert.equal(
    normalizeVitalResourceValue({
      path: "system.resources.pv.current",
      value: "9",
      pvMax: 6
    }),
    6
  );
  assert.equal(
    normalizeVitalResourceValue({
      path: "system.resources.pp.current",
      value: "-3",
      ppMax: 8
    }),
    0
  );
  assert.equal(
    normalizeVitalResourceValue({
      path: "system.resources.pv.max",
      value: "7.9"
    }),
    7
  );
  assert.equal(
    normalizeVitalResourceValue({
      path: "system.resources.pp.current",
      value: "12",
      ppMax: Number.NaN
    }),
    12
  );
}

run();
console.log("actor-requests.test.mjs: OK");
