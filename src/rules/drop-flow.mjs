function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultRoundCurrencyValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) <= 0.000001) return whole;
  return rounded;
}

export function createDropFlowRules({
  toFiniteNumber,
  roundCurrencyValue
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const roundCurrency = typeof roundCurrencyValue === "function"
    ? roundCurrencyValue
    : defaultRoundCurrencyValue;

  function resolveDropPermissionNotificationKey(permissionState = null) {
    return permissionState?.reason === "role"
      ? "BLOODMAN.Notifications.DropBlockedForPlayerRole"
      : "BLOODMAN.Notifications.DropRequiresLimitedPermission";
  }

  function isDropDecisionClosed(selectedAction) {
    return String(selectedAction || "fermer") === "fermer";
  }

  function isDropDecisionBuy(selectedAction) {
    return String(selectedAction || "") === "achat";
  }

  function resolveDropPurchaseState({ purchase = null, currentCurrency = 0, epsilon = 0.000001 } = {}) {
    const totalCost = roundCurrency(toFinite(purchase?.totalCost, 0));
    const normalizedCurrentCurrency = roundCurrency(Math.max(0, toFinite(currentCurrency, 0)));
    if (Boolean(purchase?.hasInvalidPrice)) {
      return {
        ok: false,
        reason: "invalid-price",
        totalCost,
        currentCurrency: normalizedCurrentCurrency,
        nextCurrency: normalizedCurrentCurrency,
        shouldDeduct: false
      };
    }
    if ((normalizedCurrentCurrency + Math.max(0, toFinite(epsilon, 0.000001))) < totalCost) {
      return {
        ok: false,
        reason: "insufficient-funds",
        totalCost,
        currentCurrency: normalizedCurrentCurrency,
        nextCurrency: normalizedCurrentCurrency,
        shouldDeduct: false
      };
    }
    const shouldDeduct = totalCost > 0;
    const nextCurrency = shouldDeduct
      ? roundCurrency(normalizedCurrentCurrency - totalCost)
      : normalizedCurrentCurrency;
    return {
      ok: true,
      reason: "",
      totalCost,
      currentCurrency: normalizedCurrentCurrency,
      nextCurrency,
      shouldDeduct
    };
  }

  function shouldUseActorTransferPath(dropEntries = [], actorTransferEntries = []) {
    return Array.isArray(actorTransferEntries)
      && actorTransferEntries.length > 0
      && actorTransferEntries.length === (Array.isArray(dropEntries) ? dropEntries.length : 0);
  }

  function isCarriedItemsLimitExceeded({
    currentCarriedCount = 0,
    incomingCarriedCount = 0,
    carriedItemsLimit = 0
  } = {}) {
    const current = Math.max(0, Math.floor(toFinite(currentCarriedCount, 0)));
    const incoming = Math.max(0, Math.floor(toFinite(incomingCarriedCount, 0)));
    const limit = Math.max(0, Math.floor(toFinite(carriedItemsLimit, 0)));
    if (incoming <= 0) return false;
    return (current + incoming) > limit;
  }

  return {
    resolveDropPermissionNotificationKey,
    isDropDecisionClosed,
    isDropDecisionBuy,
    resolveDropPurchaseState,
    shouldUseActorTransferPath,
    isCarriedItemsLimitExceeded
  };
}
