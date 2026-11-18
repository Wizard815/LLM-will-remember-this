---
title: "Local AI"
type: area
area: ai
tags: [wiki, area, ai, raidlab]
created: 2026-10-27
updated: 2026-10-27
source: "live-check 2026-10-27"
status: reviewed
related: ["[[LLM Inference Stack]]", "[[Odysseus]]", "[[RaidLab]]"]
---

# Local AI

Running LLMs locally on RaidLab's two MI50s, plus the apps built on top of them.

## Current state (verified 2026-10-27)

- **GPUs:** 2× AMD Instinct **MI50 32 GB** (gfx906), 64 GB VRAM total. The second card was added after the original [[AMD Instinct MI50 Build]], which is archived.
- **Runtime:** llama.cpp (ROCm ≥ 10.1) in `mx-llamacpp-ssh`, built from Wizard's `mx-llama.cpp-Rocm10` fork. It replaced Ollama (stopped around September 2026). Models are **launched on demand over SSH** onto ports 8000–8002. Details: [[LLM Inference Stack]]
- **Keeping gfx906 alive:** Wizard maintains forks that build ROCm 10 tooling for the MI50s (TheRock, ML builds, whisper.cpp, colibri, llama-swap) → [[GitHub Repos]]
- **Models:** GGUFs in `/mnt/light/LLMBin` on the `light` NVMe pool, shared by llama.cpp, Odysseus and Argos
- **Apps:**
  - [[Odysseus]]: self-hosted AI workspace (`:7005`); it launches models on the llama.cpp box
  - **Argos** (`:8081`): Wizard's own Go tool that **builds llama-server launch commands**; works with Odysseus and llama-swap
  - **Hermes Agent + Hermes Studio**: on [[Codebox]]
  - **milaclone** (`:4321` / `:8383`): Milanote-style canvas with MCP
  - [[LLMWIKI]]: this vault
- **Stopped:** `ollama-mi50`, `LiteLLM`, the Hermes-Agent container on RaidLab (42 G of appdata left behind), the `omi-local` stack, `Kokoro-FastAPI-GPU`, `whispercpp-transcriber`
- **Convention:** use the `hf` CLI, never `huggingface-cli`

## Active projects

```dataview
LIST
FROM "household/wiki/1-projects"
WHERE area = "ai"
```

## Resources

```dataview
LIST
FROM "household/wiki/3-resources"
WHERE area = "ai"
```

## Archive

```dataview
LIST
FROM "household/wiki/4-archive"
WHERE area = "ai"
```
