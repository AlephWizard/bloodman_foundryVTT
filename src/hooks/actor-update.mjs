import {
  computeResourceCharacteristicEffectiveScores as defaultComputeResourceCharacteristicEffectiveScores,
  computeUpdateActorDerivedResourceUpdateData as defaultComputeUpdateActorDerivedResourceUpdateData
} from "../rules/derived-resources.mjs";

function isCharacterLikeActor(actor) {
  return actor?.type === "personnage" || actor?.type === "personnage-non-joueur";
}

function getChangePath(changes, path) {
  if (changes && Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  return foundry.utils.getProperty(changes, path);
}

function hasChangePath(changes, path) {
  return getChangePath(changes, path) != null;
}

export function buildActorUpdateHooks({
  characteristics,
  normalizeArchetypeBonusValue,
  normalizeCharacteristicKey,
  computeResourceCharacteristicEffectiveScores = defaultComputeResourceCharacteristicEffectiveScores,
  computeUpdateActorDerivedResourceUpdateData = defaultComputeUpdateActorDerivedResourceUpdateData,
  getItemBonusTotals,
  normalizeActorMoveGauge,
  setActorMoveGauge,
  getDerivedPvMax,
  syncZeroPvBodyStateForActor,
  syncZeroPvStatusForToken,
  syncZeroPvStatusForActor,
  syncInjuredStateStatusForActor,
  resolveInjuredStateActive,
  tokenTextureValidityCache,
  resolveWorldActorFromTokenDocument,
  syncSceneTokenImagesFromActorImage,
  syncPrototypeTokenImageFromActorImage,
  bmLog
} = {}) {
  async function handleUpdateActorDerivedResources(actor, changes, _options, userId) {
    if (!isCharacterLikeActor(actor)) return;
    const sourceUserId = String(userId || "");
    const currentUserId = String(game.user?.id || "");
    if (sourceUserId && currentUserId && sourceUserId !== currentUserId) return;
    if (!game.user.isGM && !actor.isOwner) return;
    if (hasChangePath(changes, "system.resources.move.value")) return;
    const hasCharBaseChange = characteristics.some(c => {
      return hasChangePath(changes, `system.characteristics.${c.key}.base`);
    });
    const hasNpcRoleChange = hasChangePath(changes, "system.npcRole");
    const hasArchetypeBonusChange = hasChangePath(changes, "system.profile.archetypeBonusValue")
      || hasChangePath(changes, "system.profile.archetypeBonusCharacteristic");
    if (!hasCharBaseChange && !hasNpcRoleChange && !hasArchetypeBonusChange) return;

    const itemBonuses = getItemBonusTotals(actor);
    const profile = actor.system?.profile || {};
    const archetypeBonusValue = normalizeArchetypeBonusValue(profile.archetypeBonusValue, 0);
    const archetypeBonusCharacteristic = normalizeCharacteristicKey(profile.archetypeBonusCharacteristic);
    const moveGauge = normalizeActorMoveGauge(actor, { itemBonuses, initializeWhenMissing: true });
    await setActorMoveGauge(actor, moveGauge.value, moveGauge.max);

    const { phyEffective, espEffective } = computeResourceCharacteristicEffectiveScores({
      phyBase: actor.system.characteristics?.PHY?.base,
      espBase: actor.system.characteristics?.ESP?.base,
      phyItemBonus: itemBonuses.PHY,
      espItemBonus: itemBonuses.ESP,
      archetypeBonusCharacteristic,
      archetypeBonusValue
    });
    const derivedPvMax = getDerivedPvMax(actor, phyEffective);
    const pvMaxChange = hasChangePath(changes, "system.resources.pv.max");
    const ppMaxChange = hasChangePath(changes, "system.resources.pp.max");
    const { updates: resourceUpdates } = computeUpdateActorDerivedResourceUpdateData({
      derivedPvMax,
      espEffective,
      storedPvBonus: actor.system.resources?.pv?.itemBonus,
      storedPpBonus: actor.system.resources?.pp?.itemBonus,
      currentPvMax: actor.system.resources?.pv?.max,
      currentPpMax: actor.system.resources?.pp?.max,
      currentPv: actor.system.resources?.pv?.current,
      currentPp: actor.system.resources?.pp?.current,
      pvMaxChange,
      ppMaxChange
    });
    if (Object.keys(resourceUpdates).length) await actor.update(resourceUpdates);
  }

  async function handleUpdateActorZeroPvSync(actor, changes) {
    if (!isCharacterLikeActor(actor)) return;
    if (!game.user.isGM) return;
    const hasPvChange = hasChangePath(changes, "system.resources.pv.current");
    if (!hasPvChange) return;
    const pvCurrent = Number(actor.system?.resources?.pv?.current);
    if (Number.isFinite(pvCurrent)) {
      await syncZeroPvBodyStateForActor(actor, actor.type, pvCurrent <= 0);
    }
    if (actor.isToken) {
      const tokenDoc = actor.token || actor.parent || null;
      if (tokenDoc && Number.isFinite(pvCurrent)) {
        await syncZeroPvStatusForToken(tokenDoc, actor.type, pvCurrent);
      }
      return;
    }
    await syncZeroPvStatusForActor(actor);
  }

  async function handleUpdateActorInjuredStateStatus(actor, changes) {
    if (!isCharacterLikeActor(actor)) return;
    if (!game.user.isGM) return;
    if (typeof syncInjuredStateStatusForActor !== "function") return;
    if (typeof resolveInjuredStateActive !== "function") return;
    const hasStateLabelChange = hasChangePath(changes, "system.modifiers.label");
    if (!hasStateLabelChange) return;
    const active = Boolean(resolveInjuredStateActive(actor.system?.modifiers?.label || ""));
    await syncInjuredStateStatusForActor(actor, active);
  }

  async function handleUpdateActorImageSync(actor, changes, options) {
    if (!isCharacterLikeActor(actor)) return;
    if (!game.user.isGM) return;
    if (options?.bloodmanSkipPrototypeImageSync) return;
    if (options?.bloodmanSkipSceneTokenImageSync) return;

    const hasActorImageChange = hasChangePath(changes, "img");
    if (!hasActorImageChange) return;

    if (actor.isToken) {
      const tokenDoc = actor.token || actor.parent || null;
      const nextTokenImage = String(actor.img || "").trim() || "icons/svg/mystery-man.svg";
      const previousTokenImage = String(options?.bloodmanPreviousActorImage || "").trim();
      const previousTokenPrototypeImage = String(options?.bloodmanPreviousPrototypeImage || "").trim();
      if (tokenDoc?.update) {
        await tokenDoc.update(
          { "texture.src": nextTokenImage },
          { bloodmanSkipActorImageSync: true }
        ).catch(() => null);
      }

      const worldActor = resolveWorldActorFromTokenDocument(tokenDoc);
      if (!worldActor) return;
      const previousActorImage = previousTokenImage || String(worldActor.img || "").trim();
      const previousPrototypeImage = previousTokenPrototypeImage
        || String(foundry.utils.getProperty(worldActor, "prototypeToken.texture.src") || "").trim();
      await worldActor.update(
        {
          img: nextTokenImage,
          "prototypeToken.texture.src": nextTokenImage
        },
        { bloodmanSkipPrototypeImageSync: true, bloodmanSkipSceneTokenImageSync: true }
      ).catch(() => null);
      await syncSceneTokenImagesFromActorImage(worldActor, { previousActorImage, previousPrototypeImage });
      return;
    }

    const actorImageSrc = String(actor.img || "").trim();
    if (actorImageSrc) tokenTextureValidityCache.delete(actorImageSrc);

    const previousActorImage = String(options?.bloodmanPreviousActorImage || "").trim();
    const previousPrototypeImage = String(
      options?.bloodmanPreviousPrototypeImage
      ?? foundry.utils.getProperty(actor, "prototypeToken.texture.src")
      ?? ""
    ).trim();
    const requestedPrototypeImage = String(getChangePath(changes, "prototypeToken.texture.src") ?? "").trim();
    if (
      requestedPrototypeImage
      && requestedPrototypeImage !== actorImageSrc
      && requestedPrototypeImage !== previousPrototypeImage
    ) {
      return;
    }

    await syncPrototypeTokenImageFromActorImage(actor);
    await syncSceneTokenImagesFromActorImage(actor, { previousActorImage, previousPrototypeImage });
  }

  async function runUpdateActorSubhandler(name, handler, actor, changes, options, userId) {
    try {
      await handler(actor, changes, options, userId);
    } catch (error) {
      bmLog.warn(`updateActor:${name} skipped`, {
        actorId: actor?.id,
        actorType: actor?.type,
        error
      });
    }
  }

  async function onUpdateActor(actor, changes, options, userId) {
    await runUpdateActorSubhandler("derived-resources", handleUpdateActorDerivedResources, actor, changes, options, userId);
    await runUpdateActorSubhandler("zero-pv-sync", handleUpdateActorZeroPvSync, actor, changes, options, userId);
    await runUpdateActorSubhandler("injured-state-status", handleUpdateActorInjuredStateStatus, actor, changes, options, userId);
    await runUpdateActorSubhandler("image-sync", handleUpdateActorImageSync, actor, changes, options, userId);
  }

  return {
    handleUpdateActorDerivedResources,
    handleUpdateActorZeroPvSync,
    handleUpdateActorInjuredStateStatus,
    handleUpdateActorImageSync,
    runUpdateActorSubhandler,
    onUpdateActor
  };
}
