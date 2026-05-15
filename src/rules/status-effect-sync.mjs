import { SYSTEM_ROOT_PATH } from "../core/constants.mjs";

export const PLAYER_ZERO_PV_STATUS_CANDIDATES = ["bleeding", "bleed", "bloodied"];
export const NPC_ZERO_PV_STATUS_CANDIDATES = ["dead", "defeated", "death", "mort"];

export function normalizeStatusValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function getStatusEffectIds(effectDef, { normalized = false } = {}) {
  if (!effectDef) return [];
  const rawStatuses = effectDef.statuses instanceof Set
    ? [...effectDef.statuses]
    : (Array.isArray(effectDef.statuses) ? effectDef.statuses : []);
  const ids = [effectDef.id, ...rawStatuses]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const output = [];
  const seen = new Set();
  for (const id of ids) {
    const key = normalized ? normalizeStatusValue(id) : id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized ? key : id);
  }
  return output;
}

export function getConfiguredStatusIdSet() {
  const configured = new Set();
  const effects = Array.isArray(globalThis.CONFIG?.statusEffects) ? globalThis.CONFIG.statusEffects : [];
  for (const effect of effects) {
    for (const id of getStatusEffectIds(effect, { normalized: true })) configured.add(id);
  }
  return configured;
}

export function getLocalizedStatusLabel(effect) {
  if (!effect) return "";
  const raw = effect.name ?? effect.label ?? "";
  if (!raw) return "";
  const i18n = globalThis.game?.i18n;
  const hasI18nKey = Boolean(i18n?.has?.(raw));
  const localized = hasI18nKey ? i18n.localize(raw) : raw;
  return normalizeStatusValue(localized);
}

export function findStatusEffect(candidates, labelKeywords = []) {
  const effects = Array.isArray(globalThis.CONFIG?.statusEffects) ? globalThis.CONFIG.statusEffects : [];
  const wanted = new Set(candidates.map(normalizeStatusValue).filter(Boolean));
  for (const effect of effects) {
    const ids = getStatusEffectIds(effect, { normalized: true });
    if (ids.some(id => wanted.has(id))) return effect;
  }
  if (!labelKeywords.length) return null;
  const keywords = labelKeywords.map(normalizeStatusValue).filter(Boolean);
  for (const effect of effects) {
    const label = getLocalizedStatusLabel(effect);
    if (!label) continue;
    if (keywords.some(keyword => label.includes(keyword))) return effect;
  }
  return null;
}

export function ensureStatusEffectDefinition(effectDef) {
  if (!effectDef) return null;
  if (!Array.isArray(globalThis.CONFIG?.statusEffects)) return effectDef;
  const targetIds = new Set(getStatusEffectIds(effectDef, { normalized: true }));
  if (!targetIds.size) return effectDef;
  for (const effect of globalThis.CONFIG.statusEffects) {
    const existingIds = getStatusEffectIds(effect, { normalized: true });
    if (existingIds.some(id => targetIds.has(id))) return effect;
  }
  try {
    globalThis.CONFIG.statusEffects.push(effectDef);
  } catch (_error) {
    // keep non-fatal if the status list is immutable
  }
  return effectDef;
}

export function resolvePrimaryStatusId(effectDef) {
  const ids = getStatusEffectIds(effectDef);
  if (!ids.length) return "";
  const configured = getConfiguredStatusIdSet();
  return ids.find(id => configured.has(normalizeStatusValue(id))) || ids[0];
}

export function buildBleedingFallbackStatusEffect() {
  return {
    id: "bleeding",
    statuses: ["bleeding"],
    name: "Bleeding",
    img: `${SYSTEM_ROOT_PATH}/images/blood.svg`
  };
}

export function buildDeadFallbackStatusEffect() {
  const defeatedRaw = String(globalThis.CONFIG?.specialStatusEffects?.DEFEATED || "").trim();
  const id = defeatedRaw || "dead";
  const normalized = normalizeStatusValue(id);
  const statuses = normalized && normalized !== id ? [id, normalized] : [id];
  return {
    id,
    statuses,
    name: "Dead",
    img: `${SYSTEM_ROOT_PATH}/images/skull.svg`
  };
}

