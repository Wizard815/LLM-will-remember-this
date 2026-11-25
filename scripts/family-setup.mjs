#!/usr/bin/env node
// Set up and run the LLMWIKI as one family's memory. Run it on the machine that holds the vault:
//
//   node scripts/family-setup.mjs init                    asks who the admin is, then moves today's
//                                                          single-person vault into household/ and
//                                                          people/<admin>/ (git keeps the history)
//   node scripts/family-setup.mjs add-member              asks who to add; creates people/<id>/
//   node scripts/family-setup.mjs add-service <id> <name> e.g. upstream-manager: writes household/
//   node scripts/family-setup.mjs add-shared <id> <name>  one assistant for the whole family
//   node scripts/family-setup.mjs token <id>              prints a new token once; only its hash is kept
//                                  [--as member]          for the admin: a token that sees only their own notes
//                                                          (for an assistant like FAITH that also serves shared screens)
//   node scripts/family-setup.mjs update <id> [flags]     add names or Omi ids to someone
//   node scripts/family-setup.mjs revoke <id>             removes every token of <id>
//   node scripts/family-setup.mjs remove <id>             takes someone out (tokens too); keeps their folder
//   node scripts/family-setup.mjs list                    who is in the family and who has tokens
//
// Flags instead of questions: --id --name --role admin|member --alias X (repeatable), --voice X
// (repeatable: a name Omi's People list uses for them), --omi-uid X (the Omi account they wear),
// --omi-person X (repeatable: the id another member's Omi gave them under People),
// --household-areas a,b,c (init), --vault <path> (default: here).
// Omi's "Speaker 0 / Speaker A" labels are per conversation and are refused as voice names.
// Tokens are stored as sha-256 in .obsidian/plugins/llmwiki-mcp-bridge/data.json, which git ignores.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline";

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const DEFAULT_HOUSEHOLD_AREAS = ["homelab", "ai", "automation", "knowledge", "travel"];
const PARA = ["1-projects", "2-areas", "3-resources", "4-archive", "logs"];
const SKELETON = ["daily", "inbox", "raw/sources", ...PARA.map((p) => `wiki/${p}`)];

