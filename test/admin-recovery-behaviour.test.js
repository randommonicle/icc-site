// Behavioural test of admin.html's password-recovery block (D-046). The static pins in
// admin-html-syntax.test.js are string matches; a reviewer showed a `return;` placed
// before the clears would pass them (cross-agent review, GPT, 18 Sept 2026). This file
// runs the page's real inline script in a node:vm context with a stub DOM, fetch, location
// and history, and asserts what the code DOES: the fragment is wiped before the token is
// kept, the token is dropped on every exit from the recovery card, the requests carry the
// right URL, method, headers and body, and no sink (console, storage) ever sees the token.
//
// The stub DOM is deliberately minimal: elements are plain objects keyed by id with the
// three properties the script uses (style, value, textContent). The script's only
// top-level side effect is initPasswordRecovery(), so loading it is safe.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TOKEN = "eyJ-recovery-token-for-the-test";

// Builds a fresh page context. `hash` is the URL fragment the page loads with; `fetchImpl`
// answers every fetch. Returns handles to inspect afterwards.
function loadPage({ hash = "", fetchImpl } = {}) {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8").replace(/\r\n/g, "\n");
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, value: "", textContent: "", focused: false, focus() { this.focused = true; } });
  const location = { hash, pathname: "/admin", search: "", origin: "https://admin.example" };
  // replaceState records the URL it was given AND what the page held as the token at that
  // instant, so "wiped before the token is kept" is asserted as an order, not as two facts.
  const history = { replaced: [], tokenAtWipe: [], replaceState(_s, _t, url) { this.replaced.push(url); this.tokenAtWipe.push(vm.runInContext("recoveryToken", ctx)); location.hash = ""; } };
  const sinks = []; // every string that reached console or storage
  const consoleStub = {};
  for (const m of ["log", "error", "warn", "info", "debug"]) consoleStub[m] = (...a) => sinks.push(a.map(String).join(" "));
  const storage = { setItem: (k, v) => sinks.push(String(k) + "=" + String(v)), getItem: () => null, removeItem() {} };
  const fetches = [];
  const ctx = {
    document: { getElementById: el },
    location, history, console: consoleStub, localStorage: storage, sessionStorage: storage,
    fetch: async (url, init) => { fetches.push({ url, init }); return fetchImpl ? fetchImpl(url, init) : { ok: true, status: 200, json: async () => ({}) }; },
    AbortSignal: { timeout: () => undefined },
    URLSearchParams, JSON, Promise, Date, Number, String, Math, Object, Array, Error, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "admin.html" });
  const token = () => vm.runInContext("recoveryToken", ctx);
  return { ctx, el, els, location, history, sinks, fetches, token };
}

test("a recovery fragment is wiped from the URL before the token is kept, and the recovery card replaces the sign-in card", () => {
  const p = loadPage({ hash: `#access_token=${TOKEN}&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery` });
  assert.deepStrictEqual(p.history.replaced, ["/admin"], "replaceState wiped the fragment, keeping only the path");
  assert.deepStrictEqual(p.history.tokenAtWipe, [""], "at the instant of the wipe the page held no token yet: wipe first, keep second");
  assert.strictEqual(p.location.hash, "");
  assert.strictEqual(p.token(), TOKEN, "the access token is held in memory");
  assert.strictEqual(p.el("recoveryCard").style.display, "block");
  assert.strictEqual(p.el("loginCard").style.display, "none");
  assert.ok(p.el("newPasswordInput").focused, "the new-password field is focused");
  assert.deepStrictEqual(p.sinks, [], "nothing reached console or storage");
});

test("no fragment: nothing happens, no replaceState, no token", () => {
  const p = loadPage();
  assert.deepStrictEqual(p.history.replaced, []);
  assert.strictEqual(p.token(), "");
  assert.strictEqual(p.el("recoveryCard").style.display, undefined, "the card was never touched");
});

