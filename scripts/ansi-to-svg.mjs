// Renders a terminal capture (text with ANSI colors, e.g. from
// `herdr pane read <pane> --source visible --ansi`) as an SVG screenshot.
// Block characters (█ ▀ ▄) are drawn as rectangles so pixel art stays crisp.
//
//   node scripts/ansi-to-svg.mjs capture.ansi out.svg [--bg #1a1b26] [--fg #a9b1d6] [--title text]
//   rsvg-convert -z 2 out.svg -o out.png
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BG = opt("bg", "#1a1b26");
const FG = opt("fg", "#a9b1d6");
const TITLE = opt("title", "");
const SQUEEZE = process.argv.includes("--squeeze"); // runs of blank lines become one

const CW = 9.6; // cell width at 16px JetBrains Mono
const LH = 20; // line height: two 10px pixels per row for half blocks
const PAD = 16;
const BAR = TITLE ? 30 : 0;

// xterm's 16 colors, used when a capture names them by number
const ANSI16 = ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"];

function xterm256(n) {
  if (n < 16) return ANSI16[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `#${v.toString(16).padStart(2, "0").repeat(3)}`;
  }
  const i = n - 16;
  const c = (v) => (v ? 55 + v * 40 : 0).toString(16).padStart(2, "0");
  return `#${c(Math.floor(i / 36))}${c(Math.floor(i / 6) % 6)}${c(i % 6)}`;
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;

// ---- parse into a grid of cells ----

const lines = readFileSync(input, "utf8").replace(/\r/g, "").split("\n");
while (lines.length && !lines[lines.length - 1].replace(/\x1b\[[0-9;]*m/g, "").trim()) lines.pop();
const TAIL = Number(opt("tail", 0)); // keep only the last N lines
if (TAIL) lines.splice(0, Math.max(0, lines.length - TAIL));
const HEAD = Number(opt("head", 0)); // then keep only the first N lines
if (HEAD) lines.splice(HEAD);

const grid = [];
let blankRun = 0;
for (const line of lines) {
  const isBlank = !line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  blankRun = isBlank ? blankRun + 1 : 0;
  if (SQUEEZE && blankRun > 1) continue;
  const cells = [];
  let fg = null, bg = null, bold = false, dim = false;
  const re = /\x1b\[([0-9;]*)m|\x1b\[[0-9;?]*[A-Za-z]|([\s\S])/gu;
  let m;
  while ((m = re.exec(line))) {
    if (m[2] !== undefined) {
      cells.push({ ch: m[2], fg, bg, bold, dim });
      continue;
    }
    if (m[1] === undefined) continue;
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) (fg = null), (bg = null), (bold = false), (dim = false);
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) (bold = false), (dim = false);
      else if (c === 39) fg = null;
      else if (c === 49) bg = null;
      else if (c >= 30 && c <= 37) fg = ANSI16[c - 30];
      else if (c >= 90 && c <= 97) fg = ANSI16[c - 90 + 8];
      else if (c >= 40 && c <= 47) bg = ANSI16[c - 40];
      else if (c >= 100 && c <= 107) bg = ANSI16[c - 100 + 8];
      else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        const color = hex(codes[i + 2], codes[i + 3], codes[i + 4]);
        if (c === 38) fg = color;
        else bg = color;
        i += 4;
      } else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        const color = xterm256(codes[i + 2]);
        if (c === 38) fg = color;
        else bg = color;
        i += 2;
      }
    }
  }
  grid.push(cells);
}

// ---- draw ----

