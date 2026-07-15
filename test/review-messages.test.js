// D-025 — pure review-request message builders (email + SMS). No DB, no network.

const { test } = require("node:test");
const assert = require("node:assert");

const { buildReviewSms, buildReviewEmail, firstName } = require("../shared/reviewMessages.js");

const URL = "https://g.page/r/exampleplaceid/review";

test("firstName picks the first token, or 'there' when there is no usable name", () => {
  assert.equal(firstName("Sarah Jenkins"), "Sarah");
  assert.equal(firstName("  Bob  "), "Bob");
  assert.equal(firstName(""), "there");
  assert.equal(firstName(null), "there");
  assert.equal(firstName("   "), "there");
});

test("buildReviewSms is a lean single line with the name, business and review link", () => {
  const sms = buildReviewSms({ name: "Sarah Jenkins", reviewUrl: URL });
  assert.match(sms, /^Hi Sarah,/);
  assert.match(sms, /Intelligent Carpet Cleaning/);
  assert.ok(sms.includes(URL), "the SMS carries the review link");
  assert.ok(!/\n/.test(sms), "the SMS is a single line");
});

test("buildReviewSms greets 'there' when the customer name is missing", () => {
  const sms = buildReviewSms({ name: "", reviewUrl: URL });
  assert.match(sms, /^Hi there,/);
});

test("buildReviewEmail returns subject + html + text carrying the link", () => {
  const { subject, html, text } = buildReviewEmail({ name: "Sarah Jenkins", reviewUrl: URL, privacyUrl: "https://x/privacy" });
  assert.match(subject, /review/i);
  assert.match(subject, /Intelligent Carpet Cleaning/);
  assert.ok(html.includes(URL), "the review link is in the HTML");
  assert.ok(text.includes(URL), "the review link is in the text part");
  assert.match(html, /Hi Sarah,/);
  assert.match(text, /Hi Sarah,/);
});

test("buildReviewEmail escapes a customer name in the HTML part (L-003)", () => {
  const { html, text } = buildReviewEmail({ name: "<script>evil</script> Smith", reviewUrl: URL, privacyUrl: "https://x/privacy" });
  assert.ok(!html.includes("<script>evil</script>"), "name must be escaped in HTML");
  assert.match(html, /&lt;script&gt;/);
  // the text part is plain text (no markup to escape); the token is kept verbatim
  assert.ok(text.includes("<script>evil</script>"));
});

test("buildReviewEmail includes the privacy link only when a privacyUrl is given (A4)", () => {
  const withP = buildReviewEmail({ name: "A", reviewUrl: URL, privacyUrl: "https://x/privacy" });
  assert.match(withP.html, /privacy notice/i);
  assert.match(withP.text, /https:\/\/x\/privacy/);
  const noP = buildReviewEmail({ name: "A", reviewUrl: URL, privacyUrl: null });
  assert.ok(!/privacy notice/i.test(noP.html), "no privacy link when none supplied");
});

test("buildReviewEmail identifies the controller in both parts (A4)", () => {
  const { html, text } = buildReviewEmail({ name: "A", reviewUrl: URL, privacyUrl: null });
  for (const part of [html, text]) {
    assert.match(part, /Intelligent Carpet Cleaning/);
    assert.match(part, /01242 279590/);
    assert.match(part, /hello@intelligentclean\.co\.uk/);
  }
});
