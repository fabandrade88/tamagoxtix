// Performance checks with budgets:  node scripts/bench.mjs
// - one scene frame must draw well inside the spinner's 160 ms frame
// - the usage summary over the real transcripts, cold and cached
// - the processes herdr and the mod start (event hook, usage script)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const results = [];
let failed = false;

function report(name, value, unit, budget) {
  const ok = budget === undefined || value <= budget;
  if (!ok) failed = true;
  results.push({ name, value, unit, budget, ok });
}

function time(fn, runs = 1) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn();
  return Number(process.hrtime.bigint() - start) / 1e6 / runs;
}

// ---- drawing ----
const { makeMonster } = await import("../shared/monsters.mjs");
const S = await import("../shared/scenes.mjs");
const monster = makeMonster("bench");
const names = [...S.IDLE_SCENES, ...S.WORK_SCENES];
let frame = 0;
const perScene = time(() => S.scene(monster, names[frame % names.length], frame++), 20_000);
report("scene frame (avg over all scenes)", perScene * 1000, "µs", 2000);
let worst = 0;
for (const name of names) worst = Math.max(worst, time(() => S.scene(monster, name, 7), 200));
report("scene frame (slowest scene)", worst * 1000, "µs", 5000);
report("monster generation", time(() => makeMonster(String(Math.random())), 20_000) * 1000, "µs", 500);

// ---- usage summary on the real transcripts ----
const claude = process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? "", ".claude");
let bytes = 0;
let count = 0;
const walk = (dir) => {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {}
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".jsonl")) (bytes += statSync(p).size), count++;
  }
};
walk(join(claude, "projects"));
const coldState = mkdtempSync(join(tmpdir(), "tamaclaude-bench-"));
const usageScript = join(root, "shared", "usage-node.mjs");
const run = (env) => {
  const t = process.hrtime.bigint();
  const res = spawnSync(process.execPath, [usageScript, "--days", "14"], { env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, ok: res.status === 0 };
};
const cold = run({ XDG_STATE_HOME: coldState });
const warm = run({ XDG_STATE_HOME: coldState });
report(`usage summary, cold (${count} transcripts, ${(bytes / 1e6).toFixed(0)} MB)`, cold.ms, "ms", 3000);
report("usage summary, cached", warm.ms, "ms", 400);

// ---- processes herdr starts ----
const hook = () => {
  const t = process.hrtime.bigint();
  spawnSync(process.execPath, [join(root, "herdr", "src", "hook.mjs")], {
    env: { ...process.env, HERDR_PLUGIN_EVENT: "pane.agent_status_changed", HERDR_PLUGIN_EVENT_JSON: "{}", XDG_CONFIG_HOME: coldState },
  });
  return Number(process.hrtime.bigint() - t) / 1e6;
};
hook();
report("herdr event hook (sidebar icons off)", Math.min(hook(), hook(), hook()), "ms", 250);

const used = process.memoryUsage().rss / 1e6;
report("bench process memory (rss)", used, "MB", 300);

for (const r of results) {
  const budget = r.budget === undefined ? "" : ` (budget ${r.budget} ${r.unit})`;
  console.log(`${r.ok ? "✔" : "✖"} ${r.name}: ${r.value.toFixed(r.unit === "µs" ? 1 : 0)} ${r.unit}${budget}`);
}
process.exit(failed ? 1 : 0);
