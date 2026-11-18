# LLM Wiki — Agent Constitution
> This file is the operating contract for any AI agent working inside this vault.
> Do not modify without understanding the full system.

---

## Identity

This vault is **LLMWIKI** — a structured knowledge base maintained by AI agents and humans together.
It runs on RaidLab as the `LLMWIKI` container (`lscr.io/linuxserver/obsidian`, network `ai_net`), web UI `<RAIDLAB_LAN_IP>:3011`.
The wiki is organized with **PARA** (Projects · Areas · Resources · Archive).

It is **one wiki for the whole family**: a shared `household/` and one private root per person under `people/<id>/`, each with the same layout. Who the people are is in [[family|schema/family.md]]. See **Family** below before writing anything.

---

## Inference

> ⚠ **Changed since July 2026.** As of 2026-10-27 the `ollama-mi50` container is **stopped**. Local inference runs through **llama.cpp (ROCm)** in the `mx-llamacpp-ssh` container on `ai_net` (2× MI50 32 GB), models at `/mnt/light/LLMBin`. **Models are served on demand, not permanently:** the container only runs sshd; llama-server instances are launched over SSH (port 2222) onto ports `8000`–`8002`, so there is no fixed port → model mapping and a port may be dark. Check `/v1/models` on each port before use. See [[LLM Inference Stack]].

| Task | Preferred model family | Notes |
|------|------------------------|-------|
| Extraction / filing (deep) | largest Qwen3 available | was `qwen3-35b` |
| Fast maintenance / linting | small Hermes / Qwen | was `hermes4-14b` |
| Vision / OCR | Qwen3-VL | was `qwen3vl-30b` / `qwen3-vl:8b` |

Use an OpenAI-compatible `/v1/chat/completions` endpoint on the llama.cpp ports.

---

## Vault Structure

```
LLMWIKI/
├── HOME.md             # Dashboard — start here (every root, grouped by whose)
├── Projects.base       # Sortable/filterable project table (native Obsidian Bases)
├── household/          # SHARED root: the homelab, the house, trips, anything for everyone
│   ├── inbox/          # Quick capture — see Capture workflow
│   ├── daily/          # Short-term memory — today's running note; see Memory Tiers
│   ├── raw/sources/    # Layer 1 — source material (NEVER modify)
│   └── wiki/           # Layer 2 — long-term memory, PARA
│       ├── 1-projects/ 2-areas/ 3-resources/ 4-archive/
│       └── logs/       # Agent activity logs
├── people/             # PRIVATE roots, one per family member
│   └── <id>/           # e.g. people/wizard/ — only that person, their agents and the admin
│       ├── profile.md  # Long-term memory ABOUT the person (type: profile)
│       ├── inbox/ daily/ raw/sources/
│       └── wiki/       # Their own PARA: 1-projects/ 2-areas/ 3-resources/ 4-archive/ logs/
├── schema/             # Layer 3 — rules and templates (read-only to agents)
│   ├── family.md       # Who is who: members, services, shared agents (see Family)
│   ├── templates/      # PROJECT, AREA, RESOURCE, LOG, SOURCE, DAILY, PROFILE
│   └── agents.md       # THIS FILE
└── scripts/            # Bridge tests and family-setup.mjs (not notes)
```

In this file, `wiki/`, `daily/`, `inbox/` and `raw/` mean **those folders inside a root** (`household/` or `people/<id>/`). Every rule applies the same in each root.

**No subfolders inside the four PARA folders.** Grouping is done by the `area` field, links, and the dashboard — not by nesting.

### Which root? (ask this first)
1. Is it about **one person** — their project, hobby, health, plans, preferences, a conversation they had? → `people/<id>/`. A sewing project of Sam's is in `people/sam/`, so no agent thinks it's Wizard's.
2. Is it **shared** — the homelab, the house, money or trips you do together, a family decision? → `household/`.
3. **Can't tell whose it is?** Ask. Don't guess, and don't put it in `household/` to be safe: a shared note is read by everyone.

