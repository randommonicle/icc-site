// Single source of truth for Claude model names (D-007).
//
// Sonnet handles all text; Opus is used ONLY when the latest user message
// carries an image (vision genuinely needed). chat.js imports these instead of
// hardcoding the strings at the call site, so a model bump is a one-line change
// here. When the backend grows (Slice 3+), the API and any other Claude caller
// read from this same module.
//
// VISION POLICY (D-007 addendum, 12 June 2026): the vision slot tracks the
// current best Opus. High-resolution image understanding (introduced with Opus
// 4.7) is exactly what photo assessment needs, and the Opus tier is flat-priced
// ($5/$25 per MTok across 4.5-4.8), so "always the best Opus" carries no price
// penalty within the tier. The bump is DELIBERATE, not automatic: change this one
// line when a newer Opus lands AND a deploy-preview photo assessment confirms it
// still reads well. A silent swap of the model that gives damage-risk advice is
// exactly the D-019 failure mode, so the human gate stays. Today the best Opus is
// claude-opus-4-8. (Watch: Opus 4.8 defaults effort=high on the API; if photo-turn
// latency creeps up, set effort lower on the vision call.)
//
// CommonJS on purpose: consumed by the CommonJS Netlify functions and the
// plain-Node `node --test` runner; the Astro site can import it via Vite interop.

module.exports = {
  text: "claude-sonnet-4-6",
  vision: "claude-opus-4-8",
};
