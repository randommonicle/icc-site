// D-040 operator assistant — the module-boundary control (Beta 4 slice 3; the addendum's
// "allowlist module-boundary test covering transitive imports, with a negative fixture
// that must fail"). A read-only facade is only a control if nothing in the tools module
// can reach the service-role client by another route, and a forbidden-name grep is not
// enough: pnl.js imports the write client at module level yet exports a pure buildPnl.
// So the check is a STATIC transitive require graph against an explicit allowlist.
//
// Slice 3 landed the checker + proved it can fail (three negative fixtures) + the positive
// case for pnlCalc.js; slice 4 adds THE assertion: the real operatorTools.js graph is
// exactly the client-free set. A future require of supabaseClient.js, adminAuth.js, a
// provider, Blobs or supabase-js anywhere under it (top level, inside a function, or via
// a helper) reds this file.

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { requireGraph, checkAllowlist, stripComments } = require("../test-support/moduleGraph.js");

const FN = (f) => path.resolve(__dirname, "..", "server", "netlify", "functions", f);
const FIX = (f) => path.resolve(__dirname, "..", "test-support", "fixtures", f);

// The client-free modules the operator tools may reach. Anything else is a violation.
const CLIENT_FREE = [FN("pnlCalc.js"), FN("period.js"), FN("receipts.js"), FN("readOnlyClient.js"), FN("assistantLoop.js")];
const PRIVILEGED = /supabaseClient\.js$|adminAuth\.js$|paymentProvider\.js$|invoiceProvider\.js$|smsProvider\.js$|blobStore\.js$|rateLimit\.js$|operatorAdmission\.js$|chat\.js$|handoffs\.js$|stripe-webhook\.js$/;

test("positive: pnlCalc.js reaches only client-free modules (period.js), no bare imports", () => {
  const g = requireGraph(FN("pnlCalc.js"));
  assert.deepStrictEqual([...g.files].sort(), [FN("period.js"), FN("pnlCalc.js")].sort());
  assert.deepStrictEqual([...g.bare], []);
  assert.deepStrictEqual(g.dynamic, []);
  const r = checkAllowlist(g, CLIENT_FREE, []);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

test("positive: the allowlist itself is client-free (none of its members reach a privileged module)", () => {
  for (const f of CLIENT_FREE) {
    const g = requireGraph(f);
    for (const reached of g.files) assert.ok(!PRIVILEGED.test(reached), path.basename(f) + " reaches " + reached);
    assert.ok(!g.bare.has("@supabase/supabase-js"), path.basename(f) + " imports supabase-js");
  }
});

test("THE BOUNDARY: operatorTools.js reaches exactly the client-free set, no bare imports, no dynamic requires", () => {
  const g = requireGraph(FN("operatorTools.js"));
  assert.deepStrictEqual([...g.files].sort(), [FN("operatorTools.js"), FN("pnlCalc.js"), FN("period.js"), FN("receipts.js")].sort());
  assert.deepStrictEqual([...g.bare], [], "no node_modules or builtins at all");
  assert.deepStrictEqual(g.dynamic, []);
  const r = checkAllowlist(g, CLIENT_FREE.concat([FN("operatorTools.js")]), []);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  for (const reached of g.files) assert.ok(!PRIVILEGED.test(reached), "privileged: " + reached);
});

test("the endpoint is where privilege lives: operatorChat.js reaches the client, auth and admission, and hands the tools only the facade", () => {
  const g = requireGraph(FN("operatorChat.js"));
  for (const must of ["adminAuth.js", "supabaseClient.js", "operatorAdmission.js", "readOnlyClient.js", "operatorTools.js", "assistantLoop.js", "origins.js", "rateLimit.js"]) {
    assert.ok(g.files.has(FN(must)), "operatorChat.js must reach " + must);
  }
  assert.ok(!g.files.has(FN("chat.js")), "the operator function does not bundle the customer chat");
  assert.ok(!g.files.has(FN("paymentProvider.js")) && !g.files.has(FN("invoiceProvider.js")) && !g.files.has(FN("smsProvider.js")), "no outbound side-effect module is reachable");
});

test("negative (prove-it-can-fail): an INDIRECT privileged import via a helper is flagged", () => {
  const g = requireGraph(FIX("leaky-tools.js"));
  const r = checkAllowlist(g, [FIX("leaky-tools.js"), FIX("leaky-helper.js")], []);
  assert.strictEqual(r.ok, false);
  assert.ok(r.offendingFiles.includes(FN("supabaseClient.js")), "supabaseClient.js must be named: " + r.offendingFiles.join(", "));
  assert.ok(r.offendingBare.includes("@supabase/supabase-js"), "the transitive bare import must be named too");
});

test("negative (prove-it-can-fail): a require INSIDE A FUNCTION BODY is flagged (a runtime hook would miss it)", () => {
  const g = requireGraph(FIX("lazy-tools.js"));
  const r = checkAllowlist(g, [FIX("lazy-tools.js")], []);
  assert.strictEqual(r.ok, false);
  assert.ok(r.offendingFiles.includes(FN("supabaseClient.js")), r.offendingFiles.join(", "));
});

test("negative (prove-it-can-fail): a NON-LITERAL require argument is a violation on sight", () => {
  const g = requireGraph(FIX("dynamic-tools.js"));
  const r = checkAllowlist(g, [FIX("dynamic-tools.js")], []);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.dynamic.length, 1);
  assert.strictEqual(r.dynamic[0].file, FIX("dynamic-tools.js"));
  assert.match(r.dynamic[0].snippet, /require\(name\)/);
});

test("negative: a bare import outside the bare allowlist is flagged, an allowlisted one is not", () => {
  // adminAuth.js imports @supabase/supabase-js at the top level.
  const g = requireGraph(FN("adminAuth.js"));
  assert.strictEqual(checkAllowlist(g, [FN("adminAuth.js")], []).ok, false);
  assert.strictEqual(checkAllowlist(g, [FN("adminAuth.js")], ["@supabase/supabase-js"]).ok, true);
});

test("stripComments removes // and /* */ comments but keeps a URL's // inside a string", () => {
  const src = 'const a = 1; // require("./x")\n/* require("./y") */\nconst u = "https://example.com/z";\nrequire("./real.js");';
  const out = stripComments(src);
  assert.ok(!out.includes('"./x"'));
  assert.ok(!out.includes('"./y"'));
  assert.ok(out.includes("https://example.com/z"));
  assert.ok(out.includes('require("./real.js")'));
});
