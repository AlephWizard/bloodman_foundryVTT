import { SYSTEM_TEMPLATE_PARTIAL_PATHS } from "../core/constants.mjs";

export async function registerBloodmanTemplatePartials({
  loadTemplatesFn = globalThis.loadTemplates,
  partialPaths = SYSTEM_TEMPLATE_PARTIAL_PATHS,
  logger = null
} = {}) {
  const paths = Array.isArray(partialPaths)
    ? partialPaths.filter(path => typeof path === "string" && path.trim())
    : [];

  if (!paths.length) return { ok: true, loaded: [] };

  if (typeof loadTemplatesFn !== "function") {
    logger?.warn?.("template partial preload skipped", { reason: "missing loadTemplates" });
    return { ok: false, loaded: [], reason: "missing-loadTemplates" };
  }

  try {
    await loadTemplatesFn(paths);
    return { ok: true, loaded: paths };
  } catch (error) {
    logger?.warn?.("template partial preload failed", { error });
    return { ok: false, loaded: [], reason: "load-failed", error };
  }
}
