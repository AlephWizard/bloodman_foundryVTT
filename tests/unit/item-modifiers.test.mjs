import assert from "node:assert/strict";
import { createItemModifierRules } from "../../src/rules/item-modifiers.mjs";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function expandObject(object) {
  const source = object && typeof object === "object" ? object : {};
  const expanded = {};
  for (const [path, value] of Object.entries(source)) {
    if (!path.includes(".")) {
      expanded[path] = value;
      continue;
    }
    const keys = path.split(".");
    let current = expanded;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const key = keys[index];
      if (!current[key] || typeof current[key] !== "object") current[key] = {};
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }
  return expanded;
}

function mergeObject(target, source, { inplace = false } = {}) {
  const base = inplace ? target : deepClone(target || {});
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

function toCheckboxBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function normalizeSignedModifierInput(value, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: Number(fallback) || 0, invalid: false };
  const numeric = Number(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) return { value: Number(fallback) || 0, invalid: true };
  return { value: Math.trunc(numeric), invalid: false };
}

function buildItemModifierErrorMessage(invalidFields = []) {
  return invalidFields.length ? `Invalid: ${invalidFields.join(",")}` : null;
}

function buildRules() {
  return createItemModifierRules({
    characteristicBonusItemTypes: new Set(["objet", "protection", "aptitude", "pouvoir"]),
    paBonusItemTypes: new Set(["protection", "aptitude", "pouvoir"]),
    characteristics: [{ key: "PHY" }, { key: "ESP" }],
    toCheckboxBoolean,
    normalizeSignedModifierInput,
    buildItemModifierErrorMessage,
    deepClone,
    expandObject,
    mergeObject,
    getProperty,
    setProperty
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(
    rules.normalizeCharacteristicBonusItemUpdate({ type: "ration", system: {} }, {}),
    false
  );

  const updateData = {
    "system.useEnabled": "false",
    "system.characteristicBonusEnabled": "true",
    "system.characteristicBonuses.PHY": "4",
    "system.characteristicBonuses.ESP": "oops",
    "system.pa": "3"
  };
  const protectionItem = {
    type: "protection",
    system: {
      useEnabled: true,
      characteristicBonusEnabled: false,
      characteristicBonuses: { PHY: 1, ESP: 2 },
      pa: 1,
      erreur: null
    }
  };
  assert.equal(rules.normalizeCharacteristicBonusItemUpdate(protectionItem, updateData), true);
  assert.equal(getProperty(updateData, "system.useEnabled"), false);
  assert.equal(getProperty(updateData, "system.characteristicBonusEnabled"), true);
  assert.equal(getProperty(updateData, "system.characteristicBonuses.PHY"), 4);
  assert.equal(getProperty(updateData, "system.characteristicBonuses.ESP"), 2);
  assert.equal(getProperty(updateData, "system.pa"), 3);
  assert.equal(getProperty(updateData, "system.erreur"), "Invalid: ESP");

  const sourceCalls = [];
  const aptitudeItem = {
    type: "aptitude",
    system: {
      characteristicBonusEnabled: "1",
      characteristicBonuses: { PHY: "2", ESP: "3" },
      pa: "5",
      erreur: "old"
    },
    updateSource(updateDataPayload) {
      sourceCalls.push(updateDataPayload);
    }
  };
  assert.equal(rules.normalizeCharacteristicBonusItemUpdate(aptitudeItem), true);
  assert.equal(sourceCalls.length, 1);
  assert.deepEqual(sourceCalls[0], {
    "system.characteristicBonusEnabled": true,
    "system.characteristicBonuses.PHY": 2,
    "system.characteristicBonuses.ESP": 3,
    "system.pa": 5,
    "system.erreur": null
  });
}

run()
  .then(() => {
    console.log("item-modifiers.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
