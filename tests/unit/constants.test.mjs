import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHAOS_DICE_ICON_FALLBACK_SRC,
  CHAOS_DICE_ICON_SRC,
  ITEM_SHEET_TEMPLATE_PATH,
  NPC_ACTOR_SHEET_TEMPLATE_PATH,
  NPC_ACTOR_TYPE,
  PLAYER_ACTOR_SHEET_TEMPLATE_PATH,
  PLAYER_ACTOR_TYPE,
  SYSTEM_ID,
  SYSTEM_ITEM_TYPES,
  SYSTEM_TEMPLATE_PARTIAL_PATHS,
  SYSTEM_ROOT_PATH,
  SYSTEM_SOCKET
} from "../../src/core/constants.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8"));
}

function assertSystemPathExists(systemPath, label) {
  assert.equal(
    systemPath.startsWith(`${SYSTEM_ROOT_PATH}/`),
    true,
    `${label} should use the configured system root path`
  );

  const relativePath = systemPath.slice(`${SYSTEM_ROOT_PATH}/`.length);
  assert.equal(
    fs.existsSync(path.join(SYSTEM_ROOT, relativePath)),
    true,
    `${label} should exist: ${systemPath}`
  );
}

function run() {
  const manifest = readJson("system.json");

  assert.equal(SYSTEM_ID, manifest.id, "SYSTEM_ID should match system.json id");
  assert.equal(SYSTEM_ROOT_PATH, `systems/${SYSTEM_ID}`, "SYSTEM_ROOT_PATH should derive from SYSTEM_ID");
  assert.equal(SYSTEM_SOCKET, `system.${SYSTEM_ID}`, "SYSTEM_SOCKET should derive from SYSTEM_ID");

  assert.deepEqual(
    [PLAYER_ACTOR_TYPE, NPC_ACTOR_TYPE].sort(),
    Object.keys(manifest.documentTypes?.Actor || {}).sort(),
    "Actor type constants should match system.json document types"
  );

  assert.deepEqual(
    [...SYSTEM_ITEM_TYPES].sort(),
    Object.keys(manifest.documentTypes?.Item || {}).sort(),
    "Item type constants should match system.json document types"
  );

  assertSystemPathExists(PLAYER_ACTOR_SHEET_TEMPLATE_PATH, "Player actor sheet template");
  assertSystemPathExists(NPC_ACTOR_SHEET_TEMPLATE_PATH, "NPC actor sheet template");
  assertSystemPathExists(ITEM_SHEET_TEMPLATE_PATH, "Item sheet template");
  for (const [index, partialPath] of SYSTEM_TEMPLATE_PARTIAL_PATHS.entries()) {
    assertSystemPathExists(partialPath, `Template partial #${index + 1}`);
  }
  assertSystemPathExists(CHAOS_DICE_ICON_SRC, "Chaos dice icon");

  assert.equal(
    CHAOS_DICE_ICON_FALLBACK_SRC.startsWith("icons/"),
    true,
    "Chaos dice fallback icon should target a Foundry core icon path"
  );
}

run();
console.log("constants.test.mjs: OK");