export function forceStatusEffectIcon(effectDef, img) {
  if (!effectDef || typeof effectDef !== "object") return effectDef;
  const iconPath = String(img || "").trim();
  if (!iconPath) return effectDef;
  try {
    effectDef.img = iconPath;
    effectDef.icon = iconPath;
  } catch (_error) {
    // Some Foundry-provided definitions may be immutable; the fallback remains usable.
  }
  return effectDef;
}

export function getBleedingStatusEffect() {
  const effect = findStatusEffect(PLAYER_ZERO_PV_STATUS_CANDIDATES, ["bleed", "saign"])
    || ensureStatusEffectDefinition(buildBleedingFallbackStatusEffect());
  return forceStatusEffectIcon(effect, `${SYSTEM_ROOT_PATH}/images/blood.svg`);
}

export function getDeadStatusEffect() {
  const defeatedRaw = String(globalThis.CONFIG?.specialStatusEffects?.DEFEATED || "").trim();
  const defeated = normalizeStatusValue(defeatedRaw);
  const candidates = defeated ? [defeated, ...NPC_ZERO_PV_STATUS_CANDIDATES] : NPC_ZERO_PV_STATUS_CANDIDATES;
  const effect = findStatusEffect(candidates, ["dead", "mort", "defeat"])
    || ensureStatusEffectDefinition(buildDeadFallbackStatusEffect());
  return forceStatusEffectIcon(effect, `${SYSTEM_ROOT_PATH}/images/skull.svg`);
}

export function getNpcDeadStatusFamilyIds(deadEffect = null) {
  const defeatedRaw = String(globalThis.CONFIG?.specialStatusEffects?.DEFEATED || "").trim();
  const deadCandidates = defeatedRaw
    ? [defeatedRaw, ...NPC_ZERO_PV_STATUS_CANDIDATES]
    : [...NPC_ZERO_PV_STATUS_CANDIDATES];
  return buildStatusFamilyIds(deadEffect || getDeadStatusEffect(), deadCandidates);
}

export function getTokenStatusesList(tokenDoc, { normalized = true } = {}) {
  const statuses = tokenDoc?.statuses;
  const list = Array.isArray(statuses)
    ? [...statuses]
    : statuses instanceof Set
      ? [...statuses]
      : [];
  const cleaned = list
    .map(value => String(value || "").trim())
    .filter(Boolean);
  if (!normalized) return cleaned;
  return cleaned.map(normalizeStatusValue).filter(Boolean);
}

export async function removeTokenStatusOverrides(tokenDoc, familyIds = []) {
  const family = new Set(normalizeStatusIdList(familyIds));
  if (!tokenDoc || !family.size) return false;
  const currentStatuses = getTokenStatusesList(tokenDoc, { normalized: false });
  if (!currentStatuses.length) return false;
  const nextStatuses = currentStatuses.filter(id => !family.has(normalizeStatusValue(id)));
  if (nextStatuses.length === currentStatuses.length) return false;
  await tokenDoc.update({ statuses: nextStatuses }).catch(() => null);
  return true;
}

export function getActiveEffectStatusIds(effectDoc, { normalized = true } = {}) {
  const statuses = effectDoc?.statuses;
  const list = Array.isArray(statuses)
    ? [...statuses]
    : statuses instanceof Set
      ? [...statuses]
      : [];
  const legacyStatusId = String(globalThis.foundry?.utils?.getProperty?.(effectDoc, "flags.core.statusId") || "").trim();
  if (legacyStatusId) list.push(legacyStatusId);
  const cleaned = list
    .map(value => String(value || "").trim())
    .filter(Boolean);
  if (!normalized) return cleaned;
  return cleaned.map(normalizeStatusValue).filter(Boolean);
}

export function getActorEffectDocuments(actor) {
  const effects = actor?.effects;
  if (!effects) return [];
  if (Array.isArray(effects)) return effects;
  if (Array.isArray(effects.contents)) return effects.contents;
  if (typeof effects.values === "function") return [...effects.values()];
  return [];
}

