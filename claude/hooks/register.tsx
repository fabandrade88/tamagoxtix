import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { clean, parseRemote } from './lib/forge.mjs'
import { DEFAULT_ICON, iconByName, iconFor, ICONS, iconToken } from './lib/icons.mjs'
import { makeMonster, slotColor, spriteRuns } from './lib/monsters.mjs'
import {
  claudeTheme,
  OMARCHY_COLORS_PATH,
  paletteChoices,
  resolvePalette,
} from './lib/palettes.mjs'
import type { TamaGithub, TamaLimit, TamaMonster, TamaPalette, TamaUsage } from '../types'

const HERDR_SOURCE = 'tamagoxtix'

const palette = atom({ plugin: 'tamagoxtix', key: 'palette' } as const, null)
const monster = atom({ plugin: 'tamagoxtix', key: 'monster' } as const, null)
const turn = atom({ plugin: 'tamagoxtix', key: 'turn' } as const, null)
const usage = atom({ plugin: 'tamagoxtix', key: 'usage' } as const, null)
const limits = atom({ plugin: 'tamagoxtix', key: 'limits' } as const, [])
const idleSince = atom({ plugin: 'tamagoxtix', key: 'idleSince' } as const, 0)
const showPet = atom({ plugin: 'tamagoxtix', key: 'showPet' } as const, true)
const github = atom({ plugin: 'tamagoxtix', key: 'github' } as const, null)
const nodeMissing = atom({ plugin: 'tamagoxtix', key: 'nodeMissing' } as const, false)
const drafting = atom({ plugin: 'tamagoxtix', key: 'drafting' } as const, false)
// The folder last found to hold no repository (or no remote), and when: git
// is not asked again there for a while.
const noRepo = atom({ plugin: 'tamagoxtix', key: 'noRepo' } as const, null)
// The agent session herdr recorded for this pane, once it has one.
const herdrSeed = atom({ plugin: 'tamagoxtix', key: 'herdrSeed' } as const, null)

type Config = { palette?: string; sidebar?: boolean; [key: string]: unknown }

// ---- the draft in the prompt box ----

// A prompt is a draft with text that is not a slash command or a shell line;
// the band redraws only when that flips, not on every key.
function isPrompt(text: string): boolean {
  return text.trim().length > 0 && !/^\s*[/!]/.test(text)
}

async function setDrafting($: EngineInterface, text: string): Promise<void> {
  const now = isPrompt(text)
  if (now !== (await read($, drafting))) await update($, drafting, () => now)
}

// ---- files shared with the herdr plugin ----

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '.'
}

async function configPath($: EngineInterface): Promise<string> {
  const base = (await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`
  return `${base}/tamagoxtix/config.json`
}

async function statePath($: EngineInterface, file: string): Promise<string> {
  const base = (await $.env.get('XDG_STATE_HOME')) ?? `${await home($)}/.local/state`
  return `${base}/tamagoxtix/${file}`
}

async function claudeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`
}

async function readJson($: EngineInterface, path: string, fallback: unknown): Promise<any> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return fallback
  }
}

async function readConfig($: EngineInterface): Promise<Config> {
  return { palette: 'beach', sidebar: false, ...(await readJson($, await configPath($), {})) }
}

async function writeConfig($: EngineInterface, patch: Config): Promise<Config> {
  const next = { ...(await readConfig($)), ...patch }
  await $.fs.write(await configPath($), JSON.stringify(next, null, 2) + '\n')
  return next
}

// Omarchy's colors are read only for the `omarchy` palette (or no choice
// yet), and only where the file exists: elsewhere, macOS and Windows
// included, nothing is read.
async function loadPalette($: EngineInterface, choice?: string): Promise<TamaPalette> {
  const pick = choice ?? (await readConfig($)).palette
  let omarchy: string | undefined
  if (pick === undefined || pick === 'omarchy') {
    const path = `${await home($)}/${OMARCHY_COLORS_PATH}`
    try {
      if (await $.fs.exists(path)) omarchy = await $.fs.read(path)
    } catch {}
  }
  return resolvePalette(pick, omarchy) as TamaPalette
}

// The plugin's own folder, where its scripts are.
function pluginRoot($: EngineInterface): string {
  const root = $.plugin.root
  return root
}

// ---- herdr ----

async function herdrPane($: EngineInterface): Promise<string | undefined> {
  return $.env.get('HERDR_PANE_ID')
}

async function herdr($: EngineInterface, args: string[]) {
  return $.process.run(['herdr', ...args], { timeoutMs: 5000 })
}

// The same seed the herdr plugin uses: the agent session herdr recorded for
// the pane (this Claude session), else the session id.
// Asked of herdr once per session: kept once herdr has recorded one.
async function seedKey($: EngineInterface): Promise<string> {
  const pane = await herdrPane($)
  if (pane) {
    const known = await read($, herdrSeed)
    if (known?.pane === pane) return known.key
    try {
      const { stdout } = await herdr($, ['pane', 'get', pane])
      const key = JSON.parse(stdout)?.result?.pane?.agent_session?.value
      if (typeof key === 'string' && key) {
        await update($, herdrSeed, () => ({ pane, key }))
        return key
      }
    } catch {}
    return pane
  }
  return $.session.id()
}

// The monster and its sidebar icon, after any reroll or pick; the pixel
// monster wears its icon's color so both read as the same critter.
async function loadMonster($: EngineInterface): Promise<TamaMonster> {
  const key = await seedKey($)
  const rolls = await readJson($, await statePath($, 'rerolls.json'), {})
  const picks = await readJson($, await statePath($, 'icons.json'), {})
  const icon = iconFor(key, { picks, rolls })
  const n = rolls[key] ?? 0
  const pet = makeMonster(n ? `${key}#${n}` : key) as TamaMonster
  return { ...pet, color: icon.slot, icon: icon.name }
}

