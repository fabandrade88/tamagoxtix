# tamaclaude

Little pixel monsters for your coding agents, in the spirit of Claude Code's
mascot. Every agent gets its own random critter, and it acts out what the agent
is doing.

This repository holds two pieces that work together:

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **herdr plugin** | [`herdr/`](herdr) | A critter icon per agent and per Space in [herdr](https://herdr.dev)'s sidebar (ghost, invader, alien, robot, cat, owl…), colored by palette and by state; a token usage popup with charts; palette switching. |
| **Claude Code mod** | [`claude/`](claude) | Replaces the `✻ Coalescing… (1m 22s · ↓ 5.7k tokens)` line with the monster acting out the turn, a clock that fills as time passes and a stack of coins that grows with the tokens; a `/tamaclaude` usage pane; palettes for the chat colors. |

Both read the same palette and monster choices, so the critter in your sidebar
is the one dancing in your chat.

## Install

Both pieces need [Node.js](https://nodejs.org) 18 or newer on your `PATH`.
Nothing is downloaded or built at install time.

### herdr plugin

```sh
herdr plugin install <owner>/tamaclaude/herdr
```

Optionally, put critter icons in the sidebar instead of herdr's own state dots
(this adds a marked block to herdr's `config.toml`, keeps a backup next to it,
and checks it with `herdr config check`; `sidebar-uninstall` takes it out):

```sh
herdr plugin action invoke tamaclaude.sidebar-install
```

Bind the usage popup to a key in `config.toml`:

```toml
[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "tamaclaude.stats"
description = "token usage"
```

| Action | What it does |
| --- | --- |
| `tamaclaude.stats` | Token usage popup: today, the 5-hour session, the week, the last 14 days and today by hour. `p` switches palette, `r` refreshes, `q` closes. |
| `tamaclaude.sidebar-install` / `sidebar-uninstall` | Add or remove the monster rows in the sidebar. |
| `tamaclaude.palette-next` | Switch to the next palette. |
| `tamaclaude.icon` | Choose the focused agent's icon from a list (`s` switches Nerd Font / emoji icons). |
| `tamaclaude.reroll` | Give the focused agent a random new icon and monster. |

### Claude Code mod

At the prompt of a Claude Code session:

```
/plugin install tamaclaude --marketplace <owner>/tamaclaude
```

or from a shell:

```sh
claude plugin install tamaclaude --marketplace <owner>/tamaclaude
```

| Command | What it does |
| --- | --- |
| `/tamaclaude` | Opens the token usage pane. |
| `/tamaclaude palette [name]` | Lists palettes, or switches to one. |
| `/tamaclaude theme on` / `off` | Colors the chat itself with the palette, mapped the way Omarchy themes Claude Code, or goes back to your previous theme. |
| `/tamaclaude pet on` / `off` | Shows or hides the monster above the prompt between turns. |
| `/tamaclaude icon [name]` | Lists the icons, or picks one for this session. |
| `/tamaclaude icons nerd\|emoji` | Nerd Font icons (default) or emoji in the sidebar. |
| `/tamaclaude reroll` | A random new icon and monster for this session. |

Between turns the monster hangs out above the prompt: it naps, snacks, sips
coffee, plays ball, reads the docs or goes to the bathroom, a new scene every
20 seconds. While Claude works it types on a keyboard, swings a hammer at tool
calls, thinks in bubbles and pings a laptop.

## Icons

Every agent gets one of 13 critters, picked from its session so it stays the
same across restarts. A working agent shows a spinner next to its icon (animated
while Claude works when the mod is installed), a blocked one a red alert, a
finished one a green check. The default icons need a
[Nerd Font](https://www.nerdfonts.com) (Omarchy ships one); choose `emoji`
anywhere else.

## Palettes

`omarchy` (the default) follows the active [Omarchy](https://omarchy.org) theme
and falls back to `claude` elsewhere. Built in: `claude`, `tokyo-night`,
`catppuccin`, `gruvbox`, `nord`, `everforest`, `kanagawa`, `rose-pine`,
`osaka-jade`, `ristretto`, `matte-black`.

The choice is saved in `~/.config/tamaclaude/config.json` and shared by both
pieces.

## Where the numbers come from

Token counts are summed from Claude Code's own transcripts in
`~/.claude/projects`, with each API response counted once. The 5-hour and weekly
limit percentages are the ones Claude Code receives with each response
(subscription plans only); the mod saves the latest reading to
`~/.local/state/tamaclaude/limits.json` so the herdr popup can show it too.
Nothing leaves your machine.

## Development

```sh
herdr plugin link ./herdr            # run the herdr plugin from this checkout
claude --plugin-dir ./claude         # run the mod from this checkout
npm run sync                         # copy shared/ into both packages after editing it
npm test                             # shared tests + the mod's tests
```

`shared/` holds the monster generator, the palettes and the usage reader. Each
package carries its own copy (`herdr/src/lib`, `claude/hooks/lib`,
`claude/scripts`) because herdr and Claude Code each install only their own
folder; `npm run check` fails when a copy is stale.

## License

MIT
