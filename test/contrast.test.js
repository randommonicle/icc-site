// Guard: text colour tokens must meet WCAG AA, computed rather than eyeballed.
//
// global.css documented --teal and --gold-deep as AA-verified (the L-010 addendum
// work) and those two do pass. Two colours never got that pass and were failing:
// --text-light at #718096 was 4.02:1 on white, under the 4.5:1 needed for normal
// text, and it is used for real body copy (the chat fallback line carrying the
// phone number and privacy link, message timestamps, the privacy page's legal
// meta). Footer body text at rgba(255,255,255,0.4) blended to 3.6:1 on
// --navy-dark at 0.8rem.
//
// The point of computing here rather than hardcoding "the token is #64748b" is
// that a future colour change is checked against the standard, not against a
// value someone typed in a test.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "..", "site", "src", "styles", "global.css"),
  "utf8"
);

// WCAG 2.1 relative luminance and contrast ratio.
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
// Flatten a translucent white overlay onto an opaque background.
const flatten = (fg, alpha, bg) => fg.map((f, i) => alpha * f + (1 - alpha) * bg[i]);

// Read a custom property straight out of the stylesheet, so the test tracks the
// real token rather than a copy. Follows var() aliases: the palette defines the
// canonical --green* names and keeps the older --navy* names pointing at them
// (the L-010 green rebrand), so --navy-dark resolves through --green-dark.
const token = (name, seen = new Set()) => {
  assert.ok(!seen.has(name), `circular var() reference resolving --${name}`);
  seen.add(name);
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6}|var\\(--[\\w-]+\\))`));
  assert.ok(m, `expected --${name} to be defined in global.css`);
  const alias = m[1].match(/^var\(--([\w-]+)\)$/);
  return alias ? token(alias[1], seen) : hexToRgb(m[1]);
};

const WHITE = [255, 255, 255];
const AA_NORMAL = 4.5;

test("--text-light meets AA on white (it is used for body copy, not decoration)", () => {
  const ratio = contrast(token("text-light"), WHITE);
  assert.ok(
    ratio >= AA_NORMAL,
    `--text-light is ${ratio.toFixed(2)}:1 on white, needs ${AA_NORMAL}:1`
  );
});

test("--text-mid and --text-dark meet AA on white", () => {
  for (const name of ["text-mid", "text-dark"]) {
    const ratio = contrast(token(name), WHITE);
    assert.ok(ratio >= AA_NORMAL, `--${name} is ${ratio.toFixed(2)}:1 on white`);
  }
});

test("the tokens global.css documents as AA-verified really are", () => {
  // --teal and --gold-deep carry that claim in a comment; hold the comment to it.
  for (const name of ["teal", "gold-deep"]) {
    const ratio = contrast(token(name), WHITE);
    assert.ok(
      ratio >= AA_NORMAL,
      `--${name} is documented as AA on white but computes to ${ratio.toFixed(2)}:1`
    );
  }
});

test("--text-light stays lighter than --text-mid so the hierarchy survives the fix", () => {
  assert.ok(
    luminance(token("text-light")) > luminance(token("text-mid")),
    "raising the contrast must not collapse --text-light into --text-mid"
  );
});

test("footer body text meets AA against the dark footer", () => {
  const m = css.match(/footer p\{color:rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
  assert.ok(m, "expected footer p to set a translucent white");
  const alpha = Number(m[1]);
  const ratio = contrast(flatten(WHITE, alpha, token("navy-dark")), token("navy-dark"));
  assert.ok(
    ratio >= AA_NORMAL,
    `footer text at alpha ${alpha} is ${ratio.toFixed(2)}:1 on --navy-dark, needs ${AA_NORMAL}:1`
  );
});

test("the contrast maths is right (sanity-check against known values)", () => {
  // Black on white is exactly 21:1; a colour against itself is exactly 1:1.
  assert.strictEqual(Number(contrast([0, 0, 0], WHITE).toFixed(2)), 21);
  assert.strictEqual(Number(contrast(WHITE, WHITE).toFixed(2)), 1);
  // The value that prompted this file, so a broken formula cannot silently pass.
  assert.strictEqual(Number(contrast(hexToRgb("#718096"), WHITE).toFixed(2)), 4.02);
});
