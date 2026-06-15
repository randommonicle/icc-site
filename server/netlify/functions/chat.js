// Allowed origins for the chat endpoint.
//
// Order of precedence:
//   1. The ALLOWED_ORIGINS env var (comma-separated) if explicitly set.
//   2. Netlify's auto-injected URL / DEPLOY_URL / DEPLOY_PRIME_URL — these
//      always reflect the real deployed domain, so a default-named Netlify
//      site (e.g. random-words-12345.netlify.app) works without manual config.
//   3. A small set of common dev/prod fallbacks.
//
// If nothing matches at request time we fail OPEN with a warning rather than
// 403 every customer — the per-IP rate limit on /api/chat is the real defence.
function buildAllowedOrigins(){
  const explicit = process.env.ALLOWED_ORIGINS;
  if(explicit){
    return explicit.split(",").map(s => s.trim()).filter(Boolean);
  }
  const auto = [
    process.env.URL,
    process.env.DEPLOY_URL,
    process.env.DEPLOY_PRIME_URL,
    "https://intelligentclean.co.uk",
    "https://www.intelligentclean.co.uk",
    "http://localhost:8888",
    "http://localhost:3000"
  ].filter(Boolean);
  // Normalise — strip trailing slashes
  return auto.map(o => o.replace(/\/+$/, ""));
}
const ALLOWED_ORIGINS = buildAllowedOrigins();
const ORIGIN_CHECK_STRICT = process.env.ALLOWED_ORIGINS ? true : false;

// Shared config — single source of truth (D-006, D-007). Model names, the
// pricing table, and the service-area/surcharge facts live in shared/config and
// generate the relevant prompt blocks below, so the assistant, the server and
// the site cannot drift.
const models = require("../../../shared/config/models.js");
const pricing = require("../../../shared/config/pricing.js");
const serviceArea = require("../../../shared/config/serviceArea.js");
const knowledge = require("../../../shared/config/knowledge.js");
// Slice 5a (D-020): the operational-backend client + the pure handoff-row builder.
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { escalationToMessageDraft } = require("../../../shared/messages.js");
// Slice 5b (D-021): the Postgres booking store (used only under BOOKINGS_STORE).
const { insertBooking, setJobCalLink, availabilityFromJobs } = require("./bookingsStore.js");

// Slice 5b (D-021): the single switch for the bookings backend. When "postgres",
// confirm_booking writes to the Supabase `jobs` table, availability derives from
// it, AND the hardened 09:00-16:30 trading hours apply — store and hours flip (and
// roll back) together. Unset/any other value keeps the Phase 0 Netlify Blobs path
// byte-identical, so merging Slice 5b is a production no-op until this is set in
// Netlify (the deliberate sign-off moment), and unsetting it is the rollback.
function bookingsStoreIsPostgres() {
  return process.env.BOOKINGS_STORE === "postgres";
}

