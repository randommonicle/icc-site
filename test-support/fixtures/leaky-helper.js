// NEGATIVE FIXTURE for test/module-boundary.test.js: a helper that reaches the
// service-role client. Anything that imports this (even indirectly) must be flagged.
const { getSupabaseAdmin } = require("../../server/netlify/functions/supabaseClient.js");
module.exports = { getSupabaseAdmin };
