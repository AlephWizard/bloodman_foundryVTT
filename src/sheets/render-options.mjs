export function isFoundryDocumentLike(value) {
  if (!value || typeof value !== "object") return false;
  const constructorName = String(value.constructor?.name || "");
  return Boolean(
    value.documentName
    || constructorName.endsWith("Document")
    || (typeof value.update === "function" && typeof value.toObject === "function")
  );
}

export function sanitizeRenderOptions(options = {}) {
  if (!options || typeof options !== "object") return {};
  const sanitized = { ...options };
  for (const [key, value] of Object.entries(sanitized)) {
    if (isFoundryDocumentLike(value)) delete sanitized[key];
  }
  return sanitized;
}

export function getDocumentUuidOrId(documentLike) {
  return String(documentLike?.uuid || documentLike?.id || documentLike?._id || "").trim();
}