// Static portion of the system prompt — invariant between requests.
// Anthropic caches this block (cache_control: ephemeral) so subsequent
// messages in the same 5-minute window pay ~10% of normal input cost on
// these ~2.5K tokens. Dynamic per-conversation content (assistant name,
// today's date, available booking dates) is sent as a second, uncached
// block so the cache prefix never busts.
const STATIC_SYSTEM_PROMPT = `You are the AI assistant for Intelligent Carpet Cleaning, a specialist carpet cleaning company based in Cheltenham, Gloucestershire, run by Mark McClymont.

Your name for this conversation is provided in the PER-CONVERSATION CONTEXT block at the end of these instructions. The customer has already seen a short welcome that greets them by your name, so do not reintroduce yourself or repeat that welcome at the start. Reply directly and naturally to what they say, and use your name only if it comes up naturally later. Do not change your name mid-conversation.

Your role is to carry out a proper professional consultation with customers - helping them understand their carpet type, the right cleaning method, what to expect on the day, and arranging a booking. You have full knowledge of the business, its pricing, its equipment, carpet care, and the products used.

COMMUNICATION STYLE:
Speak like a warm, knowledgeable local tradesperson. Friendly and approachable, not corporate. Use the customer's name once you have it. Keep answers focused and clear - expand when a fuller explanation is genuinely useful to the customer, but do not ramble. Ask one question at a time. Be honest - if a stain is probably permanent, say so. If their carpet sounds fine, say so. Never pressure-sell.

IMPORTANT - PUNCTUATION AND FORMATTING: Never use markdown formatting. No asterisks, no bold, no bullet points, no headers. Plain conversational text only, as you would write in a professional text message or email.

Never use a dash of any kind as a mid-sentence break or to introduce a clause. This includes the em dash (--), the en dash, and the pattern " - " (space, hyphen, space). These all make the message feel automated. Use a comma, full stop, or brackets instead. For example, instead of "it's gentle - dries quickly" write "it's gentle and dries quickly" or "it's gentle (and dries quickly)".

When giving a longer response such as a photo analysis or detailed explanation, break it into short paragraphs of 2 to 3 sentences each, with a blank line between paragraphs. Never write a wall of text. Each paragraph should cover one clear point.

Write in clear standard British English.

IMPORTANT - IMAGE UPLOADS: Customers CAN upload photos directly in this chat using the camera icon next to the text input. If a customer asks about sending a photo, tell them to click the camera icon at the bottom left of the chat to upload an image. When a customer sends an image, analyse it carefully for carpet type, pile construction, condition, soiling level, and any visible staining. Use this analysis to inform your quote and method recommendation.

IMPORTANT - DATES AND AVAILABILITY:
Today's date and the verified list of bookable dates are provided in the PER-CONVERSATION CONTEXT block at the end of these instructions. Never calculate dates yourself as this leads to errors with day names. ALWAYS look the date up in that list and quote both the day name and the full date exactly as shown there. Sundays are never available. Only dates in that list are bookable. When confirming a date with the customer, always say both the day name and the full date, for example "Thursday 7 May 2026", and use the ISO date shown in brackets when writing the BOOKING_READY block.

BUSINESS DETAILS:
Owner: Mark McClymont
Phone: 01242 279590
Email: hello@intelligentclean.co.uk
Service area: All GL postcodes - full Gloucestershire
Hours: Monday to Saturday, 8am to 6pm
Available slots: 9am, 10am, 11am, 12pm, 1pm, 2pm, 3pm, 4pm, 5pm (Mon-Sat)

${serviceArea.serviceAreaBlock()}

${pricing.pricingBlock()}

${knowledge.timeEstimatesBlock()}

DEPOSIT AND PAYMENT:
10% non-refundable deposit required at booking to secure the slot.
Balance payable on the day.

RE-CLEAN POLICY:
One free return visit if the customer is unhappy, provided they raise it within 48 hours with photographic evidence. Pre-existing permanent staining is excluded.

${knowledge.guardrailsBlock()}

CONSULTATION APPROACH:
Treat every enquiry as a proper professional consultation. When a customer mentions their carpet type, staining, concerns, or cleaning history, take the time to explain:
Why a particular method is recommended for their carpet type and what could go wrong with the wrong approach.
What the cleaning process will involve on the day - what the machine looks and sounds like, how long it will take, what they need to do to prepare.
What products will be used and why they are appropriate and safe.
Realistic expectations - if a stain has a good chance of being removed, say so clearly. If it is likely permanent, be honest about that rather than let the customer be disappointed on the day.
After-care advice - how long to stay off the carpet, when it will be fully dry, how to maintain it going forward.
This level of care builds trust and sets ICC apart from competitors. The customer should feel they have spoken to a genuine expert who has thought about their specific situation, not simply filled in a booking form.

PRIOR DIY OR RENTED-MACHINE CLEANING:
Early in the consultation, especially when there is staining or heavy soiling, proactively ask whether they have already tried to clean the carpet themselves with a DIY or rented machine (the kind hired from a supermarket or DIY store). Their answer changes your advice: over-wetting and leftover residue from those machines can mean slower drying, quicker re-soiling, and on wool or natural fibres a risk of lasting damage to check for, so set honest expectations and explain how ICC's low-moisture method differs. Refer to these only as DIY or rented or hire machines, never by a brand name. On cost: quote from the normal pricing as your estimate and never invent a specific extra figure or surcharge, but you may add that if a previous DIY or rented-machine clean has left heavy over-wetting or residue to put right, the job can take extra time, so the final price may be a little higher, with Mark confirming case by case when he assesses the carpet on the day.

FREE ADVICE AND HELPFUL TIPS:
Throughout the conversation, offer genuinely useful free advice where it is relevant. This is not about upselling - it is about being helpful and building trust. Examples:
If a customer mentions a fresh stain: give them immediate first-aid advice (blot not rub, cold water for protein stains, do not use hot water on blood, do not apply salt to wine, etc.) before they even book.
If they mention DIY cleaning attempts: advise on what to avoid (overwetting, leaving residue, using the wrong products on wool) and what may have already been done to the stain that could affect the outcome.
Carpet maintenance tips: vacuum regularly in the direction of the pile, avoid walking on carpets in outdoor shoes, use door mats to reduce tracked-in dirt, ventilate rooms after cleaning.
Preparation advice even before they book: move small ornaments and lightweight items before the appointment, ensure the area is accessible, keep pets away on the day.
If they mention mould: strongly advise fixing the source of moisture first and explain why cleaning alone will not solve the problem long-term.
Make this feel like advice from a knowledgeable friend in the trade, not a script.

WHEN TO HAND OVER TO A HUMAN:
You have a tool called escalate_to_human. Use it instead of guessing whenever a question falls outside your carpet-cleaning knowledge, whenever following your advice could risk damaging the customer's carpet, upholstery or property (aftercare, self-treating a stain, unusual fibres or materials, or anything you are not certain about), whenever you cannot point to something in your knowledge to back up the answer, or whenever the customer asks to speak to a person. Safety comes first: for anything that could damage a carpet, hand over rather than guess. After you hand over, reassure the customer that the team will confirm the answer, and ask how they would like to be contacted if you do not already have their details. Never invent an answer just to avoid handing over.

WEB SEARCH (RARE, LOW-STAKES ONLY):
You also have a web_search tool. It is a narrow fallback, not a knowledge source: your vetted reference document always comes first, and most conversations should never need a search. Use it only for low-stakes practical questions that sit outside your reference and carry no risk to the customer's carpet, upholstery or property, for example where to dispose of or recycle an old carpet locally, or whether a local service or supplier exists. Never use it for anything about cleaning, treating or applying products to a carpet or fabric, stain treatment, aftercare, drying, fibre identification, or anything where a wrong answer could cause damage: those answers come from your reference, or are handed to a human with escalate_to_human (damage risk is always handed over first). Never search as a way to avoid handing over. When you do use a search result, mention naturally that you looked it up, stick to what the sources actually say, and the sources will be shown to the customer automatically.

ENDING THE CONVERSATION:
When the customer clearly signals they are finished (for example they say goodbye, "thanks, that's everything", "no thank you", or otherwise wrap up and are not asking anything further), give a brief, warm sign-off: thank them, invite them back any time, and let them know they can reach the team on 01242 279590 for anything urgent. End that closing message with the marker CONVERSATION_END on its own line. Only do this on a clear closing signal from the customer, never just because they have paused or because you have finished answering, and never put the marker in a message that still asks the customer a question. Never mention the marker to the customer.

BOOKING PROCESS:
Collect in this order, one question at a time:
1. Customer full name
2. Phone number
3. Email address
4. Full address including postcode (must be GL postcode)
5. Rooms to be cleaned and approximate sizes
6. Carpet type in each room if known
7. Any staining or specific concerns
8. Whether furniture needs moving
9. Any pets
10. Preferred date (must be from the AVAILABLE BOOKING DATES list in the PER-CONVERSATION CONTEXT block, Monday to Saturday only)
11. Preferred start time (9am to 5pm, hourly slots)

Once you have all details, calculate the total estimated time needed (minimum 1 hour per room, round up, add 1 hour buffer). Tell the customer the estimated duration, total price plus VAT, and the 10% deposit amount. Then ask them to confirm they want to proceed.

When they confirm, output a special booking confirmation block in this EXACT format on its own line:
BOOKING_READY:{"name":"[full name]","phone":"[phone]","email":"[email]","address":"[full address]","postcode":"[postcode]","date":"[YYYY-MM-DD]","start_time":"[HH:MM]","slots_needed":[number of 1-hour slots],"rooms":"[description of rooms]","carpet_types":"[carpet types]","concerns":"[any concerns or stains]","furniture_moving":[true/false],"pets":[true/false],"estimated_price":"[price + VAT]","deposit":"[10% amount + VAT]","recommended_method":"[Texatherm low-moisture / Texatherm wet extraction / combination]","ai_assessment":"[brief professional assessment of carpet type and recommended approach]","rams":"[see RAMS instructions below]"}

RAMS FIELD INSTRUCTIONS:
The rams field must contain a plain-English risk assessment tailored to this specific job. Use \\n to separate each line within the JSON string. Include only hazards relevant to this job. Format exactly as follows:
Activity: [e.g. Texatherm low-moisture carpet cleaning, domestic premises]\\nHazards: [comma-separated list of relevant hazards only from: wet surface slip risk, trip hazard from equipment cables, cleaning chemicals (low toxicity), manual handling if furniture moving, pets on site, mould or biological material if present]\\nControls: [corresponding control measures matching the hazards listed]\\nPPE: [gloves as minimum standard; add P2 mask if mould or biological hazard present]\\nNotes: [any specific on-the-day notes, e.g. pets to be secured before work begins, customer to be advised carpet will be damp for 30-60 minutes]

This triggers the booking confirmation system. Do not output this until the customer has explicitly confirmed they want to proceed.`;

// Custom tool the assistant calls instead of guessing when it is out of its depth
// (D-019). The description names WHEN to call it because recent Claude models
// under-reach for custom tools without explicit triggers; damage-risk questions
// escalate FIRST (never a guess/web fallback) — the safety exit that prevents the
// L-009 failure mode (advice that could ruin a customer's carpet). Module-level
// constant so the tools array stays byte-stable and the L-002 prompt cache holds.
const ESCALATION_TOOL = {
  name: "escalate_to_human",
  description: "Hand the customer's question to Mark (the owner) instead of answering it yourself, and log it as a lead. CALL THIS WHENEVER: (1) the question falls outside your vetted carpet-cleaning knowledge; (2) there is ANY chance that following your advice could damage the customer's carpet, upholstery or property - aftercare, self-treating a stain, unusual fibres or materials, or anything you are not sure about - in which case escalate FIRST and never guess; (3) you cannot point to something in your knowledge to support the answer; or (4) the customer asks to speak to a person. Do NOT call it for ordinary booking, availability, pricing, or questions you can answer confidently from your knowledge. After calling it, reassure the customer the team will confirm and ask how they would like to be contacted if you do not already have their details.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The customer's question or situation, in your own words. Describe only the question — do NOT include the customer's name, email, phone, address or other personal details here (those belong in customer_name / customer_contact)." },
      reason: { type: "string", enum: ["out_of_scope", "damage_risk", "no_citable_source", "customer_request"], description: "Why you are handing it over." },
      customer_name: { type: "string", description: "The customer's name if you have it, otherwise omit." },
      customer_contact: { type: "string", description: "The customer's email or phone if you have it, otherwise omit." }
    },
    required: ["question", "reason"]
  }
};

// Anthropic-hosted web search (Slice 4d / D-019): the attributed, low-stakes-only
// fallback lane. Gated three ways: max_uses hard-caps the spend per request
// ($10/1000 searches), the WEB SEARCH prompt block confines it to no-damage-risk
// practical gaps (damage-risk always escalates first, never searches), and the
// existing per-IP chat rate limit bounds the worst case. user_location localises
// results to ICC's patch. Version 20250305 on purpose, NOT the newer 20260209:
// 20260209's dynamic filtering runs extra code-execution rounds to post-process
// results, adding latency a live customer chat does not want, and our capped
// low-stakes lookups gain nothing from it (20260209 also has narrower model
// support). See the D-019 addendum. Module constant so the tools array stays
// byte-stable and the L-002 prompt cache holds.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
  user_location: {
    type: "approximate",
    city: "Cheltenham",
    region: "Gloucestershire",
    country: "GB",
    timezone: "Europe/London"
  }
};

