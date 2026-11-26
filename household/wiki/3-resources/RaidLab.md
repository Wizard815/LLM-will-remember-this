---
title: RaidLab
type: resource
resource_kind: system
area: homelab
tags:
  - wiki
  - resource
  - homelab
  - raidlab
created: 2026-10-27
updated: 2026-10-27
source: live-check 2026-10-27
status: reviewed
related:
  - "[[Homelab]]"
  - "[[LLM Inference Stack]]"
  - "[[Odysseus]]"
  - "[[LLMWIKI]]"
---

# RaidLab

Wizard's primary server. **Area:** [[Homelab]]

## Hardware (verified 2026-10-27)

| Part | Detail |
|------|--------|
| Chassis | HPE ProLiant ML350 Gen10 (tower), BIOS U41 (2025-04-17) |
| CPU | 2× Intel Xeon Gold 6152 (22 cores / 44 threads each → 88 threads total). Both CPUs were kept after a power analysis showed only small savings from downgrading. |
| RAM | 256 GB = 8 × 32 GB DDR4 ECC RDIMM @ 2400 MT/s (12 slots, max 3 TB) |
| GPUs | 2× AMD Instinct MI50 32 GB (gfx906, PCI `88:00.0` and `b1:00.0`) → [[LLM Inference Stack]] |
| Onboard video | Matrox G200eH3 (iLO) |
| Boot | Unraid USB |

## Software

- **OS:** Unraid **7.2.0**, kernel 6.12.54-Unraid (checked at 25 days uptime)
- **Hostname:** `RaidLab` — LAN IP **<RAIDLAB_LAN_IP>** on `br0` (bond0 over the NICs; eth2 is the live link). Tailscale plugin installed (`tailscale1` interface present).
- **External access:** Cloudflare Tunnel (`Unraid-Cloudflared-Tunnel`) + Nginx Proxy Manager under `<PUBLIC_DOMAIN>`
- **Management:** agents can use the Unraid MCP (`unraid-management-agent` plugin) for status, containers and hardware

## Storage

### Array (XFS, single parity — parity2 slot empty)

| Slot | Drive | Size | Used |
|------|-------|------|------|
| parity | Toshiba MG07SCA14TE (SAS) | 14 TB | — |
| disk1 | Water Panther W7214A520ORA014T | 14 TB | 12 T / 13 T (94 %) |
| disk2 | Seagate Exos ST8000NM0075 (SAS) | 8 TB | 5.7 T / 7.3 T |
| disk3 | Seagate Exos ST8000NM0075 (SAS) | 8 TB | 4.7 T / 7.3 T |
| disk4 | Toshiba P300 HDWD130 | 3 TB | 2.1 T / 2.8 T |

Array total: **30 T, 25 T used (81 %)**. Disk1 is nearly full (94 %).

### Pools (both btrfs RAID1)

| Pool | Devices | Size | Used | Purpose |
|------|---------|------|------|---------|
| `cache` | 2× Dell Express Flash NVMe P4510 1 TB | 932 G | 362 G | appdata, system, Docker |
| `light` | 2× Samsung 983 DCT 1.92 TB NVMe | 1.8 T | 1.3 T | LLM model library (`/mnt/light/LLMBin`) |

### Key shares

