/* LLMWIKI MCP Bridge
 *
 * Makes the vault a family's memory, on top of the Local REST API plugin (whose
 * one master key opens everything) and the Second Brain extension. Both stay
 * stock and update-safe.
 *
 * For the admin, on the REST plugin's own /mcp/ (master key):
 *   - query_wiki / get_wiki / wiki_card: Second Brain's semantic tools.
 *   - memory_log / memory_capture / memory_add_source / memory_rollover: writes
 *     that land only in a person's or the household's short-term tier.
 *   - a guard on the built-in vault_* write tools: an existing raw/ source is
 *     never changed or removed (rule 1), except marking its status in Ingest.
 *
 * For everyone else, with a personal token (schema/family.md says who is who;
 * scripts/family-setup.mjs issues tokens, only their hashes are stored):
 *   - /family-mcp: the same memory tools plus reading, searching and writing
 *     notes, each person seeing only their own folder (people/<id>/, shown as
 *     the vault root), household/ and schema/. The admin also sees people/.
 *   - /family/vault/..., /family/search/simple/: the REST API, with the same
 *     per-person view, for apps such as Pondering Orb.
 *   A service token (e.g. Upstream Manager) works in household/; a shared
 *   agent (one assistant for the whole family) has no folder of its own and
 *   must name the person on every write.
 */

const { Plugin, Notice, requestUrl } = require("obsidian");

const REST_ID = "obsidian-local-rest-api";
const SECOND_BRAIN_ID = "local-rest-api-second-brain-mcp-extension";
const REGISTRY_PATH = "schema/family.md";
const DAILY_TEMPLATE = "schema/templates/DAILY.md";
const HANDSHAKE_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

/* query_wiki returns whole notes plus every linked note, so one answer can
 * be hundreds of KB. Past this, the answer is cut and says so. */
const MAX_QUERY_CHARS = 60000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SEGMENTS = 5000;
const MAX_OVERVIEW = 20000;
const MAX_ACTION_ITEMS = 200;
const MAX_CONTEXT_CHARS = 8000;

const DAILY_SECTIONS = {
  worked_on: "Worked on",
  decisions: "Decisions / facts worth keeping",
  follow_ups: "Follow-ups",
};

/* Rule 9: never store secrets. Coarse on purpose: refusing a false positive
 * costs a retry; storing a real key in a synced vault costs a rotation. */
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*\S{6,}/i,
];

/* ------------------------------------------------------------------ pure helpers (tested in scripts/) */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
const join = (root, rel) => (root ? `${root}/${rel}` : rel);

function normPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
}

/** A file name from free text: no path or reserved characters, one line, at most 80 chars. */
function safeTitle(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|#^[\]\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

function findSecret(text) {
  const hit = SECRET_PATTERNS.find((re) => re.test(String(text || "")));
  return hit ? hit.source : null;
}

function fillTemplate(text, date) {
  const day = ymd(date);
  return String(text).replace(/\{\{\s*(date|title)(:[^}]*)?\s*\}\}/g, day);
}

/** Add one bullet at the end of a "## heading" section; an empty "- " placeholder is filled instead. */
function insertUnderHeading(text, heading, line) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, "").trim() === heading);
  const bullet = `- ${line}`;
  if (start === -1) {
    const body = String(text).replace(/\n+$/, "");
    return `${body}\n\n## ${heading}\n\n${bullet}\n`;
  }
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i += 1) {
    if (/^-\s*$/.test(lines[i])) {
      lines[i] = bullet;
      return lines.join("\n");
    }
  }
  let last = end - 1;
  while (last > start && lines[last].trim() === "") last -= 1;
  lines.splice(last + 1, 0, ...(last === start ? ["", bullet] : [bullet]));
  return lines.join("\n");
}

/** The text under one "## heading", or "". */
function sectionText(text, heading) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+/, "").trim() === heading);
  if (start === -1) return "";
  const out = [];
  for (let i = start + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i += 1) out.push(lines[i]);
  return out.join("\n").trim();
}

/** A raw/ folder anywhere sources live: raw/, household/raw/, people/<id>/raw/. */
function isRaw(path) {
  return /^(?:household\/|people\/[^/]+\/)?raw(?:\/|$)/.test(normPath(path));
}

/** Why a built-in write tool may not touch this path, or null. exists(path) says whether a file is there. */
function guardRaw(tool, args, exists) {
  const p = normPath(args && args.path);
  const refuse = (what) =>
    `${what} raw/ is not allowed: sources there are never changed or removed (schema/agents.md rule 1). ` +
    "Add a new source with memory_add_source; only a human deletes one.";
  switch (tool) {
    case "vault_write":
      return isRaw(p) && exists(p) ? refuse(`Overwriting ${p} in`) : null;
    case "vault_append":
      return isRaw(p) && exists(p) ? refuse(`Appending to ${p} in`) : null;
    case "vault_patch": {
      if (!isRaw(p) || !exists(p)) return null;
      // Ingest step 5 marks a source processed: that one front-matter key is allowed.
      const marking = args.targetType === "frontmatter" && args.target === "status" && args.operation === "replace";
      return marking ? null : refuse(`Patching ${p} in`);
    }
    case "vault_delete":
      return isRaw(p) ? refuse(`Deleting ${p} from`) : null;
    case "vault_move": {
      const dest = normPath(args && args.destination);
      if (isRaw(p)) return refuse(`Moving ${p} out of`);
      if (isRaw(dest) && args.allowOverwrite) return refuse(`Moving over an existing file in`);
      return null;
    }
    default:
      return null;
  }
}

/** A daily note's text as a raw source: the Source front matter in place of the daily one, body kept. */
function rolloverText(text, day, today) {
  const s = String(text);
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  const created = (m && (/^created:\s*["']?(\d{4}-\d{2}-\d{2})/m.exec(m[1]) || [])[1]) || day;
  const body = m ? s.slice(m[0].length) : s;
  const front = ["---", `title: "${day} - Daily Note"`, "type: source", "tags: [source]",
    `created: ${created}`, `updated: ${today}`, "status: unprocessed", "---", ""].join("\n");
  return front + body.replace(/^\n+/, "\n");
}

/** The daily note's status (open when it has none), from its front matter. */
function dailyStatus(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text));
  const st = m && /^status:\s*["']?([\w-]+)/m.exec(m[1]);
  return st ? st[1] : "open";
}

/* vault_patch's description says application/json content is "parsed as JSON", but the plugin wants a
 * native value and encodes a string again: status "\"processed\"" was stored as the text "processed" in
 * quotes. A JSON-encoded string for a front-matter value is decoded here, so either form works. */
function decodeJsonContent(args) {
  if (!args || args.targetType !== "frontmatter" || args.contentType !== "application/json" || typeof args.content !== "string") return args;
  try {
    return { ...args, content: JSON.parse(args.content) };
  } catch (e) {
    return args;
  }
}

function capQueryResult(text, max = MAX_QUERY_CHARS) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return (
    s.slice(0, max) +
    `\n# [cut at ${max} of ${s.length} characters: read a listed note in full with get_wiki]\n`
  );
}

/* ------------------------------------------------------------------ family: who is who */

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/* Omi (and most diarizers) number voices per conversation: "Speaker 1" today is
 * a different voice from "Speaker 1" yesterday. Such a label never names a person. */
const GENERIC_SPEAKER_RE = /^(?:speaker|spk)[\s_-]*(?:\d+|[a-z])$/i;
const isGenericSpeaker = (n) => GENERIC_SPEAKER_RE.test(String(n || "").trim());
const isHousehold = (n) => String(n || "").trim().toLowerCase() === "household";

/** schema/family.md front matter -> the registry. Entries with a bad id are dropped. */
function normalizeRegistry(fm) {
  const f = fm || {};
  const members = new Map(), services = new Map(), shared = new Map();
  for (const m of Array.isArray(f.members) ? f.members : []) {
    const id = String((m && m.id) || "");
    if (!ID_RE.test(id)) continue;
    members.set(id, { id, name: String(m.name || id), role: m.role === "admin" ? "admin" : "member",
      aliases: list(m.aliases), voice: list(m.voice).filter((v) => !isGenericSpeaker(v)),
      // Omi: the account this person wears (segments with is_user are theirs), and the
      // ids other family members' Omi apps gave this person under People.
      omi_uid: m.omi_uid ? String(m.omi_uid) : "", omi_people: list(m.omi_people) });
  }
  for (const s of Array.isArray(f.services) ? f.services : []) {
    const id = String((s && s.id) || "");
    if (ID_RE.test(id)) services.set(id, { id, name: String(s.name || id) });
  }
  for (const s of Array.isArray(f.shared_agents) ? f.shared_agents : []) {
    const id = String((s && s.id) || "");
    if (ID_RE.test(id)) shared.set(id, { id, name: String(s.name || id) });
  }
  return { members, services, shared };
}

/** Every family member a name, alias, voice name or Omi person id could mean (case-insensitive). */
function membersMatching(registry, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n || isGenericSpeaker(n)) return [];
  return [...registry.members.values()].filter((m) => [m.id, m.name, ...m.aliases, ...m.voice, ...m.omi_people].some((x) => x.toLowerCase() === n));
}