async function sidebarToken($: EngineInterface, pet: TamaMonster, state: string, frame: number | null = null) {
  const icon = iconByName(pet.icon) ?? DEFAULT_ICON
  const set = String((await readConfig($)).icons ?? 'nerd')
  return iconToken(icon, state, { set, frame })
}

async function paintSidebar($: EngineInterface, pet: TamaMonster, state: string) {
  const pane = await herdrPane($)
  if (!pane || (await readConfig($)).sidebar !== true) return
  try {
    const token = await sidebarToken($, pet, state)
    await herdr($, ['pane', 'report-metadata', pane, '--source', HERDR_SOURCE, '--token', `monster=${token}`])
  } catch {}
}

// ---- the project's GitHub repository ----

const GITHUB_TTL = 10 * 60_000

async function run($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 10_000 })
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

type Remote = Pick<TamaGithub, 'issues' | 'prs' | 'stars' | 'ci'>

async function fetchGithub($: EngineInterface, path: string, branch: string): Promise<Remote> {
  const remote: Remote = { issues: null, prs: null, stars: null, ci: null }
  const info = await run($, ['gh', 'api', `repos/${path}`, '--jq', '[.open_issues_count, .stargazers_count] | @tsv'])
  const prs = await run($, ['gh', 'pr', 'list', '-R', path, '--state', 'open', '--limit', '100', '--json', 'number', '--jq', 'length'])
  if (info) {
    const [open = 0, stars = 0] = info.split('\t').map(Number)
    remote.prs = prs === null ? null : Number(prs)
    remote.issues = Math.max(0, open - (remote.prs ?? 0))
    remote.stars = stars
  } else {
    // no gh: the public API still answers for public repositories
    try {
      const res = await $.http.fetch(`https://api.github.com/repos/${path}`)
      if (res.ok) {
        const body = JSON.parse(res.text) as { open_issues_count?: number; stargazers_count?: number }
        remote.issues = body.open_issues_count ?? null
        remote.stars = body.stargazers_count ?? null
      }
    } catch {}
  }
  const runs = await run($, ['gh', 'run', 'list', '-R', path, '--branch', branch, '--limit', '1', '--json', 'status,conclusion', '--jq', '.[0] | "\\(.status) \\(.conclusion)"'])
  if (runs && !runs.startsWith('null')) {
    const [state, conclusion] = runs.split(' ')
    remote.ci = state !== 'completed' ? 'pending' : conclusion === 'success' ? 'success' : 'failure'
  }
  return remote
}

// GitLab through glab when it is installed and signed in, else the
// instance's public API (public projects only).
async function fetchGitlab($: EngineInterface, host: string, path: string, branch: string): Promise<Remote> {
  const remote: Remote = { issues: null, prs: null, stars: null, ci: null }
  const id = encodeURIComponent(path)
  const get = async (endpoint: string): Promise<unknown> => {
    const viaGlab = await run($, ['glab', 'api', '--hostname', host, endpoint])
    if (viaGlab) {
      try {
        return JSON.parse(viaGlab)
      } catch {}
    }
    try {
      const res = await $.http.fetch(`https://${host}/api/v4/${endpoint}`)
      return res.ok ? JSON.parse(res.text) : null
    } catch {
      return null
    }
  }
  // GitLab counts a list in its x-total header
  const count = async (endpoint: string): Promise<number | null> => {
    try {
      const res = await $.http.fetch(`https://${host}/api/v4/${endpoint}&per_page=1`)
      const total = Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'x-total')?.[1]
      if (res.ok && total !== undefined) return Number(total)
    } catch {}
    const list = await get(`${endpoint}&per_page=100`)
    return Array.isArray(list) ? list.length : null
  }
  const project = (await get(`projects/${id}`)) as { star_count?: number; open_issues_count?: number } | null
  if (project) remote.stars = project.star_count ?? null
  remote.issues = project?.open_issues_count ?? (await count(`projects/${id}/issues?state=opened`))
  remote.prs = await count(`projects/${id}/merge_requests?state=opened`)
  const pipelines = await get(`projects/${id}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`)
  const status = Array.isArray(pipelines) ? (pipelines[0] as { status?: string } | undefined)?.status : undefined
  if (status) remote.ci = status === 'success' ? 'success' : status === 'failed' || status === 'canceled' ? 'failure' : 'pending'
  return remote
}

// Local facts from git every time (cheap); the forge's part (issues, pull or
// merge requests, stars, CI) at most every ten minutes. A folder with no
// repository is asked again only after ten minutes (or in another folder).
async function refreshGithub($: EngineInterface) {
  let cwd = ''
  try {
    cwd = await $.session.cwd()
  } catch {}
  const skip = await read($, noRepo)
  if (skip?.cwd === cwd && Date.now() - skip.at < GITHUB_TTL) return
  const parsed = parseRemote(await run($, ['git', 'remote', 'get-url', 'origin']))
  if (!parsed) {
    const at = Date.now()
    await update($, noRepo, () => ({ cwd, at }))
    await update($, github, () => null)
    return
  }
  if (skip) await update($, noRepo, () => null)
  const repo = parsed.path
  const branch = (await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])) ?? '?'
  const status = (await run($, ['git', 'status', '--porcelain'])) ?? ''
  const counts = (await run($, ['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD'])) ?? ''
  const [behind = 0, ahead = 0] = counts.split(/\s+/).map(Number)
  let version = await run($, ['git', 'describe', '--tags', '--abbrev=0'])
  if (!version) {
    const pkg = await readJson($, 'package.json', {})
    version = pkg.version ? `v${pkg.version}` : null
  }
  const local = {
    forge: parsed.forge,
    repo: clean(repo),
    branch: clean(branch, 40),
    dirty: status ? status.split('\n').length : 0,
    ahead: ahead || 0,
    behind: behind || 0,
    version: version ? clean(version, 24) : null,
  }

  const previous = await read($, github)
  const fresh = previous?.repo === repo && Date.now() - previous.fetchedAt < GITHUB_TTL
  const remote: Remote & { fetchedAt: number } =
    fresh && previous
      ? { issues: previous.issues, prs: previous.prs, stars: previous.stars, ci: previous.ci, fetchedAt: previous.fetchedAt }
      : {
          ...(parsed.forge === 'github'
            ? await fetchGithub($, repo, branch)
            : await fetchGitlab($, parsed.host, repo, branch)),
          fetchedAt: Date.now(),
        }
  const next: TamaGithub = { ...local, ...remote }
  await update($, github, () => next)
}

