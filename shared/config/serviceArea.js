// Service-area + out-of-area surcharge config (D-006, D-011).
//
// Single source for the core (no-surcharge) towns, the flat out-of-area
// surcharge figure, and the wider-area example towns. Consumed by the assistant
// prompt (server/netlify/functions/chat.js) today; from Slice 3 the
// validateBooking successor + /api/v1/quote will enforce the surcharge from
// here, and the Astro area pages already agree (this is seeded from their
// frontmatter — site/src/content/areas/*.md).
//
// TODO(D-011 boundary): the precise out-of-area postcode boundary is still open
// with Mark. `core_postcodes` below is seeded from the area-page frontmatter.
// Settle the exact list with Mark; it lives here in one place so it is a
// one-line change that the assistant, the server and the site all pick up.

const core_towns = ["Cheltenham", "Gloucester", "Winchcombe"];

// GL districts for each core town, from the area-page frontmatter.
const core_postcodes = [
  "GL50", "GL51", "GL52", "GL53", // Cheltenham
  "GL1", "GL2", "GL3", "GL4",     // Gloucester
  "GL54",                          // Winchcombe
];

// Example wider-Gloucestershire towns named in the assistant's area prose.
const wider_towns = ["Stroud", "Tewkesbury", "Cirencester"];

// Flat out-of-area surcharge, ex-VAT (D-011, confirmed by Mark June 2026).
const out_of_area_surcharge_ex_vat = 15;

// "Cheltenham, Gloucester and Winchcombe" — the core towns as an English list.
// Centralised so the assistant prompt and the pricing block never disagree.
function coreTownsPhrase() {
  if (core_towns.length <= 1) return core_towns.join("");
  return core_towns.slice(0, -1).join(", ") + " and " + core_towns[core_towns.length - 1];
}

// Generates the SERVICE AREA block of the assistant system prompt, byte-for-byte
// equal to the prose it replaces — the facts (core towns, £15 surcharge, wider
// towns) now come from the values above.
function serviceAreaBlock() {
  const core = coreTownsPhrase();
  const wider = wider_towns.join(", ");
  const s = out_of_area_surcharge_ex_vat;
  return `SERVICE AREA AND OUT OF AREA CHARGE:
${core} are the core service area with no travel charge. ICC also covers the wider Gloucestershire area, including ${wider}, and the surrounding towns (all GL postcodes). Jobs outside the core area (anywhere other than ${core}) incur a flat out of area surcharge of £${s} + VAT. When the customer's address is outside the core area, mention clearly and early that a flat £${s} + VAT out of area surcharge applies, include it in the itemised quote, and state it plainly as a fixed figure — not something "to be confirmed".`;
}

module.exports = {
  core_towns,
  core_postcodes,
  wider_towns,
  out_of_area_surcharge_ex_vat,
  coreTownsPhrase,
  serviceAreaBlock,
};
