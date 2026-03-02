export function buildDamageRequestHooks({
  toFiniteNumber,
  wasDamageRequestProcessed,
  rememberDamageRequest,
  resolveDamageTokenDocument,
  resolveDamageActors,
  resolveDamageCurrent,
  resolveCombatTargetName,
  postDamageTakenChatMessage,
  emitDamageAppliedMessage,
  applyDamageToActor,
  safeWarn,
  t,
  bmLog
} = {}) {
  async function handleIncomingDamageRequest(data, source = "socket") {
    if (!data || !globalThis.game?.user?.isGM) return;
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    if (requestId && wasDamageRequestProcessed(requestId)) return;
    if (requestId) rememberDamageRequest(requestId);

    bmLog.debug("damage:recv", { source, ...data });

    const tokenDoc = await resolveDamageTokenDocument(data);
    const { tokenActor, uuidActor, worldActor } = await resolveDamageActors(tokenDoc, data);
    const share = Number(data.damage);
    if (!Number.isFinite(share) || share <= 0) return;
    const penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration ?? data.penetration_plus, 0)));
    const tokenIsLinked = data.targetActorLink === true || tokenDoc?.actorLink === true;
    const fallbackCurrent = Number(data.targetPvCurrent);
    const fallbackPA = Number(data.targetPA);
    const fallbackName = resolveCombatTargetName(
      data.targetName || tokenDoc?.name,
      tokenActor?.name || uuidActor?.name || worldActor?.name,
      "Cible"
    );

    if (tokenDoc && !tokenIsLinked) {
      const current = resolveDamageCurrent(tokenDoc, tokenActor, fallbackCurrent);
      if (!Number.isFinite(current)) return;
      const paInitial = Number.isFinite(fallbackPA) ? fallbackPA : 0;
      const paEffective = Math.max(0, paInitial - penetration);
      const finalDamage = Math.max(0, share - paEffective);
      const nextValue = Math.max(0, current - finalDamage);
      bmLog.debug("damage:apply token-unlinked", { current, paInitial, paEffective, penetration, share, finalDamage, nextValue, tokenId: tokenDoc.id });
      try {
        await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
      } catch (error) {
        bmLog.error("damage:update tokenDoc failed", { error });
      }
      await postDamageTakenChatMessage({
        name: fallbackName,
        amount: finalDamage,
        pa: paEffective,
        speakerAlias: fallbackName
      });
      const result = {
        finalDamage,
        penetration,
        paInitial,
        paEffective,
        hpBefore: current,
        hpAfter: nextValue
      };
      emitDamageAppliedMessage(data, result, tokenDoc, share);
      bmLog.debug("damage:output", {
        degats_selectionnes: String(data.degats || data.damageLabel || data.damageFormula || "").toUpperCase(),
        jet_de: Array.isArray(data.rollResults) ? data.rollResults : [],
        bonus_brut: Math.max(0, Math.floor(toFiniteNumber(data.bonus_brut ?? data.bonusBrut, 0))),
        penetration,
        armure_initiale: paInitial,
        armure_effective: paEffective,
        degats_totaux: finalDamage,
        points_de_vie_avant: current,
        points_de_vie_apres: nextValue,
        icones_a_afficher: nextValue <= 0 ? [(tokenActor?.type === "personnage-non-joueur" ? "mort" : "sang")] : [],
        erreur: null
      });
      return;
    }

    if (tokenActor) {
      bmLog.debug("damage:apply token-actor", { share, actorId: tokenActor.id, actorName: tokenActor.name });
      const result = await applyDamageToActor(tokenActor, share, { targetName: fallbackName, penetration });
      if (result) {
        emitDamageAppliedMessage(data, result, tokenDoc, share);
        bmLog.debug("damage:output", {
          degats_selectionnes: String(data.degats || data.damageLabel || data.damageFormula || "").toUpperCase(),
          jet_de: Array.isArray(data.rollResults) ? data.rollResults : [],
          bonus_brut: Math.max(0, Math.floor(toFiniteNumber(data.bonus_brut ?? data.bonusBrut, 0))),
          penetration: result.penetration,
          armure_initiale: result.paInitial,
          armure_effective: result.paEffective,
          degats_totaux: result.finalDamage,
          points_de_vie_avant: result.hpBefore,
          points_de_vie_apres: result.hpAfter,
          icones_a_afficher: result.hpAfter <= 0 ? [(tokenActor.type === "personnage-non-joueur" ? "mort" : "sang")] : [],
          erreur: null
        });
      }
      return;
    }
    if (uuidActor) {
      bmLog.debug("damage:apply uuid-actor", { share, actorId: uuidActor.id, actorName: uuidActor.name });
      const result = await applyDamageToActor(uuidActor, share, { targetName: fallbackName, penetration });
      if (result) emitDamageAppliedMessage(data, result, tokenDoc, share);
      return;
    }
    if (worldActor) {
      bmLog.debug("damage:apply world-actor", { share, actorId: worldActor.id, actorName: worldActor.name });
      const result = await applyDamageToActor(worldActor, share, { targetName: fallbackName, penetration });
      if (result) emitDamageAppliedMessage(data, result, tokenDoc, share);
      return;
    }
    if (Number.isFinite(fallbackCurrent)) {
      const paInitial = Number.isFinite(fallbackPA) ? fallbackPA : 0;
      const paEffective = Math.max(0, paInitial - penetration);
      const finalDamage = Math.max(0, share - paEffective);
      await postDamageTakenChatMessage({
        name: fallbackName,
        amount: finalDamage,
        pa: paEffective,
        speakerAlias: fallbackName
      });
      return;
    }
    safeWarn(t("BLOODMAN.Notifications.DamageTargetResolveFailed"));
  }

  return {
    handleIncomingDamageRequest
  };
}
