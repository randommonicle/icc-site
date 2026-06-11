// Pricing config (D-006).
//
// The per-room/-item price list, the deposit rate, and the surcharge figure as
// DATA, not prose. Consumed by the assistant prompt today (it generates the
// PRICING block, byte-for-byte equal to what it replaces) and, from Slice 3, by
// the validateBooking successor + /api/v1/quote to compute totals server-side.
// The Astro home/services price cards should render from here too — that closes
// the Phase 1 price drift (D-006 / L-009).
//
// All prices are EX-VAT (the assistant always states "+ VAT"). Keep this the
// single source: when a price changes, change it here and the assistant, the
// server quote and the site move together.

const serviceArea = require("./serviceArea.js");

// Per-room / per-item priced lines. `prefix`/`suffix` carry the exact display
// qualifiers ("from", ", flat rate") so a generated line matches the prose.
const items = [
  { code: "base_room",        label: "Base call-out / first room (up to 15m2)", price_ex_vat: 75 },
  { code: "medium_room",      label: "Medium room (15-20m2)",                   price_ex_vat: 95 },
  { code: "large_room",       label: "Large room / lounge (20-30m2)",           price_ex_vat: 115 },
  { code: "hallway",          label: "Hallway",                                 price_ex_vat: 55 },
  { code: "landing",          label: "Landing",                                 price_ex_vat: 45 },
  { code: "stairs_to_13",     label: "Stairs up to 13 steps",                   price_ex_vat: 65 },
  { code: "stairs_14_plus",   label: "Stairs 14+ steps",                        price_ex_vat: 80 },
  { code: "upholstery_2",     label: "Upholstery 2-seater sofa",                price_ex_vat: 75 },
  { code: "upholstery_3",     label: "Upholstery 3-seater sofa",                price_ex_vat: 90 },
  { code: "upholstery_chair", label: "Upholstery armchair",                     price_ex_vat: 50 },
  { code: "stain",            label: "Stain treatment",                         price_ex_vat: 45, prefix: "from " },
  { code: "furniture_moving", label: "Furniture moving surcharge",              price_ex_vat: 30 },
  {
    code: "out_of_area",
    label: "Out of area surcharge (address outside " + serviceArea.coreTownsPhrase() + ")",
    price_ex_vat: serviceArea.out_of_area_surcharge_ex_vat,
    suffix: ", flat rate",
  },
];

// Lines that are not a single fixed figure (kept as prose, in order).
const custom_lines = [
  "Full house packages: significant discount, quote on request",
  "Commercial: tailored pricing",
];

// 10% non-refundable deposit at booking (used by the server quote, Slice 3).
const deposit_rate = 0.1;

function priceLine(it) {
  return `${it.label}: ${it.prefix || ""}£${it.price_ex_vat} + VAT${it.suffix || ""}`;
}

// Ex-VAT price for a known item code (used by the confirmation email/PDF and,
// from Slice 3, the server quote). Throws on an unknown code so drift is loud.
function priceOf(code) {
  const it = items.find((i) => i.code === code);
  if (!it) throw new Error(`Unknown price code: ${code}`);
  return it.price_ex_vat;
}

// Generates the PRICING block of the assistant system prompt, byte-for-byte
// equal to the prose it replaces.
function pricingBlock() {
  const header = "PRICING (all prices PLUS VAT - always state this clearly):";
  const lines = items.map(priceLine).concat(custom_lines);
  return [header, ...lines].join("\n");
}

// UK standard VAT rate. Every figure in `items` is ex-VAT (the assistant always
// states "+ VAT"); this is the single source so the server quote and any client
// agree on the gross figure.
const vat_rate = 0.2;

// Round to 2 decimal places (money), avoiding binary-float artefacts such as
// 15.600000000000001.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Server-side itemised quote (Slice 3 — D-003/D-007/D-011). Given the chosen
// priced lines and whether the address is out of area, returns each priced
// line, the ex-VAT subtotal, the flat out-of-area surcharge, VAT, the inc-VAT
// total and the 10% deposit. The deposit is taken on the INC-VAT total — what
// the customer actually pays (assumption to confirm with Mark, like the
// surcharge was). Throws on an unknown item code or an invalid quantity so a
// bad payload fails loudly rather than mispricing. This is the figure of
// record: the website and the field app both quote from here so they never
// diverge — the server-side successor to the assistant's client-side quote.
function quote(lines, opts = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("quote requires at least one line item");
  }
  const out_of_area = !!opts.outOfArea;

  const quotedLines = lines.map((line) => {
    const code = line && line.code;
    const qty = line && line.qty === undefined ? 1 : Number(line && line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new Error(`Invalid quantity for ${code}`);
    }
    const it = items.find((i) => i.code === code);
    if (!it) throw new Error(`Unknown price code: ${code}`);
    return {
      code,
      label: it.label,
      qty,
      unit_ex_vat: it.price_ex_vat,
      line_ex_vat: round2(it.price_ex_vat * qty),
    };
  });

  const items_ex_vat = round2(quotedLines.reduce((sum, l) => sum + l.line_ex_vat, 0));
  const out_of_area_surcharge_ex_vat = out_of_area ? serviceArea.out_of_area_surcharge_ex_vat : 0;
  const subtotal_ex_vat = round2(items_ex_vat + out_of_area_surcharge_ex_vat);
  const vat = round2(subtotal_ex_vat * vat_rate);
  const total_inc_vat = round2(subtotal_ex_vat + vat);
  const deposit_inc_vat = round2(total_inc_vat * deposit_rate);

  return {
    currency: "GBP",
    lines: quotedLines,
    out_of_area,
    items_ex_vat,
    out_of_area_surcharge_ex_vat,
    subtotal_ex_vat,
    vat_rate,
    vat,
    total_inc_vat,
    deposit_rate,
    deposit_inc_vat,
  };
}

module.exports = {
  items,
  custom_lines,
  deposit_rate,
  vat_rate,
  priceLine,
  priceOf,
  quote,
  pricingBlock,
};
