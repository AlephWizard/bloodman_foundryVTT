import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTOR_LOGO_PARTIAL_PATH,
  ACTOR_TABS_PARTIAL_PATH,
  SYSTEM_ROOT_PATH,
  SYSTEM_TEMPLATE_PARTIAL_PATHS
} from "../../src/core/constants.mjs";
import { registerBloodmanTemplatePartials } from "../../src/sheets/register-template-partials.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");

function readText(relativePath) {
  return fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8");
}

function toRelativeSystemPath(systemPath) {
  assert.equal(
    systemPath.startsWith(`${SYSTEM_ROOT_PATH}/`),
    true,
    `${systemPath} should use the system root path`
  );
  return systemPath.slice(`${SYSTEM_ROOT_PATH}/`.length);
}

async function run() {
  assert.deepEqual(
    SYSTEM_TEMPLATE_PARTIAL_PATHS,
    [ACTOR_LOGO_PARTIAL_PATH, ACTOR_TABS_PARTIAL_PATH],
    "Template partial registry should list actor partials in preload order"
  );

  for (const partialPath of SYSTEM_TEMPLATE_PARTIAL_PATHS) {
    const relativePath = toRelativeSystemPath(partialPath);
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, relativePath)), true, `${partialPath} should exist`);
  }

  const actorTemplates = [
    readText("templates/actor-joueur.html"),
    readText("templates/actor-non-joueur.html")
  ];

  for (const template of actorTemplates) {
    assert.equal(
      template.includes(`{{> "${ACTOR_LOGO_PARTIAL_PATH}"}}`),
      true,
      "Actor templates should use the shared logo partial"
    );
    assert.equal(
      template.includes(`{{> "${ACTOR_TABS_PARTIAL_PATH}"}}`),
      true,
      "Actor templates should use the shared tabs partial"
    );
  }

  let loadedPaths = null;
  const preloadResult = await registerBloodmanTemplatePartials({
    loadTemplatesFn: async paths => {
      loadedPaths = paths;
    }
  });

  assert.equal(preloadResult.ok, true, "Template partial preload should succeed with a loader");
  assert.deepEqual(loadedPaths, SYSTEM_TEMPLATE_PARTIAL_PATHS, "Preload should use registered partial paths");

  const warnings = [];
  const missingLoaderResult = await registerBloodmanTemplatePartials({
    loadTemplatesFn: null,
    logger: { warn: (...args) => warnings.push(args) }
  });

  assert.equal(missingLoaderResult.ok, false, "Missing loadTemplates should be reported");
  assert.equal(missingLoaderResult.reason, "missing-loadTemplates", "Missing loader should have a stable reason");
  assert.equal(warnings.length, 1, "Missing loader should emit one warning");
}

await run();
console.log("template-partials.test.mjs: OK");
