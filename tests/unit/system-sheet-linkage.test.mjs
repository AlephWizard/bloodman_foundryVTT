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

function parseConstStringMap(sourceText) {
  const map = new Map();
  const pattern = /(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)";/g;
  let match;
  while ((match = pattern.exec(sourceText))) {
    map.set(String(match[1] || "").trim(), String(match[2] || "").trim());
  }
  return map;
}

function parseConstArrayMap(sourceText) {
  const map = new Map();
  const pattern = /(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*(?:Object\.freeze\()?\[([^\]]*)\]\)?;/g;
  let match;
  while ((match = pattern.exec(sourceText))) {
    map.set(String(match[1] || "").trim(), parseQuotedList(match[2] || ""));
  }
  return map;
}

function parseTypesExpression(rawExpression, constStrings, constArrays) {
  const values = [];
  const expression = String(rawExpression || "").trim();
  if (!expression) return values;
  const parts = expression.split(",").map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("...")) {
      const arrayName = part.slice(3).trim();
      for (const value of constArrays.get(arrayName) || []) values.push(value);
      continue;
    }
    const quoted = part.match(/^"([^"]+)"$/);
    if (quoted) {
      values.push(String(quoted[1] || "").trim());
      continue;
    }
    if (constStrings.has(part)) {
      values.push(String(constStrings.get(part) || "").trim());
      continue;
    }
    for (const value of constArrays.get(part) || []) values.push(value);
  }
  return values.filter(Boolean);
}