function parseArgs(argv) {
  const out = { _: [], alias: [], voice: [], omi_person: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2), value = argv[i + 1];
    i += 1;
    if (key === "alias" || key === "voice" || key === "omi-person") out[key.replace(/-/g, "_")].push(value);
    else out[key.replace(/-/g, "_")] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ schema/family.md */

// One JSON object per list item: valid YAML (flow mappings), and easy to edit by hand in the same shape.
export function readFamily(vault) {
  const path = join(vault, "schema/family.md");
  const fam = { members: [], services: [], shared_agents: [] };
  if (!existsSync(path)) return fam;
  const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8"));
  let section = null;
  for (const line of (fm ? fm[1] : "").split("\n")) {
    const head = /^(members|services|shared_agents):\s*(\[\])?\s*$/.exec(line);
    if (head) { section = head[1]; continue; }
    const item = /^\s+-\s+(\{.*\})\s*$/.exec(line);
    if (item && section) fam[section].push(JSON.parse(item[1]));
  }
  return fam;
}

export function writeFamily(vault, fam) {
  const block = (name, items) => (items.length ? `${name}:\n${items.map((x) => `  - ${JSON.stringify(x)}`).join("\n")}` : `${name}: []`);
  const text = `---
title: "Family"
type: registry
tags: [registry]
${block("members", fam.members)}
${block("services", fam.services)}
${block("shared_agents", fam.shared_agents)}
---

# Family

Who the LLMWIKI belongs to. Agents read this to tell people apart; the LLMWIKI MCP Bridge uses it to
decide who may read what. Change it with \`node scripts/family-setup.mjs\` (or by hand, one JSON object
per line, same shape).

- **members**: each has a private folder \`people/<id>/\` (only they, their agents and the admin can read it).
  \`role: admin\` sees everyone's. \`aliases\` are other names they go by; \`voice\` are names
  Omi's People list uses for them; \`omi_uid\` is the Omi account they wear and \`omi_people\` the
  ids other members' Omi apps gave them. Omi recognizes the voices; this only says who they are.
  ("Speaker 1" labels are per conversation and never name anyone.)
- **services**: apps that write the household's memory (\`household/\`), e.g. Upstream Manager.
- **shared_agents**: one assistant for the whole family. It has no folder of its own, must name the
  person on every write, and asks who it is talking to when it can't tell.

Tokens are never stored here: \`family-setup.mjs token <id>\` prints one once and keeps only its hash.
`;
  mkdirSync(join(vault, "schema"), { recursive: true });
  writeFileSync(join(vault, "schema/family.md"), text);
}

/* ------------------------------------------------------------------ tokens */

const tokenFile = (vault) => join(vault, ".obsidian/plugins/llmwiki-mcp-bridge/data.json");

export function readTokens(vault) {
  try {
    const d = JSON.parse(readFileSync(tokenFile(vault), "utf8"));
    return Array.isArray(d.tokens) ? d.tokens : [];
  } catch {
    return [];
  }
}

function writeTokens(vault, tokens) {
  let data = {};
  try { data = JSON.parse(readFileSync(tokenFile(vault), "utf8")); } catch { /* new file */ }
  mkdirSync(dirname(tokenFile(vault)), { recursive: true });
  writeFileSync(tokenFile(vault), JSON.stringify({ ...data, tokens }, null, 2) + "\n");
}

export function issueToken(vault, id, label = "", as = "") {
  const fam = readFamily(vault);
  const kind = fam.members.some((m) => m.id === id) ? "member" : fam.services.some((s) => s.id === id) ? "service"
    : fam.shared_agents.some((s) => s.id === id) ? "shared" : null;
  if (!kind) throw new Error(`"${id}" isn't in schema/family.md; add them first.`);
  if (as && (as !== "member" || kind !== "member")) throw new Error(`--as member is the only choice, and only for a family member's token.`);
  const token = `llmw_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  writeTokens(vault, [...readTokens(vault), { hash, kind, id, label: label || id, created: new Date().toISOString().slice(0, 10), ...(as ? { as } : {}) }]);
  return { token, kind };
}

export function revoke(vault, id) {
  const before = readTokens(vault);
  const after = before.filter((t) => t.id !== id);
  writeTokens(vault, after);
  return before.length - after.length;
}

/* ------------------------------------------------------------------ folders */

const today = () => new Date().toISOString().slice(0, 10);

function profileText(vault, m) {
  const tplPath = join(vault, "schema/templates/PROFILE.md");
  const tpl = existsSync(tplPath) ? readFileSync(tplPath, "utf8")
    : "---\ntitle: \"{{name}}\"\ntype: profile\nperson: {{id}}\ntags: [profile]\ncreated: {{date}}\nupdated: {{date}}\nstatus: draft\n---\n\n# {{name}}\n\n## Shared with the family\n\n- \n";
  return tpl.replace(/\{\{\s*name\s*\}\}/g, m.name).replace(/\{\{\s*id\s*\}\}/g, m.id).replace(/\{\{\s*date\s*\}\}/g, today());
}

export function createRoot(vault, root, member = null) {
  for (const d of SKELETON) mkdirSync(join(vault, root, d), { recursive: true });
  const readme = join(vault, root, "daily/README.md");
  if (!existsSync(readme)) {
    writeFileSync(readme, `# Daily — short-term memory${member ? ` (${member.name})` : " (household)"}\n\nOne note per day, \`YYYY-MM-DD.md\`, from \`schema/templates/DAILY.md\`. Agents and services append with \`memory_log\`; the daily Rollover (\`memory_rollover\`) files each finished day into \`raw/sources/\` for Ingest. See \`schema/agents.md\`.\n`);
  }
  for (const d of ["inbox", "raw/sources", ...PARA.map((p) => `wiki/${p}`)]) {
    const keep = join(vault, root, d, ".gitkeep");
    if (!readdirSync(join(vault, root, d)).length) writeFileSync(keep, "");
  }
  if (member && !existsSync(join(vault, root, "profile.md"))) writeFileSync(join(vault, root, "profile.md"), profileText(vault, member));
}

/* ------------------------------------------------------------------ migration of a single-person vault */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function removeEmptyDirs(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const e of readdirSync(dir)) removeEmptyDirs(join(dir, e));
  if (!readdirSync(dir).length) rmdirSync(dir);
}

function frontField(text, key) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const m = fm && new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, "m").exec(fm[1]);
  return m ? m[1].trim() : "";
}

function move(vault, from, to) {
  mkdirSync(dirname(join(vault, to)), { recursive: true });
  renameSync(join(vault, from), join(vault, to));
}