// ---- usage ----

async function refreshUsage($: EngineInterface) {
  let result: { exitCode: number; stdout: string } | null = null
  try {
    const script = `${pluginRoot($)}/scripts/usage-node.mjs`
    result = await $.process.run(['node', script, '--days', '14'], { timeoutMs: 30_000 })
  } catch {
    // `node` didn't start: say so where the numbers would be
    await update($, nodeMissing, () => true)
    return
  }
  await update($, nodeMissing, () => false)
  try {
    if (result.exitCode === 0) await update($, usage, () => JSON.parse(result.stdout) as TamaUsage)
  } catch {}
}

// ---- /tamagoxtix doctor: what TamaGoxtix needs, and what is missing ----

type Check = { name: string; argv: string[]; required: boolean; why: string; install: string; ok?: (out: string) => boolean }

const CHECKS: Check[] = [
  {
    name: 'Node.js 18+',
    argv: ['node', '--version'],
    required: true,
    why: 'usage numbers, the usage card and the status line',
    install: 'https://nodejs.org · brew install node · sudo apt install nodejs · sudo pacman -S nodejs · winget install OpenJS.NodeJS',
    ok: out => Number(out.replace(/^v/, '').split('.')[0]) >= 18,
  },
  { name: 'git', argv: ['git', '--version'], required: true, why: 'the repo column', install: 'https://git-scm.com' },
  { name: 'gh (GitHub CLI), signed in', argv: ['gh', 'auth', 'status'], required: false, why: 'CI runs, pull requests and private GitHub repos', install: 'https://cli.github.com, then gh auth login' },
  { name: 'glab (GitLab CLI)', argv: ['glab', '--version'], required: false, why: 'pipelines, merge requests and private GitLab projects', install: 'https://gitlab.com/gitlab-org/cli' },
]

// What the band shows at a width: the scene and caption, then usage, then
// the repo column (idle.tsx WIDTH).
const BAND_WIDTH = { usage: 28 + 46 + 40, repo: 28 + 46 + 40 + 46 }

async function doctorText($: EngineInterface, columns = 80): Promise<string> {
  const lines = ['TamaGoxtix doctor', '']
  for (const check of CHECKS) {
    let found = false
    let version = ''
    try {
      const { exitCode, stdout, stderr } = await $.process.run(check.argv, { timeoutMs: 5000 })
      version = (stdout || stderr).trim().split('\n')[0] ?? ''
      found = exitCode === 0 && (check.ok ? check.ok(version) : true)
    } catch {}
    const mark = found ? '✔' : check.required ? '✖' : '○'
    lines.push(`${mark} ${check.name}${found && version && check.argv[1] === '--version' ? `  (${version})` : ''}`)
    if (!found) lines.push(`    needed for ${check.why}${check.required ? '' : ' (optional)'}`, `    install: ${check.install}`)
  }
  const pet = await read($, showPet)
  const fits = columns >= BAND_WIDTH.repo ? 'scene, usage and repo' : columns >= BAND_WIDTH.usage ? 'scene and usage (the repo column needs 160)' : 'scene only (usage needs 114 columns, the repo column 160)'
  lines.push(
    '',
    pet ? 'Monster band: on (/tamagoxtix pet off hides it)' : '✖ Monster band: hidden by /tamagoxtix pet off (pet on brings it back)',
    `    terminal: ${columns} columns, room for ${fits}`,
    '    the full band needs 3 free rows above the prompt; with 1 or 2 it shrinks to one line,',
    '    and it steps aside while Claude works or a survey is shown',
  )
  const icons = String((await readConfig($)).icons ?? 'nerd')
  lines.push(
    '',
    `Icons: ${icons === 'nerd' ? 'Nerd Font' : 'plain symbols'} (/tamagoxtix icons nerd|plain)`,
    'Nerd Font check, these should be icons, not boxes:   \u{f167a}  \u{f024b}  \uf418  \u{f09d1}  \ue0b0 \ue0b1',
    'Boxes? Install a Nerd Font (https://www.nerdfonts.com) and pick it in your terminal, or run /tamagoxtix icons plain.',
  )
  return lines.join('\n')
}

function formatCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(Math.round(n))
}

function resetIn(iso?: string): string {
  const ms = iso ? Date.parse(iso) - Date.now() : NaN
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return h ? `${h}h ${m}m` : `${m}m`
}

const LEVELS = ' ▁▂▃▄▅▆▇█'

// Monday to Sunday of the current week, from the usage summary's days.
function thisWeek(data: TamaUsage | null) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const byDate = new Map((data?.days ?? []).map(d => [d.date, d.tokens]))
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { label, tokens: byDate.get(key) ?? 0, isToday: day.getTime() === today.getTime(), isFuture: day > today }
  })
}

