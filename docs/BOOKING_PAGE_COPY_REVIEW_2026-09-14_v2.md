# Booking page copy review, v2

Reviewed on 14 September 2026. The scope is `site/src/pages/book.astro`, the live `/book` chat client, together with the chat-flow strings it renders from `server/netlify/functions/chat.js`, `server/netlify/functions/rateLimit.js`, `shared/config/policy.js` and `shared/emailSnippets.js`. This is a review only: nothing on the page has been edited and nothing has been committed.

The method was `copy-editing` (the seven sweeps: clarity, voice, so-what, prove-it, specificity, emotion, zero-risk) on the prose; `cro` on the structure and the conversion path; `copywriting`'s CTA formula for the buttons and chips; every phrase that reads as a claim checked with `substantiate-outward-claims`; and `unslop-text` as the final pass on this document. The prove-it and specificity sweeps were run in reverse of their usual direction: the brief forbids new figures, so they were used to find what the page asserts that the repo cannot back, and cut it. The emotion sweep found that the flow's honesty lines (the assistant is told to say when a stain is probably permanent, and never to pressure-sell) are the page's emotional register, and nothing is added to them.

The constraints were: no new claims about the business, no statistics, no testimonials, British English, and no em dashes. Where a current string contains one it is written as `[em dash]`, so this file ships none. The only contact details used are the ones the page already carries and D-030 confirms, 01452 452356 and hello@intelligentclean.co.uk.

The v1 review at `docs/BOOKING_PAGE_COPY_REVIEW_2026-09-14.md` was written in a separate session and was not read until sections 1 to 5 here were complete. Section 6 names the substantive differences.

Each element entry gives the line it lives on (checked with `grep -n` on this checkout at commit `3f8da11`), the current text, the proposed text, and one line of why. "Keep" means the line earns its place as it stands. Couplings (tests that pin a string, the `index.html` twin, the email twin) are gathered in section 4 rather than repeated per element.

## 1. The conversion path

What the visitor walks through today: a nav or home-page link promising a quote or a booking; a dark header band ("AI Cleaning Assistant"); the chat window with a welcome bubble, four suggestion chips, a camera icon and a text box; a conversation in which the assistant collects eleven fields, in a fixed order, before it prices; a "shall I book it" confirmation; an on-screen card, a confirmation email and, for on-time bookings while Stripe is in Test mode, a deposit button. Below the window, one line offers the phone and email and links the privacy notice.

Findings, highest impact first. Each points to the element entries that carry the words.

**S1. The headline names the mechanism when every link promised an outcome.** Every link into this page promises a result: "Get a Quote" (nav), "Book a Visit" and "Chat with Our AI" (home), "Get an Instant Quote" (services), "Start a Booking Chat" (contact), and the tab title "Book a Carpet Clean". The H1 that greets them is "AI Cleaning Assistant". A visitor scanning for "am I in the right place" has to infer it. Fix: A3, A4.

**S2. Contact details are asked for before the price.** The booking script (`chat.js:129` onwards) collects full name, phone, email and full address as questions one to four, and the price arrives after question eleven. The quote is the thing the visitor came for; four pieces of personal data are the biggest ask on the page, and they sit in front of it. Nothing in `test/` pins the order (checked: `test/bookings-chat.test.js` locks the oversize wording and the specialist-services block only). Fix: G4, which is a `chat.js` prompt change, not a page change.

**S3. Three minutes of silence, three times, kills the chat.** `INACTIVITY_MS` is three minutes (`book.astro:159`); after the third reminder the input is disabled (`book.astro:201` to `205`) and, because the conversation lives only in memory, a refresh starts from nothing. A customer who goes to measure a room, find a photo or take a call comes back to a dead box. The reminders are fine; the lock is a leak in the path. Proposal: keep the two reminders, drop the third-strike disable (leave the disable for a real goodbye, which `endConversation` already handles), or at minimum lengthen the interval. Copy for the reminders is at C1 to C3.

**S4. "Online" is a static claim.** The green dot and the word "Online" (`book.astro:34`) are fixed markup. If `/api/chat` is returning 500s the header still says the assistant is online. Wording fix at A6; the structural fix is to drive the dot from the first successful reply, or drop it.

**S5. The page gives one legal link where the flow needs two.** The visitor agrees a price and a 10% deposit inside the chat, and the deposit, refund and 14-day cancellation terms are on `/terms`, but the only link under the window is the privacy notice. Adding the terms link is the cheapest zero-risk move available that makes no new claim. Fix: A7.

**S6. Two different welcomes.** The HTML fallback bubble (`book.astro:44`) and the script that replaces it on load (`book.astro:149` to `152`) say different things, and on a slow connection the visitor sees one become the other. Fix: B1, one text in both places.

**S7. Three of the four chips put words in the customer's mouth.** "Get a quote" sends "my lounge carpet", "Stain advice" sends "red wine", and "DIY vs professional" sends a hire-machine brand name that the assistant is itself forbidden to use (`chat.js:105`). Fixes: B2, B4, B5.

