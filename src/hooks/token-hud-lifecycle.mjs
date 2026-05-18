export function createTokenHudLifecycleHooks({
  shouldApplyTokenHudPatches = () => false,
  configureTokenHudEnhancements = () => {},
  canvasReadyHooks = null,
  initializeLoggerFromSettings = () => {},
  logger = console,
  installTokenEffectBackgroundPatch = () => {},
  ensureTokenHudLocalSvgIcons = async () => {},
  refreshTokenHudStatusEffectIconPaths = () => {},
  installTokenHudRenderPatch = () => {},
  installTokenHudDomObserver = () => {},
  scheduleTokenHudDomEnhancement = () => {}
} = {}) {
  function onRenderTokenHud(hud, html) {
    if (!shouldApplyTokenHudPatches()) return false;
    try {
      configureTokenHudEnhancements(hud, html);
      return true;
    } catch (error) {
      logger?.warn?.("token HUD enhancement skipped", { error });
      return false;
    }
  }

  async function onCanvasReady() {
    await canvasReadyHooks?.onCanvasReady?.();
  }

  function onControlToken() {
    if (!shouldApplyTokenHudPatches()) return false;
    scheduleTokenHudDomEnhancement();
    return true;
  }

  function onReadyTokenHudPatches() {
    initializeLoggerFromSettings();
    if (!shouldApplyTokenHudPatches()) {
      logger?.info?.("HUD patch build disabled by world setting");
      return false;
    }

    logger?.info?.("HUD patch build 2026-02-13-b loaded");
    installTokenEffectBackgroundPatch();
    void ensureTokenHudLocalSvgIcons({ copyMissing: true, force: true }).then(() => {
      refreshTokenHudStatusEffectIconPaths({ bumpCache: true });
    }).catch(error => {
      logger?.warn?.("token HUD svg icon sync skipped", { error });
    });
    installTokenHudRenderPatch();
    installTokenHudDomObserver();
    scheduleTokenHudDomEnhancement();
    return true;
  }

  return {
    onRenderTokenHud,
    onCanvasReady,
    onControlToken,
    onReadyTokenHudPatches
  };
}
