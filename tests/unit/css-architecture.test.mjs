import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function readText(relativePath) {
  return fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8");
}

function collectCssFiles(rootRelativePath = "styles") {
  const root = path.join(SYSTEM_ROOT, rootRelativePath);
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = toPosixPath(path.relative(SYSTEM_ROOT, absolutePath));
    if (entry.isDirectory()) {
      files.push(...collectCssFiles(relativePath));
      continue;
    }
    if (entry.isFile() && relativePath.endsWith(".css")) files.push(relativePath);
  }
  return files.sort();
}

function parseCssImports(cssText) {
  const imports = [];
  const importPattern = /@import\s+url\("([^"]+)"\);/g;
  let match;
  while ((match = importPattern.exec(cssText))) imports.push(String(match[1] || "").trim());
  return imports.filter(Boolean);
}

function resolveCssImport(importerPath, importPath) {
  if (/^https?:\/\//i.test(importPath)) return null;
  return toPosixPath(path.normalize(path.join(path.dirname(importerPath), importPath)));
}

function collectReachableCss(entryPath, seen = new Set()) {
  if (seen.has(entryPath)) return seen;
  seen.add(entryPath);
  for (const importPath of parseCssImports(readText(entryPath))) {
    const resolvedPath = resolveCssImport(entryPath, importPath);
    if (!resolvedPath) continue;
    collectReachableCss(resolvedPath, seen);
  }
  return seen;
}

function assertCssImportsAreAcyclic(entryPath, stack = [], seen = new Set()) {
  assert.equal(stack.includes(entryPath), false, `CSS import cycle detected: ${[...stack, entryPath].join(" -> ")}`);
  if (seen.has(entryPath)) return;
  seen.add(entryPath);

  const imports = parseCssImports(readText(entryPath));
  assert.deepEqual(
    imports,
    [...new Set(imports)],
    `CSS file should not import the same path twice: ${entryPath}`
  );

  for (const importPath of imports) {
    const resolvedPath = resolveCssImport(entryPath, importPath);
    if (!resolvedPath) continue;
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, resolvedPath)), true, `CSS import must exist: ${entryPath} -> ${importPath}`);
    assertCssImportsAreAcyclic(resolvedPath, [...stack, entryPath], seen);
  }
}

function run() {
  const manifest = JSON.parse(readText("system.json"));
  assert.deepEqual(manifest.styles, ["styles/bloodman.css"], "System manifest should load the CSS import facade only");

  assert.deepEqual(parseCssImports(readText("styles/bloodman.css")), [
    "./bloodman-base.css",
    "./dialogs/drop-decision.css",
    "./actor-personnage.css",
    "./features/carried-items.css",
    "./item-unified.css"
  ]);

  assert.deepEqual(parseCssImports(readText("styles/bloodman-base.css")), [
    "./base/foundation.css",
    "./ui/chaos-panel.css",
    "./dialogs/bloodman-dialogs.css",
    "./dialogs/player-resource-actions.css",
    "./ui/document-create-type-icons.css",
    "./dialogs/bloodman-dialog-responsive.css",
    "./chat.css",
    "./ui/token-hud.css",
    "./base/item-sheet-shared-overrides.css",
    "./ui/chaos-panel-overrides.css",
    "./dialogs/bloodman-dialog-overrides.css",
    "./ui/chaos-panel-final.css"
  ]);

  assert.deepEqual(parseCssImports(readText("styles/actor-personnage.css")), [
    "./actors/actor-personnage-core.css",
    "./actors/actor-personnage-reference-layout.css",
    "./actors/actor-personnage-characteristics-layout.css",
    "./actors/actor-personnage-visual-pass.css",
    "./actors/actor-personnage-window.css",
    "./actors/actor-personnage-responsive.css",
    "./actors/actor-personnage-ux.css"
  ]);

  assert.deepEqual(parseCssImports(readText("styles/item-unified.css")), [
    "./items/item-unified-core.css",
    "./items/item-unified-layout.css",
    "./items/item-unified-polish.css"
  ]);

  assertCssImportsAreAcyclic("styles/bloodman.css");
  const reachableCss = collectReachableCss("styles/bloodman.css");
  assert.deepEqual(
    [...reachableCss].sort(),
    collectCssFiles().sort(),
    "Every local CSS file should be reachable from the manifest facade"
  );

  for (const cssPath of collectCssFiles("styles/ui").filter(filePath => filePath.includes("chaos-panel"))) {
    const cssText = readText(cssPath);
    assert.equal(
      /bloodman-(?:damage|insufficient|drop)|bm-(?:damage|insufficient|drop)/.test(cssText),
      false,
      `${cssPath} should stay scoped to the chaos panel, not dialogs`
    );
  }

  for (const cssPath of collectCssFiles("styles/dialogs")) {
    const cssText = readText(cssPath);
    assert.equal(cssText.includes("#bm-chaos-dice"), false, `${cssPath} should not style the chaos panel`);
  }

  const itemPolishCss = readText("styles/items/item-unified-polish.css");
  for (const itemType of ["aptitude", "arme", "objet", "pouvoir", "protection", "ration", "soin"]) {
    assert.equal(
      itemPolishCss.includes(`.bloodman-item.bm-item-sheet.bm-item-unified.item-${itemType}`),
      true,
      `Unified item sheet should define a visual identity for item type: ${itemType}`
    );
  }
}

run();
console.log("css-architecture.test.mjs: OK");
