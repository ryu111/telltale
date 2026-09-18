# telltale

A live status band for Claude Code: a strip of panels above the prompt that
polls, renders, and takes clicks — all inside one plugin.

A regular install only ever shows `agents`; the screen below is what you get
with `TELLTALE_DEV=1` set, which also registers the `hello`/`clock` demo
panels used in this README:

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

When both are present for the same plugin name, `--plugin-dir` wins. Tested on Claude Code 2.1.274 (v0.2); the function-hooks API is early access and may change.

## `/telltale`

| Input | Output |
|---|---|
| `/telltale`, `/telltale status` | One line per panel: `● hello  on   2 rows` / `○ git  off` / `⋯ trace  on  dropped (height)`, then `band: N rows of M available` |
| `/telltale <id>` | Toggles that panel, replies `hello: on → off` |
| `/telltale <id> on` / `off` | Sets it; already-there replies `hello: on (unchanged)` |
| `/telltale on` / `off` | All panels, one line each in the format above |
| `/telltale help`, or anything that doesn't parse | `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: agents` (or `panels: agents, hello, clock` with `TELLTALE_DEV=1`) |
| Unknown id | `unknown panel "x"; known: agents` (same `TELLTALE_DEV` addition) — no guessing, no fuzzy match |

v0.2 adds a sub-vocabulary for the `agents` panel:

| Input | Output |
|---|---|
| `/telltale agents style`, `agents style auto\|v1\|v2\|v4` | `agents style: auto` (the default — follows placement) / `agents style: auto → v1`; same value replies `(unchanged)` |
| `/telltale agents edge`, `agents edge right\|bottom\|both` | Same format (`right` when nothing is stored); a value the engine doesn't have replies `edge top: not available in this build` |
| `/telltale agents size`, `agents size summary\|compact\|full` | Same format, backed by the `size.agents` store key |
| `/telltale agents clear` | Dismisses every failed/killed cell and every orphan lane: `agents: cleared 2` |
| `/telltale status` | Now prints an extra segment per panel: `● agents  on   compact  3 rows` |

## What this plugin can touch

Pasted verbatim from `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate --strict plugins/telltale` (run at the repo root) — this is the whole static surface telltale is allowed to reach:

```text
register.tsx hooks: session.start, ui.render{component=AbovePrompt}, ui.render{component=Pane}, ui.message, command.run{command=telltale}, turn.start, turn.step, turn.complete, ui.render{component=Spinner}, session.receive{origin has {kind=task-notification}}
register.tsx calls: $.agent.list, $.clock.every, $.clock.now, $.command.register, $.env.get, $.session.id, $.store.delete, $.store.get, $.store.keys, $.store.set, $.ui.close (via applyEdge), $.ui.invalidate, $.ui.open, $.ui.resolve
```

## The `agents` panel

