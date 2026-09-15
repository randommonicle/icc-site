// Is this Supabase error "the schema this code needs is not there yet"?
//
// A deploy that lands before its migration is applied (it happened on 2026-09-14, L-040)
// reaches the live seam as one of THREE codes, and only one of them is the Postgres
// SQLSTATE the tests originally faked:
//   42P01     undefined_table  - Postgres; PostgREST forwards it only while its schema
//                                cache still lists a table that has since been dropped
//   42703     undefined_column - Postgres; the table exists, a column does not
//   PGRST205  PostgREST itself - the table is not in its schema cache, which is what a
//                                never-created table looks like; Postgres is never asked
// A missing FUNCTION is PGRST202, but the one rpc caller (operatorAdmission.js) refuses on
// ANY error, so it is not a readiness question and is deliberately not listed.
//
// One predicate in one place: expenses.js, pnl.js and accountingExport.js all map it to a
// 503 "not set up yet", and invoices.js uses it to refuse a Create before the Stripe call.
// Pure, no client, so operatorTools' module-boundary test is unaffected.

const SCHEMA_NOT_READY = new Set(["42P01", "42703", "PGRST205"]);

function schemaNotReady(error) {
  return !!error && SCHEMA_NOT_READY.has(error.code);
}

module.exports = { schemaNotReady, SCHEMA_NOT_READY };