/** The one family member a name means, or null when it means nobody or more than one person. */
function whoIs(registry, name) {
  const ms = membersMatching(registry, name);
  return ms.length === 1 ? ms[0] : null;
}

/** whoIs, with the reason when it can't say: { member } or { error }. */
function resolveMember(registry, name) {
  const ms = membersMatching(registry, name);
  if (ms.length === 1) return { member: ms[0] };
  const members = [...registry.members.values()].map((x) => x.name).join(", ");
  if (ms.length > 1) return { error: `"${name}" could be more than one person (${ms.map((m) => m.name).join(", ")}). Ask which one.` };
  if (isGenericSpeaker(name)) return { error: `"${name}" is a per-conversation speaker label, not a person: the same label means a different voice in another conversation. Ask who it is.` };
  return { error: `"${name}" isn't in the family. Ask who this is; members: ${members}.` };
}

/** Who said one transcript segment: a named person, the Omi owner (is_user), an Omi person id, or a speaker name. */
function speakerOf(seg, registry, owner) {
  if (seg.person) {
    const r = resolveMember(registry, seg.person);
    return r.member ? { member: r.member } : { label: String(seg.person) };
  }
  if (seg.is_user && owner) return { member: owner };
  if (seg.person_id) {
    const m = [...registry.members.values()].filter((x) => x.omi_people.includes(String(seg.person_id)));
    if (m.length === 1) return { member: m[0] };
  }
  const name = seg.speaker_name || seg.speaker;
  const m = whoIs(registry, name);
  if (m) return { member: m };
  return { label: String(name || (seg.is_user ? "the Omi wearer" : "Unknown speaker")) };
}

/** A transcript as markdown: one paragraph per turn, consecutive lines of one speaker merged. */
/** A conversation's overview and action items (Omi's structured part), as Markdown sections; "" when neither. */
function renderStructured(overview, items) {
  const out = [];
  const o = String(overview || "").trim();
  if (o) out.push(`## Overview\n\n${o}`);
  const lines = (Array.isArray(items) ? items : []).map((x) => {
    const text = String((x && typeof x === "object" ? x.description : x) || "").replace(/\s+/g, " ").trim();
    return text ? `- [${x && typeof x === "object" && x.completed ? "x" : " "}] ${text}` : null;
  }).filter(Boolean);
  if (lines.length) out.push(`## Action items\n\n${lines.join("\n")}`);
  return out.join("\n\n");
}

function renderTranscript(turns) {
  const out = [];
  for (const t of turns) {
    const who = t.member ? t.member.name : `${t.label} (unknown)`;
    const text = String(t.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.who === who) last.text += ` ${text}`;
    else out.push({ who, text });
  }
  return out.map((t) => `**${t.who}:** ${t.text}`).join("\n\n");
}

/** The principal behind a token record, or null when the registry no longer knows it. */
function principalFor(record, registry) {
  if (!record) return null;
  if (record.kind === "member") {
    const m = registry.members.get(record.id);
    // A token issued "as member" never gets the admin's view of everyone (an assistant like FAITH,
    // which also answers on shared screens, should see only this person's own notes).
    return m ? { kind: "member", id: m.id, name: m.name, role: record.as === "member" ? "member" : m.role, label: record.label || m.name } : null;
  }
  if (record.kind === "service") {
    const s = registry.services.get(record.id);
    return s ? { kind: "service", id: s.id, name: s.name, role: "service", label: record.label || s.name } : null;
  }
  if (record.kind === "shared") {
    const s = registry.shared.get(record.id);
    return s ? { kind: "shared", id: s.id, name: s.name, role: "shared", label: record.label || s.name } : null;
  }
  return null;
}

/** The folder a principal's own short-term memory lives in. */
function homeOf(p) {
  if (p.kind === "member") return `people/${p.id}`;
  if (p.kind === "service") return "household";
  return null;
}

/**
 * A path as the principal sees it -> the real vault path, or an error.
 * Members see their own folder as the root, plus household/ and schema/
 * (read only); the admin also sees people/; a service's root is household/;
 * a shared agent sees household/ and schema/ only, and may not write notes.
 */
function resolvePath(vpath, p) {
  const v = normPath(vpath).replace(/\/$/, "");
  const segs = v ? v.split("/") : [];
  if (/[\x00-\x1f]/.test(v) || segs.some((s) => s === ".." || s === "." || s.startsWith("."))) return { error: "That isn't a vault path." };
  if (!v) return { real: "", root: true, write: false };
  if (segs[0] === "schema") return { real: v, write: false };
  if (segs[0] === "household") return { real: v, write: p.kind !== "shared" };
  if (segs[0] === "people") {
    if (p.role === "admin" || (p.kind === "member" && segs[1] === p.id)) return { real: v, write: true };
    return { error: `${v} belongs to another family member: only they and the admin can open it.` };
  }
  const home = homeOf(p);
  if (!home) return { error: `A shared agent has no folder of its own: use household/... or name the person in the memory tools.` };
  return { real: `${home}/${v}`, write: true };
}

/** A real vault path as the principal sees it, or null when they may not see it. */
function toVirtual(real, p) {
  const r = normPath(real);
  const home = homeOf(p);
  if (home && p.kind === "member" && r.startsWith(`${home}/`)) return r.slice(home.length + 1);
  if (p.kind === "service" && r.startsWith("household/")) return r.slice("household/".length);
  if (r.startsWith("household/") || r.startsWith("schema/")) return r;
  if (p.role === "admin" && r.startsWith("people/")) return r;
  return null;
}

/** Why a write through the family endpoints may not touch this real path, or null. */
function guardFamilyWrite(op, real, exists, patch) {
  if (!isRaw(real)) return null;
  if (op === "create" && !exists) return null;
  if (op === "patch" && patch && patch.targetType === "frontmatter" && patch.target === "status" && patch.operation === "replace") return null;
  return `${real} is a source in raw/: sources are never changed or removed (rule 1). Add a new one with memory_add_source.`;
}

/**
 * Keep only the notes a principal may read in a query_wiki answer (a YAML list of
 * notes, each with its linked notes), shown at the paths they know them by.
 */
