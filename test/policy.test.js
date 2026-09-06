// Locks the single-source invariant for the deposit/re-clean policy (D-006/L-031).
// The deposit percentage MUST be derived from pricing.deposit_rate, and the
// customer-facing sentences MUST render the canonical figures. If someone hardcodes
// a divergent percent, changes the rate without the words following, or a float
// leaks into the shown number, these fail.
const test = require("node:test");
const assert = require("node:assert");
const policy = require("../shared/config/policy.js");
const pricing = require("../shared/config/pricing.js");

test("deposit percent is derived from the single pricing.deposit_rate source", () => {
  assert.ok(
    Math.abs(policy.DEPOSIT.percent / 100 - pricing.deposit_rate) < 1e-9,
    "DEPOSIT.percent must equal pricing.deposit_rate expressed as a percentage"
  );
});

test("the shown deposit percent is clean, with no floating-point noise", () => {
  // e.g. a naive deposit_rate * 100 yields 10.000000000000002, which would render
  // in the sentence; the derivation must round it to a clean 2dp value.
  assert.strictEqual(policy.DEPOSIT.percent, Math.round(policy.DEPOSIT.percent * 100) / 100);
});

test("policy sentences carry the canonical, single-sourced figures", () => {
  const deposit = policy.depositSentence();
  assert.match(deposit, new RegExp(`${policy.DEPOSIT.percent}% deposit`));
  assert.match(deposit, new RegExp(`${policy.DEPOSIT.fullRefundNoticeDays} or more days`));

  const reClean = policy.reCleanSentence();
  assert.match(reClean, new RegExp(`${policy.RECLEAN.windowHours} hours`));
  assert.match(reClean, /permanent staining/);
});
