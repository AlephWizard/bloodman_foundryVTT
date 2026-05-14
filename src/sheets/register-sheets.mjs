import {
  NPC_ACTOR_TYPE,
  PLAYER_ACTOR_TYPE,
  SYSTEM_ID,
  SYSTEM_ITEM_TYPES
} from "../core/constants.mjs";

export function registerSystemDocumentSheets({
  actorSheetClass,
  npcSheetClass,
  itemSheetClass,
  actorsCollection,
  itemsCollection,
  baseActorSheet,
  baseItemSheet,
  logger = null
} = {}) {
  if (!actorSheetClass || !npcSheetClass || !itemSheetClass) {
    logger?.error?.("sheet registration skipped (missing sheet classes)");
    return false;
  }
  if (!actorsCollection || typeof actorsCollection.registerSheet !== "function") {
    logger?.error?.("actor sheet registration skipped (Actors collection unavailable)");
    return false;
  }
  if (!itemsCollection || typeof itemsCollection.registerSheet !== "function") {
    logger?.error?.("item sheet registration skipped (Items collection unavailable)");
    return false;
  }

  if (typeof actorsCollection.unregisterSheet === "function" && baseActorSheet) {
    actorsCollection.unregisterSheet("core", baseActorSheet);
  }
  actorsCollection.registerSheet(SYSTEM_ID, actorSheetClass, {
    types: [PLAYER_ACTOR_TYPE],
    makeDefault: true
  });
  actorsCollection.registerSheet(SYSTEM_ID, npcSheetClass, {
    types: [NPC_ACTOR_TYPE],
    makeDefault: true
  });

  if (typeof itemsCollection.unregisterSheet === "function" && baseItemSheet) {
    itemsCollection.unregisterSheet("core", baseItemSheet);
  }
  itemsCollection.registerSheet(SYSTEM_ID, itemSheetClass, {
    types: [...SYSTEM_ITEM_TYPES],
    makeDefault: true
  });
  return true;
}
