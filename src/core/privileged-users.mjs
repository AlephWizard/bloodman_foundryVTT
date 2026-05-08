const CACHE_TTL_MS = 1_000;

let cache = {
  snapshotKey: "",
  expiresAt: 0,
  gmIds: [],
  privilegedIds: [],
  primaryPrivilegedId: ""
};

let hooksRegistered = false;

function toStableUserId(user) {
  return String(user?.id || "").trim();
}

function buildSnapshotKey(users) {
  return users
    .map(user => `${toStableUserId(user)}:${user?.active ? 1 : 0}:${user?.isGM ? 1 : 0}:${Number(user?.role ?? 0)}`)
    .sort()
    .join("|");
}

function getActiveUsers() {
  return Array.from(game?.users || []).filter(user => user?.active);
}

function getPrivilegedPriority(user) {
  return user?.isGM ? 0 : 1;
}

function refreshCacheIfNeeded(force = false) {
  const users = Array.from(game?.users || []);
  if (!users.length) {
    cache = { snapshotKey: "", expiresAt: Date.now() + CACHE_TTL_MS, gmIds: [], privilegedIds: [], primaryPrivilegedId: "" };
    return cache;
  }

  const now = Date.now();
  const snapshotKey = buildSnapshotKey(users);
  if (!force && now < cache.expiresAt && snapshotKey === cache.snapshotKey) return cache;

  const activeUsers = getActiveUsers();
  const gmIds = activeUsers.map(user => user?.isGM ? toStableUserId(user) : "").filter(Boolean);
  const privilegedUsers = activeUsers
    .filter(user => user?.isGM || isAssistantOrHigherRole(user?.role))
    .sort((left, right) => {
      const priorityDelta = getPrivilegedPriority(left) - getPrivilegedPriority(right);
      if (priorityDelta !== 0) return priorityDelta;
      return toStableUserId(left).localeCompare(toStableUserId(right));
    });
  const privilegedIds = privilegedUsers.map(toStableUserId).filter(Boolean);

  cache = {
    snapshotKey,
    expiresAt: now + CACHE_TTL_MS,
    gmIds,
    privilegedIds,
    primaryPrivilegedId: privilegedIds[0] || ""
  };
  return cache;
}

export function invalidatePrivilegedUsersCache() {
  cache.expiresAt = 0;
  cache.snapshotKey = "";
}

export function registerPrivilegedUsersCacheHooks() {
  if (hooksRegistered || !globalThis.Hooks) return;
  hooksRegistered = true;

  const invalidate = () => invalidatePrivilegedUsersCache();
  Hooks.on("createUser", invalidate);
  Hooks.on("updateUser", invalidate);
  Hooks.on("deleteUser", invalidate);
  Hooks.on("userConnected", invalidate);
}

export function isAssistantOrHigherRole(role) {
  const assistantRole = Number(CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return Number(role ?? 0) >= assistantRole;
}

export function canUserProcessPrivilegedRequests(user = null) {
  const candidate = user || game?.user;
  if (!candidate) return false;
  if (candidate?.active === false) return false;
  if (candidate.isGM) return true;
  return isAssistantOrHigherRole(candidate.role);
}

export function getActivePrivilegedOperatorIds() {
  return [...refreshCacheIfNeeded(false).privilegedIds];
}

export function getActiveGMUserIds() {
  return [...refreshCacheIfNeeded(false).gmIds];
}

export function isCurrentUserPrimaryPrivilegedOperator() {
  const currentUser = game?.user;
  if (!canUserProcessPrivilegedRequests(currentUser)) return false;
  const currentUserId = toStableUserId(currentUser);
  if (!currentUserId) return false;
  return refreshCacheIfNeeded(false).primaryPrivilegedId === currentUserId;
}

