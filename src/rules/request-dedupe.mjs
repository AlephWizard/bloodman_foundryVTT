export function createRequestRetentionTracker({
  retentionMs,
  getNow
} = {}) {
  const requests = new Map();
  const resolveNow = typeof getNow === "function" ? getNow : () => Date.now();
  const ttl = Number.isFinite(Number(retentionMs)) ? Number(retentionMs) : 0;

  function prune(nowValue = resolveNow()) {
    for (const [key, value] of requests.entries()) {
      if (nowValue - value > ttl) requests.delete(key);
    }
  }

  function rememberRequest(requestId) {
    if (!requestId) return;
    const nowValue = resolveNow();
    requests.set(requestId, nowValue);
    prune(nowValue);
  }

  function wasRequestProcessed(requestId) {
    if (!requestId) return false;
    return requests.has(requestId);
  }

  return {
    rememberRequest,
    wasRequestProcessed,
    prune
  };
}