function filterQueryYaml(text, mapPath) {
  const items = [];
  let cur = null;
  for (const line of String(text || "").split("\n")) {
    const m = /^- path: (.*)$/.exec(line);
    if (m) {
      cur = { path: m[1].trim(), lines: [] };
      items.push(cur);
    } else if (cur && !line.startsWith("#")) {
      cur.lines.push(line);
    }
  }
  const out = [];
  for (const item of items) {
    const v = mapPath(item.path);
    if (v === null) continue;
    const kept = [`- path: ${v}`];
    let conn = null, skipping = false;
    for (const line of item.lines) {
      const c = /^ {4}- path: (.*)$/.exec(line);
      if (c) {
        const cv = mapPath(c[1].trim());
        skipping = cv === null;
        conn = !skipping;
        if (conn) kept.push(`    - path: ${cv}`);
        continue;
      }
      if (/^ {2}connections:\s*$/.test(line)) {
        kept.push(line);
        continue;
      }
      if (skipping && /^ {6,}/.test(line)) continue;
      if (/^ {0,5}\S/.test(line) && !/^ {2}\S/.test(line)) skipping = false;
      if (!skipping) kept.push(line);
    }
    // a "connections:" header left with nothing under it
    const cleaned = kept.filter((l, i) => !(/^ {2}connections:\s*$/.test(l) && !(kept[i + 1] || "").startsWith("    - path:")));
    out.push(cleaned.join("\n").replace(/\n+$/, ""));
  }
  return out.length ? out.join("\n") + "\n" : "# No matching notes you can read\n";
}

/** Check tool arguments against a small JSON schema: required, types, enums, no unknown names. */
function checkArgs(schema, args) {
  if (args !== undefined && args !== null && (typeof args !== "object" || Array.isArray(args))) return "arguments must be an object";
  const a = args || {};
  const props = schema.properties || {};
  for (const k of Object.keys(a)) if (!props[k]) return `unknown argument "${k}"; this tool takes: ${Object.keys(props).join(", ") || "nothing"}`;
  for (const k of schema.required || []) if (a[k] === undefined || a[k] === null || a[k] === "") return `"${k}" is required`;
  for (const [k, p] of Object.entries(props)) {
    const v = a[k];
    if (v === undefined) continue;
    if (p.type === "string" && typeof v !== "string") return `"${k}" must be a string`;
    if (p.type === "integer" && !Number.isInteger(v)) return `"${k}" must be a whole number`;
    if (p.type === "boolean" && typeof v !== "boolean") return `"${k}" must be true or false`;
    if (p.type === "array" && !Array.isArray(v)) return `"${k}" must be a list`;
    if (p.enum && !p.enum.includes(v)) return `"${k}" must be one of: ${p.enum.join(", ")}`;
  }
  return null;
}

/* ------------------------------------------------------------------ plugin */

const GUARDED_TOOLS = ["vault_write", "vault_append", "vault_patch", "vault_delete", "vault_move"];
const PROXY_HEADERS = ["content-type", "accept", "operation", "target-type", "target", "target-delimiter",
  "trim-target-whitespace", "create-target-if-missing", "reject-if-content-preexists", "target-scope", "content-insertion-position"];

