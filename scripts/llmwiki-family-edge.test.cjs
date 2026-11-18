// Edge cases of the family layer: odd names, Omi labels, races, broken input.
// Shares the fake vault in llmwiki-family.test.cjs. Run with: node --test scripts/llmwiki-family-edge.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, FAMILY, Bridge } = require("./family-harness.cjs");
const { whoIs, normalizeRegistry, resolvePath, checkArgs } = Bridge.helpers;

const clone = (o) => JSON.parse(JSON.stringify(o));

test("edge: two members who go by the same name are never guessed between", async () => {
  const fam = clone(FAMILY);
  fam.members[0].aliases.push("Mom");
  fam.members[1].aliases.push("mom");
  const { call } = setup({}, fam);
  const who = await call("t-house", "who_is", { name: "Mom" });
  assert.match(who.text, /more than one|ambiguous/i);
  const log = await call("t-house", "memory_log", { text: "Bought milk", person: "Mom" });
  assert.ok(log.error);
  assert.match(log.text, /more than one|ambiguous/i);
});

test("edge: Omi's per-conversation labels (Speaker 0, SPEAKER_01, Speaker A) are never a person", () => {
  const reg = normalizeRegistry({ members: [{ id: "sam", name: "Sam", voice: ["Speaker 1", "Sam's voice"] }] });
  for (const label of ["Speaker 1", "SPEAKER_01", "speaker a", "Speaker B", "spk_0"]) assert.equal(whoIs(reg, label), null, label);
  assert.equal(whoIs(reg, "Sam's voice").id, "sam", "a real Omi person name still works");
});

test("edge: 'household' in any case or spacing means the household", async () => {
  const { call, vault } = setup();
  for (const h of ["Household", " household ", "HOUSEHOLD"]) {
    const r = await call("t-house", "memory_log", { text: `x ${h}`, person: h });
    assert.ok(!r.error, `${h}: ${r.text}`);
  }
  assert.equal([...vault.store.keys()].filter((k) => k.startsWith("household/daily/")).length, 1);
});

test("edge: a shared agent can't name a service or another agent as the person", async () => {
  const { call } = setup();
  for (const p of ["upstream-manager", "house-assistant", "Upstream Manager"]) {
    const r = await call("t-house", "memory_log", { text: "x", person: p });
    assert.ok(r.error, p);
  }
});

test("edge: tokens - case of 'Bearer', spaces, empty, a removed member, no registry at all", async () => {
  const { plugin } = setup();
  assert.equal((await plugin.authenticate("bearer t-sam")).id, "sam");
  assert.equal(await plugin.authenticate("Bearer  "), null);
  assert.equal(await plugin.authenticate("Bearer t-sam extra"), null);
  assert.equal(await plugin.authenticate("t-sam"), null);
  assert.equal(await plugin.authenticate("Bearer t-gone"), null, "removed from the registry");
  assert.equal(await plugin.authenticate(undefined), null);
  const broken = setup({}, null);
  assert.equal(await broken.plugin.authenticate("Bearer t-sam"), null, "no readable registry: nobody gets in");
});

test("edge: two people logging at the same moment on a new day both land", async () => {
  const { call, vault } = setup();
  const results = await Promise.all([
    call("t-um", "memory_log", { text: "upkeep ran" }),
    call("t-house", "memory_log", { text: "dishwasher fixed", person: "household" }),
    call("t-wizard", "memory_log", { text: "racked switch", person: "household" }),
  ]);
  for (const r of results) assert.ok(!r.error, r.text);
  const day = [...vault.store.entries()].find(([k]) => k.startsWith("household/daily/"))[1];
  for (const t of ["upkeep ran", "dishwasher fixed", "racked switch"]) assert.ok(day.includes(t), t);
});

test("edge: odd paths stay inside the person's view", () => {
  const sam = { kind: "member", id: "sam", role: "member", name: "Sam" };
  assert.ok(resolvePath("wiki/x\0.md", sam).error, "NUL");
  assert.ok(resolvePath("wiki/%2e%2e/x.md", sam).real.startsWith("people/sam/"), "still encoded: a literal name, inside sam's folder");
  assert.equal(resolvePath("People/wizard/profile.md", sam).real, "people/sam/People/wizard/profile.md", "case matters: not another person's folder");
  assert.equal(resolvePath("//household//wiki/x.md", sam).real, "household/wiki/x.md");
  assert.ok(resolvePath("household/../people/wizard/profile.md", sam).error);
});

test("edge: malformed MCP input is refused, not crashed on", async () => {
  const { rpc } = setup();
  const r1 = await rpc("t-sam", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: "x" } });
  assert.ok(r1.result.isError || r1.error, "arguments that aren't an object");
  const r2 = await rpc("t-sam", { jsonrpc: "2.0", id: 2, method: "tools/call", params: null });
  assert.ok(r2.error || r2.result.isError);
  const r3 = await rpc("t-sam", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "memory_log", arguments: { text: ["a"] } } });
  assert.ok(r3.result.isError);
  assert.equal(checkArgs({ properties: {} }, ["a"]) !== null, true);
});
