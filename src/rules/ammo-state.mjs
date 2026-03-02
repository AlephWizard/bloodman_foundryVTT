function defaultNormalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  const fallbackNumeric = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
  if (!Number.isFinite(numeric)) return Math.max(0, Math.floor(safeFallback));
  return Math.max(0, Math.floor(numeric));
}

function defaultToCheckboxBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function defaultGetWeaponCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "corps" ? "corps" : "distance";
}

function defaultHasUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  return Object.prototype.hasOwnProperty.call(updateData, path);
}

function defaultGetUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
  return fallback;
}

function defaultUnsetUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  if (Object.prototype.hasOwnProperty.call(updateData, path)) {
    delete updateData[path];
    return true;
  }
  return false;
}

function defaultSetProperty(object, path, value) {
  if (!object || !path) return;
  const keys = String(path).split(".");
  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) continue;
    const child = current[key];
    if (!child || typeof child !== "object") current[key] = {};
    current = current[key];
  }
  const finalKey = keys[keys.length - 1];
  if (!finalKey) return;
  current[finalKey] = value;
}

function defaultMergeObject(target = {}, source = {}, { inplace = false } = {}) {
  const base = inplace ? target : { ...(target || {}) };
  for (const [key, value] of Object.entries(source || {})) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === "object"
      && !Array.isArray(base[key])
    ) {
      base[key] = defaultMergeObject(base[key], value, { inplace: false });
      continue;
    }
    base[key] = value;
  }
  return base;
}

