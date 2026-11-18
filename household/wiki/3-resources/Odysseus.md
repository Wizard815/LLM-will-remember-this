---
title: "Odysseus"
type: resource
resource_kind: system
area: ai
tags: [wiki, resource, ai, raidlab]
created: 2026-10-27
updated: 2026-10-27
source: "live-check 2026-10-27"
status: reviewed
related: ["[[Local AI]]", "[[LLM Inference Stack]]", "[[LLMWIKI]]"]
---

# Odysseus

Wizard's self-hosted AI workspace on [[RaidLab]]. **Area:** [[Local AI]]

## Deployment (2026-10-27)

- **Source:** `Wizard815/odysseus`, a fork of `odysseus-dev/odysseus` set up to run on AMD and NVIDIA GPUs → [[GitHub Repos]]. Model launch commands come from **Argos** (`:8081`).

- Compose stack `odysseus`, network `ai_net`:
  - `odysseus-odysseus-1`: image `odysseus-fork:local` (built locally from Wizard's fork), web on **`:7005`**
  - `odysseus-searxng-1`: web search
  - `odysseus-ntfy-1`: notifications
  - `odysseus-chromadb-1`: vector store
- Data: `/mnt/user/appdata/odysseus/` (data, logs, ssh). Builds its own llama.cpp (CPU and ROCm) under `data/llama-cpp/`.
- Uses the shared model library `/mnt/light/LLMBin` and reaches the llama.cpp container over SSH → [[LLM Inference Stack]]
- Mounts the Docker socket, so it can manage containers
- Connected to [[LLMWIKI]]

> [!note] History
> In June it ran from `/mnt/cache/appdata/odysseus` with the Docker Hub image `zenth815/odysseus-frontend:latest`.
