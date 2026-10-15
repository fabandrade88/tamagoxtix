// Switching palettes: saves the choice, writes the matching Claude Code
// theme file and recolors the sidebar rules.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activePalette, writeConfig } from "./common.mjs";
import { claudeTheme } from "./lib/palettes.mjs";
import { claudeDir } from "./lib/usage-node.mjs";
import { refresh as refreshSidebar } from "./sidebar.mjs";

export function applyPalette(choice) {
  const palette = activePalette(writeConfig({ palette: choice }));
  // Claude Code reloads ~/.claude/themes on change; the theme only shows
  // where the person picked "custom:tamaclaude" (/tamaclaude theme on).
  try {
    const dir = join(claudeDir(), "themes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tamaclaude.json"), JSON.stringify(claudeTheme(palette), null, 2) + "\n");
  } catch {}
  refreshSidebar();
  return palette;
}
