import assert from "node:assert/strict";
import {
  NPC_ZERO_PV_STATUS_CANDIDATES,
  PLAYER_ZERO_PV_STATUS_CANDIDATES,
  buildDeadFallbackStatusEffect,
  buildStatusFamilyIds,
  findStatusEffect,
  getActiveEffectStatusIds,
  getStatusEffectIds,
  getTokenStatusesList,
  normalizeStatusValue,
  removeTokenStatusOverrides,
  setTokenStatusEffect
} from "../../src/rules/status-effect-sync.mjs";

async function run() {
  globalThis.CONFIG = {
    specialStatusEffects: { DEFEATED: "dead" },
    statusEffects: [
      { id: "dead", statuses: ["dead"], name: "Dead" },
      { id: "bleeding", statuses: ["bleeding"], name: "Bleeding" }
    ]
  };
  globalThis.foundry = {
    utils: {
      getProperty(source, path) {
        return path.split(".").reduce((cursor, key) => cursor?.[key], source);
      }
    }
  };

  assert.equal(normalizeStatusValue(" Bleeding "), "bleeding");
  assert.deepEqual(getStatusEffectIds({ id: "Dead", statuses: ["dead", "DEAD"] }, { normalized: true }), ["dead"]);
  assert.equal(findStatusEffect(PLAYER_ZERO_PV_STATUS_CANDIDATES)?.id, "bleeding");
  assert.equal(findStatusEffect(NPC_ZERO_PV_STATUS_CANDIDATES)?.id, "dead");

  const deadFallback = buildDeadFallbackStatusEffect();
  assert.deepEqual(buildStatusFamilyIds(deadFallback, ["defeated", "mort"]), ["defeated", "mort", "dead"]);

  assert.deepEqual(
    getActiveEffectStatusIds({ statuses: new Set(["Rage"]), flags: { core: { statusId: "rage" } } }),
    ["rage", "rage"]
  );

  const tokenDoc = {
    statuses: ["bleeding", "rage"],
    async update(updateData) {
      this.statuses = updateData.statuses;
    }
  };
  assert.deepEqual(getTokenStatusesList(tokenDoc), ["bleeding", "rage"]);
  assert.equal(await removeTokenStatusOverrides(tokenDoc, ["bleeding"]), true);
  assert.deepEqual(tokenDoc.statuses, ["rage"]);

  const deadTokenDoc = {
    statuses: ["dead"],
    async update(updateData) {
      this.statuses = updateData.statuses;
    }
  };
  assert.equal(await setTokenStatusEffect(deadTokenDoc, { id: "dead", statuses: ["dead"] }, true, ["dead"]), true);
  assert.deepEqual(deadTokenDoc.statuses, ["dead"]);
}

run()
  .then(() => {
    console.log("status-effect-sync.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
