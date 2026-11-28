// The wiki as a graph: graph_* tools and GRAPH.md, always from the notes the token can see.
// Run with: node --test scripts/llmwiki-graph.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, FAMILY, Bridge } = require("./family-harness.cjs");
const { parseNote, resolveLink, louvain, buildGraph, analyzeGraph, suggestLinks, findNode, isWikiNote } = Bridge.helpers;

const FAM = {
  ...FAMILY,
  members: [...FAMILY.members, { id: "robin", name: "Robin", role: "child" }],
  groups: [{ id: "us", name: "Wizard & Sam", members: ["wizard", "sam"] }],
};
const W = "household/wiki";
const NOTES = {
  [`${W}/2-areas/Homelab.md`]: "---\ntitle: Homelab\ntype: area\narea: homelab\n---\nThe [[RaidLab]] server and the [[Codebox]].\n",
  [`${W}/3-resources/RaidLab.md`]: "---\ntype: resource\narea: homelab\nrelated:\n  - \"[[Codebox]]\"\n---\nRuns [[LLM Inference Stack]]. Source: [[people/wizard/raw/sources/2026-10-27 - Snapshot]]\n",
  [`${W}/3-resources/Codebox.md`]: "---\ntype: resource\narea: homelab\n---\nA NUC next to [[RaidLab|the server]]. Builds [[LLM Inference Stack]] images.\n",
  [`${W}/3-resources/LLM Inference Stack.md`]: "---\ntype: resource\narea: ai\n---\nllama.cpp on [[RaidLab#GPUs]]; see [[Local AI]].\n```\n[[Not A Link]]\n```\n",
  [`${W}/2-areas/Local AI.md`]: "---\ntype: area\narea: ai\n---\n[[LLM Inference Stack]], [[Odysseus]].\n",
  [`${W}/3-resources/Odysseus.md`]: "---\ntype: resource\narea: ai\n---\nOn [[RaidLab]]. Uses the [[LLM Inference Stack]].\n",
  [`${W}/1-projects/Garden Beds.md`]: "---\ntype: project\n---\nRaised beds by the fence. Mentions [[Missing Plan]].\n",
  "household/parents/wiki/1-projects/Birthday Surprise.md": "---\ntype: project\n---\nSurprise for Robin, see [[RaidLab]].\n",
  "groups/us/wiki/1-projects/Anniversary Trip.md": "---\ntype: project\n---\nCabin trip; book through [[Codebox]].\n",
  "people/sam/wiki/3-resources/Quilt Patterns.md": "---\ntype: resource\n---\nSee [[Wedding Quilt]].\n",
};

const t = (extra = {}) => setup({ ...NOTES, ...extra }, FAM);

test("graph: links come from the body and front matter, without aliases, headings or code", () => {
  const n = parseNote(`${W}/3-resources/LLM Inference Stack.md`, NOTES[`${W}/3-resources/LLM Inference Stack.md`]);
  assert.deepEqual(n.links.map((l) => l.target), ["RaidLab", "Local AI"], "a link inside a code block isn't one");
  const r = parseNote(`${W}/3-resources/RaidLab.md`, NOTES[`${W}/3-resources/RaidLab.md`]);
  assert.equal(r.links[0].target, "Codebox");
  assert.equal(r.links[0].line, "related: [[Codebox]]", "a front-matter list item is shown with its key");
  const md = parseNote("wiki/x.md", "See ![[Diagram]] and [the plan](../1-projects/Big%20Plan.md) and [site](https://x.org/a.md).");
  assert.deepEqual(md.links.map((l) => [l.target, l.embed]), [["Diagram", true], ["../1-projects/Big Plan", false]]);
  assert.equal(isWikiNote("people/sam/wiki/1-projects/A.md"), true);
  assert.equal(isWikiNote("household/raw/sources/A.md"), false);
});

test("graph: a link resolves to the same root first, like Obsidian", () => {
  const index = ["household/wiki/3-resources/Knowledge.md", "people/sam/wiki/2-areas/Knowledge.md"];
  assert.equal(resolveLink("Knowledge", "people/sam/wiki/1-projects/x.md", index), "people/sam/wiki/2-areas/Knowledge.md");
  assert.equal(resolveLink("Knowledge", "household/wiki/x.md", index), "household/wiki/3-resources/Knowledge.md");
  assert.equal(resolveLink("3-resources/Knowledge", "people/sam/wiki/x.md", index), "household/wiki/3-resources/Knowledge.md");
  assert.equal(resolveLink("Nope", "household/wiki/x.md", index), null);
});

