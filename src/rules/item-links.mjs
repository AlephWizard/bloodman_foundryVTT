const ITEM_LINK_APPLY_MODE_GLOBAL = "global";
const ITEM_LINK_APPLY_MODE_ON_USE = "a_l_usage";

const ITEM_LINK_TRIGGER_ITEM_USE = "item-use";
const ITEM_LINK_TRIGGER_DAMAGE_ROLL = "damage-roll";
const ITEM_LINK_TRIGGER_CHARACTERISTIC_ROLL = "characteristic-roll";
const ITEM_LINK_TRIGGER_HEAL_ROLL = "heal-roll";

const ITEM_LINK_APPLY_MODE_SET = new Set([
  ITEM_LINK_APPLY_MODE_GLOBAL,
  ITEM_LINK_APPLY_MODE_ON_USE
]);
const ITEM_LINK_TRIGGER_ORDER = [
  ITEM_LINK_TRIGGER_ITEM_USE,
  ITEM_LINK_TRIGGER_DAMAGE_ROLL,
  ITEM_LINK_TRIGGER_CHARACTERISTIC_ROLL,
  ITEM_LINK_TRIGGER_HEAL_ROLL
];
const ITEM_LINK_TRIGGER_SET = new Set(ITEM_LINK_TRIGGER_ORDER);
const ITEM_LINK_DEFAULT_USAGE_TRIGGERS = [
  ITEM_LINK_TRIGGER_ITEM_USE,
  ITEM_LINK_TRIGGER_DAMAGE_ROLL
];

function defaultToCheckboxBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no" || normalized === "") return false;
  }
  return Boolean(fallback);
}

function defaultHasUpdatePath(object, path) {
  if (!object || !path) return false;
  if (Object.prototype.hasOwnProperty.call(object, path)) return true;
  const keys = String(path).split(".");
  let current = object;
  for (const key of keys) {
    if (current == null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) {
      return false;
    }
    current = current[key];
  }
  return true;
}

function defaultGetUpdatedPathValue(object, path, fallback = undefined) {
  if (!object || !path) return fallback;
  if (Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  const keys = String(path).split(".");
  let current = object;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return fallback;
    current = current[key];
  }
  return current === undefined ? fallback : current;
}

function defaultSetProperty(object, path, value) {
  if (!object || !path) return;
  const keys = String(path).split(".");
  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) continue;
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  const finalKey = keys[keys.length - 1];
  if (!finalKey) return;
  current[finalKey] = value;
}

function normalizeParentItemId(value) {
  return String(value || "").trim();
}

