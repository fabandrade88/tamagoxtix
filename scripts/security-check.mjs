// Static security checks over the sources and the git history:
//   node scripts/security-check.mjs
// - no shell: commands run by argv only (no exec, no shell: true, no eval)
// - network: https only, to the GitHub API or a GitLab instance's /api/v4
// - files written: only under the known tamaclaude, Claude and herdr paths
// - no secrets in the tree or in any commit
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SOURCE = /\.(mjs|js|ts|tsx|toml|json)$/;
const SKIP = new Set(["node_modules", ".git", "types", "docs"]);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (SOURCE.test(name)) yield path;
  }
}

const findings = [];
const flag = (file, line, rule, text) => findings.push({ file: relative(root, file), line, rule, text: text.trim().slice(0, 100) });

const RULES = [
  { rule: "shell execution", re: /(?<![.\w])(exec|execSync)\s*\(|shell:\s*true|\/bin\/sh|cmd\.exe/ },
  { rule: "dynamic code", re: /\beval\s*\(|new Function\s*\(/ },
  { rule: "plain http", re: /["'`]http:\/\/(?!www\.w3\.org\/2000\/svg)/ },
  { rule: "secret", re: /(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)/ },
];

// Network calls must target one of these, written as such in the source.
const ALLOWED_URLS = [/^`https:\/\/api\.github\.com\/repos\/\$\{path\}`$/, /^`https:\/\/\$\{host\}\/api\/v4\/\$\{endpoint\}(&per_page=1)?`$/];
// Files the code writes, by the expression it writes to.
const ALLOWED_WRITES = [
  /statePath\(\$, '(limits|rerolls|icons)\.json'\)/,
  /rollsPath|picksPath|configPath\(\$\)|path, /,
  /claudeDir\(\$\)\}\/themes\/tamaclaude\.json/,
  /join\(stateDir\(\), "(usage-cache|limits|rerolls|icons)\.json"\)|rerollPath\(\)|picksPath\(\)|configPath\(\)|tmp|dest|path, (next|text|current|base)/,
  /join\(dir, "tamaclaude\.json"\)/,
  /OMARCHY_HOOK, HOOK_SCRIPT/,
  /output|`\$\{path\}\.tamaclaude-backup`|`\$\{path\}\.tamaclaude-theme-backup`/,
  /`\$\{dir\}\/\$\{file\}`|settingsPath/,
  /join\(here, (["a-z-.]+|"lib", file)\)/,
];

for (const file of files(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  const isCheck = file.endsWith("security-check.mjs");
  const isTest = /\/tests\//.test(file); // tests write their fixtures to a temp dir
  lines.forEach((text, i) => {
    if (!isCheck) for (const { rule, re } of RULES) if (re.test(text)) flag(file, i + 1, rule, text);
    for (const m of text.matchAll(/\$\.http\.fetch\(([^,)]+)/g)) {
      if (!ALLOWED_URLS.some((ok) => ok.test(m[1].trim()))) flag(file, i + 1, "unexpected network target", m[1]);
    }
    if (!isTest) for (const m of text.matchAll(/(?:writeFileSync|copyFileSync|\$\.fs\.write)\(\s*([^\n]+)/g)) {
      if (!ALLOWED_WRITES.some((ok) => ok.test(m[1]))) flag(file, i + 1, "unexpected file write", m[1]);
    }
    const call = text + (lines[i + 1] ?? ""); // arguments may start on the next line
    if (/spawnSync\(|\$\.process\.(run|spawn)\(/.test(text) && !/\[|argv|args\b|bin, args|\(\[/.test(call)) {
      flag(file, i + 1, "command not by argv", text);
    }
  });
}

// Every commit, not just the tree: a secret removed later is still published.
try {
  const history = execFileSync("git", ["-C", root, "log", "-p", "--all", "--no-color"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const secret = RULES.find((r) => r.rule === "secret").re;
  history.split("\n").forEach((text, i) => {
    if (text.startsWith("+") && secret.test(text) && !text.includes("RULES")) flag("git history", i + 1, "secret", text);
  });
} catch (error) {
  flag("git history", 0, "could not read history", String(error.message));
}

if (findings.length) {
  for (const f of findings) console.log(`✖ ${f.rule}: ${f.file}:${f.line}  ${f.text}`);
  process.exit(1);
}
console.log("✔ security checks passed: argv-only commands, https to known APIs, known write paths, no secrets in tree or history");
