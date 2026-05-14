import assert from "node:assert/strict";

import { registerSystemDocumentSheets } from "../../src/sheets/register-sheets.mjs";

function createCollectionRecorder() {
  const calls = [];
  return {
    calls,
    registerSheet: (...args) => calls.push(["registerSheet", ...args]),
    unregisterSheet: (...args) => calls.push(["unregisterSheet", ...args])
  };
}

function run() {
  const actorSheetClass = class ActorSheet {};
  const npcSheetClass = class NpcSheet {};
  const itemSheetClass = class ItemSheet {};
  const baseActorSheet = class BaseActorSheet {};
  const baseItemSheet = class BaseItemSheet {};
  const actorsCollection = createCollectionRecorder();
  const itemsCollection = createCollectionRecorder();
  const errors = [];
  const logger = { error: message => errors.push(message) };

  const registered = registerSystemDocumentSheets({
    actorSheetClass,
    npcSheetClass,
    itemSheetClass,
    actorsCollection,
    itemsCollection,
    baseActorSheet,
    baseItemSheet,
    logger
  });

  assert.equal(registered, true);
  assert.equal(errors.length, 0);
  assert.equal(actorsCollection.calls.length, 3);
  assert.equal(itemsCollection.calls.length, 2);
  assert.deepEqual(actorsCollection.calls[0], ["unregisterSheet", "core", baseActorSheet]);
  assert.equal(actorsCollection.calls[1][0], "registerSheet");
  assert.equal(actorsCollection.calls[1][1], "bloodman");
  assert.equal(actorsCollection.calls[1][2], actorSheetClass);
  assert.deepEqual(actorsCollection.calls[1][3]?.types, ["personnage"]);
  assert.equal(actorsCollection.calls[2][2], npcSheetClass);
  assert.deepEqual(actorsCollection.calls[2][3]?.types, ["personnage-non-joueur"]);
  assert.deepEqual(itemsCollection.calls[0], ["unregisterSheet", "core", baseItemSheet]);
  assert.equal(itemsCollection.calls[1][2], itemSheetClass);
  assert.deepEqual(
    itemsCollection.calls[1][3]?.types,
    ["arme", "objet", "ration", "soin", "protection", "aptitude", "pouvoir"]
  );

  const missingClasses = registerSystemDocumentSheets({
    actorSheetClass,
    npcSheetClass,
    actorsCollection,
    itemsCollection,
    logger
  });
  assert.equal(missingClasses, false);
  assert.equal(errors.at(-1), "sheet registration skipped (missing sheet classes)");

  const missingActorsCollection = registerSystemDocumentSheets({
    actorSheetClass,
    npcSheetClass,
    itemSheetClass,
    itemsCollection,
    logger
  });
  assert.equal(missingActorsCollection, false);
  assert.equal(errors.at(-1), "actor sheet registration skipped (Actors collection unavailable)");
}

run();
console.log("sheet-registration.test.mjs: OK");
