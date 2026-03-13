function cloneUpdateData(updateData, deepClone) {
  if (typeof deepClone === "function") return deepClone(updateData || {});
  if (!updateData || typeof updateData !== "object") return {};
  return { ...updateData };
}

function buildDefaultRestrictionPlan() {
  return {
    stripCharacteristicBase: false,
    stripVitalResources: false,
    stripStateModifiers: false,
    stripActorTokenImages: false,
    stripAmmoUpdates: false
  };
}

export function buildActorUpdateSanitizer({
  deepClone,
  planActorUpdateRestrictionByRole,
  isBasicPlayerRole,
  isAssistantOrHigherRole,
  stripUnauthorizedCharacteristicBaseUpdates,
  stripUpdatePaths,
  vitalResourcePathList = [],
  stateModifierPaths = [],
  actorTokenImageUpdatePaths = [],
  ammoUpdatePaths = [],
  normalizeActorAmmoUpdateData,
  normalizeCharacteristicXpUpdates,
  normalizeCharacteristicBaseUpdatesForRole
} = {}) {
  const normalizedVitalResourcePathList = Array.isArray(vitalResourcePathList) ? vitalResourcePathList : [];
  const normalizedStateModifierPaths = Array.isArray(stateModifierPaths) ? stateModifierPaths : [];
  const normalizedActorTokenImageUpdatePaths = Array.isArray(actorTokenImageUpdatePaths)
    ? actorTokenImageUpdatePaths
    : [];
  const normalizedAmmoUpdatePaths = Array.isArray(ammoUpdatePaths) ? ammoUpdatePaths : [];

  function applyActorUpdateRestrictionPlan(updateData, restrictionPlan = {}) {
    if (restrictionPlan.stripCharacteristicBase && typeof stripUnauthorizedCharacteristicBaseUpdates === "function") {
      stripUnauthorizedCharacteristicBaseUpdates(updateData);
    }
    if (restrictionPlan.stripVitalResources && typeof stripUpdatePaths === "function") {
      stripUpdatePaths(updateData, normalizedVitalResourcePathList);
    }
    if (restrictionPlan.stripStateModifiers && typeof stripUpdatePaths === "function") {
      stripUpdatePaths(updateData, normalizedStateModifierPaths);
    }
    if (restrictionPlan.stripActorTokenImages && typeof stripUpdatePaths === "function") {
      stripUpdatePaths(updateData, normalizedActorTokenImageUpdatePaths);
    }
    if (restrictionPlan.stripAmmoUpdates && typeof stripUpdatePaths === "function") {
      stripUpdatePaths(updateData, normalizedAmmoUpdatePaths);
    }
  }

  function sanitizeActorUpdateForRole(updateData, role, options = {}) {
    const sanitized = cloneUpdateData(updateData, deepClone);
    const basicPlayer = typeof isBasicPlayerRole === "function"
      ? Boolean(isBasicPlayerRole(role))
      : false;
    const allowCharacteristicBase = Boolean(options.allowCharacteristicBase);
    const allowVitalResourceUpdate = Boolean(options.allowVitalResourceUpdate);
    const allowAmmoUpdate = Boolean(options.allowAmmoUpdate);
    const restrictionPlan = typeof planActorUpdateRestrictionByRole === "function"
      ? planActorUpdateRestrictionByRole({
        updaterRole: role,
        allowCharacteristicBase,
        allowVitalResourceUpdate,
        allowAmmoUpdate,
        isBasicPlayerRole,
        isAssistantOrHigherRole
      })
      : buildDefaultRestrictionPlan();
    const enforceCharacteristicBaseRange = options.enforceCharacteristicBaseRange !== false;

    applyActorUpdateRestrictionPlan(sanitized, restrictionPlan);
    if (typeof normalizeActorAmmoUpdateData === "function") {
      normalizeActorAmmoUpdateData(options.actor || null, sanitized, {
        allowUpdate: !restrictionPlan.stripAmmoUpdates,
        allowStockIncrease: !basicPlayer,
        allowMagazineEdit: !basicPlayer
      });
    }
    if (typeof normalizeCharacteristicXpUpdates === "function") {
      normalizeCharacteristicXpUpdates(sanitized, options.actor || null);
    }
    if (enforceCharacteristicBaseRange && typeof normalizeCharacteristicBaseUpdatesForRole === "function") {
      normalizeCharacteristicBaseUpdatesForRole(sanitized, role);
    }
    return sanitized;
  }

  return {
    applyActorUpdateRestrictionPlan,
    sanitizeActorUpdateForRole
  };
}
