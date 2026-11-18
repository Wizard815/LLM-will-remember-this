---
title: LLM Inference Stack
type: resource
resource_kind: system
area: ai
tags:
  - wiki
  - resource
  - ai
  - raidlab
created: 2026-10-27
updated: 2026-10-27
source: "[[people/wizard/raw/sources/2026-10-27 - Knowledge Snapshot]]"
status: draft
related:
  - "[[Local AI]]"
  - "[[RaidLab]]"
  - "[[AMD Instinct MI50 Build]]"
---

# LLM Inference Stack

How models are served on [[RaidLab]]. **Area:** [[Local AI]]

## Current (live check 2026-10-27, second pass)

- **Runtime:** llama.cpp built for ROCm, in the `mx-llamacpp-ssh` container on `ai_net`
  - **Models are served on demand, not permanently.** The container's entrypoint only runs `sshd`; llama-server instances are launched over SSH (port **2222**) as needed on ports **8000, 8001, 8002** (OpenAI-compatible API). There is **no fixed port → model mapping** — at the time of this check no llama-server was running and all three ports were dark, with both GPUs idle (~11 MB VRAM used).
  - Odysseus reaches it over SSH using its own key
  - appdata: `/mnt/user/appdata/mx-llama.cpp-Rocm10/`
- **GPUs (confirmed via rocm-smi):** 2× AMD Instinct **MI50 32 GB** — gfx906, device `0x66a0`, SKU D1640200, 32 GB VRAM each. rocm-smi warns it is deprecated as of **ROCm 10.1**, so the container runs ROCm ≥ 10.1 (matches the "Rocm10" appdata path).
- **Model library:** `/mnt/light/LLMBin` (GGUFs) on the `light` NVMe pool (2× Samsung 983 DCT 1.92 TB, btrfs RAID1), HF cache at `/mnt/light/LLMBin/HFCache`. Shared by llama.cpp, [[Odysseus]] and Argos.
- **Rule:** download with the `hf` CLI, never `huggingface-cli`

> [!warning] Verify
> - Whether the June models are still in use: qwen3-27b, qwen3-35b, qwen3vl-30b, hermes4-14b, gemma4-hermes, and `qwen3-vl:8b-instruct-q8_0` for OCR
> - The second card's VBIOS / power limit (both report identical SKU D1640200; the V420-VBIOS tuning below was done on the first card)

## Legacy: Ollama (stopped)

- `ollama-mi50` container (`xxdoman/ollama-mi50:latest`, patched ROCm 7.2.0 for gfx906), endpoint `http://ollama-mi50:11434`
- Exited around early September 2026. The [[ReMarkable OCR Pipeline]] used it, so check that pipeline.

## MI50 tuning (from the original build)

- V420 VBIOS → **178 W TDP, 21 W idle** (stock 300 W). Details in [[AMD Instinct MI50 Build]].
