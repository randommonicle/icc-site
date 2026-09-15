// schemaNotReady.js: the one predicate behind every "not set up yet" 503. The three codes
// are the three shapes a deploy-before-migration takes on the live seam (L-040); the
// negatives prove it discriminates (a constraint violation or a missing FUNCTION must not
// read as "apply the migration").

const { test } = require("node:test");
const assert = require("node:assert");

const { schemaNotReady, SCHEMA_NOT_READY } = require("../server/netlify/functions/schemaNotReady.js");

test("the three schema-missing codes are not-ready: 42P01, 42703 and PostgREST's PGRST205", () => {
  assert.strictEqual(schemaNotReady({ code: "42P01", message: 'relation "expenses" does not exist' }), true);
  assert.strictEqual(schemaNotReady({ code: "42703", message: "column invoices.provider does not exist" }), true);
  assert.strictEqual(schemaNotReady({ code: "PGRST205", message: "Could not find the table 'public.expenses' in the schema cache" }), true);
  assert.deepStrictEqual([...SCHEMA_NOT_READY].sort(), ["42703", "42P01", "PGRST205"]);
});

test("other errors are not: a constraint violation, a missing rpc, no code, no error", () => {
  assert.strictEqual(schemaNotReady({ code: "23505", message: "duplicate key" }), false);
  assert.strictEqual(schemaNotReady({ code: "23P01", message: "exclusion violation" }), false);
  assert.strictEqual(schemaNotReady({ code: "PGRST202", message: "Could not find the function" }), false);
  assert.strictEqual(schemaNotReady({ message: "fetch failed" }), false);
  assert.strictEqual(schemaNotReady(null), false);
  assert.strictEqual(schemaNotReady(undefined), false);
});

test("a thrown Error carrying the code (the receipts.js/invoices.js convention) is recognised", () => {
  const e = Object.assign(new Error("column invoices.provider does not exist"), { code: "42703" });
  assert.strictEqual(schemaNotReady(e), true);
});
