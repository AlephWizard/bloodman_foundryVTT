import assert from "node:assert/strict";
import { createItemRerollFlowRules } from "../../src/rules/item-reroll-flow.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  const rules = createItemRerollFlowRules({
    toFiniteNumber,
    normalizeRerollTargets: value => (Array.isArray(value) ? value : []),
    buildFallbackRerollTargets: (selected, requestedTotal) => selected.map(target => ({ target, requestedTotal })),
    isDamageRerollItemType: type => ["arme", "pouvoir", "aptitude", "soin"].includes(String(type || "").toLowerCase())
  });

  const context = {};
  const normalizedContext = rules.normalizeItemRerollContext(context, "arme");
  assert.equal(normalizedContext, context);
  assert.equal(context.kind, "item-damage");
  assert.equal(context.itemType, "arme");

  assert.equal(rules.isItemRerollContextValid({ kind: "item-damage", itemType: "arme" }), true);
  assert.equal(rules.isItemRerollContextValid({ kind: "item-damage", itemType: "objet" }), false);
  assert.equal(rules.isItemRerollContextValid({ kind: "other", itemType: "arme" }), false);

  assert.equal(rules.shouldBlockByRerollWindow("personnage", false), false);
  assert.equal(rules.shouldBlockByRerollWindow("personnage-non-joueur", false), true);
  assert.equal(rules.shouldBlockByRerollWindow("personnage-non-joueur", true), false);

  assert.deepEqual(
    rules.resolveItemRerollTargets({
      contextTargets: [{ id: 1 }],
      selectedTargets: [{ id: "unused" }],
      requestedTotalDamage: 20
    }),
    { targets: [{ id: 1 }], fallbackUsed: false }
  );

  assert.deepEqual(
    rules.resolveItemRerollTargets({
      contextTargets: [],
      selectedTargets: [{ id: "a" }, { id: "b" }],
      requestedTotalDamage: 17
    }),
    {
      targets: [
        { target: { id: "a" }, requestedTotal: 17 },
        { target: { id: "b" }, requestedTotal: 17 }
      ],
      fallbackUsed: true
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollTargets({
      contextTargets: [],
      selectedTargets: [],
      requestedTotalDamage: 17
    }),
    { targets: [], fallbackUsed: false }
  );

  const weaponItem = { id: "weapon-1", type: "arme", name: "Pistolet" };
  assert.deepEqual(
    rules.resolveItemRerollSource({
      itemId: "weapon-1",
      actorItems: new Map([["weapon-1", weaponItem]])
    }),
    {
      itemId: "weapon-1",
      item: weaponItem,
      itemType: "arme",
      itemName: "Pistolet"
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollSource({
      itemId: "__simple-attack__",
      actorItems: new Map([["weapon-1", weaponItem]]),
      simpleAttackItemId: "__simple-attack__",
      simpleAttackName: "Attaque simple"
    }),
    {
      itemId: "__simple-attack__",
      item: null,
      itemType: "arme",
      itemName: "Attaque simple"
    }
  );

  assert.equal(
    rules.resolveItemRerollSource({
      itemId: "missing-item",
      actorItems: new Map()
    }),
    null
  );

  assert.equal(rules.resolveItemRerollActorMode("personnage"), "player");
  assert.equal(rules.resolveItemRerollActorMode("personnage-non-joueur"), "npc");
  assert.equal(rules.resolveItemRerollActorMode("other"), "");

  assert.deepEqual(
    rules.resolveItemRerollResourcePlan({
      actorType: "personnage",
      currentPP: 1,
      ppCost: 2
    }),
    {
      mode: "player",
      allowed: false,
      reason: "not-enough-pp",
      currentPP: 1,
      nextPP: 0,
      cost: 2
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollResourcePlan({
      actorType: "personnage",
      currentPP: 8,
      ppCost: 2
    }),
    {
      mode: "player",
      allowed: true,
      reason: "",
      currentPP: 8,
      nextPP: 6,
      cost: 2
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollResourcePlan({
      actorType: "personnage-non-joueur",
      isGM: false,
      currentChaos: 9,
      npcChaosCost: 3
    }),
    { mode: "", allowed: false, reason: "gm-required" }
  );

  assert.deepEqual(
    rules.resolveItemRerollResourcePlan({
      actorType: "personnage-non-joueur",
      isGM: true,
      currentChaos: 1,
      npcChaosCost: 3
    }),
    {
      mode: "npc",
      allowed: false,
      reason: "not-enough-chaos",
      currentChaos: 1,
      nextChaos: 0,
      cost: 3
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollResourcePlan({
      actorType: "personnage-non-joueur",
      isGM: true,
      currentChaos: 6,
      npcChaosCost: 3
    }),
    {
      mode: "npc",
      allowed: true,
      reason: "",
      currentChaos: 6,
      nextChaos: 3,
      cost: 3
    }
  );
}

run()
  .then(() => {
    console.log("item-reroll-flow.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
