// Vetted carpet-cleaning knowledge — the single maintainable source (D-006).
//
// The carpet-science / method / products / stain knowledge the assistant teaches
// from. Until now it lived as inline prose in the chat.js system prompt AND in
// docs/TEXATHERM_KNOWLEDGE_BRIEF.md AND in the Astro care guides — three copies
// that drifted (L-009: a claim corrected in chat.js stayed wrong on the site).
// This module is that one source: chat.js generates its knowledge prompt blocks
// from here, byte-for-byte identical to the prose it replaces, so the L-002
// prompt-cache prefix is unchanged. The same section objects will feed Citations
// documents (Slice 4c) and the site care guides (Phase 1 cutover).
//
// ACCURACY RULE (L-009 / D-015): every claim here must be defensible from
// docs/TEXATHERM_KNOWLEDGE_BRIEF.md (the verified research brief). Manufacturer
// performance figures are always attributed ("Texatherm states..."), never
// asserted as fact; the machine is the EMV 401 (not the EMV 409); we never claim
// "WoolSafe approved", never quote a decibel figure, and never state the
// "exothermic reaction draws dirt" mechanism as fact. The `guardrails` object
// below names these so test/knowledge.test.js can lock them in.
//
// CommonJS on purpose: consumed by the CommonJS Netlify functions and the
// plain-Node `node --test` runner, exactly like models.js / pricing.js /
// serviceArea.js. When a fact changes, change it HERE and the assistant (and,
// from Slice 4c onward, the site and the citations) move together.

// Time-estimate guidance. Its own block because, in the assistant prompt, the
// DEPOSIT and RE-CLEAN policy sections sit between this and the carpet-science
// block below; those policy lines stay in chat.js, so this stays separate to
// keep the assembled prompt byte-identical.
const timeEstimates = {
  id: "time_estimates",
  title: "Time estimates",
  text: `TIME ESTIMATES - MINIMUM ONE HOUR PER ROOM:
Always advise customers that each average-sized room requires a minimum of one hour, including set-up time.
Texatherm low-moisture: 30-45 minutes cleaning + 15-20 minutes set-up = approximately 1 hour per room minimum.
Wet extraction: 45-60 minutes cleaning + set-up = approximately 1 hour per room minimum.
Stairs and landings: 30-45 minutes.
A typical 3-bedroom house (lounge, 3 bedrooms, hallway, stairs) should be estimated at 5-6 hours total.
When calculating slot requirements, always round up to the nearest hour and add 1 hour buffer for travel and set-up.`,
};

