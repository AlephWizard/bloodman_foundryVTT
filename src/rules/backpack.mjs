import { normalizeBooleanFlag } from "./boolean-flags.mjs";

const DEFAULT_SYSTEM_ID = "bloodman";
const BACKPACK_CARRY_COLUMN = "bag";
const BACKPACK_SUPPORTED_TYPES = new Set(["arme", "objet", "protection", "ration", "soin"]);

export const normalizeBackpackBoolean = normalizeBooleanFlag;

function readProperty(source, path, fallback = undefined) {
  if (!source || !path) return fallback;
  const foundryGet = globalThis.foundry?.utils?.getProperty;
  if (typeof foundryGet === "function") {
    const value = foundryGet(source, path);
    return value === undefined ? fallback : value;
  }
  const segments = String(path).split(".").filter(Boolean);
  let cursor = source;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== "object") return fallback;
    cursor = cursor[segment];
  }
  return cursor === undefined ? fallback : cursor;
}

function getItemFlag(item, systemId, key) {
  if (typeof item?.getFlag === "function") {
    const value = item.getFlag(systemId, key);
    if (value !== undefined) return value;
  }
  return readProperty(item, `flags.${systemId}.${key}`);
}

export function isBackpackSupportedItemType(itemType) {
  return BACKPACK_SUPPORTED_TYPES.has(String(itemType || "").trim().toLowerCase());
}

export function isItemPersistedInBackpack(item, { systemId = DEFAULT_SYSTEM_ID } = {}) {
  if (!item || !isBackpackSupportedItemType(item.type)) return false;
  const carryColumn = String(getItemFlag(item, systemId, "carryColumn") || "").trim().toLowerCase();
  if (carryColumn === BACKPACK_CARRY_COLUMN) return true;
  const legacyFlag = getItemFlag(item, systemId, "inBag");
  if (legacyFlag !== undefined) return normalizeBackpackBoolean(legacyFlag, false);
  return normalizeBackpackBoolean(readProperty(item, "system.inBag"), false);
}

export function actorHasPersistedBackpackItems(actor, options = {}) {
  const items = Array.isArray(options.items)
    ? options.items
    : Array.from(actor?.items || []);
  return items.some(item => isItemPersistedInBackpack(item, options));
}

function resolveLinkedBaseActor(actor) {
  if (!actor?.isToken || !actor?.token?.actorLink) return null;
  if (actor.baseActor) return actor.baseActor;
  const actorId = String(actor.token?.actorId || "").trim();
  return actorId ? globalThis.game?.actors?.get?.(actorId) || null : null;
}

export function resolveActorBackpackEnabled(actor, options = {}) {
  const rawEnabled = readProperty(actor, "system.equipment.bagSlotsEnabled", false);
  const enabled = normalizeBackpackBoolean(rawEnabled, false);
  if (enabled) return { enabled: true, source: "actor" };
  const baseActor = resolveLinkedBaseActor(actor);
  if (baseActor) {
    const rawBaseEnabled = readProperty(baseActor, "system.equipment.bagSlotsEnabled", false);
    if (normalizeBackpackBoolean(rawBaseEnabled, false)) {
      return { enabled: true, source: "base-actor" };
    }
  }
  if (actorHasPersistedBackpackItems(actor, options)) {
    return { enabled: true, source: "item-flags" };
  }
  return { enabled: false, source: "actor" };
}
