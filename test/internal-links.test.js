// Guard (SEO audit T-03, 14 Sept 2026): every internal link on the public site takes
// the trailing-slash form. Astro builds directory-style output (/about/index.html), so
// the canonical and the sitemap entry of every page end in a slash, and Netlify
// answers the slash-less form with a 301. Before this guard the navigation, footer,
// cards and CTAs all linked to /about, /book, /areas and so on, which made every
// internal click a redirect hop and had Search Console reporting "Page with redirect"
// for the linked forms. The rule is enforced in the build (enforce-invariants-in-build),
// not described in a comment: this file fails on the first slash-less internal link.
//
// Source-level, so it always runs (no build needed) and cannot silently skip. It reads
// the same forms a link can take in this codebase: href="/x" in templates, the
// href={`/x/${id}/`} template literal, the Nav's { href: '/x/' } array, and
// [text](/x/) in the Markdown content collections. A second test reads the built
// site when one is present, which catches any form the source scan does not know.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const siteSrc = path.join(repoRoot, "site", "src");
const config = fs.readFileSync(path.join(repoRoot, "site", "astro.config.mjs"), "utf8");

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// An internal path that names a page (no file extension, no protocol) must end in "/"
// before any query string or fragment. Files (/logo.jpg, /_astro/…) are ignored.
function offendingPath(p) {
  const clean = p.split(/[?#]/)[0];
  if (!clean.startsWith("/")) return false; // external, tel:, mailto:, #fragment
  if (clean === "/") return false;
  if (/\.[a-z0-9]+$/i.test(clean)) return false; // a file
  return !clean.endsWith("/");
}

const LINK_FORMS = [
  { name: 'href="…"', re: /href="([^"]*)"/g },
  { name: "href={`…`}", re: /href=\{`([^`]*)`\}/g },
  { name: "Nav array href: '…'", re: /\bhref:\s*'([^']*)'/g },
  { name: "markdown](…)", re: /\]\(([^)\s]*)\)/g },
];

function scanSource(file) {
  const src = fs.readFileSync(file, "utf8");
  const bad = [];
  for (const form of LINK_FORMS) {
    for (const m of src.matchAll(form.re)) {
      // Template literals: check the static tail, e.g. `/areas/${a.id}/` ends in "/".
      const target = m[1].replace(/\$\{[^}]*\}/g, "x");
      if (offendingPath(target)) bad.push(`${form.name} -> ${m[1]}`);
    }
  }
  return bad;
}

test("astro.config.mjs declares trailingSlash: 'always'", () => {
  assert.match(config, /trailingSlash:\s*'always'/, "the build must declare the slash form so the dev server, sitemap and links agree");
});

test("every internal link in site/src ends in a trailing slash", () => {
  const files = walk(siteSrc, [".astro", ".md", ".ts"]);
  assert.ok(files.length > 20, "the site source was found");
  const report = [];
  for (const f of files) {
    for (const b of scanSource(f)) report.push(`${path.relative(repoRoot, f)}: ${b}`);
  }
  assert.deepStrictEqual(report, [], "slash-less internal links (each is a 301 hop):\n  " + report.join("\n  "));
});

test("the source scan itself can see a slash-less link (self-check)", () => {
  assert.strictEqual(offendingPath("/about"), true);
  assert.strictEqual(offendingPath("/areas/cheltenham"), true);
  assert.strictEqual(offendingPath("/about/"), false);
  assert.strictEqual(offendingPath("/booking-action/?token=abc"), false);
  assert.strictEqual(offendingPath("/services#upholstery"), true);
  assert.strictEqual(offendingPath("/services/#upholstery"), false);
  assert.strictEqual(offendingPath("/logo.jpg"), false);
  assert.strictEqual(offendingPath("/"), false);
  assert.strictEqual(offendingPath("https://example.com/x"), false);
  assert.strictEqual(offendingPath("tel:01452452356"), false);
  assert.strictEqual(offendingPath("#main"), false);
});

// The built site, when present (npm run build --prefix site). Reads every href in
// every built page, so a link form the source scan does not know still fails here.
// Self-skips with a reason when there is no build, like the [integration] tests.
test("[build] every internal href in site/dist ends in a trailing slash", (t) => {
  const dist = path.join(repoRoot, "site", "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    t.skip("site/dist not built; run `npm run build --prefix site` to include this check");
    return;
  }
  const pages = walk(dist, [".html"]);
  assert.ok(pages.length > 20, "the build has the site's pages");
  const report = [];
  for (const f of pages) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      if (offendingPath(m[1])) report.push(`${path.relative(dist, f)}: ${m[1]}`);
    }
  }
  assert.deepStrictEqual(report, [], "slash-less internal links in the build:\n  " + report.join("\n  "));
});