### Where does a note go? (ask in order)
1. Does it have a **finish line** (a goal that will be done)? → `1-projects/`
2. Is it an **ongoing area** you maintain with no end date? → `2-areas/` (one hub note per area — usually already exists; update it rather than create)
3. Is it **reference** — how something works, specs, a guide, a person/tool profile? → `3-resources/`
4. Is it **done, abandoned, or no longer true**? → `4-archive/`

Built things change folder over their life: a pipeline is a **project** while being built; once running, its "how it works" note is a **resource**; when retired, it goes to the **archive**.

---

## Family

The registry is [[family|schema/family.md]] (front matter: `members`, `services`, `shared_agents`). It is changed only with `node scripts/family-setup.mjs` by the admin — agents read it, never edit it.

| Who | Writes to | Can read |
|---|---|---|
| A **member** (and the agents they run with their token) | `people/<their id>/` and `household/` | their own root, `household/`, `schema/`, and the "Shared with the family" section of each profile |
| The **admin** (a member with `role: admin`) | everywhere except `schema/` | everything |
| A **service** (Upstream Manager, n8n…) | `household/` | `household/`, `schema/` |
| A **shared agent** (one assistant for the whole house) | short-term memory (`memory_log`, `memory_capture`, `memory_add_source`) of the person it names, on every write; `household/` | `household/`, `schema/`, each profile's "Shared with the family" section — **never** private notes |

**Telling people apart.** Each person's agents use that person's token, so the bridge always knows who is writing. When an agent can't know:
- **Shared agent:** every write names `person` (an id, or `household`). If you don't know who you're talking to, **ask** ("Who's this for?") before writing. Use `who_is` to turn a name, nickname or Omi person name into an id. If a name could mean two people, it says so: ask which. When the conversation moves to someone else, the next write names *them* — never carry the last person's id over.
- **Voice:** see **Voice and the home agent** below. Labels like "Speaker 1" are numbered again in every conversation and never name anyone.
- **Logging for someone else:** a shared agent's lines are marked `via <agent>`, so later readers know the person didn't write it themselves.

**Keeping context across people.** Before helping a person, call **`context_for`** with them: with their own token it returns their `profile.md`, today's `daily/` note and inbox; as a shared agent, what they share with the family and the household's day. Another person's notes are never context for this one. A shared agent can leave a person something (a log line, an inbox note) but can't read their private notes back — for that, the person uses their own agent.

**Privacy.**
- Another member's root is not yours to read, quote, summarize or hint at — even if you are the admin's agent and *can* read it, only bring it up when the admin asks.
- Something one person tells you about another (a gift idea, a surprise) goes in the **teller's** root.
- The profile's **"Shared with the family"** section is the only part other members see. Put things there only when the person asks.
- **Local only:** personal roots are read only by agents running on the home network with local models (llama.cpp on RaidLab, Hermes on Codebox). Don't give a member token to a cloud-hosted agent, and don't paste a person's notes into a cloud model. The bridge can't enforce this; it is a rule for whoever hands out tokens.

### Adding someone
```
node scripts/family-setup.mjs add-member --name Sam --alias Samantha --voice "Sammy"
node scripts/family-setup.mjs token sam        # printed once; only the hash is kept
```
`add-member` asks who when run without flags, and refuses a name, alias or Omi id another member already has. Services: `add-service <id> <name>`; a family-wide assistant: `add-shared <id> <name>`; `update <id> --alias X --voice X --omi-uid X --omi-person X` adds to someone; `revoke <id>` removes their tokens; `remove <id>` takes them out of the family (tokens too) and keeps their folder for the admin.

### Voice and the home agent

**The wiki never hears or stores voices.** Recognizing a voice is Omi's job, and it already does it on your own server (omi-local):
- **The wearer.** Each Omi learns its owner's voice (the speech profile set up in the app). Their lines arrive as `is_user`.
- **Other people.** In the Omi app's **People**, you name a voice once ("that's Sam") and Omi learns it from then on. Their lines arrive with a `person_id` and that name.

The registry only says which family member those are: their name (matched automatically), any other name Omi's People list uses for them (`voice`), and optionally the Omi account they wear (`omi_uid`) and the `person_id`s other members' Omi apps gave them (`omi_people`). Voice samples stay in Omi; nothing biometric is kept here.

