import assert from "node:assert/strict";
import { buildDamageSplitPopupHooks } from "../../src/hooks/damage-split-popup.mjs";

class FakeDialog {
  static instances = [];
  static renderedCount = 0;
  static closedCount = 0;

  constructor(config, options) {
    this.config = config;
    this.options = options;
    this.element = {
      length: 1,
      html: () => {},
      find: () => ({
        text: () => {},
        removeClass: () => ({
          addClass: () => {}
        }),
        addClass: () => {},
        html: () => {}
      })
    };
    FakeDialog.instances.push(this);
  }

  render(_visible) {
    FakeDialog.renderedCount += 1;
  }

  close() {
    FakeDialog.closedCount += 1;
  }
}

async function run() {
  const remembered = new Set();
  const warnings = [];
  const localUser = { id: "u1", isGM: false, role: 2 };
  const users = new Map([["u2", { name: "Requester" }]]);

  const hooks = buildDamageSplitPopupHooks({
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    t: key => (key === "BLOODMAN.Common.OK" ? "OK" : key),
    tl: (_key, fallback) => fallback,
    getCurrentUser: () => localUser,
    getUsersCollection: () => users,
    isAssistantOrHigherRole: role => Number(role) >= 2,
    escapeHtml: value => String(value || "").replace(/</g, "&lt;"),
    dialogClass: FakeDialog,
    wasDamageSplitPopupRequestProcessed: id => remembered.has(id),
    rememberDamageSplitPopupRequest: id => remembered.add(id),
    logWarn: (...args) => warnings.push(args)
  });

  assert.equal(hooks.canCurrentUserReceiveDamageSplitPopup({
    requesterUserId: "u2",
    viewerIds: ["u1"]
  }), true);
  assert.equal(hooks.canCurrentUserReceiveDamageSplitPopup({
    requesterUserId: "u1",
    viewerIds: ["u1"]
  }), false);

  const shown = hooks.showDamageSplitObserverPopup({
    requestId: "req-1",
    requesterUserId: "u2",
    actorName: "Actor<",
    sourceName: "Source",
    totalDamage: 7,
    allocations: [
      { id: "a", name: "Target A", value: 5 },
      { id: "b", name: "Target B", value: 8 }
    ]
  });
  assert.equal(shown, true);
  assert.equal(FakeDialog.instances.length, 1);
  assert.equal(FakeDialog.renderedCount, 1);
  assert.equal(FakeDialog.instances[0].config.title.includes("Actor&lt;"), true);
  assert.equal(FakeDialog.instances[0].config.content.includes("Target A"), true);
  assert.equal(FakeDialog.instances[0].config.content.includes("Total attribue"), true);

  const updated = hooks.showDamageSplitObserverPopup({
    requestId: "req-1",
    requesterUserId: "u2",
    actorName: "Actor",
    sourceName: "Source",
    totalDamage: 7,
    allocations: [
      { id: "a", name: "Target A", value: 3 }
    ]
  });
  assert.equal(updated, true);
  assert.equal(FakeDialog.instances.length, 1);

  const closed = hooks.showDamageSplitObserverPopup({
    action: "close",
    requestId: "req-1"
  });
  assert.equal(closed, true);
  assert.equal(FakeDialog.closedCount, 1);

  const handled = await hooks.handleDamageSplitPopupMessage({
    eventId: "evt-1",
    requestId: "req-2",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    actorName: "Actor",
    sourceName: "Source",
    totalDamage: 9,
    allocations: [{ id: "a", name: "Target A", value: 9 }]
  }, "socket");
  assert.equal(handled, true);

  const duplicateHandled = await hooks.handleDamageSplitPopupMessage({
    eventId: "evt-1",
    requestId: "req-3",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    actorName: "Actor",
    sourceName: "Source",
    totalDamage: 9,
    allocations: [{ id: "a", name: "Target A", value: 9 }]
  }, "socket");
  assert.equal(duplicateHandled, false);
  assert.equal(warnings.length, 0);
}

run()
  .then(() => {
    console.log("damage-split-popup.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