function columnRows(values: number[], height: number): string[][] {
  const max = Math.max(1, ...values)
  const rows: string[][] = []
  for (let r = height - 1; r >= 0; r--) {
    rows.push(
      values.map(v => {
        const level = Math.max(0, Math.min(8, Math.round(((v / max) * height - r) * 8)))
        return LEVELS[level] ?? ' '
      }),
    )
  }
  return rows
}

// the same meter as the spinner's and the band's
function meter(fraction: number, width: number): [string, string] {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width)
  return ['▰'.repeat(filled), '▱'.repeat(width - filled)]
}

// ---- palette switching ----

async function applyPalette($: EngineInterface, choice: string): Promise<TamaPalette> {
  await writeConfig($, { palette: choice })
  const next = await loadPalette($, choice)
  await update($, palette, () => next)
  // the chat theme file is rewritten only where the chat uses it
  if ((await readClaudeSettings($)).theme === 'custom:tamagoxtix') {
    await $.fs.write(`${await claudeDir($)}/themes/tamagoxtix.json`, JSON.stringify(claudeTheme(next), null, 2) + '\n')
  }
  if (await herdrPane($)) {
    try {
      await herdr($, ['plugin', 'action', 'invoke', 'tamagoxtix.sidebar-refresh'])
      await herdr($, ['plugin', 'action', 'invoke', 'tamagoxtix.theme-refresh'])
    } catch {}
  }
  return next
}

// Loads what the drawings read. Runs at the session's start and again after
// a /clear, which leaves the session's values behind without a new start.
// TamaGoxtix was called tamaclaude before 2.0: carry its choices over once,
// and point Claude Code's settings at the renamed status line and theme.
const LEGACY_FILES = ['config/config.json', 'state/rerolls.json', 'state/icons.json', 'state/limits.json']

