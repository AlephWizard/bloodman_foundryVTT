function toIterable(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === "function") return value;
  return [];
}

function defaultGetProperty(source, path) {
  if (!source || !path) return undefined;
  const segments = String(path).split(".").filter(Boolean);
  let cursor = source;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

export function buildStartupCombatantNameNormalization({
  getCombats,
  getCombatantDisplayName
} = {}) {
  const resolveCombats = typeof getCombats === "function"
    ? getCombats
    : () => globalThis.game?.combats || [];
  const resolveCombatantName = typeof getCombatantDisplayName === "function"
    ? getCombatantDisplayName
    : combatant => combatant?.name || "";

  return async function applyStartupCombatantNameNormalization() {
    for (const combat of toIterable(resolveCombats())) {
      for (const combatant of toIterable(combat?.combatants || [])) {
        const name = resolveCombatantName(combatant);
        if (!name || name === combatant?.name) continue;
        await combatant.update({ name });
      }
    }
  };
}

export function buildStartupSceneTokenNormalization({
  getScenes,
  getTokenActorType,
  playerActorType = "",
  npcActorType = "",
  isCharacterLikeActorType,
  getActorById,
  getProperty,
  needsTokenImageRepair,
  canLoadTextureSource,
  getTokenCurrentPv,
  syncZeroPvStatusForToken
} = {}) {
  const resolveScenes = typeof getScenes === "function"
    ? getScenes
    : () => globalThis.game?.scenes || [];
  const resolveTokenActorType = typeof getTokenActorType === "function"
    ? getTokenActorType
    : () => "";
  const isCharacterLike = typeof isCharacterLikeActorType === "function"
    ? isCharacterLikeActorType
    : () => false;
  const resolveActorById = typeof getActorById === "function"
    ? getActorById
    : actorId => globalThis.game?.actors?.get?.(actorId) || null;
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : (source, path) => {
      if (typeof globalThis.foundry?.utils?.getProperty === "function") {
        return globalThis.foundry.utils.getProperty(source, path);
      }
      return defaultGetProperty(source, path);
    };
  const mustRepairTokenImage = typeof needsTokenImageRepair === "function"
    ? needsTokenImageRepair
    : async () => false;
  const isTextureSourceLoadable = typeof canLoadTextureSource === "function"
    ? canLoadTextureSource
    : async () => true;
  const resolveTokenPv = typeof getTokenCurrentPv === "function"
    ? getTokenCurrentPv
    : () => Number.NaN;
  const syncZeroPvStatus = typeof syncZeroPvStatusForToken === "function"
    ? syncZeroPvStatusForToken
    : async () => {};

  return async function applyStartupSceneTokenNormalization() {
    for (const scene of toIterable(resolveScenes())) {
      for (const token of toIterable(scene?.tokens || [])) {
        const actorType = resolveTokenActorType(token);
        const tokenUpdates = {};
        if (actorType === playerActorType && !token?.actorLink) tokenUpdates.actorLink = true;
        if (actorType === npcActorType && token?.actorLink) tokenUpdates.actorLink = false;

        if (isCharacterLike(actorType)) {
          const tokenActor = token?.actor || resolveActorById(token?.actorId) || null;
          const tokenSrc = readProperty(token, "texture.src");
          if (await mustRepairTokenImage(tokenSrc)) {
            const actorImg = tokenActor?.img || "";
            const actorImgValid = actorImg ? await isTextureSourceLoadable(actorImg) : false;
            const nextTokenSrc = actorImgValid ? actorImg : "icons/svg/mystery-man.svg";
            if (nextTokenSrc && nextTokenSrc !== tokenSrc) tokenUpdates["texture.src"] = nextTokenSrc;
          }
          if (Object.keys(tokenUpdates).length) await token.update(tokenUpdates);
          const pvCurrent = resolveTokenPv(token);
          if (Number.isFinite(pvCurrent)) await syncZeroPvStatus(token, actorType, pvCurrent);
          continue;
        }
        if (Object.keys(tokenUpdates).length) await token.update(tokenUpdates);
      }
    }
  };
}

export function buildStartupNormalizationHooks({
  getActors,
  applyStartupActorNormalization,
  applyStartupActorItemNormalization,
  applyStartupCombatantNameNormalization,
  applyStartupSceneTokenNormalization,
  refreshBossSoloNpcPvMax
} = {}) {
  const resolveActors = typeof getActors === "function"
    ? getActors
    : () => globalThis.game?.actors || [];
  const normalizeActor = typeof applyStartupActorNormalization === "function"
    ? applyStartupActorNormalization
    : async () => {};
  const normalizeActorItems = typeof applyStartupActorItemNormalization === "function"
    ? applyStartupActorItemNormalization
    : async () => {};
  const normalizeCombatantNames = typeof applyStartupCombatantNameNormalization === "function"
    ? applyStartupCombatantNameNormalization
    : async () => {};
  const normalizeSceneTokens = typeof applyStartupSceneTokenNormalization === "function"
    ? applyStartupSceneTokenNormalization
    : async () => {};
  const refreshBossSoloPv = typeof refreshBossSoloNpcPvMax === "function"
    ? refreshBossSoloNpcPvMax
    : async () => {};

  async function runStartupNormalizationPass() {
    for (const actor of toIterable(resolveActors())) {
      await normalizeActor(actor);
      await normalizeActorItems(actor);
    }
    await normalizeCombatantNames();
    await normalizeSceneTokens();
    await refreshBossSoloPv();
  }

  return {
    runStartupNormalizationPass
  };
}
