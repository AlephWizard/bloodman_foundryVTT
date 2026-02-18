export function buildDamageRerollHooks({
  toFiniteNumber,
  validateNumericEquality,
  resolveAttackerActorInstancesForDamageApplied,
  normalizeRerollTarget,
  getRerollTargetKey,
  isSameRerollTarget,
  getActorInstancesById,
  wasRerollRequestProcessed,
  rememberRerollRequest,
  isDamageRerollItemType,
  normalizeRerollTargets,
  resolveDamageTokenDocument,
  toBooleanFlag,
  getTokenCurrentPv,
  getProtectionPA,
  resolveCombatTargetName,
  applyDamageToActor,
  postDamageTakenChatMessage,
  getTokenActorType,
  syncZeroPvStatusForToken,
  logDamageRerollValidation,
  emitDamageAppliedMessage,
  bmLog
} = {}) {
  async function handleDamageAppliedMessage(data) {
    if (!data) return;
    const attackerUserId = String(data.attackerUserId || "");
    const localUserId = String(game.user?.id || "");
    if (attackerUserId && attackerUserId !== localUserId) return;
    const attackers = resolveAttackerActorInstancesForDamageApplied(data);
    if (!attackers.length) return;
    if (!attackerUserId && !attackers.some(actor => actor.isOwner)) return;
    const rollId = String(data.rollId || "");
    const itemId = String(data.itemId || "");
    const target = normalizeRerollTarget(data.target || {});
    const key = getRerollTargetKey(target);

    let context = attackers[0]?._lastDamageReroll;
    if (!context || context.rollId !== rollId) {
      context = {
        kind: String(data.kind || "item-damage"),
        rollId,
        itemId,
        itemType: String(data.itemType || ""),
        itemName: String(data.itemName || ""),
        attackerId: String(data.attackerId || data.attaquant_id || attackers[0]?.id || ""),
        attackerUserId: String(data.attackerUserId || ""),
        formula: String(data.damageFormula || "1d4"),
        degats: String(data.damageLabel || data.degats || "").trim().toUpperCase(),
        bonusBrut: Math.max(0, Math.floor(toFiniteNumber(data.bonusBrut ?? data.bonus_brut, 0))),
        rollKeepHighest: data.rollKeepHighest === true,
        penetration: Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0))),
        totalDamage: Number(data.totalDamage),
        targets: []
      };
    }
    if (!context.itemId) context.itemId = itemId;
    if (!context.itemType && data.itemType) context.itemType = String(data.itemType);
    if (!context.itemType && context.itemId) {
      for (const attacker of attackers) {
        const candidateType = attacker?.items?.get(context.itemId)?.type;
        if (candidateType) {
          context.itemType = String(candidateType);
          break;
        }
      }
    }
    context.itemType = String(context.itemType || "").toLowerCase();
    context.kind = String(context.kind || "item-damage");
    if (!context.itemName && data.itemName) context.itemName = String(data.itemName);
    if (!context.formula && data.damageFormula) context.formula = String(data.damageFormula);
    if (!context.degats && (data.damageLabel || data.degats)) context.degats = String(data.damageLabel || data.degats).trim().toUpperCase();
    if (!Number.isFinite(Number(context.bonusBrut)) && Number.isFinite(Number(data.bonusBrut ?? data.bonus_brut))) {
      context.bonusBrut = Math.max(0, Math.floor(toFiniteNumber(data.bonusBrut ?? data.bonus_brut, 0)));
    }
    if (typeof context.rollKeepHighest !== "boolean") {
      context.rollKeepHighest = data.rollKeepHighest === true;
    }
    if (!Number.isFinite(Number(context.penetration)) && Number.isFinite(Number(data.penetration))) {
      context.penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0)));
    }
    if (!Number.isFinite(Number(context.totalDamage)) && Number.isFinite(Number(data.totalDamage))) {
      context.totalDamage = Number(data.totalDamage);
    }

    const existing = context.targets.find(entry => isSameRerollTarget(entry, target));
    if (existing) {
      Object.assign(existing, target);
      if (!Number.isFinite(Number(existing.baseShare))) {
        existing.baseShare = Math.max(0, Math.floor(Number(existing.share || 0)));
      }
    } else if (key || target.actorId || target.tokenId || target.tokenUuid) {
      context.targets.push({
        ...target,
        baseShare: Math.max(0, Math.floor(Number(target.share || 0)))
      });
    }

    const itemRerollState = {
      itemId: context.itemId,
      rollId: context.rollId,
      at: Date.now(),
      damage: context
    };
    const actorInstances = [];
    const seen = new Set();
    for (const actor of attackers) {
      for (const instance of getActorInstancesById(actor.id)) {
        const keyRef = String(instance.uuid || `${instance.id}:${instance.parent?.uuid || instance.parent?.id || "world"}`);
        if (seen.has(keyRef)) continue;
        seen.add(keyRef);
        actorInstances.push(instance);
      }
    }
    if (!actorInstances.length) {
      for (const actor of attackers) {
        const keyRef = String(actor.uuid || `${actor.id}:${actor.parent?.uuid || actor.parent?.id || "world"}`);
        if (seen.has(keyRef)) continue;
        seen.add(keyRef);
        actorInstances.push(actor);
      }
    }
    for (const actorInstance of actorInstances) {
      actorInstance._lastDamageReroll = context;
      actorInstance._lastItemReroll = itemRerollState;
      if (actorInstance.sheet?.rendered) actorInstance.sheet.render(false);
    }
  }

  async function handleDamageRerollRequest(data) {
    if (!data || !game.user.isGM) return;
    const requestId = String(data.requestId || "");
    if (requestId && wasRerollRequestProcessed(requestId)) return;
    if (requestId) rememberRerollRequest(requestId);
    const kind = String(data.kind || "item-damage");
    if (kind !== "item-damage") return;
    let itemType = String(data.itemType || "").toLowerCase();
    if (!isDamageRerollItemType(itemType)) {
      const attacker = game.actors?.get(String(data.attackerId || ""));
      const item = attacker?.items?.get(String(data.itemId || ""));
      itemType = String(item?.type || itemType).toLowerCase();
    }
    if (!isDamageRerollItemType(itemType)) {
      bmLog.warn("reroll:ignored non-damage item", {
        rollId: data.rollId,
        itemId: data.itemId,
        itemType
      });
      return;
    }
    const targets = normalizeRerollTargets(data.targets);
    if (!targets.length) return;
    const penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0)));
    bmLog.debug("reroll:recv", {
      attackerUserId: data.attackerUserId,
      attackerId: data.attackerId,
      rollId: data.rollId,
      itemId: data.itemId,
      totalDamage: data.totalDamage,
      penetration,
      targetCount: targets.length
    });

    for (const target of targets) {
      const share = Math.max(0, Math.floor(Number(target.share || 0)));
      const tokenDoc = await resolveDamageTokenDocument(target);
      if (!tokenDoc) {
        bmLog.warn("reroll:target unresolved", {
          rollId: data.rollId,
          target
        });
      }
      const tokenIsLinked = tokenDoc ? Boolean(tokenDoc.actorLink) : toBooleanFlag(target.targetActorLink);
      const targetActor = tokenIsLinked
        ? (tokenDoc?.actor || (target.actorId ? game.actors?.get(target.actorId) : null))
        : null;
      const rawHpBefore = target?.hpBefore;
      let hpBefore = (rawHpBefore == null || rawHpBefore === "")
        ? Number.NaN
        : Number(rawHpBefore);
      if (!Number.isFinite(hpBefore)) {
        const referenceShare = Math.max(0, Math.floor(Number(target.baseShare ?? target.share ?? 0)));
        if (targetActor) {
          const currentHp = Number(targetActor.system?.resources?.pv?.current);
          if (Number.isFinite(currentHp)) {
            const paInitial = getProtectionPA(targetActor);
            const paEffective = Math.max(0, paInitial - penetration);
            const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
            hpBefore = currentHp + estimatedFinalDamage;
          }
        } else if (tokenDoc) {
          const currentHp = Number(getTokenCurrentPv(tokenDoc));
          if (Number.isFinite(currentHp)) {
            const paInitial = getProtectionPA(tokenDoc.actor || null);
            const paEffective = Math.max(0, paInitial - penetration);
            const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
            hpBefore = currentHp + estimatedFinalDamage;
          }
        }
      }
      if (Number.isFinite(hpBefore)) {
        if (tokenIsLinked && targetActor) {
          await targetActor.update({ "system.resources.pv.current": hpBefore });
        } else if (tokenDoc) {
          await tokenDoc.update({ "delta.system.resources.pv.current": hpBefore });
        }
        if (tokenDoc) {
          const actorType = getTokenActorType(tokenDoc);
          if (actorType) await syncZeroPvStatusForToken(tokenDoc, actorType, hpBefore);
        }
      }
      const restoredPv = tokenIsLinked && targetActor
        ? Number(targetActor.system?.resources?.pv?.current)
        : Number(getTokenCurrentPv(tokenDoc));
      const okRestored = Number.isFinite(hpBefore)
        ? validateNumericEquality(restoredPv, hpBefore)
        : false;

      const targetName = resolveCombatTargetName(
        target.targetName || tokenDoc?.name,
        targetActor?.name,
        "Cible"
      );
      let result = null;
      if (!share && Number.isFinite(hpBefore)) {
        result = {
          hpBefore,
          hpAfter: hpBefore,
          finalDamage: 0,
          penetration,
          paInitial: 0,
          paEffective: 0,
          pa: 0
        };
      } else if (tokenIsLinked && targetActor) {
        result = await applyDamageToActor(targetActor, share, { targetName, penetration });
      } else if (tokenDoc && Number.isFinite(hpBefore)) {
        const paInitial = getProtectionPA(tokenDoc.actor || null);
        const paEffective = Math.max(0, paInitial - penetration);
        const finalDamage = Math.max(0, share - paEffective);
        const nextValue = Math.max(0, hpBefore - finalDamage);
        await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
        await postDamageTakenChatMessage({
          name: targetName,
          amount: finalDamage,
          pa: paEffective,
          speakerAlias: targetName
        });
        result = {
          hpBefore,
          hpAfter: nextValue,
          finalDamage,
          penetration,
          paInitial,
          paEffective,
          pa: paEffective
        };
      }
      const expectedHpAfter = result
        ? Math.max(0, Number(hpBefore) - Math.max(0, Number(result.finalDamage || 0)))
        : Number.NaN;
      const okReapplied = result
        ? validateNumericEquality(result.hpAfter, expectedHpAfter)
        : false;
      logDamageRerollValidation("gm-socket-target", {
        rollId: data.rollId,
        itemId: data.itemId,
        itemType,
        targetName,
        share,
        hpBefore,
        restoredPv,
        okRestored,
        hpAfter: result?.hpAfter,
        expectedHpAfter,
        finalDamage: result?.finalDamage,
        okReapplied
      });

      if (result) {
        if (tokenDoc) {
          const actorType = getTokenActorType(tokenDoc);
          if (actorType && Number.isFinite(result.hpAfter)) {
            await syncZeroPvStatusForToken(tokenDoc, actorType, result.hpAfter);
          }
        }
        emitDamageAppliedMessage({ ...data, ...target }, result, tokenDoc, share);
      }
    }
  }

  return {
    handleDamageAppliedMessage,
    handleDamageRerollRequest
  };
}
