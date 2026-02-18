export function validateNumericEquality(a, b) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Number(a) === Number(b);
}

export function createNumericValidationLogger({ debug, warn } = {}) {
  const logDebug = typeof debug === "function" ? debug : () => {};
  const logWarn = typeof warn === "function" ? warn : () => {};

  function logNumericValidation(scope, details = {}) {
    const payload = { scope, ...details };
    const allGood = Object.entries(payload)
      .filter(([key]) => key.startsWith("ok"))
      .every(([, value]) => value === true);
    if (allGood) {
      logDebug("reroll:validate", payload);
    } else {
      logWarn("reroll:validate", payload);
    }
  }

  return {
    logNumericValidation
  };
}
