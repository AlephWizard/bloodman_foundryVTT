import assert from "node:assert/strict";
import { createDropDecisionRules } from "../../src/rules/drop-decision.mjs";

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

function formatCurrencyValue(value) {
  const normalized = roundCurrencyValue(Math.max(0, toFiniteNumber(value, 0)));
  if (Number.isInteger(normalized)) return String(normalized);
  return normalized.toFixed(2).replace(/\.?0+$/, "");
}

async function run() {
  const droppedTable = {
    a: {
      id: "a",
      name: "Pistolet",
      type: "arme",
      actor: { id: "source-a" },
      system: { price: "30", damageDie: "d6", weaponType: "distance", magazineCapacity: 6, loadedAmmo: 4 }
    },
    b: {
      id: "b",
      name: "Couteau",
      type: "arme",
      actor: { id: "target-actor" },
      system: { price: "5", damageDie: "d4", weaponType: "corps" }
    },
    c: {
      id: "c",
      name: "Kit",
      type: "soin",
      actor: null,
      system: { price: "12", healDie: "d8" }
    }
  };

  const rules = createDropDecisionRules({
    parseLooseNumericInput: value => {
      const raw = String(value ?? "").trim().replace(",", ".");
      if (!raw) return { ok: true, empty: true, value: 0 };
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) return { ok: false, empty: false, value: Number.NaN };
      return { ok: true, empty: false, value: numeric };
    },
    roundCurrencyValue,
    formatCurrencyValue,
    toFiniteNumber,
    normalizeRollDieFormula: (value, fallback = "d4") => {
      const raw = String(value || fallback).trim();
      if (!raw) return "1d4";
      return /^\d/.test(raw) ? raw : `1${raw}`;
    },
    getWeaponCategory: value => (String(value || "").trim().toLowerCase() === "corps" ? "corps" : "distance"),
    normalizeNonNegativeInteger: (value, fallback = 0) => Math.max(0, Math.floor(toFiniteNumber(value, fallback))),
    getWeaponLoadedAmmo: item => Math.max(0, Math.floor(Number(item?.system?.loadedAmmo || 0))),
    fromDropData: async entry => {
      const key = String(entry?.id || "");
      if (!Object.prototype.hasOwnProperty.call(droppedTable, key)) throw new Error("missing");
      return droppedTable[key];
    },
    translate: key => {
      if (key === "BLOODMAN.Common.Name") return "Nom";
      if (key === "TYPES.Item.arme") return "Arme";
      if (key === "TYPES.Item.soin") return "Soin";
      if (key === "TYPES.Item.protection") return "Protection";
      return key;
    },
    translateWithFallback: (key, fallback, data = null) => {
      if (key === "BLOODMAN.Dialogs.DropDecision.Intro") {
        return `Intro ${data?.item || "?"} -> ${data?.sheet || "?"}`;
      }
      if (key === "BLOODMAN.Dialogs.DropDecision.Question") return "Question";
      if (key === "BLOODMAN.Dialogs.DropDecision.CostLabel") return "Cout";
      if (key === "BLOODMAN.Dialogs.DropDecision.SpecificitiesLabel") return "Specificites";
      if (key === "BLOODMAN.Dialogs.DropDecision.MoreItems") return `+ ${data?.count || 0} objet(s) supplementaire(s).`;
      if (key === "BLOODMAN.Dialogs.DropDecision.NoSpecificities") return "Aucune specificite disponible.";
      return fallback;
    }
  });

  assert.equal(rules.getDropItemQuantity({ quantity: "3.8" }), 3);
  assert.equal(rules.getDropItemQuantity({ count: 2 }), 2);
  assert.equal(rules.getDropItemQuantity({ amount: -1, data: { quantity: 0 } }, { system: { quantity: 4 } }), 4);
  assert.equal(rules.getDropItemQuantity({}), 1);

  assert.deepEqual(rules.getDropEntries({ items: [{ id: 1 }, { id: 2 }] }), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(rules.getDropEntries({ id: 5 }), [{ id: 5 }]);

  assert.deepEqual(rules.getDroppedItemUnitPrice({ system: { price: "" } }), { ok: true, value: 0 });
  assert.deepEqual(rules.getDroppedItemUnitPrice({ system: { price: "12.5" } }), { ok: true, value: 12.5 });
  assert.deepEqual(rules.getDroppedItemUnitPrice({ system: { price: "oops" } }), { ok: false, value: 0 });

  assert.equal(rules.sanitizeDropDialogText("<b>Alpha</b>   Beta", 160), "Alpha Beta");
  assert.equal(rules.sanitizeDropDialogText("01234567890123456789012345", 22), "0123456789012345678...");

  const weapon = {
    type: "arme",
    system: {
      price: "30",
      damageDie: "d6",
      weaponType: "distance",
      magazineCapacity: 6,
      loadedAmmo: 4,
      note: "  <i>Silencieux</i>  "
    }
  };
  const details = rules.buildDroppedItemSpecificities(weapon, { quantity: 2 });
  assert.equal(details.includes("Type : Arme"), true);
  assert.equal(details.includes("Quantite : 2"), true);
  assert.equal(details.includes("Prix unitaire : 30"), true);
  assert.equal(details.includes("Degats : 1d6"), true);
  assert.equal(details.includes("Categorie : Distance"), true);
  assert.equal(details.includes("Chargeur : 4 / 6"), true);
  assert.equal(details.includes("Note : Silencieux"), true);

  const preview = rules.buildDropDecisionPreview({
    resolvedItems: [
      {
        droppedItem: { name: "Pistolet", ...weapon },
        quantity: 2,
        priceState: { ok: true, value: 30 }
      },
      {
        droppedItem: {
          name: "Kit",
          type: "soin",
          system: { price: "12", healDie: "d8" }
        },
        quantity: 1,
        priceState: { ok: true, value: 12 }
      }
    ],
    purchase: { totalCost: 72, hasInvalidPrice: false },
    targetName: "Alice"
  });
  assert.equal(preview?.targetName, "Alice");
  assert.equal(preview?.totalCost, 72);
  assert.equal(preview?.hasInvalidPrice, false);
  assert.equal(Array.isArray(preview?.specificities), true);
  assert.equal(preview.specificities.length > 0, true);

  const previewItems = await rules.resolveDropPreviewItems({
    entries: [{ id: "a", quantity: 2 }, { id: "b", quantity: 3 }, { id: "c" }, { id: "missing" }],
    targetActorId: "target-actor"
  });
  assert.equal(previewItems.length, 2);
  assert.equal(previewItems[0].droppedItem.id, "a");
  assert.equal(previewItems[0].quantity, 2);
  assert.deepEqual(previewItems[0].priceState, { ok: true, value: 30 });
  assert.equal(previewItems[1].droppedItem.id, "c");
  assert.equal(previewItems[1].quantity, 1);
  assert.deepEqual(previewItems[1].priceState, { ok: true, value: 12 });
}

run()
  .then(() => {
    console.log("drop-decision.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
