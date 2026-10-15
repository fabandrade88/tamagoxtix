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
  assert.equal(readConfig().palette, "beach");
  assert.equal(readConfig().sidebar, false);
  mkdirSync(join(root, "config", "tamaclaude"), { recursive: true });
  writeFileSync(join(root, "config", "tamaclaude", "config.json"), "{ not json");
  assert.equal(readConfig().palette, "beach");
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

test("the herdr look goes in and comes out without changing the person's config", async () => {
  const { apply, strip } = await import("../herdr/src/theme.mjs");
  const { PALETTES, resolvePalette } = await import("../herdr/src/lib/palettes.mjs");
  const original = [
    'onboarding = false',
    '[theme]',
    'name = "terminal"',
    '[theme.custom]',
    'panel_bg = "black"',
    '[ui]',
    'accent = "blue"',
    'tab_bar_right = [',
    '  { type = "hostname" },',
    ']',
    'pane_gaps = false',
    '',
  ].join("\n");
  for (const id of Object.keys(PALETTES)) {
    const themed = apply(original, resolvePalette(id), { colors: "palette" });
    assert.equal(strip(themed).replace(/\n*$/, "\n"), original, id);
    assert.match(themed, /# tamaclaude-disabled: panel_bg = "black"/);
    assert.match(themed, /# tamaclaude-disabled: {3}\{ type = "hostname" \},/);
    assert.equal(apply(themed, resolvePalette(id), { colors: "palette" }), themed, `${id}: applying twice changes nothing`);
    if (hasHerdr) {
      mkdirSync(join(root, "config", "herdr"), { recursive: true });
      writeFileSync(join(root, "config", "herdr", "config.toml"), themed);
      const res = spawnSync("herdr", ["config", "check"], { env: { ...process.env, HOME: root }, encoding: "utf8" });
      assert.equal(res.stdout.trim(), "config: ok", `${id}: ${res.stdout}${res.stderr}`);
    }
  }
});

test("the powerline status line draws every segment and survives empty input", () => {
  const script = new URL("../claude/scripts/statusline.mjs", import.meta.url).pathname;
  const input = {
    model: { display_name: "Opus 5.5" },
    workspace: { current_dir: root },
    context_window: { used_percentage: 95 },
    rate_limits: { five_hour: { used_percentage: 20 }, seven_day: { used_percentage: 75 } },
    cost: { total_duration_ms: 3_900_000 },
  };
  const res = spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  const text = res.stdout.replace(/\x1b\[[0-9;]*m/g, "");
  for (const part of ["Opus 5.5", "95%", "5h 20%", "wk 75%", "1h05", ""]) assert.ok(text.includes(part), part);
  assert.match(res.stdout, /\x1b\[48;2;/, "segments have background colors");
  const empty = spawnSync(process.execPath, [script], { input: "", encoding: "utf8" });
  assert.equal(empty.status, 0);
  const hostile = spawnSync(process.execPath, [script], { input: JSON.stringify({ model: { display_name: "x\u001b]0;pwn\u0007" } }), encoding: "utf8" });
  assert.ok(!hostile.stdout.includes("\u001b]0;"), "no escape sequences from the input");
});

test("following herdr's theme writes no colors at all", async () => {
  const { apply, strip } = await import("../herdr/src/theme.mjs");
  const { resolvePalette } = await import("../herdr/src/lib/palettes.mjs");
  const original = '[theme]\nname = "solarized"\n[ui]\naccent = "blue"\n';
  const themed = apply(original, resolvePalette("nord"));
  assert.ok(!/"#[0-9a-f]{6}"/.test(themed), "no hex colors");
  assert.ok(!themed.includes("[theme.custom]") && !themed.includes("ui.sidebar"));
  assert.match(themed, /tab_bar_right = \[/);
  assert.match(themed, /^accent = "blue"$/m, "the person's accent stays");
  assert.equal(strip(themed).replace(/\n*$/, "\n"), original);
});
