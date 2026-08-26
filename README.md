[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-checkpoint-memory

Curated, file-based long-term memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —
plain markdown notes you can open with anything, one store shared across every host you
use, and an index cap that is a **real refusal** rather than a request. (If the store
lives inside a project's git repo it must be git-ignored — memories carry machine-local
detail; see SKILL.md §1. A *dedicated private* repo for the store itself is fine.)

Part of [checkpoint-memory](https://github.com/your-org/checkpoint-memory).

## Why a plugin, when an `AGENTS.md` block already works

The block does carry the discipline, and for recall that is enough. Two things it cannot
do on its own:

**The cap becomes deterministic.** checkpoint-memory keeps its index under 200 lines / 25 KB
because the index loads every session and everything past the cap silently stops being
recalled. dsh exposes `ctx.tools.guard()` — a synchronous, **monotonic** refusal: once a guard
returns a reason, no later listener can turn it back into an allow. So here the limit is
enforced, not requested.

**The protocol arrives with the plugin.** The skill is registered at runtime through
dsh's skill registry — via a reactive `ctx.inject(['skills'], …)` child, so a profile
without a registry still gets the cap and one whose registry activates late still gets
the skill — which means it does not depend on landing files in one of the five skill
roots dsh scans, a path that is easy to get subtly wrong and fails silently when you do.

## Install

```sh
# From registry
dsh plugin --profile <name> add dsh-checkpoint-memory

# From local directory (development)
dsh plugin --profile web add link:~/.dsh/skills/checkpoint-memory/adapters/dsh/plugin/
```

That is the whole install. The package ships a `dsh.bundle` manifest pointing at its own
`cordis.patch.yml`, so the row is inserted into the profile's plugin tree for you — no
hand-editing. To change a default, patch the EXISTING row by id in your profile's own
patch layer — do **not** use a second `- insert:` (insert always appends, so you would
end up with two rows):

```yaml
- id: checkpoint-memory
  config:
    indexName: MEMORY.md
    maxLines: 200
    maxBytes: 25600
```

A patch replaces the targeted row's whole `config`, so list every key you mean to keep.

The plugin automatically appends the rules snippet from the checkpoint-memory skill
(`rules-snippet.md`) to `$DSH_HOME/AGENTS.md`. This plugin enforces the cap and supplies
the protocol; it does not create the store itself.

## What the plugin ships besides the guard

**The full skill lands in the dsh skill library.** On activation the plugin installs the
complete checkpoint-memory skill — `SKILL.md`, `tools/`, `templates/`, the dsh adapter
README, `rules-snippet.md`, `INSTALL.md` — into `$DSH_HOME/skills/checkpoint-memory/`
(it ships a self-contained payload in `skill/`). dsh's filesystem provider then serves the
whole protocol, not just the abbreviated runtime body, in the web/UI skill catalog. The
install is idempotent (a `.skill-version` mark skips an unchanged copy) and never deletes
user-layered files; an unwritable `$DSH_HOME` makes it a clean no-op, with the runtime
registration still working as the always-present fallback. Turn it off with
`config.installSkill: false`.

**The rules snippet is appended to `$DSH_HOME/AGENTS.md` automatically.** The payload's
`rules-snippet.md` is idempotently appended to the global `AGENTS.md`: if the snippet is
already present, nothing is added; if `AGENTS.md` does not exist yet, it is created. This
means the always-on memory discipline is loaded by dsh for every session without a manual
copy step. Turn it off with `config.appendRules: false`.

**A "同步记忆" (sync memory) button in the web composer tool row.** The browser half of
the plugin registers one button in the `conversation.input.right` slot. Clicking it submits
`/checkpoint-memory` to the **current session** via `session.prompt` — the host routes a
`/`-prefixed line as the skill command, so the model runs the **full §0 protocol in the
main conversation**: §0.1 recall (reads `MEMORY.md` — restore) and §0.2 curation/write
(scans this session — save). Running in the main conversation is deliberate: the model has
both this session's live context (for the curation judgement) and the memory index (for
recall), so restore and save are both real at once.



## Configuration

| Field | Default | Meaning |
|---|---|---|
| `indexName` | `MEMORY.md` | Basename treated as the memory index (case-insensitive; both `file_path` and `str_replace_editor`'s `path` are checked). An empty or non-string value falls back to the default. Nothing else is inspected. |
| `maxLines` | `200` | Hard line cap. Non-positive or non-finite values fall back to the default. |
| `maxBytes` | `25600` | Hard UTF-8 byte cap (25 KB). |
| `indexPath` | unset | Absolute path of the ONE index to guard. Without it the guard matches on basename alone, so an unrelated `MEMORY.md` in another project is gated too; set this and only that exact file is. Compared by identity (symlinks and `..` resolved; case-folded on Windows only), and a path that does not exist yet still has its first write guarded. |
| `registerSkill` | `true` | Set `false` to keep the cap but skip the runtime skill. |
| `skill` | built-in | Replace the skill body with your own markdown. |
| `installSkill` | `true` | Set `false` to keep everything else but skip the full-skill-to-library install. |
| `appendRules` | `true` | Set `false` to skip appending `rules-snippet.md` to `$DSH_HOME/AGENTS.md`. |
| `dshHome` | `$DSH_HOME` / `~/.dsh` | Where the full skill is installed — specifically `$DSH_HOME/skills/checkpoint-memory`. |

## What the guard actually does

| Call | Decision |
|---|---|
| `write` (or `str_replace_editor` `create`) ending within caps | allow |
| `write`/`create` that GROWS the index past a cap | **deny**, naming the numbers and what to compact |
| `write`/`create` that SHRINKS or keeps an over-cap index | allow — incremental compaction (210 → 205 → 198) must stay possible |
| Edit carrying `old_str`/`new_str`: result simulated | judged by the RESULT, same grow/shrink rule as a write |
| Unsimulable partial (e.g. `insert`) on an over-cap index | **deny**, telling the agent a shrinking whole-file write passes |
| Unsimulable partial on a healthy index | allow |
| `read`, `view`, or any unknown tool | allow — recall must never be blocked, even over cap |
| Any write to any other file | allow — not the guard's business |
| Missing/unreadable current index on a whole-file write | treated as EMPTY — a within-caps write passes, an over-cap first write is refused |
| Missing/unreadable index on a partial edit | allow — a guard must never block work over a path it cannot read |
| Malformed execution (no arguments, non-string path/content) | allow — not recognisably a write |

The deny rule mirrors `tools/index_guard.py` exactly: refuse only a result
that is over a cap AND grew past the current file. The line count ignores a trailing
newline, so an index sitting exactly at the cap stays writable.

## Known limits

- **An unsimulable partial that crosses the cap from under it is not caught.** `insert`
  and friends do not carry the resulting text. The breach is caught by the next
  whole-file write, or by `tools/check.py`. What is guaranteed: an already-over
  index cannot be grown further, and a shrinking write always passes.
- **The tool roster follows dsh's documented tool-fs contract** (`write`/`edit` with
  `file_path`, `str_replace_editor` with `path`) and is deliberately conservative:
  unknown tools pass.
- dsh is a developer preview and its plugin API can change. This plugin deliberately
  touches only `ctx.tools.guard()` and a reactive `ctx.inject(['skills'], …)` child
  that registers the skill, so it stays cheap to fix.
- **The browser half ships from disk with a content hash (`/plugins/<id>/client.js?rev=…`)
  computed when the web server's client-module graph builds.** Editing `client.js` (or
  adding/removing the `dsh.client` declaration) takes effect on the **next `dsh web`
  restart** — a plain refresh reuses the previous `rev` until the graph rebuilds. The
  server half and the skill install read from disk on every activation, so those update
  with a normal restart/reload.
- For debugging the button's click: open the browser devtools console before clicking.
  A failed `/checkpoint-memory` submit logs
  `[checkpoint-memory] 同步记忆 failed: …`, and the button itself shows
  `同步中…` → `✓` (submitted) / `×` (error) / `!` (service unavailable) instead of silence.

## License

MIT
