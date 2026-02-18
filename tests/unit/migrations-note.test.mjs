import assert from "node:assert/strict";
import { computeLegacyNoteMigrationData } from "../../src/migrations/index.mjs";

function run() {
  const noLegacySource = {
    name: "Item without legacy field",
    system: {
      note: "Existing note",
      notes: "Legacy note"
    }
  };
  assert.equal(computeLegacyNoteMigrationData(noLegacySource), null);

  const legacySource = {
    name: "Legacy item",
    system: {
      note: "",
      notes: "Legacy description"
    }
  };
  assert.deepEqual(computeLegacyNoteMigrationData(legacySource), {
    "system.note": "Legacy description"
  });

  const blankLegacySource = {
    system: {
      note: "",
      notes: "   "
    }
  };
  assert.equal(computeLegacyNoteMigrationData(blankLegacySource), null);
}

run();
console.log("migrations-note.test.mjs: OK");

