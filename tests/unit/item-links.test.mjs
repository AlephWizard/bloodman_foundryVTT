import assert from "node:assert/strict";
import {
  ITEM_LINK_APPLY_MODE_GLOBAL,
  ITEM_LINK_APPLY_MODE_ON_USE,
  ITEM_LINK_TRIGGER_DAMAGE_ROLL,
  ITEM_LINK_TRIGGER_ITEM_USE,
  createItemLinkDeletionRules,
  createItemLinkRules,
  isUsageLinkedItem,
  resolveItemLinkData,
  shouldItemApplyGlobalBonuses
} from "../../src/rules/item-links.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function getUpdatedPathValue(object, path, fallback = undefined) {
  if (Object.prototype.hasOwnProperty.call(object || {}, path)) return object[path];
  const nested = getProperty(object, path);
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

function hasUpdatePath(object, path) {
  if (!object || !path) return false;
  if (Object.prototype.hasOwnProperty.call(object, path)) return true;
  const keys = String(path).split(".");
  let current = object;
  for (const key of keys) {
    if (current == null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) {
      return false;
    }
    current = current[key];
  }
  return true;
}

function toCheckboxBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
    if (["false", "0", "off", "no", ""].includes(normalized)) return false;
  }
  return Boolean(fallback);
}

