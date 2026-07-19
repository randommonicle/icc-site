// Guard: the area pages must agree with the D-011 boundary encoded in
// shared/config/serviceArea.js.
//
// This exists because the Winchcombe page claimed the whole of GL54 as core
// ("no out-of-area travel surcharge") while serviceArea.js scopes core to the
// GL54 5 sector only, with Bourton (GL54 2), Stow (GL54 1) and Northleach
// (GL54 3) explicitly out of area. A reader in Bourton was told in writing that
// there was no surcharge and then quoted £15 by the assistant. The FAQ text also
// feeds the FAQPage JSON-LD, so the wrong claim was marked up for search engines.
//
// The surcharge figure had the same shape of problem: single-sourced on the home
// page but typed as a literal in the area templates, so moving it in config would
// have left them silently disagreeing.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const serviceArea = require("../shared/config/serviceArea.js");

const repoRoot = path.join(__dirname, "..");
const areasDir = path.join(repoRoot, "site", "src", "content", "areas");
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");
const areaFile = (name) => fs.readFileSync(path.join(areasDir, name), "utf8");

test("a core-tier area page never claims a whole district its config only part-covers", () => {
  // serviceArea.js treats Winchcombe as the GL54 5 sector, not all of GL54.
  assert.deepStrictEqual(serviceArea.core_sectors, ["GL545"]);
  const winchcombe = areaFile("winchcombe.md");
  const frontmatter = winchcombe.slice(0, winchcombe.indexOf("\n---", 3));
  assert.match(
    frontmatter,
    /postcodes: \["GL54 5"\]/,
    "the coverage chip must name the sector, not the whole GL54 district"
  );
  assert.doesNotMatch(
    frontmatter,
    /postcodes: \["GL54"\]/,
    "claiming all of GL54 as core contradicts serviceArea.js"
  );
});

test("the far-Cotswold GL54 towns are disclosed as surcharged, not silently core", () => {
  const winchcombe = areaFile("winchcombe.md");
  for (const town of ["Bourton", "Stow", "Northleach"]) {
    assert.match(
      winchcombe,
      new RegExp(town),
      `${town} shares the GL54 district and must be addressed, not left ambiguous`
    );
  }
  assert.match(
    winchcombe,
    /out-of-area surcharge applies|out-of-area surcharge as the rest/,
    "the page must state that those towns carry the surcharge"
  );
});

test("isOutOfArea agrees with what the Winchcombe page now tells the reader", () => {
  // The page's promise and the code's behaviour, checked against each other.
  assert.strictEqual(serviceArea.isOutOfArea("GL54 5LJ"), false, "Winchcombe itself is core");
  assert.strictEqual(serviceArea.isOutOfArea("GL54 2AA"), true, "Bourton carries the surcharge");
  assert.strictEqual(serviceArea.isOutOfArea("GL54 1AA"), true, "Stow carries the surcharge");
  assert.strictEqual(serviceArea.isOutOfArea("GL54 3AA"), true, "Northleach carries the surcharge");
});

test("the area templates read the surcharge from config rather than a literal", () => {
  for (const file of [["site", "src", "pages", "areas", "[slug].astro"],
                      ["site", "src", "pages", "areas", "index.astro"]]) {
    const src = read(...file);
    const name = file[file.length - 1];
    assert.match(src, /shared\/config\/serviceArea\.js/, `${name} must import the single source`);
    assert.match(src, /out_of_area_surcharge/, `${name} must read the figure from config`);
    // The rendered body must not carry the figure typed by hand. The page
    // description in frontmatter is prose written per page and is checked
    // separately by the drift test below.
    const body = src.slice(src.indexOf("---", 3));
    assert.doesNotMatch(
      body,
      /flat £15/,
      `${name} still hardcodes the surcharge in its markup`
    );
  }
});

test("home service cards deepen into /services, and every anchor they use exists", () => {
  // All four cards previously jumped straight to /book, so the page carrying the
  // price tables and the method explanation was reachable only from the nav.
  const home = read("site", "src", "pages", "index.astro");
  const services = read("site", "src", "pages", "services.astro");
  const hrefs = [...home.matchAll(/class="service-card" href="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(hrefs.length, 4, "expected four service cards on the home page");
  for (const href of hrefs) {
    assert.ok(href.startsWith("/services#"), `service card should link into /services, got ${href}`);
    const id = href.split("#")[1];
    assert.match(
      services,
      new RegExp(`id="${id}"`),
      `index.astro links to #${id} but services.astro has no such anchor`
    );
  }
});

test("every stated surcharge figure across the site matches the config", () => {
  // Catches the drift the literals used to allow: change the figure in config and
  // any prose still naming the old number fails here rather than shipping.
  const expected = `£${serviceArea.out_of_area_surcharge}`;
  const files = [
    ["site", "src", "pages", "areas", "index.astro"],
    ["site", "src", "pages", "areas", "[slug].astro"],
    ["site", "src", "content", "areas", "winchcombe.md"],
  ];
  for (const file of files) {
    const src = read(...file);
    const figures = [...src.matchAll(/£(\d+)/g)].map((m) => `£${m[1]}`);
    for (const found of figures) {
      assert.strictEqual(
        found,
        expected,
        `${file[file.length - 1]} states ${found} but the config says ${expected}`
      );
    }
  }
});