// The full tool set, in a fixed order (tools render before system in the prompt,
// so any reorder would bust the cache prefix). Adding WEB_SEARCH_TOOL was a
// one-time cache re-warm, exactly like adding ESCALATION_TOOL in 4b.
const TOOLS = [ESCALATION_TOOL, WEB_SEARCH_TOOL];

function getOrigin(event){
  const raw = event.headers.origin || event.headers.referer || "";
  if(!raw) return "";
  try { const u = new URL(raw); return u.origin; } catch(e){ return ""; }
}

function corsHeaders(origin){
  // In strict mode echo allowed origins only. In fail-open mode echo the
  // request's origin so the browser actually accepts the response — otherwise
  // a CORS mismatch hides the real response body from the client.
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  let allow;
  if(ok) allow = origin;
  else if(!ORIGIN_CHECK_STRICT && origin) allow = origin;
  else allow = ALLOWED_ORIGINS[0] || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function getClientIP(event){
  const xff = event.headers["x-forwarded-for"] || "";
  const first = xff.split(",")[0].trim();
  return first || event.headers["client-ip"] || event.headers["x-real-ip"] || "";
}

// 429 response shared by all rate-limited paths.
function tooManyResponse(baseHeaders, retryAfter){
  return {
    statusCode: 429,
    headers: Object.assign({}, baseHeaders, { "Retry-After": String(retryAfter || 3600) }),
    body: JSON.stringify({ error: "Too many requests. Please wait a little and try again, or call us on 01242 279590." })
  };
}

// Sliding-window per-IP rate limiting, backed by Blobs. The pure decision logic
// lives in rateLimit() so it can be unit-tested with an in-memory store (see
// test/hardening.test.js); enforceRateLimit() wraps it with the real Blobs store
// and the fail-open policy — a storage outage must never block a real customer.
//
// rateLimit records `now` in a per-key timestamp list, drops entries older than
// the window, and refuses once the list reaches `limit`. The store is injected:
// any object with async get(key)->string|null and set(key, value).
async function rateLimit(store, key, limit, windowMs, now){
  const data = await store.get(key);
  const arr = (data ? JSON.parse(data) : []).filter(t => t > now - windowMs);
  if(arr.length >= limit) return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
  arr.push(now);
  await store.set(key, JSON.stringify(arr));
  return { ok: true };
}

// Production wrapper: real Blobs store, namespaced key, fail-open on any error.
// Used for three paths at different limits — chat (AI cost), booking confirmation
// (expensive write + slot-griefing vector), and availability (cheap but loopable).
async function enforceRateLimit(ip, prefix, limit){
  if(!ip) return { ok: true };
  const windowMs = 60 * 60 * 1000;
  try {
    const store = getBlobStore();
    return await rateLimit(store, prefix + ":" + ip, limit, windowMs, Date.now());
  } catch(e){
    console.log("Rate limit blob unavailable, failing open:", e.message);
    return { ok: true };
  }
}

exports.handler = async function (event) {
  const origin = getOrigin(event);
  const baseHeaders = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: baseHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: baseHeaders, body: "Method Not Allowed" };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  // Slice 5a (D-020): null unless SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
  // so the handoff INSERT is a no-op (email-only) until the backend is wired.
  const supabase = getSupabaseAdmin();

  if (!anthropicKey) {
    console.log("ERROR: No API key found in environment");
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: "Anthropic API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Origin check: only enforced when ALLOWED_ORIGINS env var was explicitly set.
  // Otherwise we log mismatches but let the request through — the rate limit is
  // the real defence and a 403 storm would be much more visible than abuse.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    if(ORIGIN_CHECK_STRICT){
      console.log("Rejected origin:", origin, "allowed:", ALLOWED_ORIGINS.join(","));
      return { statusCode: 403, headers: baseHeaders, body: JSON.stringify({ error: "Forbidden origin" }) };
    } else {
      console.log("Unrecognised origin (fail-open):", origin, "allowed defaults:", ALLOWED_ORIGINS.join(","));
    }
  }

  // Per-IP client identity, shared by all three POST actions for rate limiting.
  const ip = getClientIP(event);

  // Handle booking confirmation separately. Rate-limited hardest: each confirm
  // writes slot blocks, generates a PDF, and sends two emails, and looping it is
  // the slot-griefing vector (L-006). A real customer confirms once, maybe twice.
  if (body.action === "confirm_booking") {
    const rl = await enforceRateLimit(ip, "rl:book", 5);
    if(!rl.ok) return tooManyResponse(baseHeaders, rl.retryAfter);
    return await handleBooking(body.booking, resendKey, baseHeaders, supabase);
  }

  // Handle availability check. Read-only and cheap, but loopable for slot
  // enumeration, so it gets a looser per-IP cap (L-006).
  if (body.action === "check_availability") {
    const rl = await enforceRateLimit(ip, "rl:avail", 60);
    if(!rl.ok) return tooManyResponse(baseHeaders, rl.retryAfter);
    return await checkAvailability(body.date, body.slots_needed, baseHeaders, supabase);
  }

  // AI chat path — per-IP rate limit before hitting Anthropic (the AI cost path).
  const rl = await enforceRateLimit(ip, "rl:chat", 30);
  if(!rl.ok) return tooManyResponse(baseHeaders, rl.retryAfter);

  const assistantName = (body.assistantName && ["Jamie","Alex","Sam","Ellie","Tom"].includes(body.assistantName))
    ? body.assistantName : "Jamie";

  const now = new Date();
  const minBookingDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const todayFormatted = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const minDateISO = minBookingDate.toISOString().split("T")[0];

  // Pre-calculate available booking dates (Mon-Sat only) for the next 8 weeks
  // so Claude never has to calculate day-of-week itself
  const availableDatesList = [];
  const dateIterator = new Date(minBookingDate);
  for(let i = 0; i < 60 && availableDatesList.length < 48; i++){
    const dow = dateIterator.getDay();
    if(dow >= 1 && dow <= 6){
      const iso = dateIterator.toISOString().split("T")[0];
      availableDatesList.push(`${days[dow]} ${dateIterator.getDate()} ${months[dateIterator.getMonth()]} ${dateIterator.getFullYear()} (${iso})`);
    }
    dateIterator.setDate(dateIterator.getDate() + 1);
  }

  // Small dynamic block — uncached. Contains only the bits that vary per
  // session or per day so the large static prompt above stays cache-stable.
  const dynamicContext = `PER-CONVERSATION CONTEXT:

Your name in this conversation is ${assistantName}.

Today is ${todayFormatted}.

AVAILABLE BOOKING DATES (only dates in this list are bookable; Sundays are never available; never calculate dates yourself, always look them up here):
${availableDatesList.join("\n")}`;

  // Use Opus only when the most recent user message contains an image
  // (not the whole history, otherwise Opus stays on for the entire conversation)
  const lastUserMsg = Array.isArray(body.messages)
    ? [...body.messages].reverse().find(m => m.role === "user")
    : null;
  const hasImage = lastUserMsg && Array.isArray(lastUserMsg.content)
    && lastUserMsg.content.some(c => c.type === "image");
  const model = hasImage ? models.vision : models.text;

  // One Anthropic call. Closured over the per-request model + system blocks so
  // runAssistantTurn can re-call it with the growing message list across a tool
  // round. Tools render before system, so the existing cache_control on the last
  // system block caches tools + system together (L-002); ESCALATION_TOOL is a
  // module constant, so the cached prefix stays byte-stable across requests.
  //
  // Slice 4c (D-019): the vetted knowledge is attached as a CITEABLE document on
  // the first user turn (withKnowledgeDocument), so the model grounds and cites its
  // claims. The document is cache_control'd and byte-stable, so the prompt cache
  // still applies (one-time re-warm when this first shipped, like the 4b tool).
  const callModel = async (messages) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2000,
        // System prompt sent as two blocks so the large static portion can be
        // cached. Cache hits cost ~10% of normal input; for a 15-message
        // conversation that's a 60-70% reduction in input-token cost.
        system: [
          { type: "text", text: STATIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: dynamicContext }
        ],
        tools: TOOLS,
        messages: withKnowledgeDocument(messages)
      })
    });
    const json = await response.json();
    // Cost visibility (Slice 4d): searches are billed per use, so surface them in
    // the function log whenever a turn actually searched.
    const searches = json && json.usage && json.usage.server_tool_use
      && json.usage.server_tool_use.web_search_requests;
    if (searches) console.log("web_search used:", searches, "search(es) this call");
    return json;
  };

  try {
    // Resolve any escalate_to_human round(s) server-side, then hand the browser a
    // single final text message — index.html reads data.content[0].text and never
    // inspects stop_reason, so withSingleTextBlock keeps that contract intact.
    const data = await runAssistantTurn(
      body.messages,
      callModel,
      (toolUse, ctx) => handleTool(toolUse, ctx, resendKey, supabase)
    );

    // Slice 4c: collapse to the single text block (L-014) AND surface the cited KB
    // sections as a small structured payload the client renders as safe source
    // labels (L-003). collectCitations reads the raw multi-block reply before it is
    // collapsed, so it must run on `data`, not on the normalised message.
    const normalized = withSingleTextBlock(data);
    const citations = collectCitations(data);
    const payload = citations.length
      ? Object.assign({}, normalized, { citations: citations })
      : normalized;

    return {
      statusCode: 200,
      headers: Object.assign({}, baseHeaders, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    };
  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Failed to contact Anthropic API", detail: err.message })
    };
  }
};

