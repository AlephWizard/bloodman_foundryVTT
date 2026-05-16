import { isAssistantOrHigherRole } from "../core/privileged-users.mjs";
import { toFiniteNumber } from "../core/value-normalization.mjs";

export const CHARACTERISTIC_BASE_MIN = 30;
export const CHARACTERISTIC_BASE_MAX = 95;

export function canUserRoleEditCharacteristics(role) {
  const minRole = Number(globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2);
  return Number(role ?? 0) >= minRole;
}

export function canUserRoleDropMenuItems(role) {
  const minRole = Number(globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2);
  return Number(role ?? 0) >= minRole;
}

export function isBasicPlayerRole(role) {
  const playerRole = Number(globalThis.CONST?.USER_ROLES?.PLAYER ?? 1);
  return Number(role ?? 0) <= playerRole;
}

export function canUserRoleOpenItemSheets(role) {
  return isAssistantOrHigherRole(role);
}

export function isCharacteristicBaseRangeRestrictedRole(role) {
  return !isAssistantOrHigherRole(role);
}

export function clampCharacteristicBaseForRole(role, value, fallback = CHARACTERISTIC_BASE_MIN) {
  const numeric = toFiniteNumber(value, fallback);
  if (!isCharacteristicBaseRangeRestrictedRole(role)) return numeric;
  return Math.max(CHARACTERISTIC_BASE_MIN, Math.min(CHARACTERISTIC_BASE_MAX, numeric));
}
