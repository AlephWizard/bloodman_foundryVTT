import assert from "node:assert/strict";
import { buildChatRelayHelpers } from "../../src/hooks/chat-relay.mjs";

async function run() {
  const deleted = [];
  const scheduled = [];
  const messages = new Map();
  const currentUser = { id: "u1" };

  const helpers = buildChatRelayHelpers({
    getCurrentUser: () => currentUser,
    getMessagesCollection: () => messages,
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    scheduleTimeout: (callback, timeout) => {
      scheduled.push(timeout);
      callback();
    },
    getProperty: (object, path) => String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object),
    isHtmlElement: value => Boolean(value?.style && value?.classList)
  });

  assert.equal(helpers.isCurrentUserChatMessageAuthor({ user: "u1" }), true);
  assert.equal(helpers.isCurrentUserChatMessageAuthor({ user: "u2" }), false);
  assert.equal(helpers.isCurrentUserChatMessageAuthor({ isAuthor: true }), true);

  messages.set("m1", {
    id: "m1",
    user: "u1",
    delete: async () => {
      deleted.push("m1");
    }
  });
  helpers.scheduleTransientChatMessageDeletion({ id: "m1", user: "u1" }, 300);
  assert.deepEqual(scheduled, [300]);
  assert.deepEqual(deleted, ["m1"]);

  helpers.scheduleTransientChatMessageDeletion({ id: "m2", user: "u2" }, 100);
  assert.deepEqual(scheduled, [300]);

  assert.equal(helpers.isTransportRelayChatMessage({
    flags: { bloodman: { damageConfigPopup: { ok: true } } }
  }), true);
  assert.equal(helpers.isTransportRelayChatMessage({
    flags: { bloodman: { damageSplitPopup: { ok: true } } }
  }), true);
  assert.equal(helpers.isTransportRelayChatMessage({
    content: "BLOODMAN-REROLL-REQUEST"
  }), true);
  assert.equal(helpers.isTransportRelayChatMessage({
    flags: { bloodman: {} },
    content: "hello"
  }), false);

  const htmlElement = {
    style: {},
    classList: {
      values: [],
      add(value) {
        this.values.push(value);
      }
    }
  };
  helpers.hideTransientRelayChatMessage(htmlElement);
  assert.equal(htmlElement.style.display, "none");
  assert.deepEqual(htmlElement.classList.values, ["bm-chat-relay-hidden"]);
}

run()
  .then(() => {
    console.log("chat-relay.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
