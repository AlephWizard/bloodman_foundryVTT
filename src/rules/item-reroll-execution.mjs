function defaultNormalizeRerollTarget(target) {
  return target && typeof target === "object" ? target : {};
}

export function createItemRerollExecutionRules({
  normalizeRerollTarget,
  normalizeRerollTargets,
  resolveDamageTokenDocument,
  toBooleanFlag,
  getActorById,
  getProtectionPA,
  getTokenCurrentPv,
  estimateRerollHpBefore,
  validateNumericEquality,
  getTokenActorType,
  syncZeroPvStatusForToken,
  resolveCombatTargetName,
  applyDamageToActor,
  buildLocalTokenRerollResult,
  postDamageTakenChatMessage,
  computeExpectedHpAfter,
  logDamageRerollValidation,
  buildItemDamageRerollPayload,
  hasSocket,
  socketEmit,
  systemSocket,
  getActiveGMUserIds,
  enableChatTransportFallback,
  createChatMessage,
  rerollRequestChatMarkup,
  logDebug,
  createRequestId
} = {}) {
  const normalizeTarget = typeof normalizeRerollTarget === "function"
    ? normalizeRerollTarget
    : defaultNormalizeRerollTarget;
  const normalizeTargets = typeof normalizeRerollTargets === "function"
    ? normalizeRerollTargets
    : targets => (Array.isArray(targets) ? targets : []);
  const resolveTokenDocument = typeof resolveDamageTokenDocument === "function"
    ? resolveDamageTokenDocument
    : async () => null;
  const toBool = typeof toBooleanFlag === "function"
    ? toBooleanFlag
    : value => Boolean(value);
  const resolveActorById = typeof getActorById === "function"
    ? getActorById
    : () => null;
  const getPa = typeof getProtectionPA === "function"
    ? getProtectionPA
    : () => 0;
  const getTokenPv = typeof getTokenCurrentPv === "function"
    ? getTokenCurrentPv
    : () => Number.NaN;
  const estimateHpBefore = typeof estimateRerollHpBefore === "function"
    ? estimateRerollHpBefore
    : () => Number.NaN;
  const validateEqual = typeof validateNumericEquality === "function"
    ? validateNumericEquality
    : (a, b) => Number(a) === Number(b);
  const getActorType = typeof getTokenActorType === "function"
    ? getTokenActorType
    : () => "";
  const syncZeroPv = typeof syncZeroPvStatusForToken === "function"
    ? syncZeroPvStatusForToken
    : async () => {};
  const resolveTargetName = typeof resolveCombatTargetName === "function"
    ? resolveCombatTargetName
    : (tokenName, actorName, fallback = "Cible") => tokenName || actorName || fallback;
  const applyActorDamage = typeof applyDamageToActor === "function"
    ? applyDamageToActor
    : async () => null;
  const buildLocalResult = typeof buildLocalTokenRerollResult === "function"
    ? buildLocalTokenRerollResult
    : () => null;
  const postDamageMessage = typeof postDamageTakenChatMessage === "function"
    ? postDamageTakenChatMessage
    : async () => {};
  const computeExpectedHp = typeof computeExpectedHpAfter === "function"
    ? computeExpectedHpAfter
    : () => Number.NaN;
  const logValidation = typeof logDamageRerollValidation === "function"
    ? logDamageRerollValidation
    : () => {};
  const buildPayload = typeof buildItemDamageRerollPayload === "function"
    ? buildItemDamageRerollPayload
    : payload => payload;
  const hasSocketTransport = typeof hasSocket === "function"
    ? hasSocket
    : () => false;
  const emitSocket = typeof socketEmit === "function"
    ? socketEmit
    : () => {};
  const resolveGMIds = typeof getActiveGMUserIds === "function"
    ? getActiveGMUserIds
    : () => [];
  const shouldUseChatFallback = Boolean(enableChatTransportFallback);
  const createChat = typeof createChatMessage === "function"
    ? createChatMessage
    : async () => null;
  const rerollRequestMarkup = String(rerollRequestChatMarkup || "");
  const debugLog = typeof logDebug === "function"
    ? logDebug
    : () => {};
  const randomId = typeof createRequestId === "function"
    ? createRequestId
    : () => Math.random().toString(36).slice(2);

  async function relayItemRerollToGMs({
    context = null,
    itemId = "",
    itemType = "",
    itemName = "",
    actorId = "",
    attackerUserId = "",
    totalDamage = 0,
    rollResults = [],
    allocations = []
  } = {}) {
    const requestId = randomId();
    const socketTargets = normalizeTargets(allocations, { includeAliases: true });
    const rerollPayload = buildPayload({
      requestId,
      attackerUserId,
      attackerId: actorId,
      context,
      itemId,
      itemType,
      itemName,
      totalDamage,
      rollResults,
      targets: socketTargets
    });

    if (hasSocketTransport()) emitSocket(systemSocket, rerollPayload);
    const gmIds = resolveGMIds();
    if (shouldUseChatFallback && gmIds.length) {
      await createChat({
        content: rerollRequestMarkup,
        whisper: gmIds,
        flags: { bloodman: { rerollDamageRequest: rerollPayload } }
      }).catch(() => null);
    }

    debugLog("reroll:send", {
      requestId,
      attackerUserId: attackerUserId || "",
      attackerId: context?.attackerId || actorId || "",
      rollId: context?.rollId,
      itemId: context?.itemId || itemId || "",
      itemType: context?.itemType || itemType || "",
      totalDamage,
      penetration: context?.penetration,
      targets: socketTargets
    });

    return { requestId, socketTargets, rerollPayload };
  }

  async function applyLocalItemRerollTargets({
    allocations = [],
    penetrationValue = 0,
    validationMeta = {},
    defaultTargetName = "Cible"
  } = {}) {
    for (const rawTarget of allocations) {
      const target = normalizeTarget(rawTarget);
      const tokenDoc = await resolveTokenDocument(target);
      const tokenIsLinked = tokenDoc ? Boolean(tokenDoc.actorLink) : toBool(target.targetActorLink);
      const targetActor = tokenIsLinked
        ? (tokenDoc?.actor || (target.actorId ? resolveActorById(target.actorId) : null))
        : null;
      const referenceShare = Math.max(0, Math.floor(Number(target.baseShare ?? target.share ?? 0)));
      const linkedCurrentHp = tokenIsLinked && targetActor
        ? Number(targetActor.system?.resources?.pv?.current)
        : Number.NaN;
      const linkedPaInitial = tokenIsLinked && targetActor
        ? getPa(targetActor)
        : Number.NaN;
      const tokenCurrentHp = tokenDoc ? Number(getTokenPv(tokenDoc)) : Number.NaN;
      const tokenPaInitial = tokenDoc ? getPa(tokenDoc.actor || null) : Number.NaN;
      const hpBefore = estimateHpBefore({
        rawHpBefore: target?.hpBefore,
        referenceShare,
        penetration: penetrationValue,
        linkedCurrentHp,
        linkedPaInitial,
        tokenCurrentHp,
        tokenPaInitial
      });

      if (Number.isFinite(hpBefore)) {
        if (tokenIsLinked && targetActor) {
          await targetActor.update({ "system.resources.pv.current": hpBefore });
        } else if (tokenDoc) {
          await tokenDoc.update({ "delta.system.resources.pv.current": hpBefore });
        }
        if (tokenDoc) {
          const actorType = getActorType(tokenDoc);
          if (actorType) await syncZeroPv(tokenDoc, actorType, hpBefore);
        }
      }

      const restoredPv = tokenIsLinked && targetActor
        ? Number(targetActor.system?.resources?.pv?.current)
        : Number(getTokenPv(tokenDoc));
      const okRestored = Number.isFinite(hpBefore)
        ? validateEqual(restoredPv, hpBefore)
        : false;

      const share = Math.max(0, Math.floor(Number(target.share || 0)));
      if (!share) {
        logValidation("local-target-zero-share", {
          ...validationMeta,
          targetName: target.targetName || tokenDoc?.name || defaultTargetName,
          share,
          hpBefore,
          restoredPv,
          okRestored,
          okReapplied: okRestored
        });
        continue;
      }

      const targetName = resolveTargetName(
        target.targetName || tokenDoc?.name,
        targetActor?.name,
        defaultTargetName
      );

      let result = null;
      if (tokenIsLinked && targetActor) {
        result = await applyActorDamage(targetActor, share, { targetName, penetration: penetrationValue });
      } else if (tokenDoc && Number.isFinite(hpBefore)) {
        result = buildLocalResult({
          hpBefore,
          share,
          penetration: penetrationValue,
          paInitial: tokenPaInitial
        });
        if (!result) continue;
        await tokenDoc.update({ "delta.system.resources.pv.current": result.hpAfter });
        await postDamageMessage({
          name: targetName,
          amount: result.finalDamage,
          pa: result.paEffective,
          speakerAlias: targetName
        });
      }

      const expectedHpAfter = computeExpectedHp({
        hpBefore,
        finalDamage: result?.finalDamage
      });
      const okReapplied = result
        ? validateEqual(result.hpAfter, expectedHpAfter)
        : false;
      logValidation("local-target", {
        ...validationMeta,
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

      if (result && tokenDoc) {
        const actorType = getActorType(tokenDoc);
        if (actorType && Number.isFinite(result.hpAfter)) {
          await syncZeroPv(tokenDoc, actorType, result.hpAfter);
        }
      }
    }
  }

  return {
    relayItemRerollToGMs,
    applyLocalItemRerollTargets
  };
}
