export const VOYAGE_XP_COST_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
export const VOYAGE_XP_SKIP_CREATE_OPTION = "bloodmanSkipVoyageXPCost";
export const VOYAGE_XP_COST_PATH = "system.xpVoyageCost";

function defaultNormalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : Number(fallback) || 0));
}

function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

export function createItemVoyageXpRules({
  normalizeNonNegativeInteger = defaultNormalizeNonNegativeInteger,
  isVoyageXPCostItemType = () => false,
  getProperty = defaultGetProperty,
  setProperty = (object, path, value) => {
    if (object && path) object[path] = value;
  },
  translate = key => key,
  warn = () => {},
  notifyError = () => {}
} = {}) {
  async function applyVoyageXPCostOnCreate(actor, item, options = null) {
    if (!actor || !item) return;
    if (Boolean(options?.[VOYAGE_XP_SKIP_CREATE_OPTION])) return;
    if (actor.type !== "personnage" || !isVoyageXPCostItemType(item.type)) return;

    const cost = normalizeNonNegativeInteger(item.system?.xpVoyageCost, 0);
    if (cost <= 0) return;

    const voyageTotal = normalizeNonNegativeInteger(
      actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max,
      0
    );
    const voyageCurrent = Math.min(
      normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0),
      voyageTotal
    );
    const nextVoyageCurrent = Math.max(0, voyageCurrent - cost);
    if (nextVoyageCurrent === voyageCurrent) return;

    await actor.update({
      "system.resources.voyage.current": nextVoyageCurrent,
      "system.resources.voyage.total": voyageTotal,
      "system.resources.voyage.max": voyageTotal
    });
  }

  function normalizeVoyageXpCostOnCreate(item, createData = {}, options = {}) {
    if (!isVoyageXPCostItemType(item?.type)) return undefined;

    const rawCost = getProperty(createData || {}, VOYAGE_XP_COST_PATH);
    const normalizedCost = normalizeNonNegativeInteger(
      rawCost === undefined ? item?.system?.xpVoyageCost : rawCost,
      0
    );
    item?.updateSource?.({ [VOYAGE_XP_COST_PATH]: normalizedCost });
    if (Boolean(options?.[VOYAGE_XP_SKIP_CREATE_OPTION])) return undefined;

    const actor = item?.actor || item?.parent;
    if (!actor || actor.type !== "personnage") return undefined;

    const availableVoyageXp = normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0);
    if (availableVoyageXp >= normalizedCost) return undefined;

    const type = String(item?.type || "").trim().toLowerCase();
    const typeFallbackLabel = type ? translate(`TYPES.Item.${type}`) : translate("BLOODMAN.Common.Name");
    const itemName = item?.name || typeFallbackLabel;
    warn("[bloodman] item acquisition blocked: not enough voyage XP", {
      actorId: actor.id,
      actorName: actor.name,
      itemType: type,
      item: itemName,
      required: normalizedCost,
      available: availableVoyageXp
    });
    notifyError(
      translate("BLOODMAN.Notifications.NotEnoughVoyageXPForAptitude", {
        aptitude: itemName,
        required: normalizedCost,
        available: availableVoyageXp
      })
    );
    return false;
  }

  function normalizeVoyageXpCostOnUpdate(item, updateData = {}) {
    if (!isVoyageXPCostItemType(item?.type)) return undefined;
    const rawUpdateCost = getProperty(updateData, VOYAGE_XP_COST_PATH);
    const hasCostUpdate = Object.prototype.hasOwnProperty.call(updateData || {}, VOYAGE_XP_COST_PATH)
      || rawUpdateCost !== undefined;
    if (!hasCostUpdate) return undefined;
    const nextCost = normalizeNonNegativeInteger(rawUpdateCost, item?.system?.xpVoyageCost ?? 0);
    setProperty(updateData, VOYAGE_XP_COST_PATH, nextCost);
    return nextCost;
  }

  return {
    applyVoyageXPCostOnCreate,
    normalizeVoyageXpCostOnCreate,
    normalizeVoyageXpCostOnUpdate
  };
}
