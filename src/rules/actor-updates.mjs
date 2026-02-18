function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

const VOYAGE_ROOT_PATH = "system.resources.voyage";
const VOYAGE_CURRENT_PATH = "system.resources.voyage.current";
const VOYAGE_TOTAL_PATH = "system.resources.voyage.total";
const VOYAGE_MAX_PATH = "system.resources.voyage.max";
const VOYAGE_REMOVE_PATH = "system.resources.-=voyage";
const VOYAGE_STRIP_PATHS = [
  VOYAGE_ROOT_PATH,
  VOYAGE_CURRENT_PATH,
  VOYAGE_TOTAL_PATH,
  VOYAGE_MAX_PATH
];
export const VOYAGE_RESOURCE_PATHS = Object.freeze({
  root: VOYAGE_ROOT_PATH,
  current: VOYAGE_CURRENT_PATH,
  total: VOYAGE_TOTAL_PATH,
  max: VOYAGE_MAX_PATH,
  remove: VOYAGE_REMOVE_PATH
});

export function createUpdateDataAccessors({
  updateData = {},
  getProperty,
  toFiniteNumber
} = {}) {
  const sourceUpdateData = updateData && typeof updateData === "object" ? updateData : {};
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : (object, path) => object?.[path];
  const normalizeNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };

  const hasUpdatePath = path => (
    Object.prototype.hasOwnProperty.call(sourceUpdateData, path)
    || readProperty(sourceUpdateData, path) !== undefined
  );

  const getUpdatedRawValue = (path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(sourceUpdateData, path)) {
      return sourceUpdateData[path];
    }
    const value = readProperty(sourceUpdateData, path);
    return value == null ? fallback : value;
  };

  const getUpdatedNumber = (path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(sourceUpdateData, path)) {
      return normalizeNumber(sourceUpdateData[path], fallback);
    }
    const value = readProperty(sourceUpdateData, path);
    if (value == null) return normalizeNumber(fallback, 0);
    return normalizeNumber(value, fallback);
  };

  return {
    hasUpdatePath,
    getUpdatedRawValue,
    getUpdatedNumber
  };
}

export function planActorUpdateRestrictionByRole({
  updaterRole,
  allowCharacteristicBase = false,
  allowVitalResourceUpdate = false,
  allowAmmoUpdate = false,
  isBasicPlayerRole,
  isAssistantOrHigherRole
} = {}) {
  const basicPlayer = typeof isBasicPlayerRole === "function"
    ? Boolean(isBasicPlayerRole(updaterRole))
    : false;
  const assistantOrHigher = typeof isAssistantOrHigherRole === "function"
    ? Boolean(isAssistantOrHigherRole(updaterRole))
    : false;

  return {
    stripCharacteristicBase: basicPlayer && !allowCharacteristicBase,
    stripVitalResources: basicPlayer && !allowVitalResourceUpdate,
    stripStateModifiers: basicPlayer,
    stripActorTokenImages: !assistantOrHigher,
    stripAmmoUpdates: !assistantOrHigher && !allowAmmoUpdate
  };
}

export function planPreUpdateActorImagePropagation({
  rawNextActorImage,
  updaterIsAssistantOrHigher = false,
  actorImage = "",
  actorPrototypeImage = ""
} = {}) {
  if (rawNextActorImage == null) {
    return {
      kind: "skip",
      trackPreviousImages: false,
      applyPrototypeAndTokenImages: false
    };
  }

  const nextActorImage = String(rawNextActorImage || "").trim() || "icons/svg/mystery-man.svg";
  return {
    kind: updaterIsAssistantOrHigher ? "apply" : "track",
    trackPreviousImages: true,
    previousActorImage: String(actorImage || "").trim(),
    previousPrototypeImage: String(actorPrototypeImage || "").trim(),
    applyPrototypeAndTokenImages: Boolean(updaterIsAssistantOrHigher),
    nextActorImage
  };
}

