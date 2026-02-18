export function buildDamageCurrentHelpers({
  getProperty
} = {}) {
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : (object, path) => {
      if (!object || !path) return undefined;
      return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
    };

  function resolveDamageCurrent(tokenDoc, tokenActor, fallbackCurrent) {
    if (Number.isFinite(fallbackCurrent)) return fallbackCurrent;
    const tokenActorCurrent = Number(tokenActor?.system?.resources?.pv?.current);
    if (Number.isFinite(tokenActorCurrent)) return tokenActorCurrent;
    const tokenDeltaCurrent = Number(readProperty(tokenDoc, "delta.system.resources.pv.current"));
    if (Number.isFinite(tokenDeltaCurrent)) return tokenDeltaCurrent;
    return Number(readProperty(tokenDoc, "actorData.system.resources.pv.current"));
  }

  return {
    resolveDamageCurrent
  };
}
