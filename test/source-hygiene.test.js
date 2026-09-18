// Source hygiene: no tracked text file may carry a raw control byte (anything below
// 0x20 other than tab, LF and CR, or DEL 0x7f).
//
// Why this exists: on 13 September 2026 a regex meant to read /[\x00-\x1f\x7f]/ landed in
// operatorTools.js with the three escapes turned into the LITERAL bytes (the Bash tool
// wrapper's backslash stripping), and its test fixture gained a literal BEL the same way.
// The code still worked, so nothing failed, but git classified both files as binary:
// every diff of them showed "Binary files differ", grep skipped them, and reviewers were
// blind to those lines for five days. A file that works and cannot be reviewed is worse
// than one that fails. This test turns the invariant into a build failure.
//
// The sweep is over `git ls-files` (what a reviewer would diff), minus a denylist of real
// binary types. Anything not on the denylist is treated as text, so a new binary type
// fails loudly here and gets added to the list, rather than a new text type slipping
// past unchecked.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BINARY_EXT = /\.(jpe?g|png|gif|ico|webp|avif|woff2?|ttf|otf|eot|pdf|zip|mp4)$/i;

// Positions (0-based byte offsets) of every disallowed control byte in a buffer.
// Tab (0x09), LF (0x0a) and CR (0x0d) are the only control bytes text may carry.
function findControlBytes(buf) {
  const hits = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) hits.push(i);
  }
  return hits;
}

// 1-based line and column of a byte offset, for a message a reader can act on.
function lineCol(buf, offset) {
  let line = 1, last = -1;
  for (let i = 0; i < offset; i++) if (buf[i] === 0x0a) { line++; last = i; }
  return { line, col: offset - last };
}

function trackedTextFiles() {
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, "git ls-files failed: " + (r.stderr || r.error));
  return r.stdout.split("\0").filter((f) => f && !BINARY_EXT.test(f));
}

test("findControlBytes reports a NUL, a BEL and a DEL and tolerates tab, LF and CR (negative fixture)", () => {
  // Bytes, not string escapes: an escape can be rewritten to the literal by a tool layer.
  const dirty = Buffer.from([0x61, 0x00, 0x62, 0x07, 0x63, 0x7f, 0x64, 0x09, 0x65, 0x0a, 0x66, 0x0d, 0x67]); // a<NUL>b<BEL>c<DEL>d<TAB>e<LF>f<CR>g
  assert.deepStrictEqual(findControlBytes(dirty), [1, 3, 5]);
  assert.deepStrictEqual(lineCol(dirty, 5), { line: 1, col: 6 });
  assert.deepStrictEqual(findControlBytes(Buffer.from("clean\ttext\r\nonly\n")), []);
});

test("no tracked text file carries a raw control byte (escape it: \\x00, \\x07, \\x1f, \\x7f)", () => {
  const files = trackedTextFiles();
  assert.ok(files.length > 100, "the sweep found only " + files.length + " tracked files; is git available?");
  const offenders = [];
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue; // a deleted-but-staged path; git diff will show it
    const buf = fs.readFileSync(abs);
    const hits = findControlBytes(buf);
    if (hits.length) {
      const first = lineCol(buf, hits[0]);
      offenders.push(`${f}:${first.line}:${first.col} (${hits.length} byte${hits.length === 1 ? "" : "s"}, first 0x${buf[hits[0]].toString(16).padStart(2, "0")})`);
    }
  }
  assert.deepStrictEqual(offenders, [], "raw control bytes in tracked text files:\n  " + offenders.join("\n  "));
});
