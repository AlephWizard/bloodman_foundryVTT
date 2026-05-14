import {
  normalizeOptionalRollFormula,
  validateRollFormula
} from "../rules/roll-formula.mjs";

export const DAMAGE_CONFIG_OPTIONS = Object.freeze([
  { label: "1D4", formula: "1d4" },
  { label: "1D6", formula: "1d6" },
  { label: "1D8", formula: "1d8" },
  { label: "2D4", formula: "2d4" },
  { label: "1D10", formula: "1d10" },
  { label: "1D12", formula: "1d12" },
  { label: "2D6", formula: "2d6" },
  { label: "1D10+1D4", formula: "1d10+1d4" },
  { label: "2D8", formula: "2d8" },
  { label: "1D10+1D8", formula: "1d10+1d8" },
  { label: "2D10", formula: "2d10" },
  { label: "2D12", formula: "2d12" }
]);

export function normalizeDamageFormula(formula) {
  return normalizeOptionalRollFormula(formula);
}

export function getDamageOptionByFormula(formula) {
  const normalized = normalizeDamageFormula(formula);
  if (!normalized) return null;
  return DAMAGE_CONFIG_OPTIONS.find(option => option.formula === normalized) || null;
}

export function createCustomDamageOption(formula, fallbackFormula = "1d4") {
  const normalized = normalizeDamageFormula(formula) || normalizeDamageFormula(fallbackFormula) || "1d4";
  return {
    label: normalized.toUpperCase(),
    formula: normalized
  };
}

export function validateDamageFormula(formula) {
  return validateRollFormula(formula, "d4", { useFallbackOnEmpty: false });
}

export function getDefaultDamageOption(formula) {
  return getDamageOptionByFormula(formula) || DAMAGE_CONFIG_OPTIONS[0];
}