**S8. The photo option is an unlabelled icon.** Photo analysis is one of the page's distinctive capabilities and the only cue is a camera glyph. The welcome and the placeholder can carry it in words. Fixes: B1, B7.

**S9. On the outcome card, the deposit button comes second.** The calendar button is appended before the pay button (`book.astro:517`, then `534`). The deposit is the action the business needs; put it first, calendar second. No copy change.

**S10. Trust signals, within the brief.** Testimonials, counts and ratings are excluded by the brief, by D-015 (no quantified trust claims until independently substantiated) and by the home page's own `TODO(trust-stats)`. What the page can legitimately show is already mostly there: a real phone number and email, the privacy notice, honest provisional-booking wording and, with A7, the terms. The substitution proposed at A4 (what the assistant works from, and that it hands over to Mark) is the one trust line the repo can back.

**Mobile.** The CSS comment in `book.astro` records that the fold was measured at 375x812 and the header and message list were resized so the text box is on screen at load. Nothing to add.

## 2. Copy, element by element

### A. Page chrome

**A1. Browser title** (`book.astro:20`)
Current: `Book a Carpet Clean | Intelligent Carpet Cleaning`
Proposed: keep.
Why: it names the outcome and the brand, which is exactly what S1 asks the rest of the header to do.

**A2. Meta description** (`book.astro:21`)
Current: `Chat with our AI assistant for an instant, fully-explained quote, expert carpet advice, and booking across Cheltenham and Gloucestershire.`
Proposed: `Describe your carpet to ICC's AI assistant, get an itemised quote with the reasoning behind it, and book a slot. Cheltenham, Gloucester and Gloucestershire.`
Why: "instant" overstates a flow that asks up to eleven questions before it prices, and "expert" is a self-assessment; "itemised" and "the reasoning behind it" describe what the assistant is instructed to do. One caveat: "Get an Instant Quote" is the button text on the services, areas, guides and history pages, so cutting the word here alone leaves the links promising what the page no longer says; the call on "instant" is site-wide and Ben's.

**A3. Page heading** (`book.astro:25`)
Current: `AI Cleaning Assistant`
Proposed: `Get your quote and book your clean`
Why: matches the promise on every link into the page (S1) instead of naming the mechanism.
Alternatives: `Tell us about your carpet, get a price, book a slot` (spells out the three steps); `Your quote, explained, then booked` (shorter, leans on the explanation as the differentiator).

**A4. Page sub-heading** (`book.astro:26`)
Current: `Instant quotes, carpet advice, stain guidance, and booking. Our AI knows carpets inside out.`
Proposed: `Describe your carpet and the assistant will suggest a method, price the job line by line, and book you in, with the method confirmed on the day. It's an AI working from ICC's own carpet care reference, and it hands over to Mark when a question needs a person.`
Why: "knows carpets inside out" is puffery the repo cannot back, and the September marketability pass (`docs/MARKETABILITY_REVIEW_2026-09.md`, finding A4) reworded the same class of claim on every other page type to a suggestion confirmed on the day; what the repo can back is that phrasing, the cited reference document and the human handover.

**A5. Chat window name** (`book.astro:33`)
Current: `ICC Assistant`
Proposed: `ICC booking assistant`
Why: the same words the assistant uses for itself in the welcome and the prompt, so the header and the first bubble agree.

