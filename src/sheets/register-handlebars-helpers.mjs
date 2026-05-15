export const BLOODMAN_HANDLEBARS_HELPERS = Object.freeze({
  lt: (left, right) => Number(left) < Number(right),
  gt: (left, right) => Number(left) > Number(right)
});

export function registerBloodmanHandlebarsHelpers({
  handlebars = globalThis.Handlebars,
  helpers = BLOODMAN_HANDLEBARS_HELPERS
} = {}) {
  if (!handlebars || typeof handlebars.registerHelper !== "function") {
    return { ok: false, registered: [], skipped: [], reason: "missing-handlebars" };
  }

  const registered = [];
  const skipped = [];
  for (const [name, helper] of Object.entries(helpers || {})) {
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof helper !== "function") continue;
    if (typeof handlebars.helpers?.[name] === "function") {
      skipped.push(name);
      continue;
    }
    handlebars.registerHelper(name, helper);
    registered.push(name);
  }

  return { ok: true, registered, skipped };
}
