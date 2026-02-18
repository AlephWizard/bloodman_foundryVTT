export function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function normalizeCharacteristicKey(value, characteristicKeys) {
  const key = String(value || "").trim().toUpperCase();
  return characteristicKeys?.has(key) ? key : "";
}

export function normalizeArchetypeBonusValue(value, fallback = 0) {
  if (value == null || value === "") return Math.trunc(toFiniteNumber(fallback, 0));
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.trunc(numeric);
}

export function computeArchetypeCharacteristicBonus({
  profile,
  characteristicKey,
  characteristicKeys
} = {}) {
  const key = normalizeCharacteristicKey(characteristicKey, characteristicKeys);
  if (!key) return 0;
  const selectedKey = normalizeCharacteristicKey(profile?.archetypeBonusCharacteristic, characteristicKeys);
  if (!selectedKey || selectedKey !== key) return 0;
  const value = normalizeArchetypeBonusValue(profile?.archetypeBonusValue, 0);
  return Number.isFinite(value) ? value : 0;
}

export function computeDerivedPvMax({
  actorType,
  npcRole,
  phyEffective,
  playerCount = 1
} = {}) {
  const roundedByFive = Math.round(Number(phyEffective) / 5);
  if (actorType !== "personnage-non-joueur") return roundedByFive;
  const role = String(npcRole || "");
  if (role === "sbire") return Math.round(Number(phyEffective) / 10);
  if (role === "sbire-fort") return roundedByFive;
  if (role === "boss-seul") return roundedByFive * toFiniteNumber(playerCount, 0);
  return roundedByFive;
}

export function computeItemCharacteristicBonusTotals({
  items,
  characteristics,
  characteristicBonusItemTypes,
  isBonusEnabled
} = {}) {
  const totals = {};
  for (const characteristic of characteristics || []) {
    const key = String(characteristic?.key || "").trim();
    if (key) totals[key] = 0;
  }

  if (!items) return totals;
  const bonusTypes = characteristicBonusItemTypes instanceof Set
    ? characteristicBonusItemTypes
    : new Set(characteristicBonusItemTypes || []);
  const isEnabled = typeof isBonusEnabled === "function"
    ? isBonusEnabled
    : value => Boolean(value);

  for (const item of items) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (!bonusTypes.has(type)) continue;
    if (!isEnabled(item?.system?.characteristicBonusEnabled, item)) continue;

    for (const characteristic of characteristics || []) {
      const key = String(characteristic?.key || "").trim();
      if (!key) continue;
      const value = Number(item?.system?.characteristicBonuses?.[key]);
      if (Number.isFinite(value)) totals[key] += value;
    }
  }

  return totals;
}

export function computeNormalizedMoveGauge({
  max,
  hasStoredMax,
  storedValue,
  initializeWhenMissing = false
} = {}) {
  const normalizedMax = Math.max(0, Math.floor(toFiniteNumber(max, 0)));
  const numericStoredValue = Number(storedValue);
  const hasPositiveStoredValue = Number.isFinite(numericStoredValue) && numericStoredValue > 0;

  let value = numericStoredValue;
  if (!hasStoredMax && initializeWhenMissing && !hasPositiveStoredValue) value = normalizedMax;
  else if (!Number.isFinite(value)) value = normalizedMax;
  value = Math.max(0, Math.min(toFiniteNumber(value, normalizedMax), normalizedMax));
  value = Math.max(0, Math.floor(toFiniteNumber(value, normalizedMax)));

  return {
    max: normalizedMax,
    value,
    hasStoredMax: Boolean(hasStoredMax)
  };
}

export function computeItemResourceBonusTotals({
  items,
  resourceBonusItemTypes
} = {}) {
  const totals = { pv: 0, pp: 0 };
  if (!items) return totals;
  const supportedTypes = resourceBonusItemTypes instanceof Set
    ? resourceBonusItemTypes
    : new Set(resourceBonusItemTypes || []);

  for (const item of items) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (!supportedTypes.has(type)) continue;
    if (!item?.system?.rawBonusEnabled) continue;

    const pvBonus = Number(item?.system?.rawBonuses?.pv);
    const ppBonus = Number(item?.system?.rawBonuses?.pp);
    if (Number.isFinite(pvBonus)) totals.pv += pvBonus;
    if (Number.isFinite(ppBonus)) totals.pp += ppBonus;
  }
  return totals;
}

