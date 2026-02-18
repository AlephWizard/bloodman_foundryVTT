import assert from "node:assert/strict";
import { buildPowerUsePopupHooks } from "../../src/hooks/power-use-popup.mjs";

async function run() {
  const emits = [];
  const chats = [];
  const logs = [];
  const remembered = new Set();
  const currentUser = { id: "u1", name: "Player", isGM: false, role: 2 };

  const hooks = buildPowerUsePopupHooks({
    hasSocket: () => true,
    socketEmit: (_channel, payload) => {
      emits.push(payload);
      return true;
    },
    systemSocket: "system.bloodman",
    getCurrentUser: () => currentUser,
    getActivePrivilegedOperatorIds: () => ["u1", "gm1"],
    normalizeRollDieFormula: (value, fallback) => String(value || fallback || "d4"),
    toBooleanFlag: value => value === true || String(value).toLowerCase() === "true",
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    enableChatTransportFallback: true,
    createChatMessage: async data => {
      chats.push(data);
      return data;
    },
    powerUsePopupChatMarkup: "<span>x</span>",
    isAssistantOrHigherRole: role => Number(role) >= 2,
    formatMultilineTextToHtml: value => String(value || "").replace(/\n/g, "<br>"),
    escapeHtml: value => String(value || "").replace(/</g, "&lt;"),
    dialogClass: class {
      constructor(config, options) {
        this.config = config;
        this.options = options;
      }
      render(_value) {
        logs.push("rendered");
      }
    },
    wasPowerUsePopupRequestProcessed: id => remembered.has(id),
    rememberPowerUsePopupRequest: id => remembered.add(id),
    logWarn: (...args) => logs.push(args),
    logError: (...args) => logs.push(args)
  });

  assert.equal(hooks.getPopupItemLabel("aptitude"), "Aptitude");
  assert.equal(hooks.getPopupItemLabel("pouvoir"), "Pouvoir");
  assert.deepEqual(hooks.getPowerUsePopupViewerIds("u1"), ["gm1"]);
  assert.deepEqual(hooks.getPowerUsePopupViewerIds("u1", { includeRequesterUser: true }), ["u1", "gm1"]);

  const emitted = hooks.emitPowerUsePopup(
    { id: "a1", name: "Hero" },
    { id: "it1", type: "pouvoir", name: "Boule", system: { damageEnabled: true, damageDie: "d6", powerCostEnabled: true, powerCost: 2 } },
    { fromUseButton: true }
  );
  assert.equal(emitted, true);
  assert.equal(emits.length, 1);
  assert.equal(emits[0].type, "powerUsePopup");
  assert.equal(chats.length, 1);
  assert.equal(chats[0].flags.bloodman.powerUsePopup.type, "powerUsePopup");

  const canReceive = hooks.canCurrentUserReceivePowerUsePopup({
    requesterUserId: "u2",
    viewerIds: ["u1"]
  });
  assert.equal(canReceive, true);

  const cannotReceive = hooks.canCurrentUserReceivePowerUsePopup({
    requesterUserId: "u1",
    viewerIds: []
  });
  assert.equal(cannotReceive, false);

  const shown = hooks.showPowerUsePopup({
    actorName: "Hero",
    requesterUserName: "Player",
    itemType: "pouvoir",
    itemName: "Boule",
    powerDescription: "line1\nline2",
    powerCostEnabled: true,
    powerCost: 2,
    damageEnabled: true,
    damageFormula: "d6"
  });
  assert.equal(shown, true);

  const handledOnce = await hooks.handlePowerUsePopupMessage({
    eventId: "evt-1",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    itemType: "pouvoir",
    itemName: "Boule"
  });
  assert.equal(handledOnce, true);

  const handledDuplicate = await hooks.handlePowerUsePopupMessage({
    eventId: "evt-1",
    requesterUserId: "u2",
    viewerIds: ["u1"],
    itemType: "pouvoir",
    itemName: "Boule"
  });
  assert.equal(handledDuplicate, false);
}

run()
  .then(() => {
    console.log("power-use-popup.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
