---
title: "LLMWIKI Git Backup"
type: project
area: knowledge
project_status: done
tags: [wiki, project]
created: 2026-10-27
updated: 2026-11-18
source: manual
status: reviewed
related: ["[[LLMWIKI]]", "[[agents]]"]
---

# LLMWIKI Git Backup

**Area:** [[Knowledge]]
**Finish line:** the vault is one git repo that gets small automatic commits and is pushed to a remote off the server

## Why

The vault has **no version history**. In the 2026-10-27 cleanup, 50+ notes were permanently deleted with no undo. The last snapshot is `Desktop/LLMWIKI-backup-2026-07-06/`.

## Decision (2026-10-27)

- **One repo for the whole vault**, not one per section. The vault is roughly 40 small `.md` files, which is tiny for git, and a single repo gives one history and one restore point.
- **Small, frequent commits** instead of big batches. Each commit holds one agent batch or one auto-save interval, so any single change can be undone.
- Repo root: the vault folder, `/mnt/user/OnePiece/HomeLab/LLMWIKI/Desktop/LLMWIKI` on the host (`/config/Desktop/LLMWIKI` in the container)

## `.gitignore`

```
.obsidian/workspace*.json
.obsidian/cache
.obsidian/plugins/obsidian-local-rest-api/data.json
.smart-env/
.trash/
.DS_Store
.obsidian/plugins/local-rest-api-second-brain-mcp-extension/embeddings-cache.json
.obsidian/plugins/llmwiki-mcp-bridge/data.json
.obsidian/plugins/karpathywiki/data.json
people/
schema/.network-private.md
```

(Keep the rest of `.obsidian/`. The Local REST API plugin's `data.json` **does** contain its API key — checked 2026-10-28 — so it is ignored. `people/` and `schema/.network-private.md` were added 2026-11-18 — see rule 15.)

## Steps

- [x] Install the **Obsidian Git** plugin in the LLMWIKI container (Community Plugins) and initialize the repo — *done 2026-10-28, initialized from the host (`git init -b main` as the container user), no UI dialog needed*
- [x] Add the `.gitignore` above, then make the first commit, `manual: initial import`
- [x] Plugin settings: auto-commit every **10 min** when there are changes, message `auto: {{date}} ({{numFiles}} files)` — *fixed 2026-11-18: `autoSaveInterval` had silently been `0` (auto-commit actually off) since at least 2026-11-14, contradicting this note and rule 5. Now `autoSaveInterval: 10`, `differentIntervalCommitAndPush: false`.*
- [x] Remote: `github.com/Wizard815/LLM-will-remember-this`, added 2026-11-18. **Public, not private** — the user chose to keep it public rather than switch; see rule 15 for what that requires (placeholders for LAN IPs, `people/` never tracked). History was squashed once on 2026-11-18 to remove personal content and real IPs that had leaked into early commits before that rule existed.
- [x] Auto-push on — `differentIntervalCommitAndPush: false`, `autoSaveInterval: 10` (10-min commit-and-sync), confirmed 2026-11-18
- [x] Agents: keep the commit messages from [[agents]] (`ingest:`, `maintain:`, `lint:`…) for their own batches — host/CLI agents write their own; MCP agents running `obsidian-git:commit` get the auto template
- [x] When auto-commits are running, change rule 5 in [[agents]] from "aspirational" to live

## Notes for agents

- The MCP (Local REST API) path can trigger `obsidian-git:commit` / `push` / `pull` but can't read results, see `.git`, or set commit messages. Agents on the RaidLab host can run git directly in the vault: `docker exec -u abc -e HOME=/config LLMWIKI git -C /config/Desktop/LLMWIKI <cmd>` (or on the host path with git 2.51).
- The plugin only reads `data.json` on load — after editing settings externally, restart the LLMWIKI container or toggle the plugin.
