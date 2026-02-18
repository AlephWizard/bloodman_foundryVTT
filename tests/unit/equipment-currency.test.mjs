import assert from "node:assert/strict";
import { createEquipmentCurrencyRules } from "../../src/rules/equipment-currency.mjs";

function parseSimpleArithmeticInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const numeric = Number(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) return { ok: false, empty: false, value: Number.NaN };
  return { ok: true, empty: false, value: numeric };
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
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

function buildDefaultEquipment() {
  return {
    monnaies: "",
    monnaiesActuel: 0,
    itemCountLimit: 10,
    bagSlotsEnabled: false
  };
}

function buildRules() {
  return createEquipmentCurrencyRules({
    parseSimpleArithmeticInput,
    toFiniteNumber,
    currencyCurrentMax: 1_000_000,
    hasUpdatePath,
    getUpdatedPathValue,
    buildDefaultEquipment,
    mergeObject,
    setProperty,
    translate: key => (key === "BLOODMAN.Notifications.InvalidCurrencyCurrent" ? "Valeur invalide" : key)
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(rules.roundCurrencyValue(10), 10);
  assert.equal(rules.roundCurrencyValue(10.005), 10.01);
  assert.equal(rules.roundCurrencyValue(10.0000001), 10);

  assert.deepEqual(rules.normalizeCurrencyCurrentValue("15.5", 0), { ok: true, value: 15.5 });
  assert.deepEqual(rules.normalizeCurrencyCurrentValue("", 0), { ok: true, value: 0 });
  assert.deepEqual(rules.normalizeCurrencyCurrentValue("-1", 12), { ok: false, value: 12 });
  assert.deepEqual(rules.normalizeCurrencyCurrentValue("not-a-number", 9), { ok: false, value: 9 });
  assert.deepEqual(rules.normalizeCurrencyCurrentValue("1000001", 9), { ok: false, value: 9 });

  assert.equal(rules.formatCurrencyValue("12"), "12");
  assert.equal(rules.formatCurrencyValue("12.5"), "12.5");
  assert.equal(rules.formatCurrencyValue("12.50"), "12.5");

  assert.equal(rules.buildInvalidCurrencyCurrentMessage(), "Valeur invalide");

  assert.deepEqual(rules.normalizeActorEquipmentCurrencyUpdateData({}, null), { changed: false, invalid: false });
  assert.deepEqual(
    rules.normalizeActorEquipmentCurrencyUpdateData(
      { system: { equipment: { monnaies: "Or", monnaiesActuel: 5 } } },
      { system: { label: "ignore" } }
    ),
    { changed: false, invalid: false }
  );

  const directUpdateData = { system: { equipment: { monnaies: " Argent ", monnaiesActuel: "15.75" } } };
  const directResult = rules.normalizeActorEquipmentCurrencyUpdateData(
    { system: { equipment: { monnaies: "Or", monnaiesActuel: 5 } } },
    directUpdateData
  );
  assert.deepEqual(directResult, { changed: true, invalid: false, currencyCurrent: 15.75 });
  assert.equal(getProperty(directUpdateData, "system.equipment.monnaies"), "Argent");
  assert.equal(getProperty(directUpdateData, "system.equipment.monnaiesActuel"), 15.75);

  const pathUpdateData = {
    "system.equipment.monnaies": " Credits ",
    "system.equipment.monnaiesActuel": "20"
  };
  const pathResult = rules.normalizeActorEquipmentCurrencyUpdateData(
    { system: { equipment: { monnaies: "Or", monnaiesActuel: 5 } } },
    pathUpdateData
  );
  assert.deepEqual(pathResult, { changed: true, invalid: false, currencyCurrent: 20 });
  assert.equal(getProperty(pathUpdateData, "system.equipment.monnaies"), "Credits");
  assert.equal(getProperty(pathUpdateData, "system.equipment.monnaiesActuel"), 20);

  const invalidUpdateData = { "system.equipment.monnaiesActuel": "-10" };
  const invalidResult = rules.normalizeActorEquipmentCurrencyUpdateData(
    { system: { equipment: { monnaies: "Or", monnaiesActuel: 7 } } },
    invalidUpdateData
  );
  assert.equal(invalidResult.changed, false);
  assert.equal(invalidResult.invalid, true);
  assert.equal(invalidResult.message, "Valeur invalide");
}

run()
  .then(() => {
    console.log("equipment-currency.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