export function normalizeVitalPathRawValue(rawValue, fallback = 0) {
  if (rawValue == null) return normalizeNonNegativeInteger(fallback, 0);
  if (typeof rawValue === "string" && !rawValue.trim()) {
    return normalizeNonNegativeInteger(fallback, 0);
  }
  return normalizeNonNegativeInteger(rawValue, fallback);
}

export function clampVitalCurrentFromRawValue(rawValue, fallback = 0, allowedMax = 0) {
  const requested = normalizeVitalPathRawValue(rawValue, fallback);
  const max = normalizeNonNegativeInteger(allowedMax, 0);
  return Math.min(requested, max);
}

export function normalizeVoyageResourceValues({
  actorVoyageCurrent = 0,
  actorVoyageTotal = 0,
  requestedCurrent,
  requestedTotal
} = {}) {
  const baseCurrent = normalizeNonNegativeInteger(actorVoyageCurrent, 0);
  const baseTotal = normalizeNonNegativeInteger(actorVoyageTotal, 0);
  const total = normalizeNonNegativeInteger(
    requestedTotal == null ? baseTotal : requestedTotal,
    baseTotal
  );
  const current = Math.min(
    normalizeNonNegativeInteger(
      requestedCurrent == null ? baseCurrent : requestedCurrent,
      baseCurrent
    ),
    total
  );
  return {
    normalizedCurrent: current,
    normalizedTotal: total
  };
}

export function planPreUpdateVoyageResourceChange({
  actorType = "",
  hasVoyageRootUpdate = false,
  hasVoyageCurrentUpdate = false,
  hasVoyageTotalUpdate = false,
  hasVoyageMaxUpdate = false,
  actorVoyageCurrent = 0,
  actorVoyageTotal = 0,
  requestedCurrent,
  requestedTotal,
  normalizeVoyageValues
} = {}) {
  const hasVoyageValueUpdate = Boolean(
    hasVoyageCurrentUpdate || hasVoyageTotalUpdate || hasVoyageMaxUpdate
  );
  if (actorType === "personnage") {
    if (!hasVoyageValueUpdate) return { kind: "skip" };
    const normalize = typeof normalizeVoyageValues === "function"
      ? normalizeVoyageValues
      : normalizeVoyageResourceValues;
    const { normalizedCurrent, normalizedTotal } = normalize({
      actorVoyageCurrent,
      actorVoyageTotal,
      requestedCurrent,
      requestedTotal
    });
    return {
      kind: "apply",
      normalizedCurrent,
      normalizedTotal
    };
  }

  const hasVoyagePayload = Boolean(hasVoyageRootUpdate || hasVoyageValueUpdate);
  if (!hasVoyagePayload) return { kind: "skip" };
  return {
    kind: "remove",
    pathsToStrip: VOYAGE_STRIP_PATHS,
    removePath: VOYAGE_REMOVE_PATH
  };
}

export function planPreUpdateVoyageResourcePatch({
  actorType = "",
  hasUpdatePath,
  getUpdatedNumber,
  actorVoyageCurrent = 0,
  actorVoyageTotal = 0
} = {}) {
  const hasPath = typeof hasUpdatePath === "function"
    ? hasUpdatePath
    : () => false;
  const readUpdatedNumber = typeof getUpdatedNumber === "function"
    ? getUpdatedNumber
    : (_path, fallback) => toFiniteNumber(fallback, 0);
  const hasVoyageRootUpdate = hasPath(VOYAGE_ROOT_PATH);
  const hasVoyageCurrentUpdate = hasPath(VOYAGE_CURRENT_PATH);
  const hasVoyageTotalUpdate = hasPath(VOYAGE_TOTAL_PATH);
  const hasVoyageMaxUpdate = hasPath(VOYAGE_MAX_PATH);
  const hasVoyageValueUpdate = hasVoyageCurrentUpdate || hasVoyageTotalUpdate || hasVoyageMaxUpdate;

  return planPreUpdateVoyageResourceChange({
    actorType,
    hasVoyageRootUpdate,
    hasVoyageCurrentUpdate,
    hasVoyageTotalUpdate,
    hasVoyageMaxUpdate,
    actorVoyageCurrent,
    actorVoyageTotal,
    requestedCurrent: hasVoyageValueUpdate
      ? readUpdatedNumber(VOYAGE_CURRENT_PATH, actorVoyageCurrent)
      : undefined,
    requestedTotal: hasVoyageValueUpdate
      ? (
        hasVoyageTotalUpdate
          ? readUpdatedNumber(VOYAGE_TOTAL_PATH, actorVoyageTotal)
          : readUpdatedNumber(VOYAGE_MAX_PATH, actorVoyageTotal)
      )
      : undefined
  });
}

