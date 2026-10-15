# tamaclaude

A tiny pixel monster that lives in your terminal while you work with Claude Code.
It acts out what Claude is doing, hangs out with you between turns, and keeps an
eye on your token usage and your GitHub or GitLab repo.

Two pieces, one repo:

- **Claude Code mod** ([`claude/`](claude)) — the monster in your chat.
- **herdr plugin** ([`herdr/`](herdr)) — a token usage popup and palettes for
  [herdr](https://herdr.dev).

![Between turns: the monster, your usage and your repo](docs/screenshots/idle.png)

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

Needs [Node.js](https://nodejs.org) 18+. Nothing is downloaded or built.

**Claude Code mod**, at the prompt of a Claude Code session:

```
/plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

**herdr plugin**:

```sh
herdr plugin install fabandrade88/tamaclaude/herdr
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
| `/tamaclaude` | Token usage card |
| `/tamaclaude palette [name]` | List palettes, or switch |
| `/tamaclaude theme on` / `off` | Color the chat with the palette |
| `/tamaclaude pet on` / `off` | Show or hide the monster between turns |
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

## License

MIT
