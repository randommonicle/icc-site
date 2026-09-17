// Unit tests for scripts/launch-check.mjs, the post-launch cutover
// verification tool (docs/LAUNCH_CUTOVER.md, "Post-launch verification
// checklist"). runChecks(origin, fetchImpl) is a pure function, so every
// check is driven here with a scripted fake fetch rather than the network;
// scripts/launch-check.mjs is exercised for real only via the CLI, run by
// hand against the live hosts.
//
// Style follows test/internal-links.test.js and test/seo-limits.test.js:
// each check gets both a PASS and a FAIL demonstration, because a check
// that cannot be seen to fail is not proven to guard anything.
//
// launch-check.mjs is ESM (Node 24 top-level fetch/AbortSignal need no
// dependency, but the .mjs extension does need real ESM). This file stays
// CommonJS like the rest of the suite, so it loads the module with a
// dynamic import() built from a file:// URL, using pathToFileURL rather than
// a bare Windows path string, which import() does not accept.

const { test, before } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let runChecks;
before(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, "..", "scripts", "launch-check.mjs")).href);
  runChecks = mod.runChecks;
});

const NETLIFY_ORIGIN = "https://super-frangollo-c3a14a.netlify.app";
const WWW_ORIGIN = "https://www.intelligentclean.co.uk";

const HOME_HTML = `<!doctype html><html><head>
<link rel="canonical" href="${WWW_ORIGIN}/" />
<meta property="og:url" content="${WWW_ORIGIN}/" />
</head><body>home</body></html>`;

const ROBOTS_TXT = `User-agent: *\nAllow: /\n\nSitemap: ${WWW_ORIGIN}/sitemap-index.xml\n`;

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${WWW_ORIGIN}/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;

const sitemapPageXml = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;

// A fully green route set for `origin`: every check should PASS, other than
// the two real-domain-only checks, which SKIP when origin is not the real
// domain. Each value is a FACTORY, not a Response, so the same fixture can
// be fetched more than once across tests (or reused within one run), since
// a Response body can only be read once, exactly like a real network response,
// so a shared pre-built instance would fail the second test that used it.
function greenRoutes(origin) {
  return {
    [`${origin}/`]: () => new Response(HOME_HTML, { status: 200 }),
    [`${origin}/admin`]: () =>
      new Response("admin", { status: 200, headers: { "X-Robots-Tag": "noindex, nofollow" } }),
    [`${origin}/robots.txt`]: () => new Response(ROBOTS_TXT, { status: 200 }),
    [`${origin}/sitemap-index.xml`]: () => new Response(SITEMAP_INDEX_XML, { status: 200 }),
    [`${WWW_ORIGIN}/sitemap-0.xml`]: () =>
      new Response(sitemapPageXml([`${WWW_ORIGIN}/`, `${WWW_ORIGIN}/services/`]), { status: 200 }),
    "https://intelligentclean.co.uk/": () =>
      new Response(null, { status: 301, headers: { location: `${WWW_ORIGIN}/` } }),
    "http://www.intelligentclean.co.uk/": () =>
      new Response(null, { status: 301, headers: { location: `${WWW_ORIGIN}/` } }),
  };
}

// Turns a { url: factory } map into a fetchImpl. An un-scripted URL is a
// test-authoring mistake, not a FAIL result, so it throws loudly rather than
// hanging or silently passing.
function fakeFetch(routes) {
  return async (url) => {
    const key = String(url);
    const entry = routes[key];
    if (!entry) throw new Error(`unstubbed fetch in test: ${key}`);
    return entry();
  };
}

function find(results, name) {
  const r = results.find((x) => x.name === name);
  assert.ok(r, `no check named "${name}" (have: ${results.map((x) => x.name).join(", ")})`);
  return r;
}

// ---------------------------------------------------------------------------
// Happy paths

test("happy path on the netlify.app host: every check PASSes except the two real-domain-only checks, which SKIP", async () => {
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(greenRoutes(NETLIFY_ORIGIN)));
  assert.strictEqual(results.length, 9, `expected 9 checks, got ${results.map((r) => r.name).join(", ")}`);
  const byStatus = (s) => results.filter((r) => r.status === s).map((r) => r.name).sort();
  assert.deepStrictEqual(byStatus("SKIP"), ["apex redirects to https www", "http www redirects to https"]);
  assert.deepStrictEqual(byStatus("FAIL"), []);
});