test("graph: louvain splits two triangles joined by one link", () => {
  const e = (a, b) => ({ a, b, w: 1 });
  const m = louvain(["a", "b", "c", "x", "y", "z"], [e("a", "b"), e("b", "c"), e("a", "c"), e("x", "y"), e("y", "z"), e("x", "z"), e("c", "x")]);
  assert.equal(m.get("a"), m.get("b"));
  assert.equal(m.get("b"), m.get("c"));
  assert.equal(m.get("x"), m.get("z"));
  assert.notEqual(m.get("a"), m.get("x"));
});

test("graph: clusters, orphans, broken links; a source citation isn't broken", () => {
  const files = Object.entries(NOTES).filter(([p]) => p.startsWith(W)).map(([path, text]) => ({ path, text }));
  const g = buildGraph(files);
  assert.equal(g.ids.length, 7);
  const a = analyzeGraph(g);
  assert.deepEqual(a.orphans, [`${W}/1-projects/Garden Beds.md`]);
  assert.deepEqual(g.missing.map((m) => m.target), ["Missing Plan"], "the raw/ citation isn't listed");
  assert.ok(g.communities.length >= 1);
  const homelabEdge = g.edges.find((e) => [e.a, e.b].includes(`${W}/3-resources/Codebox.md`) && [e.a, e.b].includes(`${W}/2-areas/Homelab.md`));
  assert.ok(homelabEdge.kinds.has("link"), "Homelab links to Codebox");
  assert.ok(homelabEdge.kinds.has("area"), "and Codebox is in the homelab area");
  assert.equal(findNode(g, "odysseus").id, `${W}/3-resources/Odysseus.md`, "titles match without case");
  assert.match(findNode(g, "Nope").error, /No wiki note you can see/);
});

test("graph: suggestions are notes sharing neighbours that don't link", () => {
  const files = Object.entries(NOTES).filter(([p]) => p.startsWith(W)).map(([path, text]) => ({ path, text }));
  const g = buildGraph(files);
  const s = suggestLinks(g);
  for (const x of s) assert.ok(!g.nbrs.get(x.a).has(x.b), "never suggests a link that is already there");
  assert.ok(s.some((x) => [x.a, x.b].includes(`${W}/3-resources/Codebox.md`) && [x.a, x.b].includes(`${W}/3-resources/Odysseus.md`)), "Codebox and Odysseus both link to RaidLab and the stack, and not to each other");
});

test("graph tools: a member's graph holds only what they can see", async () => {
  const { call } = t();
  const sam = await call("t-sam", "graph_report");
  assert.equal(sam.error, false);
  assert.match(sam.text, /Quilt Patterns/, "her own notes");
  assert.match(sam.text, /Anniversary Trip/, "her group's");
  assert.doesNotMatch(sam.text, /MD1200|Cage Divider/, "never Wizard's private notes");
  const robin = await call("t-robin", "graph_report");
  assert.doesNotMatch(robin.text, /Birthday Surprise/, "household/parents/ stays with the grown-ups");
  assert.doesNotMatch(robin.text, /Anniversary Trip|Quilt Patterns/);
  const house = await call("t-house", "graph_report");
  assert.doesNotMatch(house.text, /Anniversary Trip|Quilt Patterns|MD1200|Birthday Surprise/, "the shared agent sees only household/");
  const wiz = await call("t-wizard", "graph_report");
  assert.match(wiz.text, /MD1200 Cage Divider/, "the admin sees everyone's");
});

test("graph tools: neighbours never show a link from a note the asker can't see", async () => {
  const { call } = t();
  const robin = await call("t-robin", "graph_neighbors", { note: "RaidLab" });
  assert.equal(robin.error, false);
  assert.match(robin.text, /Codebox/);
  assert.doesNotMatch(robin.text, /Birthday Surprise|parents/, "the grown-ups' note that links here is hidden");
  const sam = await call("t-sam", "graph_neighbors", { note: "Codebox" });
  assert.match(sam.text, /Anniversary Trip/, "her group's link back is shown to her");
  const house = await call("t-house", "graph_neighbors", { note: "Codebox" });
  assert.doesNotMatch(house.text, /Anniversary Trip/);
  const hidden = await call("t-sam", "graph_neighbors", { note: "MD1200 Cage Divider" });
  assert.equal(hidden.error, true);
  assert.match(hidden.text, /No wiki note you can see/, "the same answer as for a note that doesn't exist");
});

