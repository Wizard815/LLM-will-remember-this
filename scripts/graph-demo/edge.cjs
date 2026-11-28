// Edge cases for the graph tools on the fake vault (vault.cjs), offline:
//   node scripts/graph-demo/edge.cjs     (exits 1 if any check fails)
const { makePlugin, Bridge } = require("./lib.cjs");
const { FILES, FAMILY, SECRETS } = require("./vault.cjs");
const H = Bridge.helpers;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); };
(async () => {
  const { call, plugin, vault } = makePlugin(FILES, FAMILY);
  const ALL = ["graph_report", "graph_neighbors", "graph_path", "graph_cluster", "graph_suggest"];
  // 1. privacy sweep: every token x every graph tool x every note title as argument
  const titles = Object.keys(FILES).filter((p) => p.includes("/wiki/")).map((p) => p.split("/").pop().replace(/\.md$/, ""));
  const forbidden = {
    sam: [SECRETS.wizard, /Phoenix Heart|MD1200|\[\[Ashfall GM Secrets\]\]/],
    robin: [SECRETS.wizard, SECRETS.parents, SECRETS.sam, SECRETS.couple, /Ashfall GM Secrets|Phoenix Heart|MD1200|Robin Birthday Surprise|Anniversary Trip|Quilt Patterns|Wedding Quilt/],
    house: [/Ashfall GM Secrets|Phoenix Heart|MD1200|Robin Birthday Surprise|Anniversary Trip|Quilt Patterns|Wedding Quilt|Emberfall|Mayor Vess/],
    tablebot: [/Ashfall GM Secrets|Phoenix Heart|MD1200|Robin Birthday Surprise|Anniversary Trip|Quilt Patterns|Wedding Quilt/],
    "wizard-faith": [/Quilt Patterns|Wedding Quilt|SECRET-SAM/],
    um: [/Ashfall GM Secrets|Phoenix Heart|MD1200|Robin Birthday Surprise|Anniversary Trip|Quilt Patterns|Wedding Quilt|Emberfall/],
  };
  let calls = 0, leaks = [];
  for (const [who, pats] of Object.entries(forbidden)) {
    const outs = [];
    outs.push((await call(who, "graph_report")).text, (await call(who, "graph_cluster")).text, (await call(who, "graph_suggest")).text);
    for (const t of titles) {
      outs.push((await call(who, "graph_neighbors", { note: t, depth: "2" })).text);
      outs.push((await call(who, "graph_suggest", { note: t })).text);
      outs.push((await call(who, "graph_cluster", { cluster: t })).text);
      outs.push((await call(who, "graph_path", { from: t, to: "Argos" })).text);
      outs.push((await call(who, "graph_path", { from: "Mayor Vess", to: t })).text);
    }
    calls += outs.length;
    // Household notes that themselves quote a private title (the injection note, the rule-14 slip) are not leaks.
    const own = (o) => o.split("\n").filter((l) => !/IGNORE ALL PREVIOUS|Birthday Plans Pointer/.test(l)).join("\n");
    for (const o of outs.filter((x) => !/^No wiki note you can see is called/.test(x)).map(own)) for (const p of pats) if (p.test(o)) leaks.push(`${who}: ${p} in "${o.slice(0, 160)}"`);
  }
  check(`privacy sweep: ${calls} calls across 6 tokens, no hidden note named or quoted`, !leaks.length, leaks.slice(0, 3).join(" | "));
  // an unseen note gives the same answer as a missing one
  const hid = await call("sam", "graph_neighbors", { note: "Ashfall GM Secrets" });
  const none = await call("sam", "graph_neighbors", { note: "Totally Made Up" });
  check("a hidden note answers exactly like a missing one", hid.text.replace("Ashfall GM Secrets", "X") === none.text.replace("Totally Made Up", "X"), hid.text);
  // rule-14 slip: household note links into parents/ -> robin sees it as broken, never the title's target note
  const rob = await call("robin", "graph_report");
  check("a household link into the grown-ups' folder shows only as a broken link name to a child", /Robin Birthday Surprise\]\]` in \[\[Birthday Plans Pointer/.test(rob.text) && !/SECRET-PARENTS|dragon cake/.test(rob.text), "the link text itself is in a household note, so its name shows");
  // GM secrets vs the table
  const wizN = await call("wizard", "graph_neighbors", { note: "Mayor Vess" });
  const samN = await call("sam", "graph_neighbors", { note: "Mayor Vess" });
  check("the GM sees his secret note link to Mayor Vess; a player doesn't", /Ashfall GM Secrets/.test(wizN.text) && !/Ashfall GM Secrets/.test(samN.text));
  const botR = await call("tablebot", "graph_report", { within: "groups/table" });
  check("the table bot (a reader of the D&D group) gets the campaign graph", /Emberfall/.test(botR.text) && /Mayor Vess/.test(botR.text), botR.text.split("\n")[2]);
  // 2. parsing edge cases
  const g = H.buildGraph(Object.entries(FILES).filter(([p]) => p.startsWith("household/")).map(([path, text]) => ({ path, text })));
  const has = (a, b) => g.nbrs.get(`household/wiki/${a}`)?.has(`household/wiki/${b}`);
  check("links in code blocks and inline code are ignored", !g.missing.some((m) => /Fake In Code|Also Not A Link/.test(m.target)));
  check("alias and heading links resolve ([[RaidLab|the big server]], [[X#h|y]])", has("3-resources/Codebox.md", "3-resources/RaidLab.md") && has("3-resources/Argos.md", "3-resources/LLM Inference Stack.md"));
  check("lower-case link [[homelab]] resolves; %20 markdown link resolves", has("1-projects/Café Wi-Fi Fix — Ünïcode.md", "2-areas/Homelab.md") && has("1-projects/Café Wi-Fi Fix — Ünïcode.md", "3-resources/Home Assistant.md"));
  check("a self-link doesn't count; the note is an orphan", H.analyzeGraph(g).orphans.includes("household/wiki/3-resources/Self Loop.md"));
  check("no front matter / broken front matter still parse", has("3-resources/No Front Matter.md", "3-resources/Plex.md") && has("3-resources/Broken Front Matter.md", "3-resources/Argos.md"));
  check("source citations into people/ aren't broken links", !g.missing.some((m) => /raw\/sources/.test(m.target)));
  check("broken links found", ["Garden Plan 2027"].every((t) => g.missing.some((m) => m.target === t)), g.missing.map((m) => m.target).join(", "));
  const a = H.analyzeGraph(g);
  check("logs never lead: no log is a hub, bridge or cluster name", !a.hubs.concat(a.bridges.map((b) => b.id)).some((i) => /logs\//.test(i)) && !g.communities.some((c) => /^Log/.test(c.name)), `hubs: ${a.hubs.map((i) => g.notes.get(i).title).join(", ")}`);
  // 3. bad input
  const bad = [
    ["graph_neighbors", {}], ["graph_neighbors", { note: 5 }], ["graph_neighbors", { note: "Argos", depth: "3" }], ["graph_path", { from: "Argos" }],
    ["graph_report", { within: "../people/wizard" }], ["graph_report", { within: "people/wizard" }], ["graph_cluster", { cluster: "c999" }], ["graph_report", { extra: 1 }],
    ["graph_neighbors", { note: "" }], ["graph_neighbors", { note: "../../etc/passwd" }],
  ];
  const badOut = [];
  for (const [n, args] of bad) { const r = await call("sam", n, args); badOut.push(`${n} ${JSON.stringify(args)} -> ${r.error ? "error" : "ok"}: ${r.text.split("\n")[0].slice(0, 90)}`); }
  check("bad arguments are refused with a plain message, nothing crashes", badOut.every((l) => /-> error/.test(l) || /No wiki note|isn't in a cluster|No chain/.test(l)), badOut.join("\n"));
  // ambiguous titles across roots
  const dup = makePlugin({ ...FILES, "people/sam/wiki/3-resources/Argos.md": "---\ntype: resource\n---\nSam's cat is called [[Argos]].\n" }, FAMILY);
  const amb = await dup.call("sam", "graph_neighbors", { note: "Argos" });
  check("two notes with one title: asks which path", /could be/.test(amb.text), amb.text);
  const samLink = await dup.call("sam", "graph_neighbors", { note: "wiki/3-resources/Argos.md" });
  check("a link resolves inside its own root first (Sam's Argos links to itself, not the server)", /Links to\n\n- None/.test(samLink.text), samLink.text.split("\n").slice(0, 6).join(" / "));
  // 4. empty vault and a big vault
  const empty = makePlugin({}, FAMILY);
  const e = await empty.call("sam", "graph_report");
  check("an empty vault gives a calm report", !e.error && /0 notes/.test(e.text), e.text.split("\n")[2]);
  const big = {};
  const N = 3000;
  for (let i = 0; i < N; i += 1) {
    const links = [1, 7, 31].map((k) => `[[Note ${(i * k + 13) % N}]]`).join(" ");
    big[`household/wiki/3-resources/Note ${i}.md`] = `---\ntype: resource\narea: ${["homelab", "ai", "ttrpg"][i % 3]}\n---\n# Note ${i}\nSee ${links}.\n`;
  }
  const bp = makePlugin(big, FAMILY);
  let t0 = Date.now();
  const br = await bp.call("sam", "graph_report");
  const tReport = Date.now() - t0;
  t0 = Date.now();
  await bp.call("sam", "graph_path", { from: "Note 1", to: "Note 2999" });
  const tPath = Date.now() - t0;
  check(`3,000-note vault: report in ${tReport} ms, path in ${tPath} ms`, !br.error && tReport < 20000, br.text.split("\n")[2]);
  // 5. GRAPH.md
  const msg = await plugin.writeGraphReport();
  const gm = vault.store.get("GRAPH.md");
  check("GRAPH.md is the household's view (no private, group, D&D or grown-ups notes)", !/SECRET|Emberfall|Mayor Vess|Anniversary|Quilt|MD1200|GM Secrets/.test(gm), msg);
  check("GRAPH.md isn't rewritten when nothing changed", (await plugin.writeGraphReport()) === "GRAPH.md is up to date.");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : `\n     ${r.detail}`}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
})();
