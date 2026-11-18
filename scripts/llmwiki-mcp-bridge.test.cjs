// Tests for .obsidian/plugins/llmwiki-mcp-bridge/main.js, run with: node --test scripts/llmwiki-mcp-bridge.test.cjs
// Obsidian itself is not available, so the plugin runs against an in-memory vault and a
// stand-in for the Local REST API plugin's MCP handler.
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

// The plugin requires "obsidian"; give it the three things it uses.
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian";
  return realResolve.call(this, request, ...rest);
};
require.cache.obsidian = {
  id: "obsidian", filename: "obsidian", loaded: true,
  exports: { Plugin: class { constructor(app, manifest) { this.app = app; this.manifest = manifest; } registerInterval() {} }, Notice: class {}, requestUrl: async () => ({}) },
};
const Bridge = require(path.join(__dirname, "../.obsidian/plugins/llmwiki-mcp-bridge/main.js"));
const { insertUnderHeading, guardRaw, safeTitle, findSecret, capQueryResult, fillTemplate, ymd, rolloverText, dailyStatus, decodeJsonContent } = Bridge.helpers;

const DAILY_TEMPLATE = "---\ntitle: \"{{date}}\"\ntype: daily\n---\n\n# {{date}}\n\n## Worked on\n\n- \n\n## Decisions / facts worth keeping\n\n- \n\n## Follow-ups\n\n- \n";

function fakeVault(files) {
  const store = new Map(Object.entries(files));
  const file = (p) => (store.has(p) ? { path: p } : null);
  return {
    store,
    getAbstractFileByPath: file,
    read: async (f) => store.get(f.path),
    create: async (p, data) => { if (store.has(p)) throw new Error("exists"); store.set(p, data); return { path: p }; },
    process: async (f, fn) => { store.set(f.path, fn(store.get(f.path))); },
    createFolder: async () => {},
    getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map((p) => ({ path: p })),
    trash: async (f) => { store.delete(f.path); store.set(`.trash/${f.path.split("/").pop()}`, "trashed"); },
  };
}

/** The plugin, registered against a stand-in REST plugin; returns its tools and the guarded built-ins. */
function setup(files = {}) {
  const zStr = { _def: { typeName: "ZodString" }, describe() { return this; }, optional() { return this; } };
  const tools = new Map();
  const builtIn = new Map(["vault_write", "vault_append", "vault_patch", "vault_delete", "vault_move"].map((n) =>
    [n, { name: n, schema: { path: zStr }, callback: async (args) => (n === "vault_patch" ? { ran: n, content: args.content } : `${n} ran`) }]));
  const rest = {
    requestHandler: { mcpHandler: { toolSpecs: builtIn } },
    getPublicApi: () => ({ addMcpTool: (name, d, schema, cb) => tools.set(name, { d, schema, cb }), unregister() {} }),
    settings: {},
  };
  const vault = fakeVault({ "schema/templates/DAILY.md": DAILY_TEMPLATE, ...files });
  const app = {
    vault, plugins: { plugins: {} },
    metadataCache: { getFileCache: () => null },
    internalPlugins: { getPluginById: () => ({ instance: { options: { folder: "daily", template: "schema/templates/DAILY", format: "YYYY-MM-DD" } } }) },
  };
  const plugin = new Bridge(app, { id: "llmwiki-mcp-bridge" });
  plugin.restoreGuards = [];
  plugin.registerTools(rest);
  plugin.guardBuiltInTools(rest);
  const call = (name, args) => tools.get(name).cb(args);
  const builtin = (name, args) => builtIn.get(name).callback(args);
  return { tools, call, builtin, vault, plugin };
}

