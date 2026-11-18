---
title: "GitHub Repos"
type: resource
resource_kind: guide
area: ai
tags: [wiki, resource, ai, homelab]
created: 2026-10-27
updated: 2026-10-27
source: "live-check 2026-10-27"
status: reviewed
related: ["[[Local AI]]", "[[Homelab]]", "[[Codebox]]", "[[RaidLab]]"]
---

# GitHub Repos

Every repo under **github.com/Wizard815** (28 repos, checked 2026-10-27 with `gh repo list`), grouped by what they're for. "Runs as" links each repo to where it's deployed.

## AI: gfx906 / MI50 inference stack → [[Local AI]], [[LLM Inference Stack]]

| Repo | Type | What it is | Runs as |
|------|------|-----------|---------|
| `mx-llama.cpp-Rocm10` | fork of mxxm-t/mx-llama.cpp | llama.cpp built for ROCm 10 | `mx-llamacpp-ssh` on RaidLab |
| `TheRock-gfx906` | fork of ROCm/TheRock | ROCm/HIP build system, tuned for gfx906 | builds the ROCm 10 toolchain for the MI50s |
| `ML-gfx906` | fork of mixa3607/ML-gfx906 | llama.cpp / ComfyUI / vLLM builds for gfx906 | |
| `whisper.cpp-rocm10-gfx906` | fork of ggml-org/whisper.cpp | Whisper speech-to-text for ROCm 10 / gfx906 | `whispercpp-transcriber` (stopped) |
| `colibri-gfx906` | fork of JustVugg/colibri | runs MoE models by streaming experts from disk | |
| `llama-swap-rescan` | fork of mostlygeek/llama-swap | model swapping for OpenAI-compatible servers | |
| `Mi50` | original | MI50 server info | |
| `RockComp` | original, **private** | Dockerfile project, purpose not documented | |

## AI: apps and agents → [[Local AI]]

| Repo | Type | What it is | Runs as |
|------|------|-----------|---------|
| `argos` | **original** (Go) | **launch-command builder** for llama-server; works with Odysseus and llama-swap | `argos` on RaidLab (`:8081`) |
| `odysseus` | fork of odysseus-dev/odysseus | self-hosted AI workspace, set up for AMD + NVIDIA GPUs | [[Odysseus]] (`odysseus-fork:local`, `:7005`) |
| `hermes-agent` | fork of NousResearch/hermes-agent | the Hermes agent | on [[Codebox]] |
| `hermes-studio` | fork of EKKOLearnAI/ekko-studio | web dashboard for Hermes | on [[Codebox]] |
| `omi-local` | fork of BasedHardware/omi | AI that watches the screen and listens to conversations, run locally | `omi-*` stack on RaidLab (6 containers, stopped) |
| `UpstreamManager` | **original** (Python) | manages upstreams and branches for forks, with an IDE and chat | |
| `book-scribe` | **original** (Python) | book-writing assistant you talk to | |
| `OpenHands`, `OpenHands-CLI` | forks of OpenHands | AI coding agent + CLI | last touched Sept 2026 |
| `open-webui-Filetree` | fork of open-webui | Open WebUI with a file-tree chat system | retired (orphaned appdata on RaidLab) |
| `hydrate` | fork of hydrateagent/hydrate | | last touched Feb 2026 |

## Homelab apps → [[Homelab]]

| Repo | Type | What it is | Runs as |
|------|------|-----------|---------|
| `ALLGlance` | **original** (JS) | calendar, tasks and life events with MCP; built on the Glance ecosystem + Vikunja | `dayglance` / `lifeglance` / `lastglance` + `vikunja` on RaidLab |
| `milaclone-mcp` | fork of ellshep/milaclone | self-hosted Milanote-style canvas with MCP support | `milaclone-app` (`:4321`) + `milaclone-mcp` (`:8383`) |
| `seerr` | fork of seerr-team/seerr | media requests for Plex | RaidLab runs the **upstream** image, not this fork |

## TTRPG → TTRPG

| Repo | Type | What it is | Runs as |
|------|------|-----------|---------|
| `mcp-kanka` | fork of twistymaze/mcp-kanka | Kanka MCP server, with Wizard's parent-nesting fix | `mcp-kanka` on RaidLab (`:8765`) → Kanka MCP |
| `DNDWORLDAPP` | **original** (TypeScript) | self-hosted worldbuilding/campaign app (LegendKeeper-style tree on a Kanka-style model, maps + fog of war, API + MCP) → DNDWORLDAPP | Docker `:8080`; not on RaidLab yet |

## Hardware → Hardware & 3D Printing

| Repo | Type | What it is |
|------|------|-----------|
| `deej-Linux` | fork of omriharel/deej | Arduino hardware volume-slider mixer, with Linux support |
| `ESP32-Task-Manager` | **original**, **private** (C++) | task tracker on a Freenove 4" ESP32 touch display, built for work |

## Other / legacy

| Repo | Type | What it is |
|------|------|-----------|
| `MangaMerger` | **original** (Python/Flask) | merges manga chapter PDFs/CBZs into one file |
| `remarkable-obsidian-sync` | fork | ReMarkable → Excalidraw for Obsidian. **Legacy:** the ReMarkable is gone ([[ReMarkable OCR Pipeline]]), so it could be archived on GitHub. |

> [!note] Patterns
> - Most AI repos are **gfx906 forks**: Wizard keeps ROCm-10 builds alive for the MI50s, which upstream ROCm has deprecated
> - **Most active (updated 2026-10-27):** mx-llama.cpp-Rocm10, hermes-studio, argos, DNDWORLDAPP, UpstreamManager, omi-local, TheRock-gfx906, odysseus, RockComp