// The carpet-science knowledge, one object per prompt section, in prompt order.
// `text` is verbatim (the byte-identity contract with chat.js); `id`/`title` are
// the structure Citations (4c) and the site guides consume. Change a fact in the
// `text` here and it propagates to every consumer.
const knowledgeSections = [
  {
    id: "texatherm_system",
    title: "Texatherm system",
    text: `TEXATHERM SYSTEM:
ICC uses the Texatherm EMV 401, a professional low-moisture machine, together with the Texatherm TC 170, a low-speed rotary used for low-moisture and dry-compound cleaning and for hard floors. The method is low-moisture: it uses far less water than standard hot water extraction, so carpets dry much faster and there is far less risk of over-wetting. Explain it plainly and honestly, for example: "It is a low-moisture system, so it uses much less water than a standard machine and your carpets dry far quicker, usually within an hour or two rather than half a day. Less water also means much less risk of shrinkage or mould, which is why it is the safer choice for wool and natural fibres."
Performance figures - present these as the manufacturer's own figures, never as independently proven fact, and never invent numbers:
Texatherm states drying in roughly 30 to 60 minutes, much faster than the 4 to 12 hours typical of standard extraction.
Texatherm states up to 80% less water than standard extraction, which reduces the risk of over-wetting and slow drying.
Benefits we can always stand behind (lead with these):
Low-moisture cleaning is the recognised safe approach for wool and delicate natural fibres, because over-wetting can cause shrinkage, browning, backing delamination or mould.
A thorough, low-residue clean helps carpets stay cleaner for longer, because leftover detergent residue attracts soil (a common problem with DIY cleaning).
Anti-static and deodoriser treatments can be applied where they are useful.
Never tell a customer the system or our products are "WoolSafe approved", never quote a noise or decibel figure, and never state as established fact that an "exothermic reaction draws dirt from the base of the fibre". We cannot substantiate these claims.`,
  },
  {
    id: "products_and_chemicals",
    title: "Products and chemicals",
    text: `PRODUCTS AND CHEMICALS:
Reassure customers honestly that the products are chosen to be low-toxicity and appropriate for homes with children and pets. Key products:
Cleaning solution: a low-residue solution formulated to be safe for use on wool and delicate fibres. It is not a high-pH product and leaves little residue, so it does not attract soil the way some DIY products do. It is fine to tell a customer the products are safe for use on wool; never call them "WoolSafe approved" (that is a separate, independent certification ICC does not hold) or describe an "exothermic reaction".
Pre-treatment spray: an enzyme-based pre-spray for protein stains such as blood, urine and food, which breaks the stain down before cleaning begins.
Solvent spotter: for oil-based stains such as grease, tar or make-up, applied before the main clean.
Sanitiser: an anti-bacterial sanitiser can be applied, particularly useful in homes with pets or young children. Certain products in the Texatherm range (for example Dio-Cleanse and Advanced Cleaner) are independently tested to the BS EN 1040 disinfectant standard. Do not claim a "kills 99.9%" figure for cleaning a carpet, as that is a basic laboratory screen and not a real-world carpet claim.
Anti-static treatment: can be applied to reduce static in synthetic carpets and help repel future soiling.
Deodouriser: available on request, useful for pet odours or smoky environments.
Products are chosen to be safe once dry, and we never use bleach or harsh high-pH chemicals that can damage fibres or backing.`,
  },
  {
    id: "carpet_type_and_method",
    title: "Carpet type and method",
    text: `CARPET TYPE AND METHOD:
Wool / Axminster / Wilton: Texatherm low-moisture only. Wool is sensitive to excess moisture and heat. Overwetting can cause shrinkage, browning, or delamination. The low-moisture method is the only safe professional approach.
Polypropylene / nylon / polyester: Either method works well. Low-moisture preferred as it is gentler and faster drying.
Berber / loop pile: Low agitation only. Texatherm preferred to avoid snagging or distorting the loops.
Natural fibres (sisal, seagrass, coir, jute): Texatherm dry method ONLY. These fibres absorb water and can shrink, stain, or rot if wet cleaned.
Shaggy / high pile: Texatherm low-moisture or dry compound only. High pile traps moisture easily.
Commercial carpet tiles: Either method. Texatherm preferred for minimal disruption and fast drying.`,
  },
  {
    id: "stain_guidance",
    title: "Stain guidance",
    text: `STAIN GUIDANCE:
Red wine: Highly treatable if fresh. Blot, do not rub. Cold water only. Older stains may be permanent depending on the carpet fibre.
Pet urine: Enzyme treatment required to break down uric acid crystals. DIY products rarely penetrate to the backing where the odour originates. Old urine staining can leave permanent discolouration in the fibre.
Bleach: Permanent colour loss. ICC will not charge to treat a bleach mark - it cannot be reversed and the customer should know that upfront.
Blood: Cold water and enzyme pre-treatment. Hot water sets the stain permanently - never use it on blood.
Paint (emulsion): Treatable if still wet. Dried emulsion is usually permanent.
Mould: ICC can sanitise and remove mould from carpet, but the underlying moisture source must be identified and resolved first, otherwise it will return.`,
  },
  {
    id: "what_icc_wont_do",
    title: "What ICC won't do",
    text: `WHAT ICC WON'T DO:
Active pest infestations. Biohazard situations without a face-to-face inspection first. Any job where pets cannot be kept away from the work area during the clean.`,
  },
  {
    id: "diy_vs_professional",
    title: "DIY vs professional",
    text: `DIY vs PROFESSIONAL:
Hire machines use the same extraction principle but operate at far lower temperature and pressure. They deposit significantly more water into the carpet, which risks shrinkage, delamination, and mould growth if the carpet does not dry quickly. Most DIY cleaning solutions also leave a residue that attracts dirt faster, meaning the carpet appears to get dirty more quickly after a home clean. For wool or natural fibres, DIY machines can cause permanent damage.`,
  },
];

// Renders the carpet-science block of the assistant system prompt, byte-for-byte
// equal to the prose it replaces in chat.js (TEXATHERM SYSTEM through DIY vs
// PROFESSIONAL). Sections are joined with a single blank line, as in the prompt.
function knowledgeBlock() {
  return knowledgeSections.map((s) => s.text).join("\n\n");
}

// Renders the TIME ESTIMATES block, byte-for-byte equal to the prose it replaces.
function timeEstimatesBlock() {
  return timeEstimates.text;
}

// L-009 guardrails, verified against docs/TEXATHERM_KNOWLEDGE_BRIEF.md. The
// strings that bit us, named so test/knowledge.test.js can assert they never come
// back as positive claims (the wrong machine model must be absent; the correct
// one present; no decibel figure quoted). Note: "WoolSafe approved" legitimately
// appears in the prose, but only inside the instruction NOT to say it.
const guardrails = {
  correctMachineModel: "EMV 401",
  forbiddenMachineModel: "EMV 409",
  forbiddenCertificationClaim: "WoolSafe approved",
};

module.exports = {
  timeEstimates,
  knowledgeSections,
  guardrails,
  knowledgeBlock,
  timeEstimatesBlock,
};
