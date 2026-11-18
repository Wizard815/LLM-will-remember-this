---
title: "ReMarkable OCR Pipeline"
type: resource
resource_kind: system
area: automation
tags: [wiki, resource, homelab, raidlab]
created: 2026-10-27
updated: 2026-10-27
source: "[[people/wizard/raw/sources/2026-10-27 - Knowledge Snapshot]]"
status: stable
related: ["[[Automation]]", "Boox Note Air 5C"]
---

# ReMarkable OCR Pipeline

**Area:** [[Automation]] · **Retired 2026-10-27:** the ReMarkable was replaced by the Boox Note Air 5C, and Nextcloud was retired.

This was the n8n workflow `ReMarkableOCR`. It's kept as a pattern in case a similar handwriting-to-Obsidian pipeline is built for the Boox.

## How it worked

1. **Scrybble** synced ReMarkable notebooks → Nextcloud
2. n8n picked up each PDF over **Nextcloud WebDAV**
3. An SSH Python heredoc rendered the pages with **pypdfium2**
4. A vision model (`qwen3-vl:8b-instruct-q8_0` on Ollama) did the OCR
5. The output went to an Obsidian vault (not LLMWIKI) via LiveSync/CouchDB
6. A notification went out on Nextcloud Talk

## Leftovers

- The `ReMarkableOCR` workflow in n8n can be deactivated or deleted
- The Nextcloud Talk token used in step 6 has been removed
