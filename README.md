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

**38** monster bodies × **7** kinds of legs · **67** idle scenes · **81** work
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
- **Time** fills a bar every minute and adds a `●` per minute.
- **Tokens** fill a bar every 10k and add a `$` per 10k.

### Your monster, while Claude waits for you

Between turns the monster lives above the prompt and does its own thing — naps,
eats pizza, does the laundry, plays guitar, trains with a laser sword, hatches a
dragon egg, plays football, goes to the bathroom — a new scene every 40 seconds.

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

### In herdr

The herdr plugin adds a usage popup (same numbers, `p` to switch palette) and,
optionally, critter icons in the sidebar.

![herdr usage popup](docs/screenshots/herdr-stats.png)

## Install

**Requirements:** [Node.js](https://nodejs.org) 18+, Claude Code 2.1.300+ for the
mod, [herdr](https://herdr.dev) 0.9.0+ for the plugin. A
[Nerd Font](https://www.nerdfonts.com) (Omarchy ships one) for the repo icons;
everything else is plain text. Nothing is downloaded or built at install time.

### Claude Code mod

At the prompt of a Claude Code session:

```
/plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

or from a shell:

```sh
claude plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

Update with `claude plugin update tamaclaude`, remove with
`claude plugin uninstall tamaclaude`.

### herdr plugin

```sh
herdr plugin install fabandrade88/tamaclaude/herdr --ref v1.0.0
```

Leave out `--ref` to follow `main`. Update with `herdr plugin update tamaclaude`,
remove with `herdr plugin uninstall tamaclaude`.

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
| `/tamaclaude` | Token usage card |
| `/tamaclaude palette [name]` | List palettes, or switch |
| `/tamaclaude theme on` / `off` | Color the chat with the palette |
| `/tamaclaude pet on` / `off` | Show or hide the monster between turns |
| `/tamaclaude icon [name]` / `icons nerd\|emoji` | Pick the sidebar icon, or the icon set |
| `/tamaclaude reroll` | A new monster |

| herdr action | |
| --- | --- |
| `tamaclaude.stats` | Token usage popup |
| `tamaclaude.palette-next` | Next palette |
| `tamaclaude.sidebar-install` / `sidebar-uninstall` | Critter icons in the sidebar (optional) |
| `tamaclaude.icon` / `tamaclaude.reroll` | Pick or reroll the focused agent's icon |

Settings live in `~/.config/tamaclaude/config.json`, shared by both.

## Development

```sh
claude --plugin-dir ./claude      # run the mod from this checkout
herdr plugin link ./herdr         # run the herdr plugin from this checkout
npm run sync                      # after editing shared/, copy it into both packages
npm test
```

`shared/` holds the monsters, scenes, palettes and usage reader; each package
carries its own copy because Claude Code and herdr install only their own folder.
Screenshots are real captures (`herdr pane read --ansi`) rendered with
`scripts/ansi-to-svg.mjs`; `scripts/gallery.mjs` draws the scene grids.

## Changelog

### 1.0.0

First release.

- Claude Code mod: the animated monster spinner with time and token bars, the
  idle band with usage limits, this week's days and a GitHub/GitLab column, the
  `/tamaclaude` usage card, palettes and an Omarchy-style chat theme.
- herdr plugin: the usage popup, palettes, optional sidebar icons.
- 38 bodies, 67 idle scenes, 81 work scenes (IT memes included).

## License

MIT
