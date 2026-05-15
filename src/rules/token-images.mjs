export const DEFAULT_TOKEN_IMAGE = "icons/svg/mystery-man.svg";
export const ACTOR_TOKEN_IMAGE_UPDATE_PATHS = [
  "img",
  "prototypeToken.texture.src"
];
export const TOKEN_IMAGE_UPDATE_PATHS = [
  "texture.src"
];
export const TOKEN_TEXTURE_VALIDITY_CACHE = new Map();

const DEFAULT_IMAGE_ELEMENT_LOAD_TIMEOUT_MS = 5000;

function defaultGetProperty(source, path) {
  return globalThis.foundry?.utils?.getProperty?.(source, path);
}

function defaultExpandObject(source) {
  return globalThis.foundry?.utils?.expandObject?.(source) || source;
}

function defaultGetGame() {
  return globalThis.game;
}

function defaultGetCanvas() {
  return globalThis.canvas;
}

function defaultGetImageConstructor() {
  return globalThis.Image;
}

function defaultGetTextureLoader() {
  return globalThis.foundry?.canvas?.loadTexture ?? globalThis.loadTexture;
}

export function createTokenImageController({
  getProperty = defaultGetProperty,
  expandObject = defaultExpandObject,
  getGame = defaultGetGame,
  getCanvas = defaultGetCanvas,
  getImageConstructor = defaultGetImageConstructor,
  getTextureLoader = defaultGetTextureLoader,
  getTokenActorType = () => "",
  isCharacterLikeActorType = actorType => actorType === "personnage" || actorType === "personnage-non-joueur",
  getTokenDocumentsForActor = () => [],
  textureValidityCache = TOKEN_TEXTURE_VALIDITY_CACHE,
  imageLoadTimeoutMs = DEFAULT_IMAGE_ELEMENT_LOAD_TIMEOUT_MS,
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis)
} = {}) {
  function shouldResetTokenScale(scaleValue) {
    const numeric = Number(scaleValue);
    if (!Number.isFinite(numeric)) return true;
    return Math.abs(numeric) < 0.0001;
  }

  function shouldResetTokenOffset(offsetValue) {
    if (offsetValue == null) return false;
    const numeric = Number(offsetValue);
    if (!Number.isFinite(numeric)) return true;
    return Math.abs(numeric) > 0.0001;
  }

  function shouldResetTokenFit(fitValue) {
    return String(fitValue || "").trim().toLowerCase() !== "fill";
  }

  function isMissingTokenImage(src) {
    return !src || src === DEFAULT_TOKEN_IMAGE;
  }

  function canCheckImageElementSource(src) {
    const ImageConstructor = getImageConstructor();
    if (!src || String(src).startsWith("#")) return false;
    return typeof ImageConstructor === "function";
  }

  async function canLoadImageElementSource(src) {
    if (!canCheckImageElementSource(src)) return null;
    const ImageConstructor = getImageConstructor();
    if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") return null;
    return new Promise(resolve => {
      const image = new ImageConstructor();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeoutFn(timeoutId);
        image.onload = null;
        image.onerror = null;
        resolve(value);
      };
      const timeoutId = setTimeoutFn(() => finish(false), imageLoadTimeoutMs);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = src;
    });
  }

  async function canLoadTextureSource(src) {
    if (!src) return false;
    const key = String(src).trim();
    if (!key) return false;
    if (textureValidityCache.has(key)) return textureValidityCache.get(key);
    const imageElementResult = await canLoadImageElementSource(key);
    if (imageElementResult !== null) {
      textureValidityCache.set(key, imageElementResult);
      return imageElementResult;
    }
    const textureLoader = getTextureLoader();
    if (typeof textureLoader !== "function") {
      textureValidityCache.set(key, false);
      return false;
    }
    try {
      await textureLoader(key);
      textureValidityCache.set(key, true);
      return true;
    } catch (_error) {
      textureValidityCache.set(key, false);
      return false;
    }
  }

  async function needsTokenImageRepair(src) {
    if (isMissingTokenImage(src)) return true;
    return !(await canLoadTextureSource(src));
  }

  function getTokenActorImage(tokenDoc) {
    if (!tokenDoc) return "";
    const direct = tokenDoc.actor?.img;
    if (direct) return direct;
    const game = getGame();
    const byId = tokenDoc.actorId ? game?.actors?.get?.(tokenDoc.actorId)?.img : "";
    return byId || "";
  }

  function getSafeTokenTextureFallback(tokenDoc) {
    const actorImg = getTokenActorImage(tokenDoc);
    if (actorImg) return actorImg;
    return DEFAULT_TOKEN_IMAGE;
  }

  function getTokenTexturePresentationUpdates(tokenDoc) {
    if (!tokenDoc) return {};
    const actorType = getTokenActorType(tokenDoc);
    if (!isCharacterLikeActorType(actorType)) return {};
    const updates = {};
    const scaleX = getProperty(tokenDoc, "texture.scaleX");
    const scaleY = getProperty(tokenDoc, "texture.scaleY");
    const offsetX = getProperty(tokenDoc, "texture.offsetX");
    const offsetY = getProperty(tokenDoc, "texture.offsetY");
    const fit = getProperty(tokenDoc, "texture.fit");
    if (shouldResetTokenScale(scaleX)) updates["texture.scaleX"] = 1;
    if (shouldResetTokenScale(scaleY)) updates["texture.scaleY"] = 1;
    if (shouldResetTokenOffset(offsetX)) updates["texture.offsetX"] = 0;
    if (shouldResetTokenOffset(offsetY)) updates["texture.offsetY"] = 0;
    if (shouldResetTokenFit(fit)) updates["texture.fit"] = "fill";
    return updates;
  }

  function resolveTokenPlaceable(tokenLike) {
    if (!tokenLike) return null;
    if (tokenLike.mesh) return tokenLike;
    if (tokenLike.object?.mesh) return tokenLike.object;
    const tokenId = String(tokenLike.id || tokenLike._id || tokenLike.document?.id || "").trim();
    const canvas = getCanvas();
    if (!tokenId || !canvas?.tokens?.get) return null;
    const placeable = canvas.tokens.get(tokenId);
    return placeable?.mesh ? placeable : null;
  }

  async function repairTokenTextureSource(tokenLike) {
    const tokenDoc = tokenLike?.document || tokenLike;
    if (!tokenDoc) return false;
    const tokenObject = resolveTokenPlaceable(tokenLike);
    const game = getGame();
    const canPersistUpdate = Boolean(game?.user?.isGM && tokenDoc?.update);
    const canLocalUpdate = Boolean(tokenDoc?.updateSource);
    if (!canPersistUpdate && !canLocalUpdate) return false;
    const updates = getTokenTexturePresentationUpdates(tokenDoc);
    const currentSrc = String(getProperty(tokenDoc, "texture.src") || "");
    const shouldRepairSource = canPersistUpdate ? await needsTokenImageRepair(currentSrc) : false;
    if (!shouldRepairSource && !Object.keys(updates).length) return false;

    if (shouldRepairSource) {
      const actorSrc = getTokenActorImage(tokenDoc);
      const actorSrcValid = actorSrc ? await canLoadTextureSource(actorSrc) : false;
      const nextSrc = actorSrcValid ? actorSrc : DEFAULT_TOKEN_IMAGE;
      if (nextSrc && nextSrc !== currentSrc) updates["texture.src"] = nextSrc;
    }
    if (!Object.keys(updates).length) return false;
    try {
      if (canPersistUpdate) {
        await tokenDoc.update(updates);
      } else {
        tokenDoc.updateSource(expandObject(updates));
        tokenObject?.renderFlags?.set?.({ refreshMesh: true });
        tokenObject?.refresh?.();
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function syncPrototypeTokenImageFromActorImage(actor) {
    const game = getGame();
    if (!game?.user?.isGM) return false;
    if (!actor || !isCharacterLikeActorType(actor.type)) return false;
    if (actor.isToken) return false;

    const actorImg = String(actor.img || "").trim();
    const currentPrototypeSrc = String(getProperty(actor, "prototypeToken.texture.src") || "").trim();
    const nextPrototypeSrc = actorImg || DEFAULT_TOKEN_IMAGE;

    if (!nextPrototypeSrc || nextPrototypeSrc === currentPrototypeSrc) return false;
    try {
      await actor.update(
        {
          "prototypeToken.texture.src": nextPrototypeSrc
        },
        { bloodmanSkipPrototypeImageSync: true }
      );
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function syncSceneTokenImagesFromActorImage(actor, options = {}) {
    const game = getGame();
    if (!game?.user?.isGM) return 0;
    if (!actor || !isCharacterLikeActorType(actor.type)) return 0;
    if (actor.isToken) return 0;

    const previousActorImage = String(options.previousActorImage || "").trim();
    const previousPrototypeImage = String(options.previousPrototypeImage || "").trim();
    const previousSources = new Set([previousActorImage, previousPrototypeImage].filter(Boolean));

    const actorImg = String(actor.img || "").trim();
    const nextTokenSrc = actorImg || DEFAULT_TOKEN_IMAGE;
    if (!nextTokenSrc) return 0;

    let updatedCount = 0;
    for (const tokenDoc of getTokenDocumentsForActor(actor)) {
      if (!tokenDoc?.update) continue;
      const currentTokenSrc = String(
        getProperty(tokenDoc, "texture.src")
        || getProperty(tokenDoc, "img")
        || ""
      ).trim();
      const isMissing = isMissingTokenImage(currentTokenSrc);
      const isLinkedToken = tokenDoc.actorLink === true;
      const matchesPrevious = previousSources.has(currentTokenSrc);
      if (!isLinkedToken && !isMissing && !matchesPrevious) continue;
      if (currentTokenSrc === nextTokenSrc) continue;
      try {
        await tokenDoc.update(
          { "texture.src": nextTokenSrc },
          { bloodmanSkipActorImageSync: true }
        );
        updatedCount += 1;
      } catch (_error) {
        // Keep syncing other token instances.
      }
    }
    return updatedCount;
  }

  function resolveWorldActorFromTokenDocument(tokenDoc) {
    if (!tokenDoc) return null;
    const actorId = String(tokenDoc.actorId || "").trim();
    const game = getGame();
    if (actorId) return game?.actors?.get?.(actorId) || null;
    const actor = tokenDoc.actor || null;
    if (!actor || actor.isToken) return null;
    return actor;
  }

  async function syncActorAndPrototypeImageFromTokenImage(tokenDoc) {
    const game = getGame();
    if (!game?.user?.isGM) return false;
    const actor = resolveWorldActorFromTokenDocument(tokenDoc);
    if (!actor) return false;
    if (!isCharacterLikeActorType(actor.type)) return false;

    const tokenSrc = String(
      getProperty(tokenDoc, "texture.src")
      || getProperty(tokenDoc, "img")
      || ""
    ).trim();
    if (!tokenSrc) return false;

    const actorImg = String(actor.img || "").trim();
    const protoSrc = String(getProperty(actor, "prototypeToken.texture.src") || "").trim();
    const needsUpdate = actorImg !== tokenSrc || protoSrc !== tokenSrc;
    if (!needsUpdate) return false;

    try {
      await actor.update(
        {
          img: tokenSrc,
          "prototypeToken.texture.src": tokenSrc
        },
        { bloodmanSkipPrototypeImageSync: true, bloodmanSkipSceneTokenImageSync: true }
      );
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function getPrototypeTokenImageNormalizationUpdates(actor) {
    const updates = {};
    if (!actor?.prototypeToken) return updates;
    const actorType = String(actor.type || "").trim();
    if (!isCharacterLikeActorType(actorType)) return updates;
    const isCharacter = actorType === "personnage";
    const isNpc = actorType === "personnage-non-joueur";
    if (isCharacter && actor.prototypeToken.actorLink === false) {
      updates["prototypeToken.actorLink"] = true;
    }
    if (isNpc && actor.prototypeToken.actorLink !== false) {
      updates["prototypeToken.actorLink"] = false;
    }
    const protoScaleX = getProperty(actor.prototypeToken, "texture.scaleX");
    const protoScaleY = getProperty(actor.prototypeToken, "texture.scaleY");
    const protoOffsetX = getProperty(actor.prototypeToken, "texture.offsetX");
    const protoOffsetY = getProperty(actor.prototypeToken, "texture.offsetY");
    const protoFit = getProperty(actor.prototypeToken, "texture.fit");
    if (shouldResetTokenScale(protoScaleX)) updates["prototypeToken.texture.scaleX"] = 1;
    if (shouldResetTokenScale(protoScaleY)) updates["prototypeToken.texture.scaleY"] = 1;
    if (shouldResetTokenOffset(protoOffsetX)) updates["prototypeToken.texture.offsetX"] = 0;
    if (shouldResetTokenOffset(protoOffsetY)) updates["prototypeToken.texture.offsetY"] = 0;
    if (shouldResetTokenFit(protoFit)) updates["prototypeToken.texture.fit"] = "fill";
    const protoSrc = getProperty(actor.prototypeToken, "texture.src");
    if (await needsTokenImageRepair(protoSrc)) {
      const actorImgValid = actor.img ? await canLoadTextureSource(actor.img) : false;
      const nextProtoSrc = actorImgValid ? actor.img : DEFAULT_TOKEN_IMAGE;
      if (nextProtoSrc && nextProtoSrc !== protoSrc) updates["prototypeToken.texture.src"] = nextProtoSrc;
    }
    return updates;
  }

  return {
    shouldResetTokenScale,
    shouldResetTokenOffset,
    shouldResetTokenFit,
    isMissingTokenImage,
    canCheckImageElementSource,
    canLoadImageElementSource,
    canLoadTextureSource,
    needsTokenImageRepair,
    getTokenActorImage,
    getSafeTokenTextureFallback,
    getTokenTexturePresentationUpdates,
    resolveTokenPlaceable,
    repairTokenTextureSource,
    syncPrototypeTokenImageFromActorImage,
    syncSceneTokenImagesFromActorImage,
    resolveWorldActorFromTokenDocument,
    syncActorAndPrototypeImageFromTokenImage,
    getPrototypeTokenImageNormalizationUpdates
  };
}
