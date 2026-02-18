import assert from "node:assert/strict";
import { createAmmoStateRules } from "../../src/rules/ammo-state.mjs";

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    const fallbackNumeric = Number(fallback);
    return Number.isFinite(fallbackNumeric) ? Math.max(0, Math.floor(fallbackNumeric)) : 0;
  }
  return Math.max(0, Math.floor(numeric));
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
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "corps" ? "corps" : "distance";
}

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function hasUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  return Object.prototype.hasOwnProperty.call(updateData, path)
    || getProperty(updateData, path) !== undefined;
}

function getUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
  const nested = getProperty(updateData, path);
  return nested === undefined ? fallback : nested;
}

function unsetUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  if (Object.prototype.hasOwnProperty.call(updateData, path)) {
    delete updateData[path];
    return true;
  }
  return false;
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

function mergeObject(target, source, { inplace = false } = {}) {
  const base = inplace ? target : JSON.parse(JSON.stringify(target || {}));
  for (const [key, value] of Object.entries(source || {})) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === "object"
      && !Array.isArray(base[key])
    ) {
      base[key] = mergeObject(base[key], value, { inplace: false });
      continue;
    }
    base[key] = value;
  }
  return base;
}

function buildRules() {
  return createAmmoStateRules({
    normalizeNonNegativeInteger,
    toCheckboxBoolean,
    getWeaponCategory,
    hasUpdatePath,
    getUpdatedPathValue,
    unsetUpdatePath,
    setProperty,
    mergeObject
  });
}

async function run() {
  const rules = buildRules();

  assert.deepEqual(rules.buildDefaultAmmo(), { type: "", stock: 0, magazine: 0, value: 0 });
  assert.equal(rules.normalizeAmmoType("  9mm  "), "9mm");
  assert.equal(rules.normalizeAmmoType(null), "");

  const actorForCapacity = {
    items: [
      { type: "arme", system: { weaponType: "distance", infiniteAmmo: false, magazineCapacity: 8 } },
      { type: "arme", system: { weaponType: "corps", infiniteAmmo: false, magazineCapacity: 20 } },
      { type: "arme", system: { weaponType: "distance", infiniteAmmo: true, magazineCapacity: 30 } },
      { type: "arme", system: { weaponType: "distance", infiniteAmmo: false, magazineCapacity: 12 } }
    ]
  };
  assert.equal(rules.getActorAmmoCapacityLimit(actorForCapacity), 12);

  assert.deepEqual(
    rules.normalizeAmmoState({ type: " 9mm ", stock: "5", magazine: "15" }, { fallback: { value: 2 }, capacity: 10 }),
    { type: "9mm", stock: 5, magazine: 10, value: 5 }
  );
  assert.deepEqual(
    rules.normalizeAmmoState({ value: "3" }, { fallback: { type: "shell", stock: 1, magazine: 1 }, capacity: 0 }),
    { type: "shell", stock: 3, magazine: 3, value: 3 }
  );

  assert.equal(
    rules.areAmmoStatesEqual(
      { type: "9mm", stock: 4, magazine: 2 },
      { type: "9mm", stock: "4", magazine: "2" }
    ),
    true
  );
  assert.equal(
    rules.areAmmoStatesEqual(
      { type: "9mm", stock: 4, magazine: 2 },
      { type: "9mm", stock: 3, magazine: 2 }
    ),
    false
  );

  assert.equal(
    rules.normalizeActorAmmoUpdateData(
      { system: { ammo: { type: "9mm", stock: 4, magazine: 2 } }, items: [] },
      { system: { label: "ignore" } }
    ),
    false
  );

  const actor = {
    system: { ammo: { type: "9mm", stock: 6, magazine: 4 } },
    items: [{ type: "arme", system: { weaponType: "distance", infiniteAmmo: false, magazineCapacity: 8 } }]
  };
  const updateDataFromRoot = {
    "system.ammo": { stock: "10", magazine: "12", type: " 5.56 " }
  };
  assert.equal(rules.normalizeActorAmmoUpdateData(actor, updateDataFromRoot), true);
  assert.equal(Object.prototype.hasOwnProperty.call(updateDataFromRoot, "system.ammo"), false);
  assert.equal(getProperty(updateDataFromRoot, "system.ammo.type"), "5.56");
  assert.equal(getProperty(updateDataFromRoot, "system.ammo.stock"), 10);
  assert.equal(getProperty(updateDataFromRoot, "system.ammo.magazine"), 8);
  assert.equal(getProperty(updateDataFromRoot, "system.ammo.value"), 10);

  const updateDataFromPaths = {
    "system.ammo.stock": "7",
    "system.ammo.value": "11",
    "system.ammo.magazine": "2"
  };
  assert.equal(rules.normalizeActorAmmoUpdateData(actor, updateDataFromPaths), true);
  assert.equal(getProperty(updateDataFromPaths, "system.ammo.stock"), 7);
  assert.equal(getProperty(updateDataFromPaths, "system.ammo.magazine"), 2);
  assert.equal(getProperty(updateDataFromPaths, "system.ammo.value"), 7);
}

run()
  .then(() => {
    console.log("ammo-state.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