class LlmwikiMcpBridge extends Plugin {
  async onload() {
    this.restApi = null;
    this.restoreGuards = [];
    this.app.workspace.onLayoutReady(() => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        const rest = this.app.plugins.plugins[REST_ID];
        if (rest && rest.requestHandler) {
          window.clearInterval(timer);
          try {
            this.registerTools(rest);
            this.guardBuiltInTools(rest);
            this.registerFamilyRoutes(rest);
            console.log("[llmwiki-mcp-bridge] wiki, memory and family tools registered");
          } catch (e) {
            console.error("[llmwiki-mcp-bridge] failed to register:", e);
            new Notice("LLMWIKI MCP Bridge: failed to register tools — " + e.message, 10000);
          }
        } else if (attempts > 30) {
          window.clearInterval(timer);
          new Notice("LLMWIKI MCP Bridge: Local REST API plugin not found; tools not registered.", 10000);
        }
      }, 1000);
      this.registerInterval(timer);
    });
  }

  /* The REST plugin's MCP schemas are zod types bundled inside it; an
   * extension can't import that zod. Borrow a ZodString instance from an
   * already-registered tool spec so our schemas use the exact same zod. */
  findZodString(rest) {
    const specs = rest.requestHandler && rest.requestHandler.mcpHandler && rest.requestHandler.mcpHandler.toolSpecs;
    if (!specs) return null;
    for (const spec of specs.values()) {
      for (const v of Object.values(spec.schema || {})) {
        let cur = v;
        for (let i = 0; i < 6 && cur; i += 1) {
          const tn = cur._def && cur._def.typeName;
          if (tn === "ZodString") return cur;
          cur = cur._def && (cur._def.innerType || cur._def.schema);
        }
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- who is who */

  registry() {
    const file = this.app.vault.getAbstractFileByPath(REGISTRY_PATH);
    const cache = file && this.app.metadataCache.getFileCache(file);
    return normalizeRegistry(cache && cache.frontmatter);
  }

  /** The family layout is on once schema/family.md names at least one member. */
  familyOn(registry = this.registry()) {
    return registry.members.size > 0;
  }

  /** The short-term root for "person": a member id or name, "household", or "" (single-user vault). */
  rootFor(person, registry = this.registry()) {
    if (!this.familyOn(registry)) return "";
    if (!person || isHousehold(person)) return "household";
    const r = resolveMember(registry, person);
    if (r.error) throw new Error(r.error);
    return `people/${r.member.id}`;
  }

  async tokenRecords() {
    const data = (await this.loadData()) || {};
    return Array.isArray(data.tokens) ? data.tokens : [];
  }

  /** The principal for an Authorization: Bearer token, or null. Only sha-256 hashes are stored. */
  async authenticate(header) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(header || ""));
    if (!m) return null;
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(m[1]).digest();
    const record = (await this.tokenRecords()).find((t) => {
      const stored = Buffer.from(String(t.hash || ""), "hex");
      return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
    });
    return principalFor(record, this.registry());
  }

  /* ---------------------------------------------------------------- admin tools on /mcp */

  registerTools(rest) {
    const zStr = this.findZodString(rest);
    if (!zStr) {
      throw new Error("could not derive a schema type from the REST API plugin's registered tools");
    }
    const str = (d) => zStr.describe(d);
    const optStr = (d) => zStr.optional().describe(d);
    const api = rest.getPublicApi(this.manifest);
    this.restApi = api;
    // The REST plugin wraps whatever a callback returns as the tool's text content.
    const forward = (tool, args) => this.callSecondBrain(rest, tool, args);
    const person = optStr("Whose memory: a family member's id or name, or 'household' (default). Ignored in a single-user vault.");

    api.addMcpTool(
      "query_wiki",
      "Semantic search over the LLMWIKI's long-term wiki (every wiki/ folder: the household's and each " +
        "person's; daily/, inbox/ and raw/ are not searched). Finds the notes closest in meaning, then follows " +
        "their links for context; returns whole notes, cut if very long. It always returns the nearest notes, " +
        "even when none is about the question: if they don't cover it, say the wiki doesn't know rather than " +
        "answering from them. A note's folder says whose it is: people/<id>/ is that person's, household/ is shared.",
      { query: str("Natural-language question to answer from the wiki") },
      async (args) => capQueryResult(await forward("query_wiki", { query: args.query }))
    );

    api.addMcpTool(
      "get_wiki",
      "Read one wiki note in full by its vault path or file name, as query_wiki lists them.",
      { path: str("Note path or file name, e.g. 'household/wiki/3-resources/RaidLab.md'") },
      async (args) => forward("get_wiki", { path: args.path })
    );

    api.addMcpTool(
      "wiki_card",
      "What the LLMWIKI covers and how to use it: call once before querying a wiki you don't know.",
      {},
      async () => forward("wiki_card", {})
    );

    api.addMcpTool(
      "memory_log",
      "Record something in today's daily note of a person or the household (…/daily/YYYY-MM-DD.md, created " +
        "from the DAILY template when missing): the short-term memory every agent and service writes to. " +
        "One line per call, in the past tense for work done. Rolled into the long-term wiki by the Rollover " +
        "workflow; never write to wiki/ directly. Refuses anything that looks like a secret.",
      {
        text: str("One line, e.g. 'Merged upstream into omi-local; 2 conflicts resolved'"),
        section: optStr("worked_on (default), decisions or follow_ups"),
        source: optStr("Who is writing, e.g. 'hermes' or 'pondering-orb'; shown after the line"),
        person,
      },
      async (args) => this.memoryLog(args, this.rootFor(args.person))
    );

    api.addMcpTool(
      "memory_capture",
      "Drop a quick note into a person's or the household's inbox/ for later filing (a new file each time, " +
        "never overwriting). The Capture workflow files it into the wiki later.",
      { title: str("A few words naming the note"), content: str("The note itself, markdown"), person },
      async (args) => this.memoryCapture(args, this.rootFor(args.person))
    );

    api.addMcpTool(
      "memory_add_source",
      "Add a source document (a transcript, export or report) to a person's or the household's raw/sources/ " +
        "for the Ingest workflow, marked status: unprocessed. Never overwrites: sources are immutable once written.",
      {
        title: str("Title; the file is named 'YYYY-MM-DD - Title.md'"),
        content: str("The source content, markdown"),
        date: optStr("YYYY-MM-DD the source is about (default today)"),
        person,
      },
      async (args) => this.memoryAddSource(args, this.rootFor(args.person))
    );

    api.addMcpTool(
      "memory_rollover",
      "The Rollover workflow in one call, for every person and the household: each open daily note from " +
        "before today becomes …/raw/sources/YYYY-MM-DD - Daily Note.md next to it (Source front matter, status: " +
        "unprocessed) and leaves daily/ (moved to the vault's .trash, so it can be restored). Run it once a day, " +
        "then run Ingest on the new sources. Today's notes are never rolled over; a day already filed is skipped.",
      { day: optStr("Only this day, YYYY-MM-DD (before today). Omit for every open note before today.") },
      async (args) => this.memoryRollover(args, this.allRoots())
    );
  }

  /** Every short-term root: each member, the household, or the vault root in a single-user vault. */
  allRoots(registry = this.registry()) {
    if (!this.familyOn(registry)) return [""];
    return ["household", ...[...registry.members.keys()].map((id) => `people/${id}`)];
  }

  /* Wrap the built-in write tools' callbacks; MCP sessions built later pick them up. */
  guardBuiltInTools(rest) {
    const specs = rest.requestHandler.mcpHandler && rest.requestHandler.mcpHandler.toolSpecs;
    if (!specs) return;
    const exists = (p) => !!this.app.vault.getAbstractFileByPath(p);
    for (const name of GUARDED_TOOLS) {
      const spec = specs.get(name);
      if (!spec || spec.llmwikiGuarded) continue;
      const original = spec.callback;
      spec.callback = async (args) => {
        const why = guardRaw(name, args, exists);
        if (why) throw new Error(why);
        return original(name === "vault_patch" ? decodeJsonContent(args) : args);
      };
      spec.llmwikiGuarded = true;
      this.restoreGuards.push(() => {
        spec.callback = original;
        delete spec.llmwikiGuarded;
      });
    }
  }

  /* ---------------------------------------------------------------- memory writes (shared by both endpoints) */

  checkText(...parts) {
    for (const part of parts) {
      if (!String(part || "").trim()) throw new Error("text is empty; nothing was written");
      const secret = findSecret(part);
      if (secret) {
        throw new Error(
          "That looks like a secret (rule 9: never store secrets), so nothing was written. " +
            "Say where the secret lives instead of its value."
        );
      }
    }
  }

  async ensureFolder(path) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) {
      const folder = parts.slice(0, i).join("/");
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder).catch(() => {});
      }
    }
  }

  async memoryLog({ text, section, source }, root = "") {
    this.checkText(text);
    const key = section || "worked_on";
    const heading = DAILY_SECTIONS[key];
    if (!heading) throw new Error(`section must be one of ${Object.keys(DAILY_SECTIONS).join(", ")}; got "${key}"`);
    const line = String(text).replace(/\s+/g, " ").trim() + (source ? ` (${safeTitle(source)})` : "");
    const now = new Date();
    const path = join(root, `daily/${ymd(now)}.md`);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const tplFile = this.app.vault.getAbstractFileByPath(DAILY_TEMPLATE);
      const base = tplFile ? fillTemplate(await this.app.vault.read(tplFile), now) : `# ${ymd(now)}\n`;
      await this.ensureFolder(path);
      // Two writers on a new day: the second create fails; append to the note the first made.
      file = await this.app.vault.create(path, base).catch(() => this.app.vault.getAbstractFileByPath(path));
      if (!file) throw new Error(`Couldn't create ${path}.`);
    }
    await this.app.vault.process(file, (data) => insertUnderHeading(data, heading, line));
    return `Logged in ${path} under "${heading}".`;
  }

  async uniquePath(base) {
    let path = `${base}.md`;
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n += 1) path = `${base} (${n}).md`;
    return path;
  }

  async memoryCapture({ title, content }, root = "") {
    this.checkText(title, content);
    const now = new Date();
    const path = await this.uniquePath(join(root, `inbox/${ymd(now)} ${hm(now)} - ${safeTitle(title)}`));
    await this.ensureFolder(path);
    await this.app.vault.create(path, `${String(content).trim()}\n`);
    return `Captured as ${path}.`;
  }

  async memoryAddSource({ title, content, date }, root = "") {
    this.checkText(title, content);
    const day = date || ymd(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day + "T12:00:00Z"))) {
      throw new Error(`date must be YYYY-MM-DD, got "${date}"; nothing was written`);
    }
    const name = safeTitle(title);
    const path = join(root, `raw/sources/${day} - ${name}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      throw new Error(`${path} already exists and sources are never overwritten; use another title.`);
    }
    const today = ymd(new Date());
    const front = ["---", `title: "${name.replace(/"/g, "'")}"`, "type: source", "tags: [source]",
      `created: ${today}`, `updated: ${today}`, "status: unprocessed", "---", "", `# ${name}`, "", ""].join("\n");
    await this.ensureFolder(path);
    await this.app.vault.create(path, `${front}${String(content).trim()}\n`);
    return `Added ${path} (status: unprocessed) for the Ingest workflow.`;
  }

  async memoryRollover({ day } = {}, roots = [""]) {
    const today = ymd(new Date());
    if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today)) {
      throw new Error(`day must be a YYYY-MM-DD before today (${today}); today's note is still being written.`);
    }
    const done = [];
    for (const root of roots) {
      const prefix = join(root, "daily/");
      const notes = this.app.vault
        .getMarkdownFiles()
        .filter((f) => {
          if (!f.path.startsWith(prefix)) return false;
          const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f.path.slice(prefix.length));
          return m && m[1] < today && (!day || m[1] === day);
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      for (const file of notes) {
        const d = file.path.slice(-13, -3);
        const text = await this.app.vault.read(file);
        if (dailyStatus(text) !== "open") {
          done.push(`${file.path}: skipped (status ${dailyStatus(text)})`);
          continue;
        }
        const dest = join(root, `raw/sources/${d} - Daily Note.md`);
        if (this.app.vault.getAbstractFileByPath(dest)) {
          done.push(`${file.path}: skipped (${dest} already exists; the daily note was left in place)`);
          continue;
        }
        await this.ensureFolder(dest);
        await this.app.vault.create(dest, rolloverText(text, d, today));
        await this.app.vault.trash(file, false);
        done.push(`${file.path}: filed as ${dest}`);
      }
    }
    if (!done.length) return day ? `No daily note for ${day}.` : "Nothing to roll over: no daily note before today.";
    return done.join("\n") + "\nNext: run Ingest on the new raw/sources/ files.";
  }

  /* ---------------------------------------------------------------- family endpoint: tools */

  /** The memory root a family principal writes to: their own, the household, or (shared/admin) a named person's. */
  familyRoot(p, person) {
    const reg = this.registry();
    if (!person) {
      const home = homeOf(p);
      if (home) return home;
      const names = [...reg.members.values()].map((m) => m.name).join(", ");
      throw new Error(`Who is this for? A shared agent must name the person (${names}) or 'household' on every write; ask if you can't tell.`);
    }
    if (isHousehold(person)) return "household";
    const r = resolveMember(reg, person);
    if (r.error) throw new Error(r.error);
    const m = r.member;
    const mine = p.kind === "member" && m.id === p.id;
    if (!mine && p.role !== "admin" && p.kind !== "shared") {
      throw new Error(`You can write to your own memory or the household's, not ${m.name}'s.`);
    }
    return `people/${m.id}`;
  }

  /** A real path back as this principal sees it (for messages and results). */
  shown(real, p) {
    const v = toVirtual(real, p);
    return v === null ? "(another person's folder)" : v;
  }

  familyTools() {
    const S = (description, extra = {}) => ({ type: "string", description, ...extra });
    const person = S("Whose memory: a family member's name or 'household'. A shared agent must always give it; a member may only name themselves or 'household'.");
    const READ = { readOnlyHint: true }, WRITE = { readOnlyHint: false, destructiveHint: false };
    const tools = [
      { name: "whoami", annotations: READ, description: "Who this token belongs to, what it can read and write, and how the vault is laid out. Call it first.",
        inputSchema: { type: "object", properties: {} }, run: (a, p) => this.whoamiText(p) },
      { name: "family_members", annotations: READ, description: "The family: each member's name, role, the names they go by (aliases, Omi voice labels), and what they share with the family from their profile. Use it to keep people apart when you help more than one.",
        inputSchema: { type: "object", properties: {} }, run: () => this.familyMembersText() },
      { name: "who_is", annotations: READ, description: "Which family member a name, nickname, Omi person name or Omi person id means. Per-conversation labels like 'Speaker 1' never name anyone. If it can't say, ask the person who they are before writing anything.",
        inputSchema: { type: "object", properties: { name: S("A name, alias, Omi person name or id") }, required: ["name"] },
        run: (a) => { const r = resolveMember(this.registry(), a.name); return r.member ? `${a.name} is ${r.member.name} (id ${r.member.id}, ${r.member.role}).` : r.error; } },
      { name: "memory_log", annotations: WRITE, description: "One line in today's daily note (short-term memory) of yours, the household's or, for a shared agent, the named person's. Past tense for work done. Refuses secrets.",
        inputSchema: { type: "object", properties: { text: S("One line"), section: S("Which part of the note", { enum: Object.keys(DAILY_SECTIONS) }), source: S("Who is writing, e.g. 'hermes'"), person }, required: ["text"] },
        run: (a, p) => this.memoryLog({ ...a, source: [a.source, p.kind === "shared" ? `via ${p.label}` : null].filter(Boolean).join(", ") }, this.familyRoot(p, a.person)).then((r) => this.relabel(r, p)) },
      { name: "memory_capture", annotations: WRITE, description: "A quick note into an inbox/ for later filing (yours, the household's, or the named person's for a shared agent). Never overwrites.",
        inputSchema: { type: "object", properties: { title: S("A few words"), content: S("The note, markdown"), person }, required: ["title", "content"] },
        run: (a, p) => this.memoryCapture(a, this.familyRoot(p, a.person)).then((r) => this.relabel(r, p)) },
      { name: "memory_add_source", annotations: WRITE, description: "A source document (transcript, export, report) into raw/sources/ for Ingest, status unprocessed. Never overwrites.",
        inputSchema: { type: "object", properties: { title: S("Title"), content: S("Content, markdown"), date: S("YYYY-MM-DD it is about (default today)"), person }, required: ["title", "content"] },
        run: (a, p) => this.memoryAddSource(a, this.familyRoot(p, a.person)).then((r) => this.relabel(r, p)) },
      { name: "memory_rollover", annotations: WRITE, description: "File your open daily notes from before today into raw/sources/ for Ingest (the admin files everyone's). Run once a day.",
        inputSchema: { type: "object", properties: { day: S("Only this day, YYYY-MM-DD") } },
        run: (a, p) => {
          if (p.kind === "shared") throw new Error("A shared agent can't roll over memory; the admin's daily job does.");
          return this.memoryRollover(a, p.role === "admin" ? this.allRoots() : [homeOf(p)]).then((r) => this.relabel(r, p));
        } },
      { name: "context_for", annotations: READ, description: "Everything you should know before answering one person: their profile, today's daily note and open follow-ups (a shared agent gets only what they share, plus the household's day). Call it whenever the person you are talking to changes, and keep each person's context to their own turns.",
        inputSchema: { type: "object", properties: { person: S("Who you are about to help: a name, alias or 'household'. Members may leave it out (themselves).") } },
        run: (a, p) => this.contextFor(a.person, p) },
      { name: "conversation_log", annotations: WRITE, description: "File a conversation (a voice transcript from Omi or a home assistant, or a chat) as a source for Ingest, in the folder of each family member who spoke. Each line names its speaker by person, Omi is_user / person_id, or speaker name; per-conversation labels like 'Speaker 1' stay unknown. Unknown speakers are listed back: ask who they were.",
        inputSchema: { type: "object", properties: {
          title: S("What it was about, a few words"),
          segments: { type: "array", description: "The lines in order: { text, person? (a family name), speaker? (the label the recorder gave), is_user? (said by the Omi wearer), person_id? (Omi person id), start? (seconds) }", items: { type: "object" } },
          date: S("YYYY-MM-DD it happened (default today)"),
          shared: { type: "boolean", description: "A household conversation: also file it in household/" },
          wearer: S("Whose Omi or microphone recorded it (for is_user lines), when you aren't that person"),
          source: S("Where it came from, e.g. 'omi' or 'kitchen-speaker'"),
          id: S("The recorder's id for this conversation: filing the same id twice does nothing"),
          overview: S("A summary of the conversation (Omi's overview), filed above the transcript"),
          action_items: { type: "array", description: "Follow-ups from it: strings, or { description, completed? } as Omi sends them", items: {} },
          people: { type: "array", description: "Family members who took part, by name: who it is filed for when there are no segments", items: { type: "string" } },
        } },
        run: (a, p) => this.conversationLog(a, p).then((r) => this.relabel(r.text, p)) },
      { name: "notes_list", annotations: READ, description: "List a folder. '' is your view of the vault: your own folders, household/ and schema/ (the admin also sees people/).",
        inputSchema: { type: "object", properties: { path: S("Folder, e.g. 'wiki/1-projects' or 'household/wiki/3-resources'") } },
        run: (a, p) => this.notesList(a.path || "", p) },
      { name: "note_read", annotations: READ, description: "Read one note you can see, in full.",
        inputSchema: { type: "object", properties: { path: S("Path as notes_list or notes_search show it") }, required: ["path"] },
        run: (a, p) => this.noteRead(a.path, p) },
      { name: "notes_search", annotations: READ, description: "Find notes you can see that contain words (exact, case-insensitive), with a snippet each. Other people's notes are never searched.",
        inputSchema: { type: "object", properties: { query: S("Words to find") }, required: ["query"] },
        run: (a, p) => this.notesSearch(a.query, p) },
      { name: "query_wiki", annotations: READ, description: "Semantic search over the long-term wiki you can see (yours and the household's). Always returns the nearest notes, even off-topic ones: if they don't answer the question, say the wiki doesn't know.",
        inputSchema: { type: "object", properties: { query: S("Natural-language question") }, required: ["query"] },
        run: (a, p) => this.familyQueryWiki(a.query, p) },
      { name: "note_write", annotations: WRITE, description: "Create, overwrite or append to a note you may write (your own folders or household/). For Ingest and Capture; use the memory tools for logging. Sources in raw/ are never changed.",
        inputSchema: { type: "object", properties: { path: S("Path, e.g. 'wiki/1-projects/Sewing Quilt.md'"), content: S("Markdown"), mode: S("create (default: fails if it exists), overwrite or append", { enum: ["create", "overwrite", "append"] }) }, required: ["path", "content"] },
        run: (a, p) => this.noteWrite(a, p) },
    ];
    return tools;
  }

  relabel(text, p) {
    return String(text).replace(/(?:people\/[a-z][a-z0-9-]*|household)\/[^\n"]*?\.md/g, (m) => this.shown(m, p));
  }

  whoamiText(p) {
    const reg = this.registry();
    const lines = [`You are acting for: ${p.name} (${p.kind === "member" ? p.role : p.kind}, id ${p.id}).`];
    if (p.kind === "member") {
      lines.push("Your view of the vault: your own daily/, inbox/, raw/sources/ and wiki/ (PARA) at the root; household/ (shared with the family); schema/ (rules and templates, read only).");
      if (p.role === "admin") lines.push("As admin you also see people/<id>/ for every member. Don't bring one person's private notes into another's conversation.");
      lines.push("Notes at the root are about you; household/ is shared; anything about another person is theirs.");
    } else if (p.kind === "service") {
      lines.push("You write to the household's memory: daily/, inbox/ and raw/sources/ here are household/'s.");
    } else {
      lines.push("You are a shared agent: you help several family members. Name the person (or 'household') on every write; if you can't tell who you are talking to, ask. You can read household/ and what each member shares (family_members), never their private notes.");
    }
    lines.push("Switching between people? Call context_for with the person before answering them; file what was said with conversation_log.");
    lines.push(`Family: ${[...reg.members.values()].map((m) => `${m.name} (${m.id})`).join(", ") || "(no members yet)"}.`);
    lines.push("Rules: schema/agents.md. Write only short-term memory (memory_* tools); the long-term wiki is filed by Ingest. Never store secrets.");
    return lines.join("\n");
  }

  async familyMembersText() {
    const reg = this.registry();
    const out = [];
    for (const m of reg.members.values()) {
      const file = this.app.vault.getAbstractFileByPath(`people/${m.id}/profile.md`);
      const shared = file ? sectionText(await this.app.vault.read(file), "Shared with the family") : "";
      out.push(`## ${m.name} (id ${m.id}, ${m.role})`, `Goes by: ${[m.name, ...m.aliases].join(", ")}${m.voice.length ? `; Omi names: ${m.voice.join(", ")}` : ""}${m.omi_uid ? "; wears an Omi" : ""}`);
      if (shared) out.push(shared);
      out.push("");
    }
    return out.join("\n").trim() || "No family members yet (schema/family.md).";
  }

  async readCapped(path, max = MAX_CONTEXT_CHARS) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!f || f.children) return "";
    const t = String(await this.app.vault.read(f)).replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    return t.length > max ? `${t.slice(0, max)}\n[cut at ${max} characters]` : t;
  }

  /** One person's working context for an agent about to help them. */
  async contextFor(person, p) {
    const reg = this.registry();
    const day = ymd(new Date());
    let target = null;
    if (person && !isHousehold(person)) {
      const r = resolveMember(reg, person);
      if (r.error) throw new Error(r.error);
      target = r.member;
    } else if (!person && p.kind === "member") target = reg.members.get(p.id) || null;
    else if (!person && p.kind === "shared") throw new Error("Who are you helping? Pass person (a name or 'household'); ask if you can't tell.");
    const full = target && (p.role === "admin" || (p.kind === "member" && p.id === target.id));
    const out = [];
    if (target) {
      out.push(`# Context for ${target.name} (id ${target.id})`, "");
      const profile = `people/${target.id}/profile.md`;
      if (full) {
        out.push("## Profile", "", (await this.readCapped(profile)) || "(empty)", "");
        out.push(`## Today (${day})`, "", (await this.readCapped(`people/${target.id}/daily/${day}.md`)) || "(nothing logged yet)", "");
        const inbox = this.childrenOf(`people/${target.id}/inbox`).filter((n) => n.endsWith(".md"));
        if (inbox.length) out.push(`## Inbox (${inbox.length} waiting to be filed)`, "", ...inbox.slice(0, 20).map((n) => `- ${n}`), "");
      } else {
        const f = this.app.vault.getAbstractFileByPath(profile);
        const shared = f ? sectionText(await this.app.vault.read(f), "Shared with the family") : "";
        out.push("## What they share with the family", "", shared || "(nothing)", "", `Their private notes aren't yours to read. Write for them with person: "${target.name}".`, "");
      }
    } else out.push("# Context for the household", "");
    out.push(`## Household today (${day})`, "", (await this.readCapped(`household/daily/${day}.md`)) || "(nothing logged yet)");
    return this.relabel(out.join("\n"), p);
  }

  /**
   * File one conversation as a source in each speaker's own folder. Who may file where:
   * a member files into their own folder only (it's their recording); a shared agent or
   * the admin into every identified speaker's; a service into household/.
   */
  async conversationLog(a, p, { wearer } = {}) {
    const reg = this.registry();
    const segs = Array.isArray(a.segments) ? a.segments : [];
    if (a.overview != null && typeof a.overview !== "string") throw new Error("overview must be a string.");
    if (String(a.overview || "").length > MAX_OVERVIEW) throw new Error(`overview: at most ${MAX_OVERVIEW} characters.`);
    if (a.action_items != null && !Array.isArray(a.action_items)) throw new Error("action_items must be a list.");
    if ((a.action_items || []).length > MAX_ACTION_ITEMS) throw new Error(`At most ${MAX_ACTION_ITEMS} action items.`);
    if (a.people != null && !Array.isArray(a.people)) throw new Error("people must be a list of names.");
    const structured = renderStructured(a.overview, a.action_items);
    if (!segs.length && !structured) throw new Error("segments is empty: nothing to file.");
    if (segs.length > MAX_SEGMENTS) throw new Error(`At most ${MAX_SEGMENTS} segments per conversation.`);
    if (segs.some((x) => !x || typeof x !== "object" || typeof x.text !== "string")) throw new Error("Each segment needs text (a string).");
    let owner = wearer || null;
    if (!owner && a.wearer) {
      const r = resolveMember(reg, a.wearer);
      if (r.error) throw new Error(`wearer: ${r.error}`);
      owner = r.member;
    }
    if (!owner && p.kind === "member") owner = reg.members.get(p.id) || null;
    const turns = segs.map((seg) => ({ ...speakerOf(seg, reg, owner), text: seg.text }));
    const speakers = new Map(), unknown = new Set();
    for (const t of turns) {
      if (t.member) speakers.set(t.member.id, t.member);
      else if (String(t.text).trim()) unknown.add(t.label);
    }
    for (const name of a.people || []) {
      const r = resolveMember(reg, String(name));
      if (r.error) throw new Error(`people: ${r.error}`);
      speakers.set(r.member.id, r.member);
    }
    if (!segs.length && !speakers.size && owner) speakers.set(owner.id, owner);
    let roots;
    if (p.kind === "member" && p.role !== "admin") roots = [`people/${p.id}`];
    else if (p.kind === "service") roots = ["household"];
    else roots = [...speakers.keys()].map((id) => `people/${id}`);
    if (a.shared && p.kind !== "service") roots.push("household");
    roots = [...new Set(roots)];
    if (!roots.length) {
      throw new Error(`Nobody in this conversation is a known family member (${[...unknown].join(", ") || "no speakers named"}). Ask who was speaking and send it again with person on each line, or pass shared: true if it was a household conversation.`);
    }
    const transcript = renderTranscript(turns);
    const body = structured ? [structured, transcript ? `## Transcript\n\n${transcript}` : ""].filter(Boolean).join("\n\n") : transcript;
    this.checkText(body);
    const day = a.date || ymd(new Date());
    const title = safeTitle(`Conversation - ${a.title || "untitled"}${a.id ? ` (${String(a.id).replace(/[^A-Za-z0-9-]/g, "").slice(0, 8)})` : ""}`);
    const header = [
      `**Who spoke:** ${[...speakers.values()].map((m) => m.name).join(", ") || "nobody known"}${unknown.size ? ` · unknown: ${[...unknown].join(", ")}` : ""}`,
      `**From:** ${[a.source, p.kind === "shared" ? `via ${p.label}` : null, p.kind === "member" ? `${p.name}'s` : null].filter(Boolean).join(", ") || "unknown"}`,
      "",
      "",
    ].join("\n");
    const filed = [], already = [];
    for (const root of roots) {
      try {
        filed.push(await this.memoryAddSource({ title, content: header + body, date: day }, root));
      } catch (e) {
        if (a.id && /already exists/.test(e.message)) already.push(root);
        else throw e;
      }
    }
    const lines = [...filed];
    if (already.length) lines.push(`Already filed for ${already.join(", ")} (same conversation id): left as it was.`);
    lines.push(`Speakers: ${[...speakers.values()].map((m) => `${m.name} (${m.id})`).join(", ") || "none known"}.`);
    if (unknown.size) lines.push(`Unknown speakers: ${[...unknown].join(", ")}. Ask who they were; Omi can learn a voice when you name the speaker in its app.`);
    return { text: lines.join("\n"), filed: filed.length, already: already.length, speakers: [...speakers.keys()], unknown: [...unknown] };
  }

  async notesList(vpath, p) {
    const r = resolvePath(vpath, p);
    if (r.error) throw new Error(r.error);
    if (r.root) {
      const home = homeOf(p);
      const own = home ? this.childrenOf(home) : [];
      return JSON.stringify({ files: [...own, "household/", "schema/", ...(p.role === "admin" ? ["people/"] : [])] }, null, 2);
    }
    const folder = this.app.vault.getAbstractFileByPath(r.real);
    if (!folder || !folder.children) throw new Error(`No folder at ${vpath}.`);
    return JSON.stringify({ files: this.childrenOf(r.real) }, null, 2);
  }

  childrenOf(real) {
    const folder = this.app.vault.getAbstractFileByPath(real);
    return ((folder && folder.children) || [])
      .filter((c) => !c.name.startsWith("."))
      .map((c) => (c.children ? `${c.name}/` : c.name))
      .sort();
  }

  async noteRead(vpath, p) {
    const r = resolvePath(vpath, p);
    if (r.error) throw new Error(r.error);
    const file = !r.root && this.app.vault.getAbstractFileByPath(r.real);
    if (!file || file.children) throw new Error(`No note at ${vpath}.`);
    return this.app.vault.read(file);
  }

  async notesSearch(query, p) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) throw new Error("query is empty");
    const hits = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const v = toVirtual(f.path, p);
      if (v === null) continue;
      const text = await this.app.vault.cachedRead(f);
      const lower = text.toLowerCase();
      const at = lower.indexOf(q);
      if (at === -1) continue;
      let count = 0;
      for (let i = at; i !== -1; i = lower.indexOf(q, i + q.length)) count += 1;
      hits.push({ path: v, count, snippet: text.slice(Math.max(0, at - 80), at + q.length + 80).replace(/\s+/g, " ").trim() });
    }
    hits.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
    return hits.length ? JSON.stringify(hits.slice(0, 20), null, 2) : `Nothing you can see contains "${query}".`;
  }

  async familyQueryWiki(query, p) {
    const rest = this.app.plugins.plugins[REST_ID];
    const raw = await this.callSecondBrain(rest, "query_wiki", { query });
    return capQueryResult(filterQueryYaml(raw, (real) => toVirtual(real, p)));
  }

  async noteWrite({ path, content, mode }, p) {
    const r = resolvePath(path, p);
    if (r.error) throw new Error(r.error);
    if (r.root || !r.write) throw new Error(`${path} is read only for you.`);
    if (!/\.md$/.test(r.real)) throw new Error("Only .md notes can be written.");
    const op = mode || "create";
    const file = this.app.vault.getAbstractFileByPath(r.real);
    const why = guardFamilyWrite(op === "create" ? "create" : "change", r.real, !!file);
    if (why) throw new Error(why);
    if (findSecret(content)) throw new Error("That looks like a secret (rule 9), so nothing was written.");
    if (op === "create") {
      if (file) throw new Error(`${path} already exists; use mode overwrite or append.`);
      await this.ensureFolder(r.real);
      await this.app.vault.create(r.real, String(content));
      return `Created ${path}.`;
    }
    if (!file) throw new Error(`No note at ${path}; use mode create.`);
    if (op === "overwrite") await this.app.vault.modify(file, String(content));
    else await this.app.vault.process(file, (d) => `${d.replace(/\n*$/, "\n")}${String(content)}`);
    return `${op === "overwrite" ? "Overwrote" : "Appended to"} ${path}.`;
  }

  /** One MCP JSON-RPC message from a family principal -> the response, or null for a notification. */
  async handleFamilyRpc(msg, p) {
    const id = msg && msg.id !== undefined ? msg.id : null;
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
    if (!msg || typeof msg.method !== "string") return err(-32600, "not a JSON-RPC request");
    if (msg.id === undefined || msg.id === null) return null; // notifications/initialized and friends
    switch (msg.method) {
      case "initialize": {
        const asked = msg.params && msg.params.protocolVersion;
        return ok({
          protocolVersion: HANDSHAKE_VERSIONS.includes(asked) ? asked : HANDSHAKE_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "llmwiki-family", version: this.manifest.version || "0" },
          instructions: this.whoamiText(p),
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: this.familyTools().map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
      case "tools/call": {
        const name = msg.params && msg.params.name;
        const tool = this.familyTools().find((t) => t.name === name);
        if (!tool) return err(-32602, `Unknown tool: ${name}`);
        const args = (msg.params && msg.params.arguments) || {};
        const bad = checkArgs(tool.inputSchema, args);
        if (bad) return ok({ content: [{ type: "text", text: `${name}: ${bad}. Nothing was done.` }], isError: true });
        try {
          const text = await tool.run(args, p);
          return ok({ content: [{ type: "text", text: String(text) }] });
        } catch (e) {
          return ok({ content: [{ type: "text", text: e.message || String(e) }], isError: true });
        }
      }
      default:
        return err(-32601, `Method not found: ${msg.method}`);
    }
  }

  /* ---------------------------------------------------------------- family endpoint: HTTP */

  registerFamilyRoutes(rest) {
    const api = this.restApi || rest.getPublicApi(this.manifest);
    api.addPublicRoute("/family-mcp").all((req, res) => this.serveFamilyMcp(req, res).catch((e) => this.fail(res, 500, e)));
    api.addPublicRoute("/family").all((req, res) => this.serveFamilyRest(rest, req, res).catch((e) => this.fail(res, 500, e)));
    api.addPublicRoute("/family/*").all((req, res) => this.serveFamilyRest(rest, req, res).catch((e) => this.fail(res, 500, e)));
  }

  fail(res, status, e) {
    if (!res.headersSent) res.status(status).json({ errorCode: status, message: e && e.message ? e.message : String(e) });
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) reject(new Error("request body too large"));
        else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  async serveFamilyMcp(req, res) {
    const p = await this.authenticate(req.headers.authorization);
    if (!p) return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "A family token is required (Authorization: Bearer <token>)." } });
    if (req.method !== "POST") return res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "POST only: this MCP endpoint is stateless." } });
    let msg;
    try {
      msg = JSON.parse((await this.readBody(req)).toString("utf8"));
    } catch (e) {
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    if (Array.isArray(msg)) return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batching is not supported." } });
    const out = await this.handleFamilyRpc(msg, p);
    if (out === null) return res.status(202).end();
    return res.status(200).json(out);
  }

  /** The REST API with a per-person view: /family/vault/<path>, /family/search/simple/, /family/ (who am I). */
  async serveFamilyRest(rest, req, res) {
    let sub;
    try {
      sub = decodeURIComponent((req.path || "").replace(/^\/family/, "")) || "/";
    } catch (e) {
      return res.status(400).json({ errorCode: 400, message: "That URL isn't encoded properly." });
    }
    if (sub === "/conversation" || sub === "/conversation/") return this.serveConversation(req, res);
    const p = await this.authenticate(req.headers.authorization);
    if (!p) return res.status(401).json({ errorCode: 40101, message: "A family token is required (Authorization: Bearer <token>)." });
    if (sub === "/" && req.method === "GET") return res.json({ status: "OK", who: { id: p.id, name: p.name, kind: p.kind, role: p.role } });
    if (sub === "/search/simple/" || sub === "/search/simple") {
      if (req.method !== "POST") return res.status(405).end();
      const query = new URL(req.originalUrl || req.url, "http://x").search;
      const r = await this.restCall(rest, "POST", `/search/simple/${query}`, {}, undefined);
      if (r.status !== 200) return res.status(r.status).send(Buffer.from(r.arrayBuffer));
      const results = JSON.parse(r.text || "[]").flatMap((x) => {
        const v = toVirtual(x.filename, p);
        return v === null ? [] : [{ ...x, filename: v }];
      });
      return res.json(results);
    }
    const m = /^\/vault\/(.*)$/.exec(sub);
    if (!m) return res.status(404).json({ errorCode: 404, message: "Use /family/vault/<path> or /family/search/simple/." });
    const vpath = m[1];
    const resolved = resolvePath(vpath, p);
    if (resolved.error) return res.status(403).json({ errorCode: 403, message: resolved.error });
    const method = req.method.toUpperCase();
    if (resolved.root) {
      if (method !== "GET") return res.status(405).end();
      return res.type("application/json").send(await this.notesList("", p));
    }
    if (method !== "GET" && method !== "HEAD") {
      if (!resolved.write) return res.status(403).json({ errorCode: 403, message: `${vpath} is read only for you.` });
      const exists = !!this.app.vault.getAbstractFileByPath(resolved.real);
      const op = method === "PUT" ? (exists ? "change" : "create") : method === "PATCH" ? "patch" : method === "DELETE" ? "delete" : "change";
      const patch = { targetType: req.headers["target-type"], target: req.headers.target, operation: req.headers.operation };
      const why = guardFamilyWrite(op, resolved.real, exists, patch);
      if (why) return res.status(403).json({ errorCode: 403, message: why });
    }
    const headers = {};
    for (const h of PROXY_HEADERS) if (req.headers[h] !== undefined) headers[h] = req.headers[h];
    const body = method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : await this.readBody(req);
    const encoded = resolved.real.split("/").map(encodeURIComponent).join("/") + (vpath.endsWith("/") ? "/" : "");
    const r = await this.restCall(rest, method, `/vault/${encoded}`, headers, body);
    const type = (r.headers && (r.headers["content-type"] || r.headers["Content-Type"])) || "application/octet-stream";
    res.status(r.status).type(type);
    if (r.status === 204 || !r.arrayBuffer || !r.arrayBuffer.byteLength) return res.end();
    // Error messages from the REST API name the real path; show the person's own.
    if (r.status >= 400 && /json|text/.test(type)) return res.send(this.relabel(r.text, p));
    return res.send(Buffer.from(r.arrayBuffer));
  }

  /**
   * POST /family/conversation: a conversation from a home assistant frontend ({ title, segments, ... }
   * as conversation_log takes) or straight from Omi's "conversation created" webhook. Omi can't send
   * headers, so this one route also takes the token as ?key=; give each person's Omi app their own
   * key, and Omi's ?uid= is checked against that person's omi_uid.
   */
  async serveConversation(req, res) {
    if (req.method !== "POST") return res.status(405).set("Allow", "POST").end();
    const url = new URL(req.originalUrl || req.url, "http://x");
    const key = url.searchParams.get("key");
    const p = await this.authenticate(req.headers.authorization || (key ? `Bearer ${key}` : ""));
    if (!p) return res.status(401).json({ errorCode: 40101, message: "A family token is required (Authorization: Bearer <token>, or ?key= for Omi's webhook)." });
    let body;
    try {
      body = JSON.parse((await this.readBody(req)).toString("utf8"));
    } catch (e) {
      return res.status(400).json({ errorCode: 400, message: "The body must be JSON." });
    }
    const reg = this.registry();
    const uid = url.searchParams.get("uid");
    let wearer = null;
    if (uid) {
      const byUid = [...reg.members.values()].filter((m) => m.omi_uid && m.omi_uid === uid);
      if (p.kind === "member") {
        const me = reg.members.get(p.id);
        if (me && me.omi_uid && me.omi_uid !== uid) return res.status(403).json({ errorCode: 403, message: `This Omi account isn't ${me.name}'s: use the key of the person who wears it.` });
      } else if (byUid.length === 1) wearer = byUid[0];
    }
    let args = body;
    if (Array.isArray(body && body.transcript_segments)) {
      if (body.discarded || !body.transcript_segments.length) return res.json({ filed: 0, skipped: "Omi discarded this conversation or it has no words." });
      args = {
        title: (body.structured && body.structured.title) || "Omi conversation",
        overview: body.structured && typeof body.structured.overview === "string" ? body.structured.overview : undefined,
        action_items: body.structured && Array.isArray(body.structured.action_items) ? body.structured.action_items : undefined,
        date: /^\d{4}-\d{2}-\d{2}/.test(String(body.started_at || body.created_at || "")) ? String(body.started_at || body.created_at).slice(0, 10) : undefined,
        id: body.id ? String(body.id) : undefined,
        source: "omi",
        segments: body.transcript_segments.map((x) => ({ text: String((x && x.text) || ""), speaker: x && (x.speaker_name || x.speaker), is_user: !!(x && x.is_user), person_id: x && x.person_id ? String(x.person_id) : undefined })),
      };
    }
    try {
      const r = await this.conversationLog(args || {}, p, { wearer });
      return res.json({ filed: r.filed, already: r.already, speakers: r.speakers, unknown: r.unknown, message: this.relabel(r.text, p) });
    } catch (e) {
      return res.status(422).json({ errorCode: 422, message: this.relabel(e.message || String(e), p) });
    }
  }

  /** One request to the REST API itself, over loopback with its master key. */
  async restCall(rest, method, path, headers, body) {
    const port = (rest.settings && rest.settings.insecurePort) || 27123;
    return requestUrl({
      url: `http://127.0.0.1:${port}${path}`,
      method,
      headers: { ...headers, Authorization: `Bearer ${rest.settings && rest.settings.apiKey}` },
      body: body && body.length ? body.buffer.slice(body.byteOffset, body.byteOffset + body.length) : undefined,
      throw: false,
    });
  }

  async callSecondBrain(rest, name, args) {
    if (!this.app.plugins.plugins[SECOND_BRAIN_ID]) {
      throw new Error("the Second Brain extension is not enabled, so semantic search is unavailable");
    }
    const resp = await this.restCall(rest, "POST", "/second-brain-mcp/", {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }, Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })));
    let text = resp.text || "";
    // the endpoint may answer as SSE; unwrap the final data: frame
    if (/^(event:|data:)/m.test(text)) {
      const frames = text.split("\n").filter((l) => l.startsWith("data:"));
      if (frames.length) text = frames[frames.length - 1].slice(5).trim();
    }
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      throw new Error("Second Brain endpoint returned an unreadable response (HTTP " + resp.status + ")");
    }
    if (msg.error) {
      throw new Error(msg.error.message || "Second Brain returned an error");
    }
    const content = (msg.result && msg.result.content) || [];
    const out = content.map((c) => c.text || "").join("\n");
    return out || JSON.stringify(msg.result);
  }

  onunload() {
    for (const restore of this.restoreGuards || []) restore();
    if (this.restApi) {
      try {
        this.restApi.unregister();
      } catch (e) {
        /* parent may already be unloaded */
      }
    }
  }
}

module.exports = LlmwikiMcpBridge;
module.exports.helpers = {
  normPath, safeTitle, findSecret, fillTemplate, insertUnderHeading, guardRaw, capQueryResult, ymd, rolloverText,
  dailyStatus, decodeJsonContent, sectionText, isRaw, normalizeRegistry, whoIs, principalFor, homeOf, resolvePath,
  membersMatching, resolveMember, isGenericSpeaker, speakerOf, renderTranscript, renderStructured,
  toVirtual, guardFamilyWrite, filterQueryYaml, checkArgs,
};
