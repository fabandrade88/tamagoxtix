// node --test tests/
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { COLORS, FACE_MARKERS, faceFor, makeMonster, MODES, spriteGrid, spriteRuns } from "../shared/monsters.mjs";
import { claudeTheme, PALETTES, parseColorsToml, resolvePalette, SLOTS } from "../shared/palettes.mjs";

test("a seed always makes the same monster", () => {
  assert.deepEqual(makeMonster("w1:p1"), makeMonster("w1:p1"));
  const names = new Set(Array.from({ length: 40 }, (_, i) => makeMonster(`seed-${i}`).name));
  assert.ok(names.size > 20, "monsters should vary");
});

test("faces start with their color's bracket and carry state markers", () => {
  for (let i = 0; i < 50; i++) {
    const m = makeMonster(`face-${i}`);
    const color = COLORS.find((c) => c.slot === m.color);
    for (const state of ["idle", "working", "blocked", "done"]) {
      const face = faceFor(m, state, i);
      assert.ok(face.startsWith(color.left), `${face} should start with ${color.left}`);
    }
    assert.ok(faceFor(m, "blocked").endsWith(FACE_MARKERS.blocked));
    assert.ok(faceFor(m, "done").endsWith(FACE_MARKERS.done));
    // the markers the sidebar rules match must not show up in calmer states
    for (const state of ["idle", "working"]) {
      const face = faceFor(m, state, i);
      assert.ok(!face.includes(FACE_MARKERS.blocked) && !face.includes(FACE_MARKERS.done), face);
    }
  }
});

test("sprites are 12x6 px in every mode and frame", () => {
  const m = makeMonster("sprite");
  for (const mode of MODES) {
    for (let frame = 0; frame < 20; frame++) {
      const grid = spriteGrid(m, mode, frame);
      assert.equal(grid.length, 6);
      assert.ok(grid.every((row) => row.length === 12));
      const rows = spriteRuns(m, mode, frame);
      assert.equal(rows.length, 3);
      assert.ok(rows.every((runs) => runs.reduce((n, r) => n + r.text.length, 0) === 12));
    }
  }
});

test("Omarchy colors.toml parses in both shapes", () => {
  const named = parseColorsToml('accent = "#7aa2f7"\nbackground = "#1a1b26"\nforeground = "#a9b1d6"\nred = "#f7768e"\n');
  assert.equal(named.accent, "#7aa2f7");
  assert.equal(named.red, "#f7768e");
  const ansi = parseColorsToml('accent = "#979fec"\nforeground = "#ffffff"\nbackground = "#070506"\ncolor1 = "#b37580"\ncolor2 = "#648ed0"\n');
  assert.equal(ansi.red, "#b37580");
  assert.equal(ansi.green, "#648ed0");
  for (const slot of SLOTS) assert.match(ansi[slot], /^#[0-9a-f]{6}$/);
});

test("every palette has an orange to highlight with, Omarchy themes without one too", async () => {
  const { HIGHLIGHT_ORANGE, hexToRgb } = await import("../shared/palettes.mjs");
  const ansiOnly = parseColorsToml('foreground = "#ffffff"\nbackground = "#070506"\ncolor3 = "#e095b5"\n');
  assert.equal(ansiOnly.orange, HIGHLIGHT_ORANGE);
  for (const [id, p] of Object.entries(PALETTES)) {
    const [r, g, b] = hexToRgb(p.orange);
    assert.ok(r > g && g >= b, `${id}: ${p.orange} reads as orange`);
  }
});

test("every palette fills every slot", () => {
  for (const [id, p] of Object.entries(PALETTES)) {
    for (const slot of SLOTS) assert.match(p[slot], /^#[0-9a-f]{6}$/, `${id}.${slot}`);
  }
  assert.equal(resolvePalette("omarchy", undefined).id, "claude");
  assert.equal(resolvePalette("nope").id, "claude");
});

test("the Claude Code theme is made of hex colors", () => {
  const theme = claudeTheme(PALETTES.nord);
  assert.equal(theme.base, "dark");
  for (const value of Object.values(theme.overrides)) assert.match(value, /^#[0-9a-f]{6}$/);
});

test("usage sums tokens per day and skips duplicate responses", async () => {
  const root = mkdtempSync(join(tmpdir(), "tamaclaude-"));
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.XDG_STATE_HOME = join(root, "state");
  const project = join(root, "claude", "projects", "demo");
  mkdirSync(project, { recursive: true });
  // noon, so "minutes ago" never crosses midnight
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const now = noon.getTime();
  const line = (id, minutesAgo, out) =>
    JSON.stringify({
      type: "assistant",
      requestId: `req_${id}`,
      timestamp: new Date(now - minutesAgo * 60_000).toISOString(),
      message: { id: `msg_${id}`, usage: { input_tokens: 10, output_tokens: out, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 } },
    });
  // msg_a appears twice, as streaming writes do
  writeFileSync(join(project, "s.jsonl"), [line("a", 5, 50), line("a", 5, 50), line("b", 3, 20)].join("\n"));
  const { summarize } = await import("../shared/usage-node.mjs");
  const summary = summarize({ days: 7, now });
  assert.equal(summary.today.requests, 2);
  assert.equal(summary.today.output, 70);
  assert.equal(summary.today.tokens, 2 * 110 + 70);
  assert.equal(summary.days.length, 7);
  assert.ok(summary.session && summary.session.tokens === summary.today.tokens);
});

test("icons: same seed, same icon; picks and rerolls change it", async () => {
  const { ICONS, iconFor, iconToken, STATE_MARKERS } = await import("../shared/icons.mjs");
  assert.equal(iconFor("w1:p1").name, iconFor("w1:p1").name);
  assert.equal(iconFor("w1:p1", { picks: { "w1:p1": "owl" } }).name, "owl");
  const rolled = new Set(Array.from({ length: 10 }, (_, n) => iconFor("w1:p1", { rolls: { "w1:p1": n } }).name));
  assert.ok(rolled.size > 3);
  // herdr allows 16 rules per token: 2 state rules + one per icon
  assert.ok(ICONS.length + 2 <= 16);
  const ghost = ICONS[0];
  assert.equal(iconToken(ghost, "idle"), ghost.nerd);
  assert.ok(iconToken(ghost, "blocked").endsWith(STATE_MARKERS.nerd.blocked));
  assert.ok(iconToken(ghost, "done", { set: "emoji" }).startsWith(ghost.emoji));
  assert.notEqual(iconToken(ghost, "working", { frame: 0 }), iconToken(ghost, "working", { frame: 1 }));
});

test("every scene renders 20x6 px with a caption, for every body", async () => {
  const S = await import("../shared/scenes.mjs");
  const { BODIES, makeMonster } = await import("../shared/monsters.mjs");
  assert.ok(S.IDLE_SCENES.length >= 66 && S.WORK_SCENES.length >= 79 && BODIES.length >= 38);
  for (const name of [...S.IDLE_SCENES, ...S.WORK_SCENES]) {
    for (const body of BODIES) {
      const m = { ...makeMonster(name), body: body.id };
      for (const frame of [0, 7, 31]) {
        const s = S.scene(m, name, frame);
        assert.equal(s.rows.length, 3);
        assert.ok(s.rows.every((runs) => runs.reduce((n, r) => n + r.text.length, 0) === 20), `${name} ${body.id}`);
        assert.ok(s.caption, name);
      }
    }
  }
  for (const mode of ["requesting", "thinking", "tool-use", "responding"]) {
    assert.ok(S.WORK_POOLS[mode].includes(S.workSceneAt(makeMonster("x"), mode, Date.now())));
  }
});
