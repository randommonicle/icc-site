// Guard: admin.html's inline <script> must parse. It is a single large inline
// block, so ONE syntax error (e.g. a duplicate `const`) takes down the whole
// dashboard — login included — not just the feature being edited, and nothing
// else in `node --test` exercises it. `new Function(src)` COMPILES the body
// without running it, so it throws on a syntax error but never touches the
// browser globals (document, fetch, ...) the script references at call time.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("admin.html inline script parses (no syntax errors)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "admin.html has an inline <script> block");
  assert.doesNotThrow(() => { new Function(m[1]); }, "inline script must be syntactically valid");
});
