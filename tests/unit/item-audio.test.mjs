import assert from "node:assert/strict";
import { createItemAudioRules } from "../../src/rules/item-audio.mjs";

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
  return createItemAudioRules({
    audioEnabledItemTypes: new Set(["arme", "pouvoir", "soin", "objet", "aptitude"]),
    audioFileExtensionPattern: /\.(mp3|ogg|wav)$/i,
    getProperty,
    setProperty,
    translate: key => {
      if (key === "TYPES.Item.arme") return "Arme";
      if (key === "BLOODMAN.Common.Name") return "Nom";
      return key;
    }
  });
}

async function run() {
  const rules = buildRules();

  assert.equal(rules.isAudioEnabledItemType("arme"), true);
  assert.equal(rules.isAudioEnabledItemType("ARME"), true);
  assert.equal(rules.isAudioEnabledItemType("ration"), false);

  assert.equal(rules.normalizeItemAudioFile("sounds/test.mp3"), "sounds/test.mp3");
  assert.equal(rules.normalizeItemAudioFile(" sounds/test.mp3?version=2 "), "sounds/test.mp3?version=2");
  assert.equal(rules.normalizeItemAudioFile("sounds/test.txt"), "");
  assert.equal(rules.normalizeItemAudioFile(""), "");

  assert.equal(rules.getItemAudioName({ type: "arme", name: "Pistolet" }), "Pistolet");
  assert.equal(rules.getItemAudioName({ type: "arme", name: "" }), "Arme");
  assert.equal(rules.getItemAudioName({ type: "", name: "" }), "Nom");

  assert.deepEqual(
    rules.normalizeItemAudioUpdate({ type: "ration", system: { audioFile: "a.mp3" } }, {}),
    { changed: false, invalid: false }
  );

  const noAudioUpdateData = { system: { label: "ignore" } };
  assert.deepEqual(
    rules.normalizeItemAudioUpdate({ type: "arme", system: { audioFile: "a.mp3" } }, noAudioUpdateData),
    { changed: false, invalid: false }
  );

  const validUpdateData = { system: { audioFile: "sounds/new.ogg" } };
  assert.deepEqual(
    rules.normalizeItemAudioUpdate({ type: "arme", system: { audioFile: "old.mp3" } }, validUpdateData),
    { changed: false, invalid: false }
  );
  assert.equal(getProperty(validUpdateData, "system.audioFile"), "sounds/new.ogg");

  const invalidUpdateData = { system: { audioFile: "sounds/invalid.txt" } };
  assert.deepEqual(
    rules.normalizeItemAudioUpdate({ type: "arme", system: { audioFile: "old.mp3" } }, invalidUpdateData),
    { changed: true, invalid: true }
  );
  assert.equal(getProperty(invalidUpdateData, "system.audioFile"), "");

  const sourceCalls = [];
  const sourceItem = {
    type: "arme",
    system: { audioFile: "sounds/fire.wav" },
    updateSource(updateData) {
      sourceCalls.push(updateData);
    }
  };
  assert.deepEqual(rules.normalizeItemAudioUpdate(sourceItem), { changed: false, invalid: false });
  assert.deepEqual(sourceCalls[0], { "system.audioFile": "sounds/fire.wav" });

  const invalidSourceCalls = [];
  const invalidSourceItem = {
    type: "arme",
    system: { audioFile: "sounds/fire.txt" },
    updateSource(updateData) {
      invalidSourceCalls.push(updateData);
    }
  };
  assert.deepEqual(rules.normalizeItemAudioUpdate(invalidSourceItem), { changed: true, invalid: true });
  assert.deepEqual(invalidSourceCalls[0], { "system.audioFile": "" });
}

run()
  .then(() => {
    console.log("item-audio.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
