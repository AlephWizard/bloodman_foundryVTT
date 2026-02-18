function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

export function buildMovementCombatRules({
  toFiniteNumber,
  getItemBonusTotals,
  getActorArchetypeBonus,
  computeNormalizedMoveGauge,
  normalizeNonNegativeInteger,
  validateNumericEquality,
  requestActorSheetUpdate,
  safeWarn,
  getProperty,
  getGame,
  getCanvas
} = {}) {
  const normalizeNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const readProperty = typeof getProperty === "function" ? getProperty : defaultGetProperty;
  const resolveGame = typeof getGame === "function" ? getGame : () => globalThis.game;
  const resolveCanvas = typeof getCanvas === "function" ? getCanvas : () => globalThis.canvas;

  function getActorEffectiveMovementScore(actor, { itemBonuses = null } = {}) {
    if (!actor) return 0;
    const bonuses = itemBonuses || (typeof getItemBonusTotals === "function" ? getItemBonusTotals(actor) : {});
    const base = normalizeNumber(actor.system?.characteristics?.MOU?.base, 0);
    const globalMod = normalizeNumber(actor.system?.modifiers?.all, 0);
    const keyMod = normalizeNumber(actor.system?.modifiers?.MOU, 0);
    const archetypeBonus = typeof getActorArchetypeBonus === "function"
      ? getActorArchetypeBonus(actor, "MOU")
      : 0;
    return base + globalMod + keyMod + normalizeNumber(bonuses?.MOU, 0) + archetypeBonus;
  }

  function getActorMoveSlots(actor, options = {}) {
    const effective = getActorEffectiveMovementScore(actor, options);
    return Math.max(0, Math.round(effective / 5));
  }

  function normalizeActorMoveGauge(actor, { itemBonuses = null, initializeWhenMissing = false } = {}) {
    const max = getActorMoveSlots(actor, { itemBonuses });
    const hasStoredMax = readProperty(actor, "system.resources.move.max") != null;
    const storedValue = Number(readProperty(actor, "system.resources.move.value"));
    if (typeof computeNormalizedMoveGauge === "function") {
      return computeNormalizedMoveGauge({
        max,
        hasStoredMax,
        storedValue,
        initializeWhenMissing
      });
    }
    const normalizedValue = Math.max(0, Math.min(normalizeNumber(storedValue, max), max));
    return { max, value: normalizedValue, hasStoredMax };
  }

  async function setActorMoveGauge(actor, nextValue, maxValue) {
    if (!actor) return;
    const normalizeInteger = typeof normalizeNonNegativeInteger === "function"
      ? normalizeNonNegativeInteger
      : (value, fallback = 0) => Math.max(0, Math.floor(normalizeNumber(value, fallback)));
    const isSameNumber = typeof validateNumericEquality === "function"
      ? validateNumericEquality
      : (left, right) => Number(left) === Number(right);

    const max = normalizeInteger(maxValue, 0);
    const value = normalizeInteger(Math.max(0, Math.min(normalizeNumber(nextValue, max), max)), max);
    const currentValue = Number(readProperty(actor, "system.resources.move.value"));
    const currentMax = Number(readProperty(actor, "system.resources.move.max"));
    const hasCurrentMax = readProperty(actor, "system.resources.move.max") != null;
    if (isSameNumber(currentValue, value) && hasCurrentMax && isSameNumber(currentMax, max)) return;

    const updateData = {
      "system.resources.move.value": value,
      "system.resources.move.max": max
    };
    if (actor.isOwner || resolveGame()?.user?.isGM) {
      await actor.update(updateData);
      return;
    }
    const sent = typeof requestActorSheetUpdate === "function"
      ? requestActorSheetUpdate(actor, updateData)
      : false;
    if (!sent && typeof safeWarn === "function") {
      safeWarn("Mise a jour impossible: aucun GM ou assistant actif.");
    }
  }

  function getTokenMoveDistanceInCells(tokenDoc, changes) {
    if (!tokenDoc || !changes) return Number.NaN;
    const hasX = readProperty(changes, "x") != null;
    const hasY = readProperty(changes, "y") != null;
    if (!hasX && !hasY) return 0;

    const currentX = Number(tokenDoc.x);
    const currentY = Number(tokenDoc.y);
    if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return Number.NaN;

    const nextRawX = readProperty(changes, "x");
    const nextRawY = readProperty(changes, "y");
    const nextX = nextRawX == null ? currentX : Number(nextRawX);
    const nextY = nextRawY == null ? currentY : Number(nextRawY);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return Number.NaN;
    const isSameNumber = typeof validateNumericEquality === "function"
      ? validateNumericEquality
      : (left, right) => Number(left) === Number(right);
    if (isSameNumber(currentX, nextX) && isSameNumber(currentY, nextY)) return 0;

    const canvas = resolveCanvas();
    const scene = tokenDoc.parent || tokenDoc.scene || canvas?.scene || null;
    const gridSize = normalizeNumber(scene?.grid?.size, normalizeNumber(canvas?.grid?.size, 0));
    if (!(gridSize > 0)) return Number.NaN;

    const tokenWidth = Math.max(1, normalizeNumber(tokenDoc.width, 1));
    const tokenHeight = Math.max(1, normalizeNumber(tokenDoc.height, 1));
    const offsetX = (tokenWidth * gridSize) / 2;
    const offsetY = (tokenHeight * gridSize) / 2;
    const origin = { x: currentX + offsetX, y: currentY + offsetY };
    const destination = { x: nextX + offsetX, y: nextY + offsetY };

    const sceneId = String(scene?.id || "");
    const activeSceneId = String(canvas?.scene?.id || "");
    const canMeasureOnCanvas = sceneId && activeSceneId && sceneId === activeSceneId;
    const gridDistance = normalizeNumber(scene?.grid?.distance, 1);
    if (canMeasureOnCanvas && gridDistance > 0 && typeof canvas?.grid?.measurePath === "function") {
      try {
        const measurement = canvas.grid.measurePath([origin, destination]);
        const measuredCost = Number(measurement?.cost);
        if (Number.isFinite(measuredCost)) return Math.max(0, measuredCost);
        const measuredDistance = Number(measurement?.distance);
        if (Number.isFinite(measuredDistance)) return Math.max(0, measuredDistance / gridDistance);
      } catch (_error) {
        // Fallback to deterministic grid-cell delta below.
      }
    }

    const dxCells = Math.abs(destination.x - origin.x) / gridSize;
    const dyCells = Math.abs(destination.y - origin.y) / gridSize;
    return Math.max(dxCells, dyCells);
  }

  function getStartedActiveCombat() {
    const combat = resolveGame()?.combat || null;
    if (!combat?.active) return null;
    const round = Number(combat?.round ?? 0);
    return round > 0 ? combat : null;
  }

  function getCombatantForToken(combat, tokenDoc) {
    if (!combat || !tokenDoc) return null;
    const tokenId = String(tokenDoc.id || tokenDoc._id || "");
    if (!tokenId) return null;
    return combat.combatants?.find(combatant => String(combatant?.tokenId || "") === tokenId) || null;
  }

  return {
    getActorEffectiveMovementScore,
    getActorMoveSlots,
    normalizeActorMoveGauge,
    setActorMoveGauge,
    getTokenMoveDistanceInCells,
    getStartedActiveCombat,
    getCombatantForToken
  };
}
