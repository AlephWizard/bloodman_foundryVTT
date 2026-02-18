import { bmLog } from "../../utils/logger.mjs";

const SYSTEM_ID = "bloodman";
const SCHEMA_SETTING_KEY = "schemaVersion";
const INCLUDE_COMPENDIUMS_SETTING_KEY = "includeCompendiumMigrations";
const LAST_REPORT_SETTING_KEY = "lastMigrationReport";
const NOTE_BACKUP_FLAG_PATH = "flags.bloodman.migrations.noteBackup";
const CURRENCY_CURRENT_MAX = 1_000_000;
const NPC_ROLE_OPTIONS = new Set(["", "sbire", "sbire-fort", "boss-seul"]);

function getPropertyCompat(source, path, fallback = undefined) {
  if (!source || !path) return fallback;
  if (typeof globalThis.foundry?.utils?.getProperty === "function") {
    const value = globalThis.foundry.utils.getProperty(source, path);
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

function setPropertyCompat(target, path, value) {
  if (!target || !path) return target;
  if (typeof globalThis.foundry?.utils?.setProperty === "function") {
    globalThis.foundry.utils.setProperty(target, path, value);
    return target;
  }
  const segments = String(path).split(".").filter(Boolean);
  if (!segments.length) return target;
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== "object") cursor[segment] = {};
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
  return target;
}

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(numeric));
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function roundCurrencyValue(value) {
  const rounded = Math.round((toFiniteNumber(value, 0) * 100)) / 100;
  const asInteger = Math.round(rounded);
  if (Math.abs(rounded - asInteger) <= 0.000001) return asInteger;
  return rounded;
}

function normalizeCurrencyCurrentValue(value, fallback = 0) {
  const raw = String(value ?? "").trim();
  const normalizedRaw = raw.replace(",", ".");
  const numeric = Number(normalizedRaw);
  const fallbackNumeric = toFiniteNumber(fallback, 0);
  const safeFallback = Math.max(0, fallbackNumeric);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > CURRENCY_CURRENT_MAX) {
    return roundCurrencyValue(safeFallback);
  }
  return roundCurrencyValue(Math.max(0, numeric));
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function normalizeTransportNpcRefs(value) {
  const rawEntries = [];
  if (Array.isArray(value)) {
    rawEntries.push(...value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      if (/[\n,;]/.test(trimmed)) rawEntries.push(...trimmed.split(/[\n,;]+/));
      else rawEntries.push(trimmed);
    }
  }

  const unique = new Set();
  const result = [];
  for (const entry of rawEntries) {
    const ref = String(entry || "").trim();
    if (!ref || unique.has(ref)) continue;
    unique.add(ref);
    result.push(ref);
  }
  return result;
}

function normalizeNpcRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return NPC_ROLE_OPTIONS.has(role) ? role : "";
}

function normalizeXpArray(value) {
  const source = Array.isArray(value) ? value : [];
  return [Boolean(source[0]), Boolean(source[1]), Boolean(source[2])];
}

function areArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasSettingsRegistry() {
  return Boolean(globalThis.game?.settings && typeof game.settings.register === "function");
}

function readMigrationSetting(settingKey, fallback) {
  try {
    return game.settings.get(SYSTEM_ID, settingKey);
  } catch (_error) {
    return fallback;
  }
}

async function writeMigrationSetting(settingKey, value) {
  return game.settings.set(SYSTEM_ID, settingKey, value);
}