export function createAmmoStateRules({
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  getWeaponCategory,
  hasUpdatePath,
  getUpdatedPathValue,
  unsetUpdatePath,
  setProperty,
  mergeObject
} = {}) {
  const normalizeInteger = typeof normalizeNonNegativeInteger === "function"
    ? normalizeNonNegativeInteger
    : defaultNormalizeNonNegativeInteger;
  const toCheckbox = typeof toCheckboxBoolean === "function"
    ? toCheckboxBoolean
    : defaultToCheckboxBoolean;
  const getWeaponKind = typeof getWeaponCategory === "function"
    ? getWeaponCategory
    : defaultGetWeaponCategory;
  const hasPath = typeof hasUpdatePath === "function"
    ? hasUpdatePath
    : defaultHasUpdatePath;
  const readPathValue = typeof getUpdatedPathValue === "function"
    ? getUpdatedPathValue
    : defaultGetUpdatedPathValue;
  const unsetPath = typeof unsetUpdatePath === "function"
    ? unsetUpdatePath
    : defaultUnsetUpdatePath;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const mergeData = typeof mergeObject === "function"
    ? mergeObject
    : defaultMergeObject;

  function buildDefaultAmmo() {
    return { type: "", stock: 0, magazine: 0, value: 0 };
  }

  function normalizeAmmoType(value) {
    return String(value ?? "").trim();
  }

  function getActorAmmoCapacityLimit(actor) {
    if (!actor?.items) return 0;
    let maxCapacity = 0;
    for (const item of actor.items) {
      if (String(item?.type || "").trim().toLowerCase() !== "arme") continue;
      const weaponType = getWeaponKind(item.system?.weaponType);
      if (weaponType !== "distance") continue;
      if (toCheckbox(item.system?.infiniteAmmo, false)) continue;
      const capacity = normalizeInteger(item.system?.magazineCapacity, 0);
      if (capacity > maxCapacity) maxCapacity = capacity;
    }
    return maxCapacity;
  }

  function normalizeAmmoState(rawAmmo = null, options = {}) {
    const fallbackBase = options.fallback ?? buildDefaultAmmo();
    const fallback = mergeData(buildDefaultAmmo(), fallbackBase || {}, { inplace: false });
    const rawSource = rawAmmo && typeof rawAmmo === "object" ? rawAmmo : {};
    const source = mergeData(fallback, rawSource, { inplace: false });
    const type = normalizeAmmoType(source.type);

    const fallbackStock = normalizeInteger(fallback.stock ?? fallback.value, 0);
    const fallbackMagazine = normalizeInteger(fallback.magazine ?? fallback.value, 0);

    const hasRawStock = Object.prototype.hasOwnProperty.call(rawSource, "stock");
    const hasRawMagazine = Object.prototype.hasOwnProperty.call(rawSource, "magazine");
    const hasRawValue = Object.prototype.hasOwnProperty.call(rawSource, "value");

    const stockRaw = hasRawStock
      ? rawSource.stock
      : (hasRawValue ? rawSource.value : source.stock ?? source.value ?? fallbackStock);
    const magazineRaw = hasRawMagazine
      ? rawSource.magazine
      : (hasRawValue ? rawSource.value : source.magazine ?? source.value ?? fallbackMagazine);

    let stock = normalizeInteger(stockRaw, fallbackStock);
    let magazine = normalizeInteger(magazineRaw, fallbackMagazine);

    const capacity = normalizeInteger(options.capacity, 0);
    if (capacity > 0) magazine = Math.min(magazine, capacity);

    stock = Math.max(0, stock);
    magazine = Math.max(0, magazine);

    return {
      type,
      stock,
      magazine,
      value: stock
    };
  }

  function areAmmoStatesEqual(currentAmmo = null, nextAmmo = null) {
    const currentType = normalizeAmmoType(currentAmmo?.type);
    const nextType = normalizeAmmoType(nextAmmo?.type);
    if (currentType !== nextType) return false;
    const currentStock = normalizeInteger(currentAmmo?.stock ?? currentAmmo?.value, 0);
    const nextStock = normalizeInteger(nextAmmo?.stock ?? nextAmmo?.value, 0);
    if (currentStock !== nextStock) return false;
    const currentMagazine = normalizeInteger(currentAmmo?.magazine, 0);
    const nextMagazine = normalizeInteger(nextAmmo?.magazine, 0);
    return currentMagazine === nextMagazine;
  }

  function normalizeActorAmmoUpdateData(actor, updateData) {
    if (!updateData || typeof updateData !== "object") return false;
    const ammoPath = "system.ammo";
    const ammoTypePath = "system.ammo.type";
    const ammoStockPath = "system.ammo.stock";
    const ammoMagazinePath = "system.ammo.magazine";
    const ammoLegacyValuePath = "system.ammo.value";

    const hasAmmoRootUpdate = hasPath(updateData, ammoPath);
    const hasAmmoTypeUpdate = hasPath(updateData, ammoTypePath);
    const hasAmmoStockUpdate = hasPath(updateData, ammoStockPath);
    const hasAmmoMagazineUpdate = hasPath(updateData, ammoMagazinePath);
    const hasAmmoLegacyValueUpdate = hasPath(updateData, ammoLegacyValuePath);
    const hasAnyAmmoUpdate = hasAmmoRootUpdate
      || hasAmmoTypeUpdate
      || hasAmmoStockUpdate
      || hasAmmoMagazineUpdate
      || hasAmmoLegacyValueUpdate;
    if (!hasAnyAmmoUpdate) return false;

    const capacity = getActorAmmoCapacityLimit(actor);
    const currentAmmo = normalizeAmmoState(actor?.system?.ammo, {
      fallback: buildDefaultAmmo(),
      capacity
    });

    const rootAmmoUpdate = hasAmmoRootUpdate ? readPathValue(updateData, ammoPath, {}) : {};
    const rootAmmoSource = rootAmmoUpdate && typeof rootAmmoUpdate === "object" ? rootAmmoUpdate : {};
    const nextRawAmmo = mergeData(currentAmmo, rootAmmoSource, { inplace: false });

    if (hasAmmoTypeUpdate) {
      nextRawAmmo.type = readPathValue(updateData, ammoTypePath, nextRawAmmo.type);
    }
    if (hasAmmoStockUpdate) {
      nextRawAmmo.stock = readPathValue(updateData, ammoStockPath, nextRawAmmo.stock);
    }
    if (hasAmmoMagazineUpdate) {
      nextRawAmmo.magazine = readPathValue(updateData, ammoMagazinePath, nextRawAmmo.magazine);
    }
    if (hasAmmoLegacyValueUpdate && !hasAmmoStockUpdate) {
      nextRawAmmo.stock = readPathValue(updateData, ammoLegacyValuePath, nextRawAmmo.stock);
    }

    const normalizedAmmo = normalizeAmmoState(nextRawAmmo, {
      fallback: currentAmmo,
      capacity
    });

    unsetPath(updateData, ammoPath);
    writeProperty(updateData, ammoTypePath, normalizedAmmo.type);
    writeProperty(updateData, ammoStockPath, normalizedAmmo.stock);
    writeProperty(updateData, ammoMagazinePath, normalizedAmmo.magazine);
    writeProperty(updateData, ammoLegacyValuePath, normalizedAmmo.value);
    return true;
  }

  return {
    buildDefaultAmmo,
    normalizeAmmoType,
    getActorAmmoCapacityLimit,
    normalizeAmmoState,
    areAmmoStatesEqual,
    normalizeActorAmmoUpdateData
  };
}
