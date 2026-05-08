function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, Math.floor(Number(fallback) || 0));
  return Math.max(0, Math.floor(numeric));
}

export function shouldRunStartupNormalization({
  storedVersion = 0,
  targetVersion = 0
} = {}) {
  return toNonNegativeInteger(storedVersion, 0) < toNonNegativeInteger(targetVersion, 0);
}

export function createStartupNormalizationRunner({
  targetVersion = 0,
  readStoredVersion,
  writeStoredVersion,
  runNormalizationPass,
  logger
} = {}) {
  const normalizedTargetVersion = toNonNegativeInteger(targetVersion, 0);
  const resolveStoredVersion = typeof readStoredVersion === "function"
    ? readStoredVersion
    : () => 0;
  const persistStoredVersion = typeof writeStoredVersion === "function"
    ? writeStoredVersion
    : async () => false;
  const runPass = typeof runNormalizationPass === "function"
    ? runNormalizationPass
    : async () => {};
  const log = logger && typeof logger === "object" ? logger : null;

  function getStoredVersion() {
    return toNonNegativeInteger(resolveStoredVersion(), 0);
  }

  async function markCompleted() {
    return Boolean(await persistStoredVersion(normalizedTargetVersion));
  }

  async function runIfNeeded() {
    const storedVersion = getStoredVersion();
    const shouldRun = shouldRunStartupNormalization({
      storedVersion,
      targetVersion: normalizedTargetVersion
    });
    if (!shouldRun) {
      return {
        ran: false,
        completed: false,
        storedVersion,
        targetVersion: normalizedTargetVersion,
        reason: "up-to-date"
      };
    }

    await runPass();
    const completed = await markCompleted();
    if (!completed && typeof log?.warn === "function") {
      log.warn("startup normalization completion marker could not be persisted", {
        storedVersion,
        targetVersion: normalizedTargetVersion
      });
    }
    return {
      ran: true,
      completed,
      storedVersion,
      targetVersion: normalizedTargetVersion,
      reason: completed ? "completed" : "completed-not-persisted"
    };
  }

  return {
    getStoredVersion,
    markCompleted,
    runIfNeeded
  };
}