test("happy path on the real domain: the apex and http checks PASS instead of SKIPping", async () => {
  const results = await runChecks(WWW_ORIGIN, fakeFetch(greenRoutes(WWW_ORIGIN)));
  assert.deepStrictEqual(
    results.filter((r) => r.status !== "PASS"),
    []
  );
});

test("a trailing slash on the origin is stripped before building request URLs", async () => {
  const results = await runChecks(`${NETLIFY_ORIGIN}/`, fakeFetch(greenRoutes(NETLIFY_ORIGIN)));
  assert.strictEqual(find(results, "/ answers 200 over https").status, "PASS");
});

// ---------------------------------------------------------------------------
// / answers 200

test("/ answering a non-200 status FAILs", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () => new Response("nope", { status: 500 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, "/ answers 200 over https");
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /status 500/);
});

// ---------------------------------------------------------------------------
// / has no noindex X-Robots-Tag (explicitly required: a noindex header FAILs)

test("a noindex X-Robots-Tag on / FAILs the noindex check (the real, expected pre-launch state)", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () =>
    new Response(HOME_HTML, { status: 200, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, "/ carries no noindex X-Robots-Tag");
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /noindex/);
});

test("no X-Robots-Tag header at all PASSes the noindex check", async () => {
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(greenRoutes(NETLIFY_ORIGIN)));
  assert.strictEqual(find(results, "/ carries no noindex X-Robots-Tag").status, "PASS");
});

// ---------------------------------------------------------------------------
// /admin noindex, including the one-redirect-follow path

test("/admin missing the noindex header FAILs", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/admin`] = () => new Response("admin", { status: 200 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "/admin carries a noindex X-Robots-Tag").status, "FAIL");
});

test("/admin behind one redirect PASSes off the final response's header, not the redirect's", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/admin`] = () =>
    new Response(null, { status: 302, headers: { location: "/admin.html" } });
  routes[`${NETLIFY_ORIGIN}/admin.html`] = () =>
    new Response("admin", { status: 200, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "/admin carries a noindex X-Robots-Tag").status, "PASS");
});

// ---------------------------------------------------------------------------
// /robots.txt

test("/robots.txt with no Sitemap: line FAILs", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/robots.txt`] = () => new Response("User-agent: *\nAllow: /\n", { status: 200 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, "/robots.txt answers 200 and references a sitemap");
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /no Sitemap/);
});

test("/robots.txt answering 404 FAILs", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/robots.txt`] = () => new Response("not found", { status: 404 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "/robots.txt answers 200 and references a sitemap").status, "FAIL");
});

// ---------------------------------------------------------------------------
// /sitemap-index.xml and the sitemap URL host check

test("/sitemap-index.xml answering a non-200 status FAILs both the index check and the URL-host check", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/sitemap-index.xml`] = () => new Response("nope", { status: 500 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "/sitemap-index.xml answers 200").status, "FAIL");
  assert.strictEqual(find(results, `sitemap URLs start with ${WWW_ORIGIN}/`).status, "FAIL");
});

test("a sitemap URL on the wrong host FAILs and names the offending URL (explicitly required)", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${WWW_ORIGIN}/sitemap-0.xml`] = () =>
    new Response(sitemapPageXml([`${WWW_ORIGIN}/`, `${NETLIFY_ORIGIN}/services/`]), { status: 200 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, `sitemap URLs start with ${WWW_ORIGIN}/`);
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /first offender: https:\/\/super-frangollo-c3a14a\.netlify\.app\/services\//);
});

