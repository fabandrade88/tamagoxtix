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

const HERDR_SOURCE = 'tamaclaude'

const palette = atom({ plugin: 'tamaclaude', key: 'palette' } as const, null)
const monster = atom({ plugin: 'tamaclaude', key: 'monster' } as const, null)
const turn = atom({ plugin: 'tamaclaude', key: 'turn' } as const, null)
const usage = atom({ plugin: 'tamaclaude', key: 'usage' } as const, null)
const limits = atom({ plugin: 'tamaclaude', key: 'limits' } as const, [])
const idleSince = atom({ plugin: 'tamaclaude', key: 'idleSince' } as const, 0)
const showPet = atom({ plugin: 'tamaclaude', key: 'showPet' } as const, true)
const github = atom({ plugin: 'tamaclaude', key: 'github' } as const, null)

type Config = { palette?: string; sidebar?: boolean; [key: string]: unknown }

// ---- files shared with the herdr plugin ----

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '.'
}

async function configPath($: EngineInterface): Promise<string> {
  const base = (await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`
  return `${base}/tamaclaude/config.json`
}

async function statePath($: EngineInterface, file: string): Promise<string> {
  const base = (await $.env.get('XDG_STATE_HOME')) ?? `${await home($)}/.local/state`
  return `${base}/tamaclaude/${file}`
}

async function claudeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`
}

async function readJson<T>($: EngineInterface, path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return fallback
  }
}

async function readConfig($: EngineInterface): Promise<Config> {
  return { palette: 'omarchy', sidebar: false, ...(await readJson<Config>($, await configPath($), {})) }
}

async function writeConfig($: EngineInterface, patch: Config): Promise<Config> {
  const next = { ...(await readConfig($)), ...patch }
  await $.fs.write(await configPath($), JSON.stringify(next, null, 2) + '\n')
  return next
}

