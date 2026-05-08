import assert from "node:assert/strict";
import {
  COMBATANT_INITIATIVE_PATCH_FLAG,
  installCombatantInitiativePatch
} from "../../src/rules/combatant-initiative-patch.mjs";

class TestRoll {
  constructor(formula) {
    this.formula = formula;
  }
}

function run() {
  class Combatant {
    constructor(actorType = "npc") {
      this.actor = { type: actorType };
    }

    _getInitiativeFormula() {
      return "1d20";
    }

    getInitiativeRoll(formula) {
      return `legacy:${formula ?? ""}`;
    }
  }

  const result = installCombatantInitiativePatch({
    combatantDocumentClass: Combatant,
    getCombatantActor: combatant => combatant.actor,
    isCharacterLikeActorType: actorType => actorType === "personnage",
    getInitiativeFormulaForActor: () => "(8)+(10-1d10)/100",
    getRollClass: () => TestRoll
  });
  assert.deepEqual(result, { ok: true, reason: "applied" });
  assert.equal(Combatant.prototype[COMBATANT_INITIATIVE_PATCH_FLAG], true);

  const characterCombatant = new Combatant("personnage");
  const npcCombatant = new Combatant("personnage-non-joueur");

  assert.equal(characterCombatant._getInitiativeFormula(), "(8)+(10-1d10)/100");
  assert.equal(npcCombatant._getInitiativeFormula(), "1d20");

  const characterRoll = characterCombatant.getInitiativeRoll("ignored");
  assert.equal(characterRoll instanceof TestRoll, true);
  assert.equal(characterRoll.formula, "(8)+(10-1d10)/100");
  assert.equal(npcCombatant.getInitiativeRoll("1d6"), "legacy:1d6");

  const secondResult = installCombatantInitiativePatch({
    combatantDocumentClass: Combatant,
    getRollClass: () => TestRoll
  });
  assert.deepEqual(secondResult, { ok: true, reason: "already-patched" });

  assert.deepEqual(
    installCombatantInitiativePatch({ combatantDocumentClass: null }),
    { ok: false, reason: "missing-prototype" }
  );
}

run();
console.log("combatant-initiative-patch.test.mjs: OK");
