---
title: "Codebox"
aliases: ["Demo Box", "NUC"]
type: resource
resource_kind: system
area: homelab
tags: [wiki, resource, homelab, ai]
created: 2026-10-27
updated: 2026-10-27
source: manual
status: reviewed
related: ["[[Homelab]]", "[[RaidLab]]", "[[Plex Media Conversion Pipeline]]", "[[GitHub Repos]]"]
---

# Codebox

Wizard's demo and dev box. It's where the Hermes agent lives and where workflows get tested before they run on [[RaidLab]]. **Area:** [[Homelab]]

## Hardware

| | |
|---|---|
| Machine | Intel NUC (the i3-3217U suggests the 3rd-gen DC3217 series) |
| CPU | Intel Core **i3-3217U**: Ivy Bridge, 2 cores / 4 threads, 1.8 GHz, HD Graphics 4000 |
| RAM | **16 GB** |
| Storage | **112 GB SSD** + **8 GB swap** |
| LAN IP | **<CODEBOX_LAN_IP>** (RaidLab is `.5`) |

> [!note] Why heavy jobs stay on RaidLab
> The HD 4000's Quick Sync can only hardware-encode **H.264, not H.265/HEVC**, and the CPU has just 2 cores. Codebox fits agents, dashboards and testing; encoding and inference belong on [[RaidLab]].

## What runs here

- **Hermes Agent**: Wizard's fork, `Wizard815/hermes-agent` (from NousResearch). This is the active Hermes; the `Hermes-Agent` container on RaidLab is stopped.
  - Its gateway has the LLMWIKI MCP registered. It reaches the vault at `http://<RAIDLAB_LAN_IP>:27123` (see [[agents]]).
- **Hermes Studio**: `Wizard815/hermes-studio` (fork of EKKOLearnAI/ekko-studio), a web dashboard for Hermes: chat, sessions, scheduled jobs, usage analytics
- **Workflow testing:** e.g. the [[Plex Media Conversion Pipeline]] is developed and tested here, then **run on Unraid**

> [!warning] Fill in
> - OS, and whether Hermes and Studio run in Docker or directly on the OS
> - Hermes Studio's port