**Omi → the wiki, per person.** Each person who wears an Omi points it at the wiki with **their own key**, so their recordings land only in their folder:
1. On omi-local, allow the vault's address: `OMI_WEBHOOK_ALLOWED_PRIVATE_NETWORKS=<RAIDLAB_LAN_IP>/32` (Omi refuses private addresses otherwise).
2. In that person's Omi app: Settings → Developer Settings → Webhooks → **Conversation Events**: `http://<RAIDLAB_LAN_IP>:27123/family/conversation?key=<their token>`. Omi can't send headers, so this one route takes the key in the URL; keep it on the LAN.
3. Each finished conversation becomes `raw/sources/YYYY-MM-DD - Conversation - <title> (<id>).md` in their folder, one paragraph per speaker by name. Retries of the same conversation are ignored, discarded conversations skipped. Ingest files it like any source.

**A home agent (kitchen speaker, wall tablet, chat app).** Build it as a client of `/family-mcp`; the wiki is its memory and Omi or the frontend its ears. Two ways to give it identity, both physically separate per person:
- **One key per person** (best): the frontend signs each person in (a profile on the tablet, their phone) and uses that person's token. It can then read their own notes, and can't read anyone else's.
- **One shared-agent key** for the room: it must say who it's helping on every write, and can't read private notes — only what each person shares.

Its loop, every turn:
1. **Who is speaking?** From the frontend's sign-in, or Omi's speaker name → `who_is`. Unknown → ask "Who's this?" before doing anything personal.
2. **Load them:** `context_for` that person whenever the speaker changes. Answer from their context, never from the previous person's.
3. **Remember:** `memory_log` with `person` for what was done or decided; `conversation_log` for the conversation itself (each line with `person`, or `speaker` / `is_user` / `person_id` from Omi), which files a copy in each identified speaker's folder and lists unknown speakers back.
4. A general agent (Hermes, a coding agent) uses its own person's or a service key and the same tools; nothing is family-specific about connecting.

System prompt for a family home agent (copy and adapt):
```
You are the family's home assistant. Your long-term memory is the LLMWIKI, through its tools.
- Before helping anyone, know who they are. If you can't tell, ask "Who's this?" first.
- When the speaker changes, call context_for with the new person, and answer only from
  their context. Never mention one person's private things to another.
- After you do something or someone decides something, memory_log it with person set.
  At the end of a conversation, conversation_log it with each line's person.
- "Speaker 1" style labels are not people. Unknown speakers: ask, don't guess.
- Never store passwords, keys or codes.
``` The first run, `init`, asks who the admin is and moves a single-user vault into `household/` and `people/<admin>/`.

---

## Memory Tiers

Two tiers. Don't blur them.

| | Short-term (working memory) | Long-term (curated memory) |
|---|---|---|
| Lives in | `inbox/`, `daily/`, `raw/sources/` (`status: unprocessed`) of each root | `wiki/` and `profile.md` of each root |
| Schema | loose — a `DAILY`/`SOURCE` front matter minimum | strict — full schema below, every field |
| Who writes here | anything: agents, n8n, CalDAV sync, Omi transcripts, GitHub-activity dumps, the Karpathy plugin (see Integration Points) | only the Ingest/Capture workflows |
| Trust level | provisional — may be wrong, duplicate, or stale | what you'd actually cite |
| Cited from `wiki/`? | never directly — promote the fact first | yes |

**The one rule that keeps this from turning into plugin noise:** automation and auto-extraction tools write only to the short-term tier. Promotion to `wiki/` always goes through a human or an agent running the Ingest/Capture workflow by hand — never automatic, never silent. This is why the Karpathy plugin (below) runs in `notify` mode, not `auto`.

`daily/` is the newest piece: a running note for *today*, not yet a PARA citizen. It isn't in the "where does a note go?" decision tree above because it doesn't go anywhere yet — it's pre-triage. See the **Rollover** workflow for how it becomes a `raw/` source.

---

## Non-Negotiable Rules

