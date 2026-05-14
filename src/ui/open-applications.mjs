function valuesFromRegistry(registry) {
  if (!registry) return [];
  if (registry instanceof Map) return Array.from(registry.values());
  if (Array.isArray(registry)) return registry;
  if (typeof registry.values === "function") {
    try {
      return Array.from(registry.values());
    } catch (_error) {
      return [];
    }
  }
  if (typeof registry === "object") return Object.values(registry);
  return [];
}

export function getApplicationDocumentActor(application) {
  const actor = application?.actor || application?.document || application?.object || null;
  if (!actor) return null;
  if (actor.documentName && String(actor.documentName) !== "Actor") return null;
  if (!actor.items) return null;
  return actor;
}

export function collectOpenApplications({
  uiNamespace = globalThis.ui,
  foundryNamespace = globalThis.foundry
} = {}) {
  const applications = [];
  const seen = new Set();
  const seenObjects = new WeakSet();
  const addApplication = application => {
    if (!application || typeof application !== "object") return;
    if (seenObjects.has(application)) return;
    seenObjects.add(application);
    const key = String(application.appId ?? application.id ?? application.options?.id ?? "");
    const fallbackKey = key || `${applications.length}:${application.constructor?.name || "Application"}`;
    if (seen.has(fallbackKey)) return;
    seen.add(fallbackKey);
    applications.push(application);
  };

  for (const application of valuesFromRegistry(uiNamespace?.windows)) addApplication(application);
  for (const application of valuesFromRegistry(foundryNamespace?.applications?.instances)) addApplication(application);
  return applications;
}