export function normalizeArchetypeProfileUpdate({
  currentProfile,
  rawBonusValue,
  rawBonusCharacteristic,
  normalizeBonusValue,
  normalizeCharacteristicKey
} = {}) {
  const profile = currentProfile && typeof currentProfile === "object" ? currentProfile : {};
  const normalizeValue = typeof normalizeBonusValue === "function"
    ? normalizeBonusValue
    : value => Number(value);
  const normalizeKey = typeof normalizeCharacteristicKey === "function"
    ? normalizeCharacteristicKey
    : value => String(value || "").trim().toUpperCase();

  const normalizedBonusValue = normalizeValue(
    rawBonusValue,
    profile.archetypeBonusValue ?? 0
  );
  if (!Number.isFinite(normalizedBonusValue)) {
    return { ok: false, errorCode: "invalid-number" };
  }

  const normalizedBonusCharacteristic = normalizeKey(rawBonusCharacteristic);
  const normalizedRawCharacteristic = String(rawBonusCharacteristic || "").trim();
  if (normalizedRawCharacteristic && !normalizedBonusCharacteristic) {
    return { ok: false, errorCode: "invalid-characteristic" };
  }
  if (normalizedBonusValue !== 0 && !normalizedBonusCharacteristic) {
    return { ok: false, errorCode: "characteristic-required" };
  }

  return {
    ok: true,
    normalizedBonusValue,
    normalizedBonusCharacteristic
  };
}

export function getArchetypeProfileNormalizationErrorNotificationKey(errorCode = "") {
  if (errorCode === "invalid-number") {
    return "BLOODMAN.Notifications.InvalidArchetypeBonusNumber";
  }
  if (errorCode === "invalid-characteristic") {
    return "BLOODMAN.Notifications.InvalidArchetypeBonusCharacteristic";
  }
  if (errorCode === "characteristic-required") {
    return "BLOODMAN.Notifications.ArchetypeBonusCharacteristicRequired";
  }
  return null;
}

export function planArchetypeProfilePreUpdate({
  hasArchetypeBonusValueUpdate = false,
  hasArchetypeBonusCharacteristicUpdate = false,
  currentProfile,
  rawBonusValue,
  rawBonusCharacteristic,
  normalizeBonusValue,
  normalizeCharacteristicKey
} = {}) {
  const hasArchetypeProfileUpdate = Boolean(
    hasArchetypeBonusValueUpdate || hasArchetypeBonusCharacteristicUpdate
  );
  if (!hasArchetypeProfileUpdate) return { kind: "skip" };

  const normalization = normalizeArchetypeProfileUpdate({
    currentProfile,
    rawBonusValue,
    rawBonusCharacteristic,
    normalizeBonusValue,
    normalizeCharacteristicKey
  });
  if (!normalization.ok) {
    return {
      kind: "invalid",
      errorCode: normalization.errorCode
    };
  }
  return {
    kind: "apply",
    normalizedBonusValue: normalization.normalizedBonusValue,
    normalizedBonusCharacteristic: normalization.normalizedBonusCharacteristic
  };
}