`agents` shows one **cell** per running or recently-finished task, from three
sources: the `main` loop (this session's own turns), each `sub`agent spawned
with the `Agent` tool, and each `bg` background command (`Bash` with
`run_in_background: true`, or a `Monitor`/`Workflow` invocation). Every cell
tracks its own steps (`prompt → tool use → … → reply`) as they happen — there
is no history and no replay: close telltale, or scroll the panel off, and
whatever wasn't on screen is gone.

Cells render in one of three styles, switched with `/telltale agents style`:
`v1` (a horizontal chain of boxed steps, for a wide-but-short panel docked
top/bottom), `v2` (a vertical list of steps inside one framed box, for a
narrow-but-tall panel docked left/right — the default when the `Pane` is
side-docked), `v4` (both the header and the steps squeezed onto one chained
line, for when there's only 2–3 rows of height). The default is `auto` — `v2`
when the `Pane` is docked, `v1` when it sits above the prompt; setting a
concrete style (by command or by the title-row buttons below) overrides that
until you set it back to `auto`. `/telltale agents edge` (or the title-row
`[R B RB]` buttons) switches where `agents` draws, three ways: `right` (the
default — a `Pane`; the engine docks it beside the transcript from ~110
columns and drops it above the prompt when narrower), `bottom` (the
AbovePrompt band only — no `Pane`), `both` (`agents` stays in the `Pane`,
every other panel moves to the AbovePrompt band instead). The v0.2 design
draft sketched all four screen edges; `top`/`left` are not positions the
engine offers, so those answer `not available in this build` — that's an
engine limitation, not telltale giving up on the idea.

**`TELLTALE_DEV`**: the `hello` and `clock` panels only register when
`TELLTALE_DEV=1` is set before Claude Code starts; a regular install only
ever sees `agents`.

```bash
export TELLTALE_DEV=1   # also register the hello/clock demo panels
```

**Subagents.** In this build, `turn.step` reliably carries `agentId` for
subagent turns, distinct from the main loop's own turns (`agentId` absent),
so a subagent's steps land on its own cell — this was verified, not assumed.

**Background command limits.** Background commands are matched to their cell
by `description` text parsed out of the completion notification, because the
engine gives no stable id for them outside that text. Two background
commands running at once with the same description can end up closing each
other's cell instead of their own — a cell closed by mistake this way can
always be dismissed by hand. Similarly, when the `Agent` tool is used to
spawn two subagents with the same `description` at the same time, the model
label telltale attaches to each cell (read from the spawn call, not from
`$.agent.list`, which doesn't carry it) can be swapped between them.

**Orphan detection.** A background cell that's gone `30 min` without a
notification turns yellow (long-running, still counted as running); past
`2 h` it becomes an **orphan** (`?`, yellow) and stays on screen — nothing
auto-dismisses it — until you click it or run `/telltale agents clear`.

**Clicks.** The `agents` title row carries `[1 2 3] [S C F] [R B RB] [x]` —
style v1/v2/v4, size summary/compact/full, edge right/bottom/both, clear —
the active one bold; hidden when the row is too narrow.

**Why `$.ui.open`/`$.ui.close` show up in `calls:` below.** `$.ui.*` only
ever draws; `open`/`close` control whether the `Pane` surface is visible at
all, so telltale has to call `open` once for the Pane to render anything, and
`close` when `/telltale agents edge bottom` (or the `[B]` button) puts
`agents` back in the AbovePrompt band instead — neither is telltale reaching
out to move data anywhere.

**Why `$.session.id`/`$.store.keys`/`$.store.delete` show up too.**
`$.session.id` is read once so each session keeps its own cells (the store
file is shared by every session of the same plugin); `$.store.keys`/`delete`
only ever touch telltale's own `agents.*` keys, to drop cells left by
sessions that ended more than a day ago. Headless sessions (`-p`, the SDK,
Claude Desktop) leave the store alone entirely.

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

- **Default height is 9 rows**: `agents` alone, at its default `full` stage: `TITLE_ROWS (1) + (1 title + 7 rows) = 9`, capped at `BAND_ROWS_MAX = 9`. The status row is not part of that budget — it only appears (taking one row away from panel content) when a panel got dropped for height or a panel is erroring; the rest of the time that row goes back to panel content.
- **The rightmost 4 columns are a dead zone.** `TITLE_RESERVE = 4` (3 columns the engine's own `[-]` control covers, plus 1 column of buffer) is reserved on every title row and excluded from clicks — clicking there never toggles a panel.
- **Emoji width is not guaranteed.** `displayWidth`/`fit` size East-Asian wide/fullwidth characters at 2 columns and everything else at 1; emoji are out of scope for v0.1 and may measure wrong.
- **Narrower than 20 columns degrades to one line.** Below `MIN_COLUMNS = 20` the whole band collapses to a single `telltale · N panels` line instead of drawing any panel.
- **Panel on/off is shared by every session for this user**, the same way `/config` is: turning `hello` off in one session turns it off for all of that person's sessions, not per-session.
- **`agents` is real-time only.** There's no history buffer and no replay — a
  cell that scrolls off, or a session that ends, is gone; open a fresh
  session and you start from whatever `$.agent.list()`/notifications report
  as still in flight.
- **`agents` only draws in the two positions the engine offers**, not the
  four screen edges the v0.2 design draft sketched: a `Pane` docked right on
  a wide terminal, or a boxed panel above the input on a narrow one.
  `/telltale agents edge` picks between them (`right`/`bottom`) or shows both
  at once (`both`, `agents` in the `Pane`, everything else above the
  prompt) — `top`/`left` answer `not available in this build`. That's this
  Claude Code build's engine, not a scope cut telltale made on purpose.
- **`$.store` lives on disk at `~/.claude/plugins/store/`**, one JSON file per plugin, named after its provenance (`telltale_inline-<hash>.json` for a `--plugin-dir` checkout, `telltale_<marketplace>-<hash>.json` when installed), outside `${CLAUDE_PLUGIN_DATA}`. `claude plugin uninstall telltale` does not delete it. To reset telltale's state (panel toggles, cached poll data) by hand:

  ```bash
  rm ~/.claude/plugins/store/telltale_*.json
  ```
