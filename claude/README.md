# tamaclaude for Claude Code

A pixel monster in place of Claude Code's spinner: it acts out what Claude is
doing, hangs out above the prompt between turns next to your usage and your
GitHub or GitLab repo, and colors everything in one palette.

```
/plugin install tamaclaude --marketplace fabandrade88/tamaclaude
```

Then `/tamaclaude help` lists every command. Needs Claude Code 2.1.300+ (the
plugin uses Claude Code's function hooks, an early-access API) and Node.js 18+.

Screenshots, commands and details: [the main README](https://github.com/fabandrade88/tamaclaude#readme).

## What it runs, reads, writes and sends

Everything tamaclaude does happens on your machine, in readable source in this
folder. It sends no analytics and no telemetry, and reads no credentials.

**Commands it runs** (by argument list, never through a shell):

- `node scripts/usage-node.mjs` after each turn, to sum token usage
- `git` in the project folder: remote, branch, status, ahead/behind, latest tag
- `gh` (GitHub CLI) or `glab` (GitLab CLI), when installed and signed in, for
  the repository's stars, issues, pull or merge requests and last CI run; at
  most every ten minutes
- `herdr`, only inside a [herdr](https://herdr.dev) pane, to read the pane's
  details and refresh the herdr plugin's look

**Network requests:** none of its own, except when `gh` or `glab` isn't signed
in: then it asks the public API of the project's forge for the same repository
numbers, `https://api.github.com/repos/<owner>/<repo>` or
`https://<your GitLab host>/api/v4/projects/<project>`. Only for a project whose
git remote is on GitHub or GitLab; no credentials are sent.

**Files it reads:** Claude Code's transcripts in `~/.claude/projects` (it keeps
only token counts and timestamps, never message text), `~/.claude/settings.json`
(to show in `/tamaclaude help` what is on), the active Omarchy theme's colors,
and the project's `package.json` version.

**Files it writes:**

- `~/.config/tamaclaude/config.json`: your choices (palette, toggles)
- `~/.local/state/tamaclaude/`: a usage cache (message ids, timestamps, token
  counts), the last limit readings, and a copy of the status line script
- only when you ask for them:
  - `/tamaclaude statusline on|off` changes `statusLine`, and
    `/tamaclaude theme on|off` changes `theme`, in `~/.claude/settings.json`.
    Only those keys change; a file that isn't valid JSON is left alone; the
    first change keeps a copy as `settings.json.tamaclaude-backup`.
  - `/tamaclaude theme on` also writes `~/.claude/themes/tamaclaude.json`.

Before uninstalling, run `/tamaclaude statusline off` and `/tamaclaude theme off`
to give those settings back.

## License

MIT, see [LICENSE](LICENSE).
