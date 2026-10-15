// node --test tests/ — the herdr plugin's pieces that run without a server.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "tamaclaude-herdr-"));
process.env.XDG_CONFIG_HOME = join(root, "config");
process.env.XDG_STATE_HOME = join(root, "state");
delete process.env.HERDR_SOCKET_PATH;

const hasHerdr = spawnSync("herdr", ["--version"]).status === 0;

test("the manifest has what herdr and its marketplace require", () => {
  const toml = readFileSync(new URL("../herdr/herdr-plugin.toml", import.meta.url), "utf8");
  for (const key of ["id", "name", "version", "min_herdr_version"]) assert.match(toml, new RegExp(`^${key} = "`, "m"), key);
  assert.match(toml, /^platforms = \["linux", "macos", "windows"\]/m);
});

test("the sidebar block is valid herdr config, for every palette and icon set", { skip: !hasHerdr && "herdr not installed" }, async () => {
  const { block } = await import("../herdr/src/sidebar.mjs");
  const { PALETTES, resolvePalette } = await import("../herdr/src/lib/palettes.mjs");
  mkdirSync(join(root, "config", "herdr"), { recursive: true });
  for (const id of Object.keys(PALETTES)) {
    for (const set of ["nerd", "emoji"]) {
      writeFileSync(join(root, "config", "herdr", "config.toml"), block(resolvePalette(id), set) + "\n");
      const res = spawnSync("herdr", ["config", "check"], { env: { ...process.env, HOME: root }, encoding: "utf8" });
      assert.equal(res.stdout.trim(), "config: ok", `${id}/${set}: ${res.stdout}${res.stderr}`);
    }
  }
});

test("config falls back to defaults and survives a broken file", async () => {
  const { readConfig, writeConfig } = await import("../herdr/src/common.mjs");
  assert.equal(readConfig().palette, "omarchy");
  assert.equal(readConfig().sidebar, false);
  mkdirSync(join(root, "config", "tamaclaude"), { recursive: true });
  writeFileSync(join(root, "config", "tamaclaude", "config.json"), "{ not json");
  assert.equal(readConfig().palette, "omarchy");
  writeConfig({ palette: "nord" });
  assert.equal(readConfig().palette, "nord");
});

test("usage survives an empty, missing or corrupt transcripts folder", async () => {
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  const { summarize } = await import("../shared/usage-node.mjs");
  let s = summarize({ days: 3 });
  assert.equal(s.today.tokens, 0);
  const project = join(root, "claude", "projects", "p");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "bad.jsonl"), 'garbage\n{"type":"assistant","message":{"usage":{}}}\n{"usage": 1\n');
  s = summarize({ days: 3 });
  assert.equal(s.today.tokens, 0);
  assert.equal(s.days.length, 3);
});
