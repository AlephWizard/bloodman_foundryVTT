import {
  createUpdateDataAccessors,
  planPreUpdateActorImagePropagation as defaultPlanPreUpdateActorImagePropagation,
  planStateModifierLabelUpdate as defaultPlanStateModifierLabelUpdate,
  planArchetypeProfilePreUpdate as defaultPlanArchetypeProfilePreUpdate,
  getArchetypeProfileNormalizationErrorNotificationKey as defaultGetArchetypeProfileNormalizationErrorNotificationKey,
  planPreUpdateActorDerivedVitalPatch as defaultPlanPreUpdateActorDerivedVitalPatch,
  VOYAGE_RESOURCE_PATHS,
  planPreUpdateVoyageResourcePatch as defaultPlanPreUpdateVoyageResourcePatch
} from "../rules/actor-updates.mjs";

function isCharacterLikeActor(actor) {
  return actor?.type === "personnage" || actor?.type === "personnage-non-joueur";
}

export function buildActorPreUpdateHooks({
  toFiniteNumber,
  isAssistantOrHigherRole,
  isBasicPlayerRole,
  planActorUpdateRestrictionByRole,
  applyActorUpdateRestrictionPlan,
  stripUpdatePaths,
  normalizeCharacteristicXpUpdates,
  normalizeActorAmmoUpdateData,
  normalizeActorEquipmentCurrencyUpdateData,
  buildInvalidCurrencyCurrentMessage,
  normalizeCharacteristicBaseUpdatesForRole,
  buildInvalidStatePresetMessage,
  buildStateModifierUpdateFromLabel,
  applyStateModifierUpdateToData,
  getItemBonusTotals,
  normalizeArchetypeBonusValue,
  normalizeCharacteristicKey,
  getDerivedPvMax,
  t,
  planPreUpdateActorImagePropagation = defaultPlanPreUpdateActorImagePropagation,
  planStateModifierLabelUpdate = defaultPlanStateModifierLabelUpdate,
  planArchetypeProfilePreUpdate = defaultPlanArchetypeProfilePreUpdate,
  getArchetypeProfileNormalizationErrorNotificationKey = defaultGetArchetypeProfileNormalizationErrorNotificationKey,
  planPreUpdateActorDerivedVitalPatch = defaultPlanPreUpdateActorDerivedVitalPatch,
  planPreUpdateVoyageResourcePatch = defaultPlanPreUpdateVoyageResourcePatch
} = {}) {
  function onPreUpdateActor(actor, updateData, options, userId) {
    if (!isCharacterLikeActor(actor)) return;
    const trackingOptions = options && typeof options === "object" ? options : null;

    normalizeCharacteristicXpUpdates(updateData, actor);
    const updaterRole = game.users?.get(userId)?.role ?? game.user?.role;
    const imageUpdatePlan = planPreUpdateActorImagePropagation({
      rawNextActorImage: foundry.utils.getProperty(updateData, "img"),
      updaterIsAssistantOrHigher: isAssistantOrHigherRole(updaterRole),
      actorImage: actor.img,
      actorPrototypeImage: foundry.utils.getProperty(actor, "prototypeToken.texture.src")
    });
    if (imageUpdatePlan.trackPreviousImages && trackingOptions) {
      trackingOptions.bloodmanPreviousActorImage = imageUpdatePlan.previousActorImage;
      trackingOptions.bloodmanPreviousPrototypeImage = imageUpdatePlan.previousPrototypeImage;
    }
    if (imageUpdatePlan.applyPrototypeAndTokenImages) {
      const nextActorImage = imageUpdatePlan.nextActorImage;
      foundry.utils.setProperty(updateData, "prototypeToken.texture.src", nextActorImage);
      foundry.utils.setProperty(updateData, "prototypeToken.img", nextActorImage);
      foundry.utils.setProperty(updateData, "token.img", nextActorImage);
    }

    const allowCharacteristicBase = Boolean(options?.bloodmanAllowCharacteristicBase);
    const allowVitalResourceUpdate = Boolean(options?.bloodmanAllowVitalResourceUpdate);
    const allowAmmoUpdate = Boolean(options?.bloodmanAllowAmmoUpdate);
    const restrictionPlan = planActorUpdateRestrictionByRole({
      updaterRole,
      allowCharacteristicBase,
      allowVitalResourceUpdate,
      allowAmmoUpdate,
      isBasicPlayerRole,
      isAssistantOrHigherRole
    });
    applyActorUpdateRestrictionPlan(updateData, restrictionPlan);

    normalizeActorAmmoUpdateData(actor, updateData);
    const currencyNormalization = normalizeActorEquipmentCurrencyUpdateData(actor, updateData);
    if (currencyNormalization.invalid) {
      ui.notifications?.error(currencyNormalization.message || buildInvalidCurrencyCurrentMessage());
      return false;
    }
    if (actor.type === "personnage") {
      normalizeCharacteristicBaseUpdatesForRole(updateData, updaterRole, actor);
    }

    const { getUpdatedNumber, getUpdatedRawValue, hasUpdatePath } = createUpdateDataAccessors({
      updateData,
      getProperty: foundry.utils.getProperty,
      toFiniteNumber
    });

    const stateLabelPath = "system.modifiers.label";
    const stateLabelUpdatePlan = planStateModifierLabelUpdate({
      hasStateLabelUpdate: hasUpdatePath(stateLabelPath),
      rawLabel: getUpdatedRawValue(stateLabelPath, actor.system?.modifiers?.label || ""),
      currentLabel: actor.system?.modifiers?.label || "",
      buildStateModifierUpdate: buildStateModifierUpdateFromLabel
    });
    if (stateLabelUpdatePlan.kind === "invalid") {
      ui.notifications?.error(buildInvalidStatePresetMessage(stateLabelUpdatePlan.invalidTokens));
      return false;
    }
    if (stateLabelUpdatePlan.kind === "apply") {
      applyStateModifierUpdateToData(updateData, stateLabelUpdatePlan.label, stateLabelUpdatePlan.totals);
    }

    const archetypeBonusValuePath = "system.profile.archetypeBonusValue";
    const archetypeBonusCharacteristicPath = "system.profile.archetypeBonusCharacteristic";
    const hasArchetypeBonusValueUpdate = hasUpdatePath(archetypeBonusValuePath);
    const hasArchetypeBonusCharacteristicUpdate = hasUpdatePath(archetypeBonusCharacteristicPath);
    const currentProfile = actor.system?.profile || {};
    const archetypeUpdatePlan = planArchetypeProfilePreUpdate({
      hasArchetypeBonusValueUpdate,
      hasArchetypeBonusCharacteristicUpdate,
      currentProfile,
      rawBonusValue: getUpdatedRawValue(archetypeBonusValuePath, currentProfile.archetypeBonusValue ?? 0),
      rawBonusCharacteristic: getUpdatedRawValue(
        archetypeBonusCharacteristicPath,
        currentProfile.archetypeBonusCharacteristic || ""
      ),
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey
    });
    if (archetypeUpdatePlan.kind === "invalid") {
      const notificationKey = getArchetypeProfileNormalizationErrorNotificationKey(
        archetypeUpdatePlan.errorCode
      );
      if (notificationKey) ui.notifications?.error(t(notificationKey));
      return false;
    }
    if (archetypeUpdatePlan.kind === "apply") {
      foundry.utils.setProperty(updateData, archetypeBonusValuePath, archetypeUpdatePlan.normalizedBonusValue);
      foundry.utils.setProperty(
        updateData,
        archetypeBonusCharacteristicPath,
        archetypeUpdatePlan.normalizedBonusCharacteristic
      );
    }

    const itemBonuses = getItemBonusTotals(actor);
    const storedPvBonus = getUpdatedNumber("system.resources.pv.itemBonus", actor.system.resources?.pv?.itemBonus || 0);
    const storedPpBonus = getUpdatedNumber("system.resources.pp.itemBonus", actor.system.resources?.pp?.itemBonus || 0);
    const archetypeBonusValue = normalizeArchetypeBonusValue(
      getUpdatedRawValue("system.profile.archetypeBonusValue", currentProfile.archetypeBonusValue ?? 0),
      currentProfile.archetypeBonusValue ?? 0
    );
    const archetypeBonusCharacteristic = normalizeCharacteristicKey(
      getUpdatedRawValue("system.profile.archetypeBonusCharacteristic", currentProfile.archetypeBonusCharacteristic || "")
    );

    const pvMaxPath = "system.resources.pv.max";
    const ppMaxPath = "system.resources.pp.max";
    const pvCurrentPath = "system.resources.pv.current";
    const ppCurrentPath = "system.resources.pp.current";
    const hasPvMaxUpdate = hasUpdatePath(pvMaxPath);
    const hasPpMaxUpdate = hasUpdatePath(ppMaxPath);
    const storedPvMax = getUpdatedNumber(pvMaxPath, actor.system.resources?.pv?.max);
    const storedPpMax = getUpdatedNumber(ppMaxPath, actor.system.resources?.pp?.max);
    const hasPvCurrentUpdate = hasUpdatePath(pvCurrentPath);
    const hasPpCurrentUpdate = hasUpdatePath(ppCurrentPath);
    const { normalizedVitalMaxValues, normalizedVitalCurrentValues } = planPreUpdateActorDerivedVitalPatch({
      phyBase: getUpdatedNumber("system.characteristics.PHY.base", actor.system.characteristics?.PHY?.base || 0),
      espBase: getUpdatedNumber("system.characteristics.ESP.base", actor.system.characteristics?.ESP?.base || 0),
      phyItemBonus: itemBonuses?.PHY,
      espItemBonus: itemBonuses?.ESP,
      archetypeBonusValue,
      archetypeBonusCharacteristic,
      storedPvBonus,
      storedPpBonus,
      roleOverride: foundry.utils.getProperty(updateData, "system.npcRole"),
      derivePvMax: (phyEffective, updateRoleOverride) => getDerivedPvMax(actor, phyEffective, updateRoleOverride),
      hasPvMaxUpdate,
      hasPpMaxUpdate,
      hasPvCurrentUpdate,
      hasPpCurrentUpdate,
      rawPvMax: getUpdatedRawValue(pvMaxPath, actor.system.resources?.pv?.max || 0),
      rawPpMax: getUpdatedRawValue(ppMaxPath, actor.system.resources?.pp?.max || 0),
      rawPvCurrent: getUpdatedRawValue(pvCurrentPath, actor.system.resources?.pv?.current || 0),
      rawPpCurrent: getUpdatedRawValue(ppCurrentPath, actor.system.resources?.pp?.current || 0),
      fallbackPvMax: actor.system.resources?.pv?.max || 0,
      fallbackPpMax: actor.system.resources?.pp?.max || 0,
      fallbackPvCurrent: actor.system.resources?.pv?.current || 0,
      fallbackPpCurrent: actor.system.resources?.pp?.current || 0,
      storedPvMax,
      storedPpMax
    });
    if (Object.prototype.hasOwnProperty.call(normalizedVitalMaxValues, "pvMax")) {
      foundry.utils.setProperty(updateData, pvMaxPath, normalizedVitalMaxValues.pvMax);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedVitalMaxValues, "ppMax")) {
      foundry.utils.setProperty(updateData, ppMaxPath, normalizedVitalMaxValues.ppMax);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedVitalCurrentValues, "pvCurrent")) {
      foundry.utils.setProperty(updateData, pvCurrentPath, normalizedVitalCurrentValues.pvCurrent);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedVitalCurrentValues, "ppCurrent")) {
      foundry.utils.setProperty(updateData, ppCurrentPath, normalizedVitalCurrentValues.ppCurrent);
    }

    const actorVoyageCurrent = actor.system?.resources?.voyage?.current;
    const actorVoyageTotal = actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max;
    const voyageUpdatePlan = planPreUpdateVoyageResourcePatch({
      actorType: actor.type,
      hasUpdatePath,
      getUpdatedNumber,
      actorVoyageCurrent,
      actorVoyageTotal
    });
    if (voyageUpdatePlan.kind === "apply") {
      foundry.utils.setProperty(updateData, VOYAGE_RESOURCE_PATHS.current, voyageUpdatePlan.normalizedCurrent);
      foundry.utils.setProperty(updateData, VOYAGE_RESOURCE_PATHS.total, voyageUpdatePlan.normalizedTotal);
      foundry.utils.setProperty(updateData, VOYAGE_RESOURCE_PATHS.max, voyageUpdatePlan.normalizedTotal);
    } else if (voyageUpdatePlan.kind === "remove") {
      const pathsToStrip = Array.isArray(voyageUpdatePlan.pathsToStrip) ? voyageUpdatePlan.pathsToStrip : [];
      if (pathsToStrip.length) stripUpdatePaths(updateData, pathsToStrip);
      updateData[VOYAGE_RESOURCE_PATHS.remove] = null;
    }
  }

  return {
    onPreUpdateActor
  };
}
