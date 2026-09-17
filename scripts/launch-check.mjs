#!/usr/bin/env node
// Post-launch cutover verification (docs/LAUNCH_CUTOVER.md, "Post-launch
// verification checklist"). One command in place of the checklist's manual
// curl/browser steps: run it against the pre-launch host to prove the tool
// works (the noindex check is EXPECTED to fail there, since that host is
// deliberately kept out of the index; see netlify.toml's
// TODO(prelaunch/noindex)), then run it again against the real domain once
// DNS and STEP 3 are done.
//
// Usage: node scripts/launch-check.mjs <origin>
//   node scripts/launch-check.mjs https://super-frangollo-c3a14a.netlify.app
//   node scripts/launch-check.mjs https://www.intelligentclean.co.uk
//
// The checks live in a pure function, runChecks(origin, fetchImpl), so
// test/launch-check.test.js can drive them with a scripted fake fetch.
// This file's own job beyond that is the CLI wrapper: print one line per
// check, then exit 1 if anything FAILed. No dependencies: Node 24's built-in
// fetch/Headers/AbortSignal only.

const WWW_ORIGIN = "https://www.intelligentclean.co.uk";
const WWW_PREFIX = `${WWW_ORIGIN}/`;
const TIMEOUT_MS = 15000;

function describeError(err) {
  const code = err?.cause?.code || err?.code;
  return code ? `${err.message} (${code})` : err.message;
}

// Every network call goes through here so a DNS failure, a timeout, or any
// other thrown error becomes a return value, never an exception the caller
// has to guard against. { response } on success, { error } on failure.
async function safeFetch(fetchImpl, url, options = {}) {
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { response };
  } catch (err) {
    return { error: err };
  }
}

// /admin is served today as a Netlify 200-rewrite (no real HTTP redirect),
// but the checklist asks to follow one redirect if that ever changes.
// redirect: "manual" exposes the 3xx instead of letting fetch chase it, so
// this hops exactly once and stops (confirmed against a local test server
// that Node's fetch gives a readable status/Location in manual mode, unlike
// a browser's opaque redirect).
async function fetchFollowingOneRedirect(fetchImpl, url) {
  const first = await safeFetch(fetchImpl, url, { redirect: "manual" });
  if (first.error) return first;
  const { response } = first;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return safeFetch(fetchImpl, new URL(location, url).href, { redirect: "manual" });
    }
  }
  return first;
}

// Matches the whole tag first, then pulls one attribute out of that
// substring, so attribute order inside the tag does not matter (this reads
// live HTML from wherever the origin serves it, not our own templates).
function extractTagAttr(html, tagRe, attrRe) {
  const tag = html.match(tagRe);
  if (!tag) return null;
  const attr = tag[0].match(attrRe);
  return attr ? attr[1] : null;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/gi)].map((m) => m[1].trim());
}

function isRealDomain(base) {
  try {
    const host = new URL(base).hostname;
    return host === "intelligentclean.co.uk" || host === "www.intelligentclean.co.uk";
  } catch {
    return false;
  }
}

/**
 * Runs the post-launch verification checklist against `origin` using
 * `fetchImpl` (the global fetch in production, a scripted fake in tests).
 * Never throws: every network failure becomes a FAIL result carrying the
 * error message. Returns an array of { name, status, detail }, status one
 * of "PASS" / "FAIL" / "SKIP".
 */