function normalizeEquiperAvecItemIds(value, { fallback = [] } = {}) {
  const source = Array.isArray(value)
    ? value
    : (value == null || value === ""
      ? fallback
      : [value]);
  const ordered = [];
  const seen = new Set();
  for (const entry of source) {
    const normalized = String(entry || "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

export function normalizeItemLinkApplyMode(value, fallback = ITEM_LINK_APPLY_MODE_GLOBAL) {
  const rawFallback = String(fallback || ITEM_LINK_APPLY_MODE_GLOBAL).trim().toLowerCase();
  const safeFallback = ITEM_LINK_APPLY_MODE_SET.has(rawFallback)
    ? rawFallback
    : ITEM_LINK_APPLY_MODE_GLOBAL;
  const normalized = String(value || "").trim().toLowerCase();
  return ITEM_LINK_APPLY_MODE_SET.has(normalized) ? normalized : safeFallback;
}

export function normalizeItemLinkUsageTriggers(value, { fallback = [] } = {}) {
  const source = Array.isArray(value)
    ? value
    : (value == null || value === ""
      ? []
      : [value]);
  const normalizedSet = new Set();
  for (const entry of source) {
    const normalized = String(entry || "").trim().toLowerCase();
    if (!ITEM_LINK_TRIGGER_SET.has(normalized)) continue;
    normalizedSet.add(normalized);
  }
  if (!normalizedSet.size) {
    const fallbackList = Array.isArray(fallback) ? fallback : [];
    for (const entry of fallbackList) {
      const normalized = String(entry || "").trim().toLowerCase();
      if (!ITEM_LINK_TRIGGER_SET.has(normalized)) continue;
      normalizedSet.add(normalized);
    }
  }
  return ITEM_LINK_TRIGGER_ORDER.filter(trigger => normalizedSet.has(trigger));
}

export function resolveItemLinkData(itemOrSystem = null, { toCheckboxBoolean = defaultToCheckboxBoolean } = {}) {
  const system = itemOrSystem?.system && typeof itemOrSystem.system === "object"
    ? itemOrSystem.system
    : (itemOrSystem || {});
  const linkData = system?.link && typeof system.link === "object"
    ? system.link
    : {};
  const parentItemId = normalizeParentItemId(linkData.parentItemId);
  const isLinkedChild = Boolean(parentItemId);
  const applyMode = normalizeItemLinkApplyMode(linkData.applyMode, ITEM_LINK_APPLY_MODE_GLOBAL);
  const active = toCheckboxBoolean(linkData.active, true);
  const triggerFallback = applyMode === ITEM_LINK_APPLY_MODE_ON_USE
    ? ITEM_LINK_DEFAULT_USAGE_TRIGGERS
    : [];
  const triggers = normalizeItemLinkUsageTriggers(linkData.triggers, { fallback: triggerFallback });
  const equiperAvecEnabled = isLinkedChild
    ? false
    : toCheckboxBoolean(
      linkData.equiperAvecEnabled,
      toCheckboxBoolean(linkData.containerEnabled, false)
    );
  const equiperAvec = isLinkedChild
    ? []
    : normalizeEquiperAvecItemIds(
      linkData.equiperAvec,
      { fallback: [] }
    );
  const containerCountsForBag = toCheckboxBoolean(linkData.containerCountsForBag, true);
  return {
    parentItemId,
    applyMode,
    active,
    triggers,
    equiperAvecEnabled,
    equiperAvec,
    containerCountsForBag
  };
}

export function shouldItemApplyGlobalBonuses(item) {
  const link = resolveItemLinkData(item);
  if (!link.active) return false;
  if (link.parentItemId) return false;
  if (link.applyMode === ITEM_LINK_APPLY_MODE_ON_USE) return false;
  return true;
}

export function isItemLinkContainerEnabled(itemOrSystem = null, { toCheckboxBoolean = defaultToCheckboxBoolean } = {}) {
  const link = resolveItemLinkData(itemOrSystem, { toCheckboxBoolean });
  return Boolean(link.equiperAvecEnabled);
}

export function isUsageLinkedItem(item, { parentItemId = "", requiredTrigger = "" } = {}) {
  const expectedParentItemId = normalizeParentItemId(parentItemId);
  if (!expectedParentItemId) return false;
  const link = resolveItemLinkData(item);
  if (!link.active) return false;
  if (link.applyMode !== ITEM_LINK_APPLY_MODE_ON_USE) return false;
  if (link.parentItemId !== expectedParentItemId) return false;
  const trigger = String(requiredTrigger || "").trim().toLowerCase();
  if (!trigger) return true;
  return link.triggers.includes(trigger);
}

export function hasAnyItemLinkPathUpdate(updateData = null, hasUpdatePath = defaultHasUpdatePath) {
  if (!updateData || typeof updateData !== "object") return false;
  return hasUpdatePath(updateData, "system.link")
    || hasUpdatePath(updateData, "system.link.parentItemId")
    || hasUpdatePath(updateData, "system.link.applyMode")
    || hasUpdatePath(updateData, "system.link.active")
    || hasUpdatePath(updateData, "system.link.triggers")
    || hasUpdatePath(updateData, "system.link.equiperAvecEnabled")
    || hasUpdatePath(updateData, "system.link.equiperAvec")
    || hasUpdatePath(updateData, "system.link.containerEnabled")
    || hasUpdatePath(updateData, "system.link.containerCountsForBag");
}

export function createItemLinkRules({
  hasUpdatePath,
  getUpdatedPathValue,
  setProperty,
  toCheckboxBoolean
} = {}) {
  const hasPath = typeof hasUpdatePath === "function"
    ? hasUpdatePath
    : defaultHasUpdatePath;
  const readPath = typeof getUpdatedPathValue === "function"
    ? getUpdatedPathValue
    : defaultGetUpdatedPathValue;
  const writePath = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const toCheckbox = typeof toCheckboxBoolean === "function"
    ? toCheckboxBoolean
    : defaultToCheckboxBoolean;

  function normalizeItemLinkUpdate(item, updateData = null, options = {}) {
    const includeSourceWhenMissing = options.includeSourceWhenMissing === true;
    const hasUpdate = updateData
      ? hasAnyItemLinkPathUpdate(updateData, hasPath)
      : true;
    if (!hasUpdate && !includeSourceWhenMissing) {
      return {
        changed: false,
        link: resolveItemLinkData(item, { toCheckboxBoolean: toCheckbox })
      };
    }

    const current = resolveItemLinkData(item, { toCheckboxBoolean: toCheckbox });
    const rawParentItemId = updateData
      ? readPath(updateData, "system.link.parentItemId", current.parentItemId)
      : current.parentItemId;
    const rawApplyMode = updateData
      ? readPath(updateData, "system.link.applyMode", current.applyMode)
      : current.applyMode;
    const rawActive = updateData
      ? readPath(updateData, "system.link.active", current.active)
      : current.active;
    const rawTriggers = updateData
      ? readPath(updateData, "system.link.triggers", current.triggers)
      : current.triggers;
    const hasEquiperAvecEnabledUpdate = Boolean(updateData) && (
      hasPath(updateData, "system.link.equiperAvecEnabled")
      || hasPath(updateData, "system.link.containerEnabled")
    );
    const rawEquiperAvecEnabled = hasEquiperAvecEnabledUpdate
      ? (
        hasPath(updateData, "system.link.equiperAvecEnabled")
          ? readPath(updateData, "system.link.equiperAvecEnabled", current.equiperAvecEnabled)
          : readPath(updateData, "system.link.containerEnabled", current.equiperAvecEnabled)
      )
      : current.equiperAvecEnabled;
    const hasEquiperAvecUpdate = Boolean(updateData) && hasPath(updateData, "system.link.equiperAvec");
    const rawEquiperAvec = hasEquiperAvecUpdate
      ? readPath(updateData, "system.link.equiperAvec", current.equiperAvec)
      : current.equiperAvec;
    const rawContainerCountsForBag = updateData
      ? readPath(updateData, "system.link.containerCountsForBag", current.containerCountsForBag)
      : current.containerCountsForBag;

    let parentItemId = normalizeParentItemId(rawParentItemId);
    const selfItemId = normalizeParentItemId(item?.id || item?._id);
    if (selfItemId && parentItemId === selfItemId) parentItemId = "";
    const isLinkedChild = Boolean(parentItemId);
    const applyMode = normalizeItemLinkApplyMode(rawApplyMode, current.applyMode);
    const active = toCheckbox(rawActive, true);
    const equiperAvecEnabled = isLinkedChild
      ? false
      : toCheckbox(rawEquiperAvecEnabled, false);
    const equiperAvec = isLinkedChild
      ? []
      : normalizeEquiperAvecItemIds(rawEquiperAvec, { fallback: current.equiperAvec });
    const sanitizedEquiperAvec = isLinkedChild
      ? []
      : (selfItemId
        ? equiperAvec.filter(itemId => itemId !== selfItemId)
        : equiperAvec);
    const containerCountsForBag = toCheckbox(rawContainerCountsForBag, true);
    const triggerFallback = applyMode === ITEM_LINK_APPLY_MODE_ON_USE
      ? (current.triggers.length ? current.triggers : ITEM_LINK_DEFAULT_USAGE_TRIGGERS)
      : [];
    const triggers = normalizeItemLinkUsageTriggers(rawTriggers, { fallback: triggerFallback });

    const nextLink = {
      parentItemId,
      applyMode,
      active,
      triggers,
      equiperAvecEnabled,
      equiperAvec: sanitizedEquiperAvec,
      containerCountsForBag
    };
    const changed = (
      current.parentItemId !== nextLink.parentItemId
      || current.applyMode !== nextLink.applyMode
      || current.active !== nextLink.active
      || current.equiperAvecEnabled !== nextLink.equiperAvecEnabled
      || current.containerCountsForBag !== nextLink.containerCountsForBag
      || current.equiperAvec.length !== nextLink.equiperAvec.length
      || current.equiperAvec.some((itemId, index) => itemId !== nextLink.equiperAvec[index])
      || current.triggers.length !== nextLink.triggers.length
      || current.triggers.some((trigger, index) => trigger !== nextLink.triggers[index])
    );

    if (updateData) {
      writePath(updateData, "system.link.parentItemId", nextLink.parentItemId);
      writePath(updateData, "system.link.applyMode", nextLink.applyMode);
      writePath(updateData, "system.link.active", nextLink.active);
      writePath(updateData, "system.link.triggers", [...nextLink.triggers]);
      writePath(updateData, "system.link.equiperAvecEnabled", nextLink.equiperAvecEnabled);
      writePath(updateData, "system.link.equiperAvec", [...nextLink.equiperAvec]);
      writePath(updateData, "system.link.containerCountsForBag", nextLink.containerCountsForBag);
    } else if (changed && item?.updateSource) {
      item.updateSource({
        "system.link.parentItemId": nextLink.parentItemId,
        "system.link.applyMode": nextLink.applyMode,
        "system.link.active": nextLink.active,
        "system.link.triggers": [...nextLink.triggers],
        "system.link.equiperAvecEnabled": nextLink.equiperAvecEnabled,
        "system.link.equiperAvec": [...nextLink.equiperAvec],
        "system.link.containerCountsForBag": nextLink.containerCountsForBag
      });
    }

    return { changed, link: nextLink };
  }

  return {
    normalizeItemLinkUpdate
  };
}

export {
  ITEM_LINK_APPLY_MODE_GLOBAL,
  ITEM_LINK_APPLY_MODE_ON_USE,
  ITEM_LINK_TRIGGER_ITEM_USE,
  ITEM_LINK_TRIGGER_DAMAGE_ROLL,
  ITEM_LINK_TRIGGER_CHARACTERISTIC_ROLL,
  ITEM_LINK_TRIGGER_HEAL_ROLL,
  ITEM_LINK_TRIGGER_ORDER,
  ITEM_LINK_DEFAULT_USAGE_TRIGGERS
};
