import { SYSTEM_ID } from "../core/constants.mjs";
import { bmLog } from "../core/logger.mjs";
import {
  getDamageOptionByFormula,
  normalizeDamageFormula
} from "./damage-config-options.mjs";

export const DAMAGE_DIALOG_CONFIG_USER_FLAG = "damageDialogConfig";

function toNonNegativeInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

export function getRememberedDamageDialogConfig({
  user = globalThis.game?.user,
  systemId = SYSTEM_ID,
  flagKey = DAMAGE_DIALOG_CONFIG_USER_FLAG
} = {}) {
  const raw = user?.getFlag?.(systemId, flagKey);
  if (!raw || typeof raw !== "object") return null;
  const normalizedFormula = normalizeDamageFormula(raw.formula);
  const option = getDamageOptionByFormula(normalizedFormula);
  return {
    formula: option?.formula || normalizedFormula || "",
    bonusBrut: toNonNegativeInt(raw.bonusBrut, 0),
    penetration: toNonNegativeInt(raw.penetration, 0)
  };
}

export async function rememberDamageDialogConfig(config = {}, {
  user = globalThis.game?.user,
  systemId = SYSTEM_ID,
  flagKey = DAMAGE_DIALOG_CONFIG_USER_FLAG,
  logger = bmLog
} = {}) {
  if (!user?.setFlag) return;
  const normalizedFormula = normalizeDamageFormula(config.formula);
  const option = getDamageOptionByFormula(normalizedFormula);
  const payload = {
    formula: option?.formula || normalizedFormula || "",
    bonusBrut: toNonNegativeInt(config.bonusBrut, 0),
    penetration: toNonNegativeInt(config.penetration, 0),
    updatedAt: Date.now()
  };
  try {
    await user.setFlag(systemId, flagKey, payload);
  } catch (error) {
    logger?.warn?.("damage:remember config failed", { error });
  }
}
