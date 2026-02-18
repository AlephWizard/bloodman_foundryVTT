import assert from "node:assert/strict";
import { createWeaponAmmoRules } from "../../src/rules/weapon-ammo.mjs";

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    const fallbackNumeric = Number(fallback);
    return Number.isFinite(fallbackNumeric) ? Math.max(0, Math.floor(fallbackNumeric)) : 0;
  }
  return Math.max(0, Math.floor(numeric));
}

function normalizeWeaponType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "distance" || normalized === "corps") return normalized;
  return "";
}

function toCheckboxBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function getWeaponCategory(value) {
  const normalized = normalizeWeaponType(value);
  return normalized === "corps" ? "corps" : "distance";
}

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setProperty(object, path, value) {
  const keys = String(path || "").split(".");
  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) continue;
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function buildRules() {
  return createWeaponAmmoRules({
    normalizeNonNegativeInteger: toNonNegativeInteger,
    normalizeWeaponType,
    toCheckboxBoolean,
    getWeaponCategory,
    getProperty,
    setProperty
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(rules.normalizeWeaponLoadedAmmoValue(7, 0, 5), 5);
  assert.equal(rules.normalizeWeaponLoadedAmmoValue(-1, 2, 10), 0);
  assert.equal(rules.normalizeWeaponLoadedAmmoValue("x", 2, 10), 2);
  assert.equal(rules.normalizeWeaponLoadedAmmoValue(5, 0, 0), 0);

  assert.equal(
    rules.getWeaponLoadedAmmo({ system: { magazineCapacity: 6, loadedAmmo: 9 } }, { fallback: 0 }),
    6
  );
  assert.equal(
    rules.getWeaponLoadedAmmo({ system: { magazineCapacity: 0, loadedAmmo: 9 } }, { fallback: 3 }),
    0
  );

  assert.equal(
    rules.normalizeWeaponMagazineCapacityUpdate({ type: "objet", system: {} }, {}),
    false
  );

  const noRelevantUpdate = { system: { note: "ignore" } };
  assert.equal(
    rules.normalizeWeaponMagazineCapacityUpdate(
      {
        type: "arme",
        actor: { system: { ammo: { magazine: 5 } } },
        system: { magazineCapacity: 6, loadedAmmo: 2, weaponType: "distance", infiniteAmmo: false }
      },
      noRelevantUpdate
    ),
    false
  );

  const updateData = { system: { magazineCapacity: "4", loadedAmmo: "10" } };
  const weaponItem = {
    type: "arme",
    actor: { system: { ammo: { magazine: 5 } } },
    system: { magazineCapacity: 6, loadedAmmo: 2, weaponType: "distance", infiniteAmmo: false }
  };
  assert.equal(rules.normalizeWeaponMagazineCapacityUpdate(weaponItem, updateData), true);
  assert.equal(getProperty(updateData, "system.weaponType"), "distance");
  assert.equal(getProperty(updateData, "system.magazineCapacity"), 4);
  assert.equal(getProperty(updateData, "system.loadedAmmo"), 4);

  const meleeUpdate = { "system.weaponType": "corps", "system.loadedAmmo": "3" };
  assert.equal(rules.normalizeWeaponMagazineCapacityUpdate(weaponItem, meleeUpdate), true);
  assert.equal(getProperty(meleeUpdate, "system.weaponType"), "corps");
  assert.equal(getProperty(meleeUpdate, "system.magazineCapacity"), 6);
  assert.equal(getProperty(meleeUpdate, "system.loadedAmmo"), 0);

  const infiniteAmmoUpdate = { "system.infiniteAmmo": true, "system.loadedAmmo": "3" };
  assert.equal(rules.normalizeWeaponMagazineCapacityUpdate(weaponItem, infiniteAmmoUpdate), true);
  assert.equal(getProperty(infiniteAmmoUpdate, "system.weaponType"), "distance");
  assert.equal(getProperty(infiniteAmmoUpdate, "system.magazineCapacity"), 6);
  assert.equal(getProperty(infiniteAmmoUpdate, "system.loadedAmmo"), 0);

  const sourceCalls = [];
  const sourceItem = {
    type: "arme",
    actor: { system: { ammo: { magazine: 2 } } },
    system: {
      magazineCapacity: "8.8",
      loadedAmmo: "11",
      weaponType: "distance",
      infiniteAmmo: false
    },
    updateSource(updateData) {
      sourceCalls.push(updateData);
    }
  };
  assert.equal(rules.normalizeWeaponMagazineCapacityUpdate(sourceItem), true);
  assert.equal(sourceCalls.length, 1);
  assert.deepEqual(sourceCalls[0], {
    "system.weaponType": "distance",
    "system.magazineCapacity": 8,
    "system.loadedAmmo": 8
  });
}

run()
  .then(() => {
    console.log("weapon-ammo.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
