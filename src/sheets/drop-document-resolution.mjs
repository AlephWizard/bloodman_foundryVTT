const DEFAULT_DROP_DATA_CACHE_MAX = 300;
const DEFAULT_DROP_DATA_CACHE_TTL_MS = 3_000;

function defaultGetItemDocumentClass() {
  const ItemClass = globalThis.Item;
  return ItemClass?.implementation?.fromDropData ? ItemClass.implementation : ItemClass;
}

function defaultGetGame() {
  return globalThis.game;
}

function defaultFromUuid(uuid) {
  return globalThis.fromUuid?.(uuid);
}

export function createDropDocumentResolutionController({
  getItemDocumentClass = defaultGetItemDocumentClass,
  getGame = defaultGetGame,
  fromUuid = defaultFromUuid,
  now = () => Date.now(),
  cacheMax = DEFAULT_DROP_DATA_CACHE_MAX,
  cacheTtlMs = DEFAULT_DROP_DATA_CACHE_TTL_MS
} = {}) {
  const dropDataDocumentCacheByEntry = new WeakMap();
  const dropDataDocumentCacheByKey = new Map();

  function buildDropDataCacheKey(entry) {
    if (!entry || typeof entry !== "object") return "";
    const type = String(entry.type || "").trim().toLowerCase();
    const uuid = String(entry.uuid || entry.documentUuid || "").trim();
    const pack = String(entry.pack || "").trim();
    const id = String(entry.itemId || entry._id || entry.id || "").trim();
    const parentUuid = String(entry.parentUuid || entry.actorUuid || "").trim();
    if (!type && !uuid && !pack && !id && !parentUuid) return "";
    return `${type}|${uuid}|${pack}|${id}|${parentUuid}`;
  }

  function pruneDropDataCache() {
    if (dropDataDocumentCacheByKey.size <= cacheMax) return;
    const currentTime = now();
    for (const [key, cached] of dropDataDocumentCacheByKey.entries()) {
      if (!cached || cached.expiresAt <= currentTime) dropDataDocumentCacheByKey.delete(key);
      if (dropDataDocumentCacheByKey.size <= cacheMax) return;
    }
    const overflow = dropDataDocumentCacheByKey.size - cacheMax;
    if (overflow <= 0) return;
    for (const key of dropDataDocumentCacheByKey.keys()) {
      dropDataDocumentCacheByKey.delete(key);
      if (dropDataDocumentCacheByKey.size <= cacheMax) break;
    }
  }

  async function resolveDroppedItemFromActorDropData(entry) {
    const entryObject = entry && typeof entry === "object" ? entry : null;
    if (!entryObject) return null;
    const itemId = String(entryObject.itemId || entryObject._id || entryObject.id || "").trim();
    if (!itemId) return null;

    const uuid = String(entryObject.uuid || entryObject.documentUuid || "").trim();
    const actorUuid = String(
      entryObject.actorUuid
      || entryObject.parentUuid
      || (uuid.includes(".Item.") ? uuid.split(".Item.")[0] : "")
      || ""
    ).trim();
    if (actorUuid) {
      const resolvedActor = await Promise.resolve(fromUuid(actorUuid)).catch(() => null);
      const actor = resolvedActor?.documentName === "Actor"
        ? resolvedActor
        : (resolvedActor?.actor?.documentName === "Actor" ? resolvedActor.actor : null);
      const item = actor?.items?.get?.(itemId) || null;
      if (item) return item;
    }

    const actorId = String(entryObject.actorId || "").trim();
    if (actorId) {
      const game = getGame();
      const item = game?.actors?.get?.(actorId)?.items?.get?.(itemId) || null;
      if (item) return item;
    }
    return null;
  }

  function resolveDroppedItemFromDropDataCached(entry) {
    const itemDocumentClass = getItemDocumentClass();
    if (!itemDocumentClass?.fromDropData) return Promise.resolve(null);
    const entryObject = entry && typeof entry === "object" ? entry : null;

    if (entryObject) {
      const cachedByEntry = dropDataDocumentCacheByEntry.get(entryObject);
      if (cachedByEntry) return cachedByEntry;
    }

    const cacheKey = buildDropDataCacheKey(entryObject);
    if (cacheKey) {
      const currentTime = now();
      const cachedByKey = dropDataDocumentCacheByKey.get(cacheKey);
      if (cachedByKey && cachedByKey.expiresAt > currentTime) {
        if (entryObject) dropDataDocumentCacheByEntry.set(entryObject, cachedByKey.promise);
        return cachedByKey.promise;
      }
      if (cachedByKey && cachedByKey.expiresAt <= currentTime) dropDataDocumentCacheByKey.delete(cacheKey);
    }

    const promise = itemDocumentClass
      .fromDropData(entry)
      .catch(() => null)
      .then(item => item || resolveDroppedItemFromActorDropData(entryObject))
      .then(item => {
        if (!item && cacheKey) dropDataDocumentCacheByKey.delete(cacheKey);
        return item;
      });
    if (entryObject) dropDataDocumentCacheByEntry.set(entryObject, promise);
    if (cacheKey) {
      dropDataDocumentCacheByKey.set(cacheKey, {
        promise,
        expiresAt: now() + cacheTtlMs
      });
      pruneDropDataCache();
    }
    return promise;
  }

  function clearDropDataDocumentCache() {
    dropDataDocumentCacheByKey.clear();
  }

  return {
    buildDropDataCacheKey,
    pruneDropDataCache,
    resolveDroppedItemFromActorDropData,
    resolveDroppedItemFromDropDataCached,
    clearDropDataDocumentCache
  };
}