test("graph tools: path, cluster and suggest", async () => {
  const { call } = t();
  const path = await call("t-sam", "graph_path", { from: "Homelab", to: "Odysseus" });
  assert.match(path.text, /^2 steps: Homelab → RaidLab → Odysseus/);
  assert.match(path.text, /Odysseus links to RaidLab: "On \[\[RaidLab\]\]/, "each step says why");
  const none = await call("t-sam", "graph_path", { from: "Codebox", to: "Garden Beds" });
  assert.match(none.text, /No chain of links/);
  const list = await call("t-sam", "graph_cluster");
  assert.match(list.text, /^- c1 \*\*/);
  const one = await call("t-sam", "graph_cluster", { cluster: "Odysseus" });
  assert.match(one.text, /^# Cluster c\d+: /);
  const sug = await call("t-house", "graph_suggest", { note: "Codebox" });
  assert.match(sug.text, /Odysseus/);
  const bad = await call("t-sam", "graph_neighbors", { note: "Codebox", depth: "5" });
  assert.equal(bad.error, true);
  const within = await call("t-sam", "graph_report", { within: "wiki" });
  assert.match(within.text, /Quilt Patterns/);
  assert.doesNotMatch(within.text, /\[\[RaidLab\]\]/, "only her own wiki");
  const outside = await call("t-sam", "graph_report", { within: "people/wizard" });
  assert.equal(outside.error, true);
});

test("graph tools: listed for every token and read-only", async () => {
  const { rpc } = t();
  const out = await rpc("t-master", { jsonrpc: "2.0", id: 1, method: "tools/list" });
  const graph = out.result.tools.filter((x) => x.name.startsWith("graph_"));
  assert.deepEqual(graph.map((x) => x.name), ["graph_report", "graph_neighbors", "graph_path", "graph_cluster", "graph_suggest"]);
  assert.ok(graph.every((x) => x.annotations.readOnlyHint === true));
});

test("GRAPH.md: the household's view only, rewritten only when the graph changed", async () => {
  const { plugin, vault } = t();
  assert.match(await plugin.writeGraphReport(), /GRAPH.md rebuilt: 7 notes/);
  const text = vault.store.get("GRAPH.md");
  assert.match(text, /^---\ntitle: Wiki graph\ntype: dashboard\n---/);
  assert.match(text, /## Clusters/);
  assert.doesNotMatch(text, /Anniversary Trip|Quilt Patterns|MD1200|Wedding Quilt|Birthday Surprise/, "nothing private, group or grown-ups-only");
  assert.equal(await plugin.writeGraphReport(), "GRAPH.md is up to date.");
  vault.store.set(`${W}/1-projects/Garden Beds.md`, "---\ntype: project\n---\nBeds next to [[Codebox]].\n");
  assert.match(await plugin.writeGraphReport(), /rebuilt/);
  assert.doesNotMatch(vault.store.get("GRAPH.md"), /## Orphans\n\nNotes with no links in or out.\n\n- \[\[Garden Beds\]\]/);
});

test("graph: relative markdown links, the grown-ups' wiki, and shared notes that link into private ones", async () => {
  const index = ["household/wiki/3-resources/Home Assistant.md", "people/sam/wiki/3-resources/Home Assistant.md"];
  assert.equal(resolveLink("../3-resources/Home Assistant", "household/wiki/1-projects/x.md", index), "household/wiki/3-resources/Home Assistant.md");
  assert.equal(resolveLink("./Home Assistant", "people/sam/wiki/3-resources/x.md", index), "people/sam/wiki/3-resources/Home Assistant.md");
  assert.equal(isWikiNote("household/parents/wiki/1-projects/Gift.md"), true, "household/parents/wiki/ notes are nodes for the grown-ups");
  const { call } = t({ [`${W}/3-resources/Pointer.md`]: "---\ntype: resource\n---\nSee [[Birthday Surprise]].\n" });
  const sam = await call("t-sam", "graph_report");
  assert.match(sam.text, /## Links into private notes[\s\S]*\[\[Pointer\]\] → household\/parents\/wiki\/1-projects\/Birthday Surprise\.md/, "rule 14 slips are listed for a grown-up");
  const robin = await call("t-robin", "graph_report");
  assert.doesNotMatch(robin.text, /Links into private notes/, "a child can't see the target, so nothing is listed");
});