const COLS = Number(opt("cols", 0)); // keep only the first N columns
const SKIP = Number(opt("skip", 0)); // drop the first N columns
if (COLS || SKIP) grid.forEach((cells, i) => (grid[i] = cells.slice(SKIP, COLS ? SKIP + COLS : undefined)));
const cols = Math.max(...grid.map((r) => r.length), 1);
const width = Math.ceil(cols * CW + PAD * 2);
const height = grid.length * LH + PAD * 2 + BAR;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
out.push(`<rect width="100%" height="100%" rx="10" fill="${BG}"/>`);
if (TITLE) {
  out.push(`<circle cx="20" cy="15" r="6" fill="#ff5f57"/><circle cx="40" cy="15" r="6" fill="#febc2e"/><circle cx="60" cy="15" r="6" fill="#28c840"/>`);
  out.push(`<text x="${width / 2}" y="20" text-anchor="middle" font-family="JetBrainsMono Nerd Font, JetBrains Mono, monospace" font-size="13" fill="${FG}" opacity="0.6">${esc(TITLE)}</text>`);
}
const top = PAD + BAR;

grid.forEach((cells, y) => {
  const y0 = top + y * LH;
  cells.forEach((cell, x) => {
    const x0 = PAD + x * CW;
    const fg = cell.fg ?? FG;
    if (cell.bg) out.push(`<rect x="${x0}" y="${y0}" width="${CW + 0.5}" height="${LH + 0.5}" fill="${cell.bg}"/>`);
    // pixel-art blocks as rectangles
    if (cell.ch === "█") out.push(`<rect x="${x0}" y="${y0}" width="${CW + 0.5}" height="${LH + 0.5}" fill="${fg}"/>`);
    else if (cell.ch === "▀") out.push(`<rect x="${x0}" y="${y0}" width="${CW + 0.5}" height="${LH / 2 + 0.25}" fill="${fg}"/>`);
    else if (cell.ch === "▄") out.push(`<rect x="${x0}" y="${y0 + LH / 2}" width="${CW + 0.5}" height="${LH / 2 + 0.5}" fill="${fg}"/>`);
    // lower eighth blocks (chart columns) as rectangles from the bottom
    else if ("▁▂▃▄▅▆▇".includes(cell.ch) && cell.ch !== "▄") {
      const h = (" ▁▂▃▄▅▆▇".indexOf(cell.ch) / 8) * LH;
      out.push(`<rect x="${x0}" y="${y0 + LH - h}" width="${CW + 0.5}" height="${h + 0.5}" fill="${fg}"/>`);
    }
    // meter cells (▰ filled, ▱ empty) as small bars, one per cell
    else if (cell.ch === "▰") out.push(`<rect x="${x0 + 1}" y="${y0 + LH / 2 - 3}" width="${CW - 2}" height="6" rx="1" fill="${fg}"/>`);
    else if (cell.ch === "▱") out.push(`<rect x="${x0 + 1.5}" y="${y0 + LH / 2 - 2.5}" width="${CW - 3}" height="5" rx="1" fill="none" stroke="${fg}" stroke-width="1"/>`);
  });
  // text in runs of one style, each pinned to its cells
  let run = null;
  const flush = () => {
    if (!run || !run.text.trim()) return (run = null);
    const weight = run.bold ? ' font-weight="bold"' : "";
    const opacity = run.dim ? ' opacity="0.6"' : "";
    out.push(`<text x="${PAD + run.x * CW}" y="${y0 + LH * 0.75}" fill="${run.fg}"${weight}${opacity} xml:space="preserve" textLength="${run.text.length * CW}" lengthAdjust="spacingAndGlyphs">${esc(run.text)}</text>`);
    run = null;
  };
  cells.forEach((cell, x) => {
    const isBlock = "█▀▄▰▱▁▂▃▅▆▇".includes(cell.ch);
    const fg = cell.fg ?? FG;
    if (isBlock || cell.ch === " ") {
      flush();
      return;
    }
    if (run && run.fg === fg && run.bold === cell.bold && run.dim === cell.dim) run.text += cell.ch;
    else {
      flush();
      run = { x, text: cell.ch, fg, bold: cell.bold, dim: cell.dim };
    }
  });
  flush();
});
out.push(`<style>text{font-family:"JetBrainsMono Nerd Font","JetBrains Mono",monospace;font-size:16px}</style>`);
out.push("</svg>");
writeFileSync(output, out.join("\n"));
console.log(`${output}: ${cols}x${grid.length} cells, ${width}x${height}px`);
