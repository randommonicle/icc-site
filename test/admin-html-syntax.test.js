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
});
