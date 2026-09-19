// Guard: admin.html's inline <script> must parse. It is a single large inline
// block, so ONE syntax error (e.g. a duplicate `const`) takes down the whole
// dashboard — login included — not just the feature being edited, and nothing
// else in `node --test` exercises it. `new Function(src)` COMPILES the body
// without running it, so it throws on a syntax error but never touches the
// browser globals (document, fetch, ...) the script references at call time.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("admin.html inline script parses (no syntax errors)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "admin.html has an inline <script> block");
  assert.doesNotThrow(() => { new Function(m[1]); }, "inline script must be syntactically valid");
});

// D-040 operator assistant panel: inert rendering is the one addendum control that lives
// in the browser, so pin it statically. The panel's script block is everything after its
// banner comment; nothing in it may build markup from data.
test("admin.html operator panel renders with textContent only and mirrors the server's transcript bound", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const start = html.indexOf("// --- D-040 operator assistant panel");
  assert.ok(start > 0, "the operator panel script block is present");
  const block = html.slice(start, html.indexOf("</script>", start));
  const code = require("../test-support/moduleGraph.js").stripComments(block); // the banner comment names innerHTML in prose
  for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
    assert.ok(!code.includes(banned), "operator panel must not use " + banned);
  }
  assert.ok(block.includes(".textContent = m.content"), "messages are rendered via textContent");
  assert.ok(block.includes(".textContent = st.text"), "status lines are rendered via textContent");
  // A stopped/failed turn is never replayed as an assistant reply (the server 400s a
  // transcript that does not alternate): the only assistant push sits inside the ok branch.
  const okBranch = code.indexOf('if(res && res.ok && data && data.status === "done" && text){');
  const pushStmt = 'operatorHistory.push({ role: "assistant"';
  const push = code.indexOf(pushStmt);
  assert.ok(okBranch > 0 && push > okBranch && code.indexOf('role: "assistant"', push + pushStmt.length) < 0, "assistant replies are pushed only for a real, complete turn");
  assert.ok(block.includes("operatorHistory.pop(); input.value = q;"), "a refused turn puts the question back and leaves the history alternating");
  // The client cap equals the server cap.
  const { LIMITS } = require("../server/netlify/functions/operatorChat.js");
  const m = block.match(/const OPERATOR_MAX_HISTORY = (\d+);/);
  assert.ok(m, "OPERATOR_MAX_HISTORY is declared");
  assert.strictEqual(Number(m[1]), LIMITS.maxHistory);
  assert.ok(html.includes('id="operatorSection"') && html.includes('id="operatorTranscript"') && html.includes('maxlength="4000"'));
});

// D-045: the panel polls a background turn. The client's patience must exceed the server's
// turn deadline (else the panel gives up on a turn the server is still allowed to finish),
// the poll must carry the turn id as a query string to the same endpoint, and a timed-out
// turn puts the question back like every other refusal.
test("admin.html operator panel polls GET ?turn= and waits longer than the server's turn deadline", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const start = html.indexOf("// --- D-040 operator assistant panel");
  const block = html.slice(start, html.indexOf("</script>", start));
  const { deadlineMs } = require("../server/netlify/functions/operatorTurnRunner.js");
  const cap = block.match(/const OPERATOR_WAIT_CAP_MS = (\d+);/);
  assert.ok(cap, "OPERATOR_WAIT_CAP_MS is declared");
  assert.ok(Number(cap[1]) > deadlineMs({}), "the client cap (" + cap[1] + ") exceeds the server's default deadline (" + deadlineMs({}) + ")");
  const first = block.match(/const OPERATOR_POLL_FIRST_MS = (\d+);/);
  const every = block.match(/const OPERATOR_POLL_EVERY_MS = (\d+);/);
  assert.ok(first && every && Number(first[1]) >= 1000 && Number(every[1]) >= 1000, "polls are at least a second apart");
  assert.ok(block.includes('fetch("/api/v1/operator-chat?turn=" + encodeURIComponent(turnId)'), "the poll hits the same endpoint with the turn id");
  assert.ok(block.includes('if(res.status === 202 && data && typeof data.turn_id === "string"){'), "a 202 with a turn id is what starts the poll");
  assert.ok(block.includes('data.status === "queued" || data.status === "running"'), "queued and running keep polling");
  const timeout = block.indexOf("The assistant did not answer in time. Your question is back in the box.");
  assert.ok(timeout > 0 && timeout > block.indexOf("operatorHistory.pop(); input.value = q;"), "a timed-out turn puts the question back with one message");
  // Every fetch in the panel is time-bounded: a hung request must not hold operatorBusy
  // past the cap (cross-agent review, GPT round 1, 17 Sept 2026).
  assert.ok(block.includes("signal: AbortSignal.timeout(OPERATOR_POST_TIMEOUT_MS)"), "the hand-off POST carries a timeout");
  assert.ok(block.includes("signal: AbortSignal.timeout(OPERATOR_POLL_TIMEOUT_MS)"), "each poll carries a timeout");
  const postT = block.match(/const OPERATOR_POST_TIMEOUT_MS = (\d+);/);
  const pollT = block.match(/const OPERATOR_POLL_TIMEOUT_MS = (\d+);/);
  assert.ok(postT && pollT && Number(pollT[1]) < Number(cap[1]) && Number(postT[1]) < Number(cap[1]), "both timeouts sit inside the cap");
  assert.strictEqual((block.match(/await fetch\(/g) || []).length, 2, "the panel makes exactly the two fetches pinned above");
  // The idempotency key: one uuid per question, sent as turn_id, kept when the hand-off's
  // answer was lost (network error or timeout) so re-asking resumes the same turn.
  assert.ok(block.includes("crypto.randomUUID()"), "a key is generated per question");
  assert.ok(block.includes("body: JSON.stringify({ messages: operatorHistory, turn_id: key })"), "the key travels as turn_id");
  assert.strictEqual((block.match(/operatorPending = \{ key: key, text: q \};/g) || []).length, 2, "the key is kept on the network-error branch and on the poll timeout");
  assert.ok(block.includes("(operatorPending && operatorPending.text === q) ? operatorPending.key : crypto.randomUUID()"), "the same text reuses the pending key");
});