test("a sitemap page with no <loc> URLs FAILs instead of vacuously passing", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${WWW_ORIGIN}/sitemap-0.xml`] = () => new Response("<html>parking page</html>", { status: 200 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, `sitemap URLs start with ${WWW_ORIGIN}/`).status, "FAIL");
});

test("every sitemap URL on the right host PASSes and reports the count", async () => {
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(greenRoutes(NETLIFY_ORIGIN)));
  const r = find(results, `sitemap URLs start with ${WWW_ORIGIN}/`);
  assert.strictEqual(r.status, "PASS");
  assert.match(r.detail, /^2 URL\(s\) checked/);
});

// ---------------------------------------------------------------------------
// canonical + og:url (explicitly required: a missing canonical FAILs)

test("a missing canonical tag FAILs even though og:url is present", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () =>
    new Response(`<html><head><meta property="og:url" content="${WWW_ORIGIN}/" /></head></html>`, { status: 200 });
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, `canonical + og:url start with ${WWW_ORIGIN}/`);
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /canonical=MISSING/);
});

test("a canonical pointing at the wrong host FAILs", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () =>
    new Response(
      `<html><head><link rel="canonical" href="${NETLIFY_ORIGIN}/" /><meta property="og:url" content="${WWW_ORIGIN}/" /></head></html>`,
      { status: 200 }
    );
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, `canonical + og:url start with ${WWW_ORIGIN}/`).status, "FAIL");
});

test("canonical and og:url PASS regardless of attribute order (this reads live HTML, not our own templates)", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () =>
    new Response(
      `<html><head><link href="${WWW_ORIGIN}/" rel="canonical" /><meta content="${WWW_ORIGIN}/" property="og:url" /></head></html>`,
      { status: 200 }
    );
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, `canonical + og:url start with ${WWW_ORIGIN}/`).status, "PASS");
});

// ---------------------------------------------------------------------------
// apex / http redirects, real domain only (explicitly required: FAILs on the
// real domain when not redirecting, SKIPs on a netlify.app host)

test("on a netlify.app origin, the apex and http checks SKIP with the host named in the reason", async () => {
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(greenRoutes(NETLIFY_ORIGIN)));
  const apex = find(results, "apex redirects to https www");
  const http = find(results, "http www redirects to https");
  assert.strictEqual(apex.status, "SKIP");
  assert.strictEqual(http.status, "SKIP");
  assert.match(apex.detail, /super-frangollo-c3a14a\.netlify\.app/);
});

test("on the real domain, the apex not redirecting FAILs", async () => {
  const routes = greenRoutes(WWW_ORIGIN);
  routes["https://intelligentclean.co.uk/"] = () => new Response("served directly", { status: 200 });
  const results = await runChecks(WWW_ORIGIN, fakeFetch(routes));
  const r = find(results, "apex redirects to https www");
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /status 200/);
});

test("on the real domain, a 302 apex redirect FAILs (only 301/308 count as done)", async () => {
  const routes = greenRoutes(WWW_ORIGIN);
  routes["https://intelligentclean.co.uk/"] = () =>
    new Response(null, { status: 302, headers: { location: `${WWW_ORIGIN}/` } });
  const results = await runChecks(WWW_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "apex redirects to https www").status, "FAIL");
});

test("on the real domain, http not upgrading to https FAILs", async () => {
  const routes = greenRoutes(WWW_ORIGIN);
  routes["http://www.intelligentclean.co.uk/"] = () => new Response("served directly", { status: 200 });
  const results = await runChecks(WWW_ORIGIN, fakeFetch(routes));
  assert.strictEqual(find(results, "http www redirects to https").status, "FAIL");
});

// ---------------------------------------------------------------------------
// A fetch that throws never becomes an uncaught exception (explicitly required)

test("a thrown fetch error yields FAIL with the error message, not an exception", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/`] = () => {
    throw new Error("getaddrinfo ENOTFOUND super-frangollo-c3a14a.netlify.app");
  };
  let results;
  await assert.doesNotReject(async () => {
    results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  });
  const home = find(results, "/ answers 200 over https");
  assert.strictEqual(home.status, "FAIL");
  assert.match(home.detail, /ENOTFOUND/);
  // The dependent canonical/og:url check FAILs cleanly off the same
  // unreadable response too, instead of throwing on a null body.
  assert.strictEqual(find(results, `canonical + og:url start with ${WWW_ORIGIN}/`).status, "FAIL");
});

test("a rejected fetch promise (not a synchronously thrown error) is handled the same way", async () => {
  const routes = greenRoutes(NETLIFY_ORIGIN);
  routes[`${NETLIFY_ORIGIN}/admin`] = () => Promise.reject(new Error("socket hang up"));
  const results = await runChecks(NETLIFY_ORIGIN, fakeFetch(routes));
  const r = find(results, "/admin carries a noindex X-Robots-Tag");
  assert.strictEqual(r.status, "FAIL");
  assert.match(r.detail, /socket hang up/);
});

test("an unstubbed URL is a test-authoring error, not a silent pass (self-check on the fake itself)", async () => {
  await assert.rejects(fakeFetch({})("https://example.com/"), /unstubbed fetch in test/);
});
