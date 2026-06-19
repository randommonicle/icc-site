// Pricing config (D-006).
//
// The per-room/-item price list, the deposit rate, and the surcharge figure as
// DATA, not prose. Consumed by the assistant prompt today (it generates the
// PRICING block) and by the validateBooking successor + /api/v1/quote to compute
// totals server-side. The Astro home/services price cards render from here too,
// closing the Phase 1 price drift (D-006 / L-009).
//
// Mark is NOT VAT-registered (sole trader, under the threshold), so prices are
// FLAT figures with no VAT added or shown anywhere: the listed number is what the
// customer pays. If he registers later, reintroduce VAT here as the single source
// (and update the site/prompt that read from it). Keep this the single source:
// change a price here and the assistant, the server quote and the site move
// together.

const serviceArea = require("./serviceArea.js");

// Per-room / per-item priced lines. `prefix`/`suffix` carry the exact display
// qualifiers ("from", ", flat rate") so a generated line matches the prose.
const items = [
  { code: "base_room",        label: "Base call-out / first room (up to 15m2)", price: 75 },
  { code: "medium_room",      label: "Medium room (15-20m2)",                   price: 95 },
  { code: "large_room",       label: "Large room / lounge (20-30m2)",           price: 115 },
  { code: "hallway",          label: "Hallway",                                 price: 55 },
  { code: "landing",          label: "Landing",                                 price: 45 },
  { code: "stairs_to_13",     label: "Stairs up to 13 steps",                   price: 65 },
  { code: "stairs_14_plus",   label: "Stairs 14+ steps",                        price: 80 },
  { code: "upholstery_2",     label: "Upholstery 2-seater sofa",                price: 75 },
  { code: "upholstery_3",     label: "Upholstery 3-seater sofa",                price: 90 },
  { code: "upholstery_chair", label: "Upholstery armchair",                     price: 50 },
  { code: "stain",            label: "Stain treatment",                         price: 45, prefix: "from " },
  { code: "furniture_moving", label: "Furniture moving surcharge",              price: 30 },
  {
    code: "out_of_area",
    label: "Out of area surcharge (address outside " + serviceArea.coreTownsPhrase() + ")",
    price: serviceArea.out_of_area_surcharge,
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
  return `${it.label}: ${it.prefix || ""}£${it.price}${it.suffix || ""}`;
}

// Price for a known item code (used by the confirmation email/PDF and the server
// quote). Throws on an unknown code so drift is loud.
function priceOf(code) {
  const it = items.find((i) => i.code === code);
  if (!it) throw new Error(`Unknown price code: ${code}`);
  return it.price;
}

// Generates the PRICING block of the assistant system prompt.
function pricingBlock() {
  const header = "PRICING (all prices are the final price the customer pays - no VAT is added):";
  const lines = items.map(priceLine).concat(custom_lines);
  return [header, ...lines].join("\n");
}

// Round to 2 decimal places (money), avoiding binary-float artefacts such as
// 15.600000000000001.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Server-side itemised quote (Slice 3 - D-003/D-007/D-011). Given the chosen
// priced lines and whether the address is out of area, returns each priced line,
// the items total, the flat out-of-area surcharge, the grand total and the 10%
// deposit. No VAT is applied (Mark is not VAT-registered); the deposit is 10% of
// the total the customer pays. Throws on an unknown item code or an invalid
// quantity so a bad payload fails loudly rather than mispricing. This is the
// figure of record: the website and the field app both quote from here so they
// never diverge - the server-side successor to the assistant's client-side quote.
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
      unit_price: it.price,
      line_total: round2(it.price * qty),
    };
  });

  const items_total = round2(quotedLines.reduce((sum, l) => sum + l.line_total, 0));
  const out_of_area_surcharge = out_of_area ? serviceArea.out_of_area_surcharge : 0;
  const total = round2(items_total + out_of_area_surcharge);
  const deposit = round2(total * deposit_rate);

  return {
    currency: "GBP",
    lines: quotedLines,
    out_of_area,
    items_total,
    out_of_area_surcharge,
    total,
    deposit_rate,
    deposit,
  };
}

module.exports = {
  items,
  custom_lines,
  deposit_rate,
  priceLine,
  priceOf,
  quote,
  pricingBlock,
};
