// Copies shared/ into each package, since the herdr plugin and the Claude
// Code mod are installed from their own folders and cannot reach ../shared.
// Also carries package.json's version into the Claude Code manifest, the
// marketplace entry and the herdr manifest.
//   node scripts/sync-shared.mjs          copy
//   node scripts/sync-shared.mjs --check  fail when a copy or a version is stale
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = {
  "monsters.mjs": ["herdr/src/lib", "claude/hooks/lib"],
  "palettes.mjs": ["herdr/src/lib", "claude/hooks/lib", "claude/scripts"],
  "icons.mjs": ["herdr/src/lib", "claude/hooks/lib"],
  "scenes.mjs": ["herdr/src/lib", "claude/hooks/lib"],
  "scenes-more.mjs": ["herdr/src/lib", "claude/hooks/lib"],
  "scenes-cheer.mjs": ["herdr/src/lib", "claude/hooks/lib"],
  "forge.mjs": ["herdr/src/lib", "claude/hooks/lib", "claude/scripts"],
  "powerline.mjs": ["claude/scripts"],
  "usage-node.mjs": ["herdr/src/lib", "claude/scripts"],
};
const check = process.argv.includes("--check");
let stale = 0;

for (const [file, dirs] of Object.entries(targets)) {
  const source = join(root, "shared", file);
  const header = `// GENERATED from shared/${file} by scripts/sync-shared.mjs. Edit the original.\n`;
  const text = header + readFileSync(source, "utf8");
  for (const dir of dirs) {
    const dest = join(root, dir, file);
    if (check) {
      if (!existsSync(dest) || readFileSync(dest, "utf8") !== text) {
        console.error(`stale: ${dir}/${file}`);
        stale++;
      }
      continue;
    }
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(dest, text);
  }
}
// ---- one version everywhere ----

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const versioned = {
  "claude/.claude-plugin/plugin.json": [/("version":\s*")[^"]+(")/],
  ".claude-plugin/marketplace.json": [/("version":\s*")[^"]+(")/],
  "herdr/herdr-plugin.toml": [/^(version\s*=\s*")[^"]+(")/m],
};
for (const [file, [pattern]] of Object.entries(versioned)) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const next = text.replace(pattern, `$1${version}$2`);
  if (next === text) continue;
  if (check) {
    console.error(`stale version: ${file} (package.json says ${version})`);
    stale++;
  } else writeFileSync(path, next);
}
if (stale) process.exit(1);
