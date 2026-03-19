import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");

function readText(relativePath) {
  return fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8");
}

function parseQuotedList(raw = "") {
  const values = [];
  const matcher = /"([^"]+)"/g;
  let match;
  while ((match = matcher.exec(raw))) values.push(String(match[1] || "").trim());
  return values.filter(Boolean);
}

function parseRuntimeRegisteredTypes(sourceText, collectionName) {
  const set = new Set();
  const pattern = new RegExp(
    `${collectionName}\\.registerSheet\\(\\"bloodman\\",[\\s\\S]*?types:\\s*\\[([^\\]]*)\\]`,
    "g"
  );
  let match;
  while ((match = pattern.exec(sourceText))) {
    for (const type of parseQuotedList(match[1])) set.add(type);
  }
  return set;
}

function parseTemplatePathsFromRuntime(sourceText) {
  const paths = new Set();
  const actorTemplatePattern = /template:\s*"systems\/bloodman\/(templates\/[^"]+)"/g;
  let match;
  while ((match = actorTemplatePattern.exec(sourceText))) {
    paths.add(match[1]);
  }
  const itemTemplatePattern = /return\s+"systems\/bloodman\/(templates\/[^"]+)"/g;
  while ((match = itemTemplatePattern.exec(sourceText))) {
    paths.add(match[1]);
  }
  return paths;
}

function parseIconKeySet(sourceText, constName) {
  const blockPattern = new RegExp(`const\\s+${constName}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const block = blockPattern.exec(sourceText)?.[1] || "";
  const keys = [];
  const keyPattern = /\"([^\"]+)\"\s*:/g;
  let match;
  while ((match = keyPattern.exec(block))) keys.push(String(match[1] || "").trim());
  return new Set(keys.filter(Boolean));
}

function run() {
  const systemJson = JSON.parse(readText("system.json"));
  const runtimeSource = readText("bloodman.mjs");
  const itemSheetCss = readText("styles/item-unified.css");

  const declaredActorTypes = new Set(Object.keys(systemJson?.documentTypes?.Actor || {}));
  const declaredItemTypes = new Set(Object.keys(systemJson?.documentTypes?.Item || {}));

  const registeredActorTypes = parseRuntimeRegisteredTypes(runtimeSource, "ActorsCollection");
  const registeredItemTypes = parseRuntimeRegisteredTypes(runtimeSource, "ItemsCollection");

  assert.deepEqual(
    [...registeredActorTypes].sort(),
    [...declaredActorTypes].sort(),
    "Actor types declared in system.json must match runtime sheet registration"
  );

  assert.deepEqual(
    [...registeredItemTypes].sort(),
    [...declaredItemTypes].sort(),
    "Item types declared in system.json must match runtime sheet registration"
  );

  const actorIconTypes = parseIconKeySet(runtimeSource, "ACTOR_CREATE_TYPE_ICONS");
  const itemIconTypes = parseIconKeySet(runtimeSource, "ITEM_CREATE_TYPE_ICONS");

  assert.deepEqual(
    [...actorIconTypes].sort(),
    [...declaredActorTypes].sort(),
    "Actor create-type icon map must cover all actor types"
  );

  assert.deepEqual(
    [...itemIconTypes].sort(),
    [...declaredItemTypes].sort(),
    "Item create-type icon map must cover all item types"
  );

  const referencedTemplates = parseTemplatePathsFromRuntime(runtimeSource);
  for (const templatePath of referencedTemplates) {
    const absolutePath = path.join(SYSTEM_ROOT, templatePath);
    assert.equal(
      fs.existsSync(absolutePath),
      true,
      `Referenced template must exist: ${templatePath}`
    );
  }

  const runtimeTemplateSet = new Set(
    fs.readdirSync(path.join(SYSTEM_ROOT, "templates"))
      .filter(name => name.endsWith(".html"))
      .map(name => `templates/${name}`)
  );

  assert.deepEqual(
    [...runtimeTemplateSet].sort(),
    [...referencedTemplates].sort(),
    "Template directory should only contain runtime-referenced sheets"
  );

  const bagCountHardHiddenPattern = /\.bm-item-unified-section-links\s+\.bm-item-unified-field-bag-count\s*\{[^}]*display\s*:\s*none/mi;
  assert.equal(
    bagCountHardHiddenPattern.test(itemSheetCss),
    false,
    "Bag count field should not be hard-hidden by CSS"
  );
}

run();
console.log("system-sheet-linkage.test.mjs: OK");
