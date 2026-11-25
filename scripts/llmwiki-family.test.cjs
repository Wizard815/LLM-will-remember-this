// Family layer of .obsidian/plugins/llmwiki-mcp-bridge/main.js: who is who, private folders, shared agents.
// Run with: node --test scripts/llmwiki-family.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, FAMILY, Bridge, hash, ymd } = require("./family-harness.cjs");
const { resolvePath, toVirtual, filterQueryYaml, normalizeRegistry, whoIs, checkArgs, guardFamilyWrite } = Bridge.helpers;

const REG = normalizeRegistry(FAMILY);
const P = {
  wizard: { kind: "member", id: "wizard", role: "admin", name: "Wizard" },
  sam: { kind: "member", id: "sam", role: "member", name: "Sam" },
  um: { kind: "service", id: "upstream-manager", role: "service", name: "Upstream Manager" },
  house: { kind: "shared", id: "house-assistant", role: "shared", name: "House assistant" },
};

test("each person sees their own folder as the root, household/ shared, schema/ read only", () => {
  assert.deepEqual(resolvePath("wiki/1-projects/Wedding Quilt.md", P.sam), { real: "people/sam/wiki/1-projects/Wedding Quilt.md", write: true });
  assert.deepEqual(resolvePath("household/wiki/x.md", P.sam), { real: "household/wiki/x.md", write: true });
  assert.deepEqual(resolvePath("schema/agents.md", P.sam), { real: "schema/agents.md", write: false });
  assert.match(resolvePath("people/wizard/profile.md", P.sam).error, /another family member/);
  assert.equal(resolvePath("people/sam/profile.md", P.wizard).real, "people/sam/profile.md", "the admin sees everyone");
  assert.equal(resolvePath("daily/x.md", P.um).real, "household/daily/x.md", "a service lives in household/");
  assert.match(resolvePath("daily/x.md", P.house).error, /shared agent has no folder/);
  assert.equal(resolvePath("household/wiki/x.md", P.house).write, false, "a shared agent reads household/ but writes only through the memory tools");
  for (const bad of ["../people/wizard/profile.md", "wiki/../../people/wizard/x.md", ".obsidian/plugins/x", "household/.trash/x.md"]) {
    assert.ok(resolvePath(bad, P.sam).error, bad);
  }
});

test("results are shown at the paths each person knows, and other people's are hidden", () => {
  assert.equal(toVirtual("people/sam/wiki/1-projects/Wedding Quilt.md", P.sam), "wiki/1-projects/Wedding Quilt.md");
  assert.equal(toVirtual("people/wizard/wiki/1-projects/MD1200 Cage Divider.md", P.sam), null);
  assert.equal(toVirtual("household/wiki/3-resources/RaidLab.md", P.sam), "household/wiki/3-resources/RaidLab.md");
  assert.equal(toVirtual("people/sam/profile.md", P.wizard), "people/sam/profile.md");
  assert.equal(toVirtual("household/daily/2026-11-16.md", P.um), "daily/2026-11-16.md");
  assert.equal(toVirtual("people/sam/x.md", P.house), null);
});

test("who_is matches names, aliases, Omi person names and ids", () => {
  assert.equal(whoIs(REG, "samantha").id, "sam");
  assert.equal(whoIs(REG, "Sammy").id, "sam", "the name Omi knows her by");
  assert.equal(whoIs(REG, "p-wiz-on-sams-omi").id, "wizard", "the Omi person id Sam's app gave him");
  assert.equal(whoIs(REG, "Bob"), null);
});

