# tamaclaude

[![release](https://img.shields.io/github/v/release/fabandrade88/tamaclaude?color=d97757)](https://github.com/fabandrade88/tamaclaude/releases)
[![license](https://img.shields.io/github/license/fabandrade88/tamaclaude?color=7aa2f7)](LICENSE)
![herdr plugin](https://img.shields.io/badge/herdr-plugin-9ece6a)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-bb9af7)

A tiny pixel monster that lives in your terminal while you work with Claude Code.
It acts out what Claude is doing, hangs out with you between turns, and keeps an
eye on your token usage and your GitHub or GitLab repo.

Two pieces, one repo:

- **Claude Code mod** ([`claude/`](claude)) — the monster in your chat.
- **herdr plugin** ([`herdr/`](herdr)) — a token usage popup and palettes for
  [herdr](https://herdr.dev).

![Between turns: the monster, your usage and your repo](docs/screenshots/idle.png)

**38** monster bodies × **7** kinds of legs · **77** idle scenes · **91** work
scenes · **12** palettes · GitHub and GitLab · zero dependencies

## What it does

### Your monster, while Claude works

The usual `✻ Thinking… (12s · ↓ 1.2k tokens)` line is replaced by your monster
acting out the turn, with time and tokens as bars:

![Mining blocks while a tool runs](docs/screenshots/work-a.png)
![Lighting a neon sign while the answer is written](docs/screenshots/work-b.png)

- **What it does depends on what Claude does**, with a new scene every 15 seconds:
  calling the API (laptop, satellite dish, paper airplane, lighthouse…),
  thinking (chess, Rubik's cube, crystal ball, maze, abacus…),
  using tools (hammer, saw, pickaxe, welding, 3D printer, crane…),
  writing the answer (keyboard, typewriter, quill, piano, neon sign, graffiti…).
- **And IT life**: "this is fine", deploying on a Friday, trying to exit vim,
  force pushing to main, a merge conflict, a blue screen, `rm -rf` in the wrong
  folder, installing node_modules, tabs vs spaces, works on my machine…
- **And the plant floor**: talking HART to a transmitter, wiring Ethernet-APL,
  a radar level gauge, a Coriolis meter, stroking a control valve, tuning a PID
  loop, calibrating a 4-20 mA loop, programming the PLC, a SCADA alarm…
- **Time** fills a bar every minute and adds a `●` per minute.
- **Tokens** fill a bar every 10k and add a `$` per 10k.

### Your monster, while Claude waits for you

Between turns the monster lives above the prompt and does its own thing — naps,
eats pizza, does the laundry, throws a party, plays the drums or the violin,
trains with a laser sword, hatches a dragon egg, plays football, gets tired and
yawns, goes to the bathroom — a new scene every 40 seconds.

![Idle scenes](docs/screenshots/scenes-idle.png)

Next to it:

- **Usage** — your 5-hour and weekly limits as bars with the time until they
  reset, and this week's tokens per day.
- **Your repo** — with an octocat on GitHub, a fox on GitLab (gitlab.com or
  your own instance): repo, stars, last CI run or pipeline, branch, commits
  ahead/behind, changed files, version, open issues and pull/merge requests.
  Uses `gh` or `glab` when signed in, the public API otherwise.

Narrow terminal? The repo column goes first, then usage.

### Work scenes

![Work scenes](docs/screenshots/scenes-work.png)

### A monster of your own

Every session gets its own critter: 38 body shapes (slime, bear, frog, ninja,
viking, wizard, astronaut, sushi, dino…) × 7 kinds of legs × your palette's
colors. Don't like yours? `/tamaclaude reroll`.

### Token usage

`/tamaclaude` prints a usage card right in the chat: today, the current 5-hour
session and the week, your limits, the last 14 days and today by hour.

![The /tamaclaude card](docs/screenshots/stats.png)

Numbers come from Claude Code's own transcripts in `~/.claude/projects` (each
API response counted once) and the limit readings Claude Code receives
(subscription plans). Nothing leaves your machine.

### Palettes

Everything is drawn in one palette, switchable at any time:
`omarchy` (follows your active [Omarchy](https://omarchy.org) theme), `claude`,
`tokyo-night`, `catppuccin`, `gruvbox`, `nord`, `everforest`, `kanagawa`,
`rose-pine`, `osaka-jade`, `ristretto`, `matte-black`.

`/tamaclaude theme on` also colors the chat itself, mapped the way Omarchy themes
Claude Code; `/tamaclaude theme off` goes back to your theme.

### Powerline status line

`/tamaclaude statusline on` turns Claude Code's status line into oh-my-posh
style segments in your palette: model, folder, git branch, context, the 5-hour
and weekly limits and the session's time. `off` puts yours back. The model
leads in orange, the highlight every palette has.

![The status line in four palettes](docs/screenshots/statusline.png)

### In herdr

The herdr plugin adds a usage popup (same numbers, `p` to switch palette) and
an optional herdr look, `tamaclaude.theme-install`: herdr's colors from your
palette, a status area right of the tabs (branch, tokens today, limits, clock)
with icons and powerline separators, and palette colors on the sidebar rows.
herdr has no background colors for these, so the arrows are separators rather
than filled segments. `tamaclaude.theme-uninstall` restores your config exactly.

![herdr usage popup](docs/screenshots/herdr-stats.png)

## Install

**Requirements:** [Node.js](https://nodejs.org) 18+, Claude Code 2.1.300+ for the
mod, [herdr](https://herdr.dev) 0.9.0+ for the plugin. A
[Nerd Font](https://www.nerdfonts.com) (Omarchy ships one) for the icons and
the powerline arrows. Nothing is downloaded or built at install time.

The Claude Code side is built on Claude Code's function hooks (mods), an
early-access API that can change between Claude Code releases.

### Claude Code mod

At the prompt of a Claude Code session:

```
/plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

or from a shell:

```sh
claude plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

Update with `claude plugin update tamaclaude`. To remove it, first turn off
what it set in your Claude Code settings, then uninstall:

```
/tamaclaude statusline off
/tamaclaude theme off
/plugin uninstall tamaclaude
```

### herdr plugin

```sh
herdr plugin install fabandrade88/tamaclaude/herdr --ref v1.0.0
```

Leave out `--ref` to follow `main`. Update with `herdr plugin update tamaclaude`.
To remove it, restore herdr's look first, then uninstall:

```sh
herdr plugin action invoke tamaclaude.theme-uninstall
herdr plugin uninstall tamaclaude
```

Bind the usage popup to a key in herdr's `config.toml`:

```toml
[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "tamaclaude.stats"
description = "token usage"
```

## Commands

| Claude Code | |
| --- | --- |
| `/tamaclaude help` | Every command, and which ones are on |
| `/tamaclaude` | Token usage card |
| `/tamaclaude palette [name]` | List palettes, or switch |
| `/tamaclaude theme on` / `off` | Color the chat with the palette |
| `/tamaclaude statusline on` / `off` | Powerline status line |
| `/tamaclaude pet on` / `off` | Show or hide the monster between turns |
| `/tamaclaude icon [name]` / `icons nerd\|emoji` | Pick the sidebar icon, or the icon set |
| `/tamaclaude reroll` | A new monster |

| herdr action | |
| --- | --- |
| `tamaclaude.stats` | Token usage popup |
| `tamaclaude.theme-install` / `theme-uninstall` | The tamaclaude look for herdr |
| `tamaclaude.palette-next` | Next palette |
| `tamaclaude.sidebar-install` / `sidebar-uninstall` | Critter icons in the sidebar (optional) |
| `tamaclaude.icon` / `tamaclaude.reroll` | Pick or reroll the focused agent's icon |

Settings live in `~/.config/tamaclaude/config.json`, shared by both.

## Troubleshooting

- **A command shows an old usage line, or something new is missing** — the
  session runs the version it loaded: run `/reload-plugins`.
- **Squares instead of icons or arrows** — your terminal font has no Nerd Font
  glyphs; switch to a [Nerd Font](https://www.nerdfonts.com).
- **No limits in the bars** — Claude Code only reports them on Pro and Max plans,
  after the session's first response.
- **The herdr look after changing your Omarchy theme** — run
  `herdr plugin action invoke tamaclaude.theme-refresh`.

## Development

```sh
claude --plugin-dir ./claude      # run the mod from this checkout
herdr plugin link ./herdr         # run the herdr plugin from this checkout
npm run sync                      # after editing shared/, copy it into both packages
npm test                          # all of the below
npm run test:unit                 # unit tests (node --test, claude plugin test)
npm run test:security             # argv-only commands, known APIs and paths, no secrets
npm run test:perf                 # frame, usage-reading and hook budgets
```

`shared/` holds the monsters, scenes, palettes and usage reader; each package
carries its own copy because Claude Code and herdr install only their own folder.
Screenshots are real captures (`herdr pane read --ansi`) rendered with
`scripts/ansi-to-svg.mjs`; `scripts/gallery.mjs` draws the scene grids.

## Changelog

### 1.1.0

- `/tamaclaude help`: every command, grouped, with what is on.
- Powerline status line (`/tamaclaude statusline on`) and an orange highlight
  in every palette.
- The tamaclaude look for herdr: palette colors, a tab-bar status area with
  icons and powerline separators, colored sidebar rows.
- GitLab support with a pixel fox; a compact `/tamaclaude` usage card.
- 77 idle and 91 work scenes: a party, instruments, getting tired, IT memes,
  industrial instrumentation and automation.
- Unit, security and performance checks; text from git remotes is sanitized.

### 1.0.0

First release.

- Claude Code mod: the animated monster spinner with time and token bars, the
  idle band with usage limits, this week's days and a GitHub/GitLab column, the
  `/tamaclaude` usage card, palettes and an Omarchy-style chat theme.
- herdr plugin: the usage popup, palettes, optional sidebar icons.
- 38 bodies, 67 idle scenes, 81 work scenes (IT memes included).

## License

MIT
