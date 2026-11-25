// A fake Obsidian vault with a two-person family, for the family tests.
const crypto = require("node:crypto");
const Module = require("node:module");
const path = require("node:path");

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
const { ymd } = Bridge.helpers;

const FAMILY = {
  members: [
    { id: "wizard", name: "Wizard", role: "admin", aliases: ["Wiz"], voice: [], omi_uid: "omi-uid-wizard", omi_people: ["p-wiz-on-sams-omi"] },
    { id: "sam", name: "Sam", role: "member", aliases: ["Samantha"], voice: ["Sammy"], omi_uid: "omi-uid-sam", omi_people: ["p-sam-on-wizards-omi"] },
  ],
  services: [{ id: "upstream-manager", name: "Upstream Manager" }],
  shared_agents: [{ id: "house-assistant", name: "House assistant" }],
};
const DAILY = "---\ntitle: \"{{date}}\"\ntype: daily\nstatus: open\n---\n\n# {{date}}\n\n## Worked on\n\n- \n\n## Decisions / facts worth keeping\n\n- \n\n## Follow-ups\n\n- \n";
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

function fakeVault(files) {
  const store = new Map(Object.entries(files));
  const isFolder = (p) => [...store.keys()].some((k) => k.startsWith(`${p}/`));
  const children = (p) => {
    const names = new Set();
    for (const k of store.keys()) if (k.startsWith(`${p}/`)) names.add(k.slice(p.length + 1).split("/")[0]);
    return [...names].map((n) => (isFolder(`${p}/${n}`) ? { name: n, path: `${p}/${n}`, children: [] } : { name: n, path: `${p}/${n}` }));
  };
  return {
    store,
    getAbstractFileByPath: (p) => (store.has(p) ? { path: p, name: p.split("/").pop() } : isFolder(p) ? { path: p, name: p.split("/").pop(), children: children(p) } : null),
    read: async (f) => store.get(f.path),
    cachedRead: async (f) => store.get(f.path),
    create: async (p, data) => { if (store.has(p)) throw new Error("exists"); store.set(p, data); return { path: p }; },
    modify: async (f, data) => { store.set(f.path, data); },
    process: async (f, fn) => { store.set(f.path, fn(store.get(f.path))); },
    createFolder: async () => {},
    getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map((p) => ({ path: p })),
    trash: async (f) => { store.delete(f.path); },
  };
}

function setup(extra = {}, family = FAMILY) {
  const vault = fakeVault({
    "schema/family.md": "---\n(family)\n---\n",
    "schema/templates/DAILY.md": DAILY,
    "people/wizard/profile.md": "# Wizard\n\n## Shared with the family\n\nRuns the homelab.\n\n## Private\n\nsecret-ish hobby\n",
    "people/wizard/wiki/1-projects/MD1200 Cage Divider.md": "---\ntype: project\n---\nPrint the divider in PETG.\n",
    "people/sam/profile.md": "# Sam\n\n## Shared with the family\n\nSews; planning the wedding quilt.\n",
    "people/sam/wiki/1-projects/Wedding Quilt.md": "---\ntype: project\n---\nSewing the wedding quilt: cut PETG? no, cotton.\n",
    "household/wiki/3-resources/RaidLab.md": "RaidLab has two MI50 GPUs. PETG spool shelf.\n",
    "people/sam/raw/sources/2026-11-01 - Fabric list.md": "---\nstatus: unprocessed\n---\nlinen\n",
    ...extra,
  });
  const tokens = [
    { hash: hash("t-wizard"), kind: "member", id: "wizard" },
    { hash: hash("t-wizard-faith"), kind: "member", id: "wizard", as: "member", label: "faith" },
    { hash: hash("t-sam"), kind: "member", id: "sam" },
    { hash: hash("t-um"), kind: "service", id: "upstream-manager" },
    { hash: hash("t-house"), kind: "shared", id: "house-assistant" },
    { hash: hash("t-gone"), kind: "member", id: "former" },
    { hash: hash("t-robin"), kind: "member", id: "robin" },
    { hash: hash("t-parents"), kind: "shared", id: "faith-parents" },
    { hash: hash("t-master"), kind: "master", id: "master", label: "backups" },
  ];
  const app = {
    vault, plugins: { plugins: {} },
    metadataCache: { getFileCache: (f) => (f.path === "schema/family.md" && family ? { frontmatter: family } : null) },
  };
  const plugin = new Bridge(app, { id: "llmwiki-mcp-bridge", version: "test" });
  plugin.loadData = async () => ({ tokens });
  const as = async (token) => plugin.authenticate(`Bearer ${token}`);
  const call = async (token, name, args = {}) => {
    const p = await as(token);
    const out = await plugin.handleFamilyRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, p);
    return { text: out.result.content[0].text, error: !!out.result.isError };
  };
  const rpc = async (token, msg) => plugin.handleFamilyRpc(msg, await as(token));
  return { vault, plugin, as, call, rpc };
}


module.exports = { setup, FAMILY, Bridge, hash, ymd, DAILY };
