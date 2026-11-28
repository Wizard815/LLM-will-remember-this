# SwarmVault trial

A trial of [SwarmVault](https://github.com/swarmclawai/swarmvault) (MIT) next to LLMWIKI: it reads the household's long-term wiki and shows it as a knowledge graph in a web viewer. The wiki's own graph tools (`graph_*` in the MCP bridge) are the long-term version; this is for comparing the two.

## What it can see

Only `household/wiki/`, mounted read-only. It never sees `people/`, `groups/` or `household/parents/`, because its viewer has **no login**: anyone who can reach the port can read everything in it. Everything SwarmVault writes (its own copy of the notes, its generated pages, `state/graph.json`) goes to its own data folder, never into the wiki.

## Run it on Unraid

```bash
mkdir -p /mnt/user/appdata/swarmvault && chown 99:100 /mnt/user/appdata/swarmvault
cd <vault>/deploy/swarmvault        # the vault's folder on RaidLab (OnePiece/HomeLab/LLMWIKI/...)
LAN_IP=<RAIDLAB_LAN_IP> \
WIKI_HOUSEHOLD=<vault>/household/wiki \
docker compose up -d --build
```

Then open `http://<RAIDLAB_LAN_IP>:3015`. The first start takes about a minute. It refreshes from the wiki every hour (`REFRESH_MINUTES`).

| Setting | Default | What it does |
|---|---|---|
| `LAN_IP` | `127.0.0.1` | Address the viewer listens on. Use the LAN address, never forward the port. |
| `WIKI_HOUSEHOLD` | (required) | The vault's `household/wiki` folder on the host. |
| `SWARMVAULT_DATA` | `/mnt/user/appdata/swarmvault` | SwarmVault's own folder. Delete it to start over. |
| `ARGOS_URL`, `ARGOS_MODEL` | empty | Optional. An Argos (OpenAI-compatible) URL ending in `/v1` and a model name, read on the first start only. |

## What goes wrong

- **The graph is full of words like "from" and "json".** That's the offline heuristic. Set `ARGOS_URL` and `ARGOS_MODEL`, delete the data folder and start again; extraction then costs model time on every refresh.
- **It ignores the links between notes.** SwarmVault reads `[[wikilinks]]` as text and builds its own links from what it extracts. The bridge's `graph_*` tools use the real links.
- **"Clip" in the viewer adds pages.** They land in SwarmVault's own folder, not the wiki (the mount is read-only).
- **"permission denied" in the logs.** The data folder must belong to `99:100` (or set `PUID`/`PGID`).
- **Port 3015 is taken.** Change the left side of `ports:` in `compose.yml`.

Remove it with `docker compose down` and delete the data folder.