function parseRuntimeRegisteredTypes(sourceText, collectionName) {
  const set = new Set();
  const constStrings = parseConstStringMap(sourceText);
  const constArrays = parseConstArrayMap(sourceText);
  const pattern = new RegExp(
    `${collectionName}\\.registerSheet\\([^\\)]*?types:\\s*\\[([^\\]]*)\\]`,
    "g"
  );
  let match;
  while ((match = pattern.exec(sourceText))) {
    const parsedValues = parseTypesExpression(match[1], constStrings, constArrays);
    for (const type of parsedValues) set.add(type);
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
  const templateConstPattern = /(?:export\s+)?const\s+[A-Z0-9_]+_TEMPLATE_PATH\s*=\s*`[^`]*\/(templates\/[^`]+)`;/g;
  while ((match = templateConstPattern.exec(sourceText))) {
    paths.add(String(match[1] || "").trim());
  }
  return paths;
}

function parseIconKeySet(sourceText, constName) {
  const blockPattern = new RegExp(`(?:export\\s+)?const\\s+${constName}\\s*=\\s*(?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}\\)?;`);
  const block = blockPattern.exec(sourceText)?.[1] || "";
  const keys = [];
  const keyPattern = /\"([^\"]+)\"\s*:/g;
  let match;
  while ((match = keyPattern.exec(block))) keys.push(String(match[1] || "").trim());
  return new Set(keys.filter(Boolean));
}

function assertAbilitiesPowersDropScopes(templateText, label) {
  assert.equal(
    templateText.includes('class="card aptitudes-card" data-item-list-drop-target="true"'),
    true,
    `${label} actor sheet should make the aptitude card a drop target`
  );
  assert.equal(
    templateText.includes('class="card powers-card" data-item-list-drop-target="true"'),
    true,
    `${label} actor sheet should make the power card a drop target`
  );
  assert.equal(
    /<ol class="item-list \{\{#if aptitudesThreeColumns\}\}item-list-split-columns\{\{\/if\}\}" data-reorder-scope="aptitude" data-accepted-types="aptitude">/.test(templateText),
    true,
    `${label} actor sheet should accept aptitude drops only on the aptitude list`
  );
  assert.equal(
    /<ol class="item-list \{\{#if pouvoirsThreeColumns\}\}item-list-split-columns\{\{\/if\}\}" data-reorder-scope="pouvoir" data-accepted-types="pouvoir">/.test(templateText),
    true,
    `${label} actor sheet should accept power drops only on the power list`
  );
}

function collectLocalCssImports(relativePath, seen = new Set()) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  if (seen.has(normalizedPath)) return [];
  seen.add(normalizedPath);

  const cssText = readText(normalizedPath);
  const imports = [];
  const importPattern = /@import\s+url\("([^"]+)"\);/g;
  let match;
  while ((match = importPattern.exec(cssText))) {
    const importPath = String(match[1] || "").trim();
    if (!importPath || /^https?:\/\//i.test(importPath)) continue;
    const resolvedPath = path
      .normalize(path.join(path.dirname(normalizedPath), importPath))
      .replaceAll("\\", "/");
    imports.push(resolvedPath);
    imports.push(...collectLocalCssImports(resolvedPath, seen));
  }
  return imports;
}

function run() {
  const systemJson = JSON.parse(readText("system.json"));
  const runtimeSource = readText("bloodman.mjs");
  const coreConstantsSource = readText("src/core/constants.mjs");
  const sheetRegistrationSource = readText("src/sheets/register-sheets.mjs");
  const runtimeAndConstantsSource = `${coreConstantsSource}\n${sheetRegistrationSource}\n${runtimeSource}`;
  const documentCreateTypeIconsSource = readText("src/ui/document-create-type-icons.mjs");
  const itemSheetCss = readText("styles/item-unified.css");
  const playerSheetTemplate = readText("templates/actor-joueur.html");
  const npcSheetTemplate = readText("templates/actor-non-joueur.html");
  const itemSheetTemplate = readText("templates/item-unified.html");

  const declaredActorTypes = new Set(Object.keys(systemJson?.documentTypes?.Actor || {}));
  const declaredItemTypes = new Set(Object.keys(systemJson?.documentTypes?.Item || {}));

  const registeredActorTypes = parseRuntimeRegisteredTypes(runtimeAndConstantsSource, "actorsCollection");
  const registeredItemTypes = parseRuntimeRegisteredTypes(runtimeAndConstantsSource, "itemsCollection");

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

  const actorIconTypes = parseIconKeySet(documentCreateTypeIconsSource, "ACTOR_CREATE_TYPE_ICONS");
  const itemIconTypes = parseIconKeySet(documentCreateTypeIconsSource, "ITEM_CREATE_TYPE_ICONS");

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

  const referencedTemplates = parseTemplatePathsFromRuntime(runtimeAndConstantsSource);
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

  assert.equal(
    itemSheetTemplate.includes("name=\"system.inventorySlots\""),
    true,
    "Unified item sheet should expose the inventory slot field"
  );

  const bagToggleDisabledPattern = /class="bag-slots-toggle"[^>]*\{\{#if bagSlotsToggleDisabled\}\}disabled\{\{\/if\}\}/;
  assert.equal(
    bagToggleDisabledPattern.test(playerSheetTemplate),
    true,
    "Player actor sheet should keep the bag toggle visible but disabled when needed"
  );
  assert.equal(
    bagToggleDisabledPattern.test(npcSheetTemplate),
    true,
    "NPC actor sheet should keep the bag toggle visible but disabled when needed"
  );

  assertAbilitiesPowersDropScopes(playerSheetTemplate, "Player");
  assertAbilitiesPowersDropScopes(npcSheetTemplate, "NPC");

  const manifestCssFiles = systemJson.styles || [];
  for (const cssPath of manifestCssFiles) {
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, cssPath)), true, `Manifest CSS file must exist: ${cssPath}`);
    for (const importedPath of collectLocalCssImports(cssPath)) {
      assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, importedPath)), true, `CSS import must exist: ${importedPath}`);
    }
  }

  assert.equal(
    runtimeSource.includes('html.find(".bm-item-top, .bm-item-img-el").attr("draggable", true);'),
    true,
    "Unified item sheet should expose a draggable item header/image"
  );
  assert.equal(
    runtimeSource.includes("onItemSheetDragStart(eventLike)"),
    true,
    "Unified item sheet should publish item drag data"
  );
}

run();
console.log("system-sheet-linkage.test.mjs: OK");
