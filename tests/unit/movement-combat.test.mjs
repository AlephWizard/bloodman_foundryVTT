import assert from "node:assert/strict";
import { buildMovementCombatRules } from "../../src/rules/movement-combat.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

async function run() {
  const warnings = [];
  const sheetRequests = [];
  const updatedActors = [];
  const gameRef = {
    user: { isGM: false },
    combat: null
  };
  const canvasRef = {
    scene: { id: "scene-a" },
    grid: {
      size: 100,
      measurePath: () => ({ cost: 3 }),
      distance: 1
    }
  };

  const rules = buildMovementCombatRules({
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    getItemBonusTotals: () => ({ MOU: 2 }),
    getActorArchetypeBonus: () => 1,
    computeNormalizedMoveGauge: ({ max, hasStoredMax, storedValue, initializeWhenMissing }) => {
      return {
        max,
        value: initializeWhenMissing && !hasStoredMax ? max : Math.max(0, Math.min(storedValue, max)),
        hasStoredMax
      };
    },
    normalizeNonNegativeInteger: (value, fallback = 0) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : Number(fallback) || 0)),
    validateNumericEquality: (left, right) => Number(left) === Number(right),
    requestActorSheetUpdate: (_actor, payload) => {
      sheetRequests.push(payload);
      return false;
    },
    safeWarn: message => warnings.push(message),
    getProperty,
    getGame: () => gameRef,
    getCanvas: () => canvasRef
  });

  const actor = {
    isOwner: false,
    system: {
      characteristics: { MOU: { base: 12 } },
      modifiers: { all: 1, MOU: -1 },
      resources: { move: { value: 2, max: 3 } }
    },
    update: async data => updatedActors.push(data)
  };

  assert.equal(rules.getActorEffectiveMovementScore(actor), 15);
  assert.equal(rules.getActorMoveSlots(actor), 3);
  assert.deepEqual(
    rules.normalizeActorMoveGauge(actor, { initializeWhenMissing: true }),
    { max: 3, value: 2, hasStoredMax: true }
  );

  await rules.setActorMoveGauge(actor, 7, 4);
  assert.deepEqual(sheetRequests, [{ "system.resources.move.value": 4, "system.resources.move.max": 4 }]);
  assert.equal(updatedActors.length, 0);
  assert.deepEqual(warnings, ["Mise a jour impossible: aucun GM ou assistant actif."]);

  const ownerActor = {
    isOwner: true,
    system: { resources: { move: { value: 1, max: 1 } } },
    update: async data => updatedActors.push(data)
  };
  await rules.setActorMoveGauge(ownerActor, 5, 2);
  assert.deepEqual(updatedActors[0], { "system.resources.move.value": 2, "system.resources.move.max": 2 });

  const tokenDoc = {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    parent: { id: "scene-a", grid: { size: 100, distance: 1 } },
    scene: { id: "scene-a", grid: { size: 100, distance: 1 } }
  };
  assert.equal(rules.getTokenMoveDistanceInCells(tokenDoc, { x: 200, y: 0 }), 3);
  canvasRef.grid.measurePath = () => {
    throw new Error("no measure");
  };
  assert.equal(rules.getTokenMoveDistanceInCells(tokenDoc, { x: 200, y: 100 }), 2);
  assert.equal(rules.getTokenMoveDistanceInCells(tokenDoc, { x: 0, y: 0 }), 0);
  assert.ok(Number.isNaN(rules.getTokenMoveDistanceInCells({ x: "x", y: 0 }, { x: 1 })));

  gameRef.combat = { active: true, round: 2, id: "c1", combatants: [{ tokenId: "t1" }] };
  assert.equal(rules.getStartedActiveCombat()?.id, "c1");
  assert.equal(rules.getCombatantForToken(gameRef.combat, { id: "t1" })?.tokenId, "t1");
  assert.equal(rules.getCombatantForToken(gameRef.combat, { id: "missing" }), null);
}

run()
  .then(() => {
    console.log("movement-combat.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
