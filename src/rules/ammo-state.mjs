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
  let ammoLineSequence = 0;

  function generateAmmoLineId() {
    const foundryRandomId = globalThis.foundry?.utils?.randomID;
    if (typeof foundryRandomId === "function") return String(foundryRandomId());
    ammoLineSequence += 1;
    return `ammo-line-${ammoLineSequence}`;
  }

  function buildDefaultAmmo() {
    return { type: "", stock: 0, magazine: 0, value: 0 };
  }

  function buildDefaultAmmoLine() {
    return { id: "", type: "", stock: 0 };
  }

  function normalizeAmmoType(value) {
    return String(value ?? "").trim();
  }

  function normalizeAmmoLine(rawAmmoLine = null, options = {}) {
    const fallbackBase = options.fallback ?? buildDefaultAmmoLine();
    const fallback = mergeData(buildDefaultAmmoLine(), fallbackBase || {}, { inplace: false });
    const rawSource = rawAmmoLine && typeof rawAmmoLine === "object" ? rawAmmoLine : {};
    const source = mergeData(fallback, rawSource, { inplace: false });
    const id = String(source.id || rawSource.id || "").trim() || generateAmmoLineId();
    const type = normalizeAmmoType(source.type);
    const fallbackStock = normalizeInteger(fallback.stock ?? fallback.value, 0);
    const hasRawStock = Object.prototype.hasOwnProperty.call(rawSource, "stock");
    const hasRawValue = Object.prototype.hasOwnProperty.call(rawSource, "value");
    const stockRaw = hasRawStock
      ? rawSource.stock
      : (hasRawValue ? rawSource.value : source.stock ?? source.value ?? fallbackStock);
    return {
      id,
      type,
      stock: Math.max(0, normalizeInteger(stockRaw, fallbackStock))
    };
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

  function normalizeAmmoPool(rawAmmoPool = null, options = {}) {
    const fallbackAmmo = normalizeAmmoState(options.fallbackAmmo, {
      fallback: buildDefaultAmmo(),
      capacity: 0
    });
    const sourceLines = Array.isArray(rawAmmoPool) ? rawAmmoPool : [];
    const normalized = sourceLines
      .filter(line => line && typeof line === "object")
      .map(line => normalizeAmmoLine(line));
    if (normalized.length) return normalized;
    return [
      normalizeAmmoLine({
        type: fallbackAmmo.type,
        stock: fallbackAmmo.stock
      })
    ];
  }

  function clampAmmoActiveIndex(value, ammoPool = null, fallback = 0) {
    const pool = Array.isArray(ammoPool) ? ammoPool : [];
    const maxIndex = Math.max(0, pool.length - 1);
    const normalized = normalizeInteger(value, fallback);
    return Math.min(maxIndex, normalized);
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

  function buildActiveAmmoState({
    ammoPool = null,
    activeIndex = 0,
    currentAmmo = null,
    capacity = 0
  } = {}) {
    const normalizedPool = normalizeAmmoPool(ammoPool, { fallbackAmmo: currentAmmo });
    const normalizedActiveIndex = clampAmmoActiveIndex(activeIndex, normalizedPool, 0);
    const activeLine = normalizedPool[normalizedActiveIndex] || buildDefaultAmmoLine();
    const fallbackAmmo = normalizeAmmoState(currentAmmo, {
      fallback: buildDefaultAmmo(),
      capacity
    });
    return normalizeAmmoState(
      {
        ...fallbackAmmo,
        type: activeLine.type,
        stock: activeLine.stock,
        value: activeLine.stock
      },
      {
        fallback: fallbackAmmo,
        capacity
      }
    );
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

  function areAmmoPoolStatesEqual(currentAmmoPool = null, nextAmmoPool = null) {
    const currentPool = normalizeAmmoPool(currentAmmoPool);
    const nextPool = normalizeAmmoPool(nextAmmoPool);
    if (currentPool.length !== nextPool.length) return false;
    return currentPool.every((line, index) => {
      const other = nextPool[index];
      const currentId = String(line?.id || "").trim();
      const nextId = String(other?.id || "").trim();
      if (currentId || nextId) {
        if (currentId !== nextId) return false;
      }
      return normalizeAmmoType(line?.type) === normalizeAmmoType(other?.type)
        && normalizeInteger(line?.stock, 0) === normalizeInteger(other?.stock, 0);
    });
  }

  function isDirectAmmoPoolEntryPath(path = "") {
    return /^system\.ammoPool\.(\d+)\.(type|stock|value)$/.test(String(path || ""));
  }

  function hasAmmoUpdatePayload(updateData) {
    if (!updateData || typeof updateData !== "object") return false;
    const directPaths = [
      "system.ammo",
      "system.ammo.type",
      "system.ammo.stock",
      "system.ammo.magazine",
      "system.ammo.value",
      "system.ammoPool",
      "system.ammoActiveIndex"
    ];
    if (directPaths.some(path => hasPath(updateData, path))) return true;
    return Object.keys(updateData).some(path => isDirectAmmoPoolEntryPath(path));
  }

  function stripDirectAmmoUpdatePaths(updateData) {
    if (!updateData || typeof updateData !== "object") return false;
    let removed = false;
    const directPaths = [
      "system.ammo",
      "system.ammo.type",
      "system.ammo.stock",
      "system.ammo.magazine",
      "system.ammo.value",
      "system.ammoPool",
      "system.ammoActiveIndex"
    ];
    for (const path of directPaths) {
      if (unsetPath(updateData, path)) removed = true;
    }
    for (const path of Object.keys(updateData)) {
      if (!isDirectAmmoPoolEntryPath(path)) continue;
      delete updateData[path];
      removed = true;
    }
    return removed;
  }

  function normalizeActorAmmoUpdateData(actor, updateData, options = {}) {
    if (!updateData || typeof updateData !== "object") return false;
    if (!hasAmmoUpdatePayload(updateData)) return false;

    const allowUpdate = options.allowUpdate !== false;
    const allowStockIncrease = options.allowStockIncrease !== false;
    const allowMagazineEdit = options.allowMagazineEdit !== false;
    const allowTypeEdit = options.allowTypeEdit !== false;
    const ammoPath = "system.ammo";
    const ammoTypePath = "system.ammo.type";
    const ammoStockPath = "system.ammo.stock";
    const ammoMagazinePath = "system.ammo.magazine";
    const ammoLegacyValuePath = "system.ammo.value";
    const ammoPoolPath = "system.ammoPool";
    const ammoActiveIndexPath = "system.ammoActiveIndex";

    if (!allowUpdate) {
      return stripDirectAmmoUpdatePaths(updateData);
    }

    const capacity = getActorAmmoCapacityLimit(actor);
    const currentAmmoPool = normalizeAmmoPool(actor?.system?.ammoPool, {
      fallbackAmmo: actor?.system?.ammo
    });
    const currentActiveIndex = clampAmmoActiveIndex(actor?.system?.ammoActiveIndex, currentAmmoPool, 0);
    const currentAmmo = buildActiveAmmoState({
      ammoPool: currentAmmoPool,
      activeIndex: currentActiveIndex,
      currentAmmo: actor?.system?.ammo,
      capacity
    });

    const nextAmmoPool = currentAmmoPool.map(line => ({ ...line }));
    const ensureAmmoPoolIndex = index => {
      const normalizedIndex = Math.max(0, normalizeInteger(index, 0));
      while (nextAmmoPool.length <= normalizedIndex) nextAmmoPool.push(buildDefaultAmmoLine());
      return normalizedIndex;
    };

    let nextActiveIndex = currentActiveIndex;
    let nextMagazine = currentAmmo.magazine;

    if (hasPath(updateData, ammoActiveIndexPath)) {
      nextActiveIndex = readPathValue(updateData, ammoActiveIndexPath, nextActiveIndex);
    }

    if (hasPath(updateData, ammoPoolPath)) {
      const rootPoolUpdate = readPathValue(updateData, ammoPoolPath, null);
      if (Array.isArray(rootPoolUpdate)) {
        const normalizedRootPool = normalizeAmmoPool(rootPoolUpdate, {
          fallbackAmmo: currentAmmo
        });
        nextAmmoPool.splice(0, nextAmmoPool.length, ...normalizedRootPool);
      } else if (rootPoolUpdate && typeof rootPoolUpdate === "object") {
        for (const [rawIndex, rawLine] of Object.entries(rootPoolUpdate)) {
          const index = Number(rawIndex);
          if (!Number.isInteger(index) || index < 0) continue;
          const targetIndex = ensureAmmoPoolIndex(index);
          nextAmmoPool[targetIndex] = normalizeAmmoLine(rawLine, {
            fallback: nextAmmoPool[targetIndex]
          });
        }
      }
    }

    for (const path of Object.keys(updateData)) {
      const match = path.match(/^system\.ammoPool\.(\d+)\.(type|stock|value)$/);
      if (!match) continue;
      const index = ensureAmmoPoolIndex(Number(match[1]));
      const property = match[2];
      if (property === "type") {
        nextAmmoPool[index].type = readPathValue(updateData, path, nextAmmoPool[index].type);
      } else {
        nextAmmoPool[index].stock = readPathValue(updateData, path, nextAmmoPool[index].stock);
      }
    }

    if (hasPath(updateData, ammoPath)) {
      const rootAmmoUpdate = readPathValue(updateData, ammoPath, {});
      const rootAmmoSource = rootAmmoUpdate && typeof rootAmmoUpdate === "object" ? rootAmmoUpdate : {};
      if (Object.prototype.hasOwnProperty.call(rootAmmoSource, "type") && allowTypeEdit) {
        nextAmmoPool[currentActiveIndex].type = rootAmmoSource.type;
      }
      if (Object.prototype.hasOwnProperty.call(rootAmmoSource, "stock")) {
        nextAmmoPool[currentActiveIndex].stock = rootAmmoSource.stock;
      } else if (Object.prototype.hasOwnProperty.call(rootAmmoSource, "value")) {
        nextAmmoPool[currentActiveIndex].stock = rootAmmoSource.value;
      }
      if (Object.prototype.hasOwnProperty.call(rootAmmoSource, "magazine")) {
        nextMagazine = rootAmmoSource.magazine;
      }
    }

    if (hasPath(updateData, ammoTypePath) && allowTypeEdit) {
      nextAmmoPool[currentActiveIndex].type = readPathValue(
        updateData,
        ammoTypePath,
        nextAmmoPool[currentActiveIndex].type
      );
    }
    if (hasPath(updateData, ammoStockPath)) {
      nextAmmoPool[currentActiveIndex].stock = readPathValue(
        updateData,
        ammoStockPath,
        nextAmmoPool[currentActiveIndex].stock
      );
    }
    if (hasPath(updateData, ammoLegacyValuePath) && !hasPath(updateData, ammoStockPath)) {
      nextAmmoPool[currentActiveIndex].stock = readPathValue(
        updateData,
        ammoLegacyValuePath,
        nextAmmoPool[currentActiveIndex].stock
      );
    }
    if (hasPath(updateData, ammoMagazinePath)) {
      nextMagazine = readPathValue(updateData, ammoMagazinePath, nextMagazine);
    }

    const normalizedAmmoPool = normalizeAmmoPool(nextAmmoPool, {
      fallbackAmmo: currentAmmo
    });
    const normalizedActiveIndex = clampAmmoActiveIndex(
      nextActiveIndex,
      normalizedAmmoPool,
      currentActiveIndex
    );
    const clampedAmmoPool = normalizedAmmoPool.map((line, index) => ({
      id: String(line?.id || currentAmmoPool[index]?.id || "").trim() || generateAmmoLineId(),
      type: allowTypeEdit ? line.type : currentAmmoPool[index]?.type ?? line.type,
      stock: allowStockIncrease
        ? line.stock
        : Math.min(
          line.stock,
          (() => {
            const currentLineId = String(line?.id || "").trim();
            if (currentLineId) {
              const currentById = currentAmmoPool.find(entry => String(entry?.id || "").trim() === currentLineId);
              if (currentById) return currentById.stock;
            }
            return index < currentAmmoPool.length ? currentAmmoPool[index].stock : 0;
          })()
        )
    }));
    const normalizedAmmo = buildActiveAmmoState({
      ammoPool: clampedAmmoPool,
      activeIndex: normalizedActiveIndex,
      currentAmmo: {
        ...currentAmmo,
        magazine: allowMagazineEdit
          ? normalizeInteger(nextMagazine, currentAmmo.magazine)
          : currentAmmo.magazine
      },
      capacity
    });

    stripDirectAmmoUpdatePaths(updateData);
    writeProperty(updateData, ammoPoolPath, clampedAmmoPool);
    writeProperty(updateData, ammoActiveIndexPath, normalizedActiveIndex);
    writeProperty(updateData, ammoTypePath, normalizedAmmo.type);
    writeProperty(updateData, ammoStockPath, normalizedAmmo.stock);
    writeProperty(updateData, ammoMagazinePath, normalizedAmmo.magazine);
    writeProperty(updateData, ammoLegacyValuePath, normalizedAmmo.value);
    return true;
  }

  return {
    buildDefaultAmmo,
    buildDefaultAmmoLine,
    normalizeAmmoType,
    normalizeAmmoLine,
    getActorAmmoCapacityLimit,
    normalizeAmmoPool,
    clampAmmoActiveIndex,
    normalizeAmmoState,
    buildActiveAmmoState,
    areAmmoStatesEqual,
    areAmmoPoolStatesEqual,
    hasAmmoUpdatePayload,
    normalizeActorAmmoUpdateData
  };
}
