# tamagoxtix for Claude Code

A pixel monster in place of Claude Code's spinner: it acts out what Claude is
doing, hangs out above the prompt between turns next to your usage and your
GitHub or GitLab repo, cheers you on while you type a prompt, and colors everything in one palette.

```sh
claude plugin install tamagoxtix --marketplace fabandrade88/tamagoxtix
```

Run it in a terminal, then open Claude Code in any folder. Then `/tamagoxtix help` lists every command, and `/tamagoxtix doctor` checks
what it needs (Node.js, git, a Nerd Font) — nothing is installed for you. Needs Claude Code 2.1.300+ (the
plugin uses Claude Code's function hooks, an early-access API) and Node.js 18+.

Screenshots, commands and details: [the main README](https://github.com/fabandrade88/tamagoxtix#readme).

## What it runs, reads, writes and sends

Everything TamaGoxtix does happens on your machine, in readable source in this
folder. It sends no analytics and no telemetry, reads no credentials (no
tokens, keys or passwords: `gh` and `glab` sign in on their own), and never
takes commands from a server.

### Programs it runs

Always by argument list (`$.process.run`), never through a shell, and never a
command that comes from the network:

| Program | When | Why |
| --- | --- | --- |
| `node scripts/usage-node.mjs --days 14` (this folder) | at the start of a session and after each turn | to sum token usage from Claude Code's transcripts |
| `git remote get-url origin`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain`, `git rev-list --left-right --count @{u}...HEAD`, `git describe --tags --abbrev=0` | at the start of a session and after each turn; outside a repository once per folder every ten minutes | the repo column: remote, branch, changed files, ahead/behind, latest tag |
| `gh api repos/<owner>/<repo>`, `gh pr list`, `gh run list` | when `gh` is installed and signed in, at most every ten minutes | the repository's issues, pull requests, stars and last CI run |
| `glab api projects/<project>…` | when `glab` is installed, at most every ten minutes | the same for GitLab |
| `herdr pane get`, `herdr pane report-metadata`, `herdr plugin action invoke tamagoxtix.*` | only inside a [herdr](https://herdr.dev) pane | the monster's identity for the pane, and the herdr plugin's palette |
| `node --version`, `git --version`, `gh auth status`, `glab --version` | only when you run `/tamagoxtix doctor` | to say what is installed |

The owner, repository and branch in those arguments come from your project's
own git remote, cleaned of control characters.

### Hosts it contacts

Only when `gh` or `glab` is missing or not signed in, it asks the public API of
your project's own forge for the same repository numbers:

- `https://api.github.com/repos/<owner>/<repo>`, for a remote on GitHub (open
  issues and stars only; pull requests and CI need `gh`)
- `https://<your GitLab host>/api/v4/projects/<project>` (and its pipelines and
  merge requests), for a remote on GitLab: gitlab.com or the self-hosted host
  named in your git remote

What it sends is the request itself: the owner, repository and branch names
from your git remote. No file contents, no conversation, no token counts, no
credentials.

### Files it reads

- Claude Code's transcripts in `~/.claude/projects`: only each response's token
  counts, ids and timestamp; message text is never kept
- `~/.claude/settings.json`, to show in `/tamagoxtix help` what is on
- the active Omarchy theme's colors (`~/.config/omarchy/current/theme`), only
  with the `omarchy` palette and only where the file exists
- the project's `package.json`, for its version
- its own config and state (below)

### Files it writes

Every path is fixed; nothing is written into your project.

- `~/.config/tamagoxtix/config.json`: your choices (palette, toggles)
- `~/.local/state/tamagoxtix/`: a usage cache (short ids, timestamps, token
  counts), the last limit readings, your monster's rerolls and icon, and a copy
  of the status line script (`statusline/`)
- only when you ask for them:
  - `/tamagoxtix statusline on|off` changes `statusLine`, and
    `/tamagoxtix theme on|off` changes `theme`, in `~/.claude/settings.json`.
    Only those keys change; a file that isn't valid JSON is left alone; the
    first change keeps a copy as `settings.json.tamagoxtix-backup`, and the
    file is read back and restored if anything went wrong.
  - `/tamagoxtix theme on` also writes `~/.claude/themes/tamagoxtix.json`.

Before uninstalling, run `/tamagoxtix statusline off` and `/tamagoxtix theme off`
to give those settings back.

### What its hooks do

| Hook | What it does |
| --- | --- |
| `session.start`, `session.end` | loads your palette and monster; registers `/tamagoxtix` |
| `turn.start`, `turn.complete` | starts and stops the spinner's clock; refreshes usage and the repo column |
| `turn.step` | counts the characters Claude streams, to estimate the token bar while a turn runs; the text is never kept or sent |
| `session.measure` | keeps Claude Code's 5-hour and weekly limit readings for the bars |
| `prompt.edit` | looks at whether the prompt box holds a prompt, to cheer you on while you type; it passes every edit on unchanged and never keeps or sends the text |
| `ui.render` (`Spinner`, `AbovePrompt`, `CommandOutput` of `/tamagoxtix`) | draws the monster, the band above the prompt and the cards |
| `command.run` (only `/tamagoxtix`) | answers its own command; other commands are not touched |

It registers one command, `/tamagoxtix`, and no tools or agents. It answers no
permission prompts and changes no other plugin's calls. The `scripts/` files
are Node.js programs it runs with `node` (above), not mod code.

## License

MIT, see [LICENSE](LICENSE).
