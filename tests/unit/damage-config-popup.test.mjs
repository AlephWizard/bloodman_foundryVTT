import assert from "node:assert/strict";
import { buildDamageConfigPopupHooks } from "../../src/hooks/damage-config-popup.mjs";

class FakeDialog {
  static instances = [];
  static renderedCount = 0;
  static closedCount = 0;

  constructor(config, options) {
    this.config = config;
    this.options = options;
    this.element = {
      length: 1,
      find: () => ({
        toggleClass: () => {},
        text: () => {},
        val: () => {},
        prop: () => {}
      }),
      closest: () => ({
        toggleClass: () => {}
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

  const hooks = buildDamageConfigPopupHooks({
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    t: key => (key === "BLOODMAN.Common.Yes" ? "Oui" : (key === "BLOODMAN.Common.No" ? "Non" : key)),
    getCurrentUser: () => localUser,
    getUsersCollection: () => users,
    isAssistantOrHigherRole: role => Number(role) >= 2,
    escapeHtml: value => String(value || "").replace(/</g, "&lt;"),
    dialogClass: FakeDialog,
    wasDamageConfigPopupRequestProcessed: id => remembered.has(id),
    rememberDamageConfigPopupRequest: id => remembered.add(id),
    logWarn: (...args) => warnings.push(args)
  });

  assert.equal(hooks.canCurrentUserReceiveDamageConfigPopup({
    requesterUserId: "u2",
    viewerIds: ["u1"]
  }), true);
  assert.equal(hooks.canCurrentUserReceiveDamageConfigPopup({
    requesterUserId: "u1",
    viewerIds: ["u1"]
  }), false);
  assert.equal(hooks.canCurrentUserReceiveDamageConfigPopup({
    requesterUserId: "u2",
    viewerIds: ["u3"]
  }), false);

  const shown = hooks.showDamageConfigObserverPopup({
    requestId: "req-1",
    requesterUserId: "u2",
    actorName: "Actor",
    sourceName: "Source",
    config: {
      formula: "1d6",
      degats: "normal",
      bonusBrut: 2,
      penetration: 1,
      rollKeepHighest: true
    }
  });
  assert.equal(shown, true);
  assert.equal(FakeDialog.instances.length, 1);
  assert.equal(FakeDialog.renderedCount, 1);
  assert.equal(FakeDialog.instances[0].config.content.includes("Degats bruts +"), true);

  const updated = hooks.showDamageConfigObserverPopup({
    requestId: "req-1",
    requesterUserId: "u2",
    actorName: "Actor",
    sourceName: "Source",
    config: {
      formula: "1d4",
      degats: "light"
    }
  });
  assert.equal(updated, true);
  assert.equal(FakeDialog.instances.length, 1);

  const closed = hooks.showDamageConfigObserverPopup({
    action: "close",
    requestId: "req-1"
  });
  assert.equal(closed, true);
  assert.equal(FakeDialog.closedCount, 1);

  const handled = await hooks.handleDamageConfigPopupMessage({
    eventId: "evt-1",
    requestId: "req-2",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    actorName: "Actor",
    sourceName: "Source",
    config: { formula: "1d6", degats: "normal" }
  }, "socket");
  assert.equal(handled, true);

  const duplicateHandled = await hooks.handleDamageConfigPopupMessage({
    eventId: "evt-1",
    requestId: "req-3",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    actorName: "Actor",
    sourceName: "Source",
    config: { formula: "1d6", degats: "normal" }
  }, "socket");
  assert.equal(duplicateHandled, false);
  assert.equal(warnings.length, 0);
}

run()
  .then(() => {
    console.log("damage-config-popup.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