1. **Never overwrite or modify files in any `raw/`** — sources are sacred (deleting a source is a human decision only)
2. **Every wiki note must have valid front matter** — see schema below
3. **Use Obsidian wiki links** `[[Like This]]` for all internal references
4. **Always cite the source** — every wiki note links back to its raw file, or uses `source: manual` (human-written) / `source: live-check YYYY-MM-DD` (verified against a running system)
5. **Commit to Git after every batch operation** — live since 2026-10-28: the vault is a git repo and the Obsidian Git plugin auto-commits every 10 min. Agents with command access run `obsidian-git:commit` after a batch (the plugin's message template is used; MCP agents can't set their own message). ⚠ *Remote is `github.com/Wizard815/LLM-will-remember-this` and it is **public** — see rule 15; see [[LLMWIKI Git Backup]].*
6. **Use tags from the approved list only** — do not invent new tags
7. **Do not access other Obsidian vaults** — only LLMWIKI is permitted (e.g. the `Keeper` vault is off-limits). Inside it, stay in the roots your token may read (see Family).
8. **Write via the Obsidian Local REST API when working from outside the container** — the SMB share is read-only for existing notes (ACLs); direct file writes will fail
9. **Never store secrets** — no passwords, API keys, bearer tokens, room/session tokens or credentials anywhere in the vault (including `raw/` and `inbox/`). Reference where a secret lives, never its value. If you find one, report it; do not copy it elsewhere.
10. **TTRPG content lives in the campaign tool, not here.** The campaign tool is the source of truth for BloodEarth lore, NPCs, sessions and transcripts. Do not ingest any of that into this vault; the [[TTRPG]] area note only summarizes and links out.
    - **Now:** Kanka (campaign `376198`)
    - **Next:** LegendKeeper (the BloodEarth world there already has ~690 resources; see [[BloodEarth Campaign Migration]])
    - **Long term:** [[DNDWORLDAPP]], Wizard's own app
    - When the campaign tool changes, update this rule and the [[TTRPG]] note.
11. **Prefer fewer, richer notes** — don't create a note for every tool or vendor mentioned. Fold small facts into the area hub or the most relevant resource. A new resource note needs enough content to stand alone.
12. **Unverified facts are drafts** — if a fact may be out of date, set `status: draft` and add a `> [!warning] Verify` callout naming what to check.
13. **Every fact has an owner.** File it in the root of the person it's about (or `household/`). Never mix two people's facts in one note; link between them instead. If you don't know whose it is, ask.
14. **Links don't cross into private roots.** A `household/` note never links to or quotes a note in `people/` — a title alone can give a surprise away. A person's note may link to `household/`. The one exception is citing a source (`source: "[[people/<id>/raw/sources/…]]"`): source names are a date and a generic title, and nobody else can open them.
15. **This repo is public — treat `git` as a public-publish step, not just a backup.** `people/` and `schema/.network-private.md` are gitignored on purpose (scrubbed from history 2026-11-18, after real LAN IPs and personal content had been committed) — never remove them from `.gitignore` or `git add -f` them. Any note that ends up tracked (anything under `household/`, `schema/`, `wiki/`) must use the placeholders `<RAIDLAB_LAN_IP>` / `<CODEBOX_LAN_IP>` instead of real addresses (real values: `schema/.network-private.md`, not tracked). If a real IP, personal detail, or secret lands in a tracked note, treat it as already public the moment the next auto-commit/push runs — fix it immediately, don't wait for a maintenance pass.

---

## Front Matter Schema

Every note in a `wiki/` must include:

```yaml
---
title: "Note Title"
type: project | area | resource | log
area: ai | homelab | automation | hardware | ttrpg | gaming | travel | personal | knowledge
tags: [wiki, <type-tag>]
created: YYYY-MM-DD
updated: YYYY-MM-DD
source: "[[raw/sources/filename]]"   # or: manual | live-check YYYY-MM-DD
status: draft | reviewed | stable
related: []
---
```

(`area` is optional only on `type: log`.)

### Extra field for `type: project`
```yaml
project_status: active | paused | done
```

### Extra field for `type: resource`
```yaml
resource_kind: system | tool | guide | person | concept
```