export function registerBloodmanMigrationSettings() {
  if (!hasSettingsRegistry()) return;

  game.settings.register(SYSTEM_ID, SCHEMA_SETTING_KEY, {
    name: "Bloodman schema version",
    hint: "Internal schema migration version for Bloodman.",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(SYSTEM_ID, INCLUDE_COMPENDIUMS_SETTING_KEY, {
    name: "Bloodman include compendiums in startup migrations",
    hint: "When enabled, unlocked Actor and Item compendiums are migrated at startup.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, LAST_REPORT_SETTING_KEY, {
    name: "Bloodman last migration report",
    hint: "Internal JSON report of the last migration run.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

function getStoredSchemaVersion() {
  return toNonNegativeInteger(readMigrationSetting(SCHEMA_SETTING_KEY, 0), 0);
}

function getConfiguredIncludeCompendiums() {
  return Boolean(readMigrationSetting(INCLUDE_COMPENDIUMS_SETTING_KEY, false));
}

async function setStoredSchemaVersion(nextVersion) {
  const normalized = toNonNegativeInteger(nextVersion, 0);
  await writeMigrationSetting(SCHEMA_SETTING_KEY, normalized);
  return normalized;
}

async function setLastMigrationReport(report) {
  if (!hasSettingsRegistry()) return false;
  try {
    const payload = JSON.stringify(report || {});
    await writeMigrationSetting(LAST_REPORT_SETTING_KEY, payload);
    return true;
  } catch (error) {
    bmLog.warn("migration:report persistence failed", { error });
    return false;
  }
}

export function getLastBloodmanMigrationReport() {
  const raw = String(readMigrationSetting(LAST_REPORT_SETTING_KEY, "") || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function normalizeMigrationRunOptions(options = {}, defaults = {}) {
  const explicit = options && typeof options === "object" ? options.includeCompendiums : undefined;
  if (typeof explicit === "boolean") {
    return { includeCompendiums: explicit };
  }
  return {
    includeCompendiums: Boolean(defaults?.includeCompendiums)
  };
}

export function computeLegacyNoteMigrationData(itemSource = {}) {
  if (!itemSource || typeof itemSource !== "object") return null;
  const note = normalizeText(getPropertyCompat(itemSource, "system.note"));
  if (note) return null;
  const legacyNotes = normalizeText(getPropertyCompat(itemSource, "system.notes"));
  if (!legacyNotes) return null;
  return {
    "system.note": legacyNotes
  };
}

export function computeActorStructureMigrationData(actorSource = {}) {
  if (!actorSource || typeof actorSource !== "object") return null;
  const updateData = {};

  const actorType = String(actorSource?.type || "").trim().toLowerCase();
  const sourceNpcRole = String(getPropertyCompat(actorSource, "system.npcRole", "") || "").trim().toLowerCase();
  const normalizedNpcRole = actorType === "personnage-non-joueur" ? normalizeNpcRole(sourceNpcRole) : "";
  if (sourceNpcRole !== normalizedNpcRole) {
    updateData["system.npcRole"] = normalizedNpcRole;
  }

  const profile = getPropertyCompat(actorSource, "system.profile");
  if (profile && typeof profile === "object") {
    const quickNotesRaw = getPropertyCompat(profile, "quickNotes", "");
    const normalizedQuickNotes = normalizeText(quickNotesRaw);
    if (quickNotesRaw !== normalizedQuickNotes) {
      updateData["system.profile.quickNotes"] = normalizedQuickNotes;
    }
  }

  const equipment = getPropertyCompat(actorSource, "system.equipment");
  if (equipment && typeof equipment === "object") {
    const rawCurrencyType = getPropertyCompat(equipment, "monnaies", "");
    const normalizedCurrencyType = String(rawCurrencyType ?? "").trim();
    if (rawCurrencyType !== normalizedCurrencyType) {
      updateData["system.equipment.monnaies"] = normalizedCurrencyType;
    }

    const rawCurrencyCurrent = getPropertyCompat(equipment, "monnaiesActuel", 0);
    const normalizedCurrencyCurrent = normalizeCurrencyCurrentValue(rawCurrencyCurrent, 0);
    const parsedCurrencyCurrent = Number(String(rawCurrencyCurrent ?? "").trim().replace(",", "."));
    const normalizedParsedCurrencyCurrent = Number.isFinite(parsedCurrencyCurrent)
      ? roundCurrencyValue(parsedCurrencyCurrent)
      : Number.NaN;
    if (!Object.is(normalizedParsedCurrencyCurrent, normalizedCurrencyCurrent)) {
      updateData["system.equipment.monnaiesActuel"] = normalizedCurrencyCurrent;
    }

    const rawBagSlotsEnabled = getPropertyCompat(equipment, "bagSlotsEnabled", false);
    const normalizedBagSlotsEnabled = normalizeBooleanFlag(rawBagSlotsEnabled, false);
    if (rawBagSlotsEnabled !== normalizedBagSlotsEnabled) {
      updateData["system.equipment.bagSlotsEnabled"] = normalizedBagSlotsEnabled;
    }

    const rawTransportRefs = getPropertyCompat(equipment, "transportNpcs", []);
    const normalizedTransportRefs = normalizeTransportNpcRefs(rawTransportRefs);
    const hasNonStringTransportRef = Array.isArray(rawTransportRefs)
      && rawTransportRefs.some(entry => typeof entry !== "string");
    const comparableTransportRefs = Array.isArray(rawTransportRefs)
      ? rawTransportRefs.map(entry => String(entry || "").trim())
      : [];
    if (
      !Array.isArray(rawTransportRefs)
      || hasNonStringTransportRef
      || !areArraysEqual(comparableTransportRefs, normalizedTransportRefs)
    ) {
      updateData["system.equipment.transportNpcs"] = normalizedTransportRefs;
    }
  }

  const characteristics = getPropertyCompat(actorSource, "system.characteristics");
  if (characteristics && typeof characteristics === "object") {
    for (const [key, payload] of Object.entries(characteristics)) {
      if (!payload || typeof payload !== "object") continue;
      const normalizedXp = normalizeXpArray(payload.xp);
      if (!areArraysEqual(payload.xp, normalizedXp)) {
        updateData[`system.characteristics.${key}.xp`] = normalizedXp;
      }
    }
  }

  return Object.keys(updateData).length ? updateData : null;
}

function buildItemMigrationUpdate(itemDocument) {
  if (!itemDocument) return null;
  const source = typeof itemDocument.toObject === "function"
    ? itemDocument.toObject()
    : itemDocument;
  const migrationData = computeLegacyNoteMigrationData(source);
  if (!migrationData) return null;

  const updateData = { ...migrationData };
  const hasBackupFlag = getPropertyCompat(source, NOTE_BACKUP_FLAG_PATH) != null;
  if (!hasBackupFlag) {
    const backup = normalizeText(getPropertyCompat(source, "system.notes"));
    setPropertyCompat(updateData, NOTE_BACKUP_FLAG_PATH, backup);
  }
  return updateData;
}

function buildActorMigrationUpdate(actorDocument) {
  if (!actorDocument) return null;
  const source = typeof actorDocument.toObject === "function"
    ? actorDocument.toObject()
    : actorDocument;
  return computeActorStructureMigrationData(source);
}

function buildCounter() {
  return {
    examined: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    scannedPacks: 0,
    failedPacks: 0
  };
}

function mergeCounters(target, source) {
  if (!target || !source) return target;
  for (const key of Object.keys(target)) {
    target[key] += toNonNegativeInteger(source[key], 0);
  }
  return target;
}

async function migrateDocumentCollection(documents = [], buildUpdateData, { origin = "world" } = {}) {
  const counters = buildCounter();
  for (const document of documents) {
    counters.examined += 1;
    const updateData = typeof buildUpdateData === "function" ? buildUpdateData(document) : null;
    if (!updateData || typeof updateData !== "object" || !Object.keys(updateData).length) {
      counters.skipped += 1;
      continue;
    }
    try {
      await document.update(updateData, { diff: true });
      counters.updated += 1;
    } catch (error) {
      counters.failed += 1;
      bmLog.warn("migration:document update failed", {
        origin,
        documentId: document?.id,
        documentName: document?.name,
        error
      });
    }
  }
  return counters;
}

async function migrateEmbeddedActorItems(actors = [], { origin = "world-actors" } = {}) {
  const counters = buildCounter();
  for (const actor of actors) {
    const updates = [];
    const actorItems = Array.from(actor?.items || []);
    for (const item of actorItems) {
      counters.examined += 1;
      const updateData = buildItemMigrationUpdate(item);
      if (!updateData) {
        counters.skipped += 1;
        continue;
      }
      updates.push({ _id: item.id, ...updateData });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates);
      counters.updated += updates.length;
    } catch (error) {
      counters.failed += updates.length;
      bmLog.warn("migration:embedded item update failed", {
        origin,
        actorId: actor?.id,
        actorName: actor?.name,
        attempted: updates.length,
        error
      });
    }
  }
  return counters;
}

async function migrateUnlockedCompendiums({
  documentName,
  includeCompendiums = false,
  migrationId = "compendium",
  migrateDocuments
} = {}) {
  const counters = buildCounter();
  if (!includeCompendiums) return counters;

  for (const pack of game?.packs || []) {
    if (pack?.documentName !== documentName) continue;
    if (pack?.locked) continue;

    counters.scannedPacks += 1;
    let documents = [];
    try {
      documents = await pack.getDocuments();
    } catch (error) {
      counters.failedPacks += 1;
      bmLog.warn("migration:compendium load failed", {
        migrationId,
        pack: pack?.collection,
        error
      });
      continue;
    }

    try {
      const packResult = await migrateDocuments(documents, pack);
      mergeCounters(counters, packResult);
    } catch (error) {
      counters.failedPacks += 1;
      bmLog.warn("migration:compendium step failed", {
        migrationId,
        pack: pack?.collection,
        error
      });
    }
  }

  return counters;
}

async function migrationStepNormalizeItemNote({ includeCompendiums = false } = {}) {
  const worldItems = await migrateDocumentCollection(
    Array.from(game?.items || []),
    buildItemMigrationUpdate,
    { origin: "world-items:item-note" }
  );

  const worldActorItems = await migrateEmbeddedActorItems(
    Array.from(game?.actors || []),
    { origin: "world-actors:item-note" }
  );

  const compendiumItems = await migrateUnlockedCompendiums({
    documentName: "Item",
    includeCompendiums,
    migrationId: "item-note",
    migrateDocuments: async (documents, pack) => migrateDocumentCollection(
      documents,
      buildItemMigrationUpdate,
      { origin: `pack:${pack?.collection}:item-note` }
    )
  });

  const compendiumActorItems = await migrateUnlockedCompendiums({
    documentName: "Actor",
    includeCompendiums,
    migrationId: "actor-embedded-item-note",
    migrateDocuments: async (documents, pack) => migrateEmbeddedActorItems(
      documents,
      { origin: `pack:${pack?.collection}:actor-item-note` }
    )
  });

  const failedUpdates = worldItems.failed
    + worldActorItems.failed
    + compendiumItems.failed
    + compendiumItems.failedPacks
    + compendiumActorItems.failed
    + compendiumActorItems.failedPacks;

  return {
    updatedWorldItems: worldItems.updated,
    updatedWorldActorItems: worldActorItems.updated,
    updatedCompendiumItems: compendiumItems.updated,
    updatedCompendiumActorItems: compendiumActorItems.updated,
    scannedCompendiumPacks: compendiumItems.scannedPacks + compendiumActorItems.scannedPacks,
    failedCompendiumPacks: compendiumItems.failedPacks + compendiumActorItems.failedPacks,
    failedUpdates
  };
}

async function migrationStepNormalizeActorStructure({ includeCompendiums = false } = {}) {
  const worldActors = await migrateDocumentCollection(
    Array.from(game?.actors || []),
    buildActorMigrationUpdate,
    { origin: "world-actors:structure" }
  );

  const compendiumActors = await migrateUnlockedCompendiums({
    documentName: "Actor",
    includeCompendiums,
    migrationId: "actor-structure",
    migrateDocuments: async (documents, pack) => migrateDocumentCollection(
      documents,
      buildActorMigrationUpdate,
      { origin: `pack:${pack?.collection}:actor-structure` }
    )
  });

  const failedUpdates = worldActors.failed + compendiumActors.failed + compendiumActors.failedPacks;

  return {
    updatedWorldActors: worldActors.updated,
    updatedCompendiumActors: compendiumActors.updated,
    scannedCompendiumPacks: compendiumActors.scannedPacks,
    failedCompendiumPacks: compendiumActors.failedPacks,
    failedUpdates
  };
}

const MIGRATION_STEPS = Object.freeze([
  {
    version: 1,
    id: "normalize-item-note-field",
    run: migrationStepNormalizeItemNote
  },
  {
    version: 2,
    id: "normalize-actor-structure",
    run: migrationStepNormalizeActorStructure
  }
]);

function getMigrationFailureCount(stepResult) {
  return toNonNegativeInteger(stepResult?.failedUpdates, 0);
}

function createRunReport({
  skipped = false,
  reason = "",
  includeCompendiums = false,
  schemaVersionBefore = 0,
  schemaVersion = 0,
  executed = [],
  failedStep = null,
  startedAt,
  finishedAt,
  errorMessage = ""
} = {}) {
  const start = toFiniteNumber(startedAt, Date.now());
  const end = toFiniteNumber(finishedAt, Date.now());
  return {
    skipped: Boolean(skipped),
    reason: String(reason || ""),
    includeCompendiums: Boolean(includeCompendiums),
    schemaVersionBefore: toNonNegativeInteger(schemaVersionBefore, 0),
    schemaVersion: toNonNegativeInteger(schemaVersion, 0),
    executed: Array.isArray(executed) ? executed : [],
    failedStep,
    errorMessage: String(errorMessage || ""),
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(end).toISOString(),
    durationMs: Math.max(0, Math.round(end - start))
  };
}

export async function runBloodmanMigrations(options = {}) {
  if (!hasSettingsRegistry()) {
    return createRunReport({ skipped: true, reason: "settings-unavailable" });
  }
  if (!game.user?.isGM) {
    return createRunReport({ skipped: true, reason: "not-gm" });
  }

  const runOptions = normalizeMigrationRunOptions(options, {
    includeCompendiums: getConfiguredIncludeCompendiums()
  });

  const startedAt = Date.now();
  const executed = [];
  let currentSchemaVersion = getStoredSchemaVersion();
  const schemaVersionBefore = currentSchemaVersion;

  try {
    for (const step of MIGRATION_STEPS) {
      const stepVersion = toNonNegativeInteger(step?.version, 0);
      if (stepVersion <= currentSchemaVersion) continue;

      const stepStartedAt = Date.now();
      bmLog.info("migration:start", {
        id: step.id,
        from: currentSchemaVersion,
        to: stepVersion,
        includeCompendiums: runOptions.includeCompendiums
      });

      const stepResult = await step.run({ includeCompendiums: runOptions.includeCompendiums });
      const failedUpdates = getMigrationFailureCount(stepResult);
      if (failedUpdates > 0) {
        const error = new Error(`Migration step \"${step.id}\" has ${failedUpdates} failed update(s).`);
        error.stepId = step.id;
        error.stepVersion = stepVersion;
        error.stepResult = stepResult;
        throw error;
      }

      await setStoredSchemaVersion(stepVersion);
      currentSchemaVersion = stepVersion;

      const record = {
        id: step.id,
        version: stepVersion,
        durationMs: Math.max(0, Math.round(Date.now() - stepStartedAt)),
        result: stepResult
      };
      executed.push(record);
      bmLog.info("migration:done", record);
    }

    const report = createRunReport({
      skipped: false,
      includeCompendiums: runOptions.includeCompendiums,
      schemaVersionBefore,
      schemaVersion: currentSchemaVersion,
      executed,
      startedAt,
      finishedAt: Date.now()
    });
    await setLastMigrationReport(report);
    return report;
  } catch (error) {
    const failedStep = error?.stepId
      ? {
        id: String(error.stepId || ""),
        version: toNonNegativeInteger(error.stepVersion, currentSchemaVersion),
        result: error.stepResult || null
      }
      : null;

    const report = createRunReport({
      skipped: false,
      includeCompendiums: runOptions.includeCompendiums,
      schemaVersionBefore,
      schemaVersion: currentSchemaVersion,
      executed,
      failedStep,
      errorMessage: String(error?.message || error || "migration-failed"),
      startedAt,
      finishedAt: Date.now()
    });

    await setLastMigrationReport(report);
    bmLog.error("migration:failed", {
      failedStep,
      schemaVersion: currentSchemaVersion,
      error
    });
    throw error;
  }
}
