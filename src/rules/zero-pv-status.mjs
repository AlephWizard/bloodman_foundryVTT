import { bmLog } from "../core/logger.mjs";
import {
  PLAYER_ZERO_PV_STATUS_CANDIDATES,
  actorHasStatusInFamily,
  buildStatusFamilyIds,
  getBleedingStatusEffect,
  getDeadStatusEffect,
  getNpcDeadStatusFamilyIds,
  removeTokenStatusOverrides,
  setTokenStatusEffect,
  tokenHasStatusInFamily
} from "./status-effect-sync.mjs";

function defaultGetProperty(source, path) {
  return globalThis.foundry?.utils?.getProperty?.(source, path);
}

function defaultGetGame() {
  return globalThis.game;
}

export function createZeroPvStatusController({
  logger = bmLog,
  getProperty = defaultGetProperty,
  getGame = defaultGetGame,
  getTokenDocumentsForActor = () => [],
  setActorStatePresetActive = async () => false,
  resolveStatePresetSelection = () => ({ ids: [] }),
  applyTransparentTokenEffectBackground = () => {},
  playerZeroPvStatePresetId = "body-injured"
} = {}) {
  function getTokenActorType(tokenDoc) {
    const actorType = tokenDoc?.actor?.type;
    if (actorType) return actorType;
    const game = getGame();
    const worldActorType = tokenDoc?.actorId ? game?.actors?.get?.(tokenDoc.actorId)?.type : "";
    return worldActorType || "";
  }

  function isPvBarAttribute(attribute) {
    if (!attribute) return false;
    return /(^|\.)resources\.pv(\.|$)/.test(String(attribute));
  }

  function getTokenBarPvValue(tokenDoc) {
    const bar1Value = Number(getProperty(tokenDoc, "bar1.value"));
    const bar1Attr = getProperty(tokenDoc, "bar1.attribute");
    if (Number.isFinite(bar1Value) && isPvBarAttribute(bar1Attr)) return bar1Value;
    const bar2Value = Number(getProperty(tokenDoc, "bar2.value"));
    const bar2Attr = getProperty(tokenDoc, "bar2.attribute");
    if (Number.isFinite(bar2Value) && isPvBarAttribute(bar2Attr)) return bar2Value;
    return NaN;
  }

  function getTokenCurrentPv(tokenDoc) {
    const deltaCurrent = Number(getProperty(tokenDoc, "delta.system.resources.pv.current"));
    const actorDataCurrent = Number(getProperty(tokenDoc, "actorData.system.resources.pv.current"));
    const actorCurrent = Number(tokenDoc?.actor?.system?.resources?.pv?.current);
    const barCurrent = getTokenBarPvValue(tokenDoc);
    const isLinked = tokenDoc?.actorLink === true;
    if (isLinked) {
      if (Number.isFinite(actorCurrent)) return actorCurrent;
      if (Number.isFinite(deltaCurrent)) return deltaCurrent;
      if (Number.isFinite(actorDataCurrent)) return actorDataCurrent;
    } else {
      if (Number.isFinite(deltaCurrent)) return deltaCurrent;
      if (Number.isFinite(actorDataCurrent)) return actorDataCurrent;
      if (Number.isFinite(barCurrent)) return barCurrent;
      if (Number.isFinite(actorCurrent)) return actorCurrent;
    }
    if (Number.isFinite(barCurrent)) return barCurrent;
    const game = getGame();
    const worldActorCurrent = Number(game?.actors?.get?.(tokenDoc?.actorId)?.system?.resources?.pv?.current);
    return worldActorCurrent;
  }

  function getTokenPvFromUpdate(tokenDoc, changes) {
    const deltaCurrent = getProperty(changes, "delta.system.resources.pv.current");
    if (deltaCurrent != null) return Number(deltaCurrent);
    const actorDataCurrent = getProperty(changes, "actorData.system.resources.pv.current");
    if (actorDataCurrent != null) return Number(actorDataCurrent);
    const legacyCurrent = getProperty(changes, "system.resources.pv.current");
    if (legacyCurrent != null) return Number(legacyCurrent);
    const bar1Value = getProperty(changes, "bar1.value");
    const bar1Attr = getProperty(tokenDoc, "bar1.attribute");
    if (bar1Value != null && isPvBarAttribute(bar1Attr)) return Number(bar1Value);
    const bar2Value = getProperty(changes, "bar2.value");
    const bar2Attr = getProperty(tokenDoc, "bar2.attribute");
    if (bar2Value != null && isPvBarAttribute(bar2Attr)) return Number(bar2Value);
    return null;
  }

  async function syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent) {
    if (!tokenDoc) return;
    if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;

    const isZeroOrLess = Number(pvCurrent) <= 0;
    await syncZeroPvBodyStateForToken(tokenDoc, actorType, isZeroOrLess);
    const bleeding = getBleedingStatusEffect();
    const dead = getDeadStatusEffect();

    const bleedingFamily = buildStatusFamilyIds(bleeding, PLAYER_ZERO_PV_STATUS_CANDIDATES);
    const deadFamily = getNpcDeadStatusFamilyIds(dead);

    if (tokenDoc.actorLink === true) {
      await removeTokenStatusOverrides(tokenDoc, [...bleedingFamily, ...deadFamily]);
    }

    if (actorType === "personnage") {
      if (bleeding) {
        const okBleed = await setTokenStatusEffect(tokenDoc, bleeding, isZeroOrLess, bleedingFamily);
        if (!okBleed) logger.warn("[bloodman] status:bleeding sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
      }
      if (dead) {
        const okDeadClear = await setTokenStatusEffect(tokenDoc, dead, false, deadFamily);
        if (!okDeadClear) logger.warn("[bloodman] status:dead clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
      }
    } else {
      if (dead) {
        const okDead = await setTokenStatusEffect(tokenDoc, dead, isZeroOrLess, deadFamily);
        if (!okDead) logger.warn("[bloodman] status:dead sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
      }
      if (bleeding) {
        const okBleedClear = await setTokenStatusEffect(tokenDoc, bleeding, false, bleedingFamily);
        if (!okBleedClear) logger.warn("[bloodman] status:bleeding clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
      }
    }

    if (typeof tokenDoc?.object?.drawEffects === "function") {
      tokenDoc.object.drawEffects();
      applyTransparentTokenEffectBackground(tokenDoc.object);
    }
  }

  async function syncNpcDeadStatusToZeroPvForToken(tokenDoc, actorType = "") {
    if (!tokenDoc) return false;
    const resolvedActorType = String(actorType || getTokenActorType(tokenDoc) || "").trim();
    if (resolvedActorType !== "personnage-non-joueur") return false;

    const deadFamily = getNpcDeadStatusFamilyIds();
    if (!deadFamily.length || !tokenHasStatusInFamily(tokenDoc, deadFamily)) return false;
    const pvCurrent = getTokenCurrentPv(tokenDoc);
    if (!Number.isFinite(pvCurrent) || pvCurrent <= 0) return false;

    try {
      if (tokenDoc.actorLink === true) {
        const game = getGame();
        const actor = tokenDoc.actor || (tokenDoc.actorId ? game?.actors?.get?.(tokenDoc.actorId) : null);
        if (!actor?.update) return false;
        await actor.update({ "system.resources.pv.current": 0 });
      } else {
        await tokenDoc.update({ "delta.system.resources.pv.current": 0 });
      }
    } catch (error) {
      logger.warn("[bloodman] npc dead status HP sync failed", {
        tokenId: tokenDoc.id,
        actorType: resolvedActorType,
        error
      });
      return false;
    }

    await syncZeroPvStatusForToken(tokenDoc, resolvedActorType, 0);
    return true;
  }

  async function syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc) {
    const game = getGame();
    if (!game?.user?.isGM || !effectDoc) return false;
    const actor = effectDoc.parent && String(effectDoc.parent.documentName || "") === "Actor"
      ? effectDoc.parent
      : null;
    if (!actor || actor.type !== "personnage-non-joueur") return false;

    if (actor.isToken) {
      const tokenDoc = actor.token || actor.parent || null;
      if (!tokenDoc) return false;
      return syncNpcDeadStatusToZeroPvForToken(tokenDoc, actor.type);
    }

    const deadFamily = getNpcDeadStatusFamilyIds();
    if (!deadFamily.length || !actorHasStatusInFamily(actor, deadFamily)) return false;
    const pvCurrent = Number(actor.system?.resources?.pv?.current);
    if (!Number.isFinite(pvCurrent) || pvCurrent <= 0) return false;
    await actor.update({ "system.resources.pv.current": 0 });
    await syncZeroPvStatusForActor(actor);
    return true;
  }

  async function syncZeroPvStatusForActor(actor) {
    const actorType = actor?.type || "";
    if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;
    const pvCurrent = Number(actor.system?.resources?.pv?.current);
    if (!Number.isFinite(pvCurrent)) return;
    for (const tokenDoc of getTokenDocumentsForActor(actor)) {
      if (!tokenDoc?.actorLink) continue;
      await syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent);
    }
  }

  async function syncInjuredStateStatusForActor(actor, active) {
    const actorType = actor?.type || "";
    if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return false;
    const bleeding = getBleedingStatusEffect();
    const dead = getDeadStatusEffect();
    const primaryEffect = actorType === "personnage" ? bleeding : dead;
    const secondaryEffect = actorType === "personnage" ? dead : bleeding;
    if (!primaryEffect) return false;
    const bleedingFamily = buildStatusFamilyIds(bleeding, PLAYER_ZERO_PV_STATUS_CANDIDATES);
    const deadFamily = getNpcDeadStatusFamilyIds(dead);
    const primaryFamily = actorType === "personnage" ? bleedingFamily : deadFamily;
    const secondaryFamily = actorType === "personnage" ? deadFamily : bleedingFamily;
    const tokenDocs = actor.isToken
      ? [actor.token || actor.parent || null].filter(Boolean)
      : getTokenDocumentsForActor(actor);
    let changed = false;
    const targetDocs = tokenDocs.length ? tokenDocs : [{ actor, actorLink: true, id: actor.id }];

    for (const tokenDoc of targetDocs) {
      const okPrimary = await setTokenStatusEffect(tokenDoc, primaryEffect, Boolean(active), primaryFamily);
      changed = changed || okPrimary;
      if (secondaryEffect) {
        const okSecondary = await setTokenStatusEffect(tokenDoc, secondaryEffect, false, secondaryFamily);
        changed = changed || okSecondary;
      }
      if (typeof tokenDoc?.object?.drawEffects === "function") {
        tokenDoc.object.drawEffects();
        applyTransparentTokenEffectBackground(tokenDoc.object);
      }
    }
    return changed;
  }

  function resolveInjuredStateActive(label) {
    return resolveStatePresetSelection(label).ids.includes(playerZeroPvStatePresetId);
  }

  async function syncZeroPvBodyStateForToken(tokenDoc, actorType, isZeroOrLess) {
    if (!tokenDoc) return;

    const game = getGame();
    const actor = tokenDoc.actorLink === true
      ? (tokenDoc.actor || (tokenDoc.actorId ? game?.actors?.get?.(tokenDoc.actorId) : null))
      : (tokenDoc.actor || null);
    if (!actor) return;

    await syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess);
  }

  async function syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess) {
    if (!actor) return;
    const resolvedActorType = String(actorType || actor.type || "").trim();
    if (resolvedActorType !== "personnage" && resolvedActorType !== "personnage-non-joueur") return;
    await setActorStatePresetActive(actor, playerZeroPvStatePresetId, isZeroOrLess);
  }

  return {
    getTokenActorType,
    isPvBarAttribute,
    getTokenBarPvValue,
    getTokenCurrentPv,
    getTokenPvFromUpdate,
    syncZeroPvStatusForToken,
    syncNpcDeadStatusToZeroPvForToken,
    syncNpcDeadStatusToZeroPvFromActiveEffect,
    syncZeroPvStatusForActor,
    syncInjuredStateStatusForActor,
    resolveInjuredStateActive,
    syncZeroPvBodyStateForToken,
    syncZeroPvBodyStateForActor
  };
}