**A6. Chat window status line** (`book.astro:34`)
Current: `Online [em dash] Intelligent Carpet Cleaning`
Proposed: `AI assistant for Intelligent Carpet Cleaning`
Why: removes the em dash (banned house-wide, and the assistant's own prompt forbids dashes in replies) and stops the header asserting "online" from static markup (S4).

**A7. Fallback line under the window** (`book.astro:69`)
Current: `Prefer to talk to a person? Call 01452 452356 or email hello@intelligentclean.co.uk. We handle your details in line with our Privacy Notice.`
Proposed: `Prefer to talk to a person? Call 01452 452356 or email hello@intelligentclean.co.uk. Our booking terms cover the deposit and cancellation, and our privacy notice explains how we handle your details.` (with "booking terms" linked to `/terms` and "privacy notice" to `/privacy`)
Why: the visitor agrees a deposit in the chat, so the terms belong one click away beside the privacy notice (S5).

### B. Opening the conversation

**B1. Welcome bubble** (script at `book.astro:149` to `152`; HTML fallback at `book.astro:44`)
Current (what the visitor sees, from the script): `Hi, welcome to Intelligent Carpet Cleaning. I'm the booking assistant, here to help you with quotes, carpet advice, stain guidance, and booking.` then `To get started, could you tell me about your carpet and what you need? For example, the room type, approximate size, and any concerns such as staining or heavy soiling.`
Current (HTML fallback, briefly visible before the script runs): `Hello and welcome to Intelligent Carpet Cleaning. I am here to help you with quotes, carpet advice, stain guidance, and booking.`
Proposed (both places, identical): `Hi, welcome to Intelligent Carpet Cleaning. I'm the booking assistant, an AI, and I can quote for your carpets, advise on stains and cleaning methods, and book you in.` then `To start, tell me which rooms you'd like cleaned and roughly how big they are, plus anything you're concerned about such as stains or heavy soiling. You can also add a photo with the camera icon.`
Why: one welcome instead of two (S6), says it is an AI at the point people actually read, asks first for the rooms the quote is built from, and puts the photo option into words (S8).

**B2. Chip: Get a quote** (`book.astro:50`)
Current: label `Get a quote`, sends `I need a quote for my lounge carpet`
Proposed: label unchanged, sends `I'd like a quote for my carpets.`
Why: the current message commits the customer to a lounge before they have said what they want.

**B3. Chip: Identify my carpet** (`book.astro:51`)
Current: label `Identify my carpet`, sends `How do I identify what type of carpet I have?`
Proposed: label `What carpet do I have?`, sends `Can you help me work out what type of carpet I have?`
Why: the September pass softened "identify" to a likely assessment confirmed on the day everywhere else on the site (`docs/MARKETABILITY_REVIEW_2026-09.md`, A4), and a question in the customer's own voice sets that expectation from the first tap.

**B4. Chip: DIY vs professional** (`book.astro:52`)
Current: label `DIY vs professional`, sends `Is professional cleaning better than a Rug Doctor hire?`
Proposed: label unchanged, sends `Is professional cleaning better than hiring a machine myself?`
Why: the chip puts a third-party brand name into the customer's mouth while the prompt tells the assistant never to use one (`chat.js:105`).

**B5. Chip: Stain advice** (`book.astro:53`)
Current: label `Stain advice`, sends `I have a red wine stain, can you help?`
Proposed: label unchanged, sends `Can you help with a stain on my carpet?`
Why: anyone with a pet, coffee or ink stain currently gets red-wine advice first and has to correct it.

**B6. Camera button tooltip** (`book.astro:56`)
Current: `Upload carpet photo`
Proposed: `Upload a photo of your carpet`
Why: the hidden file input already says this to screen readers (`book.astro:57`); sighted users should get the same words.

**B7. Text box placeholder** (`book.astro:58`)
Current: `Ask about quotes, carpet types, stains, or upload a photo...`
Proposed: `Ask about a quote, your carpet or a stain, or add a photo with the camera icon`
Why: tells people how to add the photo, which the current line mentions without saying where.

**B8. Photo preview caption** (`book.astro:64` and `book.astro:346`)
Current: `Image ready to send` (initial), then `{filename} - ready to send`
Proposed: `Photo ready to send`, then `{filename}, ready to send`
Why: the spaced hyphen is the pattern the house style bans, and "photo" is the word the button uses.

### C. During the conversation

**C1. First inactivity reminder** (`book.astro:195`)
Current: `Still there? No rush at all, happy to help whenever you're ready.`
Proposed: `Still there? No rush. I'm here whenever you're ready.`
Why: same warmth, two fewer filler words.

**C2. Second inactivity reminder** (`book.astro:198`)
Current: `Just checking in again. If now isn't a good moment, feel free to come back any time and we'll pick up from wherever you like.`
Proposed: `Just checking in again. If now isn't a good moment, that's fine. This chat stays open while the page is open, and you can start a fresh one whenever you like.`
Why: "we'll pick up from wherever you like" promises a memory the page does not have; the conversation is in memory only and a refresh starts from nothing.

**C3. Third reminder and the two end-of-chat placeholders** (`book.astro:201`, `205` and `186`)
Current: `I'll leave you to it for now. Come back any time you'd like a quote or to get booked in. You can also reach us directly on 01452 452356 or at hello@intelligentclean.co.uk. Take care!`; placeholder after inactivity `Chat session ended. Refresh the page to start a new conversation.`; placeholder after a goodbye `Chat ended [em dash] refresh the page to start a new conversation.`
Proposed: `I'll leave you to it for now. Come back any time for a quote or to book, or call us on 01452 452356 or email hello@intelligentclean.co.uk. Bye for now.`; one placeholder for both states: `This chat has ended. Refresh the page to start a new one.`
Why: two placeholders for one state (one with an em dash) become one, and the exclamation mark goes; whether this message should fire at all is S3.

**C4. Knowledge-source caption under a reply** (`book.astro:282`)
Current: `Based on ICC's expert guidance: {section titles}.`
Proposed: `From ICC's carpet care reference: {section titles}.`
Why: "expert" is a self-assessment the caption cannot prove; "reference" is the document's own title (`shared/config/knowledge.js:168`) and tells the customer where the answer came from.

**C5. Web-source caption** (`book.astro:304`)
Current: `Looked up on the web: {source titles}.`
Proposed: keep.
Why: plain, and honest about the source.

**C6. Holding line while the booking is written** (`book.astro:619`)
Current: `One moment, confirming your slot...`
Proposed: `One moment while I check the slot is still free and book it in.`
Why: names the two things actually happening in the pause (the availability re-check, then the write), so the customer knows why they are waiting.

### D. The booking outcome card

**D1. Card title** (`book.astro:480`)
Current: `Booking Confirmed` (on-time) and `Booking received` (provisional)
Proposed: `Booking confirmed` and `Booking received`
Why: the two states of one card should share a case, and sentence case is what the rest of the site's headings use.

**D2. Confirmed body line** (`book.astro:493`)
Current: `Your appointment is secured for **{date}** at **{time}**.` (where `{date}` is the raw ISO string from the booking payload, for example `2026-09-25`)
Proposed: `Your appointment is booked for **{readable date}** at **{time}**.` (for example `Friday 25 September 2026` at `09:30`)
Why: the customer is shown a machine date although the same function already formats a readable one for the slot-taken message (`book.astro:439`); "booked" also stops the line clashing with the deposit sentence below it (D9).

**D3. Emails-sent line** (`book.astro:503`)
Current: `Confirmation emails have been sent to **{email}** and to our team.`
Proposed: `We've emailed a confirmation to **{email}** and let Mark know. If you can't see it, check your junk folder.`
Why: names Mark, whom the customer has been talking about by name, and pre-empts the commonest "where's my email" call.

**D4. Confirmed, but an email failed** (`book.astro:501`)
Current: `Your booking is recorded. If you don't receive a confirmation, or don't hear from us shortly, please call us on 01452 452356.`
Proposed: `Your booking is saved, but we couldn't send all of the confirmation emails. Please call 01452 452356 to confirm it with us.`
Why: this branch fires when either the customer's or Mark's email failed, and a phone call is the one step that closes the loop for both, so ask for it plainly.

**D5. Provisional body line** (`book.astro:491`)
Current: `We've provisionally held **{date}** at **{time}** for you. As this clean would finish later in the afternoon, Mark will confirm the time with you personally and arrange your deposit. We've emailed you a summary.`
Proposed: same words, with the date formatted as in D2.
Why: the wording is owner-approved (D-027, 1 September 2026) and twins the email opener at `chat.js:1048`; only the raw date needs fixing.

**D6. Provisional, but an email failed** (`book.astro:490`)
Current: `We've provisionally held **{date}** at **{time}** for you. As this clean would finish later in the afternoon, it needs confirming before it's final. We'll be in touch shortly to confirm the time and arrange your deposit; if you don't hear from us soon, please call us on 01452 452356.`
Proposed: same words, date formatted as in D2.
Why: as D5.

**D7. Calendar button** (`book.astro:517`)
Current: `Add to My Calendar`
Proposed: `Add to my calendar`
Why: case only; the confirmation email carries the same button, so change both or neither.

**D8. Deposit button** (`book.astro:534`)
Current: `Pay your deposit securely`
Proposed: keep the label; add beneath it the line the email already shows: `Payment is handled securely by our payment provider. We never see your card details.`
Why: "securely" on its own is an assertion; the second sentence is the concrete fact behind it (Stripe's hosted Checkout page, D-004) and already exists at `shared/emailSnippets.js:36`, so the screen and the email say the same thing.

**D9. Card footer when the pay button is shown** (`book.astro:542`)
Current: `Pay your deposit of £X using the button above to secure your slot. Questions? Call 01452 452356.`
Proposed: `Your deposit is £X, which is 10% of the quote and is applied to your final bill. Please pay it now using the button above. Questions? Call 01452 452356.`
Why: the current line says the slot still needs securing directly under a heading that says it is confirmed; nothing in the system releases a slot for non-payment (checked: no expiry or release path reads `deposit_status`), so the line should ask for the deposit without contradicting the heading.
Decision for Ben and Mark: `policy.depositSentence()` frames the deposit as what secures the slot, and the email's `depositInstructionLine` (`shared/emailSnippets.js:58`) repeats "to secure your slot". Either the words move to match the mechanics (this proposal, on screen and in the email together) or the mechanics move to match the words (an unpaid-deposit release, which is a product change, not a copy one).

**D10. Card footer when there is no pay button** (`book.astro:543`)
Current: `Mark will be in touch to arrange your deposit of £X. Questions? Call 01452 452356.`
Proposed: `Mark will be in touch to arrange your deposit of £X (10% of the quote, applied to your final bill). Questions? Call 01452 452356.`
Why: adds what the deposit is, in the policy's own words, while keeping the phrase the parity test pins.

### E. When something goes wrong (strings in the page)

**E1. Slot taken between the quote and the write** (`book.astro:439`)
Current: `Sorry, that time has just been taken by another booking. The remaining available times for {date} are: {list}. Which would you prefer?`
Proposed, when other starts remain: `Sorry, that time has just been taken. On {date} you could still start at {09:30, 10:30 or 11:30}. Which would you prefer?`
Proposed, when none remain: `Sorry, that time has just been taken and nothing else is free on {date}. Tell me another date and I'll check it.`
Why: the current string renders "are: ." on a full day, and a bare list of times does not read as an offer.

**E2. The server refused the booking** (`book.astro:451`)
Current: `Sorry - {server message} Please choose another time.`
Proposed: when the server message already tells the customer what to do (the slot-taken and couldn't-confirm replies at F10 and F11), show it on its own; otherwise: `Sorry, I couldn't complete the booking: {server message}. Tell me the correct details and I'll try again, or call 01452 452356.`
Why: "Please choose another time" is the wrong instruction for a rejected email address or phone number, the spaced hyphen is banned house-wide, and the slot-taken case currently says "Please choose another time" twice in one bubble. Depends on the server strings at F being readable.
One more condition, found by the v1 review and confirmed here: when the email send throws, `chat.js:1164` to `1168` returns `success: true` together with `error: err.message`, and the client tests `error` first (`book.astro:450`), so a booking that is already saved and holding its slot is announced as a failure with a raw error in it. Whatever wording E2 takes, the client has to check `success` and `emailStatus` before `error` (or the server drops the `error` key, since `emailStatus` already carries the failure), otherwise D4 is unreachable on that path.

**E3. The booking request itself failed** (`book.astro:555`)
Current: `I have all your details noted. Please call 01452 452356 or email hello@intelligentclean.co.uk to confirm your booking.`
Proposed: `Something went wrong while I was confirming your booking, so it may not have gone through. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll book it for you.`
Why: "I have all your details noted" claims a record that may not exist after a failed request.

**E4. The booking block would not parse** (`book.astro:627`)
Current: `Sorry, I couldn't finish confirming that automatically. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll get your booking sorted straight away.`
Proposed: `Sorry, I couldn't finish confirming that automatically. Please call 01452 452356 or email hello@intelligentclean.co.uk and a person will book it in for you.`
Why: "straight away" promises a response time nobody has committed to; the first sentence stays because a test pins it.

**E5. The chat request returned an error message** (`book.astro:638`)
Current: `Sorry, {server message} If this persists, please call 01452 452356 or email hello@intelligentclean.co.uk.`
Proposed: when the server message already says what to do (the rate-limit reply, F1), show it on its own; otherwise: `Sorry, something went wrong on our side ({server message}). Please try again in a moment, or call 01452 452356 or email hello@intelligentclean.co.uk.`
Why: the rate-limit reply currently tells the customer to call the same number twice in one bubble, and raw server text lands mid-sentence with no full stop; the brackets keep the detail visible for diagnosis, which the code comment asks for.

**E6. The chat request failed with a status but no message** (`book.astro:640`)
Current: `Sorry, the chat service returned an error (status {code}). Please try again or call 01452 452356.`
Proposed: `Sorry, the assistant isn't responding right now (error {code}). Please try again in a moment, or call 01452 452356.`
Why: "the chat service returned an error" is developer phrasing.

**E7. Empty reply** (`book.astro:642`)
Current: `I apologise, I encountered an issue. Please try again or contact us directly on 01452 452356.`
Proposed: `Sorry, that didn't go through. Please try again, or call us on 01452 452356.`
Why: shorter and human; "I encountered an issue" is the register the prompt tells the assistant to avoid.

**E8. No connection** (`book.astro:646`)
Current: `I am unable to connect at the moment. Please try again shortly or contact us directly.`
Proposed: `I can't connect at the moment. Please check your connection and try again, or call us on 01452 452356.`
Why: "contact us directly" gives no number in the one message where the customer most needs it in front of them.

### F. Server strings the page renders

These are returned by the functions and shown inside the bubbles at E2 and E5, so they are customer-facing even though they live in `server/`. A customer only meets F3 to F9 if the assistant emits a booking the server rejects, which the pre-computed date list and the offered start times make rare; they still need to read as sentences when they do.

**F1. Rate limit** (`server/netlify/functions/rateLimit.js:29`)
Current: `Too many requests. Please wait a little and try again, or call us on 01452 452356.`
Proposed: keep.
Why: already tells the customer what to do; E5 stops the page repeating the number after it.

**F2. Upstream failure** (`chat.js:382`)
Current: `Failed to contact Anthropic API`
Proposed: `we couldn't reach the assistant service`
Why: a vendor name and "API" mean nothing to a customer; the `detail` field and the console keep the diagnosis.

**F3. Date too soon** (`chat.js:687`)
Current: `Date too soon [em dash] minimum 7 days notice`
Proposed: `that date is too soon (we need at least 7 days' notice)`
Why: em dash, and it reads as a system flag; the check itself passes six days (`daysOut < 6`), presumably slack for timezones, so the sentence keeps the seven the date list is built on.

**F4. Date too far** (`chat.js:688`)
Current: `Date too far ahead`
Proposed: `that date is further ahead than we book at the moment (we offer dates up to about eight weeks out)`
Why: says what the limit is in the customer's terms: the assistant is given 48 Monday-to-Saturday dates from seven days out (`chat.js:280` to `284`), roughly eight weeks, and the 90-day figure at `chat.js:688` is the server backstop behind it.

**F5. Sunday** (`chat.js:692`)
Current: `Sundays are not bookable`
Proposed: `we don't work on Sundays, so that date isn't available`
Why: gives the reason a person would give.

**F6. Start time** (`chat.js:697` and `699`)
Current: `Invalid start_time`
Proposed: `that start time isn't one we offer on that day`
Why: `start_time` is a field name.

**F7. Name, phone, email, address** (`chat.js:674` to `677`)
Current: `Invalid name`, `Invalid phone`, `Invalid email`, `Invalid address`
Proposed: `that name doesn't look right`, `that phone number doesn't look right`, `that email address doesn't look right`, `that address doesn't look right`
Why: E2 then reads "I couldn't complete the booking: that email address doesn't look right. Tell me the correct details and I'll try again", which is a sentence the customer can act on.

**F8. Price bounds** (`chat.js:711` and `712`)
Current: `Estimated price below minimum` and `Estimated price unrealistically high`
Proposed, both: `the quote didn't pass our price check, so I can't book it automatically`
Why: the customer cannot fix a price; the line should route them to the phone number E2 supplies.

**F9. Photo** (`chat.js:718` and `720`)
Current: `Image too large (max ~3MB)` and `Unsupported image type`
Proposed: `the photo is too large (3MB is the limit)` and `that photo format isn't supported (JPEG, PNG, WebP or GIF work)`
Why: plain words, and the accepted formats come from `okTypes` at `chat.js:719`.

**F10. Slot taken at the write** (`chat.js:856` and `882`)
Current: `Time slot no longer available. Please choose another time.`
Proposed: keep.
Why: complete as it stands once E2 stops appending to it.

**F11. Store write failed** (`chat.js:863`)
Current: `We couldn't confirm your booking just now. Please call 01452 452356 to book.`
Proposed: keep.
Why: as F10.

**F12. Origin refused** (`server/netlify/functions/origins.js:107`)
Current: `Forbidden origin`
Proposed: leave.
Why: only a request from a hostile origin receives it; a customer on the site never does.

**F13. Misconfiguration and malformed requests** (`chat.js:232` and `239`)
Current: `Anthropic API key not configured` and `Invalid JSON`
Proposed: leave.
Why: reachable only on a misconfigured deploy or a hand-built request, and E5's wrapper carries the customer-facing sentence around them.

### G. Lines the assistant is scripted to say

**G1. Oversize job** (`chat.js:144`)
Current: `That's a larger job than we can fit into a single visit. I'll pass your details to Mark, who'll be in touch to arrange it across two days at a time that suits you.`
Proposed: keep.
Why: owner-approved wording (D-029), pinned by `test/bookings-chat.test.js:130`, and "two days" is Mark's stated intent.

**G2. Deposit and cancellation sentence** (`shared/config/policy.js`, `depositSentence()`)
Proposed: keep.
Why: terms wording, single-sourced to `/terms` and the confirmation email (D-031) and accepted by the owner without solicitor review (D-035); rewording it would change the terms, which is outside a copy review.

**G3. Re-clean sentence** (`shared/config/policy.js`, `reCleanSentence()`)
Proposed: keep.
Why: as G2.

**G4. The order the booking script asks its questions in** (`chat.js:129` to `140`)
Current: 1 full name, 2 phone, 3 email, 4 full address with postcode, 5 rooms and sizes, 6 carpet type, 7 staining or concerns, 8 furniture moving, 9 pets, 10 date, 11 start time; then duration, price and deposit; then "shall I proceed".
Proposed: 1 rooms and approximate sizes, 2 carpet type if known, 3 staining or concerns, 4 furniture moving, 5 pets, 6 town or postcode (so the out-of-area surcharge is in the quote from the start); then duration, price and deposit, and ask whether they would like to book it; then 7 full name, 8 phone, 9 email, 10 full address with postcode, 11 date, 12 start time; then confirm.
Why: the quote is what the visitor came for and today it sits behind four pieces of personal data (S2); asking for contact details after the customer has said yes to the price removes the largest ask from the front of the path. This is a prompt change in `chat.js`, which re-warms the prompt cache once (L-002), and the consultation section already has the assistant asking about carpets and DIY history first, so the earlier questions are where the conversation naturally starts anyway.

## 3. Claims audit

Run with `substantiate-outward-claims`. "Kept" means the repo backs the phrase; "cut" means it does not, and the proposal drops or replaces it.

| Phrase | Where | Verdict | Basis |
|---|---|---|---|
| "instant" quote | A2 current, A4 current | Cut | The script asks up to eleven questions before pricing; the contact page itself says "a few minutes". |
| "fully-explained quote" | A2 current | Softened to "with the reasoning behind it" | The prompt's consultation section instructs the assistant to explain its method and price; it describes what the assistant is instructed to do and promises nothing beyond that. |
| "expert carpet advice" | A2 current | Cut "expert" | Self-assessment; nothing in the repo is an independent measure of expertise. |
| "Our AI knows carpets inside out" | A4 current | Cut | Puffery. Replaced with two facts the code backs. |
| "working from ICC's own carpet care reference" | A4 proposed | Kept | The citeable document built by `knowledgeDocument()` in `shared/config/knowledge.js`, rendered as the captions at C4. |
| "hands over to Mark when a question needs a person" | A4 proposed | Kept | The `escalate_to_human` tool in `chat.js` and the handoff queue in `handoffs.js`. |
| "Online" | A6 current | Cut | Static markup; not a measured state. |
| "ICC's expert guidance" | C4 current | Cut "expert" | As above; "reference" is the document's title. |
| "we'll pick up from wherever you like" | C2 current | Cut | The conversation is in memory only. |
| "secured" | D2 current | Replaced with "booked" | The `jobs` row and its exclusion constraint hold the slot at confirm; "secured" clashes with the deposit line. |
| "recommend a method, price the job line by line" | A4 proposed | Kept | The consultation section of the prompt, the `recommended_method` field and the itemised `quote_lines` the server re-prices (`chat.js`, `shared/config/pricing.js`). |
| "Confirmation emails have been sent" / "let Mark know" | D3 | Kept | Shown only when `emailStatus` reports both sends succeeded; the operator copy goes to `OPERATOR_EMAIL`, which is Mark's address in the live environment (the D-027 ride confirmed delivery). |
| "Your booking is saved" | D4 proposed | Kept | The store write happens before any email and the card only renders on a non-error response (`handleBooking`, fail-closed). |
| "Mark will confirm the time with you personally" | D5 | Kept | D-027: Mark accepts or declines from his email and the customer is notified. |
| "Pay your deposit securely" | D8 | Kept, with the concrete line beneath | Stripe's hosted Checkout page (`paymentProvider.js:12`); D-004, no card data stored locally. |
| "We never see your card details" | D8 proposed | Kept | Same basis; the sentence already ships in the email. |
| "10% of the quote, applied to your final bill" | D9, D10 proposed | Kept | `deposit_rate` in `shared/config/pricing.js` and `policy.depositSentence()`. |
| "to secure your slot" | D9 current | Flagged, decision needed | Matches the policy sentence, contradicts the card heading, and no release mechanism exists. See D9. |
| "we'll get your booking sorted straight away" | E4 current | Cut "straight away" | No response-time commitment exists anywhere in the repo. |
| "I have all your details noted" | E3 current | Cut | May be false after a failed request. |
| "Cheltenham, Gloucester and Gloucestershire" | A2 proposed | Kept | `shared/config/serviceArea.js`. |
| "with the method confirmed on the day" | A4 proposed | Kept | The wording the September pass put on the home, services and terms pages (`docs/MARKETABILITY_REVIEW_2026-09.md`, A4; `site/src/pages/services.astro:136`). |
| "up to about eight weeks out" | F4 proposed | Kept | The 48-date, 60-day window at `chat.js:280` to `284`. |
| "across two days" | G1 | Kept | D-029, owner-approved. |
| Payment provider named as Stripe | not proposed | Withheld | The privacy notice does not list a payment processor; say "our payment provider" until it does (section 5). |

No statistics, testimonials, review counts or manufacturer figures are proposed anywhere on the page. The manufacturer's drying and water figures stay inside the assistant's reference, attributed, as the L-009 guardrails require.

## 4. Couplings for whoever applies this

- **`index.html` twin (D-034).** The root `index.html` is the retained rollback. `test/chat-client-parity.test.js` holds the `BOOKING_READY` extractor byte-identical between the two files and pins several `book.astro` strings by regex. Any string change here is applied to both files, and the regexes move with them.
- **Strings pinned by tests.** `Pay your deposit securely` and `Mark will be in touch to arrange your deposit` (`test/chat-client-parity.test.js:105` and `106`); `provisionally held` (`test/chat-client-parity.test.js:78`); `Based on ICC's expert guidance` (`test/chat-client-parity.test.js:68`); `couldn't finish confirming` (`test/booking-ready-parse.test.js:143`); `across two days` (`test/bookings-chat.test.js:130`). D5, D6, D8, D10 and E4 keep their pinned phrases; C4 changes one and its test line moves with it.
- **The deposit figure on the card.** `booking.deposit` on screen is whatever the model put in its `BOOKING_READY` payload; the server recomputes the figure of record from the quote lines (`chat.js:808` to `811`) and uses that for the emails and the Stripe link, but the confirm response (`chat.js:1150` to `1160`) does not return it. D9 and D10 should render the server's figure, which means returning it. Found by the v1 review (its B-3); confirmed here.
- **The email-throw response.** See the condition under E2: `success: true` with an `error` key (`chat.js:1168`) is read by the client as a refusal.
- **Email twins.** The provisional wording (D5, D6) mirrors `customerOpener` at `chat.js:1048`; the deposit footer (D9, D10) mirrors `depositInstructionLine` at `shared/emailSnippets.js:56` to `59`; the card title (D1) sits beside the email header at `chat.js:1047`; the calendar button (D7) appears in both. The customer email also prints the raw ISO date, so the D2 fix belongs there too.
- **Not string swaps.** E1 (an empty-list branch), E2 and E5 (show-as-is versus wrap), D2, D5 and D6 (date formatting, reuse the `readableDate` expression at `book.astro:439`), S3 (the inactivity lock), S4 (the status dot) and S9 (button order) are small code changes.
- **Prompt changes.** G4 and the F strings live in `chat.js`; changing the static prompt re-warms the cache once (L-002) and costs nothing after that.

## 5. Noticed on the way, out of scope

- `CLAUDE.md`'s continuity section still gives Mark's phone as 01242 279590; D-030 moved every ICC surface to 01452 452356 on 5 September 2026 and the page is correct. A one-line doc fix.
- The privacy notice (`site/src/pages/privacy.astro`) does not list a payment processor, and the Stripe Test-mode deposit link has been live since 8 September 2026 (D-036). Worth adding before the pay button meets real customers; until then the page should say "our payment provider", as proposed.
- The hidden text sent with a photo-only message (`sendMessage` in `book.astro`, beginning "Please look at this photo of my carpet") is never shown to the customer and is left alone.

## 6. Differences from the v1 review of the same date

`docs/BOOKING_PAGE_COPY_REVIEW_2026-09-14.md` (v1, 718 lines, in the main checkout and untracked) was read after sections 1 to 5 were written. The two reviews agree on most of the page: the header overclaims, the message mismatch with the inbound links, the two welcomes, the brand name in a chip, the raw ISO date, the em dashes and spaced hyphens, the wrapper that appends "Please choose another time" to every server error, the vendor names in customer-visible errors, "straight away", "pick up from wherever you like", "I have all your details noted", and the unified "chat has ended" placeholder. Where they differ in substance:

1. **The booking script is in scope here and out of scope there.** v1 declared the system prompt out of scope except to check that page copy and assistant behaviour agree. v2 reviews the lines the assistant is scripted to say (G1 to G4) and makes the order of the booking questions its second-highest finding (S2, G4): the price should come before the four contact fields. v1's nearest item accepts the eleven-question order and proposes telling visitors what to have ready.

2. **The "secured" versus "to secure your slot" clash is resolved in opposite directions.** Both reviews spot that the card heading says the booking is confirmed while its footer says the deposit secures the slot. v1 changes "secured" to "booked" and keeps "to secure your slot" as a tidy, on the strength of the policy sentence. v2 checked the mechanics (no expiry or release path reads `deposit_status`), so it proposes moving the footer instead and hands the choice to Ben and Mark as a words-or-mechanics decision (D9), with the email's `depositInstructionLine` changing in step.

3. **"Instant".** v1 keeps it (a capability, and the word on every inbound link). v2 cuts it from the page's own lines because this page is where the claim meets an eleven-question script, while flagging that the inbound buttons still say it, so the decision is site-wide (A2).

4. **Two behaviour findings v1 made and v2 initially missed.** Both were re-derived from the source before being adopted here: a saved booking announced as a failure when the email send throws (v1's B-1, now the second condition under E2 and in section 4), and the on-screen deposit figure being the model's rather than the server's (v1's B-3, now in section 4). v1 also grades B-1 as High and suggests a LESSONS_LEARNED entry beside L-029; v2 agrees.

5. **Structural proposals that only one review makes.** v2 only: drop the third-strike inactivity lock (S3), add the `/terms` link beside the privacy notice (S5), and align the sub-heading and the "Identify my carpet" chip with the September marketability remediation (A4, B3). v1 only: move the privacy sentence up under the input on mobile, style "Get a quote" as the single primary button, an optional "Monday to Saturday, 10% deposit" line under the header, and four A/B test ideas. v2 left test ideas out deliberately: the site is pre-launch with no traffic to test on.

6. **How the server validation strings are handled.** v1 keeps them technical on the server, where they are logged, and proposes one client-side sentence that maps a field name to plain words. v2 rewrites the strings themselves (F3 to F9) so the same text serves the log and the customer. Either works; v1's keeps the log more precise, v2's has fewer moving parts.

7. **Smaller disagreements.** v1 retitles the page "Get a Quote and Book"; v2 keeps "Book a Carpet Clean". v1 keeps "ICC Assistant"; v2 makes it "ICC booking assistant" to match the welcome. v1 softens the knowledge caption to "ICC's own guidance"; v2 makes it "ICC's carpet care reference", the document's own title. v1 rewrites the rate-limit sentence; v2 keeps it. v1 rewords the hidden photo-only message to "likely to be"; v2 leaves it because no customer sees it.

8. **Rigour and process.** v1 carries a citation table quoting every referenced line and records that the three project skills could not be loaded through the Skill tool in that session, so they were applied from their files on disk. v2 verified each `file:line` with `grep -n` but does not tabulate the quoted lines, and all three project skills loaded through the Skill tool in this session (the L-039 condition no longer applied).
