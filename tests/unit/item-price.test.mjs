import assert from "node:assert/strict";
import { createItemPriceRules } from "../../src/rules/item-price.mjs";

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
  return createItemPriceRules({
    priceItemTypes: new Set(["arme", "objet", "soin"]),
    getProperty,
    setProperty,
    translate: key => (key === "BLOODMAN.Items.PriceInvalid" ? "Prix invalide" : key)
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(rules.isPriceManagedItemType("arme"), true);
  assert.equal(rules.isPriceManagedItemType("ARME"), true);
  assert.equal(rules.isPriceManagedItemType("aptitude"), false);

  assert.deepEqual(rules.resolveItemPricePreviewState(""), { salePrice: "", errorMessage: "" });
  assert.deepEqual(rules.resolveItemPricePreviewState("10"), { salePrice: "2", errorMessage: "" });
  assert.deepEqual(rules.resolveItemPricePreviewState(" 12,2 "), { salePrice: "3", errorMessage: "" });
  assert.deepEqual(rules.resolveItemPricePreviewState("-1"), { salePrice: "", errorMessage: "Prix invalide" });
  assert.deepEqual(rules.resolveItemPricePreviewState("abc"), { salePrice: "", errorMessage: "Prix invalide" });

  assert.deepEqual(
    rules.resolveItemSalePriceState("10", ""),
    { salePrice: "2", errorMessage: "" }
  );
  assert.deepEqual(
    rules.resolveItemSalePriceState("10", "5"),
    { salePrice: "5", errorMessage: "" }
  );
  assert.deepEqual(
    rules.resolveItemSalePriceState("x", "5"),
    { salePrice: "5", errorMessage: "Prix invalide" }
  );

  assert.equal(rules.isItemSalePriceManual("10", ""), false);
  assert.equal(rules.isItemSalePriceManual("10", "2"), false);
  assert.equal(rules.isItemSalePriceManual("10", "3"), true);
  assert.equal(rules.isItemSalePriceManual("abc", "3"), true);

  assert.equal(
    rules.normalizeItemPriceUpdate({ type: "aptitude", system: { price: "10", salePrice: "2" } }, {}),
    false
  );

  const noRelevantUpdate = { system: { label: "ignore" } };
  assert.equal(
    rules.normalizeItemPriceUpdate({ type: "arme", system: { price: "10", salePrice: "2" } }, noRelevantUpdate),
    false
  );

  const autoUpdateData = { system: { price: "20" } };
  const autoUpdated = rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "2" } },
    autoUpdateData
  );
  assert.equal(autoUpdated, true);
  assert.equal(getProperty(autoUpdateData, "system.price"), "20");
  assert.equal(getProperty(autoUpdateData, "system.salePrice"), "4");

  const manualPriceOverrideUpdateData = { system: { price: "15" } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "7" } },
    manualPriceOverrideUpdateData
  );
  assert.equal(getProperty(manualPriceOverrideUpdateData, "system.salePrice"), "3");

  const explicitSaleUpdateData = { system: { salePrice: " 6 " } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "2" } },
    explicitSaleUpdateData
  );
  assert.equal(getProperty(explicitSaleUpdateData, "system.price"), "30");
  assert.equal(getProperty(explicitSaleUpdateData, "system.salePrice"), "6");

  const explicitSaleWithPricePayload = { system: { price: "10", salePrice: "6" } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "2" } },
    explicitSaleWithPricePayload
  );
  assert.equal(getProperty(explicitSaleWithPricePayload, "system.price"), "30");
  assert.equal(getProperty(explicitSaleWithPricePayload, "system.salePrice"), "6");

  const explicitPriceWithSalePayload = { system: { price: "20", salePrice: "4" } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "2" } },
    explicitPriceWithSalePayload
  );
  assert.equal(getProperty(explicitPriceWithSalePayload, "system.price"), "20");
  assert.equal(getProperty(explicitPriceWithSalePayload, "system.salePrice"), "4");

  const clearSaleUpdateData = { system: { salePrice: "" } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "7" } },
    clearSaleUpdateData
  );
  assert.equal(getProperty(clearSaleUpdateData, "system.price"), "10");
  assert.equal(getProperty(clearSaleUpdateData, "system.salePrice"), "2");

  const invalidSaleUpdateData = { system: { salePrice: "abc" } };
  rules.normalizeItemPriceUpdate(
    { type: "arme", system: { price: "10", salePrice: "2" } },
    invalidSaleUpdateData
  );
  assert.equal(getProperty(invalidSaleUpdateData, "system.price"), "10");
  assert.equal(getProperty(invalidSaleUpdateData, "system.salePrice"), "abc");

  const sourceCalls = [];
  const sourceItem = {
    type: "arme",
    system: {
      price: " 8 ",
      salePrice: ""
    },
    updateSource(updateData) {
      sourceCalls.push(updateData);
    }
  };
  const sourceResult = rules.normalizeItemPriceUpdate(sourceItem);
  assert.equal(sourceResult, true);
  assert.equal(sourceCalls.length, 1);
  assert.deepEqual(sourceCalls[0], {
    "system.price": "8",
    "system.salePrice": "2"
  });
}

run()
  .then(() => {
    console.log("item-price.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
