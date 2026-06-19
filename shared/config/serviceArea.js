// Service-area + out-of-area surcharge config (D-006, D-011).
//
// Single source for the core (no-surcharge) towns, the flat out-of-area
// surcharge figure, and the wider-area example towns. Consumed by the assistant
// prompt (server/netlify/functions/chat.js) today; from Slice 3 the
// validateBooking successor + /api/v1/quote will enforce the surcharge from
// here, and the Astro area pages already agree (this is seeded from their
// frontmatter — site/src/content/areas/*.md).
//
// Boundary confirmed by Mark (June 2026): the core no-surcharge area is
// Cheltenham, Gloucester and Winchcombe plus roughly a 5-mile radius around each;
// everywhere else carries the flat surcharge (D-011). "5 miles" is a radius and
// this check works on postcode districts, so it is a close approximation: the
// town districts below cover each town and its ~5-mile ring, and Winchcombe is
// handled at sector level (see core_sectors) because its GL54 district also
// stretches to the far Cotswolds well beyond 5 miles. It lives here in one place
// so the assistant, the server and the site all pick up a change together.

const core_towns = ["Cheltenham", "Gloucester", "Winchcombe"];

// GL districts that are fully core (each town plus its ~5-mile ring).
const core_postcodes = [
  "GL50", "GL51", "GL52", "GL53", // Cheltenham + ring (Bishop's Cleeve, Prestbury, Charlton Kings)
  "GL1", "GL2", "GL3", "GL4",     // Gloucester + ring (Quedgeley, Churchdown, Brockworth)
];

// Core sectors inside an otherwise out-of-area district. Winchcombe is the GL54 5
// sector; the rest of GL54 (Bourton GL54 2, Stow GL54 1, Northleach GL54 3) is
// far Cotswolds, >5 miles from Winchcombe, and carries the surcharge (D-011).
const core_sectors = ["GL545"];

// Example wider-Gloucestershire towns named in the assistant's area prose.
const wider_towns = ["Stroud", "Tewkesbury", "Cirencester"];

// Flat out-of-area surcharge (D-011, confirmed by Mark June 2026). Mark is not
// VAT-registered, so this is a flat figure the customer pays - no VAT is added.
const out_of_area_surcharge = 15;

// "Cheltenham, Gloucester and Winchcombe" — the core towns as an English list.
// Centralised so the assistant prompt and the pricing block never disagree.
function coreTownsPhrase() {
  if (core_towns.length <= 1) return core_towns.join("");
  return core_towns.slice(0, -1).join(", ") + " and " + core_towns[core_towns.length - 1];
}

// Generates the SERVICE AREA block of the assistant system prompt. The core area
// is the three towns plus a ~5-mile radius around each (Mark, June 2026); the
// facts (core towns, £15 surcharge, wider towns) come from the values above. The
// far-GL54 callout is deliberate: it stops the assistant treating Bourton/Stow
// as core just because they share Winchcombe's postcode district.
function serviceAreaBlock() {
  const core = coreTownsPhrase();
  const wider = wider_towns.join(", ");
  const s = out_of_area_surcharge;
  return `SERVICE AREA AND OUT OF AREA CHARGE:
The core service area with no travel charge is ${core}, plus roughly a 5-mile radius around each (this includes the immediate surrounding villages such as Bishop's Cleeve, Prestbury, Charlton Kings, Quedgeley, Churchdown and Brockworth). Anywhere outside that core area incurs a flat out of area surcharge of £${s}. This covers the wider Gloucestershire towns (${wider} and similar) and the far Cotswold villages. Note that Bourton-on-the-Water, Stow-on-the-Wold and Northleach share Winchcombe's GL54 postcode but sit well outside the 5-mile core, so they DO carry the surcharge. When the customer's address is outside the core area, mention clearly and early that a flat £${s} out of area surcharge applies, include it in the itemised quote, and state it plainly as a fixed figure (not something "to be confirmed"). If you are not sure whether an address is within the 5-mile core, assume it is out of area and include the surcharge.`;
}

// True when an address postcode falls OUTSIDE the core no-surcharge area (D-011)
// and so attracts the flat £15 out-of-area surcharge. Accepts a full postcode
// ("GL51 2AB"), a no-space postcode ("GL512AB") or a bare outward district
// ("GL3"). The UK inward code is always the last three characters, so the
// outward code is everything before them.
//
// Core = the GL50-53 / GL1-4 districts (Cheltenham, Gloucester and their ~5-mile
// rings) OR the GL54 5 sector (Winchcombe). The rest of GL54 (Bourton, Stow,
// Northleach) is far Cotswolds and is out of area. A bare "GL54" with no inward
// code is ambiguous so it stays out of area: we err toward charging the travel
// rather than silently absorbing it, as does an unrecognised or mistyped
// postcode. This is a district/sector approximation of the 5-mile radius rule;
// the assistant's prose applies the radius judgement for borderline addresses.
// Reads `core_postcodes`/`core_sectors`, so settling those moves the assistant,
// the server quote and the site together.
function isOutOfArea(postcode) {
  const clean = String(postcode || "").toUpperCase().replace(/\s+/g, "");
  if (clean.length < 2) return true; // nothing usable, treat as out of area
  const outward = clean.length >= 5 ? clean.slice(0, -3) : clean;
  if (core_postcodes.includes(outward)) return false;
  if (clean.length >= 5) {
    const sector = outward + clean.slice(-3, -2); // outward + first inward char
    if (core_sectors.includes(sector)) return false;
  }
  return true;
}

module.exports = {
  core_towns,
  core_postcodes,
  core_sectors,
  wider_towns,
  out_of_area_surcharge,
  coreTownsPhrase,
  isOutOfArea,
  serviceAreaBlock,
};