export function computePreUpdateActorDerivedVitals({
  phyBase,
  espBase,
  phyItemBonus,
  espItemBonus,
  archetypeBonusValue,
  archetypeBonusCharacteristic,
  storedPvBonus,
  storedPpBonus,
  roleOverride,
  derivePvMax
} = {}) {
  const normalizedArchetypeKey = String(archetypeBonusCharacteristic || "").trim().toUpperCase();
  const numericArchetypeValue = Number(archetypeBonusValue);
  const profilePhyBonus = normalizedArchetypeKey === "PHY" && Number.isFinite(numericArchetypeValue)
    ? numericArchetypeValue
    : 0;
  const profileEspBonus = normalizedArchetypeKey === "ESP" && Number.isFinite(numericArchetypeValue)
    ? numericArchetypeValue
    : 0;

  const phyEffective = toFiniteNumber(phyBase, 0)
    + toFiniteNumber(phyItemBonus, 0)
    + profilePhyBonus;
  const espEffective = toFiniteNumber(espBase, 0)
    + toFiniteNumber(espItemBonus, 0)
    + profileEspBonus;
  const derivedPvBase = typeof derivePvMax === "function"
    ? Number(derivePvMax(phyEffective, roleOverride))
    : Math.round(phyEffective / 5);
  const pvMax = toFiniteNumber(derivedPvBase, 0) + toFiniteNumber(storedPvBonus, 0);
  const ppMax = Math.round(espEffective / 5) + toFiniteNumber(storedPpBonus, 0);

  return {
    phyEffective,
    espEffective,
    pvMax,
    ppMax
  };
}

export function computeAllowedVitalBounds({
  storedPvMax,
  storedPpMax,
  fallbackPvMax = 0,
  fallbackPpMax = 0
} = {}) {
  const finalPvMax = Number.isFinite(storedPvMax) ? storedPvMax : toFiniteNumber(fallbackPvMax, 0);
  const finalPpMax = Number.isFinite(storedPpMax) ? storedPpMax : toFiniteNumber(fallbackPpMax, 0);

  return {
    allowedPvMax: Math.max(0, finalPvMax),
    allowedPpMax: Math.max(0, finalPpMax)
  };
}

export function planPreUpdateVitalResourcePatch({
  hasPvMaxUpdate = false,
  hasPpMaxUpdate = false,
  hasPvCurrentUpdate = false,
  hasPpCurrentUpdate = false,
  rawPvMax,
  rawPpMax,
  rawPvCurrent,
  rawPpCurrent,
  fallbackPvMax = 0,
  fallbackPpMax = 0,
  fallbackPvCurrent = 0,
  fallbackPpCurrent = 0,
  storedPvMax,
  storedPpMax,
  derivedPvMax = 0,
  derivedPpMax = 0
} = {}) {
  const normalizedVitalMaxValues = computePreUpdateVitalNormalization({
    hasPvMaxUpdate,
    hasPpMaxUpdate,
    rawPvMax,
    rawPpMax,
    fallbackPvMax,
    fallbackPpMax
  });
  const effectiveStoredPvMax = Object.prototype.hasOwnProperty.call(normalizedVitalMaxValues, "pvMax")
    ? normalizedVitalMaxValues.pvMax
    : storedPvMax;
  const effectiveStoredPpMax = Object.prototype.hasOwnProperty.call(normalizedVitalMaxValues, "ppMax")
    ? normalizedVitalMaxValues.ppMax
    : storedPpMax;

  const { allowedPvMax, allowedPpMax } = computeAllowedVitalBounds({
    storedPvMax: effectiveStoredPvMax,
    storedPpMax: effectiveStoredPpMax,
    fallbackPvMax: derivedPvMax,
    fallbackPpMax: derivedPpMax
  });

  const normalizedVitalCurrentValues = computePreUpdateVitalNormalization({
    hasPvCurrentUpdate,
    hasPpCurrentUpdate,
    rawPvCurrent,
    rawPpCurrent,
    fallbackPvCurrent,
    fallbackPpCurrent,
    allowedPvMax,
    allowedPpMax
  });

  return {
    normalizedVitalMaxValues,
    normalizedVitalCurrentValues
  };
}

