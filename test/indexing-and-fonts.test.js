// Guard: the pre-launch indexing controls must stay coherent, and no page may
// pull fonts from a third-party CDN.
//
// Indexing (F3). Every page's canonical, og:url and sitemap entry points at
// www.intelligentclean.co.uk, which currently serves a 123 Reg parking page with
// third-party ads, while the .netlify.app host it is actually served from was
// fully crawlable. A pre-launch noindex now ships as an X-Robots-Tag header.
//
// The trap this file exists to catch: robots.txt and the noindex header interact.
// A crawler only sees an X-Robots-Tag if it is allowed to FETCH the page, so
// adding "Disallow: /" alongside the header is not belt-and-braces, it defeats
// the header. These assertions hold whether or not the pre-launch block is still
// present, so they stay valid after the cutover.
//
// Fonts (F9). Google Fonts embedding discloses each visitor's IP to Google, which
// the privacy notice's processor list does not cover: it names Google for business
// email and the calendar link, not for serving fonts to every visitor.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

const robots = read("site", "public", "robots.txt");
const netlifyToml = read("netlify.toml");
const layout = read("site", "src", "layouts", "BaseLayout.astro");

// Strip comments so a rule described in prose is never mistaken for a live one.
const robotsRules = robots
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

test("robots.txt never disallows crawling while a noindex header is in force", () => {
  const noindexHeader = /X-Robots-Tag\s*=\s*"noindex/.test(netlifyToml);
  const disallowsAll = /^\s*Disallow:\s*\/\s*$/m.test(robotsRules);
  if (noindexHeader) {
    assert.ok(
      !disallowsAll,
      "robots.txt disallows crawling while netlify.toml serves noindex; the crawler " +
        "would never fetch the page, never see the header, and the URL could still " +
        "be indexed without content"
    );
  }
});

test("the admin dashboard is noindexed regardless of launch state", () => {
  const adminBlock = netlifyToml.slice(netlifyToml.indexOf('for = "/admin*"'));
  assert.match(
    adminBlock.slice(0, 400),
    /X-Robots-Tag\s*=\s*"noindex/,
    "the admin dashboard must never be indexable"
  );
});

test("any site-wide noindex is flagged for removal at cutover", () => {
  // A blanket noindex left in place after the cutover would keep the real site
  // out of the index entirely, so it must carry a grep-able marker.
  const siteWide = /for = "\/\*"[\s\S]{0,400}?X-Robots-Tag\s*=\s*"noindex/.test(netlifyToml);
  if (siteWide) {
    assert.match(
      netlifyToml,
      /TODO\(prelaunch\/noindex\)/,
      "a site-wide noindex must carry TODO(prelaunch/noindex) so it is found and removed at cutover"
    );
  }
});

test("the sitemap declared in robots.txt is an absolute https URL", () => {
  const m = robotsRules.match(/Sitemap:\s*(\S+)/);
  assert.ok(m, "robots.txt must declare a sitemap");
  assert.match(m[1], /^https:\/\//, "the sitemap URL must be absolute and https");
});

test("no page fetches fonts from a third-party CDN", () => {
  for (const host of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
    assert.ok(
      !layout.includes(host),
      `BaseLayout still references ${host}; fonts must be self-hosted so no visitor IP is disclosed`
    );
  }
});

test("the self-hosted font weights are the ones the site actually uses", () => {
  const imported = [...layout.matchAll(/@fontsource\/(raleway|lato)\/[\w-]*?(\d+)\.css/g)]
    .reduce((acc, m) => {
      (acc[m[1]] ||= new Set()).add(Number(m[2]));
      return acc;
    }, {});
  assert.deepStrictEqual([...imported.raleway].sort((a, b) => a - b), [400, 700, 800]);
  assert.deepStrictEqual([...imported.lato].sort((a, b) => a - b), [300, 400, 700]);

  // And they must actually be installed, or the build fails at import time.
  const pkg = JSON.parse(read("site", "package.json"));
  for (const dep of ["@fontsource/raleway", "@fontsource/lato"]) {
    assert.ok(pkg.dependencies?.[dep], `${dep} must be a declared dependency`);
  }
});

test("font subsets are pinned, not the default multi-script bundle", () => {
  const imports = [...layout.matchAll(/@fontsource\/[\w-]+\/([\w-]+)\.css/g)].map((m) => m[1]);
  assert.ok(imports.length > 0, "expected self-hosted font imports");
  for (const spec of imports) {
    assert.match(
      spec,
      /^latin(-ext)?-\d+$/,
      `"${spec}" pulls every script Fontsource ships for that family; pin the subset`
    );
  }
  // Lato renders customer-typed names in the chat, so it needs latin-ext.
  assert.ok(
    imports.some((s) => s.startsWith("latin-ext")),
    "the body font must include latin-ext for accented names"
  );
});
