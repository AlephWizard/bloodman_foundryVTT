export function buildDamageAppliedMessageHelpers({
  hasSocket,
  socketEmit,
  systemSocket,
  toFiniteNumber,
  resolveCombatTargetName,
  bmLog
} = {}) {
  const canUseSocket = typeof hasSocket === "function"
    ? hasSocket
    : () => false;
  const emitSocketMessage = typeof socketEmit === "function"
    ? socketEmit
    : () => false;
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const resolveTargetName = typeof resolveCombatTargetName === "function"
    ? resolveCombatTargetName
    : (tokenName, actorName, fallback = "Cible") => tokenName || actorName || fallback;

  function emitDamageAppliedMessage(data, result, tokenDoc, share) {
    const attackerUserId = String(data?.attackerUserId || "");
    if (!canUseSocket() || !result) return;
    const tokenId = tokenDoc?.id || String(data?.tokenId || "");
    const tokenUuid = tokenDoc?.uuid || String(data?.tokenUuid || "");
    const sceneId = tokenDoc?.parent?.id || tokenDoc?.scene?.id || String(data?.sceneId || "");
    const actorId = tokenDoc?.actorId || String(data?.actorId || "");
    const targetActorLink = tokenDoc ? Boolean(tokenDoc.actorLink) : data?.targetActorLink === true;
    const targetName = resolveTargetName(
      tokenDoc?.name || data?.targetName,
      tokenDoc?.actor?.name,
      data?.targetName || tokenDoc?.name || ""
    );
    const emitted = emitSocketMessage(systemSocket, {
      type: "damageApplied",
      kind: String(data?.kind || "item-damage"),
      rerollUsed: Boolean(data?.rerollUsed),
      attackerUserId,
      attackerId: String(data?.attackerId || data?.attaquant_id || ""),
      rollId: String(data?.rollId || ""),
      itemId: String(data?.itemId || ""),
      itemName: String(data?.itemName || ""),
      itemType: String(data?.itemType || ""),
      damageFormula: String(data?.damageFormula || ""),
      damageLabel: String(data?.damageLabel || data?.degats || "").trim().toUpperCase(),
      bonusBrut: Math.max(0, Math.floor(parseFiniteNumber(data?.bonus_brut ?? data?.bonusBrut, 0))),
      rollKeepHighest: data?.rollKeepHighest === true,
      penetration: Math.max(0, Math.floor(parseFiniteNumber(data?.penetration ?? data?.penetration_plus, 0))),
      totalDamage: Number(data?.totalDamage),
      target: {
        tokenId,
        tokenUuid,
        sceneId,
        actorId,
        targetActorLink,
        targetName,
        share: Math.max(0, Math.floor(Number(share) || 0)),
        hpBefore: Number(result?.hpBefore),
        hpAfter: Number(result?.hpAfter),
        finalDamage: Number(result?.finalDamage)
      }
    });
    if (!emitted) bmLog?.warn?.("damage:socket emit skipped (damageApplied)");
  }

  return {
    emitDamageAppliedMessage
  };
}
