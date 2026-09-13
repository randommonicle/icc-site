// L-001 — the origin allowlist + CORS policy (origins.js, extracted from chat.js for
// Beta 4 so the operator endpoint shares it). Two layers:
//   1. buildAllowedOrigins: the safe-strict variant — when ALLOWED_ORIGINS is set to lock
//      the public domain, the site's own Netlify deploy origins (production .netlify.app +
//      deploy previews) are still trusted, so turning strict mode on never 403s the
//      site's own chat or a preview.
//   2. createOriginPolicy: the request/response MATRIX every guarded endpoint relies on —
//      {strict, fail-open} x {allowed origin, foreign origin, no origin} -> the check
//      verdict and the CORS headers. Behaviour-preserving with what chat.js had inline.
// Both read process.env at call time, so withEnv drives them directly.

const { test } = require("node:test");
const assert = require("node:assert");
const { buildAllowedOrigins, getOrigin, createOriginPolicy } = require("../server/netlify/functions/origins.js");

const ENV_KEYS = ["ALLOWED_ORIGINS", "URL", "DEPLOY_URL", "DEPLOY_PRIME_URL"];

// Run fn with ONLY the given origin env vars set (others cleared), then restore,
// so a stray URL in the real environment cannot make a test pass or fail.
function withEnv(vars, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(vars)) { if (v != null) process.env[k] = v; }
  try { return fn(); }
  finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// --- buildAllowedOrigins ----------------------------------------------------

test("fail-open (ALLOWED_ORIGINS unset): deploy origin + prod domains + localhost, slashes stripped", () => {
  const origins = withEnv({ URL: "https://super-frangollo-c3a14a.netlify.app/" }, buildAllowedOrigins);
  assert.ok(origins.includes("https://super-frangollo-c3a14a.netlify.app"), "Netlify URL present, trailing slash stripped");
  assert.ok(origins.includes("https://intelligentclean.co.uk"));
  assert.ok(origins.includes("https://www.intelligentclean.co.uk"));
  assert.ok(origins.includes("http://localhost:8888"));
  assert.ok(!origins.some((o) => o.endsWith("/")), "no trailing slashes");
});

test("strict mode STILL trusts the site's own Netlify deploy origins (L-001 safe variant)", () => {
  const origins = withEnv({
    ALLOWED_ORIGINS: "https://intelligentclean.co.uk,https://www.intelligentclean.co.uk",
    URL: "https://super-frangollo-c3a14a.netlify.app",
    DEPLOY_PRIME_URL: "https://deploy-preview-54--super-frangollo-c3a14a.netlify.app",
  }, buildAllowedOrigins);
  // The explicit public domains are enforced...
  assert.ok(origins.includes("https://intelligentclean.co.uk"));
  assert.ok(origins.includes("https://www.intelligentclean.co.uk"));
  // ...and the live .netlify.app + the deploy preview are NOT locked out.
  assert.ok(origins.includes("https://super-frangollo-c3a14a.netlify.app"), "production .netlify.app still allowed");
  assert.ok(origins.includes("https://deploy-preview-54--super-frangollo-c3a14a.netlify.app"), "deploy preview still allowed");
});

test("strict mode does NOT allow an arbitrary third-party origin", () => {
  const origins = withEnv({
    ALLOWED_ORIGINS: "https://intelligentclean.co.uk",
    URL: "https://super-frangollo-c3a14a.netlify.app",
  }, buildAllowedOrigins);
  assert.ok(!origins.includes("https://evil.example.com"));
});

test("strict mode dedupes when an explicit origin equals a deploy origin", () => {
  const origins = withEnv({
    ALLOWED_ORIGINS: "https://intelligentclean.co.uk",
    URL: "https://intelligentclean.co.uk",
  }, buildAllowedOrigins);
  const count = origins.filter((o) => o === "https://intelligentclean.co.uk").length;
  assert.strictEqual(count, 1, "no duplicate origin");
});

test("strict mode with no Netlify deploy vars is exactly the explicit list", () => {
  const origins = withEnv({ ALLOWED_ORIGINS: "https://intelligentclean.co.uk" }, buildAllowedOrigins);
  assert.deepStrictEqual(origins, ["https://intelligentclean.co.uk"]);
});

// --- getOrigin ---------------------------------------------------------------

test("getOrigin: Origin header wins, Referer is the fallback (reduced to its origin), else empty", () => {
  assert.strictEqual(getOrigin({ headers: { origin: "https://www.intelligentclean.co.uk" } }), "https://www.intelligentclean.co.uk");
  assert.strictEqual(getOrigin({ headers: { referer: "https://www.intelligentclean.co.uk/book?x=1" } }), "https://www.intelligentclean.co.uk");
  assert.strictEqual(getOrigin({ headers: { origin: "https://a.example", referer: "https://b.example/p" } }), "https://a.example");
  assert.strictEqual(getOrigin({ headers: {} }), "");
  assert.strictEqual(getOrigin({ headers: { origin: "not a url" } }), "", "garbage never throws");
});

// --- createOriginPolicy: the request/response matrix -------------------------

