// Phase 2, Slice 3 — unit tests for the server-side pricing + service-area
// logic. Run with: node --test.
//
// These exercise the REAL functions from shared/config — the figures of record
// the website and the field app both quote from (D-003/D-007/D-011). Pure logic:
// no network, no creds, no node_modules.

const { test } = require("node:test");
const assert = require("node:assert");
const pricing = require("../shared/config/pricing.js");
const serviceArea = require("../shared/config/serviceArea.js");

// --- serviceArea.isOutOfArea (D-011) -------------------------------------

test("isOutOfArea: core postcodes are in area (no surcharge)", () => {
  for (const pc of ["GL50 1AA", "GL51 2AB", "GL52 7XY", "GL53 0BB", "GL1 1AA", "GL2 4AB", "GL3 3BT", "GL4 0AA"]) {
    assert.strictEqual(serviceArea.isOutOfArea(pc), false, `${pc} should be core`);
  }
});

test("isOutOfArea: wider-area and outside postcodes incur the surcharge", () => {
  for (const pc of ["GL5 2AB", "GL55 6AA", "GL20 5AA", "OX1 1AA", "SW1A 1AA"]) {
    assert.strictEqual(serviceArea.isOutOfArea(pc), true, `${pc} should be out of area`);
  }
});

test("isOutOfArea: GL54 splits by sector — Winchcombe core, far Cotswolds surcharged (D-011)", () => {
  assert.strictEqual(serviceArea.isOutOfArea("GL54 5LB"), false); // Winchcombe (GL54 5) -> core
  assert.strictEqual(serviceArea.isOutOfArea("gl545lb"), false);  // same, no space + lower-case
  assert.strictEqual(serviceArea.isOutOfArea("GL54 2HY"), true);  // Bourton-on-the-Water (GL54 2)
  assert.strictEqual(serviceArea.isOutOfArea("GL54 1AA"), true);  // Stow-on-the-Wold (GL54 1)
  assert.strictEqual(serviceArea.isOutOfArea("GL54 3PP"), true);  // Northleach (GL54 3)
  assert.strictEqual(serviceArea.isOutOfArea("GL54"), true);      // bare GL54 ambiguous -> err toward charge
});

test("isOutOfArea: tolerant of spacing, case and bare districts", () => {
  assert.strictEqual(serviceArea.isOutOfArea("gl51 2ab"), false); // lower-case
  assert.strictEqual(serviceArea.isOutOfArea("GL512AB"), false);  // no space
  assert.strictEqual(serviceArea.isOutOfArea("GL3"), false);      // bare core district
  assert.strictEqual(serviceArea.isOutOfArea("GL52"), false);     // bare core district
  assert.strictEqual(serviceArea.isOutOfArea("GL5"), true);       // bare wider district
  assert.strictEqual(serviceArea.isOutOfArea(""), true);          // garbage -> out of area
  assert.strictEqual(serviceArea.isOutOfArea(null), true);
});

// --- pricing.quote (D-003/D-007/D-011) -----------------------------------

test("quote: core single room — no surcharge, deposit on inc-VAT", () => {
  const q = pricing.quote([{ code: "base_room" }], { outOfArea: false });
  assert.strictEqual(q.items_ex_vat, 75);
  assert.strictEqual(q.out_of_area_surcharge_ex_vat, 0);
  assert.strictEqual(q.subtotal_ex_vat, 75);
  assert.strictEqual(q.vat, 15);
  assert.strictEqual(q.total_inc_vat, 90);
  assert.strictEqual(q.deposit_inc_vat, 9); // 10% of the inc-VAT total
  assert.strictEqual(q.currency, "GBP");
});

test("quote: out-of-area adds the flat £15 surcharge before VAT", () => {
  const q = pricing.quote([{ code: "base_room" }], { outOfArea: true });
  assert.strictEqual(q.out_of_area, true);
  assert.strictEqual(q.out_of_area_surcharge_ex_vat, 15);
  assert.strictEqual(q.subtotal_ex_vat, 90);
  assert.strictEqual(q.vat, 18);
  assert.strictEqual(q.total_inc_vat, 108);
  assert.strictEqual(q.deposit_inc_vat, 10.8);
});

test("quote: quantities and multiple lines sum correctly", () => {
  const q = pricing.quote(
    [{ code: "large_room", qty: 2 }, { code: "stairs_to_13" }],
    { outOfArea: false }
  );
  assert.strictEqual(q.items_ex_vat, 295); // 2*115 + 65
  assert.strictEqual(q.subtotal_ex_vat, 295);
  assert.strictEqual(q.total_inc_vat, 354);
  assert.strictEqual(q.deposit_inc_vat, 35.4);
  assert.strictEqual(q.lines[0].line_ex_vat, 230);
  assert.strictEqual(q.lines[0].label, "Large room / lounge (20-30m2)");
});

test("quote: an unknown code throws (loud, never mispriced)", () => {
  assert.throws(() => pricing.quote([{ code: "gold_plating" }], {}), /Unknown price code/);
});

test("quote: an invalid quantity throws", () => {
  assert.throws(() => pricing.quote([{ code: "base_room", qty: 0 }], {}), /Invalid quantity/);
  assert.throws(() => pricing.quote([{ code: "base_room", qty: 2.5 }], {}), /Invalid quantity/);
});

test("quote: empty / non-array lines throw", () => {
  assert.throws(() => pricing.quote([], {}), /at least one line/);
  assert.throws(() => pricing.quote(undefined, {}), /at least one line/);
});
