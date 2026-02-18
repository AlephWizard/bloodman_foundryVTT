import assert from "node:assert/strict";
import { createRequestRetentionTracker } from "../../src/rules/request-dedupe.mjs";

async function run() {
  let now = 0;
  const tracker = createRequestRetentionTracker({
    retentionMs: 100,
    getNow: () => now
  });

  assert.equal(tracker.wasRequestProcessed("a"), false);
  tracker.rememberRequest("");
  assert.equal(tracker.wasRequestProcessed(""), false);

  tracker.rememberRequest("a");
  assert.equal(tracker.wasRequestProcessed("a"), true);

  now = 40;
  tracker.rememberRequest("b");
  assert.equal(tracker.wasRequestProcessed("a"), true);
  assert.equal(tracker.wasRequestProcessed("b"), true);

  now = 121;
  tracker.rememberRequest("c");
  assert.equal(tracker.wasRequestProcessed("a"), false);
  assert.equal(tracker.wasRequestProcessed("b"), true);
  assert.equal(tracker.wasRequestProcessed("c"), true);

  now = 250;
  tracker.prune();
  assert.equal(tracker.wasRequestProcessed("b"), false);
  assert.equal(tracker.wasRequestProcessed("c"), false);
}

run()
  .then(() => {
    console.log("request-dedupe.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
