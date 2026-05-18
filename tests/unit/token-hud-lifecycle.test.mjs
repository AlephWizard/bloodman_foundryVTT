import assert from "node:assert/strict";
import { createTokenHudLifecycleHooks } from "../../src/hooks/token-hud-lifecycle.mjs";

async function run() {
  const calls = [];
  const warnings = [];
  const infos = [];

  const enabledHooks = createTokenHudLifecycleHooks({
    shouldApplyTokenHudPatches: () => true,
    configureTokenHudEnhancements: (hud, html) => calls.push(["configure", hud.id, html.id]),
    canvasReadyHooks: {
      async onCanvasReady() {
        calls.push(["canvas-ready"]);
      }
    },
    initializeLoggerFromSettings: () => calls.push(["logger-init"]),
    logger: {
      info: message => infos.push(message),
      warn: (message, context) => warnings.push([message, context?.error?.message || ""])
    },
    installTokenEffectBackgroundPatch: () => calls.push(["effect-patch"]),
    ensureTokenHudLocalSvgIcons: async options => {
      calls.push(["icons", options]);
    },
    refreshTokenHudStatusEffectIconPaths: options => calls.push(["refresh-icons", options]),
    installTokenHudRenderPatch: () => calls.push(["render-patch"]),
    installTokenHudDomObserver: () => calls.push(["dom-observer"]),
    scheduleTokenHudDomEnhancement: () => calls.push(["schedule"])
  });

  assert.equal(enabledHooks.onRenderTokenHud({ id: "hud" }, { id: "html" }), true);
  assert.equal(enabledHooks.onControlToken(), true);
  await enabledHooks.onCanvasReady();
  assert.equal(enabledHooks.onReadyTokenHudPatches(), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["configure", "hud", "html"],
    ["schedule"],
    ["canvas-ready"],
    ["logger-init"],
    ["effect-patch"],
    ["icons", { copyMissing: true, force: true }],
    ["render-patch"],
    ["dom-observer"],
    ["schedule"],
    ["refresh-icons", { bumpCache: true }]
  ]);
  assert.deepEqual(infos, ["HUD patch build 2026-02-13-b loaded"]);
  assert.deepEqual(warnings, []);

  const disabledCalls = [];
  const disabledInfos = [];
  const disabledHooks = createTokenHudLifecycleHooks({
    shouldApplyTokenHudPatches: () => false,
    configureTokenHudEnhancements: () => disabledCalls.push("configure"),
    initializeLoggerFromSettings: () => disabledCalls.push("logger-init"),
    logger: { info: message => disabledInfos.push(message) },
    scheduleTokenHudDomEnhancement: () => disabledCalls.push("schedule")
  });
  assert.equal(disabledHooks.onRenderTokenHud({}, {}), false);
  assert.equal(disabledHooks.onControlToken(), false);
  assert.equal(disabledHooks.onReadyTokenHudPatches(), false);
  assert.deepEqual(disabledCalls, ["logger-init"]);
  assert.deepEqual(disabledInfos, ["HUD patch build disabled by world setting"]);

  const errorWarnings = [];
  const errorHooks = createTokenHudLifecycleHooks({
    shouldApplyTokenHudPatches: () => true,
    configureTokenHudEnhancements: () => {
      throw new Error("boom");
    },
    logger: {
      warn: (message, context) => errorWarnings.push([message, context.error.message])
    }
  });
  assert.equal(errorHooks.onRenderTokenHud({}, {}), false);
  assert.deepEqual(errorWarnings, [["token HUD enhancement skipped", "boom"]]);

  const iconWarnings = [];
  const iconHooks = createTokenHudLifecycleHooks({
    shouldApplyTokenHudPatches: () => true,
    ensureTokenHudLocalSvgIcons: async () => {
      throw new Error("copy failed");
    },
    logger: {
      info: () => {},
      warn: (message, context) => iconWarnings.push([message, context.error.message])
    }
  });
  iconHooks.onReadyTokenHudPatches();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(iconWarnings, [["token HUD svg icon sync skipped", "copy failed"]]);
}

run()
  .then(() => {
    console.log("token-hud-lifecycle.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