// Password recovery (roadmap, Ben 16 Sept 2026): the reset request goes to GoTrue with this
// page's own origin as the redirect (one code path for the .netlify.app host and the real
// domain), the recovery fragment is wiped from the URL before the token is used, the token
// is never logged, the success note never confirms an account exists, the rate-limit and
// bad-address answers have their own messages, and both new fetches are time-bounded like
// the operator panel's (the older fetches on the page are not, yet). These are static
// string pins; what the code does is covered by test/admin-recovery-behaviour.test.js.
test("admin.html password recovery: own-origin redirect, fragment wiped before use, token never logged and dropped on leaving the card, the success note never confirms an account", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8").replace(/\r\n/g, "\n"); // the checkout may be CRLF
  const start = html.indexOf("// --- Password recovery");
  const end = html.indexOf("// --- end of password recovery ---", start);
  assert.ok(start > 0 && end > start, "the password recovery script block is present and delimited");
  const block = html.slice(start, end);
  const code = require("../test-support/moduleGraph.js").stripComments(block);
  for (const id of ['id="forgotLink"', 'id="recoveryCard"', 'id="loginCard"', 'id="loginNote"', 'id="recoveryError"']) assert.ok(html.includes(id), "markup has " + id);
  assert.ok(html.includes('id="newPasswordInput" placeholder="New password" autocomplete="new-password"'), "the new password field is marked new-password for password managers");
  assert.ok(code.includes('const redirectTo = location.origin + "/admin";'), "the redirect is derived from this page's own origin");
  assert.ok(code.includes('SUPABASE_URL + "/auth/v1/recover?redirect_to=" + encodeURIComponent(redirectTo)'), "the reset request is GoTrue recover with the redirect as a query parameter");
  assert.ok(code.includes('SUPABASE_URL + "/auth/v1/user"') && code.includes('"Authorization": "Bearer " + recoveryToken'), "the new password is a PUT to the user endpoint with the recovery session");
  // The wipe precedes the first use of the token.
  const wipe = code.indexOf('history.replaceState(null, "", location.pathname + location.search);');
  const use = code.indexOf("recoveryToken = f.token;");
  assert.ok(wipe > 0 && use > wipe, "the fragment is wiped from the URL and history before the token is kept");
  // Never logged or stored: the block names no sink at all, in any spelling (a match on the
  // token's name would let `console.log(f)` through, a dot-only match `console["log"]`;
  // GPT, cross-agent review 18 Sept). What the code DOES with the token is covered by
  // test/admin-recovery-behaviour.test.js, which runs it.
  assert.ok(!/\b(console|localStorage|sessionStorage|indexedDB|cookie)\b/.test(code), "the recovery block must not name console, storage or cookies");
  // Leaving the card by either route drops the session and clears the fields, so no
  // recovery bearer outlives the card it belongs to; the success path goes through it.
  const leave = code.indexOf("function showLoginCard(){");
  const leaveBody = code.slice(leave, code.indexOf("}", leave));
  for (const must of ['recoveryToken = "";', 'getElementById("newPasswordInput").value = "";', 'getElementById("newPasswordConfirm").value = "";', 'getElementById("recoveryError").style.display = "none";']) {
    assert.ok(leaveBody.includes(must), "showLoginCard clears: " + must);
  }
  assert.ok(code.includes('showLoginCard();\n  showLoginNote("Password updated. Sign in with it.");'), "the success path leaves through showLoginCard");
  assert.ok(html.includes('onclick="showLoginCard(); return false;">Back to sign in</a>'), "Back to sign in leaves through showLoginCard");
  // Wording and branches. The success note never confirms an account (GoTrue answers
  // 200 either way); the per-address 429 is GoTrue's own oracle and is reported honestly.
  assert.ok(code.includes('"If that address has an admin account, a reset link is on its way.'), "the success note never says whether the account exists");
  assert.ok(code.includes("if(res.status === 429)"), "a rate-limited request has its own message");
  assert.ok(code.includes("if(res.status === 400 || res.status === 422)"), "an address GoTrue refuses has its own message (not 'try again in a minute')");
  assert.ok(code.includes('f.error === "otp_expired"'), "an expired or reused link is explained");
  assert.strictEqual((code.match(/await fetch\(/g) || []).length, 2, "exactly two fetches: the reset request and the password update");
  assert.strictEqual((code.match(/signal: AbortSignal\.timeout\(AUTH_FETCH_TIMEOUT_MS\)/g) || []).length, 2, "both are time-bounded");
  // Inert rendering (L-003): messages, including GoTrue's own, go through textContent,
  // in the block and in showLoginError, which sits above it and renders for it too.
  for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) assert.ok(!code.includes(banned), "recovery block must not use " + banned);
  const sle = html.indexOf("function showLoginError(msg){");
  const sleBody = html.slice(sle, html.indexOf("}", sle));
  assert.ok(sle > 0 && sleBody.includes("el.textContent = msg;") && !sleBody.includes("innerHTML"), "showLoginError renders through textContent");
  // The fragment is read at the very END of the script, inside a try, so a throw there can
  // neither leave a later declaration uninitialised nor pass silently.
  const initCall = html.lastIndexOf('try { initPasswordRecovery(); } catch(e){ showLoginError("That reset link did not work. Request a new one."); }');
  const scriptEnd = html.indexOf("</script>", start);
  assert.ok(initCall > end && initCall < scriptEnd && html.slice(initCall, scriptEnd).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length === 1, "the init call is the last statement of the script");
});