// --- D-019 human escalation (Slice 4b) --------------------------------------

// Resolve a chat turn, executing any custom tool_use rounds server-side so the
// browser still receives one final assistant message. callModel(messages) returns
// the parsed Anthropic response; handleTool(toolUse, ctx) returns the tool_result
// string. Two continuation cases share the maxRounds bound so a misbehaving model
// cannot loop forever:
//   - stop_reason "tool_use": a custom tool (escalate_to_human) — resolve it and
//     send the tool_result back (Slice 4b).
//   - stop_reason "pause_turn": the API paused its own server-tool loop (web_search,
//     Slice 4d) — append the assistant content verbatim and re-call; the server
//     resumes where it left off. No tool_result and no extra user message (the API
//     detects the trailing server_tool_use block).
// Exported for unit tests (test/escalation.test.js, test/websearch.test.js).
async function runAssistantTurn(initialMessages, callModel, handleTool, maxRounds = 4) {
  let messages = Array.isArray(initialMessages) ? initialMessages.slice() : [];
  let data = await callModel(messages);
  let rounds = 0;
  while (data && (data.stop_reason === "tool_use" || data.stop_reason === "pause_turn") && rounds < maxRounds) {
    rounds++;
    if (data.stop_reason === "pause_turn") {
      messages = messages.concat([{ role: "assistant", content: data.content }]);
      data = await callModel(messages);
      continue;
    }
    const toolUses = (data.content || []).filter(b => b && b.type === "tool_use");
    if (toolUses.length === 0) break;
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try {
        result = await handleTool(tu, { messages });
      } catch (e) {
        console.log("Tool handler error:", e.message);
        result = "That could not be completed. Ask the customer to call 01242 279590.";
      }
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages = messages.concat([
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults }
    ]);
    data = await callModel(messages);
  }
  return data;
}

// Collapse an Anthropic message to a single text block so the browser's
// data.content[0].text contract holds after a tool round (and, in Slice 4c, after
// Citations splits the reply across blocks). Non-text blocks (tool_use,
// server_tool_use, web_search_tool_result) are dropped. Adjacent text blocks join
// seamlessly — Citations splits prose mid-sentence, so no separator can be added
// there — but where a dropped non-text block sat between two text blocks (the model
// narrating "I'll look that up" before a search, Slice 4d) a paragraph break is
// inserted so the sentences do not glue together. Anything without an array content
// (e.g. an API error object) is passed through untouched. Exported for unit tests.
function withSingleTextBlock(data) {
  if (!data || !Array.isArray(data.content)) return data;
  let text = "";
  let pendingBreak = false;
  for (const b of data.content) {
    if (b && b.type === "text" && typeof b.text === "string") {
      if (pendingBreak && text) text += "\n\n";
      text += b.text;
      pendingBreak = false;
    } else {
      pendingBreak = true;
    }
  }
  return Object.assign({}, data, { content: [{ type: "text", text: text }] });
}

// --- D-019 Citations grounding (Slice 4c) -----------------------------------

// Attach the vetted knowledge as a citeable custom-content document on the FIRST
// user turn, so the model grounds and cites its claims (D-019). Injected here, on
// every call, rather than stored client-side: index.html keeps sending only the
// plain conversation, and runAssistantTurn only ever appends to the end of the
// message list, so messages[0] stays the original first user turn across a tool
// round and the injected document (which is byte-stable + cache_control'd) keeps
// the L-002 prompt cache warm. The document is prepended before the user's text,
// matching the Citations API's document-then-question shape. Exported for tests.
function withKnowledgeDocument(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const first = messages[0];
  const original = typeof first.content === "string"
    ? [{ type: "text", text: first.content }]
    : (Array.isArray(first.content) ? first.content.slice() : []);
  const newFirst = Object.assign({}, first, {
    content: [knowledge.knowledgeDocument()].concat(original)
  });
  return [newFirst].concat(messages.slice(1));
}

// Resolve the citations on a (raw, multi-block) assistant reply into a small,
// deduplicated list of cited sources for the client to render safely (L-003 in
// index.html). Two kinds (D-019's two lanes):
//   - KB citations: custom-content documents cite by content-block index
//     (start_block_index), which is the index into knowledge.knowledgeSections, so
//     we map straight back to the section's id + friendly title. The model only
//     controls WHICH section index it cites, never the label text (that comes from
//     our config), so the output is trusted. Shape: { id, title }.
//   - Web citations (Slice 4d): web_search_result_location carries the source url
//     + page title. Only http(s) urls are passed through (anything else is dropped
//     here, and the client guards again before rendering a link). Deduped by url.
//     Shape: { id: null, title, url }.
// Exported for tests.
function collectCitations(data) {
  if (!data || !Array.isArray(data.content)) return [];
  const sections = knowledge.knowledgeSections;
  const seen = new Set();
  const out = [];
  for (const block of data.content) {
    if (!block || block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (!c) continue;
      if (c.type === "web_search_result_location" || typeof c.url === "string") {
        const url = typeof c.url === "string" ? c.url : "";
        if (!/^https?:\/\//i.test(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        let title = (typeof c.title === "string" && c.title.trim()) ? c.title.trim() : "";
        if (!title) {
          try { title = new URL(url).hostname; } catch (e) { title = "Web source"; }
        }
        out.push({ id: null, title: title, url: url });
        continue;
      }
      const idx = typeof c.start_block_index === "number" ? c.start_block_index : null;
      const section = idx != null ? sections[idx] : null;
      const id = section ? section.id : null;
      const title = section ? section.title : (c.document_title || "Reference");
      const key = id || title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: id, title: title });
    }
  }
  return out;
}

// Dispatch a tool_use block to its handler. Only escalate_to_human exists today.
async function handleTool(toolUse, context, resendKey, supabase) {
  if (toolUse && toolUse.name === "escalate_to_human") {
    return await handleEscalation(toolUse.input || {}, context, resendKey, supabase);
  }
  return "Unknown tool. Ask the customer to call 01242 279590.";
}

// Log the escalation as a lead and notify Mark by email, then tell the model what
// to say next. The customer reply is never blocked on the email (L-004: a 200 from
// Resend is not delivery; failures are logged, not surfaced to the customer).
//
// Slice 5a (D-020): the handoff is ALSO persisted as a draft `human_handoff` row in
// the Supabase `messages` table for Mark's review queue (draft -> approve -> send).
// Additive and fail-open: the email above is the guaranteed path, so a Supabase
// outage, an RLS/constraint reject, or missing creds never blocks the customer reply
// or throws. `supabase` is null until SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
// set, so this is a no-op in production until the backend is deliberately wired.
async function handleEscalation(input, context, resendKey, supabase) {
  try {
    if (resendKey) await sendEscalationEmail(input, context, resendKey);
    else console.log("Escalation (no RESEND_API_KEY, not emailed):", input.reason, "-", input.question);
  } catch (e) {
    console.log("Escalation email failed:", e.message);
  }
  if (supabase) {
    try {
      const draft = escalationToMessageDraft(input, context);
      const { error } = await supabase.from("messages").insert(draft);
      if (error) console.log("Handoff INSERT failed:", error.message);
    } catch (e) {
      console.log("Handoff INSERT threw:", e.message);
    }
  }
  return "Escalation logged and the team has been notified. Tell the customer you will get Mark or the team to confirm the answer, and ask how they would like to be contacted if you do not already have their name and number. Do not attempt to answer the original question yourself.";
}

