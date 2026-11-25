// Tests for scripts/family-setup.mjs, run with: node --test scripts/family-setup.test.mjs
// Each test works on a fresh copy of this vault's tracked files.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFamily, readTokens, run, sharedLinksToPrivate } from "./family-setup.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// A small vault in the pre-family layout (top-level wiki/, daily/, inbox/, raw/), shaped like this one was.
function legacyVault() {
  const dir = mkdtempSync(join(tmpdir(), "llmwiki-family-"));
  const note = (title, type, area, extra = "", body = "") =>
    `---\ntitle: "${title}"\ntype: ${type}\narea: ${area}\ntags: [wiki, ${type}]\nsource: "[[raw/sources/2026-10-27 - Knowledge Snapshot]]"\n${extra}---\n\n# ${title}\n${body}`;
  const files = {
    "HOME.md": '# HOME\n```dataview\nLIST FROM "wiki/2-areas"\n```\n',
    "Projects.base": 'filters:\n  and:\n    - type == "project"\n    - or:\n        - file.inFolder("wiki/1-projects")\n        - file.inFolder("wiki/4-archive")\nviews: []\n',
    "wiki/2-areas/Homelab.md": note("Homelab", "area", "homelab", "", '```dataview\nLIST FROM "wiki/1-projects"\n```\n'),
    "wiki/2-areas/Personal.md": note("Personal", "area", "personal", "", '```dataview\nLIST FROM "wiki/1-projects"\n```\n'),
    "wiki/2-areas/TTRPG.md": note("TTRPG", "area", "ttrpg"),
    "wiki/3-resources/RaidLab.md": note("RaidLab", "resource", "homelab", "resource_kind: system\n"),
    "wiki/3-resources/Wizard.md": note("Wizard", "resource", "knowledge", "resource_kind: person\n"),
    "wiki/4-archive/Mackinac Island Trip.md": note("Mackinac Island Trip", "project", "travel", "project_status: done\n"),
    "wiki/4-archive/Engagement Ring Shopping.md": note("Engagement Ring Shopping", "project", "personal", "project_status: done\n"),
    "wiki/logs/Log - 2026-10-27.md": "---\ntitle: Log\ntype: log\n---\nSee [[raw/sources/2026-10-27 - Knowledge Snapshot]].\n",
    "daily/README.md": "# daily\n",
    "daily/2026-11-14.md": "---\ntype: daily\nstatus: open\n---\n",
    "inbox/README.md": "# inbox\n",
    "raw/sources/2026-10-27 - Knowledge Snapshot.md": "---\ntype: source\nstatus: processed\n---\n",
    "schema/templates/PROFILE.md": readFileSync(join(REPO, "schema/templates/PROFILE.md"), "utf8"),
    ".obsidian/daily-notes.json": '{"folder":"daily","template":"schema/templates/DAILY"}',
    ".obsidian/plugins/local-rest-api-second-brain-mcp-extension/data.json": '{"allowedPathPatterns":["^wiki/"]}',
    ".obsidian/plugins/karpathywiki/data.json": '{"watchedFolders":["daily"]}',
  };
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}
const quiet = (fn) => async (...a) => { const log = console.log; console.log = () => {}; try { return await fn(...a); } finally { console.log = log; } };
const cli = quiet((vault, ...argv) => run([...argv, "--vault", vault], { interactive: false }));
const read = (vault, p) => readFileSync(join(vault, p), "utf8");

