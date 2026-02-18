import assert from "node:assert/strict";
import { createResourceGaugeRules } from "../../src/rules/resource-gauge.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  const rules = createResourceGaugeRules({ toFiniteNumber });

  assert.deepEqual(
    rules.resolveResourceGaugeState(5, 10),
    {
      ratio: 0.5,
      fill: "50.00%",
      steps: 10,
      stateClass: "is-warning"
    }
  );
  assert.deepEqual(
    rules.resolveResourceGaugeState(0, 0),
    {
      ratio: 0,
      fill: "0.00%",
      steps: 1,
      stateClass: "is-empty"
    }
  );
  assert.deepEqual(
    rules.resolveResourceGaugeState(1, 0, { useUnitMaxWhenZero: true }),
    {
      ratio: 1,
      fill: "100.00%",
      steps: 1,
      stateClass: "is-healthy"
    }
  );

  const resource = { current: 2, max: 8 };
  rules.applyResourceGaugeState(resource);
  assert.deepEqual(resource, {
    current: 2,
    max: 8,
    ratio: "0.2500",
    fill: "25.00%",
    steps: 8,
    stateClass: "is-critical"
  });

  const primitive = 12;
  rules.applyResourceGaugeState(primitive);
  assert.equal(primitive, 12);
}

run()
  .then(() => {
    console.log("resource-gauge.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
