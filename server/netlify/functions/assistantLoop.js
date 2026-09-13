// The assistant tool loop, shared by the customer chat (chat.js) and the operator
// assistant (operatorChat.js, D-040). Extracted from chat.js for Beta 4 so the operator
// function does not bundle the whole customer chat (booking, PDF, Blobs) just to reuse
// the loop; chat.js re-exports both so test/escalation.test.js and test/websearch.test.js
// keep importing from there unchanged. Behaviour is byte-for-byte what chat.js had.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

// Resolve a chat turn, executing any custom tool_use rounds server-side so the
// browser still receives one final assistant message. callModel(messages) returns
// the parsed Anthropic response; handleTool(toolUse, ctx) returns the tool_result
// string. Two continuation cases share the maxRounds bound so a misbehaving model
// cannot loop forever:
//   - stop_reason "tool_use": a custom tool (escalate_to_human) — resolve it and
//     send the tool_result back (Slice 4b).
//   - stop_reason "pause_turn": the API paused its own server-tool loop (web_search,
//     Slice 4d) — append the assistant content verbatim and re-call; the server
//     resumes where it left off. No tool_result and no extra user message (the API
//     detects the trailing server_tool_use block).
// Exported for unit tests (test/escalation.test.js, test/websearch.test.js).
async function runAssistantTurn(initialMessages, callModel, handleTool, maxRounds = 4) {
  let messages = Array.isArray(initialMessages) ? initialMessages.slice() : [];
  let data = await callModel(messages);
  let rounds = 0;
  while (data && (data.stop_reason === "tool_use" || data.stop_reason === "pause_turn") && rounds < maxRounds) {
    rounds++;
    if (data.stop_reason === "pause_turn") {
      messages = messages.concat([{ role: "assistant", content: data.content }]);
      data = await callModel(messages);
      continue;
    }
    const toolUses = (data.content || []).filter(b => b && b.type === "tool_use");
    if (toolUses.length === 0) break;
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try {
        result = await handleTool(tu, { messages });
      } catch (e) {
        console.log("Tool handler error:", e.message);
        result = "That could not be completed. Ask the customer to call 01452 452356.";
      }
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages = messages.concat([
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults }
    ]);
    data = await callModel(messages);
  }
  return data;
}

// Collapse an Anthropic message to a single text block so the browser's
// data.content[0].text contract holds after a tool round (and, in Slice 4c, after
// Citations splits the reply across blocks). Non-text blocks (tool_use,
// server_tool_use, web_search_tool_result) are dropped. Adjacent text blocks join
// seamlessly — Citations splits prose mid-sentence, so no separator can be added
// there — but where a dropped non-text block sat between two text blocks (the model
// narrating "I'll look that up" before a search, Slice 4d) a paragraph break is
// inserted so the sentences do not glue together. Anything without an array content
// (e.g. an API error object) is passed through untouched. Exported for unit tests.
function withSingleTextBlock(data) {
  if (!data || !Array.isArray(data.content)) return data;
  let text = "";
  let pendingBreak = false;
  for (const b of data.content) {
    if (b && b.type === "text" && typeof b.text === "string") {
      if (pendingBreak && text) text += "\n\n";
      text += b.text;
      pendingBreak = false;
    } else {
      pendingBreak = true;
    }
  }
  return Object.assign({}, data, { content: [{ type: "text", text: text }] });
}

module.exports = { runAssistantTurn, withSingleTextBlock };
