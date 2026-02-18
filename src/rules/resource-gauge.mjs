function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function createResourceGaugeRules({ toFiniteNumber } = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;

  function resolveResourceGaugeState(currentValue, maxValue, options = {}) {
    const useUnitMaxWhenZero = options.useUnitMaxWhenZero === true;
    const current = Math.max(0, toFinite(currentValue, 0));
    const maxRaw = Math.max(0, toFinite(maxValue, 0));
    const denominator = maxRaw > 0 ? maxRaw : (useUnitMaxWhenZero ? 1 : 0);
    const ratio = denominator > 0 ? Math.max(0, Math.min(1, current / denominator)) : 0;
    const percent = Math.max(0, Math.min(100, ratio * 100));
    const stateClass = ratio <= 0
      ? "is-empty"
      : ratio <= 0.25
        ? "is-critical"
        : ratio <= 0.5
          ? "is-warning"
          : "is-healthy";
    return {
      ratio,
      fill: `${percent.toFixed(2)}%`,
      steps: Math.max(1, Math.round(maxRaw || 1)),
      stateClass
    };
  }

  function applyResourceGaugeState(resource, options = {}) {
    if (!resource || typeof resource !== "object") return;
    const gauge = resolveResourceGaugeState(resource.current, resource.max, options);
    resource.ratio = gauge.ratio.toFixed(4);
    resource.fill = gauge.fill;
    resource.steps = gauge.steps;
    resource.stateClass = gauge.stateClass;
  }

  return {
    resolveResourceGaugeState,
    applyResourceGaugeState
  };
}