export function planPreUpdateActorDerivedVitalPatch({
  phyBase,
  espBase,
  phyItemBonus,
  espItemBonus,
  archetypeBonusValue,
  archetypeBonusCharacteristic,
  storedPvBonus,
  storedPpBonus,
  roleOverride,
  derivePvMax,
  hasPvMaxUpdate = false,
  hasPpMaxUpdate = false,
  hasPvCurrentUpdate = false,
  hasPpCurrentUpdate = false,
  rawPvMax,
  rawPpMax,
  rawPvCurrent,
  rawPpCurrent,
  fallbackPvMax = 0,
  fallbackPpMax = 0,
  fallbackPvCurrent = 0,
  fallbackPpCurrent = 0,
  storedPvMax,
  storedPpMax
} = {}) {
  const derivedVitals = computePreUpdateActorDerivedVitals({
    phyBase,
    espBase,
    phyItemBonus,
    espItemBonus,
    archetypeBonusValue,
    archetypeBonusCharacteristic,
    storedPvBonus,
    storedPpBonus,
    roleOverride,
    derivePvMax
  });
  const vitalResourcePatch = planPreUpdateVitalResourcePatch({
    hasPvMaxUpdate,
    hasPpMaxUpdate,
    hasPvCurrentUpdate,
    hasPpCurrentUpdate,
    rawPvMax,
    rawPpMax,
    rawPvCurrent,
    rawPpCurrent,
    fallbackPvMax,
    fallbackPpMax,
    fallbackPvCurrent,
    fallbackPpCurrent,
    storedPvMax,
    storedPpMax,
    derivedPvMax: derivedVitals.pvMax,
    derivedPpMax: derivedVitals.ppMax
  });
  return {
    ...derivedVitals,
    ...vitalResourcePatch
  };
}

export function computePreUpdateVitalNormalization({
  hasPvMaxUpdate = false,
  hasPpMaxUpdate = false,
  hasPvCurrentUpdate = false,
  hasPpCurrentUpdate = false,
  rawPvMax,
  rawPpMax,
  rawPvCurrent,
  rawPpCurrent,
  fallbackPvMax = 0,
  fallbackPpMax = 0,
  fallbackPvCurrent = 0,
  fallbackPpCurrent = 0,
  allowedPvMax = 0,
  allowedPpMax = 0
} = {}) {
  const normalized = {};
  if (hasPvMaxUpdate) {
    normalized.pvMax = normalizeVitalPathRawValue(rawPvMax, fallbackPvMax);
  }
  if (hasPpMaxUpdate) {
    normalized.ppMax = normalizeVitalPathRawValue(rawPpMax, fallbackPpMax);
  }
  if (hasPvCurrentUpdate) {
    normalized.pvCurrent = clampVitalCurrentFromRawValue(
      rawPvCurrent,
      fallbackPvCurrent,
      allowedPvMax
    );
  }
  if (hasPpCurrentUpdate) {
    normalized.ppCurrent = clampVitalCurrentFromRawValue(
      rawPpCurrent,
      fallbackPpCurrent,
      allowedPpMax
    );
  }
  return normalized;
}

export function planStateModifierLabelUpdate({
  hasStateLabelUpdate = false,
  rawLabel = "",
  currentLabel = "",
  buildStateModifierUpdate
} = {}) {
  if (!hasStateLabelUpdate) return { kind: "skip" };
  const nextLabel = String(rawLabel || "").trim();
  const normalizedCurrentLabel = String(currentLabel || "").trim();
  if (nextLabel === normalizedCurrentLabel) return { kind: "unchanged" };

  const stateUpdate = typeof buildStateModifierUpdate === "function"
    ? buildStateModifierUpdate(rawLabel)
    : { ok: false, invalidTokens: [] };
  if (!stateUpdate?.ok) {
    return {
      kind: "invalid",
      invalidTokens: Array.isArray(stateUpdate?.invalidTokens) ? stateUpdate.invalidTokens : []
    };
  }

  return {
    kind: "apply",
    label: stateUpdate.label,
    totals: stateUpdate.totals
  };
}
