// Guard: the DIY-vs-professional guide may only say what the vetted knowledge
// base says.
//
// D-015 and L-009 exist because the old site carried invented figures. This guide
// is the highest-commercial-intent page in the content plan (someone comparing a
// hire machine against a professional clean is actively pricing a job), which is
// exactly the sort of page that attracts embellishment: a percentage, a drying
// time, a named brand to compare against. Every substantive claim in it has to
// trace back to shared/config/knowledge.js, the same source the assistant cites.
//
// The brand rule comes from PR #23: the KB covers rented machines generically and
// deliberately never names one, so neither may the guide.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const knowledge = require("../shared/config/knowledge.js");

const guidePath = path.join(
  __dirname, "..", "site", "src", "content", "guides",
  "diy-vs-professional-carpet-cleaning.md"
);
const guide = fs.readFileSync(guidePath, "utf8");
const kbSection = knowledge.knowledgeSections.find((s) => s.id === "diy_vs_professional");

test("the KB section this guide is built from still exists", () => {
  assert.ok(kbSection, "shared/config/knowledge.js must define the diy_vs_professional section");
});

test("every risk the guide names is one the knowledge base names", () => {
  const kb = kbSection.text.toLowerCase();
  for (const risk of ["shrinkage", "delamination", "mould", "residue", "permanent damage"]) {
    if (new RegExp(risk).test(guide.toLowerCase())) {
      assert.match(kb, new RegExp(risk), `the guide claims "${risk}" but the KB does not`);
    }
  }
});

test("the guide's core mechanism matches the KB, not a stronger version of it", () => {
  const g = guide.toLowerCase();
  // The KB is careful that these machines use the SAME principle and differ by
  // degree. Claiming they do not work at all would overstate it.
  assert.match(kbSection.text.toLowerCase(), /same extraction principle/);
  assert.match(g, /same extraction principle/, "the guide must keep the KB's 'same principle' framing");
  for (const phrase of ["lower temperature", "suction", "more water"]) {
    assert.match(g, new RegExp(phrase), `the guide should carry the KB's "${phrase}" point`);
  }
});

test("the guide names no machine brands (the PR #23 rule)", () => {
  // The KB covers hire machines generically on purpose.
  const brands = ["rug doctor", "vax", "bissell", "karcher", "kärcher", "hoover", "dyson"];
  const g = guide.toLowerCase();
  for (const brand of brands) {
    assert.ok(!g.includes(brand), `the guide names "${brand}"; hire machines are covered generically`);
  }
});

test("the guide invents no statistics", () => {
  // The KB carries no percentages, drying times or counts for this topic, so
  // neither may the guide. Frontmatter dates and guide-order numbers are excluded.
  const body = guide.slice(guide.indexOf("\n---", 3) + 4);
  assert.doesNotMatch(body, /\b\d+\s?%/, "no percentage claims: none are in the KB");
  assert.doesNotMatch(
    body,
    /\b\d+\s?(hours?|days?|minutes?)\b/i,
    "no time figures: drying times belong to the aftercare guide and its own source"
  );
});

test("the guide is discoverable and internally linked", () => {
  const frontmatter = guide.slice(0, guide.indexOf("\n---", 3));
  for (const field of ["title:", "description:", "summary:", "order:", "updated:"]) {
    assert.match(frontmatter, new RegExp(`^${field}`, "m"), `frontmatter needs ${field}`);
  }
  // Cross-links: the fibre guides are the ones that matter most here, because
  // wool and natural fibres are where the KB says damage can be permanent.
  const guidesDir = path.dirname(guidePath);
  const existing = new Set(
    fs.readdirSync(guidesDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))
  );
  const links = [...guide.matchAll(/\]\(\/guides\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 3, "expected the guide to link its sibling guides");
  for (const slug of links) {
    assert.ok(existing.has(slug), `guide links to /guides/${slug}/ which does not exist`);
  }
  for (const needed of ["cleaning-wool-carpets", "natural-fibre-carpets"]) {
    assert.ok(links.includes(needed), `the guide must link ${needed}, where the permanent-damage risk lands`);
  }
});

test("the chat suggestion chip that promises this topic still exists", () => {
  // book.astro offers "DIY vs professional" as a chip; the guide is what backs it.
  const book = fs.readFileSync(
    path.join(__dirname, "..", "site", "src", "pages", "book.astro"), "utf8"
  );
  assert.match(book, /DIY vs professional/, "the booking page chip is the entry point for this topic");
});
