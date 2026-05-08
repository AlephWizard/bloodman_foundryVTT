export const COMBATANT_INITIATIVE_PATCH_FLAG = "__bmCombatantInitiativePatched";

function normalizeString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function installCombatantInitiativePatch({
  combatantDocumentClass,
  getCombatantActor,
  isCharacterLikeActorType,
  getInitiativeFormulaForActor,
  getRollClass,
  patchFlag = COMBATANT_INITIATIVE_PATCH_FLAG
} = {}) {
  const proto = combatantDocumentClass?.prototype;
  if (!proto) return { ok: false, reason: "missing-prototype" };

  const normalizedPatchFlag = normalizeString(patchFlag, COMBATANT_INITIATIVE_PATCH_FLAG);
  if (proto[normalizedPatchFlag] === true) {
    return { ok: true, reason: "already-patched" };
  }

  const resolveCombatantActor = typeof getCombatantActor === "function"
    ? getCombatantActor
    : combatant => combatant?.actor || null;
  const isCharacterActorType = typeof isCharacterLikeActorType === "function"
    ? isCharacterLikeActorType
    : () => false;
  const buildInitiativeFormula = typeof getInitiativeFormulaForActor === "function"
    ? getInitiativeFormulaForActor
    : () => "0";
  const resolveRollClass = typeof getRollClass === "function"
    ? getRollClass
    : () => null;

  const originalGetInitiativeRoll = proto.getInitiativeRoll;
  const originalGetFormula = proto._getInitiativeFormula || proto.getInitiativeFormula;

  proto._getInitiativeFormula = function () {
    const actor = resolveCombatantActor(this);
    if (isCharacterActorType(actor?.type)) {
      return buildInitiativeFormula(actor);
    }
    const fallback = typeof originalGetFormula === "function" ? originalGetFormula.call(this) : "0";
    return fallback ? String(fallback) : "0";
  };

  proto.getInitiativeRoll = function (formula) {
    const RollClass = resolveRollClass();
    if (typeof RollClass !== "function") return null;
    const actor = resolveCombatantActor(this);
    if (isCharacterActorType(actor?.type)) {
      return new RollClass(buildInitiativeFormula(actor));
    }
    if (typeof originalGetInitiativeRoll === "function") {
      return originalGetInitiativeRoll.call(this, formula);
    }
    const normalizedFormula = normalizeString(formula, "0");
    return new RollClass(normalizedFormula);
  };

  Object.defineProperty(proto, normalizedPatchFlag, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return { ok: true, reason: "applied" };
}
