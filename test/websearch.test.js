// D-019 gated/attributed web_search (Slice 4d) — the tool definition, the prompt
// gating, the pause_turn continuation in runAssistantTurn, the text-collapse
// separator, and the web-citation resolution. The Anthropic response is faked (no
// network), so these exercise the real code paths the live chat uses. The
// browser-side link rendering (renderCitations in index.html) is verified
// separately on a deploy preview (L-003-safe DOM links).

const { test } = require("node:test");
const assert = require("node:assert");

const chat = require("../server/netlify/functions/chat.js");
const {
  WEB_SEARCH_TOOL,
  ESCALATION_TOOL,
  TOOLS,
  STATIC_SYSTEM_PROMPT,
  runAssistantTurn,
  withSingleTextBlock,
  collectCitations,
} = chat;

// --- Tool definition ---------------------------------------------------------

test("WEB_SEARCH_TOOL pins the 20250305 version (no dynamic-filtering code-exec latency in a live chat)", () => {
  assert.strictEqual(WEB_SEARCH_TOOL.type, "web_search_20250305");
  assert.strictEqual(WEB_SEARCH_TOOL.name, "web_search");
});

test("WEB_SEARCH_TOOL hard-caps searches per request", () => {
  assert.ok(Number.isInteger(WEB_SEARCH_TOOL.max_uses), "max_uses must be set — it is the spend cap");
  assert.ok(WEB_SEARCH_TOOL.max_uses >= 1 && WEB_SEARCH_TOOL.max_uses <= 3,
    "low-stakes lookups never need more than 3 searches");
});

test("WEB_SEARCH_TOOL localises results to ICC's patch", () => {
  const loc = WEB_SEARCH_TOOL.user_location;
  assert.strictEqual(loc.type, "approximate");
  assert.strictEqual(loc.city, "Cheltenham");
  assert.strictEqual(loc.region, "Gloucestershire");
  assert.strictEqual(loc.country, "GB");
  assert.strictEqual(loc.timezone, "Europe/London");
});

test("TOOLS is the fixed-order pair [escalation, web_search] (cache prefix stability, L-002)", () => {
  assert.strictEqual(TOOLS.length, 2);
  assert.strictEqual(TOOLS[0], ESCALATION_TOOL);
  assert.strictEqual(TOOLS[1], WEB_SEARCH_TOOL);
});

// --- Prompt gating (the L-016 principle: rules bind only from the prompt) -----

test("system prompt carries the WEB SEARCH gating block", () => {
  assert.ok(STATIC_SYSTEM_PROMPT.includes("WEB SEARCH (RARE, LOW-STAKES ONLY):"));
  assert.ok(STATIC_SYSTEM_PROMPT.includes("your vetted reference document always comes first"));
});

test("prompt forbids web search for damage-risk and treatment questions", () => {
  assert.ok(STATIC_SYSTEM_PROMPT.includes(
    "Never use it for anything about cleaning, treating or applying products to a carpet or fabric"
  ));
  assert.ok(STATIC_SYSTEM_PROMPT.includes("damage risk is always handed over first"));
  assert.ok(STATIC_SYSTEM_PROMPT.includes("Never search as a way to avoid handing over"));
});

test("web search block sits after the hand-over block (search is subordinate to escalation)", () => {
  const handOver = STATIC_SYSTEM_PROMPT.indexOf("WHEN TO HAND OVER TO A HUMAN:");
  const webSearch = STATIC_SYSTEM_PROMPT.indexOf("WEB SEARCH (RARE, LOW-STAKES ONLY):");
  assert.ok(handOver > -1 && webSearch > -1);
  assert.ok(webSearch > handOver);
});

// --- pause_turn continuation in runAssistantTurn ------------------------------

test("runAssistantTurn resumes a pause_turn by re-sending the assistant content verbatim", async () => {
  const paused = {
    stop_reason: "pause_turn",
    content: [
      { type: "text", text: "Let me look that up." },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "carpet disposal cheltenham" } },
    ],
  };
  const finished = { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] };
  const calls = [];
  const callModel = async (messages) => {
    calls.push(messages);
    return calls.length === 1 ? paused : finished;
  };
  let toolHandlerCalled = false;
  const out = await runAssistantTurn(
    [{ role: "user", content: "Where can I get rid of an old carpet?" }],
    callModel,
    async () => { toolHandlerCalled = true; return "x"; }
  );
  assert.strictEqual(out, finished);
  assert.strictEqual(calls.length, 2);
  // The continuation appends ONLY the assistant turn — no tool_result, no extra
  // user message (the API detects the trailing server_tool_use and resumes).
  const second = calls[1];
  assert.strictEqual(second.length, 2);
  assert.deepStrictEqual(second[1], { role: "assistant", content: paused.content });
  assert.strictEqual(toolHandlerCalled, false, "pause_turn is not a custom tool round");
});

test("runAssistantTurn bounds a model stuck on pause_turn at maxRounds", async () => {
  const paused = { stop_reason: "pause_turn", content: [{ type: "text", text: "..." }] };
  let calls = 0;
  const out = await runAssistantTurn(
    [{ role: "user", content: "hi" }],
    async () => { calls++; return paused; },
    async () => "x"
  );
  assert.strictEqual(calls, 5, "initial call + 4 bounded continuation rounds");
  assert.strictEqual(out.stop_reason, "pause_turn", "returns the last response rather than looping forever");
});

