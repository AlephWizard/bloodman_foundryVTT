import assert from "node:assert/strict";
import { createWeaponReloadRules } from "../../src/rules/weapon-reload.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function toCheckboxBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

function normalizeAmmoState(value, { fallback = {} } = {}) {
  return {
    stock: normalizeNonNegativeInteger(value?.stock ?? fallback?.stock, 0),
    magazine: normalizeNonNegativeInteger(value?.magazine ?? fallback?.magazine, 0)
  };
}

function getWeaponLoadedAmmo(item, { fallback = 0 } = {}) {
  return normalizeNonNegativeInteger(item?.system?.loadedAmmo, fallback);
}

async function run() {
  const rules = createWeaponReloadRules({
    normalizeNonNegativeInteger,
    toCheckboxBoolean,
    getWeaponCategory: value => (String(value || "").trim().toLowerCase() === "distance" ? "distance" : "corps"),
    normalizeAmmoState,
    buildDefaultAmmo: () => ({ stock: 0, magazine: 0 }),
    getWeaponLoadedAmmo
  });

  assert.deepEqual(rules.resolveWeaponReloadPlan({ item: null }), {
    ok: false,
    reason: "not-weapon"
  });

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: { type: "arme", system: { weaponType: "corps" } }
    }),
    { ok: false, reason: "not-ranged" }
  );

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: { type: "arme", system: { weaponType: "distance", infiniteAmmo: true } }
    }),
    { ok: false, reason: "infinite-ammo" }
  );

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: { type: "arme", system: { weaponType: "distance", magazineCapacity: 0 } }
    }),
    { ok: false, reason: "invalid-capacity", capacity: 0 }
  );

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: {
        type: "arme",
        system: { weaponType: "distance", magazineCapacity: 6, loadedAmmo: 2 }
      },
      actorAmmoData: { stock: 0, magazine: 0 }
    }),
    {
      ok: false,
      reason: "no-ammo",
      capacity: 6,
      ammoStock: 0,
      currentMagazine: 2
    }
  );

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: {
        type: "arme",
        system: { weaponType: "distance", magazineCapacity: 6, loadedAmmo: 6 }
      },
      actorAmmoData: { stock: 5, magazine: 0 }
    }),
    {
      ok: false,
      reason: "already-full",
      capacity: 6,
      ammoStock: 5,
      currentMagazine: 6
    }
  );

  assert.deepEqual(
    rules.resolveWeaponReloadPlan({
      item: {
        type: "arme",
        system: { weaponType: "distance", magazineCapacity: 6, loadedAmmo: 2 }
      },
      actorAmmoData: { stock: 5, magazine: 0 }
    }),
    {
      ok: true,
      reason: "",
      capacity: 6,
      ammoStock: 5,
      currentMagazine: 2,
      transferred: 4,
      nextStock: 1,
      nextMagazine: 6
    }
  );
}

run()
  .then(() => {
    console.log("weapon-reload.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
