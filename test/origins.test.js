// L-001 — the chat origin allowlist (buildAllowedOrigins). The safe-strict
// variant: when ALLOWED_ORIGINS is set to lock the public domain, the site's own
// Netlify deploy origins (production .netlify.app + deploy previews) are still
// trusted, so turning strict mode on never 403s the site's own chat or a preview.
// buildAllowedOrigins reads process.env at call time, so these drive it directly.

const { test } = require("node:test");
const assert = require("node:assert");
const { buildAllowedOrigins } = require("../server/netlify/functions/chat.js");

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
