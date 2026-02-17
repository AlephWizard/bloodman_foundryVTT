import { configureLoggerFromSettings, setLogLevel } from "./logger.mjs";

export const SYSTEM_ID = "bloodman";
export const BLOODMAN_SETTING_KEYS = Object.freeze({
  DEBUG_LOG_LEVEL: "debugLogLevel"
});

const LOG_LEVEL_CHOICES = Object.freeze({
  off: "Off",
  error: "Error",
  warn: "Warn",
  info: "Info",
  debug: "Debug"
});

function t(key, fallback) {
  const localized = game?.i18n?.localize?.(key);
  if (!localized || localized === key) return fallback;
  return localized;
}

export function registerBloodmanCoreSettings() {
  game.settings.register(SYSTEM_ID, BLOODMAN_SETTING_KEYS.DEBUG_LOG_LEVEL, {
    name: t("BLOODMAN.Settings.DebugLogLevelName", "Bloodman log level"),
    hint: t("BLOODMAN.Settings.DebugLogLevelHint", "Controls Bloodman console log verbosity."),
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: t("BLOODMAN.Settings.LogLevelOff", LOG_LEVEL_CHOICES.off),
      error: t("BLOODMAN.Settings.LogLevelError", LOG_LEVEL_CHOICES.error),
      warn: t("BLOODMAN.Settings.LogLevelWarn", LOG_LEVEL_CHOICES.warn),
      info: t("BLOODMAN.Settings.LogLevelInfo", LOG_LEVEL_CHOICES.info),
      debug: t("BLOODMAN.Settings.LogLevelDebug", LOG_LEVEL_CHOICES.debug)
    },
    default: "warn",
    onChange: value => {
      setLogLevel(value);
    }
  });
}

export function initializeBloodmanLoggerFromSettings() {
  configureLoggerFromSettings({
    systemId: SYSTEM_ID,
    settingKey: BLOODMAN_SETTING_KEYS.DEBUG_LOG_LEVEL,
    fallbackLevel: "warn"
  });
}

