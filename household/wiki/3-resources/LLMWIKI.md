---
title: "LLMWIKI"
type: resource
resource_kind: system
area: knowledge
tags: [wiki, resource, ai, homelab]
created: 2026-10-27
updated: 2026-11-16
source: manual
status: draft
related: ["[[Knowledge]]", "[[agents]]", "[[LLMWIKI Git Backup]]"]
---

# LLMWIKI

This vault: an AI-maintained knowledge base. **Area:** [[Knowledge]] · Rules: [[agents]] · Dashboard: [[HOME]]

## Deployment

- Container `LLMWIKI` (`lscr.io/linuxserver/obsidian:latest`) on `ai_net`
- Web UI: `<RAIDLAB_LAN_IP>:3010` / `:3011`
- Local REST API: `:27123` (http) / `:27124` (https); MCP endpoint `/mcp` (master key, whole vault: the admin's door)
- Family endpoints (LLMWIKI MCP Bridge, per-person tokens): `/family-mcp` (MCP) and `/family/vault/…` (REST)
- SMB share is read-only for existing notes

## Features

- **PARA layout** (since 2026-10-27): `1-projects`, `2-areas`, `3-resources`, `4-archive`
- **Family layout** (since 2026-11-16): shared `household/` plus a private `people/<id>/` per person, each with its own PARA, daily notes, inbox and sources. Registry: [[family]]
- **Dataview** dashboard ([[HOME]]) + **Bases** table (`Projects.base`)
- **Smart Connections**: local embeddings for semantic search
- **Backup:** none yet → [[LLMWIKI Git Backup]]

## History

- Fixed an SSE MCP transport bug (GitHub issue **#3017**) by pulling TempyTheCleric's branch and manually patching SQLite
- 2026-06-21: first ingest from a master context dump
- 2026-07-06: entity consolidation; dashboard and Bases added
- 2026-10-27: cleanup (test data and a stray token removed) and rebuild in PARA, with facts re-checked against the live server
- 2026-11-16: one wiki for the family; the homelab notes moved to `household/`, Wizard's own to `people/wizard/`

> [!warning] Verify
> The family endpoints are new: check `/family-mcp` answers on RaidLab once the bridge is deployed, then set `status: reviewed`.
