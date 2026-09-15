// scripts/check-hosted-migrations.sh, the parser behind .githooks/pre-push (L-040). The
// parser is a bash function fed the CLI's stdout, so each case spawns Git Bash, sources
// the script and pipes a fixture in. The fixtures are the CLI's real table shape as
// captured on 2026-09-15 (supabase 2.105.0). Fail-closed is the property under test:
// only a recognised table with no Local-only row may exit 0.

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// On Windows a bare "bash" can resolve to WSL's System32 bash.exe, which has no view of
// this checkout; Git for Windows ships the bash the hook actually runs under.
function gitBash() {
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const candidate = join(pf, "Git", "bin", "bash.exe");
    if (existsSync(candidate)) return candidate;
  }
  const probe = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
  return probe.status === 0 && probe.stdout.trim() === "ok" ? "bash" : null;
}

const BASH = gitBash();
const SCRIPT = join(__dirname, "..", "scripts", "check-hosted-migrations.sh").replace(/\\/g, "/");

function parse(fixture) {
  const r = spawnSync(BASH, ["-c", `. "${SCRIPT}"; parse_migration_table`], { input: fixture, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const HEADER = "\n  \n   Local          | Remote         | Time (UTC)          \n  ----------------|----------------|---------------------\n";
const row = (local, remote, t) => `   ${local.padEnd(14)} | ${remote.padEnd(14)} | ${t} \n`;

const skip = BASH ? false : "Git Bash not found on this machine; the hook parser cannot be exercised here";

test("today's real hosted state: four Local-only rows block the push and are all named", { skip }, () => {
  const fixture = HEADER +
    row("20260605115456", "20260605115456", "2026-06-05 11:54:56") +
    row("20260903120000", "20260903120000", "2026-09-03 12:00:00") +
    row("20260906120000", "", "2026-09-06 12:00:00") +
    row("20260910120000", "", "2026-09-10 12:00:00") +
    row("20260913120000", "", "2026-09-13 12:00:00") +
    row("20260913180000", "", "2026-09-13 18:00:00");
  const r = parse(fixture);
  assert.strictEqual(r.status, 1);
  assert.match(r.out, /PUSH BLOCKED: hosted Supabase is missing migrations: 20260906120000 20260910120000 20260913120000 20260913180000/);
  assert.match(r.out, /db-migration-repair\.sh/);
});

test("every local migration carried on hosted: exit 0", { skip }, () => {
  const fixture = HEADER +
    row("20260605115456", "20260605115456", "2026-06-05 11:54:56") +
    row("20260913180000", "20260913180000", "2026-09-13 18:00:00");
  const r = parse(fixture);
  assert.strictEqual(r.status, 0);
  assert.match(r.out, /OK: hosted Supabase carries all 2 local migrations/);
});

test("a Remote-only row (hosted ahead of this checkout) warns but does not block", { skip }, () => {
  const fixture = HEADER +
    row("20260605115456", "20260605115456", "2026-06-05 11:54:56") +
    row("", "20260920000000", "2026-09-20 00:00:00");
  const r = parse(fixture);
  assert.strictEqual(r.status, 0);
  assert.match(r.out, /WARNING: hosted carries migrations this checkout lacks: 20260920000000/);
});

test("fail closed: an unrecognised table shape blocks rather than passes", { skip }, () => {
  const changedHeader = "\n   Version        | Status   | Applied\n  ----------------|----------|--------\n   20260605115456 | applied  | yes\n";
  const r = parse(changedHeader);
  assert.strictEqual(r.status, 1);
  assert.match(r.out, /PUSH BLOCKED: migration-list output was not recognised/);
});

test("fail closed: an unexpected row inside the table blocks", { skip }, () => {
  const fixture = HEADER + row("20260605115456", "20260605115456", "2026-06-05 11:54:56") + "   error: connection reset\n";
  const r = parse(fixture);
  assert.strictEqual(r.status, 1);
  assert.match(r.out, /not recognised \(unexpected row/);
});

test("fail closed: empty output (a CLI that printed nothing) blocks", { skip }, () => {
  const r = parse("");
  assert.strictEqual(r.status, 1);
  assert.match(r.out, /no Local \| Remote table found/);
});