export function computeItemResourceBonusUpdateData({
  totals,
  currentPv,
  currentPp,
  currentPvMax,
  currentPpMax,
  storedPv,
  storedPp
} = {}) {
  const normalizedTotals = {
    pv: toFiniteNumber(totals?.pv, 0),
    pp: toFiniteNumber(totals?.pp, 0)
  };
  const numericCurrentPv = toFiniteNumber(currentPv, 0);
  const numericCurrentPp = toFiniteNumber(currentPp, 0);
  const numericCurrentPvMax = toFiniteNumber(currentPvMax, 0);
  const numericCurrentPpMax = toFiniteNumber(currentPpMax, 0);
  const numericStoredPv = toFiniteNumber(storedPv, 0);
  const numericStoredPp = toFiniteNumber(storedPp, 0);
  const deltaPv = normalizedTotals.pv - numericStoredPv;
  const deltaPp = normalizedTotals.pp - numericStoredPp;

  const updates = {};
  const nextPvMax = numericCurrentPvMax + deltaPv;
  const nextPpMax = numericCurrentPpMax + deltaPp;
  if (deltaPv !== 0) {
    updates["system.resources.pv.max"] = Math.max(0, nextPvMax);
    updates["system.resources.pv.current"] = Math.min(numericCurrentPv, Math.max(0, nextPvMax));
  }
  if (deltaPp !== 0) {
    updates["system.resources.pp.max"] = Math.max(0, nextPpMax);
    updates["system.resources.pp.current"] = Math.min(numericCurrentPp, Math.max(0, nextPpMax));
  }
  if (numericStoredPv !== normalizedTotals.pv) updates["system.resources.pv.itemBonus"] = normalizedTotals.pv;
  if (numericStoredPp !== normalizedTotals.pp) updates["system.resources.pp.itemBonus"] = normalizedTotals.pp;
  return updates;
}

export function computeResourceCharacteristicEffectiveScores({
  phyBase,
  espBase,
  phyItemBonus,
  espItemBonus,
  archetypeBonusCharacteristic,
  archetypeBonusValue
} = {}) {
  const selectedKey = String(archetypeBonusCharacteristic || "").trim().toUpperCase();
  const archetypeValue = Number(archetypeBonusValue);
  const numericArchetypeValue = Number.isFinite(archetypeValue) ? archetypeValue : 0;
  const phyArchetypeBonus = selectedKey === "PHY" ? numericArchetypeValue : 0;
  const espArchetypeBonus = selectedKey === "ESP" ? numericArchetypeValue : 0;

  const phyEffective = toFiniteNumber(phyBase, 0)
    + toFiniteNumber(phyItemBonus, 0)
    + phyArchetypeBonus;
  const espEffective = toFiniteNumber(espBase, 0)
    + toFiniteNumber(espItemBonus, 0)
    + espArchetypeBonus;

  return {
    phyEffective,
    espEffective
  };
}

export function computeDerivedResourceSyncUpdateData({
  derivedPvMax,
  espEffective,
  storedPvBonus,
  storedPpBonus,
  currentPvMax,
  currentPpMax,
  currentPv,
  currentPp,
  clampMaxToZero = true
} = {}) {
  const derivedPpMax = Math.round(toFiniteNumber(espEffective, 0) / 5);
  const rawPvMax = toFiniteNumber(derivedPvMax, 0) + toFiniteNumber(storedPvBonus, 0);
  const rawPpMax = derivedPpMax + toFiniteNumber(storedPpBonus, 0);
  const nextPvMax = clampMaxToZero ? Math.max(0, rawPvMax) : rawPvMax;
  const nextPpMax = clampMaxToZero ? Math.max(0, rawPpMax) : rawPpMax;

  const numericCurrentPvMax = toFiniteNumber(currentPvMax, nextPvMax);
  const numericCurrentPpMax = toFiniteNumber(currentPpMax, nextPpMax);
  const numericCurrentPv = toFiniteNumber(currentPv, 0);
  const numericCurrentPp = toFiniteNumber(currentPp, 0);

  const updates = {};
  if (numericCurrentPvMax !== nextPvMax) updates["system.resources.pv.max"] = nextPvMax;
  if (numericCurrentPpMax !== nextPpMax) updates["system.resources.pp.max"] = nextPpMax;
  if (numericCurrentPv > nextPvMax) updates["system.resources.pv.current"] = nextPvMax;
  if (numericCurrentPp > nextPpMax) updates["system.resources.pp.current"] = nextPpMax;

  return {
    nextPvMax,
    nextPpMax,
    derivedPpMax,
    updates
  };
}

export function computeUpdateActorDerivedResourceUpdateData({
  derivedPvMax,
  espEffective,
  storedPvBonus,
  storedPpBonus,
  currentPvMax,
  currentPpMax,
  currentPv,
  currentPp,
  pvMaxChange = false,
  ppMaxChange = false
} = {}) {
  const derivedPpMax = Math.round(toFiniteNumber(espEffective, 0) / 5);
  const derivedPvTotal = toFiniteNumber(derivedPvMax, 0) + toFiniteNumber(storedPvBonus, 0);
  const derivedPpTotal = derivedPpMax + toFiniteNumber(storedPpBonus, 0);
  const pvMax = toFiniteNumber(currentPvMax, derivedPvTotal);
  const ppMax = toFiniteNumber(currentPpMax, derivedPpTotal);
  const pvCurrent = toFiniteNumber(currentPv, 0);
  const ppCurrent = toFiniteNumber(currentPp, 0);
  const allowedPvMax = Math.max(0, pvMax);
  const allowedPpMax = Math.max(0, ppMax);

  const updates = {};
  if (!pvMaxChange && derivedPvTotal !== pvMax) updates["system.resources.pv.max"] = derivedPvTotal;
  if (!ppMaxChange && derivedPpTotal !== ppMax) updates["system.resources.pp.max"] = derivedPpTotal;
  if (pvCurrent > allowedPvMax) updates["system.resources.pv.current"] = allowedPvMax;
  if (ppCurrent > allowedPpMax) updates["system.resources.pp.current"] = allowedPpMax;

  return {
    derivedPvTotal,
    derivedPpTotal,
    updates
  };
}