test("an error fragment (expired or reused link) is wiped and explained on the sign-in card; a fragment carrying both an error and a token keeps no token", () => {
  const expired = loadPage({ hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" });
  assert.deepStrictEqual(expired.history.replaced, ["/admin"]);
  assert.match(expired.el("loginError").textContent, /expired or was already used/);
  assert.strictEqual(expired.el("loginError").style.display, "block");
  assert.strictEqual(expired.token(), "");
  assert.notStrictEqual(expired.el("recoveryCard").style.display, "block");
  const both = loadPage({ hash: `#access_token=${TOKEN}&type=recovery&error_code=otp_expired` });
  assert.strictEqual(both.token(), "", "the error branch wins and the token is not kept");
  assert.deepStrictEqual(both.history.replaced, ["/admin"], "wiped all the same");
});

test("Back to sign in drops the token, the typed passwords and the error", () => {
  const p = loadPage({ hash: `#access_token=${TOKEN}&type=recovery` });
  p.el("newPasswordInput").value = "typed-one";
  p.el("newPasswordConfirm").value = "typed-two";
  p.el("recoveryError").textContent = "stale";
  p.el("recoveryError").style.display = "block";
  p.ctx.showLoginCard();
  assert.strictEqual(p.token(), "");
  assert.strictEqual(p.el("newPasswordInput").value, "");
  assert.strictEqual(p.el("newPasswordConfirm").value, "");
  assert.strictEqual(p.el("recoveryError").style.display, "none");
  assert.strictEqual(p.el("loginCard").style.display, "block");
  assert.strictEqual(p.el("recoveryCard").style.display, "none");
});

test("saving a password: one PUT to /auth/v1/user with the bearer, then the card is left through showLoginCard and the note shows", async () => {
  const p = loadPage({ hash: `#access_token=${TOKEN}&type=recovery`, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: "u1" }) }) });
  p.el("newPasswordInput").value = "a-new-password";
  p.el("newPasswordConfirm").value = "a-new-password";
  await p.ctx.setNewPassword();
  assert.strictEqual(p.fetches.length, 1);
  const { url, init } = p.fetches[0];
  assert.match(url, /\/auth\/v1\/user$/);
  assert.strictEqual(init.method, "PUT");
  assert.strictEqual(init.headers.Authorization, "Bearer " + TOKEN);
  assert.ok(init.headers.apikey, "the publishable key travels as apikey");
  assert.deepStrictEqual(JSON.parse(init.body), { password: "a-new-password" });
  assert.strictEqual(p.token(), "", "the token is dropped after use");
  assert.strictEqual(p.el("newPasswordInput").value, "");
  assert.strictEqual(p.el("loginCard").style.display, "block");
  assert.match(p.el("loginNote").textContent, /Password updated/);
  assert.deepStrictEqual(p.sinks, []);
});

test("the client refusals never call the network and keep the session; a GoTrue refusal is shown as text and keeps the session for a retry", async () => {
  let status = 422;
  const p = loadPage({ hash: `#access_token=${TOKEN}&type=recovery`, fetchImpl: async () => ({ ok: false, status, json: async () => ({ code: 422, error_code: "same_password", msg: "New password should be different from the old password." }) }) });
  p.el("newPasswordInput").value = "short";
  p.el("newPasswordConfirm").value = "short";
  await p.ctx.setNewPassword();
  assert.match(p.el("recoveryError").textContent, /at least 8/);
  p.el("newPasswordInput").value = "long-enough-one";
  p.el("newPasswordConfirm").value = "long-enough-two";
  await p.ctx.setNewPassword();
  assert.match(p.el("recoveryError").textContent, /do not match/);
  assert.strictEqual(p.fetches.length, 0, "no network call for a client refusal");
  assert.strictEqual(p.token(), TOKEN);
  p.el("newPasswordConfirm").value = "long-enough-one";
  await p.ctx.setNewPassword();
  assert.strictEqual(p.fetches.length, 1);
  assert.strictEqual(p.el("recoveryError").textContent, "New password should be different from the old password.");
  assert.strictEqual(p.token(), TOKEN, "a retryable refusal keeps the session");
  assert.strictEqual(p.el("newPasswordInput").value, "long-enough-one", "and the typed password, for the retry");
});

