export function createRequestRetentionTracker({
  retentionMs,
  getNow
} = {}) {
  const requests = new Map();
  const resolveNow = typeof getNow === "function" ? getNow : () => Date.now();
  const parsedRetentionMs = Number(retentionMs);
  const ttl = Number.isFinite(parsedRetentionMs) ? Math.max(0, parsedRetentionMs) : 0;
  let lastPruneAt = Number.NEGATIVE_INFINITY;

  function shouldPrune(nowValue) {
    if (!Number.isFinite(nowValue)) return false;
    if (requests.size <= 0) return false;
    if (!Number.isFinite(lastPruneAt)) return true;
    return nowValue - lastPruneAt > ttl;
  }

  function prune(nowValue = resolveNow()) {
    if (!Number.isFinite(nowValue)) return;
    for (const [key, value] of requests.entries()) {
      if (nowValue - value > ttl) requests.delete(key);
    }
    lastPruneAt = nowValue;
  }

  function rememberRequest(requestId) {
    if (!requestId) return;
    const nowValue = resolveNow();
    requests.set(requestId, nowValue);
    if (requests.size > 128 || shouldPrune(nowValue)) prune(nowValue);
  }

  function wasRequestProcessed(requestId) {
    if (!requestId) return false;
    const nowValue = resolveNow();
    const rememberedAt = requests.get(requestId);
    if (!Number.isFinite(rememberedAt)) return false;
    if (nowValue - rememberedAt > ttl) {
      requests.delete(requestId);
      if (requests.size > 128 && shouldPrune(nowValue)) prune(nowValue);
      return false;
    }
    if (requests.size > 512 && shouldPrune(nowValue)) prune(nowValue);
    return true;
  }

  return {
    rememberRequest,
    wasRequestProcessed,
    prune
  };
}
