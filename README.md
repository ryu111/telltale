# telltale

A live status band for Claude Code — multiple workflows at a glance, built on function hooks.

This repository is a Claude Code **plugin marketplace** with one plugin, `telltale`, plus the
tooling used to develop it. The plugin itself — what you install, and its README — lives in
[`plugins/telltale/`](plugins/telltale/README.md).

## Install

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1   # function hooks are gated; needed every launch
claude plugin marketplace add ryu111/telltale
claude plugin install telltale@telltale
```

Tested on Claude Code 2.1.267; the function-hooks API is early access and may change.

## Layout

```
.claude-plugin/marketplace.json   the marketplace (lists plugins/telltale)
plugins/telltale/                 the plugin, nothing else: .claude-plugin/plugin.json, hooks/, README, LICENSE
scripts/  tests/  Makefile        development tooling; tests/hooks/ holds the bun tests + fake engine
docs/                             spec (SDD), tickets, manual test results
```

## Develop

```bash
uv sync
make check     # ruff, mypy, pytest, bun test, claude plugin validate --strict (plugin and marketplace)
make mutate    # mutation tests: every entry in tests/突變/ must turn the suite red
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD/plugins/telltale" --debug-file /tmp/tt.log
```

To run your checkout every day without installing it (and without being pinned to an
installed version), symlink the plugin into the skills directory; it loads as
`telltale@skills-dir` on every plain `claude` launch:

```bash
ln -s "$PWD/plugins/telltale" ~/.claude/skills/telltale
```

Put `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` under `env` in `~/.claude/settings.json` so you
don't have to export it each time. A `--plugin-dir` of the same name wins over the symlink.

## License

MIT — see [LICENSE](LICENSE).