export async function runChecks(origin, fetchImpl) {
  const base = origin.replace(/\/+$/, "");
  const results = [];
  const add = (name, status, detail) => results.push({ name, status, detail });

  // --- / : fetched once; three checks read it (status, noindex, canonical/og:url) ---
  const home = await safeFetch(fetchImpl, `${base}/`);
  let homeBody = null;
  if (home.error) {
    const detail = `fetch failed: ${describeError(home.error)}`;
    add("/ answers 200 over https", "FAIL", detail);
    add("/ carries no noindex X-Robots-Tag", "FAIL", detail);
  } else {
    const { response } = home;
    add("/ answers 200 over https", response.status === 200 ? "PASS" : "FAIL", `status ${response.status}`);
    const robotsTag = response.headers.get("x-robots-tag") || "";
    const noindexed = /noindex/i.test(robotsTag);
    add(
      "/ carries no noindex X-Robots-Tag",
      noindexed ? "FAIL" : "PASS",
      robotsTag ? `X-Robots-Tag: ${robotsTag}` : "no X-Robots-Tag header"
    );
    try {
      homeBody = await response.text();
    } catch {
      homeBody = null;
    }
  }

  // --- /admin : must stay noindexed regardless of launch state ---
  const admin = await fetchFollowingOneRedirect(fetchImpl, `${base}/admin`);
  if (admin.error) {
    add("/admin carries a noindex X-Robots-Tag", "FAIL", `fetch failed: ${describeError(admin.error)}`);
  } else {
    const tag = admin.response.headers.get("x-robots-tag") || "";
    const noindexed = /noindex/i.test(tag);
    add(
      "/admin carries a noindex X-Robots-Tag",
      noindexed ? "PASS" : "FAIL",
      tag ? `X-Robots-Tag: ${tag}` : "no X-Robots-Tag header"
    );
  }

  // --- /robots.txt : 200 and names a sitemap ---
  const robots = await safeFetch(fetchImpl, `${base}/robots.txt`);
  if (robots.error) {
    add("/robots.txt answers 200 and references a sitemap", "FAIL", `fetch failed: ${describeError(robots.error)}`);
  } else {
    const { response } = robots;
    if (response.status !== 200) {
      add("/robots.txt answers 200 and references a sitemap", "FAIL", `status ${response.status}`);
    } else {
      let text = "";
      try {
        text = await response.text();
      } catch {
        text = "";
      }
      const m = text.match(/^\s*Sitemap:\s*(\S+)/im);
      add(
        "/robots.txt answers 200 and references a sitemap",
        m ? "PASS" : "FAIL",
        m ? `Sitemap: ${m[1]}` : "status 200 but no Sitemap: line found"
      );
    }
  }

  // --- /sitemap-index.xml : 200, then every <loc> sitemap it lists ---
  const sitemapIndex = await safeFetch(fetchImpl, `${base}/sitemap-index.xml`);
  let childSitemaps = null;
  if (sitemapIndex.error) {
    add("/sitemap-index.xml answers 200", "FAIL", `fetch failed: ${describeError(sitemapIndex.error)}`);
  } else {
    const { response } = sitemapIndex;
    if (response.status !== 200) {
      add("/sitemap-index.xml answers 200", "FAIL", `status ${response.status}`);
    } else {
      let text = "";
      try {
        text = await response.text();
      } catch {
        text = "";
      }
      childSitemaps = extractLocs(text);
      add("/sitemap-index.xml answers 200", "PASS", `status 200, ${childSitemaps.length} sitemap(s) listed`);
    }
  }

  // Every <loc> URL inside every listed sitemap must be on the real www
  // domain. The child sitemaps are fetched exactly at the URL the index
  // gives, not rewritten onto the origin under test: astro.config.mjs fixes
  // `site` to the real domain, so the sitemap always declares production
  // URLs no matter which host actually serves it, and that is exactly what
  // this check is proving. Pre-launch, that means it fetches the real
  // domain's current parking page, which is the honest, intended result.
  if (childSitemaps === null) {
    add(`sitemap URLs start with ${WWW_PREFIX}`, "FAIL", "sitemap-index.xml could not be read");
  } else if (childSitemaps.length === 0) {
    add(`sitemap URLs start with ${WWW_PREFIX}`, "FAIL", "sitemap-index.xml lists no <loc> sitemaps");
  } else {
    const pageUrls = [];
    let problem = null;
    for (const sitemapUrl of childSitemaps) {
      const child = await safeFetch(fetchImpl, sitemapUrl);
      if (child.error) {
        problem = `fetching ${sitemapUrl}: ${describeError(child.error)}`;
        break;
      }
      if (child.response.status !== 200) {
        problem = `${sitemapUrl} answered status ${child.response.status}`;
        break;
      }
      let text = "";
      try {
        text = await child.response.text();
      } catch {
        text = "";
      }
      const locs = extractLocs(text);
      if (locs.length === 0) {
        problem = `${sitemapUrl} has no <loc> URLs`;
        break;
      }
      pageUrls.push(...locs);
    }
    if (problem) {
      add(`sitemap URLs start with ${WWW_PREFIX}`, "FAIL", problem);
    } else {
      const offender = pageUrls.find((u) => !u.startsWith(WWW_PREFIX));
      add(
        `sitemap URLs start with ${WWW_PREFIX}`,
        offender ? "FAIL" : "PASS",
        offender
          ? `${pageUrls.length} URL(s) checked; first offender: ${offender}`
          : `${pageUrls.length} URL(s) checked, all under ${WWW_PREFIX}`
      );
    }
  }

  // --- canonical + og:url on / : both must point at the real www domain ---
  if (homeBody === null) {
    add(`canonical + og:url start with ${WWW_PREFIX}`, "FAIL", "/ could not be read");
  } else {
    const canonical = extractTagAttr(homeBody, /<link\b[^>]*rel="canonical"[^>]*>/i, /href="([^"]*)"/i);
    const ogUrl = extractTagAttr(homeBody, /<meta\b[^>]*property="og:url"[^>]*>/i, /content="([^"]*)"/i);
    const detail = `canonical=${canonical ?? "MISSING"} og:url=${ogUrl ?? "MISSING"}`;
    const ok =
      Boolean(canonical) && Boolean(ogUrl) && canonical.startsWith(WWW_PREFIX) && ogUrl.startsWith(WWW_PREFIX);
    add(`canonical + og:url start with ${WWW_PREFIX}`, ok ? "PASS" : "FAIL", detail);
  }

  // --- apex + http to https redirects : only meaningful on the real domain ---
  if (!isRealDomain(base)) {
    const reason = `origin is not the real domain (${base})`;
    add("apex redirects to https www", "SKIP", reason);
    add("http www redirects to https", "SKIP", reason);
  } else {
    const apex = await safeFetch(fetchImpl, "https://intelligentclean.co.uk/", { redirect: "manual" });
    if (apex.error) {
      add("apex redirects to https www", "FAIL", `fetch failed: ${describeError(apex.error)}`);
    } else {
      const { response } = apex;
      const location = response.headers.get("location") || "";
      const ok = (response.status === 301 || response.status === 308) && location.startsWith(WWW_ORIGIN);
      add(
        "apex redirects to https www",
        ok ? "PASS" : "FAIL",
        `status ${response.status}, location=${location || "none"}`
      );
    }

    const httpWww = await safeFetch(fetchImpl, "http://www.intelligentclean.co.uk/", { redirect: "manual" });
    if (httpWww.error) {
      add("http www redirects to https", "FAIL", `fetch failed: ${describeError(httpWww.error)}`);
    } else {
      const { response } = httpWww;
      const location = response.headers.get("location") || "";
      const ok = response.status >= 300 && response.status < 400 && location.startsWith(WWW_ORIGIN);
      add(
        "http www redirects to https",
        ok ? "PASS" : "FAIL",
        `status ${response.status}, location=${location || "none"}`
      );
    }
  }

  return results;
}

function printReport(results) {
  for (const r of results) {
    console.log(`${r.status.padEnd(4)}  ${r.name}: ${r.detail}`);
  }
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n${pass} pass, ${fail} fail, ${skip} skip`);
  return fail;
}

async function main() {
  const origin = process.argv[2];
  if (!origin) {
    console.error("Usage: node scripts/launch-check.mjs <origin>");
    console.error("  e.g. node scripts/launch-check.mjs https://super-frangollo-c3a14a.netlify.app");
    process.exitCode = 1;
    return;
  }
  const results = await runChecks(origin, fetch);
  const fail = printReport(results);
  process.exitCode = fail > 0 ? 1 : 0;
}

if (import.meta.main) {
  main();
}
