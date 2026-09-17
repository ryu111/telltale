# telltale

A live status band for Claude Code: a strip of panels above the prompt that
polls, renders, and takes clicks — all inside one plugin.

```
telltale · 2 panels
─ hello ───────────────────────────────────────────────
hello · 14:03:07
寬 60 欄 · 高 2 列
─ clock ──────────────────────────────────────────────
14:03:07
updated 0s ago
```

## Install

telltale is a Claude Code plugin. It only draws through function hooks, which
are gated behind an environment variable — set it before you launch `claude`
either way:

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

# from this repo's marketplace
claude plugin marketplace add ryu111/telltale
claude plugin install telltale@telltale

# or, for development, straight from a checkout
git clone https://github.com/ryu111/telltale
claude --plugin-dir /path/to/telltale/plugins/telltale
```

When both are present for the same plugin name, `--plugin-dir` wins. Tested on Claude Code 2.1.267; the function-hooks API is early access and may change.

## `/telltale`

| Input | Output |
|---|---|
| `/telltale`, `/telltale status` | One line per panel: `● hello  on   2 rows` / `○ git  off` / `⋯ trace  on  dropped (height)`, then `band: N rows of M available` |
| `/telltale <id>` | Toggles that panel, replies `hello: on → off` |
| `/telltale <id> on` / `off` | Sets it; already-there replies `hello: on (unchanged)` |
| `/telltale on` / `off` | All panels, one line each in the format above |
| `/telltale help`, or anything that doesn't parse | `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: hello, clock` |
| Unknown id | `unknown panel "x"; known: hello, clock` — no guessing, no fuzzy match |

## What this plugin can touch

Pasted verbatim from `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate --strict plugins/telltale` (run at the repo root) — this is the whole static surface telltale is allowed to reach:

```text
register.tsx hooks: session.start, ui.render{component=AbovePrompt}, ui.message, command.run{command=telltale}
register.tsx calls: $.clock.every, $.clock.now, $.command.register, $.store.get, $.store.set, $.ui.invalidate, $.ui.resolve
```

## Design tradeoffs

**Why one plugin with multiple panels, not one plugin per panel.** Two plugins
both hooking `ui.render{component=AbovePrompt}` fight over the same render
site, and the loser isn't merged in — it disappears. Claude Code's own hook
failure message says the quiet part out loud:

```
hook failed: <plugin>: returned a drawing that holds an object that is not plain data
(a class instance) ... (ui.render; skipped; its last next() run's result stands)
```

The two render trees can't be composed (a class instance sneaking into
`next(e)`'s result breaks that path), so a second plugin drawing the same
surface silently erases the first one's band, with no error pointing at why.
A single plugin that owns the one `ui.render` hook and composes N panels
itself doesn't have this problem — that's what telltale is.

**The cost:** third parties can't drop in a new panel by installing a
separate plugin. Adding a panel means sending telltale a pull request. For a
single shared console, that's the same tradeoff `/config` already makes:
someone has to arbitrate the shared space.

## Known limitations

- **Default height is 7 rows**: `FIXED_ROWS (2) + (1 title + hello's 2 rows) + (1 title + clock's 1 row)` with both panels on, capped at `BAND_ROWS_MAX = 9`.
- **The rightmost 4 columns are a dead zone.** `TITLE_RESERVE = 4` (3 columns the engine's own `[-]` control covers, plus 1 column of buffer) is reserved on every title row and excluded from clicks — clicking there never toggles a panel.
- **Emoji width is not guaranteed.** `displayWidth`/`fit` size East-Asian wide/fullwidth characters at 2 columns and everything else at 1; emoji are out of scope for v0.1 and may measure wrong.
- **Narrower than 20 columns degrades to one line.** Below `MIN_COLUMNS = 20` the whole band collapses to a single `telltale · N panels` line instead of drawing any panel.
- **Panel on/off is shared by every session for this user**, the same way `/config` is: turning `hello` off in one session turns it off for all of that person's sessions, not per-session.
- **`$.store` lives on disk at `~/.claude/plugins/store/`**, one JSON file per plugin, named after its provenance (`telltale_inline-<hash>.json` for a `--plugin-dir` checkout, `telltale_<marketplace>-<hash>.json` when installed), outside `${CLAUDE_PLUGIN_DATA}`. `claude plugin uninstall telltale` does not delete it. To reset telltale's state (panel toggles, cached poll data) by hand:

  ```bash
  rm ~/.claude/plugins/store/telltale_*.json
  ```