### Rules
- `status:` = **note quality** (draft → reviewed → stable). `project_status:` = **real-world state**. Don't conflate them; never put a `**STATUS:**` line in the body.
- A project with `project_status: done` **must** live in `4-archive/`. A note in `4-archive/` keeps its original `type`.
- Area hub notes are named for the area (see table) and carry the matching `area:` value.

### Area → hub note

| `area` value | Hub note |
|--------------|----------|
| `homelab` | [[Homelab]] |
| `ai` | [[Local AI]] |
| `automation` | [[Automation]] |
| `hardware` | [[Hardware & 3D Printing]] |
| `ttrpg` | [[TTRPG]] |
| `gaming` | [[Gaming]] |
| `travel` | [[Outdoor & Travel]] |
| `personal` | [[Personal]] |
| `knowledge` | [[Knowledge]] |

Adding a new area = add a row here + create its hub from the AREA template.

### Source front matter (`raw/sources/`)
```yaml
---
title: "Source Title"
type: source
tags: [source]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: unprocessed | processed
---
```
Sources are **not** wiki notes — never tag them `wiki`.

### Daily note front matter (`daily/`)
```yaml
---
title: "YYYY-MM-DD"
type: daily
tags: [daily]
created: YYYY-MM-DD
status: open | rolled-over
related: []
---
```
Daily notes are **not** wiki notes and **not** sources until rollover — never tag them `wiki` or `source`. Exactly one should be `status: open` at a time (today's). Don't backdate or edit a `rolled-over` note; it's done.

### Profile front matter (`people/<id>/profile.md`)
```yaml
---
title: "Name"
type: profile
person: <id>          # must match the folder
tags: [profile]
created: YYYY-MM-DD
updated: YYYY-MM-DD
source: manual
status: draft | reviewed | stable
---
```
One per person, from the PROFILE template, made by `family-setup.mjs`. Sections: **Shared with the family** (the only part other members see), About, Preferences, Ongoing, People. Ingest updates it with lasting facts about the person (likes, routines, who's who in their life); projects still go in their `wiki/`.

### Approved Tags
Type tags (one per note, matching `type`): `project`, `area`, `resource`, `log`, `source`, `daily`, `profile` — plus `wiki` on everything in a `wiki/`.
Domain tags (optional): `raidlab`, `ai`, `ttrpg`, `homelab`.
For any other domain use the `area:` field — **do not add a tag**.

---

## Naming Conventions

| Type | Format | Example |
|------|--------|---------|
| Project | `Title Case`, named for the outcome | `MD1200 Cage Divider` |
| Area | Area name (see table) | `Local AI` |
| Resource (system/tool) | Proper name | `RaidLab`, `Kanka MCP` |
| Resource (guide/concept) | `Title Case` | `LLM Inference Stack` |
| Resource (person) | Name / handle | `Wizard` |
| Source | `YYYY-MM-DD - Title` | `2026-10-27 - Knowledge Snapshot` |
| Log | `Log - YYYY-MM-DD` | `Log - 2026-10-27` |

---

## Core Workflows

### Ingest (New Raw Source → Wiki)
Run it one root at a time. A source in `people/sam/raw/` is filed into `people/sam/` (and into `household/` only for facts that are plainly shared); a source in `household/raw/` may hold facts about one person — those go to that person's root (rule 13).
1. Scan `raw/sources/` for `status: unprocessed`
2. Extract facts; for each, decide the root ("Which root?") and the PARA folder (see "Where does a note go?"). Lasting facts about the person themselves go in their `profile.md`
3. Prefer updating an existing note (area hub, resource, or project) over creating one (rule 11)
4. New notes use the matching template; set `area`, link to the area hub
5. Mark the source `status: processed`: `vault_patch` with `targetType: frontmatter`, `target: status`, `operation: replace`, `content: processed` (a plain string). A JSON-encoded `"processed"` with `contentType: application/json` used to be stored with its quotes; the bridge now decodes it, but the plain string is the form to use
6. Log in that root's `wiki/logs/Log - YYYY-MM-DD.md`; commit `ingest: <source-filename>`

### Capture (Process Inbox)
1. Scan each root's `inbox/` (ignore `README`)
2. File each item into the right existing note; create a new note only if nothing fits
3. Merge content, bump `updated:`, add `[[links]]`
4. Delete the inbox file after filing it
5. Log it; commit `ingest: inbox YYYY-MM-DD`

### Rollover (Daily Note → Raw Source)
Run once per day, on the first agent touch after a new daily note exists (don't wait for a human to remember).
1. Call **`memory_rollover`** (no arguments). It files every `daily/*.md` with `status: open` from **before today** — in each root your token covers (the admin's covers all) — as that root's `raw/sources/YYYY-MM-DD - Daily Note.md` with the **Source** front matter (`type: source`, `status: unprocessed`), keeps the content, and moves the daily note to `.trash`. Today's note is never touched; a day already filed is skipped. Its answer lists what it filed.
   - Doing it by hand instead (no MCP): change the front matter **while the note is still in `daily/`**, then move it. Once a file is in `raw/` the guard allows only its `status` to change, so the other way round leaves a half-converted source.
2. If the Karpathy plugin (watching `daily/`, see Integration Points) already surfaced draft entity/concept notes for that day in `karpathywiki/`, treat them as a **first-pass hint, not a source of truth** — check them against the raw content during the Ingest step that follows, don't copy them into `wiki/` verbatim
3. Immediately run **Ingest** on the new `raw/sources/` files
4. Log it; commit `ingest: daily YYYY-MM-DD`

### Maintain (Daily Maintenance Loop)
1. Validate front matter on all `wiki/` notes and profiles, in every root
2. Verify all `[[links]]` resolve
3. **Archive sweep:** any project with `project_status: done` outside `4-archive/` → move it (fold lasting facts into the related resource first)
4. **Stale check:** flag active projects with `updated` older than 60 days, or with past dates in the body
5. Every project and resource must be linked from its area hub — add missing links
6. Scan for secrets (rule 9) and report any found
7. **Privacy check:** no `household/` note links to or quotes `people/`; no note in one person's root is about another person (rule 13–14). Report, don't move, unless the owner is obvious
8. **Stuck short-term items:** any `raw/sources/` still `unprocessed` or `daily/` note still `open` (not today's) older than 2 days → run Rollover/Ingest on it now instead of flagging it; this tier should never have a backlog
9. Log it; commit `maintain: YYYY-MM-DD`

### Query (Answer from Wiki)
1. Start with the asker's `profile.md`, then the relevant area hub in their root or `household/`, and follow links
2. Synthesize from wiki notes (not raw); cite which notes were used
3. If it's not in the wiki, say so — do not hallucinate. Mention any `status: draft` caveats.

### Lint (Validation)
1. Required fields: title, type, area (except logs), tags, created, updated, source, status
2. Projects: `project_status`; resources: `resource_kind` (approved values only)
3. Folder matches type/status (done projects in archive; areas only in `2-areas/`)
4. Naming conventions followed
5. Report violations — do not auto-fix without confirmation

---

## Integration Points

> **LIVE** = exists and works today · **PLANNED** = design intent only · **VERIFY** = existed before, current state unknown

### Obsidian Local REST API — LIVE
```
Container: http://llmwiki:27123   LAN: http://<RAIDLAB_LAN_IP>:27123
MCP endpoint: /mcp
```
Preferred write path for any agent outside the container. Registered in the Hermes gateway as `LLMWIKI`. Hermes runs on **[[Codebox]]** (Intel NUC, `<CODEBOX_LAN_IP>`), not on RaidLab, where the `Hermes-Agent` container is stopped. Agents on Codebox must use the **LAN** URL, because `llmwiki` only resolves on RaidLab's Docker networks.

**Two ways in.** `/mcp` and the plain REST routes use the plugin's one master key and see the **whole vault** — that's the admin's (and Hermes's maintenance jobs') door. Everyone else uses the **family endpoints** of the LLMWIKI MCP Bridge, each with their own token (`Authorization: Bearer llmw_…`, from `family-setup.mjs token <id>`):

| Endpoint | What it is |
|---|---|
| `POST /family-mcp` | MCP (streamable HTTP, JSON responses) with the family tools below. Paths are relative to the caller: `daily/…` is *their* `daily/`, `household/…` is shared |
| `/family/vault/<path>` | REST, same shape as `/vault/<path>`, scoped the same way (Orb and other REST clients use this as their base URL: `http://<RAIDLAB_LAN_IP>:27123/family`) |
| `/family/search/simple/` | exact-word search, only over what the token may read |
| `POST /family/conversation` | a conversation in, as `conversation_log` takes it or as Omi's Conversation Events webhook sends it (`?key=` accepted on this route only; Omi's `?uid=` must match the person's `omi_uid` when set) |

Family MCP tools: `whoami` (call first), `family_members`, `who_is`, `context_for` (one person's context, on every change of speaker), `conversation_log` (a conversation, filed per speaker), `memory_log`, `memory_capture`, `memory_add_source`, `memory_rollover`, `notes_list`, `note_read`, `notes_search`, `query_wiki`, `note_write`. The `memory_*` tools take `person` (an id or `household`): a shared agent must always pass it, a member may name only themselves or `household`, the admin anyone. Raw sources can only be created, and their `status` changed; `schema/` is read-only.

**MCP tools for the admin (`/mcp`, master key):**

| Need | Tool | Tier |
|---|---|---|
| Answer from the wiki | `query_wiki` (semantic, wiki/ only), `search_simple` (exact words), `get_wiki` / `vault_read` | long-term, read |
| Log what happened today | `memory_log` — one line into a root's `daily/YYYY-MM-DD.md` (sections `worked_on`, `decisions`, `follow_ups`; pass `source`, and `person` for anyone but the household) | short-term |
| Park something with no home | `memory_capture` — new note in `inbox/` | short-term |
| Hand over a document for Ingest | `memory_add_source` — new `raw/sources/` file, `status: unprocessed`, never overwrites | short-term |
| File yesterday's daily note for Ingest | `memory_rollover` — once a day | short-term → source |
| Ingest / Capture / Maintain | built-in `vault_*` tools | long-term, write |

Automation (n8n, Orb, Omi, UpstreamManager, Hermes hooks) uses only the `memory_*` tools, through the family endpoints with its own token (a service token for household tools like Upstream Manager, a member token for a person's Orb or Omi); the daily scheduled agent job calls `memory_rollover`, then runs Ingest. They refuse text that looks like a secret (rule 9). The built-in `vault_write` / `vault_append` / `vault_patch` / `vault_delete` / `vault_move` are guarded by the **LLMWIKI MCP Bridge** plugin: an existing `raw/` file can't be overwritten, appended to, patched, deleted or moved out (rule 1); creating a new one (Rollover) and patching its `status` front matter (Ingest step 5) still work. The guard covers MCP only — the master-key REST routes (`PUT /vault/...`) are unguarded, so anything still writing there must follow the same rule itself; `/family/vault/` is guarded. `query_wiki` has no relevance cutoff: it always returns the nearest notes, so when they don't cover the question, say the wiki doesn't know. Tests: `node --test scripts/*.test.*` (bridge, family scopes and setup script).

### llama.cpp (ROCm) — LIVE, details VERIFY
`mx-llamacpp-ssh` on `ai_net`, ports `8000–8002`, models `/mnt/light/LLMBin`. See [[LLM Inference Stack]].

### Ollama (`ollama-mi50`) — STOPPED
Legacy endpoint `http://ollama-mi50:11434`. Do not assume it is reachable.

### Smart Connections — LIVE
Local embeddings inside Obsidian (`.smart-env/`). Human-side semantic search.

### Dataview — LIVE (2026-11-14)
Was missing for weeks while `HOME.md` and area hubs already used `dataview` query blocks — those were rendering as plain text. Installed; the dashboard is only trustworthy as of this date.

### Second Brain embedding (`query_wiki` / `get_wiki` / `wiki_card`) — LIVE
Scoped to every root's `wiki/` (`allowedPathPatterns: ^household/wiki/, ^people/[^/]+/wiki/`); the family `query_wiki` drops results the caller may not read. `daily/`, `inbox/`, `raw/` are never semantically searchable, by design (short-term tier isn't meant to be queried as truth). Model: `onnx-community/Qwen3-Embedding-0.6B-ONNX` (switched from Nomic v1.5, 2026-11-14) via the plugin's `custom` model slot.

### Karpathy LLM Wiki plugin — LIVE, scoped (2026-11-14)
Re-enabled after sitting idle since 2026-10-30. Job: watch the daily folders (`autoWatchSources: true`, `watchedFolders: ["household/daily", "people/wizard/daily"]` — add each new member's), mode **`notify`** (prompts for confirmation, never silently ingests), extraction model `qwen3.5-2b` via Argos. Output lands in `karpathywiki/`, its own folder, never `wiki/`. Treat its entity/concept pages as a cheap first-pass draft during Rollover/Ingest — not citable, not promoted automatically. If this stops earning its keep, disable it again rather than letting it run unused.

### Kanka — LIVE (source of truth for TTRPG)
Campaign `376198` via the `mcp-kanka` container. See [[Kanka MCP]].


### LegendKeeper — LIVE (TTRPG, migration target)
World **BloodEarth** (`cmvy7ds5u020o3lojg3qqee39`, private), reached through the `legendkeeper` MCP (an unofficial integration, **write-enabled**). Pages are read and written as Markdown, and `> [!secret]` marks GM-only text. Destructive tools need `confirm=true`, so ask Wizard first.

### n8n Automation — PLANNED for this vault
n8n is running on RaidLab (`:5678`), but no LLMWIKI ingest/maintenance workflow exists yet.

### Vector store — PLANNED (not built)
No Qdrant container exists on RaidLab as of 2026-10-27. Build only if the vault outgrows search + Smart Connections.

### LiveSync / CouchDB — NOT INSTALLED in this vault
An `Obsidian-Livesync` container exists on RaidLab but is stopped, and the plugin is not in this vault. Not a backup.

---

## Prompt Templates

### Classify Prompt (PARA)
```
You are filing a fact into the LLMWIKI (PARA). Decide:
- root: household (shared) | people/<id> (about one person; ids: {member_ids}) | ask (can't tell)
- folder: 1-projects (has a finish line) | 2-areas (ongoing hub) | 3-resources (reference) | 4-archive (done/obsolete)
- area: ai | homelab | automation | hardware | ttrpg | gaming | travel | personal | knowledge
- target: an EXISTING note title to update, or "NEW: <Title>" only if nothing fits
Never output passwords, keys, or tokens.

Existing notes:
{note_list}

Fact:
{content}

Output JSON only: {"root": "...", "folder": "...", "area": "...", "target": "..."}
```

### Lint Check Prompt
```
Review this LLMWIKI note front matter against the schema.
Check: required fields (title, type, area, tags, created, updated, source, status),
type ∈ project|area|resource|log, approved tags only, YYYY-MM-DD dates,
project_status for projects, resource_kind for resources.
Also check folder: {path} — done projects must be in <root>/wiki/4-archive/.

Front matter:
{frontmatter}

Report issues as a list. If none, respond: "VALID"
```

---

## Git Commit Convention

```
ingest: <source-name>          # New source processed
maintain: YYYY-MM-DD           # Maintenance run completed
lint: fix <description>        # Schema violation corrected
schema: update <file>          # Schema or template changed
manual: <description>          # Human-made change
```

---

*Last updated: 2026-11-16 — Voice and the home agent: Omi recognizes voices, the registry maps them (`voice` names, `omi_uid`, `omi_people`; "Speaker N" labels refused), `context_for`, `conversation_log` and `/family/conversation`; `update`/`remove` in the setup script.*
*2026-11-16 — one wiki for the family: `household/` + private `people/<id>/` roots, the Family section (registry, who can read what, telling people apart, privacy, local only), rules 13–14, `type: profile`, per-person tokens and the family endpoints.*
*2026-11-14 — added the short-term/long-term Memory Tiers model, `daily/` folder + `DAILY` template, Rollover workflow; re-enabled Karpathy (notify-only, scoped to `daily/`); installed Dataview; swapped Second Brain embedding model to Qwen3-Embedding-0.6B.*
*2026-10-27 — restructured wiki to PARA; new types (project/area/resource/log), area hub table, resource_kind; rules 11–12; inference section updated after live check (Ollama stopped, llama.cpp live)*
*Vault: LLMWIKI @ RaidLab*
