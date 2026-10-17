// Runs the Claude Code mod's tests. They live in tests/mod, outside the plugin
// folder, so the published plugin holds only the mod; `claude plugin test`
// wants them under the mod's folder, so this runs them in a copy of it.
//   node scripts/test-mod.mjs
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copy = mkdtempSync(join(tmpdir(), "tamagoxtix-mod-"));
let status = 1;
try {
  cpSync(join(root, "claude"), copy, { recursive: true });
  for (const file of readdirSync(join(root, "tests", "mod"))) {
    if (file.endsWith(".test.tsx") || file.endsWith(".test.ts")) cpSync(join(root, "tests", "mod", file), join(copy, "tests", file));
  }
  status = spawnSync("claude", ["plugin", "test", copy], { stdio: "inherit" }).status ?? 1;
} finally {
  rmSync(copy, { recursive: true, force: true });
}
process.exit(status);
