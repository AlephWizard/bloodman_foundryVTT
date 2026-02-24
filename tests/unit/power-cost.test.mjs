import assert from "node:assert/strict";
import {
  buildPowerCostRules,
  resolvePowerCostUpdatePlan,
  POWER_COST_INSUFFICIENT_MESSAGE,
  POWER_COST_REQUEST_OPTIONS,
  POWER_COST_UPDATE_OPTIONS,
  POWER_PP_CURRENT_PATH
} from "../../src/rules/power-cost.mjs";

async function run() {
  assert.deepEqual(resolvePowerCostUpdatePlan(null, null), { kind: "skip" });
  assert.deepEqual(
    resolvePowerCostUpdatePlan(
      { system: { resources: { pp: { current: 12 } } } },
      { type: "arme", system: { powerCostEnabled: true, powerCost: 5 } }
    ),
    { kind: "skip" }
  );
  assert.deepEqual(
    resolvePowerCostUpdatePlan(
      { system: { resources: { pp: { current: 12 } } } },
      { type: "pouvoir", system: { powerCostEnabled: false, powerCost: 5 } }
    ),
    { kind: "skip" }
  );
  assert.deepEqual(
    resolvePowerCostUpdatePlan(
      { system: { resources: { pp: { current: 12 } } } },
      { type: "pouvoir", system: { powerCostEnabled: true, powerCost: "invalid" } }
    ),
    { kind: "skip" }
  );
  assert.deepEqual(
    resolvePowerCostUpdatePlan(
      { system: { resources: { pp: { current: 2 } } } },
      { type: "pouvoir", system: { powerCostEnabled: true, powerCost: 5 } }
    ),
    {
      kind: "insufficient-power",
      cost: 5,
      current: 2
    }
  );
  assert.deepEqual(
    resolvePowerCostUpdatePlan(
      { system: { resources: { pp: { current: 9 } } } },
      { type: "pouvoir", system: { powerCostEnabled: true, powerCost: 4 } }
    ),
    {
      kind: "apply",
      cost: 4,
      current: 9,
      nextValue: 5
    }
  );

  const directUpdateCalls = [];
  const directHooks = buildPowerCostRules({
    requestActorSheetUpdate: () => {
      throw new Error("requestActorSheetUpdate should not be called in direct path");
    },
    notifyInsufficientPowerPoints: () => {
      throw new Error("notifyInsufficientPowerPoints should not be called in direct path");
    },
    canDirectlyUpdateActor: () => true
  });
  const directActor = {
    system: { resources: { pp: { current: 10 } } },
    update: async (updateData, options) => {
      directUpdateCalls.push({ updateData, options });
    }
  };
  const directItem = {
    type: "pouvoir",
    system: {
      powerCostEnabled: true,
      powerCost: 3
    }
  };
  const directResult = await directHooks.applyPowerCost(directActor, directItem);
  assert.equal(directResult, true);
  assert.equal(directUpdateCalls.length, 1);
  assert.deepEqual(directUpdateCalls[0], {
    updateData: { [POWER_PP_CURRENT_PATH]: 7 },
    options: POWER_COST_UPDATE_OPTIONS
  });

  const directFailureRelayCalls = [];
  const directFailureRelayHooks = buildPowerCostRules({
    requestActorSheetUpdate: (actor, updateData, options) => {
      directFailureRelayCalls.push({ actor, updateData, options });
      return true;
    },
    canDirectlyUpdateActor: () => true,
    deepClone: updateData => ({ ...updateData })
  });
  const directFailureActor = {
    system: { resources: { pp: { current: 11 } } },
    update: async () => {
      throw new Error("synthetic update rejected");
    },
    updateSourceCalls: [],
    updateSource(updateData) {
      this.updateSourceCalls.push(updateData);
    }
  };
  const directFailureRelayResult = await directFailureRelayHooks.applyPowerCost(directFailureActor, {
    type: "pouvoir",
    system: {
      powerCostEnabled: true,
      powerCost: 4
    }
  });
  assert.equal(directFailureRelayResult, true);
  assert.equal(directFailureRelayCalls.length, 1);
  assert.deepEqual(directFailureRelayCalls[0].updateData, { [POWER_PP_CURRENT_PATH]: 7 });
  assert.deepEqual(directFailureRelayCalls[0].options, POWER_COST_REQUEST_OPTIONS);
  assert.equal(directFailureActor.updateSourceCalls.length, 1);
  assert.deepEqual(directFailureActor.updateSourceCalls[0], { [POWER_PP_CURRENT_PATH]: 7 });

  const insufficientNotifications = [];
  const insufficientHooks = buildPowerCostRules({
    requestActorSheetUpdate: () => true,
    notifyInsufficientPowerPoints: message => insufficientNotifications.push(message),
    canDirectlyUpdateActor: () => true
  });
  const insufficientResult = await insufficientHooks.applyPowerCost(
    { system: { resources: { pp: { current: 1 } } }, update: async () => {} },
    { type: "pouvoir", system: { powerCostEnabled: true, powerCost: 2 } }
  );
  assert.equal(insufficientResult, false);
  assert.deepEqual(insufficientNotifications, [POWER_COST_INSUFFICIENT_MESSAGE]);

  const relayCalls = [];
  const relayHooks = buildPowerCostRules({
    requestActorSheetUpdate: (actor, updateData, options) => {
      relayCalls.push({ kind: "request", actor, updateData, options });
      return true;
    },
    canDirectlyUpdateActor: () => false,
    deepClone: updateData => ({ ...updateData }),
    setProperty: () => {
      throw new Error("setProperty should not be used when updateSource exists");
    }
  });
  const relayActor = {
    system: { resources: { pp: { current: 8 } } },
    updateSourceCalls: [],
    updateSource(updateData) {
      this.updateSourceCalls.push(updateData);
    }
  };
  const relayResult = await relayHooks.applyPowerCost(relayActor, directItem);
  assert.equal(relayResult, true);
  assert.equal(relayCalls.length, 1);
  assert.deepEqual(relayCalls[0].updateData, { [POWER_PP_CURRENT_PATH]: 5 });
  assert.deepEqual(relayCalls[0].options, POWER_COST_REQUEST_OPTIONS);
  assert.equal(relayActor.updateSourceCalls.length, 1);
  assert.deepEqual(relayActor.updateSourceCalls[0], { [POWER_PP_CURRENT_PATH]: 5 });

  const relayRejectedHooks = buildPowerCostRules({
    requestActorSheetUpdate: () => false,
    canDirectlyUpdateActor: () => false
  });
  const relayRejectedResult = await relayRejectedHooks.applyPowerCost(
    { system: { resources: { pp: { current: 8 } } }, updateSource: () => {} },
    directItem
  );
  assert.equal(relayRejectedResult, false);

  const setPropertyCalls = [];
  const fallbackActor = {
    system: { resources: { pp: { current: 7 } } }
  };
  const fallbackHooks = buildPowerCostRules({
    requestActorSheetUpdate: () => true,
    canDirectlyUpdateActor: () => false,
    setProperty: (object, path, value) => {
      setPropertyCalls.push({ object, path, value });
      object.system.resources.pp.current = value;
    }
  });
  const fallbackResult = await fallbackHooks.applyPowerCost(fallbackActor, directItem);
  assert.equal(fallbackResult, true);
  assert.equal(setPropertyCalls.length, 1);
  assert.equal(setPropertyCalls[0].path, POWER_PP_CURRENT_PATH);
  assert.equal(setPropertyCalls[0].value, 4);
  assert.equal(fallbackActor.system.resources.pp.current, 4);
}

run()
  .then(() => {
    console.log("power-cost.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
