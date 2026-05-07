export function buildCanvasReadyHooks({
  installTokenEffectBackgroundPatch,
  installTokenHudRenderPatch,
  installTokenHudDomObserver,
  scheduleTokenHudDomEnhancement,
  applyTransparentTokenEffectBackground,
  refreshBossSoloNpcPvMax,
  repairTokenTextureSource,
  shouldApplyTokenHudPatches
} = {}) {
  const canApplyTokenHudPatches = typeof shouldApplyTokenHudPatches === "function"
    ? shouldApplyTokenHudPatches
    : () => true;

  function applyCanvasReadyTokenHudEnhancements() {
    if (!canApplyTokenHudPatches()) return;
    installTokenEffectBackgroundPatch();
    installTokenHudRenderPatch();
    installTokenHudDomObserver();
    scheduleTokenHudDomEnhancement();
    for (const token of globalThis.canvas?.tokens?.placeables || []) {
      applyTransparentTokenEffectBackground(token);
    }
  }

  async function applyCanvasReadyBossSoloRefresh() {
    if (!globalThis.game?.user?.isGM) return;
    await refreshBossSoloNpcPvMax();
  }

  async function applyCanvasReadyTokenTextureRepair() {
    for (const token of globalThis.canvas?.tokens?.placeables || []) {
      await repairTokenTextureSource(token);
    }
  }

  async function onCanvasReady() {
    applyCanvasReadyTokenHudEnhancements();
    await applyCanvasReadyBossSoloRefresh();
    await applyCanvasReadyTokenTextureRepair();
  }

  return {
    applyCanvasReadyTokenHudEnhancements,
    applyCanvasReadyBossSoloRefresh,
    applyCanvasReadyTokenTextureRepair,
    onCanvasReady
  };
}