async function run() {
  assert.deepEqual(
    resolveItemLinkData({ system: {} }),
    {
      parentItemId: "",
      applyMode: ITEM_LINK_APPLY_MODE_GLOBAL,
      active: true,
      triggers: [],
      equiperAvecEnabled: false,
      equiperAvec: [],
      containerCountsForCarry: true
    }
  );

  assert.deepEqual(
    resolveItemLinkData({
      system: {
        link: {
          parentItemId: "weapon-1",
          applyMode: ITEM_LINK_APPLY_MODE_ON_USE,
          active: "true",
          triggers: [ITEM_LINK_TRIGGER_DAMAGE_ROLL, "invalid"],
          containerEnabled: "true"
        }
      }
    }),
    {
      parentItemId: "weapon-1",
      applyMode: ITEM_LINK_APPLY_MODE_ON_USE,
      active: true,
      triggers: [ITEM_LINK_TRIGGER_DAMAGE_ROLL],
      equiperAvecEnabled: false,
      equiperAvec: [],
      containerCountsForCarry: true
    }
  );

  assert.equal(
    shouldItemApplyGlobalBonuses({
      system: {
        link: {
          parentItemId: "weapon-1",
          applyMode: ITEM_LINK_APPLY_MODE_ON_USE,
          active: true
        }
      }
    }),
    false
  );
  assert.equal(
    shouldItemApplyGlobalBonuses({
      system: {
        link: {
          parentItemId: "",
          applyMode: ITEM_LINK_APPLY_MODE_ON_USE,
          active: true
        }
      }
    }),
    false
  );
  assert.equal(
    shouldItemApplyGlobalBonuses({
      system: {
        link: {
          parentItemId: "",
          applyMode: ITEM_LINK_APPLY_MODE_GLOBAL,
          active: true
        }
      }
    }),
    true
  );

  const linkedItem = {
    system: {
      link: {
        parentItemId: "weapon-1",
        applyMode: ITEM_LINK_APPLY_MODE_ON_USE,
        active: true,
        triggers: [ITEM_LINK_TRIGGER_ITEM_USE, ITEM_LINK_TRIGGER_DAMAGE_ROLL]
      }
    }
  };
  assert.equal(
    isUsageLinkedItem(linkedItem, { parentItemId: "weapon-1", requiredTrigger: ITEM_LINK_TRIGGER_DAMAGE_ROLL }),
    true
  );
  assert.equal(
    isUsageLinkedItem(linkedItem, { parentItemId: "weapon-1", requiredTrigger: "heal-roll" }),
    false
  );

  const rules = createItemLinkRules({
    hasUpdatePath,
    getUpdatedPathValue,
    setProperty,
    toCheckboxBoolean
  });

  const updateData = {
    "system.link.parentItemId": "item-self",
    "system.link.applyMode": "a_l_usage",
    "system.link.active": "0",
    "system.link.triggers": [ITEM_LINK_TRIGGER_DAMAGE_ROLL, "bad"],
    "system.link.equiperAvecEnabled": "true",
    "system.link.equiperAvec": ["child-a", "item-self", "", "child-a", "child-b"],
    "system.link.containerCountsForCarry": "false"
  };
  const item = {
    id: "item-self",
    system: {
      link: {
        parentItemId: "",
        applyMode: ITEM_LINK_APPLY_MODE_GLOBAL,
        active: true,
        triggers: [],
        equiperAvecEnabled: false,
        equiperAvec: [],
        containerCountsForCarry: true
      }
    }
  };
  const normalized = rules.normalizeItemLinkUpdate(item, updateData, { includeSourceWhenMissing: false });
  assert.equal(normalized.link.parentItemId, "");
  assert.equal(normalized.link.applyMode, ITEM_LINK_APPLY_MODE_ON_USE);
  assert.equal(normalized.link.active, false);
  assert.deepEqual(normalized.link.triggers, [ITEM_LINK_TRIGGER_DAMAGE_ROLL]);
  assert.equal(normalized.link.equiperAvecEnabled, true);
  assert.deepEqual(normalized.link.equiperAvec, ["child-a", "child-b"]);
  assert.equal(normalized.link.containerCountsForCarry, false);
  assert.equal(getProperty(updateData, "system.link.parentItemId"), "");
  assert.equal(getProperty(updateData, "system.link.equiperAvecEnabled"), true);
  assert.deepEqual(getProperty(updateData, "system.link.equiperAvec"), ["child-a", "child-b"]);

  const linkedChildUpdate = {
    "system.link.parentItemId": "weapon-1",
    "system.link.applyMode": ITEM_LINK_APPLY_MODE_ON_USE,
    "system.link.active": true,
    "system.link.equiperAvecEnabled": true,
    "system.link.equiperAvec": ["child-x", "child-y"]
  };
  const linkedChildItem = {
    id: "item-child",
    system: {
      link: {
        parentItemId: "",
        applyMode: ITEM_LINK_APPLY_MODE_GLOBAL,
        active: true,
        triggers: [],
        equiperAvecEnabled: false,
        equiperAvec: [],
        containerCountsForCarry: true
      }
    }
  };
  const normalizedLinkedChild = rules.normalizeItemLinkUpdate(linkedChildItem, linkedChildUpdate, { includeSourceWhenMissing: false });
  assert.equal(normalizedLinkedChild.link.parentItemId, "weapon-1");
  assert.equal(normalizedLinkedChild.link.equiperAvecEnabled, false);
  assert.deepEqual(normalizedLinkedChild.link.equiperAvec, []);
  assert.equal(getProperty(linkedChildUpdate, "system.link.equiperAvecEnabled"), false);
  assert.deepEqual(getProperty(linkedChildUpdate, "system.link.equiperAvec"), []);

  const updates = [];
  const childA = {
    id: "child-a",
    system: { link: { parentItemId: "parent-a", equiperAvec: [] } }
  };
  const childB = {
    id: "child-b",
    system: { link: { parentItemId: "", equiperAvec: [] } }
  };
  const sibling = {
    id: "sibling",
    system: { link: { parentItemId: "", equiperAvec: ["parent-a", "child-a"] } }
  };
  const deletedParent = {
    id: "parent-a",
    system: { link: { parentItemId: "", equiperAvec: ["child-a", "child-b"] } }
  };
  const actorItems = [childA, childB, sibling];
  const actor = {
    isOwner: true,
    items: {
      get: id => actorItems.find(itemEntry => itemEntry.id === id) || null,
      [Symbol.iterator]: function* iterateItems() {
        yield* actorItems;
      }
    },
    updateEmbeddedDocuments: async (documentName, updateData) => {
      updates.push({ documentName, updateData });
    }
  };
  deletedParent.actor = actor;
  childA.actor = actor;
  childB.actor = actor;
  sibling.actor = actor;

  const deletionRules = createItemLinkDeletionRules({
    getCurrentUser: () => ({ isGM: false }),
    warn: message => {
      throw new Error(`Unexpected warning: ${message}`);
    }
  });
  const changed = await deletionRules.cleanupItemLinksAfterDeletion(deletedParent);
  assert.equal(changed, true);
  assert.equal(updates[0].documentName, "Item");
  assert.deepEqual(updates[0].updateData, [
    { _id: "child-a", "system.link.parentItemId": "" },
    { _id: "sibling", "system.link.equiperAvec": ["child-a"] }
  ]);

  const deniedUpdates = [];
  const deniedActor = {
    isOwner: false,
    items: new Map(),
    updateEmbeddedDocuments: async (_documentName, updateData) => deniedUpdates.push(updateData)
  };
  const deniedResult = await deletionRules.cleanupItemLinksAfterDeletion({
    id: "parent-a",
    actor: deniedActor,
    system: { link: { equiperAvec: [] } }
  });
  assert.equal(deniedResult, false);
  assert.equal(deniedUpdates.length, 0);
}

run()
  .then(() => {
    console.log("item-links.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