const PROD = "https://intelligentclean.co.uk";
const DEPLOY = "https://super-frangollo-c3a14a.netlify.app";
const FOREIGN = "https://evil.example.com";
const quiet = () => {}; // silence the two diagnostic lines in tests

function strictPolicy() {
  return withEnv({ ALLOWED_ORIGINS: PROD, URL: DEPLOY }, () => createOriginPolicy({ log: quiet }));
}
function failOpenPolicy() {
  return withEnv({ URL: DEPLOY }, () => createOriginPolicy({ log: quiet }));
}

test("policy snapshots the allowlist + mode at construction (not per call)", () => {
  const p = strictPolicy();
  assert.strictEqual(p.strict, true);
  assert.deepStrictEqual(p.allowed, [PROD, DEPLOY]);
  // Env changes after construction do not leak into the built policy.
  withEnv({}, () => {
    assert.strictEqual(p.check(FOREIGN).ok, false, "still strict after env cleared");
  });
  assert.strictEqual(failOpenPolicy().strict, false);
});

test("strict: an allowed origin passes and is echoed in CORS", () => {
  const p = strictPolicy();
  assert.deepStrictEqual(p.check(PROD), { ok: true });
  assert.deepStrictEqual(p.check(DEPLOY), { ok: true }, "the site's own deploy origin passes");
  const h = p.corsHeaders(DEPLOY);
  assert.strictEqual(h["Access-Control-Allow-Origin"], DEPLOY);
  assert.strictEqual(h["Vary"], "Origin");
});

test("strict: a foreign origin is refused (403) and CORS falls back to the first allowed origin", () => {
  const p = strictPolicy();
  assert.deepStrictEqual(p.check(FOREIGN), { ok: false, status: 403, error: "Forbidden origin" });
  assert.strictEqual(p.corsHeaders(FOREIGN)["Access-Control-Allow-Origin"], PROD, "never echoes a foreign origin in strict mode");
});

test("strict: no origin at all (curl, same-origin fetch without the header) passes", () => {
  const p = strictPolicy();
  assert.deepStrictEqual(p.check(""), { ok: true });
  assert.strictEqual(p.corsHeaders("")["Access-Control-Allow-Origin"], PROD);
});

test("fail-open: an allowed origin passes and is echoed", () => {
  const p = failOpenPolicy();
  assert.deepStrictEqual(p.check(PROD), { ok: true });
  assert.strictEqual(p.corsHeaders(PROD)["Access-Control-Allow-Origin"], PROD);
});

test("fail-open: a foreign origin is let through, flagged, and echoed so the browser accepts the response", () => {
  const p = failOpenPolicy();
  assert.deepStrictEqual(p.check(FOREIGN), { ok: true, unrecognised: true });
  assert.strictEqual(p.corsHeaders(FOREIGN)["Access-Control-Allow-Origin"], FOREIGN);
});

test("fail-open: no origin passes; CORS falls back to the deploy origin (first in the list)", () => {
  const p = failOpenPolicy();
  assert.deepStrictEqual(p.check(""), { ok: true });
  assert.strictEqual(p.corsHeaders("")["Access-Control-Allow-Origin"], DEPLOY);
});

test("fail-open with no Netlify vars leads with the prod domain; the '*' fallback only exists for an empty list", () => {
  const p = withEnv({}, () => createOriginPolicy({ log: quiet }));
  assert.strictEqual(p.allowed[0], PROD, "prod domain leads when Netlify injects nothing");
  assert.strictEqual(p.corsHeaders("")["Access-Control-Allow-Origin"], PROD);
  // The '*' branch is unreachable through the env (the fail-open defaults are never
  // empty); pin it by driving corsHeaders on a policy whose allowlist is emptied.
  p.allowed.length = 0;
  assert.strictEqual(p.corsHeaders("")["Access-Control-Allow-Origin"], "*");
});

test("CORS allow-lists default to the chat contract and take per-endpoint overrides (operator needs Authorization)", () => {
  const dflt = strictPolicy().corsHeaders(PROD);
  assert.strictEqual(dflt["Access-Control-Allow-Headers"], "Content-Type");
  assert.strictEqual(dflt["Access-Control-Allow-Methods"], "POST, OPTIONS");
  const op = withEnv({ URL: DEPLOY }, () => createOriginPolicy({ headers: "Content-Type, Authorization", methods: "POST, OPTIONS", log: quiet }));
  assert.strictEqual(op.corsHeaders(PROD)["Access-Control-Allow-Headers"], "Content-Type, Authorization");
});

test("the diagnostic log fires only for unrecognised origins, with the mode named", () => {
  const seen = [];
  const log = (...a) => seen.push(a.join(" "));
  const strict = withEnv({ ALLOWED_ORIGINS: PROD }, () => createOriginPolicy({ log }));
  strict.check(PROD); strict.check("");
  assert.strictEqual(seen.length, 0, "allowed / absent origins are silent");
  strict.check(FOREIGN);
  assert.match(seen[0], /^Rejected origin: https:\/\/evil\.example\.com allowed: /);
  const open = withEnv({}, () => createOriginPolicy({ log }));
  open.check(FOREIGN);
  assert.match(seen[1], /^Unrecognised origin \(fail-open\): https:\/\/evil\.example\.com/);
});
