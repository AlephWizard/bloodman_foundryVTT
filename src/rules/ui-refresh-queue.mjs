export function createUiRefreshQueueRules() {
  function mergeDeferredForce(currentForce = false, incomingForce = false) {
    return Boolean(currentForce) || Boolean(incomingForce);
  }

  function resolveDeferredRoot(currentRoot = null, incomingRoot = null) {
    if (incomingRoot?.find) return incomingRoot;
    if (currentRoot?.find) return currentRoot;
    return null;
  }

  return {
    mergeDeferredForce,
    resolveDeferredRoot
  };
}
