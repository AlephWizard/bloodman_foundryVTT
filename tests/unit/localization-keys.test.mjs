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

function collectRuntimeFiles() {
  return [
    "bloodman.mjs",
    ...collectFiles("src", relativePath => relativePath.endsWith(".mjs")),
    ...collectFiles("templates", relativePath => relativePath.endsWith(".html"))
  ].sort();
}

function hasLocalizationKey(dictionary, key) {
  return key.split(".").every(part => {
    if (!dictionary || typeof dictionary !== "object" || !(part in dictionary)) return false;
    dictionary = dictionary[part];
    return true;
  });
}

function collectStaticBloodmanLocalizationKeys(sourceText) {
  const keys = [];
  const patterns = [
    /localize\s+["'](BLOODMAN\.[A-Za-z0-9_.]+)["']/g,
    /\b(?:t|tl|translate|translateWithFallback)\(\s*["'](BLOODMAN\.[A-Za-z0-9_.]+)["']/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceText))) keys.push(String(match[1] || "").trim());
  }
  return keys.filter(Boolean);
}

function run() {
  const dictionary = JSON.parse(readText("lang/fr.json"));
  const missing = [];
  for (const filePath of collectRuntimeFiles()) {
    for (const key of collectStaticBloodmanLocalizationKeys(readText(filePath))) {
      if (!hasLocalizationKey(dictionary, key)) missing.push(`${filePath}: ${key}`);
    }
  }
  assert.deepEqual(missing, [], "Every static BLOODMAN localization key should exist in lang/fr.json");
}

run();
console.log("localization-keys.test.mjs: OK");
