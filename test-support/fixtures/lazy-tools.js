// NEGATIVE FIXTURE for test/module-boundary.test.js: no top-level privileged import,
// but a require inside a function body. A runtime load hook would never see this;
// the static walk must. The function is never called (no load-time side effect).
function later() {
  return require("../../server/netlify/functions/supabaseClient.js");
}
module.exports = { later };
