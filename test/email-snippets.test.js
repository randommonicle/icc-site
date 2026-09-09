// Shared transactional-email snippets (shared/emailSnippets.js). The deposit pay
// button is the D-004/D-026 forward-compat hook: dormant (empty) until a real https
// payment link is supplied, https-only as defence in depth, and attribute-escaped.

const { test } = require("node:test");
const assert = require("node:assert");
const { depositPayButtonHtml, depositPayTextLine, depositInstructionLine } = require("../shared/emailSnippets.js");

test("depositPayButtonHtml renders a pay button for an https URL", () => {
  const html = depositPayButtonHtml("https://pay.stripe.com/x/abc");
  assert.match(html, /Pay your deposit securely/);
  assert.match(html, /href="https:\/\/pay\.stripe\.com\/x\/abc"/);
});

test("depositPayButtonHtml is empty (dormant) for null / undefined / empty", () => {
  assert.equal(depositPayButtonHtml(null), "");
  assert.equal(depositPayButtonHtml(undefined), "");
  assert.equal(depositPayButtonHtml(""), "");
  assert.equal(depositPayButtonHtml(42), "");
});

test("depositPayButtonHtml refuses non-https schemes (defence in depth)", () => {
  assert.equal(depositPayButtonHtml("http://pay.example/x"), "");
  assert.equal(depositPayButtonHtml("javascript:alert(1)"), "");
  assert.equal(depositPayButtonHtml("data:text/html,x"), "");
});

test("depositPayButtonHtml escapes special characters into the href attribute", () => {
  const html = depositPayButtonHtml('https://x/?q=<script>&a="b"');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;/);
  assert.match(html, /&amp;/);
  assert.doesNotMatch(html, /<script>/);
});

test("depositPayTextLine gives the raw https link, or empty for none/non-https", () => {
  assert.equal(depositPayTextLine("https://pay.example/x"), "Pay your deposit securely: https://pay.example/x");
  assert.equal(depositPayTextLine(null), "");
  assert.equal(depositPayTextLine("http://pay.example/x"), "");
});

test("depositInstructionLine tells the customer to pay via the button when a link renders", () => {
  const line = depositInstructionLine("https://pay.stripe.com/x/abc");
  assert.match(line, /pay your deposit using the button below/i);
  assert.doesNotMatch(line, /Mark will be in touch/);
});

test("depositInstructionLine falls back to 'Mark will be in touch' with no / non-https link", () => {
  assert.match(depositInstructionLine(null), /Mark will be in touch/);
  assert.match(depositInstructionLine(undefined), /Mark will be in touch/);
  assert.match(depositInstructionLine(""), /Mark will be in touch/);
  assert.match(depositInstructionLine("http://pay.example/x"), /Mark will be in touch/);
});

// The D-004 invariant: the button and the words derive from one input, so a rendered
// pay button can NEVER sit beside a line telling the customer Mark will arrange it.
// This is the exact contradiction the change closes; if the bullet is ever made
// unconditional again, this fails.
test("the pay button and the instruction line can never contradict (D-004)", () => {
  for (const url of ["https://pay.stripe.com/x/abc", null, undefined, "", "http://pay.example/x", 42]) {
    const hasButton = depositPayButtonHtml(url) !== "";
    const line = depositInstructionLine(url);
    if (hasButton) {
      assert.match(line, /button below/i, `button shown but line does not point to it for ${String(url)}`);
      assert.doesNotMatch(line, /Mark will be in touch/, `button shown but line still defers to Mark for ${String(url)}`);
    } else {
      assert.match(line, /Mark will be in touch/, `no button but line does not give the fallback for ${String(url)}`);
    }
  }
});