async function migrateLegacy($: EngineInterface) {
  const configBase = (await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`
  const stateBase = (await $.env.get('XDG_STATE_HOME')) ?? `${await home($)}/.local/state`
  for (const file of LEGACY_FILES) {
    const [kind, name] = file.split('/') as [string, string]
    const base = kind === 'config' ? configBase : stateBase
    const from = `${base}/tamaclaude/${name}`
    const to = `${base}/tamagoxtix/${name}`
    try {
      if ((await $.fs.exists(from)) && !(await $.fs.exists(to))) await $.fs.write(to, await $.fs.read(from))
    } catch {}
  }
  const settings = await readClaudeSettings($)
  const oldLine = JSON.stringify(settings.statusLine ?? '').includes('/tamaclaude/statusline/')
  const oldTheme = settings.theme === 'custom:tamaclaude'
  if (!oldLine && !oldTheme) return
  const script = oldLine ? await installStatuslineFiles($) : null
  const pal = await loadPalette($)
  if (oldTheme) await $.fs.write(`${await claudeDir($)}/themes/tamagoxtix.json`, JSON.stringify(claudeTheme(pal), null, 2) + '\n')
  await editClaudeSettings($, s => {
    if (script) s.statusLine = { type: 'command', command: `node "${script}"`, padding: 0, refreshInterval: 30 }
    if (oldTheme) s.theme = 'custom:tamagoxtix'
  })
}

async function loadSession($: EngineInterface) {
  try {
    await migrateLegacy($)
  } catch {}
  const [pal, pet] = [await loadPalette($), await loadMonster($)]
  await update($, palette, () => pal)
  await update($, monster, () => pet)
  const now = Date.now()
  await update($, idleSince, () => now)
  const saved = await readJson($, await statePath($, 'limits.json'), {})
  if (saved.windows?.length) await update($, limits, () => saved.windows ?? [])
  const pref = await $.store.get('showPet')
  await update($, showPet, () => pref !== false)
  void refreshUsage($)
  void refreshGithub($)
}

// ---- the powerline status line ----

const STATUSLINE_FILES = ['statusline.mjs', 'palettes.mjs', 'powerline.mjs', 'forge.mjs']

// Copies the status line script to a folder that survives plugin updates
// (the plugin's own folder moves with each version) and returns its path.
async function installStatuslineFiles($: EngineInterface): Promise<string> {
  const dir = await statePath($, 'statusline')
  for (const file of STATUSLINE_FILES) {
    await $.fs.write(`${dir}/${file}`, await $.fs.read(`${pluginRoot($)}/scripts/${file}`))
  }
  return `${dir}/statusline.mjs`
}

type ClaudeSettings = { statusLine?: unknown; theme?: unknown; [key: string]: unknown }

// Changes Claude Code's own settings.json, carefully, since it holds
// everything else the person configured:
// - a file that is not valid JSON is left alone (never replaced by ours);
// - the first change keeps a copy beside it (settings.json.tamagoxtix-backup);
// - only the keys `change` touches differ, and the result is read back: when
//   it does not parse, the file the person had is put back.
// Returns null on success, else why nothing was changed.
async function editClaudeSettings($: EngineInterface, change: (s: ClaudeSettings) => void): Promise<string | null> {
  const path = `${await claudeDir($)}/settings.json`
  let original = ''
  let settings: ClaudeSettings = {}
  if (await $.fs.exists(path)) {
    original = await $.fs.read(path)
    if (original.trim()) {
      try {
        const parsed: unknown = JSON.parse(original)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
        settings = parsed as ClaudeSettings
      } catch {
        return `${path} is not valid JSON, so tamagoxtix left it alone. Fix it (or remove the broken part) and run the command again.`
      }
    }
    const backup = `${path}.tamagoxtix-backup`
    if (original && !(await $.fs.exists(backup))) await $.fs.write(backup, original)
  }
  change(settings)
  const text = JSON.stringify(settings, null, 2) + '\n'
  await $.fs.write(path, text)
  try {
    JSON.parse(await $.fs.read(path))
  } catch {
    if (original) await $.fs.write(path, original)
    return `Could not write ${path}; it was put back as it was.`
  }
  return null
}

async function readClaudeSettings($: EngineInterface): Promise<ClaudeSettings> {
  return readJson($, `${await claudeDir($)}/settings.json`, {})
}

async function setStatusline($: EngineInterface, on: boolean): Promise<string> {
  const config = await readConfig($)
  const before = await readClaudeSettings($)
  if (on) {
    const script = await installStatuslineFiles($)
    const ours = { type: 'command', command: `node "${script}"`, padding: 0, refreshInterval: 30 }
    const current = JSON.stringify(before.statusLine ?? null)
    const keepPrevious = config.statusline !== true && !current.includes('tamagoxtix')
    const refused = await editClaudeSettings($, s => {
      s.statusLine = ours
    })
    if (refused) return refused
    await writeConfig($, { statusline: true, ...(keepPrevious ? { previousStatusLine: before.statusLine ?? null } : {}) })
    return 'Powerline status line on: model, folder, branch, context, limits and time. /tamagoxtix statusline off restores yours.'
  }
  const refused = await editClaudeSettings($, s => {
    if (config.previousStatusLine) s.statusLine = config.previousStatusLine
    else delete s.statusLine
  })
  if (refused) return refused
  await writeConfig($, { statusline: false, previousStatusLine: null })
  return 'Status line restored.'
}

// ---- chat colors: a Claude Code custom theme from the palette ----

// /config takes only the built-in themes, so the theme is set in
// settings.json the way Omarchy sets its own; Claude Code picks it up live.
async function setChatTheme($: EngineInterface, on: boolean): Promise<string> {
  const pal = (await read($, palette)) ?? (await loadPalette($))
  if (on) {
    const before = await readClaudeSettings($)
    const current = typeof before.theme === 'string' ? before.theme : undefined
    await $.fs.write(`${await claudeDir($)}/themes/tamagoxtix.json`, JSON.stringify(claudeTheme(pal), null, 2) + '\n')
    const refused = await editClaudeSettings($, s => {
      s.theme = 'custom:tamagoxtix'
    })
    if (refused) return refused
    await writeConfig($, { chatTheme: true, ...(current && current !== 'custom:tamagoxtix' ? { previousTheme: current } : {}) })
    return `Chat colors follow the ${pal.label} palette. /tamagoxtix theme off goes back.`
  }
  const previous = (await readConfig($)).previousTheme
  const refused = await editClaudeSettings($, s => {
    if (typeof previous === 'string' && previous) s.theme = previous
    else delete s.theme
  })
  if (refused) return refused
  await writeConfig($, { chatTheme: false })
  return 'Chat colors back to your previous theme.'
}

// ---- /tamagoxtix help ----

type HelpRow = { command: string; does: string; state?: boolean }
type HelpSection = { title: string; rows: HelpRow[] }

async function helpSections($: EngineInterface): Promise<HelpSection[]> {
  const config = await readConfig($)
  const settings = await readClaudeSettings($)
  const pal = (await read($, palette)) ?? (await loadPalette($))
  const chatTheme = settings.theme === 'custom:tamagoxtix'
  const statusline = JSON.stringify(settings.statusLine ?? '').includes('tamagoxtix')
  const pet = await read($, showPet)
  return [
    {
      title: `colors · palette: ${pal.label}`,
      rows: [
        { command: '/tamagoxtix palette', does: 'list the palettes' },
        { command: '/tamagoxtix palette <name>', does: `switch: ${paletteChoices().join(' ')}` },
        { command: '/tamagoxtix palette omarchy', does: 'follow your Omarchy theme' },
        { command: '/tamagoxtix theme on|off', does: 'chat colors from the palette', state: chatTheme },
        { command: '/tamagoxtix statusline on|off', does: 'powerline status line', state: statusline },
        { command: '/tamagoxtix icons nerd|plain', does: 'Nerd Font icons, or plain symbols any font has', state: config.icons !== 'plain' && config.icons !== 'emoji' },
      ],
    },
    {
      title: 'your monster',
      rows: [
        { command: '/tamagoxtix pet on|off', does: 'the monster above the prompt', state: pet },
        { command: '/tamagoxtix reroll', does: 'a new monster' },
      ],
    },
    {
      title: 'usage',
      rows: [
        { command: '/tamagoxtix', does: 'the usage card: today, session, week, limits, charts' },
        { command: '/tamagoxtix doctor', does: 'check Node.js, git, gh, glab and the font' },
      ],
    },
    {
      title: 'herdr  (herdr plugin action invoke …)',
      rows: [
        { command: 'tamagoxtix.stats', does: 'usage popup · p switches palette' },
        { command: 'tamagoxtix.palette-next', does: 'next palette' },
        { command: 'tamagoxtix.theme-install|uninstall', does: 'the tamagoxtix look for herdr', state: config.herdrTheme === true },
        { command: 'tamagoxtix.theme-follow-herdr', does: "its colors from herdr's theme", state: config.herdrColors !== 'palette' },
        { command: 'tamagoxtix.theme-follow-palette', does: 'its colors from the palette', state: config.herdrColors === 'palette' },
      ],
    },
    {
      title: 'before uninstalling',
      rows: [
        { command: '/tamagoxtix statusline off', does: 'give the status line back' },
        { command: '/tamagoxtix theme off', does: 'give the chat theme back' },
        { command: 'tamagoxtix.theme-uninstall', does: "give herdr's look back (in herdr)" },
      ],
    },
  ]
}

async function helpText($: EngineInterface): Promise<string> {
  const lines = ['tamagoxtix commands:']
  for (const section of await helpSections($)) {
    lines.push('', section.title)
    for (const row of section.rows) {
      const state = row.state === undefined ? '' : row.state ? ' [on]' : ' [off]'
      lines.push(`  ${row.command.padEnd(36)} ${row.does}${state}`)
    }
  }
  return lines.join('\n')
}

export const register: Register = on => {
  let mainTurn: string | null = null
  let lastPush = 0
  let sidebarTimer: Timer | null = null

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadSession($)
    if ((await readConfig($)).statusline === true) {
      try {
        await installStatuslineFiles($)
      } catch {}
    }
    await $.command.register({
      name: 'tamagoxtix',
      description: 'Token usage charts, palettes and your monster',
      argumentHint: '[help | doctor | palette [name] | theme on|off | statusline on|off | icons nerd|plain | pet on|off | reroll]',
    })
    return started
  })

  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    // a /clear drops the session's values after its hooks ran: load them
    // again once it has
    if (e.reason === 'clear') {
      $.clock.after(400, () => void loadSession($))
      $.clock.after(2000, () => void loadSession($))
    }
    return ended
  })

  // ---- the turn the spinner draws ----

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId) return started
    mainTurn = e.turnId
    // the prompt was sent: no draft in the box anymore
    await update($, drafting, () => false)
    await update($, turn, () => ({ startedAt: Date.now(), tokens: 0 }))

    // the icon may have changed since (a pick, a reroll, herdr spreading
    // icons so no two agents share one): read it again each turn
    const pet = await loadMonster($)
    await update($, monster, () => pet)
    // the palette too: an Omarchy theme change shows up on the next turn
    const pal = await loadPalette($)
    await update($, palette, () => pal)
    const pane = await herdrPane($)
    if (pane && (await readConfig($)).sidebar === true) {
      sidebarTimer?.cancel()
      const icon = iconByName(pet.icon) ?? DEFAULT_ICON
      const set = String((await readConfig($)).icons ?? 'nerd')
      let frame = 0
      // herdr's sidebar is plain text: send it a new face a few times a second
      sidebarTimer = $.clock.every(300, () => {
        frame++
        void herdr($, [
          'pane', 'report-metadata', pane, '--source', HERDR_SOURCE,
          '--token', `monster=${iconToken(icon, 'working', { set, frame })}`,
        ]).catch(() => {})
      })
    }
    return started
  })

  // Output tokens: estimated from the streamed text while it arrives, then the
  // count the API reports once the step ends.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId || e.turnId !== mainTurn) {
      return yield* next(e)
    }
    let chars = 0
    let base: number | null = null
    for await (const chunk of next(e)) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') chars += chunk.text.length
      else if (chunk.kind === 'input') chars += chunk.json.length
      if (chunk.kind === 'stop' && chunk.usage) {
        const exact = chunk.usage.output_tokens
        await update($, turn, t => (t ? { ...t, tokens: (base ?? t.tokens) + exact } : t))
      } else if (Date.now() - lastPush > 400) {
        lastPush = Date.now()
        const estimate = Math.round(chars / 4)
        await update($, turn, t => {
          if (!t) return t
          base ??= t.tokens
          return { ...t, tokens: base + estimate }
        })
      }
      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const turnId = (e as { turnId?: string }).turnId
    if (turnId && turnId !== mainTurn) return done
    mainTurn = null
    sidebarTimer?.cancel()
    sidebarTimer = null
    await update($, turn, () => null)
    const now = Date.now()
    await update($, idleSince, () => now)
    void refreshUsage($)
    void refreshGithub($)
    return done
  })

  // ---- rate limits: kept for the pane and written for herdr's popup ----

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    if (e.changed.includes('rateLimits')) {
      const windows = e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
      await update($, limits, () => windows as TamaLimit[])
      try {
        await $.fs.write(
          await statePath($, 'limits.json'),
          JSON.stringify({ updatedAt: Date.now(), windows }, null, 2),
        )
      } catch {}
    }
    return measured
  })

  // ---- the spinner ----

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if ((e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)
    const [pal, pet, current] = [await read($, palette), await read($, monster), await read($, turn)]
    if (!pal || !pet) return next(e)
    const { Client } = $.ui.resolve(e)
    return (
      <Client module="./spinner.tsx"
        key="tamagoxtix-spinner"
        props={{
          monster: pet,
          palette: pal,
          mode: e.props.mode,
          word: e.props.message ?? e.props.word,
          startedAt: current?.startedAt ?? Date.now(),
          tokens: current?.tokens ?? 0,
        }}
      />
    )
  })

  // ---- while you type a prompt, the monster cheers you on ----

  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    await setDrafting($, result?.text ?? e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end))
    return result
  })

  // ---- the idle band: the monster lives above the prompt between turns ----

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e.surface !== 'terminal' && e.surface !== 'desktop') || e.props.isWorking) return next(e)
    // a survey owns the band; with under 3 rows the monster shrinks to a line
    if (e.props.hasSurvey || e.props.maxRows < 1) return next(e)
    const mode = e.props.maxRows >= 3 ? 'full' : 'compact'
    const [pal, pet, show, since, data, windows, repo] = [
      await read($, palette),
      await read($, monster),
      await read($, showPet),
      await read($, idleSince),
      await read($, usage),
      await read($, limits),
      await read($, github),
    ]
    if (!pal || !pet || !show) return next(e)
    const { Client } = $.ui.resolve(e)
    return (
      <Client module="./idle.tsx"
        key="tamagoxtix-idle"
        props={{
          monster: pet,
          palette: pal,
          idleSince: since || Date.now(),
          todayCount: data?.today.tokens ?? null,
          limits: windows,
          week: thisWeek(data),
          github: repo,
          columns: e.props.bodyColumns,
          nodeMissing: await read($, nodeMissing),
          cheering: await read($, drafting),
          compact: mode === 'compact',
          face: await sidebarToken($, pet, 'idle'),
          icons: String((await readConfig($)).icons ?? 'nerd'),
        }}
      />
    )
  })

  // ---- /tamagoxtix help: the commands as a card, with what is on ----

  on('ui.render', { component: 'CommandOutput', props: { command: 'tamagoxtix' } }, async ($, e, next) => {
    const sub = e.props.args.trim().split(/\s+/)[0] ?? ''
    if (sub !== 'help' || (e.surface !== 'terminal' && e.surface !== 'desktop') || e.props.isErrored) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const p = (await read($, palette)) ?? (resolvePalette('beach') as TamaPalette)
    const sections = await helpSections($)
    const width = Math.max(60, Math.min(96, (e.viewport?.columns ?? 100) - 4))
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={p.muted} paddingX={2} width={width}>
        <Text mono>
          <Text mono color={p.orange} bold>
            tamagoxtix
          </Text>
          <Text mono color={p.muted}>  ·  help</Text>
        </Text>
        {sections.map(section => (
          <Box flexDirection="column" marginTop={1}>
            <Text mono>
              <Text mono color={p.orange}>▍</Text>
              <Text mono color={p.fg} bold>{` ${section.title}`}</Text>
            </Text>
            {section.rows.map(row => (
              <Text mono>
                <Text mono color={p.accent}>{`  ${row.command.padEnd(36)}`}</Text>
                <Text mono color={p.muted}>{row.does}</Text>
                {row.state !== undefined && (
                  <Text mono color={row.state ? p.green : p.muted} bold={row.state}>
                    {row.state ? '  ● on' : '  ○ off'}
                  </Text>
                )}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  // ---- /tamagoxtix: a usage card drawn in the transcript ----

  on('ui.render', { component: 'CommandOutput', props: { command: 'tamagoxtix' } }, async ($, e, next) => {
    const sub = e.props.args.trim().split(/\s+/)[0] || 'stats'
    if (sub !== 'stats' || (e.surface !== 'terminal' && e.surface !== 'desktop') || e.props.isErrored) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [pal, pet, data, windows] = [
      await read($, palette),
      await read($, monster),
      await read($, usage),
      await read($, limits),
    ]
    const p = pal ?? (resolvePalette('beach') as TamaPalette)
    if (!data) return next(e)
    const width = Math.max(60, Math.min(78, (e.viewport?.columns ?? 100) - 4))

    const title = (text: string) => (
      <Text mono>
        <Text mono color={p.accent}>▍</Text>
        <Text mono color={p.fg} bold>
          {` ${text}`}
        </Text>
      </Text>
    )

    const sprite = pet
      ? spriteRuns(pet, 'idle', 0).map(runs => (
          <Text mono>
            {runs.map(run => (
              <Text
                color={run.fg ? slotColor(pet, run.fg, p) : undefined}
                backgroundColor={run.bg ? slotColor(pet, run.bg, p) : undefined}
              >
                {run.text}
              </Text>
            ))}
          </Text>
        ))
      : []

    const limitRow = (label: string, kind: string) => {
      const l = windows.find(w => w.kind === kind)
      const pct = l?.percentUsed ?? 0
      const color = !l ? p.muted : pct >= 90 ? p.red : pct >= 70 ? p.orange : p.cyan
      const [full, empty] = meter(pct / 100, 24)
      const reset = resetIn(l?.resetsAt)
      return (
        <Text mono>
          <Text mono color={p.fg}>{label.padEnd(8)}</Text>
          <Text mono color={color}>{full}</Text>
          <Text mono color={p.muted}>{empty}</Text>
          <Text mono color={color} bold>
            {l ? ` ${String(Math.round(pct)).padStart(3)}%` : '   —'}
          </Text>
          <Text mono color={p.muted}>{reset ? `   ⟳ ${reset}` : l ? '' : '   no reading yet'}</Text>
        </Text>
      )
    }

    // last 14 days: bars three cells wide, today in the accent color
    const days = data.days
    const dayRows = columnRows(days.map(d => d.tokens), 5)
    const dayChart = dayRows.map(row => (
      <Text mono>
        {row.map((ch, i) => (
          <Text mono color={i === row.length - 1 ? p.accent : p.blue}>{ch.repeat(3) + ' '}</Text>
        ))}
      </Text>
    ))
    const dayLabels = days.map(d => d.date.slice(8).padEnd(4)).join('')

    // today by hour: one bar per hour, the current one in the accent color
    const hourNow = new Date().getHours()
    const hourRows = columnRows(data.today.hours.map(h => h.tokens), 3)
    const hourChart = hourRows.map(row => (
      <Text mono>
        {row.map((ch, i) => (
          <Text mono color={i === hourNow ? p.accent : p.green}>{ch.repeat(2) + ' '}</Text>
        ))}
      </Text>
    ))
    const hourLabels = data.today.hours.map(h => (h.hour % 6 === 0 ? String(h.hour) : '').padEnd(3)).join('')

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={p.muted} paddingX={2} paddingY={0} width={width}>
        <Box flexDirection="row" gap={3}>
          <Box flexDirection="column">{sprite}</Box>
          <Box flexDirection="column">
            <Text mono>
              <Text mono color={p.accent} bold>
                {pet?.name ?? 'tamagoxtix'}
              </Text>
              <Text mono color={p.muted}>{`  ·  token usage  ·  ${p.label}`}</Text>
            </Text>
            <Text mono>
              <Text mono color={p.muted}>today </Text>
              <Text mono color={p.yellow} bold>
                {formatCount(data.today.tokens)}
              </Text>
              <Text mono color={p.muted}>{`   session `}</Text>
              <Text mono color={p.cyan} bold>
                {formatCount(data.session?.tokens ?? 0)}
              </Text>
              <Text mono color={p.muted}>{`   week `}</Text>
              <Text mono color={p.magenta} bold>
                {formatCount(data.week.tokens)}
              </Text>
            </Text>
            <Text mono color={p.muted}>{`${formatCount(data.today.output)} written by Claude today`}</Text>
          </Box>
        </Box>
        <Text mono> </Text>
        {title('limits')}
        {limitRow('5h', 'five_hour')}
        {limitRow('week', 'seven_day')}
        <Text mono> </Text>
        <Text mono>
          {title('last 14 days')}
          <Text mono color={p.muted}>{`   max ${formatCount(Math.max(...days.map(d => d.tokens)))}`}</Text>
        </Text>
        {dayChart}
        <Text mono color={p.muted}>{dayLabels}</Text>
        <Text mono> </Text>
        {title('today by hour')}
        {hourChart}
        <Text mono color={p.muted}>{hourLabels}</Text>
        <Text mono> </Text>
        <Text mono color={p.muted}>/tamagoxtix help for all the commands</Text>
      </Box>
    )
  })

  // ---- /tamagoxtix ----

  on('command.run', { command: 'tamagoxtix' }, async ($, e) => {
    const [sub = 'stats', arg] = e.args.trim().split(/\s+/).filter(Boolean)

    if (sub === 'stats') {
      await refreshUsage($)
      const data = await read($, usage)
      const windows = await read($, limits)
      const pct = (kind: string) => windows.find(w => w.kind === kind)?.percentUsed
      // the row the model reads; the card above is drawn from the same numbers
      return {
        text: data
          ? `Token usage: today ${formatCount(data.today.tokens)}, this 5h session ${formatCount(data.session?.tokens ?? 0)}, this week ${formatCount(data.week.tokens)}. Limits: 5h ${pct('five_hour') ?? '?'}%, week ${pct('seven_day') ?? '?'}%.`
          : 'Token usage is not available yet.',
      }
    }

    if (sub === 'palette') {
      const choices = paletteChoices()
      if (!arg) {
        const current = (await readConfig($)).palette ?? 'omarchy'
        const list = choices
          .map(id => `${id === current ? '●' : '○'} ${id}${id === 'omarchy' ? ' (follows the Omarchy theme)' : ''}`)
          .join('\n')
        return { text: `Palettes:\n${list}\n\n/tamagoxtix palette <name> to switch.` }
      }
      if (!choices.includes(arg)) {
        return { text: `Unknown palette "${arg}". Try one of: ${choices.join(', ')}` }
      }
      const next = await applyPalette($, arg)
      return { text: `Palette: ${next.label}.` }
    }

    if (sub === 'theme') {
      if (arg !== 'on' && arg !== 'off') return { text: 'Usage: /tamagoxtix theme on|off' }
      return { text: await setChatTheme($, arg === 'on') }
    }

    if (sub === 'help') return { text: await helpText($) }

    if (sub === 'reroll' || sub === 'icon') {
      const key = await seedKey($)
      const picksPath = await statePath($, 'icons.json')
      const picks = await readJson($, picksPath, {})
      if (sub === 'icon') {
        if (!arg) {
          const current = (await read($, monster))?.icon
          const list = ICONS.map(i => `${i.name === current ? '●' : '○'} ${i.nerd} ${i.emoji} ${i.name}`).join('\n')
          return { text: `Icons:\n${list}\n\n/tamagoxtix icon <name> to pick one.` }
        }
        if (!iconByName(arg)) return { text: `Unknown icon "${arg}". Try one of: ${ICONS.map(i => i.name).join(', ')}` }
        picks[key] = arg
      } else {
        const rollsPath = await statePath($, 'rerolls.json')
        const rolls = await readJson($, rollsPath, {})
        rolls[key] = (rolls[key] ?? 0) + 1
        await $.fs.write(rollsPath, JSON.stringify(rolls, null, 2))
        delete picks[key]
      }
      await $.fs.write(picksPath, JSON.stringify(picks, null, 2))
      const pet = await loadMonster($)
      await update($, monster, () => pet)
      await paintSidebar($, pet, 'idle')
      return { text: `Say hi to ${pet.name} the ${pet.icon}!` }
    }

    if (sub === 'statusline') {
      if (arg !== 'on' && arg !== 'off') return { text: 'Usage: /tamagoxtix statusline on|off' }
      return { text: await setStatusline($, arg === 'on') }
    }

    if (sub === 'pet') {
      const visible = arg !== 'off'
      await $.store.set('showPet', visible)
      await update($, showPet, () => visible)
      return { text: visible ? 'Your monster hangs out above the prompt between turns.' : 'Idle monster hidden. /tamagoxtix pet on brings it back.' }
    }

    if (sub === 'icons') {
      if (arg !== 'nerd' && arg !== 'plain' && arg !== 'emoji') return { text: 'Usage: /tamagoxtix icons nerd|plain' }
      await writeConfig($, { icons: arg })
      if (await herdrPane($)) {
        try {
          await herdr($, ['plugin', 'action', 'invoke', 'tamagoxtix.sidebar-refresh'])
          await herdr($, ['plugin', 'action', 'invoke', 'tamagoxtix.theme-refresh'])
        } catch {}
      }
      return {
        text:
          arg === 'nerd'
            ? 'Icons: Nerd Font (icons and powerline arrows). /tamagoxtix icons plain if you see boxes.'
            : 'Icons: plain symbols that any font draws. /tamagoxtix icons nerd once a Nerd Font is set.',
      }
    }

    if (sub === 'doctor') return { text: await doctorText($, e.presentation?.columns) }

    return { text: `Unknown: ${sub}.\n\n${await helpText($)}` }
  })
}