test("a 401 on the save is terminal: the token and the typed passwords are dropped and the sign-in card explains", async () => {
  const p = loadPage({ hash: `#access_token=${TOKEN}&type=recovery`, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ msg: "invalid JWT" }) }) });
  p.el("newPasswordInput").value = "a-new-password";
  p.el("newPasswordConfirm").value = "a-new-password";
  await p.ctx.setNewPassword();
  assert.strictEqual(p.token(), "");
  assert.strictEqual(p.el("newPasswordInput").value, "");
  assert.strictEqual(p.el("newPasswordConfirm").value, "");
  assert.strictEqual(p.el("loginCard").style.display, "block");
  assert.strictEqual(p.el("recoveryCard").style.display, "none");
  assert.match(p.el("loginError").textContent, /expired or was already used/);
});

test("requesting a reset: POST /auth/v1/recover with this origin + /admin as redirect_to; 200 shows the non-committal note, 429 its own message, an empty email never calls the network", async () => {
  let status = 200;
  const p = loadPage({ fetchImpl: async () => ({ ok: status === 200, status, json: async () => ({}) }) });
  await p.ctx.requestPasswordReset();
  assert.strictEqual(p.fetches.length, 0, "no email, no request");
  assert.match(p.el("loginError").textContent, /Enter your email/);
  p.el("emailInput").value = "someone@example.test";
  await p.ctx.requestPasswordReset();
  const { url, init } = p.fetches[0];
  assert.strictEqual(url, "https://qzcfgpfvzpynnjgriqqn.supabase.co/auth/v1/recover?redirect_to=" + encodeURIComponent("https://admin.example/admin"));
  assert.strictEqual(init.method, "POST");
  assert.deepStrictEqual(JSON.parse(init.body), { email: "someone@example.test" });
  assert.match(p.el("loginNote").textContent, /^If that address has an admin account/);
  assert.strictEqual(p.el("loginError").style.display, "none", "the earlier error is hidden by the note");
  status = 429;
  await p.ctx.requestPasswordReset();
  assert.match(p.el("loginError").textContent, /Too many reset emails/);
  assert.strictEqual(p.el("loginNote").style.display, "none", "and the note by the error");
  status = 400; // GoTrue's validation_failed for a malformed address
  await p.ctx.requestPasswordReset();
  assert.strictEqual(p.el("loginError").textContent, "Check the email address.");
  status = 500;
  await p.ctx.requestPasswordReset();
  assert.match(p.el("loginError").textContent, /Try again in a minute/);
  assert.deepStrictEqual(p.sinks, []);
});

test("a throw inside the fragment handling is reported on the sign-in card and never stops the rest of the script", () => {
  // A renamed element id is the realistic cause: getElementById returns null and the
  // handler throws. The page must still finish loading (later declarations initialised).
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8").replace(/\r\n/g, "\n");
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {};
  const el = (id) => id === "recoveryCard" ? null : (els[id] || (els[id] = { id, style: {}, value: "", textContent: "", focus() {} }));
  const ctx = {
    document: { getElementById: el },
    location: { hash: `#access_token=${TOKEN}&type=recovery`, pathname: "/admin", search: "", origin: "https://admin.example" },
    history: { replaceState() { ctx.location.hash = ""; } },
    console: {}, URLSearchParams, JSON, Promise, Date, Number, String, Math, Object, Array, Error, encodeURIComponent, setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  assert.doesNotThrow(() => vm.runInContext(src, ctx, { filename: "admin.html" }), "the script completes");
  assert.match(el("loginError").textContent, /did not work/);
  assert.strictEqual(typeof vm.runInContext("operatorHistory", ctx), "object", "a declaration far below the recovery block is initialised (no TDZ)");
});
