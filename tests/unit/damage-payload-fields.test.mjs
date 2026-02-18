import assert from "node:assert/strict";
import { getDamagePayloadField, toBooleanFlag } from "../../src/rules/damage-payload-fields.mjs";

async function run() {
  assert.equal(
    getDamagePayloadField({ tokenId: "", token_id: "tok-1" }, ["tokenId", "token_id"]),
    "tok-1"
  );
  assert.equal(
    getDamagePayloadField({ actorId: null, actorid: "a1" }, ["actorId", "actorid"]),
    "a1"
  );
  assert.equal(
    getDamagePayloadField(null, ["x"]),
    undefined
  );
  assert.equal(
    getDamagePayloadField({ value: "x" }, "value"),
    undefined
  );

  assert.equal(toBooleanFlag(true), true);
  assert.equal(toBooleanFlag("true"), true);
  assert.equal(toBooleanFlag(" True "), true);
  assert.equal(toBooleanFlag(false), false);
  assert.equal(toBooleanFlag("false"), false);
  assert.equal(toBooleanFlag(1), false);
}

run()
  .then(() => {
    console.log("damage-payload-fields.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
