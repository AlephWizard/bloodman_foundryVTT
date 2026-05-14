import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "../..");
const SYSTEM_PATH_PREFIX = "systems/bloodman/";

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function readText(relativePath) {
  return fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function collectFiles(rootRelativePath, predicate) {
  const root = path.join(SYSTEM_ROOT, rootRelativePath);
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = toPosixPath(path.relative(SYSTEM_ROOT, absolutePath));
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath, predicate));
      continue;
    }
    if (!predicate || predicate(relativePath)) files.push(relativePath);
  }
  return files;
}

function collectModuleFiles() {
  const roots = ["bloodman.mjs", "rollHelpers.mjs", "src", "utils", "tests/unit"];
  const files = [];
  for (const root of roots) {
    const absoluteRoot = path.join(SYSTEM_ROOT, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    const stat = fs.statSync(absoluteRoot);
    if (stat.isFile() && root.endsWith(".mjs")) {
      files.push(root);
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...collectFiles(root, relativePath => relativePath.endsWith(".mjs")));
    }
  }
  return files.sort();
}

function collectStaticModuleSpecifiers(sourceText) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"'()]*?\s+from\s+["']([^"']+)["']/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceText))) {
      specifiers.push(String(match[1] || "").trim());
    }
  }
  return specifiers.filter(Boolean);
}

function resolveLocalModuleSpecifier(importerRelativePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const importerDir = path.dirname(importerRelativePath);
  const basePath = path.normalize(path.join(SYSTEM_ROOT, importerDir, specifier));
  const candidates = [
    basePath,
    `${basePath}.mjs`,
    `${basePath}.js`,
    `${basePath}.json`,
    path.join(basePath, "index.mjs")
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function assertLocalModuleImportsResolve() {
  for (const modulePath of collectModuleFiles()) {
    const sourceText = readText(modulePath);
    for (const specifier of collectStaticModuleSpecifiers(sourceText)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveLocalModuleSpecifier(modulePath, specifier);
      assert.ok(
        resolved,
        `Local import must resolve: ${modulePath} -> ${specifier}`
      );
    }
  }
}

function assertManifestEntriesResolve() {
  const manifest = readJson("system.json");
  for (const modulePath of manifest.esmodules || []) {
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, modulePath)), true, `Manifest esmodule must exist: ${modulePath}`);
  }
  for (const stylePath of manifest.styles || []) {
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, stylePath)), true, `Manifest stylesheet must exist: ${stylePath}`);
  }
  for (const language of manifest.languages || []) {
    const languagePath = String(language?.path || "").trim();
    assert.equal(Boolean(languagePath), true, "Manifest language path must not be empty");
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, languagePath)), true, `Manifest language file must exist: ${languagePath}`);
  }
  for (const mediaEntry of manifest.media || []) {
    const thumbnailPath = String(mediaEntry?.thumbnail || "").trim();
    if (!thumbnailPath.startsWith(SYSTEM_PATH_PREFIX)) continue;
    const relativePath = thumbnailPath.slice(SYSTEM_PATH_PREFIX.length);
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, relativePath)), true, `Manifest media asset must exist: ${thumbnailPath}`);
  }
  const backgroundPath = String(manifest.background || "").trim();
  if (backgroundPath.startsWith(SYSTEM_PATH_PREFIX)) {
    const relativePath = backgroundPath.slice(SYSTEM_PATH_PREFIX.length);
    assert.equal(fs.existsSync(path.join(SYSTEM_ROOT, relativePath)), true, `Manifest background asset must exist: ${backgroundPath}`);
  }
}

function assertTemplateSystemAssetsResolve() {
  for (const templatePath of collectFiles("templates", relativePath => relativePath.endsWith(".html"))) {
    const sourceText = readText(templatePath);
    const pathPattern = /["'](systems\/bloodman\/[^"']+)["']/g;
    let match;
    while ((match = pathPattern.exec(sourceText))) {
      const systemPath = String(match[1] || "").trim();
      const relativePath = systemPath.slice(SYSTEM_PATH_PREFIX.length);
      assert.equal(
        fs.existsSync(path.join(SYSTEM_ROOT, relativePath)),
        true,
        `Template system asset must exist: ${templatePath} -> ${systemPath}`
      );
    }
  }
}

function run() {
  assertLocalModuleImportsResolve();
  assertManifestEntriesResolve();
  assertTemplateSystemAssetsResolve();
}

run();
console.log("module-linkage.test.mjs: OK");
