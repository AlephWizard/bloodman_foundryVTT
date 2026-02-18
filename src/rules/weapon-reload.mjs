function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultNormalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(defaultToFiniteNumber(value, fallback)));
}

export function createWeaponReloadRules({
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  getWeaponCategory,
  normalizeAmmoState,
  buildDefaultAmmo,
  getWeaponLoadedAmmo
} = {}) {
  const normalizeInt = typeof normalizeNonNegativeInteger === "function"
    ? normalizeNonNegativeInteger
    : defaultNormalizeNonNegativeInteger;
  const toBool = typeof toCheckboxBoolean === "function"
    ? toCheckboxBoolean
    : (value, fallback = false) => {
      if (value === undefined || value === null || value === "") return Boolean(fallback);
      return Boolean(value);
    };
  const weaponCategory = typeof getWeaponCategory === "function"
    ? getWeaponCategory
    : () => "";
  const normalizeAmmo = typeof normalizeAmmoState === "function"
    ? normalizeAmmoState
    : () => ({ stock: 0, magazine: 0 });
  const defaultAmmo = typeof buildDefaultAmmo === "function"
    ? buildDefaultAmmo
    : () => ({ stock: 0, magazine: 0 });
  const resolveLoadedAmmo = typeof getWeaponLoadedAmmo === "function"
    ? getWeaponLoadedAmmo
    : (_item, { fallback = 0 } = {}) => normalizeInt(fallback, 0);

  function resolveWeaponReloadPlan({ item = null, actorAmmoData = null } = {}) {
    if (!item || String(item.type || "").trim().toLowerCase() !== "arme") {
      return { ok: false, reason: "not-weapon" };
    }
    if (weaponCategory(item.system?.weaponType) !== "distance") {
      return { ok: false, reason: "not-ranged" };
    }
    if (toBool(item.system?.infiniteAmmo, false)) {
      return { ok: false, reason: "infinite-ammo" };
    }

    const capacity = normalizeInt(item.system?.magazineCapacity, 0);
    if (capacity <= 0) {
      return { ok: false, reason: "invalid-capacity", capacity };
    }

    const ammoState = normalizeAmmo(actorAmmoData, {
      fallback: defaultAmmo(),
      capacity
    });
    const ammoStock = Math.max(0, normalizeInt(ammoState?.stock, 0));
    const currentMagazine = resolveLoadedAmmo(item, { fallback: ammoState?.magazine });
    const targetCapacity = capacity > 0 ? capacity : (currentMagazine + ammoStock);
    const needed = Math.max(0, targetCapacity - currentMagazine);

    if (needed <= 0) {
      return {
        ok: false,
        reason: "already-full",
        capacity,
        ammoStock,
        currentMagazine
      };
    }
    if (ammoStock <= 0) {
      return {
        ok: false,
        reason: "no-ammo",
        capacity,
        ammoStock,
        currentMagazine
      };
    }

    const transferred = Math.min(needed, ammoStock);
    const nextStock = Math.max(0, ammoStock - transferred);
    const nextMagazine = capacity > 0
      ? Math.min(capacity, currentMagazine + transferred)
      : Math.max(0, currentMagazine + transferred);

    return {
      ok: true,
      reason: "",
      capacity,
      ammoStock,
      currentMagazine,
      transferred,
      nextStock,
      nextMagazine
    };
  }

  return {
    resolveWeaponReloadPlan
  };
}
