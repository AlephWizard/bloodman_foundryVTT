function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

export function createUpdatePathHelpers({ getProperty } = {}) {
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : defaultGetProperty;

  function hasUpdatePath(updateData, path) {
    if (!updateData || !path) return false;
    return Object.prototype.hasOwnProperty.call(updateData, path)
      || readProperty(updateData, path) !== undefined;
  }

  function getUpdatedPathValue(updateData, path, fallback) {
    if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
    const nested = readProperty(updateData, path);
    return nested === undefined ? fallback : nested;
  }

  return {
    hasUpdatePath,
    getUpdatedPathValue
  };
}
