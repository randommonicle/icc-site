// Guard (SEO audit O-02 / O-03, 14 Sept 2026): every page's <title> fits the 60
// characters search results show and every meta description fits 160. Six titles
// and four descriptions were over when the audit ran; this file failed on all ten
// before the fix and now holds the line at the source, so a new page or a longer
// brand suffix cannot quietly push a page back over.
//
// Source-level so it always runs: it composes each page's title and description the
// way the templates do (static pages from their <BaseLayout title=… description=…>
// props, guides and areas from frontmatter plus the template's suffix). A second test
// measures the built pages when a build is present, which is the ground truth.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const site = (...p) => path.join(repoRoot, "site", ...p);
const TITLE_MAX = 60;
const DESC_MAX = 160;

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// Static pages: the literal title="…" / description="…" props on <BaseLayout>.
function staticPages() {
  const out = [];
  for (const f of walk(site("src", "pages"), ".astro")) {
    const src = fs.readFileSync(f, "utf8");
    const t = src.match(/<BaseLayout[^>]*?\btitle="([^"]*)"/s);
    const d = src.match(/<BaseLayout[^>]*?\bdescription="([^"]*)"/s);
    if (t && d) out.push({ page: path.relative(repoRoot, f), title: decode(t[1]), description: decode(d[1]) });
  }
  return out;
}

// Collection pages: frontmatter title/description plus whatever suffix the template adds.
function collectionPages() {
  const out = [];
  const guideTemplate = fs.readFileSync(site("src", "pages", "guides", "[slug].astro"), "utf8");
  const suffix = guideTemplate.match(/title=\{`\$\{title\}([^`]*)`\}/);
  assert.ok(suffix, "the guide template composes its <title> from the frontmatter title plus a suffix");
  for (const f of walk(site("src", "content", "guides"), ".md")) {
    const fm = fs.readFileSync(f, "utf8");
    const t = fm.match(/^title:\s*"(.*)"\s*$/m);
    const d = fm.match(/^description:\s*"(.*)"\s*$/m);
    assert.ok(t && d, `${f} must carry a quoted title and description`);
    out.push({ page: path.relative(repoRoot, f), title: t[1] + suffix[1], description: d[1] });
  }
  // Area pages render the frontmatter `title` as the full document title.
  for (const f of walk(site("src", "content", "areas"), ".md")) {
    const fm = fs.readFileSync(f, "utf8");
    const t = fm.match(/^title:\s*"(.*)"\s*$/m);
    const d = fm.match(/^description:\s*"(.*)"\s*$/m);
    assert.ok(t && d, `${f} must carry a quoted title and description`);
    out.push({ page: path.relative(repoRoot, f), title: t[1], description: d[1] });
  }
  return out;
}

function overLimit(pages) {
  const report = [];
  for (const p of pages) {
    if (p.title.length > TITLE_MAX) report.push(`${p.page}: title ${p.title.length} > ${TITLE_MAX}: ${p.title}`);
    if (p.description.length > DESC_MAX) report.push(`${p.page}: description ${p.description.length} > ${DESC_MAX}`);
  }
  return report;
}

test("every page title is within 60 characters and every description within 160 (source)", () => {
  const pages = [...staticPages(), ...collectionPages()];
  assert.ok(pages.length >= 25, `expected the whole site, found ${pages.length} pages`);
  const report = overLimit(pages);
  assert.deepStrictEqual(report, [], "over the working limits:\n  " + report.join("\n  "));
});

test("the limit check can fail (self-check)", () => {
  const r = overLimit([{ page: "x", title: "a".repeat(61), description: "b".repeat(161) }]);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(overLimit([{ page: "y", title: "a".repeat(60), description: "b".repeat(160) }]), []);
});

test("[build] every built page's <title> and description are within the limits", (t) => {
  const dist = site("dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    t.skip("site/dist not built; run `npm run build --prefix site` to include this check");
    return;
  }
  const pages = walk(dist, ".html").map((f) => {
    const html = fs.readFileSync(f, "utf8");
    return {
      page: path.relative(dist, f),
      title: decode((html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1]),
      description: decode((html.match(/<meta name="description" content="([^"]*)"/) || ["", ""])[1]),
    };
  });
  assert.ok(pages.length >= 25, "the build has the site's pages");
  const report = overLimit(pages);
  assert.deepStrictEqual(report, [], "over the working limits in the build:\n  " + report.join("\n  "));
});
