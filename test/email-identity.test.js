// shared/emailIdentity.js: the customer-email identity values (A4) are single-sourced.
// Two halves: (1) the values themselves, pinned to what every function file carried
// before the dedupe on 18 Sept 2026, so the refactor cannot have changed a default;
// (2) the invariant, a grep over the function files that fails if any of them declares
// its own copy again (a "mirrors X.js" comment is not a control; this is).

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const id = require("../shared/emailIdentity.js");

const FN_DIR = path.resolve(__dirname, "..", "server", "netlify", "functions");
const SHARED = path.resolve(__dirname, "..", "shared", "emailIdentity.js");

test("defaults: the live ICC values, exactly as the six files carried them before the dedupe", () => {
  const env = {}; // no overrides
  assert.strictEqual(id.siteUrl(env), "https://www.intelligentclean.co.uk");
  assert.strictEqual(id.privacyNoticeUrl(undefined, env), "https://www.intelligentclean.co.uk/privacy");
  assert.strictEqual(id.customerFrom(env), "Intelligent Carpet Cleaning <onboarding@resend.dev>");
  assert.strictEqual(id.customerReplyTo(env), "hello@intelligentclean.co.uk");
  assert.strictEqual(id.operatorEmail(env), "ben.graham240689@gmail.com");
  assert.strictEqual(id.operatorFrom(env), "ICC Bookings <onboarding@resend.dev>");
});

test("env overrides win, and are read per call rather than at module load", () => {
  const env = {
    PUBLIC_SITE_URL: "https://icc.example/",
    CUSTOMER_FROM: "ICC <hello@icc.example>",
    CUSTOMER_REPLY_TO: "replies@icc.example",
    OPERATOR_EMAIL: "mark@icc.example",
    OPERATOR_FROM: "ICC Bookings <bookings@icc.example>",
  };
  assert.strictEqual(id.siteUrl(env), "https://icc.example", "trailing slash stripped");
  assert.strictEqual(id.privacyNoticeUrl(undefined, env), "https://icc.example/privacy");
  assert.strictEqual(id.customerFrom(env), "ICC <hello@icc.example>");
  assert.strictEqual(id.customerReplyTo(env), "replies@icc.example");
  assert.strictEqual(id.operatorEmail(env), "mark@icc.example");
  assert.strictEqual(id.operatorFrom(env), "ICC Bookings <bookings@icc.example>");
  // The default env is process.env, read at call time.
  const before = process.env.CUSTOMER_REPLY_TO;
  process.env.CUSTOMER_REPLY_TO = "call-time@icc.example";
  try {
    assert.strictEqual(id.customerReplyTo(), "call-time@icc.example");
  } finally {
    if (before === undefined) delete process.env.CUSTOMER_REPLY_TO; else process.env.CUSTOMER_REPLY_TO = before;
  }
});

test("privacyNoticeUrl: an injected base wins over the env and a trailing slash on it is normalised", () => {
  const env = { PUBLIC_SITE_URL: "https://ignored.example" };
  assert.strictEqual(id.privacyNoticeUrl("https://example.test", env), "https://example.test/privacy");
  assert.strictEqual(id.privacyNoticeUrl("https://example.test/", env), "https://example.test/privacy");
  assert.strictEqual(id.privacyNoticeUrl("", env), "https://ignored.example/privacy", "an empty base falls through to the env");
});

// The invariant. Each pattern is a way a copy was written before; a hit outside the
// shared module means a seventh copy has landed and the values can drift again.
const COPY_PATTERNS = [
  /process\.env\.PUBLIC_SITE_URL/,
  /process\.env\.CUSTOMER_FROM/,
  /process\.env\.CUSTOMER_REPLY_TO/,
  /process\.env\.OPERATOR_EMAIL/,
  /process\.env\.OPERATOR_FROM/,
  /onboarding@resend\.dev/,
  /ben\.graham240689@gmail\.com/,
  /function privacyNoticeUrl\b/,
];

test("no function file declares its own copy of the email identity (the shared module is the only source)", () => {
  const files = fs.readdirSync(FN_DIR).filter((f) => f.endsWith(".js")).map((f) => path.join(FN_DIR, f));
  assert.ok(files.length > 20, "found only " + files.length + " function files");
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return; // a comment may still say "PUBLIC_SITE_URL"; code may not read it
      for (const p of COPY_PATTERNS) if (p.test(line)) hits.push(`${path.basename(f)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(hits, [], "email identity re-declared outside shared/emailIdentity.js:\n  " + hits.join("\n  "));
  // The patterns are live: the shared module itself matches at least the env reads.
  const shared = fs.readFileSync(SHARED, "utf8");
  assert.ok(/CUSTOMER_REPLY_TO/.test(shared) && /onboarding@resend\.dev/.test(shared), "the shared module holds the values");
});

test("the invariant check can fail: a fixture line with an env read is reported (negative control)", () => {
  const fixture = 'const replyTo = process.env.CUSTOMER_REPLY_TO || "hello@intelligentclean.co.uk";';
  assert.ok(COPY_PATTERNS.some((p) => p.test(fixture)));
  const comment = "// mirrors PUBLIC_SITE_URL in chat.js";
  assert.ok(/^\s*\/\//.test(comment), "comment lines are skipped by the sweep");
});
