# LLM will remember this

A self-hosted Obsidian vault that AI agents and people maintain together. It's a household knowledge base: a curated wiki, short-term memory for the day, and a private space for each family member. Agents reach it over MCP.

This repo is the vault itself. Obsidian Git commits and pushes it from a running Obsidian container.

## Layout

| Path | What it holds |
|------|---------------|
| `HOME.md`, `Projects.base` | Dashboard (Dataview queries) and a sortable project table |
| `household/wiki/` | The shared wiki, organized with **PARA**: `1-projects`, `2-areas`, `3-resources`, `4-archive`, plus `logs/` |
| `household/daily/`, `household/inbox/`, `household/raw/` | Short-term memory: daily notes, quick capture, source material waiting to be filed |
| `people/<id>/` | Each person's private root. **Gitignored**, so it never reaches this repo |
| `schema/agents.md` | The rules every agent follows: where notes go, front matter, workflows, integrations |
| `schema/family.md` | Roles, tokens and visibility for a multi-person household |
| `schema/templates/` | Note templates (project, area, resource, log, daily, source, profile) |
| `scripts/` | Family setup script and the test suite |
| `.obsidian/plugins/` | The plugins the vault depends on (Local REST API, the MCP bridge, Obsidian Git, Dataview, and others) |

## How agents use it

- Agents connect to the Obsidian Local REST API's `/mcp` endpoint. The bundled `llmwiki-mcp-bridge` plugin adds semantic search (`query_wiki`, `get_wiki`, `wiki_card`), memory tools (`memory_log`, `memory_capture`, `memory_rollover`, `memory_add_source`) and per-person tokens.
- Anything may write to short-term memory. Only the Ingest and Capture workflows in `schema/agents.md` may write to `household/wiki/`.
- The campaign tool, not this vault, holds tabletop RPG content.

## Privacy

The repo is public on purpose, so everything tracked must be safe to publish (rule 15 in `schema/agents.md`):

- `people/` and `schema/.network-private.md` are gitignored
- Tracked notes use placeholders (`<RAIDLAB_LAN_IP>`, `<CODEBOX_LAN_IP>`, `<PUBLIC_DOMAIN>`) instead of real addresses
- No secrets, tokens or API keys anywhere in the vault (rule 9). The REST API plugin's `data.json` is gitignored.

## Tests

Needs Node.js (last run on v26):

```bash
for t in scripts/*.test.*; do node "$t" || echo "FAILED: $t"; done
```

## License

MIT, see [LICENSE](LICENSE). The bundled plugins under `.obsidian/plugins/` keep their own licenses.