`OnePiece` (main data, holds `HomeLab/LLMWIKI` = this vault's container home), `LLMBin` (models, on `light`), `appdata`, `Nextcloud`, `AMP` (game servers), `Anderson`, `Transcode`, `domains`/`isos`/`system` (VM + Unraid internals), `lightspeed`, `lxc`, `minicomputers`, `temp`.

## VMs (libvirt)

| VM | State | Purpose |
|----|-------|---------|
| HA | **running** | Home Assistant (this is why there's no HA container) |
| PonderingOrb | **running** | RDP machine, the remote-access entry point into the homelab |
| GlaDOS | off | |
| WindowsServer2025 | off | |

## Docker (86 containers defined, 53 running on 2026-10-27)

Custom networks: `ai_net` (AI services, LLMWIKI), `proxynat` (n8n, mcp-kanka), `plexnet`, `br0_net` (macvlan), `immich-net`, `hermes`, `omi`, plus per-compose networks (odysseus, affine, whispercpp, mx-llamacpp). Compose Manager plugin handles the compose stacks.

### Running stack by category

| Category | Containers (host port) |
|----------|------------------------|
| **AI / LLM** | `mx-llamacpp-ssh` (8000–8002, SSH 2222) → [[LLM Inference Stack]] · [[Odysseus]] stack: `odysseus-odysseus-1` (7005), `odysseus-searxng-1`, `odysseus-chromadb-1`, `odysseus-ntfy-1` · `argos` (8081) + `argos-postgres` · `LLMWIKI` Obsidian (3011 web, 27123/27124 REST API) · `SearXNG` (8022) · `mcp-kanka` (8765) · `milaclone-app` (4321) + `milaclone-mcp` (8383) · `postgreslitellm` (5442, DB for stopped LiteLLM) |
| **Media** | `binhex-plexpass` · `binhex-sonarr` (8200) · `binhex-radarr` (8201) · `binhex-readarr` (8202) · `binhex-prowlarr` (8203) · `tautulli` (8210) · `Seerr` (5055) · `Plex-Auto-Languages` (unhealthy) |
| **Downloads / VPN** | `GluetunVPN` (unhealthy) · `binhex-delugevpn` (8301) · `sabnzbdvpn` (8300) · `jackettvpn` (8302) |
| **Network / infra** | `Nginx-Proxy-Manager-Official` · `Unraid-Cloudflared-Tunnel` · `dns-server` (Technitium) · `omada-controller` (unhealthy) · `ApacheGuacamole` · `binhex-code-server` (8108) · `qdirstat` (8103) · `fan-bridge` (5000) |
| **Household apps** | `vaultwarden` (8120) · `binhex-syncthing` (8384) · `Homebox` (8111) · `mealiev1` (8110) · `vikunja` (3457) · `Wallos` (8109) · `croniclev2` (8105) · `dayglance` (6767) · `lifeglance` (6868) · `lastglance` (3100) · `epicgames-freegames` (3055) |
| **Automation** | `n8n` (5678) · `n8n-mcp` (3456) |
| **Gaming / voice** | `AMP` (game servers) · `TeamSpeak3` |
| **Databases** | `mariadb-NC` (8500, Nextcloud) · `MariaDB-ManyFold` (8501) · `Redis-Manyfold` (8503) · `immich-postgresql` (8504) · `redis-immich` (8505) |

### Notable stopped containers

- **Immich** app (`immich`, a CUDA image that needs NVIDIA; should work again once the P4 is back). Its postgres and redis containers are still running.
- **Nextcloud: retired 2026-10-27.** `Nextcloud-ffmpeg` is stopped. Its database `mariadb-NC` (8500) **is still running** and the `Nextcloud` share still exists, so both can be removed whenever Wizard decides.
- **`ollama-mi50`** (legacy inference), `LiteLLM`, `Kokoro-FastAPI-GPU`, `Hermes-Agent`, `whispercpp-transcriber`
- The **omi** stack (6 containers, exited 2 days ago), **AFFiNE** stack, `Gitea`, `ArchiveBox`, `audiobookshelf`, `manyfold`, `homarrmain`, `Obsidian-Livesync`, `Tachidesk`, `Huntarr`, `Cleanarr`, `Membarr`, `requestrr`, `ffmpeg-nvidia`, old `obsidian`

### Appdata (`/mnt/user/appdata`, on the `cache` pool)

~105 folders, but only **58 are referenced by any existing container** — roughly 45 are leftovers from containers that were removed (per Wizard, intentional in some cases since things come and go). Checked 2026-10-27:

- **Biggest folders:** `hermes-agent` **42 G** (container stopped) · `omi-local` 12 G (stack stopped) · `n8n` 12 G · `binhex-plexpass` 11 G · `odysseus` 7.1 G · `containers_backup` 6.4 G · `technitium-dnsserver` 4.9 G · `obsidian-livesync` 3.6 G (container stopped)
- **Orphans from the old AI stack** (no container anymore): `open-webui` (909 M), `ollama-webui` (890 M), `llama.cpp` (567 M), `anythingllm` (193 M), `librechat`, `llamaswap`, `qdrant`, `qdrantLLMWIKI`, `chroma`, `chromadb`, `mem0-aio`, `mongodb` (207 M), `ffmpeg-mi50`
- **Orphans from removed apps:** `mattermost` (208 M), `homeassistant` (now the `HA` VM), `outline`, `bazarr`, `binhex-overseerr`, `binhex-qbittorrentvpn`, `binhex-makemkv` (115 M), `binhex-filebrowser`, `HandBrake-for-Nvidia`, `Deleterr`/`deleterr`, `prefetcharr`, `chronos`, `copyparty`, `coturn`, `screego`, `mumble`, `mediamtx`, `iventoy` (171 M), `managarr`, `cronmaster`, `glances`, `tasks-md`/`tasks.md`, `dayGLANCE` (95 M; the running glance apps use `GLANCE`), `postgresql16`/`postgresql18`, `mx-llamacpp` (superseded by `mx-llama.cpp-Rocm10`)
- **Not containers but in use:** `claude-code` (588 M — Claude Code config + memory), `composerfiles` (Compose Manager), `containers_backup`, `mcp-kanka-build`, `mcp-vault-build`

> [!note] Cleanup candidates
> The orphans add up to only a few GB except `hermes-agent` (42 G). Nothing is urgent — deleting any of these is a human decision.

## Unraid plugins

Community Applications, Compose Manager, Unassigned Devices, User Scripts (+ Enhanced), CA Mover Tuning, Tailscale, Folder View 2, File Activity, unBALANCE, LXC (no LXC containers exist), GPU Statistics, RadeonTop, NVIDIA driver (kept — the Tesla P4 is coming back), Tips & Tweaks, Custom SMB Shares, RAM-Disk Docker log, btop, unraid-management-agent, dwdvm, dwpython.

> [!note] NVIDIA cards
> In June 2026 the box also had a Tesla P4 (Plex transcoding and small models), a T400, and an RTX 3060 that was given to a friend. No NVIDIA GPUs were detected on 2026-10-27, but per Wizard the **P4 is only temporarily removed and will be reinstalled** — the NVIDIA driver plugin stays for that.
