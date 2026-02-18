import assert from "node:assert/strict";
import { createStatePresetRules } from "../../src/rules/state-presets.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
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

const PRESETS = [
  {
    id: "psychic-lvl-1",
    category: "psychic",
    name: "NIV 1 - STRESS",
    shortName: "STRESS",
    duration: "1 min",
    description: "Test",
    modifierAll: 0,
    modifierByKey: { PHY: 0, ESP: -10 }
  },
  {
    id: "body-wound",
    category: "body",
    name: "BLESSURE",
    shortName: "BLESSURE",
    duration: "",
    description: "",
    modifierAll: -5,
    modifierByKey: { PHY: -10, ESP: 0 }
  }
];
const PRESET_BY_ID = new Map(PRESETS.map(preset => [preset.id, preset]));
const PRESET_ORDER = PRESETS.map(preset => preset.id);
const CHARACTERISTICS = [{ key: "PHY" }, { key: "ESP" }];

function buildRules() {
  return createStatePresetRules({
    statePresets: PRESETS,
    statePresetById: PRESET_BY_ID,
    statePresetOrder: PRESET_ORDER,
    characteristics: CHARACTERISTICS,
    toFiniteNumber,
    setProperty,
    translate: (key, data = null) => {
      if (key === "BLOODMAN.Notifications.InvalidStateName") return `Etat invalide: ${data?.states || "?"}`;
      return key;
    },
    translateWithFallback: (key, fallback) => {
      if (key === "BLOODMAN.StateBar.NoModifier") return "Aucun modificateur";
      if (key === "BLOODMAN.StateBar.PsychicStates") return "Etats psychiques";
      if (key === "BLOODMAN.StateBar.BodyStates") return "Etats corporels";
      if (key === "BLOODMAN.StateBar.DurationLabel") return "Duree";
      if (key === "BLOODMAN.StateBar.DescriptionLabel") return "Description";
      return fallback;
    }
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(rules.normalizeStatePresetToken("  bléssure "), "BLESSURE");
  assert.deepEqual(rules.splitStatePresetLabel("NIV 1 ; blessure|foo"), ["NIV 1", "blessure", "foo"]);

  assert.equal(rules.resolveStatePresetIdFromToken("niv 1"), "psychic-lvl-1");
  assert.equal(rules.resolveStatePresetIdFromToken("la blessure grave"), "body-wound");
  assert.equal(rules.resolveStatePresetIdFromToken("unknown"), "");

  assert.equal(
    rules.buildStatePresetLabelFromIds(["body-wound", "psychic-lvl-1"]),
    "NIV 1 - STRESS ; BLESSURE"
  );

  const selection = rules.resolveStatePresetSelection("NIV 1 ; blessure ; X");
  assert.deepEqual(selection, {
    ids: ["psychic-lvl-1", "body-wound"],
    invalidTokens: ["X"],
    label: "NIV 1 - STRESS ; BLESSURE"
  });

  assert.deepEqual(rules.buildStatePresetModifierTotals(["psychic-lvl-1", "body-wound"]), {
    all: -5,
    PHY: -10,
    ESP: -10
  });

  const updateFromLabel = rules.buildStateModifierUpdateFromLabel("NIV 1 ; blessure");
  assert.equal(updateFromLabel.ok, true);
  assert.deepEqual(updateFromLabel.ids, ["psychic-lvl-1", "body-wound"]);
  assert.equal(updateFromLabel.label, "NIV 1 - STRESS ; BLESSURE");
  assert.deepEqual(updateFromLabel.totals, { all: -5, PHY: -10, ESP: -10 });

  const invalidUpdate = rules.buildStateModifierUpdateFromLabel("unknown");
  assert.equal(invalidUpdate.ok, false);
  assert.deepEqual(invalidUpdate.invalidTokens, ["unknown"]);

  const updateData = {};
  rules.applyStateModifierUpdateToData(updateData, "NIV 1 - STRESS", { all: -1, PHY: -2, ESP: -3 });
  assert.equal(updateData.system.modifiers.label, "NIV 1 - STRESS");
  assert.equal(updateData.system.modifiers.all, -1);
  assert.equal(updateData.system.modifiers.PHY, -2);
  assert.equal(updateData.system.modifiers.ESP, -3);

  assert.equal(
    rules.buildStatePresetModifierLabel(PRESETS[1]),
    "-5% ALL CARACS ; -10% PHY"
  );
  assert.equal(
    rules.buildStatePresetTooltip(PRESETS[0]),
    "NIV 1 - STRESS\nEtats psychiques\n-10% ESP\nDuree : 1 min\nDescription : Test"
  );

  const display = rules.buildStatePresetDisplayData("blessure");
  assert.deepEqual(display.ids, ["body-wound"]);
  assert.equal(display.psychic.length, 1);
  assert.equal(display.body.length, 1);
  assert.equal(display.body[0].selected, true);

  assert.equal(
    rules.buildInvalidStatePresetMessage(["alpha", "beta"]),
    "Etat invalide: alpha, beta"
  );
}

run()
  .then(() => {
    console.log("state-presets.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
