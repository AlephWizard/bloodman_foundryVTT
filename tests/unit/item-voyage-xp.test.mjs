import assert from "node:assert/strict";
import {
  VOYAGE_XP_COST_ITEM_TYPES,
  VOYAGE_XP_COST_PATH,
  VOYAGE_XP_SKIP_CREATE_OPTION,
  createItemVoyageXpRules
} from "../../src/rules/item-voyage-xp.mjs";

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : Number(fallback) || 0));
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

function createRules(events = {}) {
  return createItemVoyageXpRules({
    normalizeNonNegativeInteger,
    isVoyageXPCostItemType: type => VOYAGE_XP_COST_ITEM_TYPES.has(String(type || "").trim().toLowerCase()),
    getProperty,
    setProperty,
    translate: (key, data = null) => {
      if (key === "BLOODMAN.Notifications.NotEnoughVoyageXPForAptitude") {
        return `${data.aptitude}: ${data.available}/${data.required}`;
      }
      return key;
    },
    warn: (...args) => events.warnings?.push(args),
    notifyError: message => events.errors?.push(message)
  });
}

async function run() {
  const rules = createRules();
  assert.equal(VOYAGE_XP_COST_PATH, "system.xpVoyageCost");
  assert.equal(VOYAGE_XP_SKIP_CREATE_OPTION, "bloodmanSkipVoyageXPCost");

  const actorUpdates = [];
  const actor = {
    type: "personnage",
    system: { resources: { voyage: { current: 8, total: 10, max: 10 } } },
    update: async updateData => actorUpdates.push(updateData)
  };
  await rules.applyVoyageXPCostOnCreate(
    actor,
    { type: "aptitude", system: { xpVoyageCost: 3 } }
  );
  assert.deepEqual(actorUpdates[0], {
    "system.resources.voyage.current": 5,
    "system.resources.voyage.total": 10,
    "system.resources.voyage.max": 10
  });

  const legacyActorUpdates = [];
  await rules.applyVoyageXPCostOnCreate(
    {
      type: "personnage",
      system: { resources: { voyage: { current: 8, total: 0, max: 0 } } },
      update: async updateData => legacyActorUpdates.push(updateData)
    },
    { type: "pouvoir", system: { xpVoyageCost: 3 } }
  );
  assert.deepEqual(legacyActorUpdates[0], {
    "system.resources.voyage.current": 5,
    "system.resources.voyage.total": 8,
    "system.resources.voyage.max": 8
  });

  await rules.applyVoyageXPCostOnCreate(
    actor,
    { type: "aptitude", system: { xpVoyageCost: 3 } },
    { [VOYAGE_XP_SKIP_CREATE_OPTION]: true }
  );
  assert.equal(actorUpdates.length, 1);

  const sourceUpdates = [];
  const item = {
    type: "pouvoir",
    name: "Onde",
    actor: { id: "a1", name: "Hero", type: "personnage", system: { resources: { voyage: { current: 2 } } } },
    system: { xpVoyageCost: 0 },
    updateSource: updateData => sourceUpdates.push(updateData)
  };
  const events = { warnings: [], errors: [] };
  const blockingRules = createRules(events);
  const createResult = blockingRules.normalizeVoyageXpCostOnCreate(
    item,
    { system: { xpVoyageCost: "5.9" } }
  );
  assert.equal(createResult, false);
  assert.deepEqual(sourceUpdates[0], { [VOYAGE_XP_COST_PATH]: 5 });
  assert.equal(events.errors[0], "Onde: 2/5");
  assert.equal(events.warnings.length, 1);

  const updateData = { system: { xpVoyageCost: "4.2" } };
  const updateResult = rules.normalizeVoyageXpCostOnUpdate(
    { type: "aptitude", system: { xpVoyageCost: 1 } },
    updateData
  );
  assert.equal(updateResult, 4);
  assert.equal(getProperty(updateData, VOYAGE_XP_COST_PATH), 4);

  const ignoredUpdate = { system: { xpVoyageCost: "4.2" } };
  assert.equal(
    rules.normalizeVoyageXpCostOnUpdate({ type: "objet", system: { xpVoyageCost: 1 } }, ignoredUpdate),
    undefined
  );
  assert.equal(getProperty(ignoredUpdate, VOYAGE_XP_COST_PATH), "4.2");
}

run()
  .then(() => {
    console.log("item-voyage-xp.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
