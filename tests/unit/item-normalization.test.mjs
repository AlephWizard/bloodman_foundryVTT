import assert from "node:assert/strict";
import {
  ITEM_SINGLE_USE_COUNT_PATH,
  createItemNormalizationRules
} from "../../src/rules/item-normalization.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function toCheckboxBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no" || normalized === "") return false;
  }
  return Boolean(fallback);
}

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setProperty(object, path, value) {
  const segments = String(path || "").split(".").filter(Boolean);
  let current = object;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    current[key] ||= {};
    current = current[key];
  }
  current[segments[segments.length - 1]] = value;
}

function hasUpdatePath(updateData, path) {
  return Object.prototype.hasOwnProperty.call(updateData || {}, path)
    || getProperty(updateData, path) !== undefined;
}

function getUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData || {}, path)) return updateData[path];
  const value = getProperty(updateData, path);
  return value === undefined ? fallback : value;
}

function buildRules(errors = []) {
  return createItemNormalizationRules({
    normalizeNonNegativeInteger,
    toCheckboxBoolean,
    toBooleanFlag: toCheckboxBoolean,
    normalizeCarriedItemInventorySlots: (value, fallback = 1) => Math.max(1, normalizeNonNegativeInteger(value, fallback)),
    hasUpdatePath,
    getUpdatedPathValue,
    setProperty,
    validateRollFormula: value => {
      if (String(value).includes("bad")) return { valid: false, error: "bad formula" };
      return { valid: true, normalized: String(value).replace(/\s+/g, "") };
    },
    normalizeRollDieFormula: (value, fallback = "d4") => String(value || fallback),
    translate: (key, data = null) => {
      if (key === "BLOODMAN.Notifications.ItemRollFormulaInvalid") return `invalid ${data.itemName}${data.details}`;
      return key;
    },
    translateWithFallback: (_key, fallback) => fallback,
    notifyError: message => errors.push(message)
  });
}

function run() {
  const rules = buildRules();

  assert.equal(ITEM_SINGLE_USE_COUNT_PATH, "system.singleUseCount");
  assert.equal(rules.normalizeSingleUseCountValue(0, { enabled: true }), 1);
  assert.deepEqual(
    rules.resolveItemSingleUseDisplayData({ singleUseEnabled: true, singleUseCount: 3 }),
    { show: true, count: 3, label: "NB USAGES 3" }
  );
  assert.deepEqual(
    rules.resolveItemSingleUseDisplayData({ singleUseEnabled: true, singleUseCount: 1 }),
    { show: false, count: 0, label: "" }
  );

  const singleUseUpdate = {};
  const singleUseResult = rules.normalizeItemSingleUseUpdate(
    { system: { singleUseEnabled: true, singleUseCount: 2 } },
    singleUseUpdate,
    { includeSourceWhenMissing: true }
  );
  assert.equal(singleUseResult.changed, true);
  assert.equal(getProperty(singleUseUpdate, "system.singleUseCount"), 2);

  const inventoryUpdate = { system: { inventorySlots: "4.8" } };
  const inventoryResult = rules.normalizeItemInventorySlotsUpdate(
    { system: { inventorySlots: 1 } },
    inventoryUpdate
  );
  assert.equal(inventoryResult.changed, true);
  assert.equal(getProperty(inventoryUpdate, "system.inventorySlots"), 4);

  const formulaUpdate = { system: { damageDie: " d6 + 1 " } };
  const formulaResult = rules.normalizeItemRollFormulaFields(
    { type: "arme", system: {} },
    formulaUpdate
  );
  assert.equal(formulaResult.changed, true);
  assert.equal(getProperty(formulaUpdate, "system.damageDie"), "d6+1");

  const errors = [];
  const invalidRules = buildRules(errors);
  const invalidResult = invalidRules.normalizeItemRollFormulaFields(
    { type: "arme", name: "Pistolet", system: {} },
    { system: { damageDie: "bad" } }
  );
  assert.equal(invalidResult.invalid, true);
  invalidRules.notifyInvalidItemRollFormula(
    { type: "arme", name: "Pistolet" },
    invalidResult.invalidFields,
    invalidResult.invalidFieldErrors
  );
  assert.equal(errors[0], "invalid Pistolet (de de degat: bad formula)");
}

run();
console.log("item-normalization.test.mjs: OK");
