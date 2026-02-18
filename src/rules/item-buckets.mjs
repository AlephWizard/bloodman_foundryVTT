export function createItemBucketRules({
  itemBucketTypes = [],
  carriedItemTypes
} = {}) {
  const bucketTypes = Array.isArray(itemBucketTypes) ? itemBucketTypes : [];
  const carriedTypes = carriedItemTypes instanceof Set
    ? carriedItemTypes
    : new Set(Array.isArray(carriedItemTypes) ? carriedItemTypes : []);

  function buildTypedItemBuckets(items = []) {
    const buckets = Object.fromEntries(bucketTypes.map(type => [type, []]));
    for (const item of items || []) {
      const type = String(item?.type || "").trim().toLowerCase();
      if (Array.isArray(buckets[type])) buckets[type].push(item);
    }
    return buckets;
  }

  function getActorItemCounts(items = []) {
    const counts = {
      total: 0,
      aptitudes: 0,
      pouvoirs: 0,
      carried: 0
    };
    for (const item of items || []) {
      if (!item) continue;
      counts.total += 1;
      const type = String(item.type || "").trim().toLowerCase();
      if (type === "aptitude") counts.aptitudes += 1;
      if (type === "pouvoir") counts.pouvoirs += 1;
      if (carriedTypes.has(type)) counts.carried += 1;
    }
    return counts;
  }

  return {
    buildTypedItemBuckets,
    getActorItemCounts
  };
}
