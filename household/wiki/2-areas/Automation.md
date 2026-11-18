---
title: "Automation"
type: area
area: automation
tags: [wiki, area, homelab]
created: 2026-10-27
updated: 2026-10-27
source: "live-check 2026-10-27"
status: reviewed
related: ["[[Plex Media Conversion Pipeline]]"]
---

# Automation

Workflows that run on their own, mostly **n8n** on RaidLab.

## Current state

- **n8n** runs on RaidLab (`:5678`), with files at `/mnt/user/OnePiece/HomeLab/N8N-Files`. It has read-only access to the `Keeper` Obsidian vault. `n8n-mcp` (`:3456`) is also running, so agents can drive n8n.
- **Hermes Agent + Hermes Studio** run on [[Codebox]] (Intel NUC, `<CODEBOX_LAN_IP>`). Workflows are **tested there and run on RaidLab**.
- **Cronicle** handles scheduled jobs
- Pipelines:
  - [[Plex Media Conversion Pipeline]]: H.265 / HDR10 conversion, **active**; tested on Codebox, runs on Unraid
  - [[ReMarkable OCR Pipeline]]: **retired** 2026-10-27; deactivate the `ReMarkableOCR` workflow in n8n
- An LLMWIKI ingest/maintenance workflow is **planned, not built** (see [[agents]])

## Active projects

```dataview
LIST
FROM "household/wiki/1-projects"
WHERE area = "automation"
```

## Archive

```dataview
LIST
FROM "household/wiki/4-archive"
WHERE area = "automation"
```
