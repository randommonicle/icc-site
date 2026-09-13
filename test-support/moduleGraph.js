// Static transitive require graph — the module-boundary control for the operator
// assistant's tools (D-040 addendum: "the operator tool module imports ONLY client-free
// modules, enforced by an ALLOWLIST module-boundary test covering transitive imports").
//
// Static on purpose: a runtime Module._load hook only sees requires that execute at load
// time, so a handler that does `require("./supabaseClient.js")` inside a function body
// would pass a runtime check and still reach the service-role client. Reading the source
// finds every require(<literal>) wherever it sits, and treats a require whose argument is
// NOT a string literal as a violation outright (it cannot be reasoned about statically).
//
// Lives in test-support/ (not test/) because Node's runner default glob picks up every
// .js under test/ and would report this file and the fixtures as vacuous passing files.

const fs = require("node:fs");
const path = require("node:path");

// Strip // and /* */ comments so a require mentioned in prose is not counted. Strings
// are not tracked; a "//" inside a string truncates that line, which cannot hide a real
// require because every require in this codebase starts its own line.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const REQUIRE_RE = /\brequire\s*\(\s*([^)]*?)\s*\)/g;
const LITERAL_RE = /^(['"])([^'"]+)\1$/;

// Walk from entryAbs. Returns { files: Set<abs path>, bare: Set<specifier>, dynamic: [ {file, snippet} ] }.
// Relative specifiers are resolved with require.resolve from the requiring file's dir (so
// index files and extensions resolve exactly as Node would); bare specifiers (node:
// builtins, node_modules) are recorded by name and not descended into.
function requireGraph(entryAbs) {
  const files = new Set();
  const bare = new Set();
  const dynamic = [];
  const queue = [path.resolve(entryAbs)];
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.add(file);
    const src = stripComments(fs.readFileSync(file, "utf8"));
    let m;
    REQUIRE_RE.lastIndex = 0;
    while ((m = REQUIRE_RE.exec(src))) {
      const arg = m[1].trim();
      const lit = LITERAL_RE.exec(arg);
      if (!lit) { dynamic.push({ file, snippet: m[0] }); continue; }
      const spec = lit[2];
      if (spec.startsWith(".") || path.isAbsolute(spec)) {
        queue.push(require.resolve(spec, { paths: [path.dirname(file)] }));
      } else {
        bare.add(spec);
      }
    }
  }
  return { files, bare, dynamic };
}

// Check a graph against an allowlist of absolute file paths + bare specifiers.
// Returns { ok, offendingFiles:[abs], offendingBare:[spec], dynamic:[...] }.
function checkAllowlist(graph, allowedFiles, allowedBare) {
  const af = new Set([...allowedFiles].map((p) => path.resolve(p)));
  const ab = new Set(allowedBare || []);
  const offendingFiles = [...graph.files].filter((f) => !af.has(f));
  const offendingBare = [...graph.bare].filter((b) => !ab.has(b));
  const ok = offendingFiles.length === 0 && offendingBare.length === 0 && graph.dynamic.length === 0;
  return { ok, offendingFiles, offendingBare, dynamic: graph.dynamic };
}

module.exports = { requireGraph, checkAllowlist, stripComments };