test("runAssistantTurn still resolves a custom tool round after a pause_turn (shared bound)", async () => {
  const paused = { stop_reason: "pause_turn", content: [{ type: "text", text: "Checking." }] };
  const wantsTool = {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu_1", name: "escalate_to_human", input: { question: "q", reason: "out_of_scope" } }],
  };
  const finished = { stop_reason: "end_turn", content: [{ type: "text", text: "Handed over." }] };
  const responses = [paused, wantsTool, finished];
  const calls = [];
  const out = await runAssistantTurn(
    [{ role: "user", content: "hi" }],
    async (messages) => { calls.push(messages); return responses[calls.length - 1]; },
    async () => "Escalation logged."
  );
  assert.strictEqual(out, finished);
  assert.strictEqual(calls.length, 3);
  // Third call carries the tool_result for the tool round.
  const last = calls[2];
  const toolResultTurn = last[last.length - 1];
  assert.strictEqual(toolResultTurn.role, "user");
  assert.strictEqual(toolResultTurn.content[0].type, "tool_result");
  assert.strictEqual(toolResultTurn.content[0].tool_use_id, "tu_1");
});

// --- withSingleTextBlock: search blocks dropped, prose kept readable ----------

test("withSingleTextBlock inserts a paragraph break where dropped search blocks sat", () => {
  const data = {
    stop_reason: "end_turn",
    content: [
      { type: "text", text: "I'll look that up for you." },
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      { type: "text", text: "Cheltenham Borough Council runs a bulky waste collection." },
    ],
  };
  const out = withSingleTextBlock(data);
  assert.strictEqual(out.content.length, 1);
  assert.strictEqual(
    out.content[0].text,
    "I'll look that up for you.\n\nCheltenham Borough Council runs a bulky waste collection."
  );
});

test("withSingleTextBlock still joins adjacent citation-split text seamlessly", () => {
  const out = withSingleTextBlock({
    content: [
      { type: "text", text: "For wool, " },
      { type: "text", text: "low-moisture is the safe approach", citations: [{}] },
      { type: "text", text: " every time." },
    ],
  });
  assert.strictEqual(out.content[0].text, "For wool, low-moisture is the safe approach every time.");
});

test("withSingleTextBlock never emits a leading separator", () => {
  const out = withSingleTextBlock({
    content: [
      { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      { type: "text", text: "Answer." },
    ],
  });
  assert.strictEqual(out.content[0].text, "Answer.");
});

// --- collectCitations: the attributed external lane ----------------------------

test("collectCitations maps web_search_result_location to {id:null, title, url}", () => {
  const out = collectCitations({
    content: [
      {
        type: "text",
        text: "The council collects bulky waste",
        citations: [
          {
            type: "web_search_result_location",
            url: "https://www.cheltenham.gov.uk/bulky-waste",
            title: "Bulky waste collection - Cheltenham Borough Council",
            encrypted_index: "abc",
            cited_text: "...",
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(out, [
    {
      id: null,
      title: "Bulky waste collection - Cheltenham Borough Council",
      url: "https://www.cheltenham.gov.uk/bulky-waste",
    },
  ]);
});

test("collectCitations dedupes web citations by url across blocks", () => {
  const cite = {
    type: "web_search_result_location",
    url: "https://example.org/page",
    title: "Example",
  };
  const out = collectCitations({
    content: [
      { type: "text", text: "a", citations: [cite] },
      { type: "text", text: "b", citations: [Object.assign({}, cite, { title: "Example (again)" })] },
    ],
  });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, "https://example.org/page");
});

test("collectCitations drops non-http(s) web urls (defence in depth with the client guard)", () => {
  const out = collectCitations({
    content: [
      {
        type: "text",
        text: "x",
        citations: [
          { type: "web_search_result_location", url: "javascript:alert(1)", title: "evil" },
          { type: "web_search_result_location", url: "ftp://example.org", title: "old" },
        ],
      },
    ],
  });
  assert.deepStrictEqual(out, []);
});

test("collectCitations falls back to the hostname when a web citation has no title", () => {
  const out = collectCitations({
    content: [
      {
        type: "text",
        text: "x",
        citations: [{ type: "web_search_result_location", url: "https://www.gloucestershire.gov.uk/recycling" }],
      },
    ],
  });
  assert.deepStrictEqual(out, [
    { id: null, title: "www.gloucestershire.gov.uk", url: "https://www.gloucestershire.gov.uk/recycling" },
  ]);
});

test("collectCitations keeps KB and web citations side by side, KB entries without a url key", () => {
  const knowledge = require("../shared/config/knowledge.js");
  const out = collectCitations({
    content: [
      {
        type: "text",
        text: "wool needs low moisture",
        citations: [
          { type: "content_block_location", document_title: "ICC reference", start_block_index: 2, end_block_index: 3 },
        ],
      },
      {
        type: "text",
        text: "and the council recycles carpet",
        citations: [
          { type: "web_search_result_location", url: "https://example.gov.uk/recycle", title: "Recycling" },
        ],
      },
    ],
  });
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0], { id: knowledge.knowledgeSections[2].id, title: knowledge.knowledgeSections[2].title });
  assert.ok(!("url" in out[0]), "KB entries keep the exact Slice 4c shape");
  assert.deepStrictEqual(out[1], { id: null, title: "Recycling", url: "https://example.gov.uk/recycle" });
});
