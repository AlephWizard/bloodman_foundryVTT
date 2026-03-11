import {
  getDamagePayloadField as sharedGetDamagePayloadField,
  toBooleanFlag as sharedToBooleanFlag
} from "./damage-payload-fields.mjs";

function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultNormalizeRollDieFormula(value, fallback = "d4") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (/^\d*d\d+$/.test(raw)) return raw.startsWith("d") ? `1${raw}` : raw;
  return fallback;
}

async function defaultEvaluateRoll(formula) {
  return new Roll(formula).evaluate();
}

export function buildDamageRerollUtils({
  getDamagePayloadField,
  toBooleanFlag,
  resolveCombatTargetName,
  getTokenCurrentPv,
  getCanvas,
  toFiniteNumber,
  normalizeRollDieFormula,
  evaluateRoll
} = {}) {
  const readPayloadField = typeof getDamagePayloadField === "function"
    ? getDamagePayloadField
    : sharedGetDamagePayloadField;
  const parseBooleanFlag = typeof toBooleanFlag === "function"
    ? toBooleanFlag
    : sharedToBooleanFlag;
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizeDieFormula = typeof normalizeRollDieFormula === "function"
    ? normalizeRollDieFormula
    : defaultNormalizeRollDieFormula;
  const runRoll = typeof evaluateRoll === "function"
    ? evaluateRoll
    : defaultEvaluateRoll;
  const resolveCanvas = typeof getCanvas === "function" ? getCanvas : () => globalThis.canvas;
  const resolveTargetName = typeof resolveCombatTargetName === "function"
    ? resolveCombatTargetName
    : (tokenName, actorName, fallback = "Cible") => tokenName || actorName || fallback;
  const readTokenCurrentPv = typeof getTokenCurrentPv === "function"
    ? getTokenCurrentPv
    : tokenDoc => Number(tokenDoc?.system?.resources?.pv?.current);

  function normalizeRerollTarget(target, { includeAliases = false } = {}) {
    const source = target && typeof target === "object" ? target : {};
    const tokenId = String(readPayloadField(source, ["tokenId", "tokenid", "token_id"]) || "");
    const tokenUuid = String(readPayloadField(source, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
    const sceneId = String(readPayloadField(source, ["sceneId", "sceneid", "scene_id"]) || "");
    const actorId = String(readPayloadField(source, ["actorId", "actorid", "actor_id"]) || "");
    const targetActorLink = parseBooleanFlag(
      readPayloadField(source, ["targetActorLink", "targetactorlink", "target_actor_link"])
    );

    const normalized = {
      ...source,
      tokenId,
      tokenUuid,
      sceneId,
      actorId,
      targetActorLink
    };

    if (includeAliases) {
      normalized.tokenid = tokenId;
      normalized.tokenuuid = tokenUuid;
      normalized.sceneid = sceneId;
      normalized.actorid = actorId;
      normalized.targetactorlink = targetActorLink;
    }

    return normalized;
  }

  function normalizeRerollTargets(targets, { includeAliases = false } = {}) {
    if (!Array.isArray(targets)) return [];
    return targets.map(target => normalizeRerollTarget(target, { includeAliases }));
  }

  function buildFallbackRerollTargets(selectedTargets, requestedTotal) {
    const selected = Array.isArray(selectedTargets) ? selectedTargets : [];
    if (!selected.length) return [];
    const total = Math.max(0, Math.floor(parseFiniteNumber(requestedTotal, 0)));
    const baseShare = selected.length > 0 ? Math.floor(total / selected.length) : 0;
    let remainder = Math.max(0, total - baseShare * selected.length);
    const sceneId = resolveCanvas()?.scene?.id || "";

    return selected.map(token => {
      const tokenDoc = token?.document || token;
      const bonus = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      return normalizeRerollTarget({
        tokenId: tokenDoc?.id || token?.id || "",
        tokenUuid: tokenDoc?.uuid || "",
        sceneId: tokenDoc?.parent?.id || tokenDoc?.scene?.id || sceneId,
        actorId: tokenDoc?.actorId || token?.actor?.id || "",
        targetActorLink: Boolean(tokenDoc?.actorLink),
        targetName: resolveTargetName(tokenDoc?.name || token?.name, token?.actor?.name, "Cible"),
        share: Math.max(0, baseShare + bonus),
        baseShare: Math.max(0, baseShare + bonus),
        hpBefore: Number(readTokenCurrentPv(tokenDoc)),
        hpAfter: Number.NaN,
        pending: true
      });
    }).filter(target => Number(target.share) > 0);
  }

  function getRerollTargetKey(target) {
    if (!target) return "";
    return String(
      readPayloadField(target, [
        "tokenUuid", "tokenuuid", "token_uuid",
        "tokenId", "tokenid", "token_id",
        "actorId", "actorid", "actor_id"
      ]) || ""
    );
  }

  function isSameRerollTarget(a, b) {
    if (!a || !b) return false;
    const keyA = getRerollTargetKey(a);
    const keyB = getRerollTargetKey(b);
    if (keyA && keyB) return keyA === keyB;
    const actorA = String(readPayloadField(a, ["actorId", "actorid", "actor_id"]) || "");
    const actorB = String(readPayloadField(b, ["actorId", "actorid", "actor_id"]) || "");
    if (actorA && actorB) return actorA === actorB;
    const tokenA = String(readPayloadField(a, ["tokenId", "tokenid", "token_id"]) || "");
    const tokenB = String(readPayloadField(b, ["tokenId", "tokenid", "token_id"]) || "");
    if (tokenA && tokenB) return tokenA === tokenB;
    const uuidA = String(readPayloadField(a, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
    const uuidB = String(readPayloadField(b, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
    return Boolean(uuidA && uuidB && uuidA === uuidB);
  }

  function isDamageRerollContextReady(context) {
    if (!context || !Array.isArray(context.targets) || context.targets.length === 0) return false;
    return context.targets.every(target => Number.isFinite(Number(target.hpBefore)));
  }

  function buildRerollAllocations(context, totalDamage) {
    const targets = Array.isArray(context?.targets) ? context.targets : [];
    if (targets.length === 0) return [];
    if (targets.length === 1) {
      const baseShare = Math.max(0, Math.floor(Number(targets[0]?.baseShare ?? targets[0]?.share ?? 0)));
      return [{ ...targets[0], baseShare, share: Math.max(0, Math.floor(Number(totalDamage) || 0)) }];
    }
    const sharesTotal = targets.reduce((sum, target) => sum + Math.max(0, Math.floor(Number(target?.share || 0))), 0);
    const originalTotal = sharesTotal > 0 ? sharesTotal : Number(context.totalDamage || 0);
    let remaining = Math.max(0, Math.floor(Number(totalDamage) || 0));
    const allocations = targets.map((target, index) => {
      let share = 0;
      if (Number.isFinite(originalTotal) && originalTotal > 0) {
        if (index === targets.length - 1) {
          share = remaining;
        } else {
          const ratio = Number(target.share || 0) / originalTotal;
          share = Math.max(0, Math.floor((Number(totalDamage) || 0) * ratio));
          remaining = Math.max(0, remaining - share);
        }
      } else {
        share = index === targets.length - 1 ? remaining : 0;
        remaining = Math.max(0, remaining - share);
      }
      const baseShare = Math.max(0, Math.floor(Number(target?.baseShare ?? target?.share ?? 0)));
      return { ...target, baseShare, share };
    });
    return allocations;
  }

  function computeDamageAfterProtection({
    share = 0,
    paInitial = 0,
    penetration = 0
  } = {}) {
    const normalizedShare = Math.max(0, Math.floor(parseFiniteNumber(share, 0)));
    const normalizedPaInitial = Math.max(0, parseFiniteNumber(paInitial, 0));
    const normalizedPenetration = Math.max(0, parseFiniteNumber(penetration, 0));
    const paEffective = Math.max(0, normalizedPaInitial - normalizedPenetration);
    const finalDamage = Math.max(0, normalizedShare - paEffective);
    return {
      share: normalizedShare,
      paInitial: normalizedPaInitial,
      penetration: normalizedPenetration,
      paEffective,
      finalDamage
    };
  }

  function estimateRerollHpBefore({
    rawHpBefore = Number.NaN,
    referenceShare = 0,
    penetration = 0,
    linkedCurrentHp = Number.NaN,
    linkedPaInitial = Number.NaN,
    tokenCurrentHp = Number.NaN,
    tokenPaInitial = Number.NaN
  } = {}) {
    const hasRawHpBeforeValue = !(
      rawHpBefore == null
      || (typeof rawHpBefore === "string" && !rawHpBefore.trim())
    );
    const explicitHpBefore = hasRawHpBeforeValue ? Number(rawHpBefore) : Number.NaN;
    if (Number.isFinite(explicitHpBefore)) return explicitHpBefore;

    const normalizedReferenceShare = Math.max(0, Math.floor(parseFiniteNumber(referenceShare, 0)));
    if (Number.isFinite(linkedCurrentHp)) {
      const stats = computeDamageAfterProtection({
        share: normalizedReferenceShare,
        paInitial: linkedPaInitial,
        penetration
      });
      return Number(linkedCurrentHp) + stats.finalDamage;
    }
    if (Number.isFinite(tokenCurrentHp)) {
      const stats = computeDamageAfterProtection({
        share: normalizedReferenceShare,
        paInitial: tokenPaInitial,
        penetration
      });
      return Number(tokenCurrentHp) + stats.finalDamage;
    }
    return Number.NaN;
  }

  function buildLocalTokenRerollResult({
    hpBefore = Number.NaN,
    share = 0,
    penetration = 0,
    paInitial = 0
  } = {}) {
    const normalizedHpBefore = Number(hpBefore);
    if (!Number.isFinite(normalizedHpBefore)) return null;
    const stats = computeDamageAfterProtection({
      share,
      paInitial,
      penetration
    });
    const hpAfter = Math.max(0, normalizedHpBefore - stats.finalDamage);
    return {
      hpBefore: normalizedHpBefore,
      hpAfter,
      finalDamage: stats.finalDamage,
      penetration: stats.penetration,
      paInitial: stats.paInitial,
      paEffective: stats.paEffective,
      pa: stats.paEffective
    };
  }

  function computeExpectedHpAfter({
    hpBefore = Number.NaN,
    finalDamage = 0
  } = {}) {
    const normalizedHpBefore = Number(hpBefore);
    if (!Number.isFinite(normalizedHpBefore)) return Number.NaN;
    const normalizedFinalDamage = Math.max(0, parseFiniteNumber(finalDamage, 0));
    return Math.max(0, normalizedHpBefore - normalizedFinalDamage);
  }

  function buildItemDamageRerollPayload({
    requestId = "",
    attackerUserId = "",
    attackerId = "",
    context = null,
    itemId = "",
    itemType = "",
    itemName = "",
    totalDamage = 0,
    rollResults = [],
    targets = []
  } = {}) {
    const safeContext = context && typeof context === "object" ? context : {};
    return {
      type: "rerollDamage",
      requestId: String(requestId || ""),
      kind: "item-damage",
      rerollUsed: false,
      attackerUserId: String(attackerUserId || ""),
      attackerId: safeContext.attackerId || attackerId || "",
      rollId: safeContext.rollId,
      itemId: safeContext.itemId || itemId || "",
      itemType: safeContext.itemType || itemType || "",
      itemName: safeContext.itemName || itemName || "",
      damageFormula: safeContext.formula,
      damageLabel: safeContext.degats,
      bonusBrut: safeContext.bonusBrut,
      rollKeepHighest: safeContext.rollKeepHighest === true,
      penetration: safeContext.penetration,
      totalDamage: Number(totalDamage || 0),
      rollResults: Array.isArray(rollResults) ? rollResults : [],
      targets: Array.isArray(targets) ? targets : []
    };
  }

  function getRollValuesFromRoll(roll) {
    const values = [];
    for (const die of roll?.dice || []) {
      for (const result of die?.results || []) {
        const value = Number(result?.result);
        if (Number.isFinite(value)) values.push(value);
      }
    }
    return values;
  }

  function buildKeepHighestDamageTag(firstTotal, secondTotal, keptTotal) {
    if (!Number.isFinite(firstTotal) || !Number.isFinite(secondTotal) || !Number.isFinite(keptTotal)) return "";
    return `2 jets, garder le plus haut: ${firstTotal} / ${secondTotal} -> ${keptTotal}`;
  }

  async function evaluateRerollDamageFormula(formula, rollKeepHighest = false) {
    const normalizedFormula = normalizeDieFormula(formula, "d4");
    if (!rollKeepHighest) {
      const roll = await runRoll(normalizedFormula);
      return {
        roll,
        rollResults: getRollValuesFromRoll(roll),
        rawTotal: Number(roll?.total) || 0,
        modeTag: ""
      };
    }

    const firstRoll = await runRoll(normalizedFormula);
    const secondRoll = await runRoll(normalizedFormula);
    const firstTotal = Number(firstRoll?.total) || 0;
    const secondTotal = Number(secondRoll?.total) || 0;
    const keepFirst = firstTotal >= secondTotal;
    const keptRoll = keepFirst ? firstRoll : secondRoll;
    const keptTotal = keepFirst ? firstTotal : secondTotal;
    return {
      roll: keptRoll,
      rollResults: getRollValuesFromRoll(keptRoll),
      rawTotal: keptTotal,
      modeTag: buildKeepHighestDamageTag(firstTotal, secondTotal, keptTotal)
    };
  }

  return {
    normalizeRerollTarget,
    normalizeRerollTargets,
    buildFallbackRerollTargets,
    getRerollTargetKey,
    isSameRerollTarget,
    isDamageRerollContextReady,
    buildRerollAllocations,
    computeDamageAfterProtection,
    estimateRerollHpBefore,
    buildLocalTokenRerollResult,
    computeExpectedHpAfter,
    buildItemDamageRerollPayload,
    getRollValuesFromRoll,
    buildKeepHighestDamageTag,
    evaluateRerollDamageFormula
  };
}
