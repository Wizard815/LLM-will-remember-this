// Conversations in (a home assistant frontend, Omi's webhook) and per-person context out.
// Run with: node --test scripts/llmwiki-conversation.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { setup, ymd } = require("./family-harness.cjs");

const day = () => ymd(new Date());
const sources = (vault, root) => [...vault.store.keys()].filter((k) => k.startsWith(`${root}/raw/sources/`) && k.includes("Conversation"));

test("a kitchen conversation is filed once in each speaker's own folder", async () => {
  const { call, vault } = setup();
  const r = await call("t-house", "conversation_log", { title: "Dinner plans", source: "kitchen-speaker", segments: [
    { person: "Sam", text: "Can we do tacos Friday?" },
    { person: "Wiz", text: "Sure, I'll pick up tortillas." },
    { speaker: "Speaker 2", text: "Can I come?" },
  ] });
  assert.ok(!r.error, r.text);
  for (const root of ["people/sam", "people/wizard"]) {
    const [path] = sources(vault, root);
    assert.ok(path, root);
    const text = vault.store.get(path);
    assert.match(text, /\*\*Who spoke:\*\* Sam, Wizard · unknown: Speaker 2/);
    assert.match(text, /\*\*Sam:\*\* Can we do tacos Friday\?\n\n\*\*Wizard:\*\* Sure/);
    assert.match(text, /\*\*Speaker 2 \(unknown\):\*\* Can I come\?/);
    assert.match(text, /via House assistant/);
    assert.match(text, /status: unprocessed/);
  }
  assert.equal(sources(vault, "household").length, 0, "not a household note unless it says shared");
  assert.match(r.text, /Unknown speakers: Speaker 2\. Ask who they were/);
  assert.ok(!/people\//.test(r.text), "a shared agent isn't shown private paths");
});

test("nobody known speaking: nothing is filed and the agent is told to ask", async () => {
  const { call, vault } = setup();
  const r = await call("t-house", "conversation_log", { segments: [{ speaker: "Speaker 0", text: "hello" }, { speaker: "SPEAKER_01", text: "hi" }] });
  assert.ok(r.error);
  assert.match(r.text, /Nobody in this conversation is a known family member \(Speaker 0, SPEAKER_01\)\. Ask who was speaking/);
  assert.equal([...vault.store.keys()].filter((k) => k.includes("Conversation")).length, 0);
  const shared = await call("t-house", "conversation_log", { shared: true, segments: [{ speaker: "Speaker 0", text: "the dishwasher is leaking" }] });
  assert.ok(!shared.error, shared.text);
  assert.equal(sources(vault, "household").length, 1, "shared: true files it for the household");
});

test("a member's own recording stays in their folder, even with other people in it", async () => {
  const { call, vault } = setup();
  const r = await call("t-sam", "conversation_log", { title: "Fabric shop", segments: [
    { is_user: true, text: "Do you have sage linen?" },
    { person_id: "p-wiz-on-sams-omi", text: "Get the wider bolt." },
  ] });
  assert.ok(!r.error, r.text);
  assert.equal(sources(vault, "people/sam").length, 1);
  assert.equal(sources(vault, "people/wizard").length, 0, "Sam can't drop files into Wizard's folder");
  assert.match(vault.store.get(sources(vault, "people/sam")[0]), /\*\*Sam:\*\* Do you have sage linen\?\n\n\*\*Wizard:\*\* Get the wider bolt\./);
});

test("the same conversation id twice is filed once (Omi retries its webhook)", async () => {
  const { call, vault } = setup();
  const args = { id: "conv-1234-abcd", title: "Retry", segments: [{ person: "Sam", text: "once" }] };
  assert.ok(!(await call("t-house", "conversation_log", args)).error);
  const again = await call("t-house", "conversation_log", args);
  assert.ok(!again.error, again.text);
  assert.match(again.text, /Already filed/);
  assert.equal(sources(vault, "people/sam").length, 1);
});

test("conversation_log refuses secrets, empty and malformed input", async () => {
  const { call } = setup();
  assert.ok((await call("t-house", "conversation_log", { segments: [] })).error);
  assert.ok((await call("t-house", "conversation_log", { segments: [{ person: "Sam" }] })).error, "a line without text");
  assert.ok((await call("t-house", "conversation_log", { segments: "hi" })).error);
  const s = await call("t-house", "conversation_log", { segments: [{ person: "Sam", text: "the wifi password: hunter2hunter2" }] });
  assert.ok(s.error); assert.match(s.text, /secret/);
});

test("context_for: everything for yourself, only what's shared for anyone else", async () => {
  const { call } = setup({ [`people/sam/daily/${day()}.md`]: "## Worked on\n\n- Cut fabric\n", [`household/daily/${day()}.md`]: "## Worked on\n\n- Fixed the dishwasher\n" });
  const self = await call("t-sam", "context_for");
  assert.match(self.text, /# Context for Sam/); assert.match(self.text, /Cut fabric/); assert.match(self.text, /Fixed the dishwasher/);
  const shared = await call("t-house", "context_for", { person: "Samantha" });
  assert.match(shared.text, /Sews; planning the wedding quilt/);
  assert.ok(!/Cut fabric/.test(shared.text), "a shared agent doesn't see her day");
  const other = await call("t-sam", "context_for", { person: "Wizard" });
  assert.match(other.text, /Runs the homelab/); assert.ok(!/secret-ish hobby/.test(other.text));
  const admin = await call("t-wizard", "context_for", { person: "Sam" });
  assert.match(admin.text, /Cut fabric/);
  const who = await call("t-house", "context_for");
  assert.ok(who.error); assert.match(who.text, /Who are you helping/);
});

/* ---- the HTTP route, with Omi's real webhook shape */
function fakeReq(url, body, headers = {}) {
  const r = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  Object.assign(r, { method: "POST", url, originalUrl: url, path: url.split("?")[0], headers });
  return r;
}
function fakeRes() {
  const res = { code: 200, body: null, headersSent: false };
  res.status = (c) => { res.code = c; return res; };
  res.set = () => res; res.type = () => res;
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res; res.send = (b) => { res.body = b; return res; };
  return res;
}
const omiPayload = { id: "6f1c2d9e-aaaa", started_at: "2026-11-16T18:02:00Z", structured: { title: "Quilt colors" }, discarded: false,
  transcript_segments: [
    { text: "Sage or cream for the border?", speaker: "SPEAKER_00", speaker_name: "Sam", is_user: true, person_id: null },
    { text: "Cream.", speaker: "SPEAKER_01", speaker_name: "Wizard", is_user: false, person_id: "p-wiz-on-sams-omi" },
  ] };

test("Omi's webhook: the key in the URL, the uid checked, the payload filed", async () => {
  const { plugin, vault } = setup();
  const send = async (url, body, headers) => { const res = fakeRes(); await plugin.serveFamilyRest(null, fakeReq(url, body, headers), res); return res; };
  const none = await send("/family/conversation", omiPayload);
  assert.equal(none.code, 401);
  const wrong = await send("/family/conversation?key=t-sam&uid=omi-uid-wizard", omiPayload);
  assert.equal(wrong.code, 403, "Sam's key on Wizard's Omi");
  const ok = await send("/family/conversation?key=t-sam&uid=omi-uid-sam", omiPayload);
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.speakers.sort(), ["sam", "wizard"]);
  const path = sources(vault, "people/sam")[0];
  assert.match(path, /2026-11-16 - Conversation - Quilt colors \(6f1c2d9e\)\.md$/);
  assert.match(vault.store.get(path), /\*\*Sam:\*\* Sage or cream for the border\?\n\n\*\*Wizard:\*\* Cream\./);
  const retry = await send("/family/conversation?key=t-sam&uid=omi-uid-sam", omiPayload);
  assert.equal(retry.code, 200); assert.equal(retry.body.filed, 0); assert.equal(retry.body.already, 1);
  const discarded = await send("/family/conversation?key=t-sam", { ...omiPayload, discarded: true });
  assert.equal(discarded.body.filed, 0);
  const bad = await send("/family/conversation?key=t-sam", "{not json");
  assert.equal(bad.code, 400);
  // A frontend uses the header and conversation_log's own shape; ?key= isn't taken by other routes.
  const front = await send("/family/conversation", { title: "Hall", segments: [{ person: "Sam", text: "Lights off?" }] }, { authorization: "Bearer t-house" });
  assert.equal(front.code, 200, JSON.stringify(front.body));
  const other = fakeRes();
  await plugin.serveFamilyRest(null, Object.assign(fakeReq("/family/vault/wiki/?key=t-sam", ""), { method: "GET" }), other);
  assert.equal(other.code, 401);
  const badUrl = fakeRes();
  await plugin.serveFamilyRest(null, Object.assign(fakeReq("/family/vault/%E0%A4%A", ""), { method: "GET" }), badUrl);
  assert.equal(badUrl.code, 400);
});

test("an overview and action items are filed above the transcript", async () => {
  const { call, vault } = setup();
  const r = await call("t-sam", "conversation_log", { title: "Quilt plan", id: "q-1", overview: "Picked cream for the border.",
    action_items: ["Buy cream fabric", { description: "Wash the backing", completed: true }, { description: "  " }],
    segments: [{ person: "Sam", text: "Cream it is." }] });
  assert.ok(!r.error, r.text);
  const text = vault.store.get(sources(vault, "people/sam")[0]);
  assert.match(text, /## Overview\n\nPicked cream for the border\.\n\n## Action items\n\n- \[ \] Buy cream fabric\n- \[x\] Wash the backing\n\n## Transcript\n\n\*\*Sam:\*\* Cream it is\./);
});

test("without a transcript, the summary is filed for the people named", async () => {
  const { call, vault } = setup();
  const r = await call("t-house", "conversation_log", { title: "Shelves", overview: "Garage shelves: three boards.", people: ["Wiz"] });
  assert.ok(!r.error, r.text);
  const text = vault.store.get(sources(vault, "people/wizard")[0]);
  assert.match(text, /## Overview\n\nGarage shelves: three boards\./);
  assert.ok(!/## Transcript/.test(text));
  const mine = await call("t-sam", "conversation_log", { overview: "Just mine." });
  assert.ok(!mine.error, mine.text);
  assert.equal(sources(vault, "people/sam").length, 1);
  const nobody = await call("t-house", "conversation_log", { overview: "Who?" });
  assert.ok(nobody.error); assert.match(nobody.text, /Nobody in this conversation is a known family member/);
  const empty = await call("t-sam", "conversation_log", { overview: "  ", action_items: [] });
  assert.ok(empty.error); assert.match(empty.text, /nothing to file/);
  const badPerson = await call("t-house", "conversation_log", { overview: "x", people: ["Speaker 1"] });
  assert.ok(badPerson.error); assert.match(badPerson.text, /people: "Speaker 1" is a per-conversation speaker label/);
  const badType = await call("t-sam", "conversation_log", { overview: 5 });
  assert.ok(badType.error); assert.match(badType.text, /"overview" must be a string/);
});

test("Omi's webhook files its overview and action items", async () => {
  const { plugin, vault } = setup();
  const res = fakeRes();
  const body = { ...omiPayload, structured: { title: "Quilt colors", overview: "Border is cream.", action_items: [{ description: "Order fabric", completed: false }] } };
  await plugin.serveFamilyRest(null, fakeReq("/family/conversation?key=t-sam&uid=omi-uid-sam", body), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const text = vault.store.get(sources(vault, "people/sam")[0]);
  assert.match(text, /## Overview\n\nBorder is cream\.\n\n## Action items\n\n- \[ \] Order fabric\n\n## Transcript\n\n\*\*Sam:\*\* Sage/);
});
