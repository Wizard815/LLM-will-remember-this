---
title: "Knowledge"
type: area
area: knowledge
tags: [wiki, area]
created: 2026-10-27
updated: 2026-10-27
source: "[[people/wizard/raw/sources/2026-10-27 - Knowledge Snapshot]]"
status: reviewed
related: ["[[LLMWIKI]]"]
---

# Knowledge

How Wizard captures and organizes information.

## Current state

- **[[LLMWIKI]]**: this vault. An AI-maintained wiki in the PARA layout; rules are in [[agents]].
- **Keeper**: a separate Obsidian vault at `/mnt/user/OnePiece/HomeLab/Obsidian/Desktop/Keeper` (n8n reads it). Agents working in LLMWIKI must not touch it (rule 7).
- **Handwriting:** the Boox Note Air 5C is the note-taking tablet now. The old ReMarkable → OCR → Obsidian pipeline was retired, and nothing has replaced it yet.
- **Backup:** [[LLMWIKI Git Backup]]

## Active projects

```dataview
LIST
FROM "household/wiki/1-projects"
WHERE area = "knowledge"
```

## Resources

```dataview
LIST
FROM "household/wiki/3-resources"
WHERE area = "knowledge"
```
