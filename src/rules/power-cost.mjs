export const POWER_COST_INSUFFICIENT_MESSAGE = "Points de puissance insuffisants pour utiliser ce pouvoir.";
export const POWER_PP_CURRENT_PATH = "system.resources.pp.current";
export const POWER_COST_UPDATE_OPTIONS = Object.freeze({ bloodmanAllowVitalResourceUpdate: true });
export const POWER_COST_REQUEST_OPTIONS = Object.freeze({ allowVitalResourceUpdate: true });

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

export function resolvePowerCostUpdatePlan(actor, item) {
  if (!actor || !item) return { kind: "skip" };
  if (item.type !== "pouvoir") return { kind: "skip" };
  if (!item.system?.powerCostEnabled) return { kind: "skip" };

  const cost = Number(item.system?.powerCost);
  if (!Number.isFinite(cost) || cost <= 0) return { kind: "skip" };

  const current = Number(actor.system?.resources?.pp?.current || 0);
  if (current < cost) {
    return {
      kind: "insufficient-power",
      cost,
      current
    };
  }

  return {
    kind: "apply",
    cost,
    current,
    nextValue: Math.max(0, current - cost)
  };
}

export function buildPowerCostRules({
  requestActorSheetUpdate,
  notifyInsufficientPowerPoints,
  canDirectlyUpdateActor,
  deepClone,
  setProperty
} = {}) {
  const requestSheetUpdate = typeof requestActorSheetUpdate === "function"
    ? requestActorSheetUpdate
    : () => false;
  const notifyInsufficient = typeof notifyInsufficientPowerPoints === "function"
    ? notifyInsufficientPowerPoints
    : () => {};
  const canDirectlyUpdate = typeof canDirectlyUpdateActor === "function"
    ? canDirectlyUpdateActor
    : actor => Boolean(actor?.isOwner || globalThis.game?.user?.isGM);
  const cloneUpdateData = typeof deepClone === "function"
    ? deepClone
    : value => value;
  const assignProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;

  async function applyPowerCost(actor, item) {
    const plan = resolvePowerCostUpdatePlan(actor, item);
    if (plan.kind === "skip") return true;
    if (plan.kind === "insufficient-power") {
      notifyInsufficient(POWER_COST_INSUFFICIENT_MESSAGE, { actor, item, plan });
      return false;
    }

    const updateData = { [POWER_PP_CURRENT_PATH]: plan.nextValue };
    if (canDirectlyUpdate(actor)) {
      await actor.update(updateData, POWER_COST_UPDATE_OPTIONS);
      return true;
    }

    const sent = requestSheetUpdate(actor, updateData, POWER_COST_REQUEST_OPTIONS);
    if (!sent) return false;
    try {
      if (typeof actor?.updateSource === "function") {
        actor.updateSource(cloneUpdateData(updateData));
      } else {
        assignProperty(actor, POWER_PP_CURRENT_PATH, plan.nextValue);
      }
    } catch (_error) {
      // Non-fatal optimistic update.
    }
    return true;
  }

  return {
    applyPowerCost
  };
}