export function isLiveActorEffectDocument(effectDoc) {
  if (!effectDoc?.id) return false;
  const parent = effectDoc.parent || null;
  const effects = parent?.effects || null;
  if (!effects) return Boolean(parent);
  if (typeof effects.get === "function") return effects.get(effectDoc.id) === effectDoc;
  if (Array.isArray(effects)) return effects.includes(effectDoc);
  if (Array.isArray(effects.contents)) return effects.contents.includes(effectDoc);
  if (typeof effects.values === "function") return [...effects.values()].includes(effectDoc);
  return Boolean(parent);
}

export function normalizeStatusIdList(ids = []) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map(normalizeStatusValue)
      .filter(Boolean)
  )];
}

export function buildStatusFamilyIds(effectDef, extraIds = []) {
  return normalizeStatusIdList([
    ...(Array.isArray(extraIds) ? extraIds : []),
    ...getStatusEffectIds(effectDef)
  ]);
}

export function getActorStatusEffectDocumentsByFamily(actor, familyIds = []) {
  const family = new Set(normalizeStatusIdList(familyIds));
  if (!actor || !family.size) return [];
  const docs = [];
  for (const effectDoc of getActorEffectDocuments(actor)) {
    if (!isLiveActorEffectDocument(effectDoc)) continue;
    const ids = getActiveEffectStatusIds(effectDoc);
    if (ids.some(id => family.has(id))) docs.push(effectDoc);
  }
  return docs;
}

export async function deleteStatusEffectDocuments(effectDocs = []) {
  if (!Array.isArray(effectDocs) || !effectDocs.length) return false;
  let changed = false;
  const seen = new Set();
  for (const effectDoc of effectDocs) {
    if (!isLiveActorEffectDocument(effectDoc) || seen.has(effectDoc.uuid || effectDoc.id)) continue;
    seen.add(effectDoc.uuid || effectDoc.id);
    try {
      await effectDoc.delete();
      changed = true;
    } catch (_error) {
      // continue best-effort cleanup
    }
  }
  return changed;
}

export async function showStatusEffectDocuments(effectDocs = []) {
  if (!Array.isArray(effectDocs) || !effectDocs.length) return false;
  const showIcon = globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2;
  let changed = false;
  for (const effectDoc of effectDocs) {
    if (!isLiveActorEffectDocument(effectDoc) || effectDoc.showIcon === showIcon || typeof effectDoc.update !== "function") continue;
    try {
      await effectDoc.update({ showIcon });
      changed = true;
    } catch (_error) {
      // Status synchronization should remain best-effort.
    }
  }
  return changed;
}

export function actorHasStatusInFamily(actor, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!actor || !family.length) return false;
  if (typeof actor.hasStatusEffect === "function") {
    for (const id of family) {
      try {
        if (actor.hasStatusEffect(id)) return true;
      } catch (_error) {
        // continue checks
      }
    }
  }
  return getActorStatusEffectDocumentsByFamily(actor, family).length > 0;
}

export function tokenHasStatusInFamily(tokenDoc, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!tokenDoc || !family.length) return false;
  const actor = tokenDoc.actorLink === true
    ? (tokenDoc.actor || (tokenDoc.actorId ? globalThis.game?.actors?.get?.(tokenDoc.actorId) : null))
    : tokenDoc.actor || null;
  if (actorHasStatusInFamily(actor, family)) return true;
  const tokenStatuses = new Set(getTokenStatusesList(tokenDoc));
  if (family.some(id => tokenStatuses.has(id))) return true;

  if (typeof tokenDoc.hasStatusEffect === "function") {
    for (const id of family) {
      try {
        if (tokenDoc.hasStatusEffect(id)) return true;
      } catch (_error) {
        // continue checks
      }
    }
  }
  return false;
}

export async function clearActorStatusFamily(actor, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!actor || !family.length) return false;
  const docs = getActorStatusEffectDocumentsByFamily(actor, family);
  if (docs.length) await deleteStatusEffectDocuments(docs);
  return !actorHasStatusInFamily(actor, family);
}

export function tokenHasStatusEffect(tokenDoc, effectDef, familyIds = []) {
  return tokenHasStatusInFamily(tokenDoc, buildStatusFamilyIds(effectDef, familyIds));
}

const STATUS_EFFECT_SYNC_LOCKS = new Map();