test("insertUnderHeading fills the template's empty bullet, then appends after it", () => {
  let t = fillTemplate(DAILY_TEMPLATE, new Date(2026, 10, 14));
  t = insertUnderHeading(t, "Worked on", "first");
  t = insertUnderHeading(t, "Worked on", "second");
  t = insertUnderHeading(t, "Follow-ups", "later");
  assert.match(t, /## Worked on\n\n- first\n- second\n\n## Decisions/);
  assert.match(t, /## Follow-ups\n\n- later\n?$/);
  assert.match(insertUnderHeading("# x\n", "Worked on", "a"), /## Worked on\n\n- a\n$/);
  assert.match(insertUnderHeading("## Follow-ups\n\n- \n", "Worked on", "a"), /## Follow-ups\n\n- \n\n## Worked on\n\n- a\n$/);
});

test("guardRaw keeps existing raw/ sources unchanged but lets Ingest mark status and Rollover add new ones", () => {
  const exists = (p) => p === "raw/sources/a.md";
  assert.match(guardRaw("vault_write", { path: "raw/sources/a.md" }, exists), /rule 1/);
  assert.equal(guardRaw("vault_write", { path: "raw/sources/new.md" }, exists), null);
  assert.match(guardRaw("vault_append", { path: "/raw/sources/a.md" }, exists), /rule 1/);
  assert.match(guardRaw("vault_delete", { path: "raw/sources/a.md" }, exists), /rule 1/);
  assert.match(guardRaw("vault_move", { path: "raw/sources/a.md", destination: "x.md" }, exists), /out of/);
  assert.equal(guardRaw("vault_move", { path: "daily/2026-11-13.md", destination: "raw/sources/2026-11-13 - Daily Note.md" }, exists), null);
  assert.match(guardRaw("vault_move", { path: "daily/x.md", destination: "raw/sources/a.md", allowOverwrite: true }, exists), /rule 1/);
  assert.equal(guardRaw("vault_patch", { path: "raw/sources/a.md", targetType: "frontmatter", target: "status", operation: "replace" }, exists), null);
  assert.match(guardRaw("vault_patch", { path: "raw/sources/a.md", targetType: "heading", target: "x", operation: "append" }, exists), /rule 1/);
  assert.equal(guardRaw("vault_write", { path: "wiki/3-resources/RaidLab.md" }, exists), null);
});

test("helpers: titles, secrets, query cap", () => {
  assert.equal(safeTitle(" a/b: c?\nd "), "a b c d");
  assert.ok(findSecret("token: abcdef123456"));
  assert.ok(findSecret("key sk-abcdefghijklmnopqrstuvwxyz"));
  assert.equal(findSecret("Merged upstream into omi-local"), null);
  assert.equal(capQueryResult("short"), "short");
  assert.match(capQueryResult("x".repeat(70000)), /cut at 60000 of 70000 characters/);
});

test("memory_log creates today's daily note from the template and logs under the right heading", async () => {
  const { call, vault } = setup();
  const day = ymd(new Date());
  assert.match(await call("memory_log", { text: "Fixed the Orb MCP", source: "claude" }), new RegExp(`daily/${day}.md`));
  await call("memory_log", { text: "Use Argos /v1 everywhere", section: "decisions" });
  const note = vault.store.get(`daily/${day}.md`);
  assert.match(note, new RegExp(`title: "${day}"`));
  assert.match(note, /## Worked on\n\n- Fixed the Orb MCP \(claude\)\n/);
  assert.match(note, /## Decisions \/ facts worth keeping\n\n- Use Argos \/v1 everywhere\n/);
  await assert.rejects(call("memory_log", { text: "x", section: "misc" }), /section must be one of/);
  await assert.rejects(call("memory_log", { text: "  " }), /empty/);
  await assert.rejects(call("memory_log", { text: "api_key=abcdef0123456789" }), /secret/);
});

test("memory_capture and memory_add_source never overwrite", async () => {
  const { call, vault } = setup();
  const a = await call("memory_capture", { title: "Idea: orb/wiki", content: "body" });
  const b = await call("memory_capture", { title: "Idea: orb/wiki", content: "body" });
  assert.notEqual(a, b);
  const day = ymd(new Date());
  assert.match(await call("memory_add_source", { title: "Omi day", content: "transcript", date: "2026-11-13" }), /raw\/sources\/2026-11-13 - Omi day.md/);
  assert.match(vault.store.get("raw/sources/2026-11-13 - Omi day.md"), /status: unprocessed[\s\S]*# Omi day\n\ntranscript/);
  await assert.rejects(call("memory_add_source", { title: "Omi day", content: "again", date: "2026-11-13" }), /never overwritten/);
  await assert.rejects(call("memory_add_source", { title: "x", content: "y", date: "yesterday" }), /YYYY-MM-DD/);
  assert.ok([...vault.store.keys()].some((k) => k.startsWith(`inbox/${day}`)));
});

test("built-in write tools are guarded on raw/ and untouched elsewhere", async () => {
  const { builtin, plugin } = setup({ "raw/sources/a.md": "---\nstatus: unprocessed\n---\n" });
  await assert.rejects(builtin("vault_write", { path: "raw/sources/a.md", content: "x" }), /rule 1/);
  await assert.rejects(builtin("vault_delete", { path: "raw/sources/a.md" }), /rule 1/);
  assert.equal(await builtin("vault_write", { path: "wiki/x.md", content: "x" }), "vault_write ran");
  assert.equal((await builtin("vault_patch", { path: "raw/sources/a.md", targetType: "frontmatter", target: "status", operation: "replace" })).ran, "vault_patch");
  plugin.onunload();
  assert.equal(await builtin("vault_delete", { path: "raw/sources/a.md" }), "vault_delete ran", "unload restores the originals");
});

test("query_wiki says what it searches and how to treat a miss", () => {
  const { tools } = setup();
  assert.match(tools.get("query_wiki").d, /daily\/, inbox\/ and raw\/ are not searched/);
  assert.match(tools.get("query_wiki").d, /say the wiki doesn't know/);
  assert.deepEqual([...tools.keys()].sort(), ["get_wiki", "memory_add_source", "memory_capture", "memory_log", "memory_rollover", "query_wiki", "wiki_card"]);
});

test("rolloverText swaps the daily front matter for the Source schema and keeps the body", () => {
  const out = rolloverText("---\ntitle: \"2026-11-14\"\ntype: daily\ntags: [daily]\ncreated: 2026-11-14\nstatus: open\n---\n\n# 2026-11-14\n\n## Worked on\n\n- a\n", "2026-11-14", "2026-11-16");
  assert.equal(out, "---\ntitle: \"2026-11-14 - Daily Note\"\ntype: source\ntags: [source]\ncreated: 2026-11-14\nupdated: 2026-11-16\nstatus: unprocessed\n---\n\n# 2026-11-14\n\n## Worked on\n\n- a\n");
  assert.equal(dailyStatus("---\nstatus: open\n---\n"), "open");
  assert.equal(dailyStatus("---\nstatus: rolled-over\n---\n"), "rolled-over");
  assert.equal(dailyStatus("no front matter"), "open");
});

test("memory_rollover files every open note before today, once, and never today's", async () => {
  const today = ymd(new Date());
  const note = (d, status = "open") => `---\ntitle: "${d}"\ntype: daily\ncreated: ${d}\nstatus: ${status}\n---\n\n# ${d}\n\n## Worked on\n\n- did ${d}\n`;
  const { call, vault } = setup({
    "daily/2026-11-13.md": note("2026-11-13"),
    "daily/2026-11-14.md": note("2026-11-14", "rolled-over"),
    "daily/2026-11-15.md": note("2026-11-15"),
    "raw/sources/2026-11-15 - Daily Note.md": "already filed",
    [`daily/${today}.md`]: note(today),
  });
  const out = await call("memory_rollover", {});
  assert.match(out, /daily\/2026-11-13.md: filed as raw\/sources\/2026-11-13 - Daily Note.md/);
  assert.match(out, /daily\/2026-11-14.md: skipped \(status rolled-over\)/);
  assert.match(out, /daily\/2026-11-15.md: skipped \(raw\/sources\/2026-11-15 - Daily Note.md already exists/);
  assert.match(vault.store.get("raw/sources/2026-11-13 - Daily Note.md"), /type: source[\s\S]*status: unprocessed[\s\S]*- did 2026-11-13/);
  assert.ok(!vault.store.has("daily/2026-11-13.md") && vault.store.has(".trash/2026-11-13.md"), "the daily note goes to .trash");
  assert.ok(vault.store.has(`daily/${today}.md`), "today's note stays");
  assert.equal(vault.store.get("raw/sources/2026-11-15 - Daily Note.md"), "already filed");
  assert.match(await call("memory_rollover", {}), /2026-11-14.md: skipped/);
  await assert.rejects(call("memory_rollover", { day: today }), /before today/);
});

test("vault_patch decodes a JSON-encoded front-matter value instead of storing it in quotes", async () => {
  assert.equal(decodeJsonContent({ targetType: "frontmatter", contentType: "application/json", content: '"processed"' }).content, "processed");
  assert.deepEqual(decodeJsonContent({ targetType: "frontmatter", contentType: "application/json", content: '["source"]' }).content, ["source"]);
  assert.equal(decodeJsonContent({ targetType: "frontmatter", contentType: "application/json", content: "plain words" }).content, "plain words");
  assert.equal(decodeJsonContent({ targetType: "heading", contentType: "application/json", content: '"x"' }).content, '"x"');
  const { builtin } = setup({ "raw/sources/a.md": "---\nstatus: unprocessed\n---\n" });
  const r = await builtin("vault_patch", { path: "raw/sources/a.md", targetType: "frontmatter", target: "status", operation: "replace", contentType: "application/json", content: '"processed"' });
  assert.equal(r.content, "processed");
});
