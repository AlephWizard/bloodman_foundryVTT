function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
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
  if (!normalized) return Boolean(fallback);
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function defaultNormalizeWeaponType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "corps") return "corps";
  if (normalized === "distance") return "distance";
  return "";
}

function defaultGetWeaponCategory(value) {
  const normalized = defaultNormalizeWeaponType(value);
  return normalized === "corps" ? "corps" : "distance";
}

export function createWeaponAmmoRules({
  normalizeNonNegativeInteger,
  normalizeWeaponType,
  toCheckboxBoolean,
  getWeaponCategory,
  getProperty,
  setProperty
} = {}) {
  const normalizeInteger = typeof normalizeNonNegativeInteger === "function"
    ? normalizeNonNegativeInteger
    : defaultNormalizeNonNegativeInteger;
  const normalizeType = typeof normalizeWeaponType === "function"
    ? normalizeWeaponType
    : defaultNormalizeWeaponType;
  const toCheckbox = typeof toCheckboxBoolean === "function"
    ? toCheckboxBoolean
    : defaultToCheckboxBoolean;
  const getCategory = typeof getWeaponCategory === "function"
    ? getWeaponCategory
    : defaultGetWeaponCategory;
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : defaultGetProperty;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;

  function hasUpdatePath(updateData, path) {
    if (!updateData || !path) return false;
    return Object.prototype.hasOwnProperty.call(updateData, path)
      || readProperty(updateData, path) !== undefined;
  }

  function getUpdatedPathValue(updateData, path, fallback) {
    if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
    const nested = readProperty(updateData, path);
    return nested === undefined ? fallback : nested;
  }

  function normalizeWeaponLoadedAmmoValue(value, fallback = 0, capacity = 0) {
    const normalizedCapacity = normalizeInteger(capacity, 0);
    const numeric = normalizeInteger(value, fallback);
    if (normalizedCapacity <= 0) return 0;
    return Math.min(numeric, normalizedCapacity);
  }

  function getWeaponLoadedAmmo(item, options = {}) {
    const capacity = normalizeInteger(item?.system?.magazineCapacity, 0);
    const fallback = normalizeInteger(options.fallback, 0);
    return normalizeWeaponLoadedAmmoValue(item?.system?.loadedAmmo, fallback, capacity);
  }

  function normalizeWeaponMagazineCapacityUpdate(item, updateData = null) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (type !== "arme") return false;
    const capacityPath = "system.magazineCapacity";
    const loadedAmmoPath = "system.loadedAmmo";
    const weaponTypePath = "system.weaponType";
    const infiniteAmmoPath = "system.infiniteAmmo";
    const actorAmmoMagazineFallback = normalizeInteger(item?.actor?.system?.ammo?.magazine, 0);

    if (updateData) {
      const hasRelevantUpdate = [
        capacityPath,
        loadedAmmoPath,
        weaponTypePath,
        infiniteAmmoPath
      ].some(path => hasUpdatePath(updateData, path));
      if (!hasRelevantUpdate) return false;

      const nextCapacity = normalizeInteger(
        getUpdatedPathValue(updateData, capacityPath, item?.system?.magazineCapacity ?? 0),
        item?.system?.magazineCapacity ?? 0
      );
      const nextWeaponType = normalizeType(
        getUpdatedPathValue(updateData, weaponTypePath, item?.system?.weaponType || "distance")
      );
      const weaponType = nextWeaponType || "distance";
      const infiniteAmmo = toCheckbox(
        getUpdatedPathValue(updateData, infiniteAmmoPath, item?.system?.infiniteAmmo),
        false
      );
      const consumesAmmo = getCategory(weaponType) === "distance" && !infiniteAmmo;
      const usesMagazine = consumesAmmo && nextCapacity > 0;

      const fallbackLoadedAmmo = normalizeWeaponLoadedAmmoValue(
        item?.system?.loadedAmmo,
        actorAmmoMagazineFallback,
        usesMagazine ? nextCapacity : 0
      );
      const nextLoadedAmmo = normalizeWeaponLoadedAmmoValue(
        getUpdatedPathValue(updateData, loadedAmmoPath, fallbackLoadedAmmo),
        fallbackLoadedAmmo,
        usesMagazine ? nextCapacity : 0
      );

      writeProperty(updateData, weaponTypePath, weaponType);
      writeProperty(updateData, capacityPath, nextCapacity);
      writeProperty(updateData, loadedAmmoPath, nextLoadedAmmo);
      return true;
    }

    const sourceCapacity = normalizeInteger(item?.system?.magazineCapacity, 0);
    const sourceWeaponType = normalizeType(item?.system?.weaponType || "distance") || "distance";
    const sourceInfiniteAmmo = toCheckbox(item?.system?.infiniteAmmo, false);
    const sourceConsumesAmmo = getCategory(sourceWeaponType) === "distance" && !sourceInfiniteAmmo;
    const sourceUsesMagazine = sourceConsumesAmmo && sourceCapacity > 0;
    const sourceLoadedAmmo = normalizeWeaponLoadedAmmoValue(
      item?.system?.loadedAmmo,
      actorAmmoMagazineFallback,
      sourceUsesMagazine ? sourceCapacity : 0
    );
    item.updateSource({
      [weaponTypePath]: sourceWeaponType,
      [capacityPath]: sourceCapacity,
      [loadedAmmoPath]: sourceLoadedAmmo
    });
    return true;
  }

  return {
    normalizeWeaponLoadedAmmoValue,
    getWeaponLoadedAmmo,
    normalizeWeaponMagazineCapacityUpdate
  };
}