async function loadPalette($: EngineInterface, choice?: string): Promise<TamaPalette> {
  let omarchy: string | undefined
  try {
    omarchy = await $.fs.read(`${await home($)}/${OMARCHY_COLORS_PATH}`)
  } catch {}
  return resolvePalette(choice ?? (await readConfig($)).palette, omarchy) as TamaPalette
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
async function seedKey($: EngineInterface): Promise<string> {
  const pane = await herdrPane($)
  if (pane) {
    try {
      const { stdout } = await herdr($, ['pane', 'get', pane])
      return JSON.parse(stdout)?.result?.pane?.agent_session?.value ?? pane
    } catch {}
  }
  return $.session.id()
}

// The monster and its sidebar icon, after any reroll or pick; the pixel
// monster wears its icon's color so both read as the same critter.
async function loadMonster($: EngineInterface): Promise<TamaMonster> {
  const key = await seedKey($)
  const rolls = await readJson<Record<string, number>>($, await statePath($, 'rerolls.json'), {})
  const picks = await readJson<Record<string, string>>($, await statePath($, 'icons.json'), {})
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
  const runs = await run($, ['gh', 'run', 'list', '-R', path, '--branch', branch, '--limit', '1', '--json', 'status,conclusion', '--jq', '.[0] | "\(.status) \(.conclusion)"'])
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
// merge requests, stars, CI) at most every ten minutes.
async function refreshGithub($: EngineInterface) {
  const parsed = parseRemote(await run($, ['git', 'remote', 'get-url', 'origin']))
  if (!parsed) {
    await update($, github, () => null)
    return
  }
  const repo = parsed.path
  const branch = (await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])) ?? '?'
  const status = (await run($, ['git', 'status', '--porcelain'])) ?? ''
  const counts = (await run($, ['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD'])) ?? ''
  const [behind = 0, ahead = 0] = counts.split(/\s+/).map(Number)
  let version = await run($, ['git', 'describe', '--tags', '--abbrev=0'])
  if (!version) {
    const pkg = await readJson<{ version?: string }>($, 'package.json', {})
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
  try {
    const { exitCode, stdout } = await $.process.run(
      ['node', `${$.plugin.root}/scripts/usage-node.mjs`, '--days', '14'],
      { timeoutMs: 30_000 },
    )
    if (exitCode === 0) await update($, usage, () => JSON.parse(stdout) as TamaUsage)
  } catch {}
}

function formatTokens(n: number): string {
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
  await $.fs.write(
    `${await claudeDir($)}/themes/tamaclaude.json`,
    JSON.stringify(claudeTheme(next), null, 2) + '\n',
  )
  if (await herdrPane($)) {
    try {
      await herdr($, ['plugin', 'action', 'invoke', 'tamaclaude.sidebar-refresh'])
    } catch {}
  }
  return next
}

// Loads what the drawings read. Runs at the session's start and again after
// a /clear, which leaves the session's values behind without a new start.
async function loadSession($: EngineInterface) {
  const [pal, pet] = [await loadPalette($), await loadMonster($)]
  await update($, palette, () => pal)
  await update($, monster, () => pet)
  const now = Date.now()
  await update($, idleSince, () => now)
  const saved = await readJson<{ windows?: TamaLimit[] }>($, await statePath($, 'limits.json'), {})
  if (saved.windows?.length) await update($, limits, () => saved.windows ?? [])
  const pref = await $.store.get('showPet')
  await update($, showPet, () => pref !== false)
  void refreshUsage($)
  void refreshGithub($)
}

export const register: Register = on => {
  let mainTurn: string | null = null
  let lastPush = 0
  let sidebarTimer: Timer | null = null

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadSession($)
    await $.command.register({
      name: 'tamaclaude',
      description: 'Token usage charts, palettes and your monster',
      argumentHint: '[stats | palette [name] | theme on|off | pet on|off | icon [name] | reroll]',
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
    await update($, turn, () => ({ startedAt: Date.now(), tokens: 0 }))

    // the icon may have changed since (a pick, a reroll, herdr spreading
    // icons so no two agents share one): read it again each turn
    const pet = await loadMonster($)
    await update($, monster, () => pet)
    if (!(await read($, palette))) {
      const pal = await loadPalette($)
      await update($, palette, () => pal)
    }
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
    if (e.surface !== 'terminal') return next(e)
    const [pal, pet, current] = [await read($, palette), await read($, monster), await read($, turn)]
    if (!pal || !pet) return next(e)
    const { Client } = $.ui.resolve(e)
    return (
      <Client
        key="tamaclaude-spinner"
        module="./spinner.tsx"
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

  // ---- the idle band: the monster lives above the prompt between turns ----

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || e.props.isWorking || e.props.maxRows < 3) return next(e)
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
      <Client
        key="tamaclaude-idle"
        module="./idle.tsx"
        props={{
          monster: pet,
          palette: pal,
          idleSince: since || Date.now(),
          todayTokens: data?.today.tokens ?? null,
          limits: windows,
          week: thisWeek(data),
          github: repo,
          columns: e.props.bodyColumns,
          icons: String((await readConfig($)).icons ?? 'nerd'),
        }}
      />
    )
  })

  // ---- /tamaclaude: a usage card drawn in the transcript ----

  on('ui.render', { component: 'CommandOutput', props: { command: 'tamaclaude' } }, async ($, e, next) => {
    const sub = e.props.args.trim().split(/\s+/)[0] || 'stats'
    if (sub !== 'stats' || e.surface !== 'terminal' || e.props.isErrored) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [pal, pet, data, windows] = [
      await read($, palette),
      await read($, monster),
      await read($, usage),
      await read($, limits),
    ]
    const p = pal ?? (resolvePalette('claude') as TamaPalette)
    if (!data) return next(e)
    const width = Math.max(60, Math.min(78, (e.viewport?.columns ?? 100) - 4))

    const title = (text: string) => (
      <Text>
        <Text color={p.accent}>▍</Text>
        <Text color={p.fg} bold>
          {` ${text}`}
        </Text>
      </Text>
    )

    const sprite = pet
      ? spriteRuns(pet, 'idle', 0).map(runs => (
          <Text>
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
        <Text>
          <Text color={p.fg}>{label.padEnd(8)}</Text>
          <Text color={color}>{full}</Text>
          <Text color={p.muted}>{empty}</Text>
          <Text color={color} bold>
            {l ? ` ${String(Math.round(pct)).padStart(3)}%` : '   —'}
          </Text>
          <Text color={p.muted}>{reset ? `   ⟳ ${reset}` : l ? '' : '   no reading yet'}</Text>
        </Text>
      )
    }

    // last 14 days: bars three cells wide, today in the accent color
    const days = data.days
    const dayRows = columnRows(days.map(d => d.tokens), 5)
    const dayChart = dayRows.map(row => (
      <Text>
        {row.map((ch, i) => (
          <Text color={i === row.length - 1 ? p.accent : p.blue}>{ch.repeat(3) + ' '}</Text>
        ))}
      </Text>
    ))
    const dayLabels = days.map(d => d.date.slice(8).padEnd(4)).join('')

    // today by hour: one bar per hour, the current one in the accent color
    const hourNow = new Date().getHours()
    const hourRows = columnRows(data.today.hours.map(h => h.tokens), 3)
    const hourChart = hourRows.map(row => (
      <Text>
        {row.map((ch, i) => (
          <Text color={i === hourNow ? p.accent : p.green}>{ch.repeat(2) + ' '}</Text>
        ))}
      </Text>
    ))
    const hourLabels = data.today.hours.map(h => (h.hour % 6 === 0 ? String(h.hour) : '').padEnd(3)).join('')

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={p.muted} paddingX={2} paddingY={0} width={width}>
        <Box flexDirection="row" gap={3}>
          <Box flexDirection="column">{sprite}</Box>
          <Box flexDirection="column">
            <Text>
              <Text color={p.accent} bold>
                {pet?.name ?? 'tamaclaude'}
              </Text>
              <Text color={p.muted}>{`  ·  token usage  ·  ${p.label}`}</Text>
            </Text>
            <Text>
              <Text color={p.muted}>today </Text>
              <Text color={p.yellow} bold>
                {formatTokens(data.today.tokens)}
              </Text>
              <Text color={p.muted}>{`   session `}</Text>
              <Text color={p.cyan} bold>
                {formatTokens(data.session?.tokens ?? 0)}
              </Text>
              <Text color={p.muted}>{`   week `}</Text>
              <Text color={p.magenta} bold>
                {formatTokens(data.week.tokens)}
              </Text>
            </Text>
            <Text color={p.muted}>{`${formatTokens(data.today.output)} written by Claude today`}</Text>
          </Box>
        </Box>
        <Text> </Text>
        {title('limits')}
        {limitRow('5h', 'five_hour')}
        {limitRow('week', 'seven_day')}
        <Text> </Text>
        <Text>
          {title('last 14 days')}
          <Text color={p.muted}>{`   max ${formatTokens(Math.max(...days.map(d => d.tokens)))}`}</Text>
        </Text>
        {dayChart}
        <Text color={p.muted}>{dayLabels}</Text>
        <Text> </Text>
        {title('today by hour')}
        {hourChart}
        <Text color={p.muted}>{hourLabels}</Text>
        <Text> </Text>
        <Text color={p.muted}>/tamaclaude palette · theme on|off · pet on|off · reroll</Text>
      </Box>
    )
  })

  // ---- /tamaclaude ----

  on('command.run', { command: 'tamaclaude' }, async ($, e) => {
    const [sub = 'stats', arg] = e.args.trim().split(/\s+/).filter(Boolean)

    if (sub === 'stats') {
      await refreshUsage($)
      const data = await read($, usage)
      const windows = await read($, limits)
      const pct = (kind: string) => windows.find(w => w.kind === kind)?.percentUsed
      // the row the model reads; the card above is drawn from the same numbers
      return {
        text: data
          ? `Token usage: today ${formatTokens(data.today.tokens)}, this 5h session ${formatTokens(data.session?.tokens ?? 0)}, this week ${formatTokens(data.week.tokens)}. Limits: 5h ${pct('five_hour') ?? '?'}%, week ${pct('seven_day') ?? '?'}%.`
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
        return { text: `Palettes:\n${list}\n\n/tamaclaude palette <name> to switch.` }
      }
      if (!choices.includes(arg)) {
        return { text: `Unknown palette "${arg}". Try one of: ${choices.join(', ')}` }
      }
      const next = await applyPalette($, arg)
      return { text: `Palette: ${next.label}.` }
    }

    if (sub === 'theme') {
      const pal = (await read($, palette)) ?? (await loadPalette($))
      await $.fs.write(
        `${await claudeDir($)}/themes/tamaclaude.json`,
        JSON.stringify(claudeTheme(pal), null, 2) + '\n',
      )
      if (arg === 'off') {
        const saved = (await readConfig($)).previousTheme
        const previous = (typeof saved === 'string' ? saved : undefined) ?? ((await $.store.get('previousTheme')) as string | undefined)
        const result = await $.config.set({ key: 'theme', value: previous ?? 'dark' })
        return { text: result.deny ? `Could not change the theme: ${result.deny}` : 'Chat colors back to your previous theme.' }
      }
      const rows = await $.config.list()
      const current = rows.find(row => row.key === 'theme')?.value
      if (typeof current === 'string' && current !== 'custom:tamaclaude') await $.store.set('previousTheme', current)
      const result = await $.config.set({ key: 'theme', value: 'custom:tamaclaude' })
      return {
        text: result.deny
          ? `Wrote ~/.claude/themes/tamaclaude.json but could not switch to it (${result.deny}). Pick "tamaclaude" in /theme.`
          : `Chat colors now follow the ${pal.label} palette. /tamaclaude theme off to go back.`,
      }
    }

    if (sub === 'reroll' || sub === 'icon') {
      const key = await seedKey($)
      const picksPath = await statePath($, 'icons.json')
      const picks = await readJson<Record<string, string>>($, picksPath, {})
      if (sub === 'icon') {
        if (!arg) {
          const current = (await read($, monster))?.icon
          const list = ICONS.map(i => `${i.name === current ? '●' : '○'} ${i.nerd} ${i.emoji} ${i.name}`).join('\n')
          return { text: `Icons:\n${list}\n\n/tamaclaude icon <name> to pick one.` }
        }
        if (!iconByName(arg)) return { text: `Unknown icon "${arg}". Try one of: ${ICONS.map(i => i.name).join(', ')}` }
        picks[key] = arg
      } else {
        const rollsPath = await statePath($, 'rerolls.json')
        const rolls = await readJson<Record<string, number>>($, rollsPath, {})
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

    if (sub === 'pet') {
      const visible = arg !== 'off'
      await $.store.set('showPet', visible)
      await update($, showPet, () => visible)
      return { text: visible ? 'Your monster hangs out above the prompt between turns.' : 'Idle monster hidden. /tamaclaude pet on brings it back.' }
    }

    if (sub === 'icons') {
      if (arg !== 'nerd' && arg !== 'emoji') return { text: 'Usage: /tamaclaude icons nerd|emoji' }
      await writeConfig($, { icons: arg })
      if (await herdrPane($)) {
        try {
          await herdr($, ['plugin', 'action', 'invoke', 'tamaclaude.sidebar-refresh'])
        } catch {}
      }
      return { text: `Sidebar icons: ${arg}.` }
    }

    return { text: 'Usage: /tamaclaude [stats | palette [name] | theme on|off | pet on|off | icon [name] | icons nerd|emoji | reroll]' }
  })
}

