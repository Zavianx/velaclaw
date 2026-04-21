# @velaclaw/memory-wiki

Persistent wiki compiler and Obsidian-friendly knowledge vault for **Velaclaw**.

This plugin is separate from the active memory plugin. The active memory plugin still handles recall, promotion, and dreaming. `memory-wiki` compiles durable knowledge into a navigable markdown vault with deterministic indexes, provenance, structured claim/evidence metadata, and optional Obsidian CLI workflows.

When the active memory plugin exposes shared recall, agents can use `memory_search` with `corpus=all` to search durable memory and the compiled wiki in one pass, then fall back to `wiki_search` / `wiki_get` when wiki-specific ranking or provenance matters.

## Modes

- `isolated`: own vault, own sources, no dependency on `memory-core`
- `bridge`: reads public memory artifacts and memory events through public seams
- `unsafe-local`: explicit same-machine escape hatch for private local paths

Default mode is `isolated`.

## Config

Put config under `plugins.entries.memory-wiki.config`:

```json5
{
  vaultMode: "isolated",

  vault: {
    path: "~/.velaclaw/wiki/main",
    renderMode: "obsidian", // or "native"
  },

  obsidian: {
    enabled: true,
    useOfficialCli: true,
    vaultName: "Velaclaw Wiki",
    openAfterWrites: false,
  },

  bridge: {
    enabled: false,
    readMemoryArtifacts: true,
    indexDreamReports: true,
    indexDailyNotes: true,
    indexMemoryRoot: true,
    followMemoryEvents: true,
  },

  unsafeLocal: {
    allowPrivateMemoryCoreAccess: false,
    paths: [],
  },

  ingest: {
    autoCompile: true,
    maxConcurrentJobs: 1,
    allowUrlIngest: true,
  },

  search: {
    backend: "shared", // or "local"
    corpus: "wiki", // or "memory" | "all"
  },

  context: {
    includeCompiledDigestPrompt: false, // opt in to append a compact compiled digest snapshot to memory prompt sections
  },

  render: {
    preserveHumanBlocks: true,
    createBacklinks: true, // writes managed ## Related blocks with sources, backlinks, and related pages
    createDashboards: true,
  },
}
```

## Vault shape

The plugin initializes a vault like this:

```text
<vault>/
  AGENTS.md
  WIKI.md
  index.md
  inbox.md
  entities/
  concepts/
  syntheses/
  sources/
  reports/
  _attachments/
  _views/
  .velaclaw-wiki/
```

Generated content stays inside managed blocks. Human note blocks are preserved.

Key beliefs can live in structured `claims` frontmatter with per-claim evidence, confidence, and status. Compile also emits machine-readable digests under `.velaclaw-wiki/cache/` so agent/runtime consumers do not have to scrape markdown pages.

When `render.createBacklinks` is enabled, compile adds deterministic `## Related` blocks to pages. Those blocks list source pages, pages that reference the current page, and nearby pages that share the same source ids.

When `render.createDashboards` is enabled, compile also maintains report dashboards under `reports/` for open questions, contradictions, low-confidence pages, and stale pages.

## CLI

```bash
velaclaw wiki status
velaclaw wiki doctor
velaclaw wiki init
velaclaw wiki ingest ./notes/alpha.md
velaclaw wiki compile
velaclaw wiki lint
velaclaw wiki search "alpha"
velaclaw wiki get entity.alpha --from 1 --lines 80

velaclaw wiki apply synthesis "Alpha Summary" \
  --body "Short synthesis body" \
  --source-id source.alpha

velaclaw wiki apply metadata entity.alpha \
  --source-id source.alpha \
  --status review \
  --question "Still active?"

velaclaw wiki bridge import
velaclaw wiki unsafe-local import

velaclaw wiki obsidian status
velaclaw wiki obsidian search "alpha"
velaclaw wiki obsidian open syntheses/alpha-summary.md
velaclaw wiki obsidian command workspace:quick-switcher
velaclaw wiki obsidian daily
```

## Agent tools

- `wiki_status`
- `wiki_lint`
- `wiki_apply`
- `wiki_search`
- `wiki_get`

The plugin also registers a non-exclusive memory corpus supplement, so shared `memory_search` / `memory_get` flows can reach the wiki when the active memory plugin supports corpus selection.

`wiki_apply` accepts structured `claims` payloads for synthesis and metadata updates, so the wiki can store claim-level evidence instead of only page-level prose.

When `context.includeCompiledDigestPrompt` is enabled, the memory prompt supplement also appends a compact snapshot from `.velaclaw-wiki/cache/agent-digest.json`. Legacy prompt assembly sees that automatically, and non-legacy context engines can pick it up when they explicitly consume memory prompt supplements via `buildActiveMemoryPromptSection(...)`.

## Gateway RPC

Read methods:

- `wiki.status`
- `wiki.doctor`
- `wiki.search`
- `wiki.get`
- `wiki.obsidian.status`
- `wiki.obsidian.search`

Write methods:

- `wiki.init`
- `wiki.compile`
- `wiki.ingest`
- `wiki.lint`
- `wiki.bridge.import`
- `wiki.unsafeLocal.import`
- `wiki.apply`
- `wiki.obsidian.open`
- `wiki.obsidian.command`
- `wiki.obsidian.daily`

## Notes

- `unsafe-local` is intentionally experimental and non-portable.
- Bridge mode reads the active memory plugin through public seams only.
- Wiki pages are compiled artifacts, not the ultimate source of truth. Keep provenance attached to raw sources, memory artifacts, and daily notes.
- The compiled agent digests in `.velaclaw-wiki/cache/agent-digest.json` and `.velaclaw-wiki/cache/claims.jsonl` are the stable machine-facing view of the wiki.
- Obsidian CLI support requires the official `obsidian` CLI to be installed and available on `PATH`.
