// Single source of truth for Claude model names (D-007).
//
// Sonnet handles all text; Opus is used ONLY when the latest user message
// carries an image (vision genuinely needed — Opus is expensive). chat.js
// imports these instead of hardcoding the strings at the call site, so a model
// bump is a one-line change here. When the backend grows (Slice 3+), the API
// and any other Claude caller read from this same module.
//
// CommonJS on purpose: consumed by the CommonJS Netlify functions and the
// plain-Node `node --test` runner; the Astro site can import it via Vite interop.

module.exports = {
  text: "claude-sonnet-4-6",
  vision: "claude-opus-4-5",
};
