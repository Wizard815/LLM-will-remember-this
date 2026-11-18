---
title: Plex Media Conversion Pipeline
type: project
area: automation
project_status: active
tags:
  - wiki
  - project
  - homelab
  - raidlab
created: 2026-06-21
updated: 2026-10-27
source: manual
status: draft
related:
  - "[[Automation]]"
  - "[[RaidLab]]"
  - "[[Codebox]]"
---

# Plex Media Conversion Pipeline

**Area:** [[Automation]]
**Finish line:** the whole Plex library is in H.265, with Dolby Vision stripped to HDR10

## Current state (2026-10-27)

- **Still in progress.**
- **Tested on [[Codebox]]:** the Hermes agent on the NUC (`<CODEBOX_LAN_IP>`) is used to develop and test the workflow
- **Runs on Unraid:** the actual conversion jobs run on [[RaidLab]]. The NUC's i3-3217U can't hardware-encode H.265 anyway.

> [!warning] Fill in
> - What does the encoding on Unraid now: CPU, the MI50s (VAAPI/AMF), or waiting for the Tesla P4 to be reinstalled (NVENC)?
> - How much of the library is done

## Original design (June 2026)

- **Stack:** n8n + Redis + `ffmpeg-nvidia` (`jrottenberg/ffmpeg:8.1.2-nvidia2404`), now stopped
- **Jobs:** H.265 conversion; Dolby Vision → HDR10 stripping
- **GPU map:** 0 = Tesla P4, 1 = T400, 2 = RTX 3060. Out of date: the 3060 is gone, and the P4 is temporarily removed and will be reinstalled.
