function asString(value, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function getPropertyCompat(source, path, fallback = undefined) {
  if (!source || !path) return fallback;
  if (typeof foundry?.utils?.getProperty === "function") {
    const value = foundry.utils.getProperty(source, path);
    return value === undefined ? fallback : value;
  }
  const segments = String(path).split(".").filter(Boolean);
  let cursor = source;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== "object") return fallback;
    cursor = cursor[segment];
  }
  return cursor === undefined ? fallback : cursor;
}

export async function compatFromUuid(uuid) {
  const normalized = asString(uuid);
  if (!normalized) return null;
  const resolver = globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  try {
    return await resolver(normalized);
  } catch (_error) {
    return null;
  }
}

export async function fromUuid(uuid) {
  return compatFromUuid(uuid);
}

export function compatFromUuidSync(uuid) {
  const normalized = asString(uuid);
  if (!normalized) return null;
  const resolver = globalThis.fromUuidSync;
  if (typeof resolver !== "function") return null;
  try {
    return resolver(normalized);
  } catch (_error) {
    return null;
  }
}

export function fromUuidSync(uuid) {
  return compatFromUuidSync(uuid);
}

export function compatGetDocumentClass(documentName) {
  const normalized = asString(documentName);
  if (!normalized) return null;
  const directResolver = globalThis.getDocumentClass;
  if (typeof directResolver === "function") {
    try {
      return directResolver(normalized) || null;
    } catch (_error) {
      // fallback below
    }
  }
  return globalThis.CONFIG?.[normalized]?.documentClass || null;
}

export function getDocumentClass(documentName) {
  return compatGetDocumentClass(documentName);
}

export async function updateDocument(document, updateData, options = {}) {
  if (!document || typeof document.update !== "function") return null;
  return document.update(updateData, options);
}

export async function compatEnrichHTML(content, options = {}) {
  const source = String(content ?? "");
  const textEditor = globalThis.TextEditor;
  if (!textEditor || typeof textEditor.enrichHTML !== "function") return source;
  try {
    return await textEditor.enrichHTML(source, options);
  } catch (_error) {
    return source;
  }
}

export async function enrichHTML(content, options = {}) {
  return compatEnrichHTML(content, options);
}

export function getDragEventData(event) {
  const textEditor = globalThis.TextEditor;
  if (textEditor && typeof textEditor.getDragEventData === "function") {
    try {
      return textEditor.getDragEventData(event) || {};
    } catch (_error) {
      // fallback below
    }
  }
  const raw = event?.dataTransfer?.getData?.("text/plain");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function getSocket() {
  return globalThis.game?.socket || null;
}

export function hasSocket() {
  return Boolean(getSocket());
}

export function socketEmit(channel, payload) {
  const socket = getSocket();
  const normalizedChannel = asString(channel);
  if (!socket || !normalizedChannel) return false;
  try {
    socket.emit(normalizedChannel, payload);
    return true;
  } catch (_error) {
    return false;
  }
}

export function socketOn(channel, handler) {
  const socket = getSocket();
  const normalizedChannel = asString(channel);
  if (!socket || !normalizedChannel || typeof handler !== "function") return false;
  try {
    socket.on(normalizedChannel, handler);
    return true;
  } catch (_error) {
    return false;
  }
}

export function socketOff(channel, handler) {
  const socket = getSocket();
  const normalizedChannel = asString(channel);
  if (!socket || !normalizedChannel || typeof handler !== "function" || typeof socket.off !== "function") return false;
  try {
    socket.off(normalizedChannel, handler);
    return true;
  } catch (_error) {
    return false;
  }
}

export function getSystemData(documentLike) {
  if (!documentLike || typeof documentLike !== "object") return {};
  const systemModel = documentLike.system;
  if (systemModel && typeof systemModel === "object") return systemModel;
  const legacyModel = getPropertyCompat(documentLike, "data.data", null);
  if (legacyModel && typeof legacyModel === "object") return legacyModel;
  return {};
}

export function getSystemValue(documentLike, path, fallback = undefined) {
  const systemData = getSystemData(documentLike);
  return getPropertyCompat(systemData, path, fallback);
}
