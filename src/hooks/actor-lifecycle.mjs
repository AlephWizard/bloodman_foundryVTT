export function createActorLifecycleHooks({
  clearResolvedActorDocumentCaches = () => {},
  onUpdateActorCore = async () => {}
} = {}) {
  async function onUpdateActor(actor, changes = {}, options = {}, userId = "") {
    clearResolvedActorDocumentCaches();
    await onUpdateActorCore(actor, changes, options, userId);
  }

  function onActorDocumentCacheInvalidated() {
    clearResolvedActorDocumentCaches();
  }

  return {
    onUpdateActor,
    onActorDocumentCacheInvalidated
  };
}
