// Slice 5d — unit tests for the Supabase-Auth admin gate. requireAdmin is tested
// with a fake auth client (no network); the allowlist + token paths are pinned.

const { test } = require("node:test");
const assert = require("node:assert");
const { requireAdmin, adminEmailSet } = require("../server/netlify/functions/adminAuth.js");

// Fake whose auth.getUser resolves to a fixed { data, error } (or throws).
function fakeAuth(result, opts = {}) {
  return { auth: { getUser: async () => { if (opts.throws) throw new Error("network"); return result; } } };
}
function ev(token) {
  return { headers: token ? { authorization: "Bearer " + token } : {} };
}

test("requireAdmin: 401 when there is no Bearer token (before any Supabase call)", async () => {
  let called = 0;
  const sb = { auth: { getUser: async () => { called++; return { data: { user: { email: "x" } } }; } } };
  const r = await requireAdmin(ev(null), sb);
  assert.deepStrictEqual(r, { ok: false, status: 401, error: "Unauthorized" });
  assert.strictEqual(called, 0, "must not call Supabase without a token");
});

test("requireAdmin: 503 when Supabase is not configured", async () => {
  const r = await requireAdmin(ev("tok"), null);
  assert.strictEqual(r.status, 503);
});

test("requireAdmin: 401 on an invalid token (getUser returns an error)", async () => {
  const r = await requireAdmin(ev("bad"), fakeAuth({ data: { user: null }, error: { message: "invalid" } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 401);
});

test("requireAdmin: 401 when getUser throws (network/Supabase down)", async () => {
  const r = await requireAdmin(ev("x"), fakeAuth(null, { throws: true }));
  assert.strictEqual(r.status, 401);
});

test("requireAdmin: 403 for a valid session whose email is not allowlisted", async () => {
  const prev = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "mark_director@intelligentclean.co.uk";
  try {
    const r = await requireAdmin(ev("good"), fakeAuth({ data: { user: { email: "stranger@example.com" } }, error: null }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 403);
  } finally {
    if (prev !== undefined) process.env.ADMIN_EMAILS = prev; else delete process.env.ADMIN_EMAILS;
  }
});

test("requireAdmin: ok for a valid allowlisted session (case-insensitive email)", async () => {
  const prev = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "Mark_Director@intelligentclean.co.uk,ben@intelligentclean.co.uk";
  try {
    const r = await requireAdmin(ev("good"), fakeAuth({ data: { user: { email: "MARK_director@intelligentclean.co.uk", id: "u1" } }, error: null }));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.user.id, "u1");
  } finally {
    if (prev !== undefined) process.env.ADMIN_EMAILS = prev; else delete process.env.ADMIN_EMAILS;
  }
});

test("adminEmailSet: defaults to the two operators when the env var is unset", () => {
  const prev = process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAILS;
  try {
    const s = adminEmailSet();
    assert.ok(s.has("mark_director@intelligentclean.co.uk"));
    assert.ok(s.has("ben@intelligentclean.co.uk"));
    assert.strictEqual(s.size, 2);
  } finally {
    if (prev !== undefined) process.env.ADMIN_EMAILS = prev;
  }
});
