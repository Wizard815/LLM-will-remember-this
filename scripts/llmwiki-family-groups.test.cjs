// Groups: shared folders for some of the family (a couple, the kids, a trip), groups/<id>/.
// Run with: node --test scripts/llmwiki-family-groups.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, FAMILY, Bridge, ymd } = require("./family-harness.cjs");
const { normalizeRegistry, resolvePath, toVirtual, filterQueryYaml, principalFor, groupNamed } = Bridge.helpers;

const FAM = {
  ...FAMILY,
  members: [...FAMILY.members, { id: "robin", name: "Robin", role: "child" }],
  shared_agents: [...FAMILY.shared_agents, { id: "faith-parents", name: "FAITH (parents)", audience: "parents" }],
  groups: [
    { id: "us", name: "Wizard & Sam", aliases: ["the couple"], members: ["wizard", "sam"] },
    { id: "kids", name: "The kids", members: ["robin"], readers: ["sam", "faith-parents"] },
  ],
};
const NOTES = {
  "groups/us/wiki/1-projects/Anniversary Trip.md": "---\ntype: project\n---\nCabin on Lake Superior, October. Surprise dinner booked.\n",
  "groups/kids/wiki/2-areas/School.md": "Robin's spelling list: harbour, lantern.\n",
};
const REG = normalizeRegistry(FAM);
const P = (id, extra = {}) => principalFor({ kind: "member", id, ...extra }, REG);

