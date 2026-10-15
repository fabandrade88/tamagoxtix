// Prints a grid of scenes in ANSI colors, for README screenshots:
//   node scripts/gallery.mjs idle|work [palette] [columns] [seed] > gallery.ansi
import { makeMonster, slotColor } from "../shared/monsters.mjs";
import { IDLE_SCENES, scene, WORK_POOLS } from "../shared/scenes.mjs";
import { hexToRgb, resolvePalette } from "../shared/palettes.mjs";

const [kind = "idle", paletteName = "beach", perRow = "4", seed = "tamagoxtix"] = process.argv.slice(2);
const palette = resolvePalette(paletteName);
const fg = (hex) => `\x1b[38;2;${hexToRgb(hex).join(";")}m`;
const bg = (hex) => `\x1b[48;2;${hexToRgb(hex).join(";")}m`;
const RESET = "\x1b[0m";
const names =
  kind === "work"
    ? [...new Set(["requesting", "thinking", "tool-use", "responding"].flatMap((m) => WORK_POOLS[m]))]
    : IDLE_SCENES;
const colors = ["orange", "magenta", "cyan", "green", "yellow", "blue", "accent", "red"];
const CELL = 30;

const cards = names.map((name, i) => {
  const monster = { ...makeMonster(`${seed}-${i}`), color: colors[i % colors.length] };
  const s = scene(monster, name, 5 + (i % 4));
  const art = s.rows.map(
    (runs, r) =>
      runs.map((run) => (run.fg ? fg(slotColor(monster, run.fg, palette)) : "") + (run.bg ? bg(slotColor(monster, run.bg, palette)) : "") + run.text + RESET).join("") +
      fg(slotColor(monster, s.fxSlot, palette)) + " " + (s.fx[r] ?? "").padEnd(CELL - 21).slice(0, CELL - 21) + RESET,
  );
  const caption = s.caption.length > CELL - 2 ? s.caption.slice(0, CELL - 3) + "…" : s.caption;
  return [...art, fg(palette.muted) + caption.padEnd(CELL) + RESET, ""];
});

const lines = [];
for (let i = 0; i < cards.length; i += Number(perRow)) {
  const row = cards.slice(i, i + Number(perRow));
  for (let l = 0; l < 5; l++) lines.push(row.map((c) => c[l] || " ".repeat(CELL)).join("  "));
}
process.stdout.write(lines.join("\n") + "\n");
