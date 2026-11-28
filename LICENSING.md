# Licensing in plain English

LLM will remember this's code is under the [PolyForm Shield License 1.0.0](LICENSE).
This page explains what that means for you. It is a summary, not legal advice,
and the license text is what applies if the two ever disagree.

Shield is a *source-available* license. The code is public and free, but it is
not "open source" in the official OSI sense, because it limits one kind of use:
competing with LLM will remember this.

## What you can do, free

- Read, download, build and run LLM will remember this.
- Run it at home, for your family and friends, or at work.
- Change it, fix it and share your changes back with a pull request.
- Use pieces of it inside your own project, as long as that project doesn't
  compete with LLM will remember this.

## What needs permission

- Selling LLM will remember this, or a copy or fork of it.
- Offering LLM will remember this, or a fork of it, as a hosted service or app for other
  people to sign up to, whether you charge for it or not.
- Publishing a fork that is marketed as a substitute for LLM will remember this.

Only the maker can do these, or someone the maker has said yes to in writing.
To ask, open an issue on GitHub titled "License request" and say what you want
to do.

## Older versions

Versions published before the switch to Shield on 2026-11-28 were under the
MIT License, and copies of those versions stay under it. Everything from
the switch on is under Shield.

## Third-party code

LLM will remember this uses open source packages, and each keeps its own license; the Shield
license covers only LLM will remember this's own code.

The third-party Obsidian plugins under .obsidian/plugins/ are not covered by
this license; each keeps its own license (Templater is AGPL-3.0, obsidian-git
bundles LGPL-3.0 code), except the plugins written for this vault
(karpathywiki, llmwiki-mcp-bridge).

The graph tools in llmwiki-mcp-bridge borrow ideas (clusters, hubs, bridges,
surprising connections) from [SwarmVault](https://github.com/swarmclawai/swarmvault),
which is MIT licensed; no SwarmVault code is copied. The trial in
deploy/swarmvault/ installs SwarmVault itself, unmodified, under its own MIT
license.
