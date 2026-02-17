const LOG_LEVEL_PRIORITY = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  off: 99
});

const DEFAULT_LOG_LEVEL = "error";
const LOG_PREFIX = "[bloodman]";
const LOG_BURST_WINDOW_MS = 2_000;
const LOG_BURST_MAX = 250;

let runtimeLogLevel = DEFAULT_LOG_LEVEL;
let burstWindowStart = Date.now();
let burstCount = 0;
let burstSuppressed = 0;

function normalizeLevel(level) {
  const key = String(level || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LOG_LEVEL_PRIORITY, key) ? key : DEFAULT_LOG_LEVEL;
}

function shouldLog(level) {
  const messagePriority = LOG_LEVEL_PRIORITY[normalizeLevel(level)];
  const threshold = LOG_LEVEL_PRIORITY[normalizeLevel(runtimeLogLevel)];
  return messagePriority >= threshold;
}

function canWriteLogNow() {
  const now = Date.now();
  if ((now - burstWindowStart) >= LOG_BURST_WINDOW_MS) {
    if (burstSuppressed > 0) {
      console.warn(`${LOG_PREFIX} log burst limited: ${burstSuppressed} message(s) suppressed`);
    }
    burstWindowStart = now;
    burstCount = 0;
    burstSuppressed = 0;
  }
  if (burstCount >= LOG_BURST_MAX) {
    burstSuppressed += 1;
    return false;
  }
  burstCount += 1;
  return true;
}

function write(level, message, context) {
  if (!shouldLog(level)) return;
  if (!canWriteLogNow()) return;
  const method = level === "error" ? "error" : level === "warn" ? "warn" : level === "info" ? "info" : "debug";
  const normalizedMessage = String(message || "").trim();
  const payload = normalizedMessage.startsWith(LOG_PREFIX)
    ? normalizedMessage
    : `${LOG_PREFIX} ${normalizedMessage}`;
  if (context === undefined) console[method](payload);
  else console[method](payload, context);
}

export function setLogLevel(level) {
  runtimeLogLevel = normalizeLevel(level);
  return runtimeLogLevel;
}

export function getLogLevel() {
  return runtimeLogLevel;
}

export function configureLoggerFromSettings({
  systemId = "bloodman",
  settingKey = "debugLogLevel",
  fallbackLevel = DEFAULT_LOG_LEVEL
} = {}) {
  let nextLevel = fallbackLevel;
  try {
    const settingPath = `${systemId}.${settingKey}`;
    if (game?.settings?.settings?.has(settingPath)) {
      nextLevel = game.settings.get(systemId, settingKey);
    }
  } catch (_error) {
    // fallback to provided level when the setting is not yet registered
  }
  return setLogLevel(nextLevel);
}

export const bmLog = Object.freeze({
  debug: (message, context) => write("debug", message, context),
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, context) => write("error", message, context)
});
