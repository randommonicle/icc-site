// API v1 — operator assistant contract (D-040). Mark-only, read-only, descriptive: the
// endpoint answers questions over the business's own records through read-only tools and
// never takes an action. Admin-gated (Bearer session), one bounded turn per request, a
// Postgres atomic per-operator turn budget (429 + Retry-After when spent).

/** One transcript message. The browser holds the transcript and resends it (bounded:
 *  at most 20 messages, each at most 4000 characters, alternating user/assistant and
 *  starting + ending with the user). Text only. */
export interface OperatorChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** `POST /api/v1/operator-chat` request. */
export interface OperatorChatRequest {
  messages: OperatorChatMessage[];
}

/** `POST /api/v1/operator-chat` 200 response. `content` is always exactly one text block
 *  (render it as inert text, never as markup). When `stopped` is set the turn hit its
 *  model-call or wall-clock budget and `content` carries a fixed explanation, not model
 *  output; the message should not be replayed as an assistant turn. */
export interface OperatorChatResponse {
  content: [{ type: "text"; text: string }];
  stopped?: "model_calls" | "deadline";
  usage: { model_calls: number; tool_calls: number };
}

/** Non-200 bodies: 400 (bad transcript), 401/403 (not an admin), 429 (this hour's turns
 *  used; `retry_after` seconds, also in the Retry-After header), 500/503 (not configured
 *  or the turn budget could not be checked; fail-closed), 502 (the model call failed). */
export interface OperatorChatError {
  error: string;
  retry_after?: number;
}
