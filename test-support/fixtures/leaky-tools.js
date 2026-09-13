// NEGATIVE FIXTURE for test/module-boundary.test.js: looks client-free at the top
// level but pulls the service-role client in through a helper (transitive import).
const helper = require("./leaky-helper.js");
module.exports = { helper };