test("init moves the homelab to household/ and the admin's own notes to people/<admin>/", async () => {
  const v = legacyVault();
  const { moved } = await cli(v, "init", "--name", "Wizard", "--id", "wizard", "--alias", "Wiz", "--omi-uid", "uid-wizard");
  assert.equal(moved.length, 10);
  assert.ok(existsSync(join(v, "household/wiki/3-resources/RaidLab.md")), "homelab is the household's");
  assert.ok(existsSync(join(v, "household/wiki/2-areas/Homelab.md")));
  assert.ok(existsSync(join(v, "household/wiki/4-archive/Mackinac Island Trip.md")), "trips are shared");
  assert.ok(existsSync(join(v, "people/wizard/wiki/4-archive/Engagement Ring Shopping.md")), "a personal note stays private");
  assert.ok(existsSync(join(v, "people/wizard/wiki/2-areas/Personal.md")));
  assert.ok(existsSync(join(v, "people/wizard/wiki/2-areas/TTRPG.md")), "hobby areas are the admin's");
  assert.ok(existsSync(join(v, "people/wizard/wiki/3-resources/Wizard.md")), "the note about the admin is theirs");
  assert.ok(existsSync(join(v, "people/wizard/daily/2026-11-14.md")), "past daily notes were the admin's");
  assert.ok(existsSync(join(v, "people/wizard/raw/sources/2026-10-27 - Knowledge Snapshot.md")), "a one-person vault's sources are that person's");
  assert.match(read(v, "household/wiki/logs/Log - 2026-10-27.md"), /\[\[people\/wizard\/raw\/sources\/2026-10-27/, "links to sources follow them");
  for (const gone of ["wiki", "daily", "inbox", "raw"]) assert.ok(!existsSync(join(v, gone)), `top-level ${gone}/ is gone`);
  assert.match(read(v, "people/wizard/profile.md"), /type: profile\nperson: wizard/);
  assert.ok(existsSync(join(v, "household/daily/README.md")) && existsSync(join(v, "people/wizard/inbox/.gitkeep")));
  // Dashboards follow their notes.
  assert.match(read(v, "HOME.md"), /FROM "household\/wiki\/2-areas" OR "people"/);
  assert.match(read(v, "Projects.base"), /file\.folder\.endsWith\("\/wiki\/1-projects"\)/);
  assert.match(read(v, "household/wiki/2-areas/Homelab.md"), /FROM "household\/wiki\/1-projects"/);
  assert.match(read(v, "people/wizard/wiki/2-areas/Personal.md"), /FROM "people\/wizard\/wiki\/1-projects"/);
  // Plugins point at the new places.
  assert.equal(JSON.parse(read(v, ".obsidian/daily-notes.json")).folder, "people/wizard/daily");
  assert.deepEqual(JSON.parse(read(v, ".obsidian/plugins/local-rest-api-second-brain-mcp-extension/data.json")).allowedPathPatterns, ["^household/wiki/", "^people/[^/]+/wiki/"]);
  assert.deepEqual(readFamily(v).members, [{ id: "wizard", name: "Wizard", role: "admin", aliases: ["Wiz"], voice: [], omi_uid: "uid-wizard" }]);
  // The household log names a note that is now private: init reports it.
  writeFileSync(join(v, "household/wiki/logs/Log - 2026-11-01.md"), "Filed [[Engagement Ring Shopping]] and [[RaidLab]].\n");
  assert.deepEqual(sharedLinksToPrivate(v), [{ note: "household/wiki/logs/Log - 2026-11-01.md", links: ["Engagement Ring Shopping"] }]);
  await assert.rejects(cli(v, "init", "--name", "X"), /already has members/);
});

test("add-member, services, shared agents and tokens", async () => {
  const v = legacyVault();
  await cli(v, "init", "--name", "Wizard", "--id", "wizard");
  await cli(v, "add-member", "--name", "Sam", "--alias", "Samantha", "--voice", "Sammy");
  assert.match(read(v, "people/sam/profile.md"), /^title: "Sam"/m);
  assert.ok(existsSync(join(v, "people/sam/wiki/1-projects/.gitkeep")));
  await cli(v, "add-service", "upstream-manager", "Upstream", "Manager");
  await cli(v, "add-shared", "house-assistant", "House", "assistant");
  const fam = readFamily(v);
  assert.deepEqual(fam.members.map((m) => [m.id, m.role]), [["wizard", "admin"], ["sam", "member"]]);
  assert.equal(fam.services[0].name, "Upstream Manager");
  await assert.rejects(cli(v, "add-member", "--name", "Sam", "--id", "sam"), /already in the family/);
  await assert.rejects(cli(v, "add-member", "--name", "Bad", "--id", "Bad Id"), /can't be an id/);

  const { token } = await cli(v, "token", "sam");
  assert.match(token, /^llmw_[A-Za-z0-9_-]{32}$/);
  const stored = readTokens(v);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].hash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!read(v, ".obsidian/plugins/llmwiki-mcp-bridge/data.json").includes(token), "the token itself is never stored");
  assert.equal(stored[0].kind, "member");
  assert.equal((await cli(v, "token", "upstream-manager")).token.length > 10, true);
  assert.equal(readTokens(v)[1].kind, "service");
  await assert.rejects(cli(v, "token", "nobody"), /isn't in schema\/family.md/);
  assert.equal((await cli(v, "revoke", "sam")).removed, 1);
  assert.deepEqual(readTokens(v).map((t) => t.id), ["upstream-manager"]);
});

test("token --as member: the admin's token for an assistant that sees only their own notes", async () => {
  const v = legacyVault();
  await cli(v, "init", "--name", "Wizard", "--id", "wizard");
  await cli(v, "add-service", "upstream-manager", "Upstream", "Manager");
  await cli(v, "token", "wizard", "--label", "faith", "--as", "member");
  assert.equal(readTokens(v).find((t) => t.label === "faith").as, "member");
  await assert.rejects(cli(v, "token", "upstream-manager", "--as", "member"), /only for a family member/);
  await assert.rejects(cli(v, "token", "wizard", "--as", "admin"), /--as member is the only choice/);
});

test("the bridge's token file is ignored by git", () => {
  const out = execFileSync("git", ["check-ignore", ".obsidian/plugins/llmwiki-mcp-bridge/data.json"], { cwd: REPO, encoding: "utf8" });
  assert.match(out, /llmwiki-mcp-bridge\/data.json/);
});

test("edge: names, Omi labels and ids can't be shared or misused; remove takes tokens too", async () => {
  const v = legacyVault();
  await cli(v, "init", "--name", "Wizard", "--id", "wizard", "--alias", "Wiz", "--omi-uid", "uid-wizard");
  await assert.rejects(cli(v, "add-member", "--name", "Sam", "--voice", "Speaker 1"), /per-conversation speaker label/);
  await assert.rejects(cli(v, "add-member", "--name", "Sam", "--voice", "SPEAKER_00"), /per-conversation/);
  await assert.rejects(cli(v, "add-member", "--name", "Sam", "--alias", "wiz"), /already means Wizard/);
  await assert.rejects(cli(v, "add-member", "--name", "Household"), /shared folder's name/);
  await assert.rejects(cli(v, "add-member", "--name", "Sam", "--omi-uid", "uid-wizard"), /already Wizard's/);
  await cli(v, "add-member", "--name", "Sam", "--omi-uid", "uid-sam");
  await cli(v, "update", "sam", "--omi-person", "p-sam-on-wiz", "--voice", "Sammy");
  assert.deepEqual(readFamily(v).members[1], { id: "sam", name: "Sam", role: "member", aliases: [], voice: ["Sammy"], omi_uid: "uid-sam", omi_people: ["p-sam-on-wiz"] });
  await assert.rejects(cli(v, "update", "wizard", "--omi-person", "p-sam-on-wiz"), /already means Sam/);
  await cli(v, "token", "sam"); await cli(v, "token", "sam");
  await assert.rejects(cli(v, "remove", "wizard"), /only admin/);
  assert.deepEqual(await cli(v, "remove", "sam"), { removed: "sam", tokens: 2 });
  assert.deepEqual(readFamily(v).members.map((m) => m.id), ["wizard"]);
  assert.ok(existsSync(join(v, "people/sam/profile.md")), "the folder stays");
  assert.equal(readTokens(v).length, 0);
});
