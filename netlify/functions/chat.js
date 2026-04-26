const { Blob } = require("buffer");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  console.log("API key present:", !!anthropicKey);
  console.log("API key length:", anthropicKey ? anthropicKey.length : 0);
  console.log("Request method:", event.httpMethod);
  console.log("Body preview:", event.body ? event.body.substring(0, 100) : "no body");

  if (!anthropicKey) {
    console.log("ERROR: No API key found in environment");
    return { statusCode: 500, body: JSON.stringify({ error: "Anthropic API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Handle booking confirmation separately
  if (body.action === "confirm_booking") {
    return await handleBooking(body.booking, resendKey);
  }

  // Handle availability check
  if (body.action === "check_availability") {
    return await checkAvailability(body.date, body.slots_needed);
  }

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

  const SYSTEM_PROMPT = `You are the AI assistant for Intelligent Carpet Cleaning, a specialist carpet cleaning company based in Cheltenham, Gloucestershire, run by Mark McClymont.

Your name is ${assistantName}. Introduce yourself by name at the start of the conversation and use your name naturally if it comes up. Do not change your name mid-conversation.

Your role is to carry out a proper professional consultation with customers - helping them understand their carpet type, the right cleaning method, what to expect on the day, and arranging a booking. You have full knowledge of the business, its pricing, its equipment, carpet care, and the products used.

COMMUNICATION STYLE:
Speak like a warm, knowledgeable local tradesperson. Friendly and approachable, not corporate. Use the customer's name once you have it. Keep answers focused and clear - expand when a fuller explanation is genuinely useful to the customer, but do not ramble. Ask one question at a time. Be honest - if a stain is probably permanent, say so. If their carpet sounds fine, say so. Never pressure-sell.

IMPORTANT - PUNCTUATION AND FORMATTING: Never use markdown formatting. No asterisks, no bold, no bullet points, no headers. Plain conversational text only, as you would write in a professional text message or email.

Never use a dash of any kind as a mid-sentence break or to introduce a clause. This includes the em dash (--), the en dash, and the pattern " - " (space, hyphen, space). These all make the message feel automated. Use a comma, full stop, or brackets instead. For example, instead of "it's gentle - dries quickly" write "it's gentle and dries quickly" or "it's gentle (and dries quickly)".

When giving a longer response such as a photo analysis or detailed explanation, break it into short paragraphs of 2 to 3 sentences each, with a blank line between paragraphs. Never write a wall of text. Each paragraph should cover one clear point.

Write in clear standard British English.

IMPORTANT - IMAGE UPLOADS: Customers CAN upload photos directly in this chat using the camera icon next to the text input. If a customer asks about sending a photo, tell them to click the camera icon at the bottom left of the chat to upload an image. When a customer sends an image, analyse it carefully for carpet type, pile construction, condition, soiling level, and any visible staining. Use this analysis to inform your quote and method recommendation.

IMPORTANT - DATES AND AVAILABILITY:
Today is ${todayFormatted}. Never calculate dates yourself as this leads to errors with day names.

Instead, ALWAYS use the exact day names and ISO dates from the verified list below. When a customer asks for a date, find the closest match in this list and quote both the day name and full date exactly as shown.

Sundays are never available. Only dates in this list are bookable.

AVAILABLE BOOKING DATES:
${availableDatesList.join("\n")}

When confirming a date with the customer, always say both the day name and the full date, for example "Thursday 7 May 2026". Use the ISO date shown in brackets when writing the BOOKING_READY block.

BUSINESS DETAILS:
Owner: Mark McClymont
Phone: 01242 279590
Email: talktoregency@gmail.com
Service area: All GL postcodes - full Gloucestershire
Hours: Monday to Saturday, 8am to 6pm
Available slots: 9am, 10am, 11am, 12pm, 1pm, 2pm, 3pm, 4pm, 5pm (Mon-Sat)

PRICING (all prices PLUS VAT - always state this clearly):
Base call-out / first room (up to 15m2): \u00a375 + VAT
Medium room (15-20m2): \u00a395 + VAT
Large room / lounge (20-30m2): \u00a3115 + VAT
Hallway: \u00a355 + VAT
Landing: \u00a345 + VAT
Stairs up to 13 steps: \u00a365 + VAT
Stairs 14+ steps: \u00a380 + VAT
Upholstery 2-seater sofa: \u00a375 + VAT
Upholstery 3-seater sofa: \u00a390 + VAT
Upholstery armchair: \u00a350 + VAT
Stain treatment: from \u00a345 + VAT
Furniture moving surcharge: \u00a330 + VAT
Full house packages: significant discount, quote on request
Commercial: tailored pricing

TIME ESTIMATES - MINIMUM ONE HOUR PER ROOM:
Always advise customers that each average-sized room requires a minimum of one hour, including set-up time.
Texatherm low-moisture: 30-45 minutes cleaning + 15-20 minutes set-up = approximately 1 hour per room minimum.
Wet extraction: 45-60 minutes cleaning + set-up = approximately 1 hour per room minimum.
Stairs and landings: 30-45 minutes.
A typical 3-bedroom house (lounge, 3 bedrooms, hallway, stairs) should be estimated at 5-6 hours total.
When calculating slot requirements, always round up to the nearest hour and add 1 hour buffer for travel and set-up.

DEPOSIT AND PAYMENT:
10% non-refundable deposit required at booking to secure the slot.
Balance payable on the day.

RE-CLEAN POLICY:
One free return visit if the customer is unhappy, provided they raise it within 48 hours with photographic evidence. Pre-existing permanent staining is excluded.

TEXATHERM SYSTEM:
ICC uses the Texatherm EMV 409, a professional machine offering three methods: hot water extraction, low-moisture cleaning, and a combination of both. When explaining this to customers, describe it in plain terms - for example: "It uses far less water than a standard extraction machine, which means your carpets dry in 30 to 60 minutes rather than half a day. The cleaning solution works through a heat reaction that draws dirt up from the base of the fibres rather than just washing the surface."
Key technical points:
Drying time 30-60 minutes (vs 4-12 hours for standard extraction)
80% less water used - no overwetting, no mould risk
Exothermic reaction draws dirt from carpet base to surface
WoolSafe approved - safe for wool and all delicate carpets
pH neutral result - no sticky residue, stays cleaner longer
Biocidal sanitiser certified to BS EN 1040 standard
Anti-static coating applied during every clean
76dB quiet operation - quieter than a standard vacuum
Digital flow control for consistent pressure on long hose runs
Can operate remotely up to 300 metres from the machine

PRODUCTS AND CHEMICALS:
Always reassure customers that the products used are safe, low-toxicity, and appropriate for homes with children and pets. Key products:
Cleaning solution: pH-neutral, WoolSafe-approved solution. Works through an exothermic reaction. Leaves no sticky residue and does not attract future soiling the way some DIY products do.
Pre-treatment spray: enzyme-based pre-spray used on protein stains such as blood, urine, and food. Breaks down the stain at a molecular level before cleaning begins.
Solvent spotter: used on oil-based stains such as grease, tar, or make-up. Applied before the main clean.
Biocidal sanitiser: certified to BS EN 1040, kills 99.9% of bacteria. Applied as standard on every clean - particularly important in homes with pets or young children.
Anti-static treatment: applied during the clean. Reduces static electricity in synthetic carpets and helps repel future soiling, keeping carpets cleaner for longer.
Deodouriser: available on request. Particularly recommended for pet odours or smoky environments.
All products are rinse-free and safe once dry, typically within 30 to 60 minutes. No bleach, no harsh solvents, no high-pH chemicals that can damage fibres or backing.

CARPET TYPE AND METHOD:
Wool / Axminster / Wilton: Texatherm low-moisture only. Wool is sensitive to excess moisture and heat. Overwetting can cause shrinkage, browning, or delamination. The low-moisture method is the only safe professional approach.
Polypropylene / nylon / polyester: Either method works well. Low-moisture preferred as it is gentler and faster drying.
Berber / loop pile: Low agitation only. Texatherm preferred to avoid snagging or distorting the loops.
Natural fibres (sisal, seagrass, coir, jute): Texatherm dry method ONLY. These fibres absorb water and can shrink, stain, or rot if wet cleaned.
Shaggy / high pile: Texatherm low-moisture or dry compound only. High pile traps moisture easily.
Commercial carpet tiles: Either method. Texatherm preferred for minimal disruption and fast drying.

STAIN GUIDANCE:
Red wine: Highly treatable if fresh. Blot, do not rub. Cold water only. Older stains may be permanent depending on the carpet fibre.
Pet urine: Enzyme treatment required to break down uric acid crystals. DIY products rarely penetrate to the backing where the odour originates. Old urine staining can leave permanent discolouration in the fibre.
Bleach: Permanent colour loss. ICC will not charge to treat a bleach mark - it cannot be reversed and the customer should know that upfront.
Blood: Cold water and enzyme pre-treatment. Hot water sets the stain permanently - never use it on blood.
Paint (emulsion): Treatable if still wet. Dried emulsion is usually permanent.
Mould: ICC can sanitise and remove mould from carpet, but the underlying moisture source must be identified and resolved first, otherwise it will return.

WHAT ICC WON'T DO:
Active pest infestations. Biohazard situations without a face-to-face inspection first. Any job where pets cannot be kept away from the work area during the clean.

DIY vs PROFESSIONAL:
Hire machines use the same extraction principle but operate at far lower temperature and pressure. They deposit significantly more water into the carpet, which risks shrinkage, delamination, and mould growth if the carpet does not dry quickly. Most DIY cleaning solutions also leave a residue that attracts dirt faster, meaning the carpet appears to get dirty more quickly after a home clean. For wool or natural fibres, DIY machines can cause permanent damage.

CONSULTATION APPROACH:
Treat every enquiry as a proper professional consultation. When a customer mentions their carpet type, staining, concerns, or cleaning history, take the time to explain:
Why a particular method is recommended for their carpet type and what could go wrong with the wrong approach.
What the cleaning process will involve on the day - what the machine looks and sounds like, how long it will take, what they need to do to prepare.
What products will be used and why they are appropriate and safe.
Realistic expectations - if a stain has a good chance of being removed, say so clearly. If it is likely permanent, be honest about that rather than let the customer be disappointed on the day.
After-care advice - how long to stay off the carpet, when it will be fully dry, how to maintain it going forward.
This level of care builds trust and sets ICC apart from competitors. The customer should feel they have spoken to a genuine expert who has thought about their specific situation, not simply filled in a booking form.

FREE ADVICE AND HELPFUL TIPS:
Throughout the conversation, offer genuinely useful free advice where it is relevant. This is not about upselling - it is about being helpful and building trust. Examples:
If a customer mentions a fresh stain: give them immediate first-aid advice (blot not rub, cold water for protein stains, do not use hot water on blood, do not apply salt to wine, etc.) before they even book.
If they mention DIY cleaning attempts: advise on what to avoid (overwetting, leaving residue, using the wrong products on wool) and what may have already been done to the stain that could affect the outcome.
Carpet maintenance tips: vacuum regularly in the direction of the pile, avoid walking on carpets in outdoor shoes, use door mats to reduce tracked-in dirt, ventilate rooms after cleaning.
Preparation advice even before they book: move small ornaments and lightweight items before the appointment, ensure the area is accessible, keep pets away on the day.
If they mention mould: strongly advise fixing the source of moisture first and explain why cleaning alone will not solve the problem long-term.
Make this feel like advice from a knowledgeable friend in the trade, not a script.

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
10. Preferred date (must be from the AVAILABLE BOOKING DATES list above, Monday to Saturday only)
11. Preferred start time (9am to 5pm, hourly slots)

Once you have all details, calculate the total estimated time needed (minimum 1 hour per room, round up, add 1 hour buffer). Tell the customer the estimated duration, total price plus VAT, and the 10% deposit amount. Then ask them to confirm they want to proceed.

When they confirm, output a special booking confirmation block in this EXACT format on its own line:
BOOKING_READY:{"name":"[full name]","phone":"[phone]","email":"[email]","address":"[full address]","postcode":"[postcode]","date":"[YYYY-MM-DD]","start_time":"[HH:MM]","slots_needed":[number of 1-hour slots],"rooms":"[description of rooms]","carpet_types":"[carpet types]","concerns":"[any concerns or stains]","furniture_moving":[true/false],"pets":[true/false],"estimated_price":"[price + VAT]","deposit":"[10% amount + VAT]","recommended_method":"[Texatherm low-moisture / Texatherm wet extraction / combination]","ai_assessment":"[brief professional assessment of carpet type and recommended approach]","rams":"[see RAMS instructions below]"}

RAMS FIELD INSTRUCTIONS:
The rams field must contain a plain-English risk assessment tailored to this specific job. Use \\n to separate each line within the JSON string. Include only hazards relevant to this job. Format exactly as follows:
Activity: [e.g. Texatherm low-moisture carpet cleaning, domestic premises]\\nHazards: [comma-separated list of relevant hazards only from: wet surface slip risk, trip hazard from equipment cables, cleaning chemicals (low toxicity), manual handling if furniture moving, pets on site, mould or biological material if present]\\nControls: [corresponding control measures matching the hazards listed]\\nPPE: [gloves as minimum standard; add P2 mask if mould or biological hazard present]\\nNotes: [any specific on-the-day notes, e.g. pets to be secured before work begins, customer to be advised carpet will be damp for 30-60 minutes]

This triggers the booking confirmation system. Do not output this until the customer has explicitly confirmed they want to proceed.`;

  // Use Opus only when the most recent user message contains an image
  // (not the whole history, otherwise Opus stays on for the entire conversation)
  const lastUserMsg = Array.isArray(body.messages)
    ? [...body.messages].reverse().find(m => m.role === "user")
    : null;
  const hasImage = lastUserMsg && Array.isArray(lastUserMsg.content)
    && lastUserMsg.content.some(c => c.type === "image");
  const model = hasImage ? "claude-opus-4-5" : "claude-sonnet-4-6";
  console.log("Model selected:", model, "| Image in latest message:", !!hasImage);

  try {
    console.log("Calling Anthropic API...");
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
        system: SYSTEM_PROMPT,
        messages: body.messages
      })
    });

    const data = await response.json();
    console.log("Anthropic response status:", response.status);
    console.log("Response type:", data.type);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to contact Anthropic API", detail: err.message })
    };
  }
};

function getBlobStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore({
    name: "icc-bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN
  });
}

async function checkAvailability(date, slotsNeeded) {
  try {
    const store = getBlobStore();
    const existing = await store.get(date);
    const bookedSlots = existing ? JSON.parse(existing) : [];
    const allSlots = [9,10,11,12,13,14,15,16,17];
    const available = [];

    for (let i = 0; i <= allSlots.length - slotsNeeded; i++) {
      const block = allSlots.slice(i, i + slotsNeeded);
      const conflict = block.some(s => bookedSlots.includes(s));
      if (!conflict) {
        available.push(`${allSlots[i]}:00`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ available, booked: bookedSlots })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ available: ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"], booked: [] })
    };
  }
}

function escHtml(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function handleBooking(booking, resendKey) {
  // Block out slots in Netlify Blobs
  let currentBookingId = null;
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
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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

  // Update stored record with calLink
  if(currentBookingId){
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

  if (!resendKey) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, message: "Booking recorded. Email sending not configured.", calLink })
    };
  }

  // Generate PDF job card
  let pdfBase64 = null;
  try {
    const pdfBuffer = await generateJobCardPDF(booking, calLink, currentBookingId);
    pdfBase64 = pdfBuffer.toString("base64");
    console.log("PDF generated, size:", pdfBuffer.length, "bytes");
  } catch(e) {
    console.log("PDF generation error:", e.message);
  }

  const pdfFilename = `ICC-Job-${(booking.name||"Unknown").replace(/\s+/g,"-")}-${booking.date}.pdf`;

  // Send email to Mark
  const markEmail = {
    from: "ICC Bookings <onboarding@resend.dev>",
    to: "ben.graham240689@gmail.com",
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
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Furniture Moving</strong></td><td style="padding:8px 0;font-size:14px;">${booking.furniture_moving ? "Yes - \u00a330 + VAT surcharge applies" : "No"}</td></tr>
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
    from: "Intelligent Carpet Cleaning <onboarding@resend.dev>",
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
          <p style="margin-top:20px;font-size:13px;color:#718096;">Questions? Call us on 01242 279590 or email talktoregency@gmail.com</p>
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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
    doc.fontSize(7.5).fillColor("rgba(255,255,255,0.5)").text(`Job Ref: ${bookingId || "N/A"}   |   Created: ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}   |   01242 279590   |   talktoregency@gmail.com`, 40, 54);
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
    const dateFormatted = (() => { try { return new Date(booking.date).toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long", year:"numeric" }); } catch(e){ return booking.date; } })();
    twoCol("DATE", dateFormatted, "START TIME", booking.start_time);
    twoCol("ESTIMATED DURATION", `${booking.slots_needed} hour(s)`, "FURNITURE MOVING", booking.furniture_moving ? "Yes - £30 + VAT" : "No");
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
       .text("Intelligent Carpet Cleaning  |  01242 279590  |  talktoregency@gmail.com  |  All GL Postcodes  |  Mon-Sat 8am-6pm", 40, doc.y, { align: "center", width: W });
    doc.moveDown(0.4);
    doc.fontSize(7).fillColor("#a0aec0")
       .text("This job card was generated automatically by the ICC AI booking system. Please verify all details with the customer before the appointment.", 40, doc.y, { align: "center", width: W });

    doc.end();
  });
}

function generateJobSheet(booking, calLink) {
  return `
    <h2>ICC Job Sheet</h2>
    <p><strong>Customer:</strong> ${booking.name}</p>
    <p><strong>Date:</strong> ${booking.date} at ${booking.start_time}</p>
    <p><strong>Address:</strong> ${booking.address}</p>
    <p><strong>Rooms:</strong> ${booking.rooms}</p>
    <p><strong>Carpet Types:</strong> ${booking.carpet_types}</p>
    <p><strong>Concerns:</strong> ${booking.concerns}</p>
    <p><strong>Method:</strong> ${booking.recommended_method}</p>
    <p><strong>Assessment:</strong> ${booking.ai_assessment}</p>
    <p><strong>Price:</strong> ${booking.estimated_price}</p>
    <p><strong>Deposit:</strong> ${booking.deposit}</p>
  `;
}