export function getStatusEffectSyncLockKey(tokenDoc, actor, familyIds = []) {
  const ownerRef = String(actor?.uuid || actor?.id || tokenDoc?.uuid || tokenDoc?.id || "").trim();
  const familyRef = normalizeStatusIdList(familyIds).join("|");
  return `${ownerRef || "unknown"}::${familyRef || "status"}`;
}

export async function runStatusEffectSyncLocked(lockKey, operation) {
  const key = String(lockKey || "").trim();
  if (!key) return operation();
  const previous = STATUS_EFFECT_SYNC_LOCKS.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const chained = previous.then(() => current, () => current);
  STATUS_EFFECT_SYNC_LOCKS.set(key, chained);
  try {
    await previous.catch(() => null);
    return await operation();
  } finally {
    release();
    if (STATUS_EFFECT_SYNC_LOCKS.get(key) === chained) STATUS_EFFECT_SYNC_LOCKS.delete(key);
  }
}

export async function setTokenStatusEffect(tokenDoc, effectDef, active, familyIds = []) {
  if (!tokenDoc || !effectDef) return false;
  const primaryId = resolvePrimaryStatusId(effectDef) || getStatusEffectIds(effectDef)[0] || "";
  const family = buildStatusFamilyIds(effectDef, familyIds);
  if (!primaryId || !family.length) return false;
  const actor = tokenDoc.actorLink === true
    ? (tokenDoc.actor || (tokenDoc.actorId ? globalThis.game?.actors?.get?.(tokenDoc.actorId) : null))
    : tokenDoc.actor || null;
  const lockKey = getStatusEffectSyncLockKey(tokenDoc, actor, family);
  return runStatusEffectSyncLocked(lockKey, async () => setTokenStatusEffectUnlocked(tokenDoc, effectDef, active, family, primaryId, actor));
}

async function setTokenStatusEffectUnlocked(tokenDoc, effectDef, active, family, primaryId, actor) {
  const currentStatuses = getTokenStatusesList(tokenDoc, { normalized: false });
  const familySet = new Set(family);
  const hasTokenOverrides = currentStatuses.some(id => familySet.has(normalizeStatusValue(id)));

  if (actor && !hasTokenOverrides) {
    const actorDocs = getActorStatusEffectDocumentsByFamily(actor, family);
    const actorHas = actorHasStatusInFamily(actor, family);
    if (actorHas === active && actorDocs.length <= 1) {
      if (active) await showStatusEffectDocuments(actorDocs);
      return true;
    }
  }

  if (hasTokenOverrides) await removeTokenStatusOverrides(tokenDoc, family);

  if (actor && typeof actor.toggleStatusEffect === "function") {
    await clearActorStatusFamily(actor, family);
    if (active) {
      try {
        await actor.toggleStatusEffect(primaryId, { active: true, overlay: false });
      } catch (_error) {
        // fallback on token statuses below
      }
      const actorDocs = getActorStatusEffectDocumentsByFamily(actor, family);
      if (actorDocs.length > 1) await deleteStatusEffectDocuments(actorDocs.slice(1));
      if (!actorHasStatusInFamily(actor, family)) {
        const normalizedPrimary = normalizeStatusValue(primaryId);
        if (normalizedPrimary && normalizedPrimary !== primaryId) {
          try {
            await actor.toggleStatusEffect(normalizedPrimary, { active: true, overlay: false });
          } catch (_error) {
            // fallback on token statuses below
          }
        }
      }
    }
    if (active) await showStatusEffectDocuments(getActorStatusEffectDocumentsByFamily(actor, family));
    const actorMatches = actorHasStatusInFamily(actor, family) === active;
    if (actorMatches) return true;
  }

  const nextStatuses = currentStatuses.filter(id => !familySet.has(normalizeStatusValue(id)));
  if (active) nextStatuses.push(primaryId);

  const deduped = [];
  const seen = new Set();
  for (const id of nextStatuses) {
    const normalized = normalizeStatusValue(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(id);
  }

  const hasChanged = hasTokenOverrides
    || deduped.length !== currentStatuses.length
    || deduped.some((id, index) => id !== currentStatuses[index]);
  if (hasChanged) await tokenDoc.update({ statuses: deduped }).catch(() => null);

  return tokenHasStatusInFamily(tokenDoc, family) === active;
}
