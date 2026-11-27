---
title: "Family"
type: registry
tags: [registry]
members:
  - {"id":"wizard","name":"Wizard","role":"admin","aliases":["Wiz"],"voice":[]}
services: []
shared_agents:
  - {"id":"faith","name":"FAITH"}
groups: []
---

# Family

Who the LLMWIKI belongs to. Agents read this to tell people apart; the LLMWIKI MCP Bridge uses it to
decide who may read what. Change it with `node scripts/family-setup.mjs` (or by hand, one JSON object
per line, same shape).

- **members**: each has a private folder `people/<id>/` (only they, their agents and the admin can read it).
  `role: admin` sees everyone's; `role: child` doesn't see `household/parents/`. `aliases` are other names they go by; `voice` are names
  Omi's People list uses for them; `omi_uid` is the Omi account they wear and `omi_people` the
  ids other members' Omi apps gave them. Omi recognizes the voices; this only says who they are.
  ("Speaker 1" labels are per conversation and never name anyone.)
- **services**: apps that write the household's memory (`household/`), e.g. Upstream Manager.
- **shared_agents**: one assistant for the whole family. It has no folder of its own, must name the
  person on every write, and asks who it is talking to when it can't tell. `audience: parents` is
  the grown-ups' one: it also reads `household/parents/`, the grown-ups' shared notes.
- **groups**: a folder `groups/<id>/` that some of the family share (a couple, the kids, a trip), laid
  out like a person's. `members` read and write it; `readers` (members or shared agents) only read it;
  the admin sees every group. The family's shared agent doesn't see a group unless it is a reader.
  A group can't be called anything a member is called.

Tokens are never stored here: `family-setup.mjs token <id>` prints one once and keeps only its hash.
