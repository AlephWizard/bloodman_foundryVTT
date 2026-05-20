import assert from "node:assert/strict";

import {
  getWeaponCategory,
  normalizeWeaponType
} from "../../src/dice/weapon-category.mjs";
import {
  getWeaponCategory as getWeaponCategoryFromRollHelpers,
  normalizeWeaponType as normalizeWeaponTypeFromRollHelpers
} from "../../src/dice/roll-helpers.mjs";

function run() {
  assert.equal(normalizeWeaponType(""), "");
  assert.equal(normalizeWeaponType(null), "");
  assert.equal(normalizeWeaponType("distance"), "distance");
  assert.equal(normalizeWeaponType("arme a distance"), "distance");
  assert.equal(normalizeWeaponType("corps"), "corps");
  assert.equal(normalizeWeaponType("arme blanche"), "corps");
  assert.equal(normalizeWeaponType("arme de mêlée"), "corps");
  assert.equal(normalizeWeaponType(`arme de m${String.fromCodePoint(0xc3)}${String.fromCodePoint(0xaa)}l${String.fromCodePoint(0xc3)}${String.fromCodePoint(0xa9)}e`), "corps");
  assert.equal(normalizeWeaponType("melee"), "corps");
  assert.equal(normalizeWeaponType("arme de jet"), "distance");
  assert.equal(normalizeWeaponType("tactique"), "distance");
  assert.equal(normalizeWeaponType("exotique"), "exotique");

  assert.equal(getWeaponCategory("corps"), "corps");
  assert.equal(getWeaponCategory("arme blanche"), "corps");
  assert.equal(getWeaponCategory("distance"), "distance");
  assert.equal(getWeaponCategory("exotique"), "distance");
  assert.equal(getWeaponCategory(null), "distance");

  assert.equal(normalizeWeaponTypeFromRollHelpers("distance"), "distance");
  assert.equal(getWeaponCategoryFromRollHelpers("corps"), "corps");
}

run();
console.log("weapon-category.test.mjs: OK");
