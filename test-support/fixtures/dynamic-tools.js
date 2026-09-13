// NEGATIVE FIXTURE for test/module-boundary.test.js: a require whose argument is not
// a string literal. Cannot be reasoned about statically, so it is a violation on sight.
// Never called (no load-time side effect).
function load(name) {
  return require(name);
}
module.exports = { load };
