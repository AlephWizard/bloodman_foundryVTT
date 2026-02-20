function isCharacterLikeActorType(actorType) {
  return actorType === "personnage" || actorType === "personnage-non-joueur";
}

export function buildTokenCombatHooks({
  bmLog,
  getTokenActorType,
  isMissingTokenImage,
  getSafeTokenTextureFallback,
  repairTokenTextureSource,
  applyTransparentTokenEffectBackground,
  refreshBossSoloNpcPvMax,
  getCombatantDisplayName,
  focusActiveCombatantToken,
  resetActiveCombatantMoveGauge,
  resetCombatMovementHistory,
  decrementActiveCombatantTokenHudCounters,
  resetCombatRuntimeKeys,
  isAssistantOrHigherRole,
  stripUpdatePaths,
  tokenImageUpdatePaths,
  getStartedActiveCombat,
  getCombatantForToken,
  normalizeActorMoveGauge,
  getTokenMoveDistanceInCells,
  tokenMoveLimitEpsilon,
  safeWarn,
  t,
  setActorMoveGauge,
  syncActorAndPrototypeImageFromTokenImage,
  syncCombatantNameForToken,
  getTokenPvFromUpdate,
  getTokenCurrentPv,
  syncZeroPvStatusForToken,
  syncNpcDeadStatusToZeroPvForToken
} = {}) {
  const syncNpcDeadStatusToZeroPv = typeof syncNpcDeadStatusToZeroPvForToken === "function"
    ? syncNpcDeadStatusToZeroPvForToken
    : async () => false;

  function runCombatLifecycleRefresh(combat) {
    focusActiveCombatantToken(combat);
    resetActiveCombatantMoveGauge(combat).catch(error => {
      bmLog.warn("[bloodman] move:gauge reset failed", error);
    });
    resetCombatMovementHistory(combat).catch(error => {
      bmLog.warn("[bloodman] combat move history reset failed", error);
    });
    decrementActiveCombatantTokenHudCounters(combat).catch(error => {
      bmLog.warn("[bloodman] token HUD turn counter update failed", error);
    });
  }

  function onPreCreateToken(doc) {
    const sourceUpdates = {};
    const actorType = getTokenActorType(doc);
    if (actorType === "personnage") sourceUpdates.actorLink = true;
    if (actorType === "personnage-non-joueur") sourceUpdates.actorLink = false;
    const tokenSrc = String(
      foundry.utils.getProperty(doc, "texture.src")
      || foundry.utils.getProperty(doc, "img")
      || ""
    ).trim();
    const actorImg = String(
      doc?.actor?.img
      || (doc?.actorId ? game.actors?.get(doc.actorId)?.img : "")
      || ""
    ).trim();
    const isCharacterTokenType = isCharacterLikeActorType(actorType);

    if (isCharacterTokenType && actorImg) {
      if (tokenSrc !== actorImg) {
        sourceUpdates["texture.src"] = actorImg;
        sourceUpdates.img = actorImg;
      }
    } else if (isMissingTokenImage(tokenSrc)) {
      const fallbackSrc = getSafeTokenTextureFallback(doc);
      if (fallbackSrc && fallbackSrc !== tokenSrc) {
        sourceUpdates["texture.src"] = fallbackSrc;
        sourceUpdates.img = fallbackSrc;
      }
    }
    if (Object.keys(sourceUpdates).length) doc.updateSource(sourceUpdates);
  }

  function onDrawToken(token) {
    void repairTokenTextureSource(token);
    applyTransparentTokenEffectBackground(token);
  }

  function onRefreshToken(token) {
    void repairTokenTextureSource(token);
    applyTransparentTokenEffectBackground(token);
  }

  async function onCreateToken(tokenDoc) {
    await repairTokenTextureSource(tokenDoc);
    if (!game.user.isGM) return;
    if (getTokenActorType(tokenDoc) !== "personnage") return;
    await refreshBossSoloNpcPvMax();
  }

  async function onDeleteToken(tokenDoc) {
    if (!game.user.isGM) return;
    if (getTokenActorType(tokenDoc) !== "personnage") return;
    await refreshBossSoloNpcPvMax();
  }

  function onPreCreateCombatant(combatant) {
    const name = getCombatantDisplayName(combatant);
    if (name && name !== combatant.name) {
      combatant.updateSource({ name });
    }
  }

  function onUpdateCombat(combat, changes) {
    if (!changes) return;
    if (changes.active === false) {
      resetCombatRuntimeKeys();
    }
    if (changes.round != null || changes.turn != null || changes.active != null) {
      runCombatLifecycleRefresh(combat);
    }
  }

  function onCombatTurnChange(combat) {
    runCombatLifecycleRefresh(combat);
  }

  function onCombatStart(combat) {
    runCombatLifecycleRefresh(combat);
  }

  function onDeleteCombat() {
    resetCombatRuntimeKeys();
  }

  function onPreUpdateToken(tokenDoc, changes, options, userId) {
    const updaterRole = game.users?.get(userId)?.role ?? game.user?.role;
    if (!isAssistantOrHigherRole(updaterRole)) {
      const blockedTokenImageUpdate = stripUpdatePaths(changes, tokenImageUpdatePaths);
      if (blockedTokenImageUpdate) {
        const hasRemainingChanges = Object.keys(foundry.utils.flattenObject(changes || {})).length > 0;
        if (!hasRemainingChanges) return false;
      }
    }

    if (options?.bloodmanIgnoreMoveLimit) return;
    const hasX = foundry.utils.getProperty(changes, "x") != null;
    const hasY = foundry.utils.getProperty(changes, "y") != null;
    if (!hasX && !hasY) return;

    const combat = getStartedActiveCombat();
    if (!combat) return;
    const combatant = getCombatantForToken(combat, tokenDoc);
    if (!combatant) return;

    const sourceUserId = String(userId || "");
    const currentUserId = String(game.user?.id || "");
    if (sourceUserId && currentUserId && sourceUserId !== currentUserId) return;

    const actorType = getTokenActorType(tokenDoc);
    if (!isCharacterLikeActorType(actorType)) return;
    const actor = tokenDoc?.actor || (tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) : null);
    if (!actor) return;

    const gauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
    const remaining = gauge.value;
    const movedCells = getTokenMoveDistanceInCells(tokenDoc, changes);
    if (!Number.isFinite(movedCells)) return;
    const moveCost = Math.max(0, Math.ceil(Math.max(0, movedCells) - tokenMoveLimitEpsilon));
    if (moveCost <= tokenMoveLimitEpsilon) return;
    if (moveCost > remaining + tokenMoveLimitEpsilon) {
      safeWarn(t("BLOODMAN.Notifications.MoveLimitExceeded", { max: remaining, attempted: moveCost }));
      return false;
    }

    options.bloodmanMoveCost = moveCost;
    options.bloodmanMoveCombatId = String(combat.id || "");
  }

  async function onUpdateToken(tokenDoc, changes, options, userId) {
    const hasTokenImageChange = foundry.utils.getProperty(changes, "texture.src") != null
      || foundry.utils.getProperty(changes, "img") != null;
    const sourceUserId = String(userId || "");
    const currentUserId = String(game.user?.id || "");
    const isSourceUser = sourceUserId ? sourceUserId === currentUserId : Boolean(game.user?.isGM);
    if (game.user?.isGM && hasTokenImageChange && !options?.bloodmanSkipActorImageSync) {
      await syncActorAndPrototypeImageFromTokenImage(tokenDoc);
    }
    const moveCost = Number(options?.bloodmanMoveCost);
    const startedCombat = getStartedActiveCombat();
    const isCombatMove = startedCombat
      && String(options?.bloodmanMoveCombatId || "") === String(startedCombat.id || "")
      && Boolean(getCombatantForToken(startedCombat, tokenDoc));
    if (isCombatMove && Number.isFinite(moveCost) && moveCost > tokenMoveLimitEpsilon && isSourceUser) {
      const actorType = getTokenActorType(tokenDoc);
      if (isCharacterLikeActorType(actorType)) {
        const actor = tokenDoc?.actor || (tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) : null);
        if (actor) {
          const gauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
          const nextValue = Math.max(0, gauge.value - moveCost);
          await setActorMoveGauge(actor, nextValue, gauge.max);
        }
      }
    }

    if (!game.user.isGM) return;
    if (foundry.utils.getProperty(changes, "name") != null) {
      await syncCombatantNameForToken(tokenDoc);
    }
    const actorType = getTokenActorType(tokenDoc);
    if (!isCharacterLikeActorType(actorType)) return;
    const hasStatusUpdate = Object.prototype.hasOwnProperty.call(changes || {}, "statuses")
      || foundry.utils.getProperty(changes, "statuses") != null;
    const pvFromUpdate = getTokenPvFromUpdate(tokenDoc, changes);
    if (pvFromUpdate != null) {
      const pvCurrent = Number.isFinite(pvFromUpdate) ? pvFromUpdate : getTokenCurrentPv(tokenDoc);
      if (Number.isFinite(pvCurrent)) {
        await syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent);
      }
    }
    if (actorType === "personnage-non-joueur" && hasStatusUpdate) {
      await syncNpcDeadStatusToZeroPv(tokenDoc, actorType);
    }
  }

  return {
    onPreCreateToken,
    onDrawToken,
    onRefreshToken,
    onCreateToken,
    onDeleteToken,
    onPreCreateCombatant,
    onUpdateCombat,
    onCombatTurnChange,
    onCombatStart,
    onDeleteCombat,
    onPreUpdateToken,
    onUpdateToken
  };
}
