import assert from "node:assert/strict";
import { createDropFlowRules } from "../../src/rules/drop-flow.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function roundCurrencyValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) <= 0.000001) return whole;
  return rounded;
}

async function run() {
  const rules = createDropFlowRules({
    toFiniteNumber,
    roundCurrencyValue
  });

  assert.equal(
    rules.resolveDropPermissionNotificationKey({ allowed: false, reason: "role" }),
    "BLOODMAN.Notifications.DropBlockedForPlayerRole"
  );
  assert.equal(
    rules.resolveDropPermissionNotificationKey({ allowed: false, reason: "permission" }),
    "BLOODMAN.Notifications.DropRequiresLimitedPermission"
  );

  assert.equal(rules.isDropDecisionClosed("fermer"), true);
  assert.equal(rules.isDropDecisionClosed("achat"), false);
  assert.equal(rules.isDropDecisionBuy("achat"), true);
  assert.equal(rules.isDropDecisionBuy("deplacer_gratuitement"), false);

  assert.deepEqual(
    rules.resolveDropPurchaseState({
      purchase: { totalCost: 10.25, hasInvalidPrice: true },
      currentCurrency: 100
    }),
    {
      ok: false,
      reason: "invalid-price",
      totalCost: 10.25,
      currentCurrency: 100,
      nextCurrency: 100,
      shouldDeduct: false
    }
  );

  assert.deepEqual(
    rules.resolveDropPurchaseState({
      purchase: { totalCost: 20 },
      currentCurrency: 10
    }),
    {
      ok: false,
      reason: "insufficient-funds",
      totalCost: 20,
      currentCurrency: 10,
      nextCurrency: 10,
      shouldDeduct: false
    }
  );

  assert.deepEqual(
    rules.resolveDropPurchaseState({
      purchase: { totalCost: 15.5 },
      currentCurrency: 30
    }),
    {
      ok: true,
      reason: "",
      totalCost: 15.5,
      currentCurrency: 30,
      nextCurrency: 14.5,
      shouldDeduct: true
    }
  );

  assert.deepEqual(
    rules.resolveDropPurchaseState({
      purchase: { totalCost: 0 },
      currentCurrency: 30
    }),
    {
      ok: true,
      reason: "",
      totalCost: 0,
      currentCurrency: 30,
      nextCurrency: 30,
      shouldDeduct: false
    }
  );

  assert.equal(
    rules.shouldUseActorTransferPath([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }]),
    true
  );
  assert.equal(
    rules.shouldUseActorTransferPath([{ id: 1 }, { id: 2 }], [{ id: 1 }]),
    false
  );
  assert.equal(
    rules.shouldUseActorTransferPath([{ id: 1 }], []),
    false
  );

  assert.equal(
    rules.isCarriedItemsLimitExceeded({
      currentCarriedCount: 6,
      incomingCarriedCount: 1,
      carriedItemsLimit: 6
    }),
    true
  );
  assert.equal(
    rules.isCarriedItemsLimitExceeded({
      currentCarriedCount: 5,
      incomingCarriedCount: 1,
      carriedItemsLimit: 6
    }),
    false
  );
  assert.equal(
    rules.isCarriedItemsLimitExceeded({
      currentCarriedCount: 2,
      incomingCarriedCount: 0,
      carriedItemsLimit: 6
    }),
    false
  );
}

run()
  .then(() => {
    console.log("drop-flow.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