// Operator (Mark) email for an escalation, mirroring the booking email path. All
// model- and customer-supplied text is escHtml-escaped (L-003).
async function sendEscalationEmail(input, context, resendKey) {
  const operatorEmail = process.env.OPERATOR_EMAIL || "ben.graham240689@gmail.com";
  const operatorFrom = process.env.OPERATOR_FROM || "ICC Bookings <onboarding@resend.dev>";

  const reasonLabels = {
    out_of_scope: "Outside the assistant's knowledge",
    damage_risk: "Possible damage risk - needs a human",
    no_citable_source: "No citable source for the answer",
    customer_request: "Customer asked for a person"
  };
  const reason = reasonLabels[input.reason] || escHtml(input.reason || "Not specified");

  // Last few turns as a plain-text transcript snippet for context.
  const transcript = (Array.isArray(context && context.messages) ? context.messages : [])
    .slice(-6)
    .map(m => {
      const who = m.role === "assistant" ? "Assistant" : "Customer";
      let text = "";
      if (typeof m.content === "string") text = m.content;
      else if (Array.isArray(m.content)) text = m.content.filter(c => c && c.type === "text").map(c => c.text).join(" ");
      return text ? `${who}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const email = {
    from: operatorFrom,
    to: operatorEmail,
    subject: `Website assistant escalation - ${input.customer_name ? input.customer_name : "customer"}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d2236;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#2ab8a4;margin:0;font-size:20px;">Assistant handed a question to you</h1>
          <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;">Intelligent Carpet Cleaning</p>
        </div>
        <div style="background:#f7f8fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p style="font-size:14px;color:#4a5568;margin:0 0 4px;"><strong>Why:</strong> ${reason}</p>
          <p style="font-size:14px;color:#4a5568;margin:0 0 4px;"><strong>Customer:</strong> ${escHtml(input.customer_name || "not given")}</p>
          <p style="font-size:14px;color:#4a5568;margin:0 0 12px;"><strong>Contact:</strong> ${escHtml(input.customer_contact || "not given - reply in the chat or call back")}</p>
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #1a8a7a;margin:12px 0;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#1a3a5c;">Question</p>
            <p style="margin:0;font-size:14px;color:#4a5568;">${escHtml(input.question || "(none captured)")}</p>
          </div>
          ${transcript ? `<div style="margin-top:12px;"><p style="font-size:12px;font-weight:bold;color:#1a3a5c;margin:0 0 6px;">Recent conversation</p><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px;color:#4a5568;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:0;">${escHtml(transcript)}</pre></div>` : ""}
          <p style="margin-top:15px;font-size:12px;color:#718096;">The assistant told the customer the team will confirm the answer. Please follow up.</p>
        </div>
      </div>`
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify(email)
  });
  return await res.json();
}

function getBlobStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore({
    name: "icc-bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN
  });
}

async function checkAvailability(date, slotsNeeded, baseHeaders, supabase) {
  const headers = Object.assign({}, baseHeaders || {}, { "Content-Type": "application/json" });
  // Slice 5b (D-021): under the Postgres store, availability derives from the
  // committed `jobs` rows and the grid is the hardened 09:00-16:30 day (start
  // slots 9..15, up to 7 hours); the Blobs path keeps the Phase 0 09:00-17:00 grid
  // (up to 9 hours). Gated by the same flag as the booking write so store + hours
  // move together.
  const usePostgres = bookingsStoreIsPostgres() && !!supabase;
  if (bookingsStoreIsPostgres() && !supabase) {
    console.log("WARNING: BOOKINGS_STORE=postgres but no Supabase client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset) — availability is using Blobs.");
  }
  const allSlots = usePostgres ? [9,10,11,12,13,14,15] : [9,10,11,12,13,14,15,16,17];
  const maxSlots = usePostgres ? 7 : 9;
  // Light input check — bookings.js does the full validate; this path is read-only.
  // Cap matches the active store so the endpoint agrees with the booking engine.
  const slots = Number(slotsNeeded);
  if(typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(slots) || slots < 1 || slots > maxSlots){
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid availability query" }) };
  }
  try {
    let bookedSlots;
    if (usePostgres) {
      bookedSlots = await availabilityFromJobs(supabase, date);
    } else {
      const store = getBlobStore();
      const existing = await store.get(date);
      bookedSlots = existing ? JSON.parse(existing) : [];
    }
    const available = [];

    for (let i = 0; i <= allSlots.length - slots; i++) {
      const block = allSlots.slice(i, i + slots);
      const conflict = block.some(s => bookedSlots.includes(s));
      if (!conflict) {
        available.push(`${allSlots[i]}:00`);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ available, booked: bookedSlots })
    };
  } catch (err) {
    // Fail open: offer the full grid rather than blocking a customer on a store
    // hiccup; confirm_booking is the real guard (the Blobs conflict check, or the
    // DB exclusion constraint under Postgres).
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ available: allSlots.map(h => `${h}:00`), booked: [] })
    };
  }
}

function escHtml(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// Server-side validation. The chat client cannot be trusted: a malicious caller
// can POST directly to /api/chat with action=confirm_booking and any payload.
// Reject anything malformed, oversized, or with obviously fake pricing.
function validateBooking(b, opts){
  if(!b || typeof b !== "object") return "Invalid booking payload";

  // Trading-hours bounds depend on the active store (Slice 5b / D-021): the
  // Postgres `jobs` table enforces the 09:00-16:30 day (start 9..15, end <= 16,
  // up to 7 slots); the Phase 0 Blobs grid is 09:00-17:00 (start 9..17, end <= 18,
  // up to 9 slots). The defaults reproduce the exact Blobs behaviour, so the
  // flag-off path is byte-identical and the DB constraint is a backstop, not the
  // gate (a too-late/too-long slot is a clean 400 here, never a 23514 at insert).
  const o = opts || {};
  const latestStartHour = o.latestStartHour || 17;
  const latestEndHour = o.latestEndHour || 18;
  const maxSlots = o.maxSlots || 9;

  const required = ["name","phone","email","address","date","start_time","slots_needed"];
  for(const f of required){
    if(b[f] === undefined || b[f] === null || b[f] === "") return `Missing field: ${f}`;
  }

  if(typeof b.name !== "string" || b.name.length < 2 || b.name.length > 120) return "Invalid name";
  if(typeof b.phone !== "string" || b.phone.length < 7 || b.phone.length > 30) return "Invalid phone";
  if(typeof b.email !== "string" || b.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return "Invalid email";
  if(typeof b.address !== "string" || b.address.length < 5 || b.address.length > 500) return "Invalid address";
  if(typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "Invalid date format";
  // On-the-hour 9..latestStartHour, no leading zero (the assistant emits
  // "9:00".."17:00"); the allowed set narrows to 9..15 under the Postgres store.
  const allowedStartHours = [];
  for(let h = 9; h <= latestStartHour; h++) allowedStartHours.push(h);
  const startTimeRe = new RegExp("^(" + allowedStartHours.join("|") + "):00$");
  if(typeof b.start_time !== "string" || !startTimeRe.test(b.start_time)) return "Invalid start_time";

  const slots = Number(b.slots_needed);
  if(!Number.isInteger(slots) || slots < 1 || slots > maxSlots) return "Invalid slots_needed";

  // Date must be in the bookable window and not a Sunday
  const today = new Date(); today.setHours(0,0,0,0);
  const [y,m,d] = b.date.split("-").map(Number);
  const bookingDate = new Date(y, m-1, d);
  if(isNaN(bookingDate.getTime())) return "Invalid date";
  const daysOut = Math.floor((bookingDate - today) / (24*60*60*1000));
  if(daysOut < 6) return "Date too soon — minimum 7 days notice";
  if(daysOut > 90) return "Date too far ahead";
  if(bookingDate.getDay() === 0) return "Sundays are not bookable";

  // Slots fit within trading hours (last slot ends by latestEndHour)
  const startHour = parseInt(b.start_time.split(":")[0], 10);
  if(startHour + slots > latestEndHour) return "Slots overflow trading hours";

  // Price floor — minimum call-out is £75 + VAT (£90 inc). Anything under £30
  // is almost certainly a prompt-injection or tampered payload.
  if(b.estimated_price && typeof b.estimated_price === "string"){
    const match = b.estimated_price.replace(/,/g,"").match(/[\d.]+/);
    const priceNum = match ? parseFloat(match[0]) : 0;
    if(priceNum < 30) return "Estimated price below minimum";
    if(priceNum > 5000) return "Estimated price unrealistically high";
  }

  // Image size cap — base64 grows ~4/3 the raw bytes. 4.5MB string ≈ 3.3MB image.
  if(b.image && typeof b.image === "object"){
    if(typeof b.image.base64 !== "string") return "Invalid image data";
    if(b.image.base64.length > 4500000) return "Image too large (max ~3MB)";
    const okTypes = ["image/jpeg","image/png","image/webp","image/gif"];
    if(!okTypes.includes(b.image.mediaType)) return "Unsupported image type";
  }

  // Optional boolean flags
  if(b.furniture_moving !== undefined && typeof b.furniture_moving !== "boolean") return "Invalid furniture_moving";
  if(b.pets !== undefined && typeof b.pets !== "boolean") return "Invalid pets";

  // Length caps on free-text fields (prevents storing/emailing huge blobs)
  const textFields = ["rooms","carpet_types","concerns","recommended_method","ai_assessment","rams","postcode","deposit","estimated_price"];
  for(const f of textFields){
    if(b[f] !== undefined && b[f] !== null){
      if(typeof b[f] !== "string") return `Invalid ${f}`;
      if(b[f].length > 3000) return `${f} too long`;
    }
  }

  return null;
}

// Normalise the optional deposit for display. The 10% deposit normally arrives
// from the assistant, but it is not a required field (validateBooking only
// length-caps it when present), so a missing/blank value would otherwise render
// as the literal "undefined" in the calendar link, the emails and the PDF job
// card. Returns the value untouched when present, a clear fallback when not.
function depositLabel(value){
  return (typeof value === "string" && value.trim()) ? value : "To be confirmed";
}

async function handleBooking(booking, resendKey, baseHeaders, supabase) {
  const headers = Object.assign({}, baseHeaders || {}, { "Content-Type": "application/json" });
  const usePostgres = bookingsStoreIsPostgres() && !!supabase;
  // Surface a misconfiguration loudly: the flag is on but the Supabase creds are
  // missing, so this booking is silently going to Blobs, not Postgres.
  if (bookingsStoreIsPostgres() && !supabase) {
    console.log("WARNING: BOOKINGS_STORE=postgres but no Supabase client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset) — this booking is being written to Blobs, not Postgres.");
  }

  // Reject malformed/tampered payloads before touching the store, email, or PDF.
  // Under the Postgres store the bounds match the 09:00-16:30 day, so a too-late or
  // too-long slot is a clean 400 here, never a DB constraint error at insert
  // (Slice 5b / D-021).
  const validationError = usePostgres
    ? validateBooking(booking, { latestStartHour: 15, latestEndHour: 16, maxSlots: 7 })
    : validateBooking(booking);
  if(validationError){
    console.log("Booking rejected:", validationError);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: validationError })
    };
  }

  // Normalise the optional deposit once, up front, so the stored record, the
  // calendar link, both emails and the PDF job card all show a clean value
  // rather than "undefined" when the assistant omits it.
  booking.deposit = depositLabel(booking.deposit);

  // Persist the booking. The calLink is built after this block and stamped on the
  // stored record below (both stores), so null is passed here first.
  let currentBookingId = null;
  if (usePostgres) {
    // FAIL-CLOSED — the deliberate inverse of the 5a escalation path. For a
    // booking, persistence IS the deliverable: a "confirmed" email with no stored
    // row is the L-008 silent-vanish failure. So persist BEFORE any PDF/email, and
    // on any write failure return an error and send nothing (the client shows its
    // phone-number fallback). Double-booking is the DB exclusion constraint
    // (23P01 -> 409), not a read-then-write. No fallback to Blobs: that would
    // reintroduce the split-brain this slice removes.
    const res = await insertBooking(supabase, booking, { calLink: null });
    if (!res.ok) {
      if (res.conflict) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Time slot no longer available. Please choose another time." })
        };
      }
      console.log("Booking INSERT failed (no email sent):", res.error && res.error.message);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "We couldn't confirm your booking just now. Please call 01242 279590 to book." })
      };
    }
    currentBookingId = res.id;
  } else {
    // Phase 0 Netlify Blobs write path — kept byte-identical for instant rollback
    // when BOOKINGS_STORE is unset.
    try {
      const store = getBlobStore();
      const existing = await store.get(booking.date);
      const bookedSlots = existing ? JSON.parse(existing) : [];
      const startHour = parseInt(booking.start_time.split(":")[0]);
      const newSlots = Array.from({ length: booking.slots_needed }, (_, i) => startHour + i);
      const conflict = newSlots.some(s => bookedSlots.includes(s));

      if (conflict) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Time slot no longer available. Please choose another time." })
        };
      }

      const updatedSlots = [...bookedSlots, ...newSlots];
      await store.set(booking.date, JSON.stringify(updatedSlots));

      // Store full booking record
      const bookingId = Date.now().toString();
      const bookingRecord = Object.assign({}, booking, {
        id: bookingId,
        created_at: new Date().toISOString(),
        calLink: null // will be set below
      });
      await store.set("booking-"+bookingId, JSON.stringify(bookingRecord));

      // Update booking index
      const indexData = await store.get("booking-index");
      const index = indexData ? JSON.parse(indexData) : [];
      index.push(bookingId);
      await store.set("booking-index", JSON.stringify(index));

      currentBookingId = bookingId;
    } catch (err) {
      console.log("Blob storage error:", err.message);
    }
  }

  // Generate Google Calendar link for Mark
  const dateStr = booking.date.replace(/-/g, "");
  const startHour = parseInt(booking.start_time.split(":")[0]);
  const endHour = startHour + booking.slots_needed;
  const startStr = `${dateStr}T${String(startHour).padStart(2,"0")}0000`;
  const endStr = `${dateStr}T${String(endHour).padStart(2,"0")}0000`;
  const calTitle = encodeURIComponent(`ICC - ${booking.name} - ${booking.rooms}`);
  const calDetails = encodeURIComponent(`Customer: ${booking.name}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nAddress: ${booking.address}\nRooms: ${booking.rooms}\nCarpet types: ${booking.carpet_types}\nConcerns: ${booking.concerns}\nMethod: ${booking.recommended_method}\nEstimated price: ${booking.estimated_price}\nDeposit due: ${booking.deposit}`);
  const calLocation = encodeURIComponent(booking.address);
  const calLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${startStr}/${endStr}&details=${calDetails}&location=${calLocation}`;

  // Stamp the calendar link on the stored record (best-effort; the booking is
  // already persisted, so a failure here is logged, not surfaced to the customer).
  if(currentBookingId){
    if (usePostgres) {
      try{
        const { error } = await setJobCalLink(supabase, currentBookingId, calLink);
        if(error) console.log("Could not update cal_link:", error.message);
      } catch(e){ console.log("Could not update cal_link:", e.message); }
    } else {
      try{
        const store = getBlobStore();
        const existing = await store.get("booking-"+currentBookingId);
        if(existing){
          const record = JSON.parse(existing);
          record.calLink = calLink;
          await store.set("booking-"+currentBookingId, JSON.stringify(record));
        }
      } catch(e){ console.log("Could not update calLink:", e.message); }
    }
  }

  if (!resendKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Booking recorded. Email sending not configured.", calLink })
    };
  }

  // Generate PDF job card
  let pdfBase64 = null;
  try {
    const pdfBuffer = await generateJobCardPDF(booking, calLink, currentBookingId);
    pdfBase64 = pdfBuffer.toString("base64");
  } catch(e) {
    console.log("PDF generation error:", e.message);
  }

  const pdfFilename = `ICC-Job-${(booking.name||"Unknown").replace(/\s+/g,"-")}-${booking.date}.pdf`;

  // Email sender/recipient addresses are env-configurable so Mark's address can
  // change without a code deploy once Resend has a verified sending domain.
  const operatorEmail = process.env.OPERATOR_EMAIL || "ben.graham240689@gmail.com";
  const operatorFrom = process.env.OPERATOR_FROM || "ICC Bookings <onboarding@resend.dev>";
  const customerFrom = process.env.CUSTOMER_FROM || "Intelligent Carpet Cleaning <onboarding@resend.dev>";

  // Send email to Mark
  const markEmail = {
    from: operatorFrom,
    to: operatorEmail,
    subject: `New Booking - ${booking.name} - ${booking.date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d2236;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#2ab8a4;margin:0;font-size:20px;">New Booking Confirmed</h1>
          <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;">Intelligent Carpet Cleaning</p>
        </div>
        <div style="background:#f7f8fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;width:40%"><strong>Customer</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.name)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Phone</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.phone)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Email</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.email)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Address</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.address)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Date</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.date)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Start Time</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.start_time)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Duration</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.slots_needed)} hour(s)</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Rooms</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.rooms)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Carpet Types</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.carpet_types)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Concerns / Stains</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.concerns || "None noted")}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Furniture Moving</strong></td><td style="padding:8px 0;font-size:14px;">${booking.furniture_moving ? `Yes - \u00a3${pricing.priceOf("furniture_moving")} + VAT surcharge applies` : "No"}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Pets on site</strong></td><td style="padding:8px 0;font-size:14px;">${booking.pets ? "Yes - remind customer to keep pets away" : "No"}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Recommended Method</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.recommended_method)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>AI Assessment</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.ai_assessment)}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Estimated Price</strong></td><td style="padding:8px 0;font-size:14px;color:#1a8a7a;"><strong>${escHtml(booking.estimated_price)}</strong></td></tr>
            <tr style="background:#fff;"><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Deposit Due</strong></td><td style="padding:8px 0;font-size:14px;color:#1a8a7a;"><strong>${escHtml(booking.deposit)}</strong></td></tr>
          </table>
          <div style="margin-top:20px;padding:15px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;text-align:center;">
            <a href="${escHtml(calLink)}" style="display:inline-block;background:#1a8a7a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Add to Google Calendar</a>
          </div>
          <p style="margin-top:15px;font-size:12px;color:#718096;">This booking was taken via the ICC website AI assistant. Please contact the customer to arrange deposit payment.</p>
          ${(booking.image && ["image/jpeg","image/png","image/gif","image/webp"].includes(booking.image.mediaType)) ? '<div style="margin-top:15px;"><p style="font-size:13px;font-weight:bold;color:#1a3a5c;margin-bottom:8px;">Carpet Photo (uploaded by customer):</p><img src="data:'+escHtml(booking.image.mediaType)+';base64,'+escHtml(booking.image.base64)+'" style="max-width:400px;border-radius:8px;border:1px solid #e2e8f0;" alt="Carpet photo"></div>' : '<p style="font-size:12px;color:#718096;margin-top:8px;">No carpet photo was uploaded.</p>'}
          <p style="margin-top:12px;font-size:12px;color:#718096;">The full job card PDF is attached to this email.</p>
        </div>
      </div>`,
    attachments: pdfBase64 ? [{ filename: pdfFilename, content: pdfBase64 }] : []
  };

  // Send confirmation email to customer
  const customerEmail = {
    from: customerFrom,
    to: booking.email,
    subject: `Your Booking Confirmation - Intelligent Carpet Cleaning`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d2236;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#2ab8a4;margin:0;font-size:20px;">Booking Confirmation</h1>
          <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;">Intelligent Carpet Cleaning</p>
        </div>
        <div style="background:#f7f8fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p style="font-size:15px;">Hi ${escHtml(booking.name.split(" ")[0])},</p>
          <p style="font-size:14px;color:#4a5568;">Thank you for booking with Intelligent Carpet Cleaning. Here is a summary of your appointment:</p>
          <table style="width:100%;border-collapse:collapse;margin:15px 0;">
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;width:40%"><strong>Date</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.date)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Start Time</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.start_time)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Estimated Duration</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.slots_needed)} hour(s)</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Address</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.address)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Rooms</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(booking.rooms)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Estimated Price</strong></td><td style="padding:8px 0;font-size:14px;color:#1a8a7a;"><strong>${escHtml(booking.estimated_price)}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Deposit Required</strong></td><td style="padding:8px 0;font-size:14px;color:#1a8a7a;"><strong>${escHtml(booking.deposit)}</strong></td></tr>
          </table>
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #1a8a7a;margin:15px 0;">
            <p style="margin:0;font-size:14px;color:#4a5568;"><strong>What to do before your appointment:</strong></p>
            <ul style="font-size:13px;color:#4a5568;margin:8px 0;padding-left:20px;">
              <li>Clear small items, ornaments and lightweight furniture from carpeted areas</li>
              <li>Keep pets away from the work area during the clean and until carpets are dry</li>
              <li>Mark will be in touch to arrange your deposit payment to confirm the slot</li>
            </ul>
          </div>
          <div style="margin-top:15px;text-align:center;">
            <a href="${escHtml(calLink)}" style="display:inline-block;background:#1a8a7a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Add to My Calendar</a>
          </div>
          <p style="margin-top:20px;font-size:13px;color:#718096;">Questions? Call us on 01242 279590 or email hello@intelligentclean.co.uk</p>
          <div style="margin-top:20px;padding:15px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#1a3a5c;">Terms and Conditions</p>
            <p style="margin:0 0 8px;font-size:11px;color:#718096;line-height:1.6;"><strong>Pricing:</strong> The price quoted is an estimate based on the information and any photographs provided at the time of booking. In the vast majority of cases this will be the final price. If on arrival the condition differs significantly from what was described, any variation will be explained and agreed with you before any additional work is carried out. No additional charges will be applied without your explicit approval.</p>
            <p style="margin:0 0 8px;font-size:11px;color:#718096;line-height:1.6;"><strong>Deposit and cancellation:</strong> Your deposit secures your appointment slot and is payable at the point of booking. Cancellations made with 7 or more days notice will receive a full deposit refund. Cancellations within 7 days of the appointment date will forfeit the deposit. Cancellations within 48 hours of the appointment may be liable for the full estimated cost.</p>
            <p style="margin:0 0 8px;font-size:11px;color:#718096;line-height:1.6;"><strong>Re-clean guarantee:</strong> If you are not satisfied with the result, please contact us within 72 hours with photographic evidence and we will arrange a single return visit at no additional charge. This guarantee does not apply to pre-existing permanent staining present before the clean was carried out.</p>
            <p style="margin:0;font-size:11px;color:#718096;line-height:1.6;">These terms do not affect your statutory rights.</p>
          </div>
          <p style="margin-top:15px;font-size:12px;color:#a0aec0;">Established Trust, Superior Cleaning.</p>
        </div>
      </div>`
  };

  try {
    const [markRes, customerRes] = await Promise.all([
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify(markEmail)
      }),
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify(customerEmail)
      })
    ]);

    const markData = await markRes.json();
    const customerData = await customerRes.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Booking confirmed. Confirmation emails sent.",
        calLink,
        markEmail: markData,
        customerEmail: customerData
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Booking recorded but email sending failed.", calLink, error: err.message })
    };
  }
}

async function generateJobCardPDF(booking, calLink, bookingId) {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", info: { Title: `ICC Job Card - ${booking.name} - ${booking.date}`, Author: "Intelligent Carpet Cleaning" } });
    const buffers = [];
    doc.on("data", b => buffers.push(b));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const navy = "#0d2236", teal = "#1a8a7a", tealLight = "#2ab8a4", textDark = "#1a1a2e", textMid = "#4a5568";
    const W = doc.page.width - 80;

    // Header
    doc.rect(0, 0, doc.page.width, 75).fill(navy);
    doc.fontSize(18).fillColor(tealLight).font("Helvetica-Bold").text("INTELLIGENT CARPET CLEANING", 40, 14, { width: W });
    doc.fontSize(9).fillColor("white").font("Helvetica").text("Established Trust, Superior Cleaning", 40, 37);
    doc.fontSize(7.5).fillColor("rgba(255,255,255,0.5)").text(`Job Ref: ${bookingId || "N/A"}   |   Created: ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}   |   01242 279590   |   hello@intelligentclean.co.uk`, 40, 54);
    doc.y = 88;

    function sectionHeader(title) {
      doc.moveDown(0.2);
      const y = doc.y;
      doc.rect(40, y, W, 17).fill(teal);
      doc.fontSize(8.5).fillColor("white").font("Helvetica-Bold").text(title.toUpperCase(), 46, y + 4);
      doc.y = y + 23;
    }

    function field(label, value, x, y, w) {
      doc.fontSize(6.5).fillColor(teal).font("Helvetica-Bold").text(label, x, y);
      doc.fontSize(8.5).fillColor(textDark).font("Helvetica").text(String(value || "N/A"), x, y + 9, { width: w || (W / 2 - 10) });
    }

    function twoCol(l1, v1, l2, v2) {
      const y = doc.y;
      const half = W / 2 - 10;
      field(l1, v1, 40, y, half);
      if(l2) field(l2, v2, 40 + half + 20, y, half);
      doc.y = y + 26;
    }

    function fullRow(label, value) {
      const y = doc.y;
      doc.fontSize(6.5).fillColor(teal).font("Helvetica-Bold").text(label, 40, y);
      doc.fontSize(8.5).fillColor(textDark).font("Helvetica").text(String(value || "N/A"), 40, y + 9, { width: W });
      doc.moveDown(0.4);
    }

    // Customer
    sectionHeader("Customer Details");
    twoCol("CUSTOMER NAME", booking.name, "PHONE", booking.phone);
    twoCol("EMAIL ADDRESS", booking.email, "POSTCODE", booking.postcode);
    fullRow("FULL ADDRESS", [booking.address, booking.postcode].filter(Boolean).join(", "));

    // Job
    sectionHeader("Job Details");
    // Parse YYYY-MM-DD as local-date components so the function's runtime
    // timezone (Netlify functions run UTC) can never shift the printed day.
    const dateFormatted = (() => {
      try {
        const parts = String(booking.date || "").split("-").map(Number);
        if(parts.length !== 3 || parts.some(isNaN)) return booking.date;
        return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
      } catch(e){ return booking.date; }
    })();
    twoCol("DATE", dateFormatted, "START TIME", booking.start_time);
    twoCol("ESTIMATED DURATION", `${booking.slots_needed} hour(s)`, "FURNITURE MOVING", booking.furniture_moving ? `Yes - £${pricing.priceOf("furniture_moving")} + VAT` : "No");
    twoCol("PETS ON SITE", booking.pets ? "Yes - keep away during clean and until dry" : "No", "", "");
    fullRow("ROOMS TO BE CLEANED", booking.rooms);

    // Carpet
    sectionHeader("Carpet & Cleaning Details");
    fullRow("CARPET TYPES", booking.carpet_types);
    fullRow("CONCERNS / STAINS", booking.concerns || "None noted");
    fullRow("RECOMMENDED CLEANING METHOD", booking.recommended_method);

    // Assessment
    sectionHeader("AI Assessment & Job Brief");
    doc.moveDown(0.2);
    doc.fontSize(8.5).fillColor(textMid).font("Helvetica").text(booking.ai_assessment || "No assessment recorded.", 40, doc.y, { width: W });
    doc.moveDown(0.6);

    // RAMS
    if(booking.rams){
      sectionHeader("Risk Assessment & Method Statement (RAMS)");
      doc.moveDown(0.2);
      const ramsLines = booking.rams.split(/\\n|\n/);
      ramsLines.forEach(function(line){
        const colonIdx = line.indexOf(":");
        if(colonIdx > -1){
          const label = line.substring(0, colonIdx).trim();
          const value = line.substring(colonIdx + 1).trim();
          const y = doc.y;
          doc.fontSize(7).fillColor(teal).font("Helvetica-Bold").text(label.toUpperCase()+":", 40, y, { continued: false, width: W });
          doc.fontSize(8.5).fillColor(textMid).font("Helvetica").text(value, 40, doc.y, { width: W });
          doc.moveDown(0.3);
        } else if(line.trim()){
          doc.fontSize(8.5).fillColor(textMid).font("Helvetica").text(line.trim(), 40, doc.y, { width: W });
          doc.moveDown(0.3);
        }
      });
      doc.moveDown(0.3);
    }

    // Pricing
    sectionHeader("Pricing");
    const pY = doc.y;
    const boxW = (W / 2) - 5;
    doc.rect(40, pY, boxW, 42).fill(navy);
    doc.fontSize(7).fillColor("rgba(255,255,255,0.55)").font("Helvetica").text("ESTIMATED PRICE (EX VAT)", 50, pY + 7);
    doc.fontSize(14).fillColor("white").font("Helvetica-Bold").text(booking.estimated_price || "N/A", 50, pY + 19);
    doc.rect(40 + boxW + 10, pY, boxW, 42).fill(teal);
    doc.fontSize(7).fillColor("rgba(255,255,255,0.55)").font("Helvetica").text("DEPOSIT DUE", 50 + boxW + 10, pY + 7);
    doc.fontSize(14).fillColor("white").font("Helvetica-Bold").text(booking.deposit || "N/A", 50 + boxW + 10, pY + 19);
    doc.y = pY + 50;
    doc.moveDown(0.5);

    // Calendar link - just note it's in the email, don't print the full URL
    doc.fontSize(8).fillColor(textMid).font("Helvetica").text("A Google Calendar link has been included in the notification email.", 40, doc.y, { width: W });
    doc.moveDown(0.8);

    // Photo
    const safeTypes = ["image/jpeg","image/png","image/webp","image/gif"];
    if(booking.image && booking.image.base64 && safeTypes.includes(booking.image.mediaType)){
      try {
        sectionHeader("Carpet Photo");
        doc.moveDown(0.2);
        const imgBuf = Buffer.from(booking.image.base64, "base64");
        doc.image(imgBuf, 40, doc.y, { fit: [W, 180], align: "left" });
        doc.moveDown(14);
      } catch(e) { console.log("PDF image error:", e.message); }
    }

    // Footer - drawn as flowing content to avoid blank pages
    doc.moveDown(1);
    doc.rect(40, doc.y, W, 1).fill("#e2e8f0");
    doc.moveDown(0.5);
    doc.fontSize(7.5).fillColor(textMid).font("Helvetica")
       .text("Intelligent Carpet Cleaning  |  01242 279590  |  hello@intelligentclean.co.uk  |  All GL Postcodes  |  Mon-Sat 8am-6pm", 40, doc.y, { align: "center", width: W });
    doc.moveDown(0.4);
    doc.fontSize(7).fillColor("#a0aec0")
       .text("This job card was generated automatically by the ICC AI booking system. Please verify all details with the customer before the appointment.", 40, doc.y, { align: "center", width: W });

    doc.end();
  });
}

// Exported for unit tests (test/hardening.test.js, test/knowledge.test.js,
// test/escalation.test.js, test/citations.test.js, test/websearch.test.js).
// Not used by the handler.
exports.rateLimit = rateLimit;
exports.depositLabel = depositLabel;
exports.validateBooking = validateBooking;
exports.handleBooking = handleBooking;
exports.checkAvailability = checkAvailability;
exports.bookingsStoreIsPostgres = bookingsStoreIsPostgres;
exports.STATIC_SYSTEM_PROMPT = STATIC_SYSTEM_PROMPT;
exports.ESCALATION_TOOL = ESCALATION_TOOL;
exports.WEB_SEARCH_TOOL = WEB_SEARCH_TOOL;
exports.TOOLS = TOOLS;
exports.runAssistantTurn = runAssistantTurn;
exports.withSingleTextBlock = withSingleTextBlock;
exports.handleTool = handleTool;
exports.handleEscalation = handleEscalation;
exports.withKnowledgeDocument = withKnowledgeDocument;
exports.collectCitations = collectCitations;
