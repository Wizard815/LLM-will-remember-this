const crypto = require("node:crypto");
const Module = require("node:module");
const REPO = require("node:path").join(__dirname, "../..");
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) { return r === "obsidian" ? "obsidian" : realResolve.call(this, r, ...rest); };
require.cache.obsidian = { id: "obsidian", filename: "obsidian", loaded: true,
  exports: { Plugin: class { constructor(app, manifest) { this.app = app; this.manifest = manifest; } registerInterval() {} }, Notice: class {}, requestUrl: async () => ({}) } };
const Bridge = require(`${REPO}/.obsidian/plugins/llmwiki-mcp-bridge/main.js`);
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

function fakeVault(files) {
  const store = new Map(Object.entries(files));
  const isFolder = (p) => [...store.keys()].some((k) => k.startsWith(`${p}/`));
  return {
    store,
    getAbstractFileByPath: (p) => (store.has(p) ? { path: p, name: p.split("/").pop() } : isFolder(p) ? { path: p, name: p.split("/").pop(), children: [] } : null),
    read: async (f) => store.get(f.path), cachedRead: async (f) => store.get(f.path),
    create: async (p, d) => { store.set(p, d); return { path: p }; }, modify: async (f, d) => { store.set(f.path, d); },
    process: async (f, fn) => { store.set(f.path, fn(store.get(f.path))); }, createFolder: async () => {},
    getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map((p) => ({ path: p })),
  };
}
const TOKENS = {
  wizard: { kind: "member", id: "wizard" }, "wizard-faith": { kind: "member", id: "wizard", as: "member" },
  sam: { kind: "member", id: "sam" }, robin: { kind: "member", id: "robin" },
  house: { kind: "shared", id: "house-assistant" }, tablebot: { kind: "shared", id: "table-bot" },
  um: { kind: "service", id: "upstream-manager" }, master: { kind: "master", id: "master" },
};
function makePlugin(files, family) {
  const vault = fakeVault(files);
  const app = { vault, plugins: { plugins: {} }, metadataCache: { getFileCache: (f) => (f.path === "schema/family.md" ? { frontmatter: family } : null) } };
  vault.store.set("schema/family.md", "---\n(family)\n---\n");
  const plugin = new Bridge(app, { id: "llmwiki-mcp-bridge", version: "demo" });
  plugin.loadData = async () => ({ tokens: Object.entries(TOKENS).map(([t, r]) => ({ hash: hash(`t-${t}`), ...r })) });
  const rpc = async (who, msg) => plugin.handleFamilyRpc(msg, await plugin.authenticate(`Bearer t-${who}`));
  const call = async (who, name, args = {}) => {
    const out = await rpc(who, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    if (out.error) return { text: out.error.message, error: true };
    return { text: out.result.content[0].text, error: !!out.result.isError };
  };
  return { plugin, vault, call, rpc, Bridge };
}
module.exports = { makePlugin, Bridge, TOKENS };
