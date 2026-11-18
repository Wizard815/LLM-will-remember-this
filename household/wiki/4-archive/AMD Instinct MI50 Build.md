---
title: "AMD Instinct MI50 Build"
type: project
area: ai
project_status: done
tags: [wiki, project, ai, raidlab]
created: 2026-06-21
updated: 2026-10-27
source: "[[people/wizard/raw/sources/2026-10-27 - Knowledge Snapshot]]"
status: stable
related: ["[[LLM Inference Stack]]", "[[RaidLab]]"]
---

# AMD Instinct MI50 Build

**Area:** [[Local AI]] · Current setup: [[LLM Inference Stack]]

Got an AMD Instinct MI50 32 GB working as RaidLab's inference GPU.

- First card was **DOA** (dead PCIe interface); a replacement was sourced and works
- Flashed the **V420 VBIOS** → **178 W TDP, 21 W idle** (stock is 300 W)
- First served models through `xxdoman/ollama-mi50:latest` with ROCm 7.2.0 patched for gfx906. That Ollama container has since been replaced by llama.cpp.