// slice5x/photos (D-047): a Postgres job's photo is a one-hour signed Storage URL minted
// server-side. The card renders it only when it sits on this project's Supabase origin
// under /storage/v1/ (the bucket is private, so that is the only place a photo can be),
// escaped, and never builds an image from any other string; the legacy inline shape keeps
// its media-type guard.
test("admin.html renders a stored photo only from a same-origin /storage/v1/ signed url, escaped", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8").replace(/\r\n/g, "\n");
  const start = html.indexOf("function buildCard(");
  assert.ok(start > 0, "buildCard is present");
  const block = html.slice(start, html.indexOf("const calLinkSafe", start));
  const code = require("../test-support/moduleGraph.js").stripComments(block);
  assert.ok(code.includes('b.photo.url.startsWith(SUPABASE_URL + "/storage/v1/")'), "the signed url must be on this project's Supabase origin under /storage/v1/");
  assert.ok(code.includes("src=\"'+esc(photoUrlSafe)+'\""), "the url is escaped into the img src");
  assert.ok(code.includes("href=\"'+esc(photoUrlSafe)+'\" target=\"_blank\" rel=\"noopener\""), "the full-size link is escaped and noopener");
  assert.ok(!/src=["']'\+esc\(b\.photo\.url\)/.test(code), "the raw photo.url is never rendered, only the guarded value");
  assert.ok(code.includes('safeMediaTypes.includes(b.image.mediaType)'), "the legacy inline shape keeps its media-type guard");
  assert.ok(code.includes("No photo uploaded"), "the fallback copy is unchanged");
});