/** Dataview queries point at "wiki/..."; after a move they point at the note's new root. */
function repointQueries(vault, rel, root, sources) {
  const p = join(vault, rel);
  const text = readFileSync(p, "utf8");
  const next = text
    .replace(/(FROM\s+(?:"|'))wiki\//g, `$1${root}/wiki/`)
    .replace(/(FROM\s+(?:"|'))(inbox|raw)\b/g, `$1${root}/$2`)
    // Sources all move to the admin's raw/, so path links to them follow.
    .replace(/\[\[raw\/sources\//g, `[[${sources}/raw/sources/`);
  if (next !== text) writeFileSync(p, next);
}

/** The dashboard, one section per root: the household's, then each person's. */
export function homeDashboard(date = today()) {
  return `---
title: HOME
created: 2026-07-06
updated: ${date}
---

# 🏠 LLMWIKI Dashboard

> One wiki for the family. \`household/\` is shared; each person has their own private \`people/<id>/\` with the same PARA layout. Who is who → [[family|Family]] · Rules → [[agents|Agent Constitution]]

## 🗺 Areas

\`\`\`dataview
TABLE WITHOUT ID file.link AS Area, regexreplace(file.folder, "/wiki/2-areas$", "") AS Whose, updated AS Updated
FROM "household/wiki/2-areas" OR "people"
WHERE type = "area"
SORT file.folder ASC, file.name ASC
\`\`\`

## 🚧 Active Projects

\`\`\`dataview
TABLE WITHOUT ID file.link AS Project, regexreplace(file.folder, "/wiki/1-projects$", "") AS Whose, area AS Area, updated AS Updated
FROM "household/wiki/1-projects" OR "people"
WHERE type = "project" AND project_status = "active"
SORT file.folder ASC, updated DESC
\`\`\`

## ⏸ Paused Projects

\`\`\`dataview
LIST regexreplace(file.folder, "/wiki/1-projects$", "")
FROM "household/wiki/1-projects" OR "people"
WHERE type = "project" AND project_status = "paused"
\`\`\`

## ⚠ Needs Review (drafts / unverified)

\`\`\`dataview
TABLE WITHOUT ID file.link AS Note, type AS Type, regexreplace(file.folder, "/wiki/.*$", "") AS Whose
FROM "household/wiki" OR "people"
WHERE status = "draft" AND type != "profile" AND contains(file.folder, "/wiki/")
SORT file.folder ASC, type ASC
\`\`\`

## 🕒 Recently Updated

\`\`\`dataview
TABLE WITHOUT ID file.link AS Note, regexreplace(file.folder, "/wiki/.*$", "") AS Whose, updated AS Updated
FROM "household/wiki" OR "people"
WHERE contains(file.folder, "/wiki/") AND type != "log"
SORT updated DESC
LIMIT 10
\`\`\`

## 📥 Short-term memory (inboxes, open days, unprocessed sources)

\`\`\`dataview
TABLE WITHOUT ID file.link AS Note, regexreplace(file.folder, "/(inbox|daily|raw/sources)$", "") AS Whose, choice(contains(file.folder, "inbox"), "inbox", choice(type = "daily", "daily", "source")) AS Kind
FROM "household" OR "people"
WHERE file.name != "README" AND (contains(file.folder, "/inbox") OR (type = "daily" AND status = "open") OR (type = "source" AND status = "unprocessed"))
SORT file.folder ASC
\`\`\`

## 👪 People

\`\`\`dataview
TABLE WITHOUT ID file.link AS Person, updated AS Updated
FROM "people"
WHERE type = "profile"
\`\`\`

---

**Map:** [[Projects.base|All projects (sortable)]] · shared → \`household/wiki/\` · a person's own → \`people/<id>/wiki/\` (each has \`1-projects\`, \`2-areas\`, \`3-resources\`, \`4-archive\`)
`;
}

/** household/ notes whose [[links]] name a note in a private root: the title alone can give something away. */
export function sharedLinksToPrivate(vault) {
  const name = (p) => p.split("/").pop().replace(/\.md$/, "");
  const priv = new Set(walk(join(vault, "people")).filter((p) => p.endsWith(".md")).map(name));
  const out = [];
  for (const abs of walk(join(vault, "household"))) {
    if (!abs.endsWith(".md")) continue;
    // Citing a source (raw/sources/...) is allowed: its file name is a date and a generic title.
    const links = [...readFileSync(abs, "utf8").matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()).filter((l) => !/(^|\/)raw\/sources\//.test(l)).map((l) => l.split("/").pop()).filter((l) => priv.has(l));
    if (links.length) out.push({ note: relative(vault, abs).split("\\").join("/"), links: [...new Set(links)] });
  }
  return out;
}

export function migrate(vault, admin, householdAreas = DEFAULT_HOUSEHOLD_AREAS) {
  const moved = [];
  const me = `people/${admin.id}`;
  const destFor = (rel, text) => {
    const area = frontField(text, "area");
    const isMe = frontField(text, "resource_kind") === "person" && [admin.name, admin.id, ...(admin.aliases || [])].some((n) => n.toLowerCase() === frontField(text, "title").toLowerCase());
    if (isMe || (area && !householdAreas.includes(area))) return me;
    return "household";
  };
  for (const abs of walk(join(vault, "wiki"))) {
    const rel = relative(vault, abs).split("\\").join("/");
    const text = rel.endsWith(".md") ? readFileSync(abs, "utf8") : "";
    const root = rel.startsWith("wiki/logs/") ? "household" : destFor(rel, text);
    const to = `${root}/${rel}`;
    move(vault, rel, to);
    if (to.endsWith(".md")) repointQueries(vault, to, root, me);
    moved.push(`${rel} -> ${to}`);
  }
  for (const abs of walk(join(vault, "daily"))) {
    const rel = relative(vault, abs).split("\\").join("/");
    if (rel === "daily/README.md") continue;
    move(vault, rel, `${me}/${rel}`);
    moved.push(`${rel} -> ${me}/${rel}`);
  }
  // A one-person vault's sources (context dumps, transcripts) are that person's: they go private.
  // Shared notes keep citing them by file name; the bridge won't let anyone else open them.
  for (const [top, root] of [["inbox", "household"], ["raw", me]]) {
    for (const abs of walk(join(vault, top))) {
      const rel = relative(vault, abs).split("\\").join("/");
      if (rel.endsWith("README.md")) continue;
      move(vault, rel, `${root}/${rel}`);
      moved.push(`${rel} -> ${root}/${rel}`);
    }
  }
  // Each root has its own daily/ and inbox/ READMEs now; the top-level folders go once empty.
  for (const r of ["daily/README.md", "inbox/README.md"]) if (existsSync(join(vault, r))) rmSync(join(vault, r));
  for (const top of ["wiki", "daily", "inbox", "raw"]) removeEmptyDirs(join(vault, top));
  writeFileSync(join(vault, "HOME.md"), homeDashboard());
  const base = join(vault, "Projects.base");
  if (existsSync(base)) {
    // Bases match folders by prefix-free path, so list each root's project folders by name ending.
    const text = readFileSync(base, "utf8").replace(
      /    - or:\n(?:        - file\.inFolder\("wiki\/[^"]+"\)\n)+/,
      '    - or:\n        - file.folder.endsWith("/wiki/1-projects")\n        - file.folder.endsWith("/wiki/4-archive")\n',
    );
    writeFileSync(base, text);
  }
  // Obsidian's own daily-note button belongs to whoever uses this Obsidian: the admin.
  const dn = join(vault, ".obsidian/daily-notes.json");
  if (existsSync(dn)) {
    const d = JSON.parse(readFileSync(dn, "utf8"));
    writeFileSync(dn, JSON.stringify({ ...d, folder: `${me}/daily` }, null, 2) + "\n");
  }
  // Semantic search covers every wiki/; the bridge filters what each person may see.
  const sb = join(vault, ".obsidian/plugins/local-rest-api-second-brain-mcp-extension/data.json");
  if (existsSync(sb)) {
    const d = JSON.parse(readFileSync(sb, "utf8"));
    writeFileSync(sb, JSON.stringify({ ...d, allowedPathPatterns: ["^household/wiki/", "^people/[^/]+/wiki/"] }, null, 2) + "\n");
  }
  const kw = join(vault, ".obsidian/plugins/karpathywiki/data.json");
  if (existsSync(kw)) {
    const d = JSON.parse(readFileSync(kw, "utf8"));
    writeFileSync(kw, JSON.stringify({ ...d, watchedFolders: ["household/daily", `${me}/daily`] }, null, 2) + "\n");
  }
  return moved;
}

/* ------------------------------------------------------------------ commands */

/** Questions on a terminal. Lines are read from an iterator, so answers typed (or pasted) ahead aren't lost. */
function prompter() {
  const iface = createInterface({ input: process.stdin, terminal: false });
  const lines = iface[Symbol.asyncIterator]();
  return {
    async ask(question) {
      process.stdout.write(question);
      const next = await lines.next();
      if (next.done) throw new Error("no answer (input ended)");
      return next.value;
    },
    close: () => iface.close(),
  };
}

async function ask(rl, q, fallback) {
  if (fallback !== undefined && fallback !== null && fallback !== "") return fallback;
  if (!rl) {
    if (q.def) return q.def;
    throw new Error(`missing --${q.flag}`);
  }
  const a = (await rl.ask(`${q.text}${q.def ? ` [${q.def}]` : ""}: `)).trim();
  return a || q.def || "";
}

const GENERIC_SPEAKER_RE = /^(?:speaker|spk)[\s_-]*(?:\d+|[a-z])$/i;

/** Everything a person can be called by: none of it may point at someone else too. */
const namesOf = (m) => [m.id, m.name, ...(m.aliases || []), ...(m.voice || []), ...(m.omi_people || [])].map((x) => String(x).trim().toLowerCase());

/** Why this member can't be in the family as written, or null. */
export function memberProblem(fam, m) {
  for (const n of [m.name, ...(m.aliases || []), ...(m.voice || [])]) {
    if (String(n).trim().toLowerCase() === "household") return `"${n}" is the shared folder's name; pick another`;
    if (GENERIC_SPEAKER_RE.test(String(n).trim())) return `"${n}" is a per-conversation speaker label (Omi numbers voices again in every conversation), so it can't name a person; use the name in Omi's People list`;
  }
  for (const other of fam.members) {
    if (other.id === m.id) continue;
    const clash = namesOf(m).find((n) => namesOf(other).includes(n));
    if (clash) return `"${clash}" already means ${other.name}; two people can't share a name, alias or Omi id`;
    if (m.omi_uid && other.omi_uid === m.omi_uid) return `that Omi account is already ${other.name}'s`;
  }
  return null;
}

/** The member as stored: Omi fields only when set. */
function memberRecord(m) {
  const r = { id: m.id, name: m.name, role: m.role, aliases: m.aliases || [], voice: m.voice || [] };
  if (m.omi_uid) r.omi_uid = m.omi_uid;
  if (m.omi_people && m.omi_people.length) r.omi_people = m.omi_people;
  return r;
}

async function memberFromInput(args, rl, role) {
  const name = await ask(rl, { flag: "name", text: "Their name (as the family says it)" }, args.name);
  const id = await ask(rl, { flag: "id", text: "Short id for folders (lowercase letters, digits, -)", def: name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") }, args.id);
  if (!ID_RE.test(id)) throw new Error(`"${id}" can't be an id: lowercase letter first, then letters, digits or -, at most 32.`);
  const aliases = args.alias.length || !rl ? args.alias : (await rl.ask("Other names they go by (comma-separated, Enter for none): ")).split(",").map((s) => s.trim()).filter(Boolean);
  const voice = args.voice.length || !rl ? args.voice : (await rl.ask("Names Omi's People list uses for them (comma-separated, Enter for none): ")).split(",").map((s) => s.trim()).filter(Boolean);
  const omi_uid = args.omi_uid || !rl ? args.omi_uid || "" : (await rl.ask("Their Omi account uid, if they wear an Omi (Enter for none): ")).trim();
  return memberRecord({ id, name, role: args.role || role, aliases, voice, omi_uid, omi_people: args.omi_person });
}

export async function run(argv, { interactive = process.stdin.isTTY } = {}) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  const vault = args.vault || process.cwd();
  const rl = interactive ? prompter() : null;
  const log = (...a) => console.log(...a);
  try {
    const fam = readFamily(vault);
    switch (cmd) {
      case "init": {
        if (fam.members.length) throw new Error("schema/family.md already has members; use add-member.");
        log("Setting up the LLMWIKI for a family. First, the admin (you): sees everyone's notes and runs the daily jobs.");
        const admin = await memberFromInput(args, rl, "admin");
        admin.role = "admin";
        const why = memberProblem(fam, admin);
        if (why) throw new Error(why);
        writeFamily(vault, { ...fam, members: [admin] });
        const moved = migrate(vault, admin, args.household_areas ? args.household_areas.split(",").map((s) => s.trim()) : DEFAULT_HOUSEHOLD_AREAS);
        createRoot(vault, "household");
        createRoot(vault, `people/${admin.id}`, admin);
        log(`Admin: ${admin.name} (people/${admin.id}/). Moved ${moved.length} files:`);
        for (const m of moved) log(`  ${m}`);
        const leaks = sharedLinksToPrivate(vault);
        if (leaks.length) {
          log(`\nShared notes that link to notes now in people/ (everyone can read household/, so the titles show; review them):`);
          for (const l of leaks) log(`  ${l.note}: ${l.links.join(", ")}`);
        }
        log(`Next: add the rest of the family (add-member), then issue tokens (token <id>).`);
        return { admin, moved, leaks };
      }
      case "add-member": {
        if (!fam.members.length) throw new Error("run init first");
        const m = await memberFromInput(args, rl, "member");
        if (fam.members.some((x) => x.id === m.id)) throw new Error(`${m.id} is already in the family`);
        const why = memberProblem(fam, m);
        if (why) throw new Error(why);
        fam.members.push(m);
        writeFamily(vault, fam);
        createRoot(vault, `people/${m.id}`, m);
        log(`Added ${m.name}: people/${m.id}/ with a profile. Issue a token with: token ${m.id}`);
        return m;
      }
      case "add-service":
      case "add-shared": {
        const [id, ...name] = rest;
        if (!ID_RE.test(id || "")) throw new Error("give an id, e.g. upstream-manager");
        const key = cmd === "add-service" ? "services" : "shared_agents";
        if (fam[key].some((x) => x.id === id)) throw new Error(`${id} is already there`);
        fam[key].push({ id, name: name.join(" ") || id });
        writeFamily(vault, fam);
        log(`Added ${cmd === "add-service" ? "service" : "shared agent"} ${id}. Issue a token with: token ${id}`);
        return { id };
      }
      case "token": {
        const { token, kind } = issueToken(vault, rest[0], args.label, args.as);
        log(`Token for ${rest[0]} (${kind}). It is shown only now; store it in that app's settings:\n\n  ${token}\n`);
        return { token };
      }
      case "update": {
        const m = fam.members.find((x) => x.id === rest[0]);
        if (!m) throw new Error(`${rest[0]} isn't a family member`);
        const next = memberRecord({ ...m, name: args.name || m.name, aliases: [...new Set([...(m.aliases || []), ...args.alias])],
          voice: [...new Set([...(m.voice || []), ...args.voice])], omi_uid: args.omi_uid || m.omi_uid,
          omi_people: [...new Set([...(m.omi_people || []), ...args.omi_person])] });
        const why = memberProblem(fam, next);
        if (why) throw new Error(why);
        fam.members[fam.members.indexOf(m)] = next;
        writeFamily(vault, fam);
        log(`Updated ${next.name}: goes by ${namesOf(next).slice(1).join(", ")}${next.omi_uid ? "; wears an Omi" : ""}.`);
        return next;
      }
      case "remove": {
        const id = rest[0];
        const key = ["members", "services", "shared_agents"].find((k) => fam[k].some((x) => x.id === id));
        if (!key) throw new Error(`${id} isn't in schema/family.md`);
        const x = fam[key].find((y) => y.id === id);
        if (key === "members" && x.role === "admin" && fam.members.filter((y) => y.role === "admin").length === 1) throw new Error("that's the only admin; make someone else admin first");
        fam[key] = fam[key].filter((y) => y.id !== id);
        writeFamily(vault, fam);
        const n = revoke(vault, id);
        log(`Removed ${x.name} and ${n} token(s).${key === "members" ? ` Their folder people/${id}/ is kept; only the admin can open it now. Delete it yourself if they want it gone.` : ""}`);
        return { removed: id, tokens: n };
      }
      case "revoke": {
        const n = revoke(vault, rest[0]);
        log(`Removed ${n} token(s) of ${rest[0]}.`);
        return { removed: n };
      }
      case "list": {
        const tokens = readTokens(vault);
        const n = (id) => tokens.filter((t) => t.id === id).length;
        for (const m of fam.members) log(`member  ${m.id.padEnd(18)} ${m.name} (${m.role}) tokens: ${n(m.id)}`);
        for (const s of fam.services) log(`service ${s.id.padEnd(18)} ${s.name} tokens: ${n(s.id)}`);
        for (const s of fam.shared_agents) log(`shared  ${s.id.padEnd(18)} ${s.name} tokens: ${n(s.id)}`);
        return fam;
      }
      default:
        log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
        return null;
    }
  } finally {
    if (rl) rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
}
