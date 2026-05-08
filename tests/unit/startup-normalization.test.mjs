import assert from "node:assert/strict";
import {
  createStartupNormalizationRunner,
  shouldRunStartupNormalization
} from "../../src/rules/startup-normalization.mjs";

async function run() {
  assert.equal(
    shouldRunStartupNormalization({ storedVersion: 0, targetVersion: 1 }),
    true
  );
  assert.equal(
    shouldRunStartupNormalization({ storedVersion: 1, targetVersion: 1 }),
    false
  );
  assert.equal(
    shouldRunStartupNormalization({ storedVersion: 5, targetVersion: 1 }),
    false
  );

  let ranPass = 0;
  let wroteVersion = null;
  const skippedRunner = createStartupNormalizationRunner({
    targetVersion: 2,
    readStoredVersion: () => 2,
    writeStoredVersion: async value => {
      wroteVersion = value;
      return true;
    },
    runNormalizationPass: async () => {
      ranPass += 1;
    }
  });
  const skippedState = await skippedRunner.runIfNeeded();
  assert.deepEqual(skippedState, {
    ran: false,
    completed: false,
    storedVersion: 2,
    targetVersion: 2,
    reason: "up-to-date"
  });
  assert.equal(ranPass, 0);
  assert.equal(wroteVersion, null);

  let appliedPass = 0;
  let persistedVersion = null;
  const appliedRunner = createStartupNormalizationRunner({
    targetVersion: 3,
    readStoredVersion: () => 1,
    writeStoredVersion: async value => {
      persistedVersion = value;
      return true;
    },
    runNormalizationPass: async () => {
      appliedPass += 1;
    }
  });
  const appliedState = await appliedRunner.runIfNeeded();
  assert.deepEqual(appliedState, {
    ran: true,
    completed: true,
    storedVersion: 1,
    targetVersion: 3,
    reason: "completed"
  });
  assert.equal(appliedPass, 1);
  assert.equal(persistedVersion, 3);

  const warnings = [];
  const nonPersistentRunner = createStartupNormalizationRunner({
    targetVersion: 4,
    readStoredVersion: () => 0,
    writeStoredVersion: async () => false,
    runNormalizationPass: async () => {},
    logger: {
      warn: (message, context) => warnings.push({ message, context })
    }
  });
  const nonPersistentState = await nonPersistentRunner.runIfNeeded();
  assert.equal(nonPersistentState.ran, true);
  assert.equal(nonPersistentState.completed, false);
  assert.equal(nonPersistentState.reason, "completed-not-persisted");
  assert.equal(warnings.length, 1);
}

run()
  .then(() => {
    console.log("startup-normalization.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