test("query_wiki answers keep only notes (and linked notes) the person may read", () => {
  const yaml = [
    "- path: household/wiki/3-resources/RaidLab.md",
    "  content: |",
    "    RaidLab has two MI50 GPUs.",
    "  connections:",
    "    - path: people/wizard/wiki/1-projects/MD1200 Cage Divider.md",
    "      content: |",
    "        Wizard's private project",
    "    - path: people/sam/wiki/1-projects/Wedding Quilt.md",
    "      content: |",
    "        Sam's quilt",
    "- path: people/wizard/wiki/1-projects/MD1200 Cage Divider.md",
    "  content: |",
    "    Wizard's private project",
    "# Diagnostic Logs:",
    "# - matched people/wizard/wiki/1-projects/MD1200 Cage Divider.md",
  ].join("\n");
  const out = filterQueryYaml(yaml, (r) => toVirtual(r, P.sam));
  assert.match(out, /^- path: household\/wiki\/3-resources\/RaidLab.md/);
  assert.match(out, /    - path: wiki\/1-projects\/Wedding Quilt.md\n        Sam's quilt|    - path: wiki\/1-projects\/Wedding Quilt.md\n      content: \|\n        Sam's quilt/);
  assert.doesNotMatch(out, /MD1200|Wizard's private|Diagnostic/);
  assert.equal(filterQueryYaml("- path: people/wizard/x.md\n  content: |\n    hi\n", (r) => toVirtual(r, P.sam)), "# No matching notes you can read\n");
});

test("tokens: only the sha-256 is stored; unknown or removed people get nothing", async () => {
  const { as } = setup();
  assert.equal((await as("t-sam")).id, "sam");
  assert.equal((await as("t-house")).kind, "shared");
  assert.equal(await as("t-nope"), null);
  assert.equal(await as("t-gone"), null, "a token whose person left schema/family.md stops working");
});

test("a member's memory lands in their own daily note; they can't write someone else's", async () => {
  const { call, vault } = setup();
  const day = ymd(new Date());
  const r = await call("t-sam", "memory_log", { text: "Cut the quilt squares", source: "sam-phone" });
  assert.equal(r.text, `Logged in daily/${day}.md under "Worked on".`, "shown at her own path");
  assert.match(vault.store.get(`people/sam/daily/${day}.md`), /- Cut the quilt squares \(sam-phone\)/);
  assert.match((await call("t-sam", "memory_log", { text: "Ordered thread", person: "household" })).text, /household\/daily/);
  const other = await call("t-sam", "memory_log", { text: "x", person: "Wizard" });
  assert.ok(other.error); assert.match(other.text, /not Wizard's/);
  assert.equal(vault.store.has(`people/wizard/daily/${day}.md`), false);
});

test("a shared agent must say who; it asks when it can't tell", async () => {
  const { call, vault } = setup();
  const day = ymd(new Date());
  const anon = await call("t-house", "memory_log", { text: "Fed the cat" });
  assert.ok(anon.error); assert.match(anon.text, /Who is this for\?.*Wizard, Sam/);
  const unknown = await call("t-house", "memory_log", { text: "Fed the cat", person: "Bob" });
  assert.ok(unknown.error); assert.match(unknown.text, /isn't in the family. Ask who this is/);
  await call("t-house", "memory_log", { text: "Asked to buy linen", person: "Sammy" });
  assert.match(vault.store.get(`people/sam/daily/${day}.md`), /- Asked to buy linen \(via House assistant\)/);
  const read = await call("t-house", "note_read", { path: "people/sam/wiki/1-projects/Wedding Quilt.md" });
  assert.ok(read.error, "a shared agent writes for people but can't read their private notes");
});

test("privacy: search, read and list never reach another member's notes", async () => {
  const { call } = setup();
  const samSearch = await call("t-sam", "notes_search", { query: "PETG" });
  assert.match(samSearch.text, /Wedding Quilt.md/); assert.match(samSearch.text, /household\/wiki\/3-resources\/RaidLab.md/);
  assert.doesNotMatch(samSearch.text, /MD1200/);
  const read = await call("t-sam", "note_read", { path: "people/wizard/wiki/1-projects/MD1200 Cage Divider.md" });
  assert.ok(read.error);
  assert.match((await call("t-wizard", "note_read", { path: "people/sam/wiki/1-projects/Wedding Quilt.md" })).text, /quilt/, "the admin can");
  const root = JSON.parse((await call("t-sam", "notes_list", { path: "" })).text).files;
  assert.deepEqual(root, ["profile.md", "raw/", "wiki/", "household/", "schema/"]);
  assert.ok(JSON.parse((await call("t-wizard", "notes_list", { path: "" })).text).files.includes("people/"));
});

test("family_members shares each profile's family section, not the rest", async () => {
  const { call } = setup();
  const r = await call("t-house", "family_members");
  assert.match(r.text, /## Sam \(id sam, member\)\nGoes by: Sam, Samantha; Omi names: Sammy; wears an Omi\nSews; planning the wedding quilt./);
  assert.doesNotMatch(r.text, /secret-ish hobby/);
});

test("note_write: own and household notes yes, sources never changed, schema read only, no secrets", async () => {
  const { call, vault } = setup();
  assert.match((await call("t-sam", "note_write", { path: "wiki/2-areas/Sewing.md", content: "# Sewing\n" })).text, /Created/);
  assert.equal(vault.store.get("people/sam/wiki/2-areas/Sewing.md"), "# Sewing\n");
  assert.ok((await call("t-sam", "note_write", { path: "raw/sources/2026-11-01 - Fabric list.md", content: "x", mode: "overwrite" })).error);
  assert.ok((await call("t-sam", "note_write", { path: "schema/agents.md", content: "x" })).error);
  assert.ok((await call("t-sam", "note_write", { path: "wiki/x.md", content: "api_key=abcdef123456" })).error);
  assert.ok((await call("t-sam", "note_write", { path: "wiki/x.md", content: "x", mode: "replace" })).error, "bad enum refused");
});

test("rollover: a member files their own days, the admin everyone's, a service the household's", async () => {
  const note = (d) => `---\ntype: daily\nstatus: open\n---\n# ${d}\n`;
  const { call, vault } = setup({ "people/sam/daily/2026-11-10.md": note("s"), "people/wizard/daily/2026-11-10.md": note("w"), "household/daily/2026-11-10.md": note("h") });
  assert.match((await call("t-sam", "memory_rollover")).text, /^daily\/2026-11-10.md: filed as raw\/sources\/2026-11-10 - Daily Note.md/);
  assert.ok(vault.store.has("people/wizard/daily/2026-11-10.md"), "Sam's rollover leaves Wizard's notes alone");
  assert.match((await call("t-um", "memory_rollover")).text, /filed/);
  assert.ok(vault.store.has("household/raw/sources/2026-11-10 - Daily Note.md"));
  assert.match((await call("t-wizard", "memory_rollover")).text, /people\/wizard|daily\/2026-11-10.md: filed/);
  assert.ok(vault.store.has("people/wizard/raw/sources/2026-11-10 - Daily Note.md"));
  assert.ok((await call("t-house", "memory_rollover")).error);
});

test("the MCP handshake: initialize names who you are; unknown arguments are refused", async () => {
  const { plugin, as } = setup();
  const p = await as("t-sam");
  const init = await plugin.handleFamilyRpc({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } }, p);
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.match(init.result.instructions, /You are acting for: Sam/);
  assert.equal(await plugin.handleFamilyRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, p), null);
  const list = await plugin.handleFamilyRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, p);
  assert.ok(list.result.tools.every((t) => t.description && t.inputSchema && t.annotations));
  assert.match(checkArgs({ properties: { text: { type: "string" } } }, { txt: "x" }), /unknown argument "txt"/);
  assert.equal(guardFamilyWrite("patch", "people/sam/raw/sources/a.md", true, { targetType: "frontmatter", target: "status", operation: "replace" }), null);
});

test("an admin's token issued as member sees only their own notes (for FAITH)", async () => {
  const { call } = setup();
  const read = await call("t-wizard-faith", "note_read", { path: "people/sam/wiki/1-projects/Wedding Quilt.md" });
  assert.ok(read.error, "Sam's private note stays private from the admin's assistant");
  assert.doesNotMatch((await call("t-wizard-faith", "notes_search", { query: "quilt" })).text, /Wedding Quilt/);
  assert.match((await call("t-wizard-faith", "notes_search", { query: "divider" })).text, /MD1200 Cage Divider\.md/, "his own notes still");
  assert.ok(!JSON.parse((await call("t-wizard-faith", "notes_list", { path: "" })).text).files.includes("people/"));
  assert.match((await call("t-wizard-faith", "memory_log", { text: "Booked the ferry" })).text || "", /daily/i, "and he can still log to his own memory");
  assert.match((await call("t-wizard", "note_read", { path: "people/sam/wiki/1-projects/Wedding Quilt.md" })).text, /quilt/, "his admin token is unchanged");
});

// Grown-ups only, and the master key: the bridge keeps these apart itself, whatever the client does.
const KIDS = {
  ...FAMILY,
  members: [...FAMILY.members, { id: "robin", name: "Robin", role: "child" }],
  shared_agents: [...FAMILY.shared_agents, { id: "faith-parents", name: "FAITH (parents)", audience: "parents" }],
};
const GIFTS = { "household/parents/Robin's birthday.md": "A red bike from the shop on Elm Street. Don't tell Robin.\n" };

test("household/parents/ is for the grown-ups: a child, a service and the family's shared agent never see it", async () => {
  const { call } = setup(GIFTS, KIDS);
  for (const t of ["t-robin", "t-um", "t-house"]) {
    assert.ok((await call(t, "note_read", { path: "household/parents/Robin's birthday.md" })).error, `${t} can't read it`);
    assert.doesNotMatch((await call(t, "notes_search", { query: "bike" })).text || "", /birthday/, `${t} can't find it`);
  }
  assert.ok((await call("t-robin", "note_write", { path: "household/parents/x.md", content: "hi" })).error, "nor write there");
  assert.match((await call("t-robin", "whoami")).text, /\(child, id robin\)/);
  for (const t of ["t-sam", "t-wizard-faith", "t-parents"]) {
    assert.match((await call(t, "note_read", { path: "household/parents/Robin's birthday.md" })).text, /red bike/, `${t} can`);
  }
  assert.match((await call("t-parents", "whoami")).text, /\(shared-parents, id faith-parents\)/);
  assert.match((await call("t-robin", "note_read", { path: "household/wiki/3-resources/RaidLab.md" })).text, /MI50/, "the rest of household/ is still the family's");
});

test("the master key reads everyone's notes and writes nothing", async () => {
  const { call } = setup(GIFTS, KIDS);
  assert.match((await call("t-master", "whoami")).text, /\(master, id master\)/);
  assert.match((await call("t-master", "note_read", { path: "people/sam/wiki/1-projects/Wedding Quilt.md" })).text, /quilt/);
  assert.match((await call("t-master", "note_read", { path: "household/parents/Robin's birthday.md" })).text, /red bike/);
  assert.match((await call("t-master", "notes_search", { query: "divider" })).text, /people\/wizard\/wiki\/1-projects\/MD1200 Cage Divider\.md/);
  const w = await call("t-master", "note_write", { path: "household/wiki/x.md", content: "hi" });
  assert.ok(w.error, "no writing");
  assert.match(w.text || w.error || "", /only reads/);
  assert.match((await call("t-master", "memory_log", { text: "x", person: "sam" })).text || "", /only reads/);
  assert.ok((await call("t-master", "note_read", { path: "daily/x.md" })).error, "it has no folder of its own");
});
