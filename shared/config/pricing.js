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

module.exports = {
  items,
  custom_lines,
  deposit_rate,
  priceLine,
  priceOf,
  pricingBlock,
};
