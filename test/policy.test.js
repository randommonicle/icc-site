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

test("the statutory cancellation right is complete and single-sourced (GATE 0 T-1)", () => {
  const paras = policy.cancellationRightParagraphs();
  assert.ok(Array.isArray(paras) && paras.length >= 3, "expected the cancellation right as paragraphs");
  const text = paras.join(" ");
  // The window is stated from the single numeric source, so words and value cannot drift.
  assert.match(text, new RegExp(`${policy.CANCELLATION.statutoryDays} days`));
  assert.match(text, /right to cancel/i);
  assert.match(text, /distance contract/i);
  assert.match(text, /deposit/i, "must explain how the deposit interacts with the right");
  assert.match(text, /precedence/i, "the statutory right must be stated to prevail over the commercial charges");
});

test("both /terms and the confirmation email render the cancellation right", () => {
  // Reg 13 (pre-contract) and reg 16 (durable medium) both require the disclosure, so
  // the clause must reach the page AND the email. Static source checks in the
  // chat-client-parity style: they fail loudly if a surface drops the wiring, which is
  // the exact class of miss that shipped the BOOKING_READY silent-drop (L-008).
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const terms = fs.readFileSync(path.join(root, "site", "src", "pages", "terms.astro"), "utf8");
  const chat = fs.readFileSync(path.join(root, "server", "netlify", "functions", "chat.js"), "utf8");
  assert.match(terms, /cancellationRightParagraphs\(\)/, "/terms must render the cancellation right");
  assert.match(chat, /cancellationRightParagraphs\(\)/, "the confirmation email must render the cancellation right");
});
