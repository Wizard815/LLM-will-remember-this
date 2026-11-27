---
title: "Homelab"
type: area
area: homelab
tags: [wiki, area, homelab, raidlab]
created: 2026-10-27
updated: 2026-11-27
source: "live-check 2026-10-27"
status: reviewed
related: ["[[RaidLab]]", "[[Local AI]]", "[[Automation]]"]
---

# Homelab

Self-hosted infrastructure built around [[RaidLab]] (Unraid). Goal: services stay up, are reachable under `<PUBLIC_DOMAIN>`, and are documented here.

## Current state (live check 2026-10-27)

- **Machines:**
  - [[RaidLab]]: main server, `<RAIDLAB_LAN_IP>`
  - [[Codebox]]: Intel NUC, `<CODEBOX_LAN_IP>`. Hermes Agent + Hermes Studio; demo and test box.
- **Server:** [[RaidLab]]: HPE ML350 Gen10, 2× Xeon Gold 6152, 256 GB ECC, Unraid 7.2.0, **86 containers (53 running)**. Full inventory is in [[RaidLab]].
- **Code:** many services run from Wizard's own repos or forks (ALLGlance → the glance apps, milaclone, mcp-kanka, argos, odysseus, mx-llama.cpp) → [[GitHub Repos]]
- **VMs:** `HA` = **Home Assistant**; `PonderingOrb` = **RDP machine** for getting into the homelab. `GlaDOS` and `WindowsServer2025` are off.
- **External access:** Cloudflare Tunnel + Nginx Proxy Manager under `<PUBLIC_DOMAIN>`; Tailscale; remote desktop through `PonderingOrb`
- **Network/infra services:** Technitium DNS, Omada controller, Gluetun + VPN download clients, Guacamole, code-server
- **Media:** Plex Pass + Sonarr/Radarr/Prowlarr/Readarr, Tautulli, Seerr, Plex-Auto-Languages → see [[Plex Media Conversion Pipeline]]
- **Household apps:** Immich (photos, `:8407`, running again as of 2026-11-27), Vaultwarden, Syncthing, Homebox, Mealie, Vikunja, Wallos, Cronicle, copyparty
- **Retired or stopped since June:**
  - **Nextcloud** retired (2026-10-27); its `mariadb-NC` database is still running and can be removed
  - Not on the server any more: Mattermost, Open WebUI, Qdrant
  - Stopped: Gitea, ArchiveBox, AFFiNE

## Active projects

```dataview
LIST
FROM "household/wiki/1-projects"
WHERE area = "homelab"
```

## Resources

```dataview
LIST
FROM "household/wiki/3-resources"
WHERE area = "homelab"
```

## Archive

```dataview
LIST
FROM "household/wiki/4-archive"
WHERE area = "homelab"
```
