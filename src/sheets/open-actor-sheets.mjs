import { getSheetElementWrapper } from "./sheet-dom.mjs";
import {
  collectOpenApplications as collectDefaultOpenApplications,
  getApplicationDocumentActor as getDefaultApplicationDocumentActor
} from "../ui/open-applications.mjs";

function defaultGetGame() {
  return globalThis.game;
}

function defaultGetDocument() {
  return globalThis.document;
}

function defaultGetJQuery() {
  return globalThis.jQuery || globalThis.$;
}

export function createOpenActorSheetController({
  getGame = defaultGetGame,
  getDocument = defaultGetDocument,
  getJQuery = defaultGetJQuery,
  collectOpenApplications = collectDefaultOpenApplications,
  getApplicationDocumentActor = getDefaultApplicationDocumentActor,
  getSheetElementWrapperForApp = getSheetElementWrapper,
  carriedItemLimitBase = 0,
  carriedItemLimitWithBag = 0,
  characterActorTypes = ["personnage", "personnage-non-joueur"]
} = {}) {
  const actorTypeSet = new Set(characterActorTypes.map(type => String(type || "").trim()).filter(Boolean));
  const caches = {
    tokenDocsByActorId: new Map(),
    actorInstancesById: new Map(),
    ownedCharacterActorInstances: null
  };

  function isCharacterActor(actorDoc) {
    return actorTypeSet.has(String(actorDoc?.type || ""));
  }

  function getTokenDocumentsForActor(actor) {
    const actorId = actor?.id;
    if (!actorId) return [];
    const cachedDocs = caches.tokenDocsByActorId.get(actorId);
    if (Array.isArray(cachedDocs)) return cachedDocs;
    const game = getGame();
    const docs = [];
    for (const scene of game?.scenes || []) {
      for (const tokenDoc of scene.tokens || []) {
        if (tokenDoc.actorId === actorId) docs.push(tokenDoc);
      }
    }
    caches.tokenDocsByActorId.set(actorId, docs);
    return docs;
  }

  function getActorDocumentInstanceKey(actorDoc) {
    if (!actorDoc) return "";
    return String(actorDoc.uuid || `${actorDoc.id}:${actorDoc.parent?.uuid || actorDoc.parent?.id || "world"}`);
  }

  function getResolvedActorDocumentCaches() {
    return caches;
  }

  function clearResolvedActorDocumentCaches() {
    caches.tokenDocsByActorId.clear();
    caches.actorInstancesById.clear();
    caches.ownedCharacterActorInstances = null;
  }

  function getActorInstancesById(actorId) {
    const id = String(actorId || "");
    if (!id) return [];
    const cachedInstances = caches.actorInstancesById.get(id);
    if (Array.isArray(cachedInstances)) return cachedInstances;
    const game = getGame();
    const instances = [];
    const seen = new Set();
    const addInstance = actorDoc => {
      if (!actorDoc) return;
      const key = getActorDocumentInstanceKey(actorDoc);
      if (seen.has(key)) return;
      seen.add(key);
      instances.push(actorDoc);
    };

    addInstance(game?.actors?.get?.(id));
    for (const scene of game?.scenes || []) {
      for (const tokenDoc of scene.tokens || []) {
        if (String(tokenDoc.actorId || "") !== id) continue;
        addInstance(tokenDoc.actor || null);
      }
    }
    caches.actorInstancesById.set(id, instances);
    return instances;
  }

  function getOwnedCharacterActorInstances() {
    if (Array.isArray(caches.ownedCharacterActorInstances)) return caches.ownedCharacterActorInstances;
    const game = getGame();
    const instances = [];
    const seen = new Set();
    const addInstance = actorDoc => {
      if (!actorDoc || !actorDoc.isOwner) return;
      if (!isCharacterActor(actorDoc)) return;
      const key = getActorDocumentInstanceKey(actorDoc);
      if (seen.has(key)) return;
      seen.add(key);
      instances.push(actorDoc);
    };

    for (const actor of game?.actors || []) addInstance(actor);
    for (const scene of game?.scenes || []) {
      for (const tokenDoc of scene.tokens || []) addInstance(tokenDoc.actor || null);
    }
    caches.ownedCharacterActorInstances = instances;
    return instances;
  }

  function getOpenSheetActorInstances() {
    const instances = [];
    const seen = new Set();
    for (const app of collectOpenApplications()) {
      const actorDoc = getApplicationDocumentActor(app);
      if (!actorDoc || !isCharacterActor(actorDoc)) continue;
      const key = getActorDocumentInstanceKey(actorDoc);
      if (seen.has(key)) continue;
      seen.add(key);
      instances.push(actorDoc);
    }
    return instances;
  }

  function getActorSheetMatchKeys(actor) {
    if (!actor) return new Set();
    return new Set([
      String(actor.id || "").trim(),
      String(actor.uuid || "").trim(),
      String(actor.baseActor?.id || "").trim(),
      String(actor.token?.actorId || "").trim()
    ].filter(Boolean));
  }

  function getActorSheetDomMatchTokens(actor) {
    const tokens = new Set();
    for (const key of getActorSheetMatchKeys(actor)) {
      tokens.add(key);
      tokens.add(key.replace(/\./g, "-"));
    }
    return [...tokens].filter(Boolean);
  }

  function getOpenActorSheetApplicationsForActor(actor) {
    const targetKeys = getActorSheetMatchKeys(actor);
    const apps = [];
    if (!targetKeys.size) return apps;
    for (const app of collectOpenApplications()) {
      const appActor = getApplicationDocumentActor(app);
      if (!appActor) continue;
      const appKeys = getActorSheetMatchKeys(appActor);
      if (![...appKeys].some(key => targetKeys.has(key))) continue;
      apps.push(app);
    }
    return apps;
  }

  function patchBackpackControlsInRoot(root, enabled) {
    if (!root?.find) return false;
    root.find(".bag-slots-toggle[data-bag-slots='yes']").prop("checked", Boolean(enabled));
    root.find(".bag-slots-toggle[data-bag-slots='no']").prop("checked", !Boolean(enabled));
    root.find(".objects-bag-list").toggleClass("is-disabled", !Boolean(enabled));
    const limit = Boolean(enabled) ? carriedItemLimitWithBag : carriedItemLimitBase;
    const indicator = root.find(".carry-slots-indicator").first();
    if (indicator.length) {
      const current = String(indicator.text() || "").split("/")[0]?.trim() || "0";
      indicator.text(`${current} / ${limit}`);
    }
    return true;
  }

  function patchOpenActorSheetBackpackControls(app, enabled) {
    return patchBackpackControlsInRoot(getSheetElementWrapperForApp(app), enabled);
  }

  function patchActorSheetDomBackpackControls(actor, enabled) {
    const jq = getJQuery();
    const documentRef = getDocument();
    if (typeof jq !== "function" || !documentRef) return 0;
    const tokens = getActorSheetDomMatchTokens(actor);
    if (!tokens.length) return 0;
    let patched = 0;
    const selector = ".app.bloodman.actor, .application.bloodman.actor, [id^='bloodman-actor-'], [id^='bloodman-npc-']";
    for (const element of documentRef.querySelectorAll(selector)) {
      const id = String(element?.id || "");
      if (!tokens.some(token => id.includes(token))) continue;
      if (patchBackpackControlsInRoot(jq(element), enabled)) patched += 1;
    }
    return patched;
  }

  function renderOpenActorSheetsForActor(actor) {
    for (const app of getOpenActorSheetApplicationsForActor(actor) || []) {
      if (typeof app.render === "function") app.render(false);
    }
  }

  function updateOpenActorSheetsBackpackState(actor, enabled) {
    for (const app of getOpenActorSheetApplicationsForActor(actor) || []) {
      app._optimisticBagSlotsEnabled = Boolean(enabled);
      patchOpenActorSheetBackpackControls(app, enabled);
      if (typeof app.render === "function") app.render(false);
    }
    patchActorSheetDomBackpackControls(actor, enabled);
  }

  function resolveAttackerActorInstancesForDamageApplied(data) {
    const attackerId = String(data?.attackerId || data?.attaquant_id || "");
    let instances = getActorInstancesById(attackerId);
    if (instances.length) return instances;

    const itemId = String(data?.itemId || "");
    const candidates = [...getOwnedCharacterActorInstances(), ...getOpenSheetActorInstances()];
    const deduped = [];
    const seen = new Set();
    for (const actor of candidates) {
      const key = getActorDocumentInstanceKey(actor);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(actor);
    }
    if (!itemId) return deduped;
    const withItem = deduped.filter(actor => actor.items?.get(itemId));
    return withItem.length ? withItem : deduped;
  }

  return {
    getTokenDocumentsForActor,
    getActorDocumentInstanceKey,
    getResolvedActorDocumentCaches,
    clearResolvedActorDocumentCaches,
    getActorInstancesById,
    getOwnedCharacterActorInstances,
    getOpenSheetActorInstances,
    getActorSheetMatchKeys,
    getActorSheetDomMatchTokens,
    getOpenActorSheetApplicationsForActor,
    patchBackpackControlsInRoot,
    patchOpenActorSheetBackpackControls,
    patchActorSheetDomBackpackControls,
    renderOpenActorSheetsForActor,
    updateOpenActorSheetsBackpackState,
    resolveAttackerActorInstancesForDamageApplied
  };
}