test("groups: a group's members read and write it, its readers only read, everyone else is kept out", () => {
  const sam = P("sam"), robin = P("robin"), wizFaith = P("wizard", { as: "member" });
  assert.deepEqual(resolvePath("groups/us/wiki/x.md", sam), { real: "groups/us/wiki/x.md", write: true });
  assert.deepEqual(resolvePath("groups/kids/wiki/x.md", sam), { real: "groups/kids/wiki/x.md", write: false }, "a reader only reads");
  assert.deepEqual(resolvePath("groups/kids/wiki/x.md", robin), { real: "groups/kids/wiki/x.md", write: true });
  assert.match(resolvePath("groups/us/wiki/x.md", robin).error, /group you aren't in/);
  assert.match(resolvePath("groups/kids/x.md", wizFaith).error, /group you aren't in/, "an admin's 'as member' token is just a member");
  assert.equal(resolvePath("groups/kids/x.md", P("wizard")).write, true, "the admin sees and writes every group");
  const house = principalFor({ kind: "shared", id: "house-assistant" }, REG);
  assert.match(resolvePath("groups/us/x.md", house).error, /group you aren't in/, "the household's shared agent never reads a group");
  const parents = principalFor({ kind: "shared", id: "faith-parents" }, REG);
  assert.deepEqual(resolvePath("groups/kids/x.md", parents), { real: "groups/kids/x.md", write: false }, "a shared agent can be a reader");
  const master = principalFor({ kind: "master", id: "master" }, REG);
  assert.deepEqual(resolvePath("groups/us/x.md", master), { real: "groups/us/x.md", write: false });
  assert.match(resolvePath("groups", sam).error, /groups\/us\/, groups\/kids\//, "the bare groups/ folder isn't listed for a member");
  assert.match(resolvePath("groups/../people/wizard/x.md", sam).error, /isn't a vault path/);
});

test("groups: search results and linked notes from other groups are hidden", () => {
  const sam = P("sam"), robin = P("robin");
  assert.equal(toVirtual("groups/us/wiki/1-projects/Anniversary Trip.md", sam), "groups/us/wiki/1-projects/Anniversary Trip.md");
  assert.equal(toVirtual("groups/us/wiki/1-projects/Anniversary Trip.md", robin), null);
  const yaml = [
    "- path: groups/kids/wiki/2-areas/School.md",
    "  content: |",
    "    spelling",
    "  connections:",
    "    - path: groups/us/wiki/1-projects/Anniversary Trip.md",
    "      content: |",
    "        Surprise dinner booked.",
    "- path: groups/us/wiki/1-projects/Anniversary Trip.md",
    "  content: |",
    "    Surprise dinner booked.",
    "",
  ].join("\n");
  const out = filterQueryYaml(yaml, (r) => toVirtual(r, robin));
  assert.match(out, /School\.md/);
  assert.doesNotMatch(out, /Surprise|Anniversary/);
});

test("groups: a group can't take a member's name or 'household', and needs a member", () => {
  const reg = normalizeRegistry({
    members: [{ id: "sam", name: "Sam", aliases: ["Samantha"] }],
    groups: [
      { id: "sam", name: "Sam's group", members: ["sam"] },
      { id: "x1", name: "Samantha", members: ["sam"] },
      { id: "x2", name: "Household", members: ["sam"] },
      { id: "x3", name: "Nobody", members: ["ghost"] },
      { id: "Bad Id", name: "Bad", members: ["sam"] },
      { id: "ok", name: "Fine", members: ["sam", "ghost"], readers: ["sam"] },
    ],
  });
  assert.deepEqual([...reg.groups.keys()], ["ok"]);
  assert.deepEqual(reg.groups.get("ok").members, ["sam"], "unknown members are dropped");
  assert.deepEqual(reg.groups.get("ok").readers, [], "a member isn't also a reader");
  assert.equal(groupNamed(REG, "THE COUPLE").id, "us");
});

test("groups: notes_list, note_read, notes_search and note_write through the family endpoint", async () => {
  const { call, vault } = setup(NOTES, FAM);
  const root = JSON.parse((await call("t-sam", "notes_list", { path: "" })).text).files;
  assert.ok(root.includes("groups/us/") && root.includes("groups/kids/"), root.join(","));
  const robinRoot = JSON.parse((await call("t-robin", "notes_list", { path: "" })).text).files;
  assert.ok(robinRoot.includes("groups/kids/") && !robinRoot.includes("groups/us/"));
  assert.ok(JSON.parse((await call("t-wizard", "notes_list", { path: "" })).text).files.includes("groups/"));
  assert.match((await call("t-sam", "note_read", { path: "groups/us/wiki/1-projects/Anniversary Trip.md" })).text, /Lake Superior/);
  assert.ok((await call("t-robin", "note_read", { path: "groups/us/wiki/1-projects/Anniversary Trip.md" })).error);
  assert.ok((await call("t-house", "note_read", { path: "groups/kids/wiki/2-areas/School.md" })).error);
  assert.match((await call("t-parents", "note_read", { path: "groups/kids/wiki/2-areas/School.md" })).text, /spelling/);
  assert.match((await call("t-robin", "notes_search", { query: "lake superior" })).text, /Nothing you can see/);
  assert.match((await call("t-sam", "notes_search", { query: "lake superior" })).text, /groups\/us\//);
  assert.ok((await call("t-sam", "note_write", { path: "groups/kids/wiki/x.md", content: "hi" })).error, "a reader can't write");
  const w = await call("t-sam", "note_write", { path: "groups/us/wiki/3-resources/Cabin.md", content: "Key under the mat." });
  assert.ok(!w.error, w.text);
  assert.ok(vault.store.has("groups/us/wiki/3-resources/Cabin.md"));
});

test("groups: memory tools take a group's name; only its members (and shared agents, write-only) can use it", async () => {
  const { call, vault } = setup(NOTES, FAM);
  const day = ymd(new Date());
  const r = await call("t-sam", "memory_log", { text: "Booked the cabin", person: "Wizard & Sam" });
  assert.ok(!r.error, r.text);
  assert.match(vault.store.get(`groups/us/daily/${day}.md`), /Booked the cabin/);
  assert.match(r.text, /groups\/us\/daily\//, "shown at the group's path");
  assert.match((await call("t-robin", "memory_log", { text: "x", person: "the couple" })).text, /only its members/);
  assert.ok((await call("t-sam", "memory_capture", { title: "x", content: "y", person: "kids" })).error, "a reader can't write memory");
  const shared = await call("t-house", "memory_log", { text: "Robin finished homework", person: "The kids" });
  assert.ok(!shared.error, shared.text);
  assert.ok((await call("t-um", "memory_log", { text: "x", person: "kids" })).error, "a service can't");
});

test("groups: whoami lists a member's groups; context_for shows their groups' day, never to a shared agent", async () => {
  const { call } = setup(NOTES, FAM);
  await call("t-sam", "memory_log", { text: "Booked the cabin", person: "us" });
  const who = await call("t-sam", "whoami");
  assert.match(who.text, /Your groups.*Wizard & Sam \(groups\/us\/, with Wizard\)/);
  assert.match(who.text, /read but not write: The kids/);
  assert.doesNotMatch((await call("t-robin", "whoami")).text, /Wizard & Sam/);
  assert.match((await call("t-sam", "context_for")).text, /Wizard & Sam today[\s\S]*Booked the cabin/);
  assert.doesNotMatch((await call("t-house", "context_for", { person: "Sam" })).text, /Booked the cabin|Wizard & Sam/);
});

test("groups: conversation_log files into a group's folder too; rollover covers a member's groups", async () => {
  const { call, vault } = setup(NOTES, FAM);
  const r = await call("t-sam", "conversation_log", { title: "Trip plans", group: "us", segments: [{ text: "Let's go in October", person: "Sam" }] });
  assert.ok(!r.error, r.text);
  assert.ok([...vault.store.keys()].some((k) => k.startsWith("groups/us/raw/sources/") && k.includes("Trip plans")));
  assert.match((await call("t-robin", "conversation_log", { title: "x", group: "us", segments: [{ text: "hi", person: "Robin" }] })).text, /only its members/);
  assert.match((await call("t-sam", "conversation_log", { title: "x", group: "nope", segments: [{ text: "hi", person: "Sam" }] })).text, /isn't a group/);
  vault.store.set("groups/us/daily/2020-01-01.md", "---\ntype: daily\nstatus: open\n---\n# 2020-01-01\n");
  const roll = await call("t-sam", "memory_rollover");
  assert.ok(!roll.error, roll.text);
  assert.ok(vault.store.has("groups/us/raw/sources/2020-01-01 - Daily Note.md"));
});
