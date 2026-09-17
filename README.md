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
plugins/telltale/                 the plugin: .claude-plugin/plugin.json, hooks/, README, LICENSE
scripts/  tests/  Makefile        development tooling (Python via uv, bun for the TypeScript tests)
docs/                             spec (SDD), tickets, manual test results
```

## Develop

```bash
uv sync
make check     # ruff, mypy, pytest, bun test, claude plugin validate --strict (plugin and marketplace)
make mutate    # mutation tests: every entry in tests/突變/ must turn the suite red
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD/plugins/telltale" --debug-file /tmp/tt.log
```

## License

MIT — see [LICENSE](LICENSE).
