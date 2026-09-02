// Shared transactional-email snippets (shared/emailSnippets.js). The deposit pay
// button is the D-004/D-026 forward-compat hook: dormant (empty) until a real https
// payment link is supplied, https-only as defence in depth, and attribute-escaped.

const { test } = require("node:test");
const assert = require("node:assert");
const { depositPayButtonHtml, depositPayTextLine } = require("../shared/emailSnippets.js");

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
