# Booking page copy review, 14 September 2026

Reviewed on 14 September 2026 by Claude (agent), directed by Ben. The scope is the
customer-facing copy of `/book` (`site/src/pages/book.astro`), including the chat-flow
strings the page builds at runtime (welcome, inactivity reminders, the booking outcome
card, the failure messages) and the server strings the page prints verbatim inside those
messages (`server/netlify/functions/chat.js`, `rateLimit.js`, `origins.js`). The
assistant's generated replies are out of scope; the system prompt was read only to check
that page copy and assistant behaviour agree.

This is a read-only review. Nothing on the page was edited and nothing was committed. Each
element below gives the current text, a proposed text and one line of why. Where the right
answer is "leave it", it says so. Behaviour defects found on the way (they are copy paths,
so they surfaced here) are listed separately in Part D; none were fixed.

The constraints were: no new claims about the business, no statistics, no testimonials.
Every phrase that reads as a claim, in the current copy or the proposed copy, is in the
claims register (Part C) with its repo source; anything that could not be substantiated
from the repo is cut. British English, sentence case for buttons, no em dashes. The phone
number and email address are the ones already on the page and across the site; they are
carried over verbatim and are not placeholders.

Method: copy-editing (seven sweeps: clarity, voice, so-what, prove-it, specificity,
emotion, zero-risk) over every string; cro (value proposition, headline, CTA hierarchy,
trust, objections, friction, plus `references/form.md` for the input area) over the page
structure and the path from first message to confirmed booking; copywriting for the
headline and CTA alternatives. The three project skills were applied from their SKILL.md
text on disk because the Skill tool could not load project-level skills in this session
(the session was keyed to the Desktop stub, not the repo). `substantiate-outward-claims`,
`verified-citations` and `unslop-text` were invoked through the Skill tool.

Notation: where current text contains U+2014 it is shown as `[em dash]`, so this file
ships none. `{date}`, `{time}`, `{email}`, `{X}` and `{list}` are runtime values.

## Summary

Three changes matter more than the rest.

1. **The header overclaims.** "Our AI knows carpets inside out" (E-04) is the class of
   AI-capability claim the September marketability review cut from the other six page types
   (`docs/MARKETABILITY_REVIEW_2026-09.md:14-20`); `/book` was not in that pass. It also
   contradicts the assistant's own rule to hand over anything its reference does not cover
   (`shared/config/knowledge.js:144`). Cut it, and drop "expert" from the meta description.
2. **The failure and error paths speak engineer.** The page prints server strings verbatim
   inside a wrapper, so a customer can be shown "Sorry - Invalid slots_needed Please choose
   another time." or "Sorry, Anthropic API key not configured If this persists..." (E-31,
   E-33, F-01 to F-08). One of those paths tells a customer whose booking has already been
   saved to choose another time (Part D, B-1).
3. **The heading does not match the click that brought people here.** Seven inbound links
   promise a quote; the page greets them with "AI Cleaning Assistant" (E-03).

## Part A: copy, element by element

### A. Page chrome

**E-01 Page title** (`site/src/pages/book.astro:20`)
- Current: "Book a Carpet Clean | Intelligent Carpet Cleaning"
- Proposed: Get a Quote and Book | Intelligent Carpet Cleaning
- Why: seven of the nine links into this page promise a quote (the nav CTA and the
  services, areas, guides, history, about and contact pages), so the tab title should
  confirm they have landed on it.

**E-02 Meta description** (`book.astro:21`)
- Current: "Chat with our AI assistant for an instant, fully-explained quote, expert carpet
  advice, and booking across Cheltenham and Gloucestershire."
- Proposed: Chat with our AI assistant for an instant itemised quote, carpet and stain
  advice, and a booking, across Cheltenham and Gloucestershire.
- Why: "expert" is an unattributed quality claim (register C3); "itemised" is what the
  quote actually is (`chat.js:150`, `services.astro:136`) and "fully-explained" takes no
  hyphen.

**E-03 Heading** (`book.astro:25`)
- Current: "AI Cleaning Assistant"
- Proposed: Get a quote and book your clean
- Why: the heading should name the outcome the inbound link promised; the AI is named in
  the line beneath it.
- Alternatives: "Your quote and booking, in one chat" (keeps the differentiator without the
  label); "Chat with our AI assistant" (word-for-word match for the home-page button,
  `index.astro:38`).

**E-04 Sub-line** (`book.astro:26`)
- Current: "Instant quotes, carpet advice, stain guidance, and booking. Our AI knows
  carpets inside out."
- Proposed: An itemised quote, carpet and stain advice, and your booking, in one chat. Your
  carpet and the method are confirmed on the day.
- Why: "knows carpets inside out" is the capability overclaim removed everywhere else in
  September and contradicts the hand-over rule; the second sentence states the human check
  the rest of the site already promises (`index.astro:74`, `services.astro:136`).

**E-05 Chat window name** (`book.astro:33`)
- Current: "ICC Assistant"
- Proposed: keep.
- Why: short, and close enough to how the assistant describes itself when asked
  (`chat.js:54`).

**E-06 Chat window status line** (`book.astro:34`)
- Current: "Online [em dash] Intelligent Carpet Cleaning", with a green dot in front of it.
- Proposed: AI assistant for Intelligent Carpet Cleaning
- Why: nothing on the page checks a status, and a green dot beside "Online" reads as a person
  at a keyboard; say what it is and lose the em dash (the dot is CSS, see Part B, item 4).

### B. Welcome and starting prompts

**E-07 and E-08 Welcome message** (`book.astro:44` is the HTML fallback; `book.astro:149` and
`:152` are the script that overwrites it and is what customers normally see)
- Current (HTML): "Hello and welcome to Intelligent Carpet Cleaning. I am here to help you
  with quotes, carpet advice, stain guidance, and booking."
- Current (script): "Hi, welcome to Intelligent Carpet Cleaning. I'm the booking assistant,
  here to help you with quotes, carpet advice, stain guidance, and booking." then "To get
  started, could you tell me about your carpet and what you need? For example, the room
  type, approximate size, and any concerns such as staining or heavy soiling."
- Proposed (one text, used in both places): Hi, I'm the Intelligent Carpet Cleaning booking
  assistant. I can quote for your clean, advise on your carpet or a stain, and book you in.
  (paragraph break) To start, tell me which rooms you'd like cleaned, roughly how big they
  are, and anything you're concerned about, such as staining or heavy soiling. You can also
  send a photo with the camera button.
- Why: two versions of one message in two voices; the "quotes, carpet advice, stain
  guidance, and booking" list already appears in the header and the placeholder; and the
  photo route is otherwise only a tooltip.

**E-09 Suggestion chips** (`book.astro:50-53`; each chip has a label and the message it sends
as the customer's own words)
- Current: "Get a quote" sends "I need a quote for my lounge carpet".
  Proposed: same label; sends: I'd like a quote for cleaning my carpets.
  Why: the sent text appears in the chat as the customer's message; don't assign them a room.
- Current: "Identify my carpet" sends "How do I identify what type of carpet I have?".
  Proposed label: What carpet do I have? Sends: How can I tell what type of carpet I have?
  Why: "identify" is the word the September pass softened to a likely assessment confirmed on
  the day; a question in the customer's voice sets that expectation.
- Current: "DIY vs professional" sends "Is professional cleaning better than a Rug Doctor
  hire?".
  Proposed: same label; sends: Is professional cleaning better than hiring a machine and
  doing it myself?
  Why: the site's own DIY guide makes the comparison without naming a competitor's brand,
  and the September pass removed competitor references elsewhere.
- Current: "Stain advice" sends "I have a red wine stain, can you help?".
  Proposed: same label; sends: I have a stain on my carpet. Can you help?
  Why: as the first chip; the assistant asks what the stain is anyway.

**E-10 Input placeholder** (`book.astro:58`)
- Current: "Ask about quotes, carpet types, stains, or upload a photo..."
- Proposed: Ask about a quote, your carpet or a stain, or send a photo
- Why: matches the reworded header and drops the trailing ellipsis; a minor change.

**E-11 Photo upload affordances** (`book.astro:56`, `:57`, `:64`, `:346`)
- Current: tooltip "Upload carpet photo"; screen-reader label "Upload a photo of your carpet";
  preview "Image ready to send" and "{file} - ready to send".
- Proposed: keep the first three; the last becomes: {file}, ready to send
- Why: fine as they are; the spaced hyphen is the one pattern the assistant is told never to
  use (`chat.js:63`), so the page should not use it either.

**E-12 Default message sent with a photo-only upload** (`book.astro:578`; sent to the
assistant, not shown to the customer)
- Current: "Please look at this photo of my carpet and tell me what type it is, what
  condition it is in, and what cleaning method you would recommend."
- Proposed: Please look at this photo of my carpet and tell me what type it is likely to be,
  what condition it looks to be in, and which cleaning method you would suggest.
- Why: not displayed, but it invites a definitive identification the site elsewhere frames
  as a likely assessment confirmed on the day.

### C. Mid-conversation system messages

**E-13 First inactivity reminder** (`book.astro:195`)
- Current: "Still there? No rush at all, happy to help whenever you're ready."
- Proposed: Still there? No rush. I'm here whenever you're ready.
- Why: same warmth, less padding.

**E-14 Second inactivity reminder** (`book.astro:198`)
- Current: "Just checking in again. If now isn't a good moment, feel free to come back any
  time and we'll pick up from wherever you like."
- Proposed: Just checking in. If now isn't a good moment, come back whenever suits you and we
  can start again.
- Why: the page does not keep the conversation (a refresh starts a fresh one,
  `book.astro:179-180`), so "pick up from wherever you like" promises a resume that does
  not exist.

**E-15 Final inactivity message** (`book.astro:201`)
- Current: "I'll leave you to it for now. Come back any time you'd like a quote or to get
  booked in. You can also reach us directly on 01452 452356 or at
  hello@intelligentclean.co.uk. Take care!"
- Proposed: I'll leave you to it for now. Come back any time for a quote or to book. You can
  also call 01452 452356 or email hello@intelligentclean.co.uk.
- Why: drop the exclamation mark and the sign-off; the contact details are the message.

**E-16 "Chat ended" input placeholder** (`book.astro:186` and `:205`, two strings for one
state)
- Current: "Chat ended [em dash] refresh the page to start a new conversation." and "Chat
  session ended. Refresh the page to start a new conversation."
- Proposed (both): This chat has ended. Refresh the page to start a new one.
- Why: one state, two strings, one of them with an em dash; make it one constant.

**E-17 Confirming interstitial** (`book.astro:619`)
- Current: "One moment, confirming your slot..."
- Proposed: One moment, checking that slot is still free and booking it in.
- Why: that is what the next two calls do, and it prepares the customer for the "just been
  taken" branch if it fires.

**E-18 Source caption for knowledge-base answers** (`book.astro:282`; pinned by
`test/chat-client-parity.test.js:68` and mirrored in `index.html`)
- Current: "Based on ICC's expert guidance: {titles}."
- Proposed: Based on ICC's own guidance: {titles}.
- Why: the caption's job is provenance, and "own" says whose it is more precisely than an
  adjective does (register C6); change the test and `index.html` in the same commit.

**E-19 Source caption for web look-ups** (`book.astro:304`)
- Current: "Looked up on the web: {titles}."
- Proposed: keep.
- Why: accurate and plain.

### D. Booking outcome card

**E-20 Card titles** (`book.astro:480`)
- Current: "Booking received" (provisional) and "Booking Confirmed" (auto-confirmed).
- Proposed: Booking received / Booking confirmed
- Why: one capitalisation style.

**E-21 Confirmed body, first line** (`book.astro:493-497`)
- Current: "Your appointment is secured for {date} at {time}." where {date} is the raw
  YYYY-MM-DD value.
- Proposed: We've booked {readable date} at {time} for you.
- Why: the same card then says to pay the deposit "to secure your slot" (E-28), and the
  policy says the deposit secures it (`shared/config/policy.js:26`), so "secured" contradicts
  the next line; the readable date format already exists at `book.astro:439`.

**E-22 Confirmed body, emails line** (`book.astro:503-505`)
- Current: "Confirmation emails have been sent to {email} and to our team."
- Proposed: We've emailed a confirmation to {email} and to Mark.
- Why: Mark is a sole operator and the site says "local specialist" for that reason
  (`DECISIONS.md:148`); the card names him two lines later anyway.

**E-23 Confirmed body when an email failed to send** (`book.astro:501`)
- Current: "Your booking is recorded. If you don't receive a confirmation, or don't hear from
  us shortly, please call us on 01452 452356."
- Proposed: keep, with one tidy: Your booking is recorded. If a confirmation email doesn't
  arrive, or you don't hear from us shortly, please call 01452 452356.
- Why: it hedges both failure cases honestly (customer email, operator email, or both), which
  is right because the client cannot tell them apart.

**E-24 Provisional body** (`book.astro:485-491`, the emails-sent branch; "provisionally
held" is pinned by `test/chat-client-parity.test.js:78`)
- Current: "We've provisionally held {date} at {time} for you. As this clean would finish
  later in the afternoon, Mark will confirm the time with you personally and arrange your
  deposit. We've emailed you a summary."
- Proposed: We've provisionally held {readable date} at {time} for you. Because this clean
  would finish later in the afternoon, Mark will confirm the time with you and arrange your
  deposit. We've emailed you a summary.
- Why: "personally" is filler, "As" reads as "while"; keep "provisionally held" and use the
  readable date as in E-21.

**E-25 Provisional body when an email failed to send** (`book.astro:490`)
- Current: "... for you. As this clean would finish later in the afternoon, it needs
  confirming before it's final. We'll be in touch shortly to confirm the time and arrange
  your deposit; if you don't hear from us soon, please call us on 01452 452356."
- Proposed: ... for you. Because this clean would finish later in the afternoon, Mark needs to
  confirm the time before it's final. We'll be in touch to confirm it and arrange your
  deposit; if you don't hear from us soon, please call 01452 452356.
- Why: says who confirms; the "we'll be in touch" promise depends on Mark seeing the held
  booking in the admin when his email failed, so the "please call" fallback stays.

**E-26 Calendar button** (`book.astro:517`)
- Current: "Add to My Calendar"
- Proposed: Add to my calendar
- Why: sentence case, like the pay button beside it.

**E-27 Pay button** (`book.astro:534`; pinned by `test/chat-client-parity.test.js:105` and
the same string in the email, `shared/emailSnippets.js:35`)
- Current: "Pay your deposit securely"
- Proposed: keep.
- Why: substantiated (register C11) and identical in the email, which is the point of it.

**E-28 Card footer when a pay link exists** (`book.astro:542`)
- Current: "Pay your deposit of {X} using the button above to secure your slot. Questions?
  Call 01452 452356."
- Proposed: Pay your {X} deposit with the button above to secure your slot. Questions? Call
  01452 452356.
- Why: a tidy only; where {X} comes from is a behaviour finding (Part D, B-3).

**E-29 Card footer with no pay link** (`book.astro:543`; pinned by
`test/chat-client-parity.test.js:106`)
- Current: "Mark will be in touch to arrange your deposit of {X}. Questions? Call 01452
  452356."
- Proposed: keep.
- Why: mirrors the email's fallback line (`shared/emailSnippets.js:59`) by design.

**E-30 Slot taken between quote and confirm** (`book.astro:439`)
- Current: "Sorry, that time has just been taken by another booking. The remaining available
  times for {date} are: {list}. Which would you prefer?"
- Proposed: Sorry, that time has just been taken by another booking. On {date} you could
  still have {list}. Which would you prefer? And when {list} is empty: Sorry, that time has
  just been taken by another booking and nothing else is free on {date}. Would you like to
  try another day?
- Why: with no times left the current line renders "are: . Which would you prefer?".

**E-31 Wrapper around a server booking error** (`book.astro:451`)
- Current: "Sorry - {server message} Please choose another time."
- Proposed: Sorry, {server message} (each server message says what to do next; see Part F).
- Why: every server string already ends with an instruction, so the wrapper repeats "Please
  choose another time" after itself and contradicts "please call ... to book"; the spaced
  hyphen is the pattern the assistant is banned from using (`chat.js:63`).

**E-32 Booking call threw** (`book.astro:555`)
- Current: "I have all your details noted. Please call 01452 452356 or email
  hello@intelligentclean.co.uk to confirm your booking."
- Proposed: Something went wrong while I was booking that slot, so I can't tell whether it
  went through. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll
  check and finish your booking.
- Why: nothing is saved before the confirm call succeeds, so "noted" claims a record that may
  not exist; the honest state is "unknown".

### E. Chat failure messages (client)

**E-33 Wrapper around a server chat error** (`book.astro:638`)
- Current: "Sorry, {server error} If this persists, please call 01452 452356 or email
  hello@intelligentclean.co.uk."
- Proposed: for a server message that carries its own instruction (F-01): Sorry, {message}.
  For a technical one (F-08): Sorry, the assistant isn't available right now. Please try
  again in a moment, or call 01452 452356 or email hello@intelligentclean.co.uk. (Error
  {short code})
- Why: today it prints vendor and configuration text to customers and repeats the phone
  number straight after the rate-limit message; the bracketed code keeps the diagnostic value
  the code comment asks for (`book.astro:636-637`).

**E-34 Non-JSON error status** (`book.astro:640`)
- Current: "Sorry, the chat service returned an error (status {n}). Please try again or call
  01452 452356."
- Proposed: Sorry, something went wrong on our side (error {n}). Please try again, or call
  01452 452356.
- Why: "the chat service returned" is developer phrasing.

**E-35 Empty response** (`book.astro:642`)
- Current: "I apologise, I encountered an issue. Please try again or contact us directly on
  01452 452356."
- Proposed: Sorry, something went wrong. Please try again, or call 01452 452356.
- Why: "I encountered an issue" is assistant boilerplate.

**E-36 Network failure** (`book.astro:646`)
- Current: "I am unable to connect at the moment. Please try again shortly or contact us
  directly."
- Proposed: I can't connect right now. Please try again in a moment, or call 01452 452356 or
  email hello@intelligentclean.co.uk.
- Why: the only failure message that says "contact us" without saying how.

**E-37 Booking payload would not parse** (`book.astro:627`)
- Current: "Sorry, I couldn't finish confirming that automatically. Please call 01452 452356
  or email hello@intelligentclean.co.uk and we'll get your booking sorted straight away."
- Proposed: Sorry, I couldn't complete the booking automatically. Please call 01452 452356 or
  email hello@intelligentclean.co.uk and we'll finish it with you.
- Why: "straight away" is a response-time promise nothing in the repo commits to (register
  C14).

### F. Server strings the page prints verbatim

These live outside the page but reach the customer through E-31 or E-33, so they are part
of the page's copy. Proposed wording assumes the E-31 and E-33 wrappers above, so each string
reads as a sentence after "Sorry,".

**F-01 Rate limit** (`server/netlify/functions/rateLimit.js:29`)
- Current: "Too many requests. Please wait a little and try again, or call us on 01452
  452356."
- Proposed: you've sent a lot of messages in a short time. Please wait a little while and try
  again, or call 01452 452356.
- Why: "Too many requests" is HTTP wording; with E-33 fixed the phone number appears once.

**F-02 Slot conflict at confirm** (`chat.js:856` and `:882`)
- Current: "Time slot no longer available. Please choose another time."
- Proposed: that time has just been taken. Please choose another time.
- Why: reads as a sentence after "Sorry,"; today the wrapper makes it "Sorry - Time slot no
  longer available. Please choose another time. Please choose another time."

**F-03 Store write failed at confirm** (`chat.js:863`)
- Current: "We couldn't confirm your booking just now. Please call 01452 452356 to book."
- Proposed: we couldn't confirm your booking just now. Please call 01452 452356 and we'll
  book it with you.
- Why: near-keep; today the wrapper appends "Please choose another time" after "please call
  ... to book".

**F-04 Date too soon** (`chat.js:687`)
- Current: "Date too soon [em dash] minimum 7 days notice"
- Proposed: we need at least 7 days' notice for a booking. Please choose a later date.
- Why: em dash, missing apostrophe, telegraphic; 7 days is the lead the assistant offers
  from (`chat.js:274`). Note the gate on the same line allows 6 (`daysOut < 6`); decide which
  figure is authoritative before wording it (Part D, B-8).

**F-05 Date too far ahead** (`chat.js:688`)
- Current: "Date too far ahead"
- Proposed: that date is too far ahead to book yet. Please choose a date in the next eight
  weeks.
- Why: the assistant only offers eight weeks of dates (`chat.js:280`), so name that rather
  than the 90-day backstop.

**F-06 Sunday** (`chat.js:692`)
- Current: "Sundays are not bookable"
- Proposed: we don't work on Sundays. Please choose a day from Monday to Saturday.
- Why: says the same thing as a person would (`shared/config/tradingHours.js:27`).

**F-07 Payload validation family** (`chat.js:671`, `:674-678`, `:697-699`, `:704`, `:711`)
- Current: "Missing field: {name}", "Invalid name", "Invalid phone", "Invalid email",
  "Invalid address", "Invalid date format", "Invalid start_time", "Invalid slots_needed",
  "Estimated price below minimum", and so on.
- Proposed: one customer sentence in the client for the whole family: some of your details
  didn't come through properly. Could you give me your {field, in plain words} again? Keep the
  technical string in the server log (`chat.js:795`), where it already goes.
- Why: these fire on a malformed payload from the model, not on anything the customer typed
  into a form, and "Invalid slots_needed" is not something a customer can act on.

**F-08 Configuration and transport errors** (`chat.js:232`, `:239`, `:382`;
`server/netlify/functions/origins.js:107`)
- Current: "Anthropic API key not configured", "Invalid JSON", "Failed to contact Anthropic
  API", "Forbidden origin".
- Proposed: never shown as-is; the E-33 fallback sentence with a short code.
- Why: a vendor name and the site's configuration state are not for customers.

### G. Below the chat window

**E-38 Person and privacy line** (`book.astro:69`)
- Current: "Prefer to talk to a person? Call 01452 452356 or email
  hello@intelligentclean.co.uk. We handle your details in line with our Privacy Notice."
- Proposed: keep the words.
- Why: it does the D-032 job (a quiet human route, not a promoted one) and carries the
  privacy link; its position is a structure point (Part B, item 5).

## Part B: structure and conversion path

Page type: the conversion page for the whole funnel (quote, then booking, in one chat).
Primary goal: a confirmed booking. Traffic: every page links here, and the nav CTA is
"Get a Quote" (`site/src/components/Nav.astro:40`).

### Quick wins

1. **Message match.** Change the heading (E-03) so the page confirms the promise of the
   click. The nav says "Get a Quote", six pages say "Get an Instant Quote" or "Get a Quote &
   Book", the home page says "Chat with Our AI" and "Book a Visit"; none says "AI Cleaning
   Assistant".
2. **One primary action.** The four suggestion chips are visually equal. Style "Get a quote"
   as the primary button and leave the other three as chips, so the first screen has one
   obvious next step. A styling change, not copy.
3. **Honest presence signal.** Reword the status line (E-06) and remove the green dot
   (`.chat-status-dot`, `book.astro:86`) or recolour it as a plain brand accent. "Online" plus
   a green dot invites "am I talking to a person?" questions the assistant then has to
   answer.
4. **Photo route.** Name the camera button in the welcome (E-08). Today it is a tooltip.

### High-impact changes

5. **Trust next to the input.** The privacy sentence sits below the whole window
   (`book.astro:69`). On a phone the layout was tuned so the input is on screen at load
   (`book.astro:119-131`); this line is not. Put "We handle your details in line with our
   Privacy Notice." directly under the input area as a one-line note, and leave the
   "prefer a person" sentence where it is (D-032: the human route stays quiet).
6. **Set expectations before the first message.** The assistant collects eleven items
   (`chat.js:129-140`) and nothing on the page says what to have ready. The proposed welcome
   (E-08) names rooms, sizes and concerns. Optionally add one line under the sub-line from
   facts already public on the home page: Bookings run Monday to Saturday and take a 10%
   deposit. (`index.astro:46-47`, `shared/config/pricing.js:49`,
   `shared/config/tradingHours.js:27`). Do not add the 7-day lead to page copy unless Ben
   wants it advertised; today it exists only in code and the prompt.
7. **Order of the outcome card.** The deposit secures the slot (`policy.js:26`), but the
   calendar link renders before the pay button (`book.astro:517` then `:534`). Put the pay
   button first, the calendar link second. Optionally carry the email's sentence "Payment is
   handled securely by our payment provider. We never see your card details."
   (`shared/emailSnippets.js:36`) under the pay button; same words, already substantiated.

### Test ideas

- Heading: E-03 proposed against the two alternatives.
- Chip set: four chips against two (quote, photo).
- Privacy line position: below the window against under the input.
- Welcome: with and without the photo sentence.

### Recommendations from the cro skill deliberately not made

- **Social proof or testimonials near the CTA.** Declined: D-015 (no track-record claims
  until substantiated) and the marketability review's A2, which is owner-side and waiting on
  Mark's material. Nothing to add on this page.
- **A prominent phone booking route.** Declined: D-032 (`DECISIONS.md:439`); the review's A3
  was declined for the same reason.
- **"Takes 30 seconds" style effort claims.** Not measured; not added.
- **A guarantee near the CTA.** The re-clean promise exists (`policy.js`, `reCleanSentence`)
  and is on `/terms`. Surfacing it here would be a new placement of an existing commitment,
  so it is Ben's call, not a copy edit.

## Part C: claims register

Every phrase in the current or proposed copy that reads as a claim. "In-house" means the
repo records it as ICC's own statement with no independent source; that is fine for a
capability statement and not fine for a quality superlative.

| # | Phrase | Where | Repo source | Evidence | Verdict |
|---|---|---|---|---|---|
| C1 | "instant" quote | E-02, E-04, site-wide | quote is produced in the conversation (`chat.js:142`); same word on every inbound link | capability, well-evidenced | keep |
| C2 | "fully-explained quote" | E-02 | home feature "fully explained, itemised quote" (`index.astro:75`) | capability, well-evidenced | replace with "itemised" (more specific) |
| C3 | "expert carpet advice" | E-02 | in-house: over 15 years' experience recorded from Mark's minutes (`DECISIONS.md:148`); knowledge vetted under L-009; no accreditation held (`MARKETABILITY_REVIEW_2026-09.md:52`) | in-house quality claim | cut the adjective |
| C4 | "Our AI knows carpets inside out" | E-04 | none; contradicted by the hand-over rule (`knowledge.js:144`) and the A4 remediation | unsupported | cut |
| C5 | "Online" with a green dot | E-06 | nothing checks a status | unsupported as a status | reword, drop the dot |
| C6 | "Based on ICC's expert guidance" | E-18 | as C3 | in-house | reword to "own"; pinned by test |
| C7 | "Looked up on the web" | E-19 | web search tool in the tool set (`chat.js:206`) | well-evidenced | keep |
| C8 | "Booking Confirmed" / "appointment is secured" | E-20, E-21 | slot is held on confirm; the deposit secures it (`policy.js:26`) | contradictory wording | "booked" |
| C9 | "Confirmation emails have been sent" | E-22 | gated on the real send result (`chat.js:1142-1143`, L-029) | well-evidenced | keep; "our team" becomes "Mark" (`DECISIONS.md:148`) |
| C10 | "provisionally held", "Mark will confirm the time" | E-24, E-25 | D-027; customer email says the same (`chat.js:1049`) | well-evidenced | keep |
| C11 | "Pay your deposit securely" | E-27 | Stripe hosted checkout (D-004, `DECISIONS.md:30`); email footnote (`emailSnippets.js:36`) | well-evidenced | keep |
| C12 | the deposit figure {X} | E-28, E-29 | printed from the model's payload; the server recomputes its own figure (`chat.js:808-811`) and does not return it | figure provenance gap | copy fine; see B-3 |
| C13 | "I have all your details noted" | E-32 | none in that path | unsupported | cut |
| C14 | "straight away" | E-37 | no response-time commitment anywhere on the site (grep) | unsupported | cut |
| C15 | "we'll pick up from wherever you like" | E-14 | contradicted by `book.astro:179-180` | false | cut |
| C16 | "in line with our Privacy Notice" | E-38 | `privacy.astro`, ICO number on the page (`privacy.astro:6`) | well-evidenced | keep |
| C17 | 01452 452356, hello@intelligentclean.co.uk | many | the site's real details (`contact.astro:75`) | in repo | keep verbatim |
| C18 | "7 days' notice" | F-04 | assistant lead (`chat.js:274`); refund notice (`policy.js:26`) | code-backed; gate slack at `chat.js:687` | keep the figure, settle B-8 |
| C19 | "we don't work on Sundays" | F-06 | `tradingHours.js:27` | well-evidenced | keep |
| C20 | "in the next eight weeks" | F-05 | `chat.js:280` | code-backed | keep |
| C21 | "confirmed on the day" | E-04 | `index.astro:74`, `services.astro:136`, `terms.astro:34` | well-evidenced | keep |
| C22 | "itemised" | E-02, E-04 | `chat.js:150`, `services.astro:136` | well-evidenced | keep |
| C23 | "Monday to Saturday", "10% deposit" | Part B item 6 | `tradingHours.js:27`, `pricing.js:49`, `index.astro:46-47` | already public | optional |
| C24 | "We never see your card details" | Part B item 7 | `emailSnippets.js:36` | same words as the email | optional |
| C25 | "Rug Doctor" | E-09 | a competitor brand in a question; the guides do not name it (grep) | not a claim | replace |

Nothing in the proposed copy introduces a statistic, a testimonial, a certification or a
response time.

## Part D: behaviour findings noticed on the way (not fixed; read-only)

- **B-1 A saved booking can be reported as a failure (High).** When the email send throws,
  `chat.js:1164-1168` returns `success: true` together with `error: err.message`. The client
  tests `bookData.error` first (`book.astro:450-453`), so the customer sees "Sorry - {raw
  error text} Please choose another time." for a booking that is already persisted and
  holding the slot. The honest fallback copy at `book.astro:501` is unreachable on this
  path. Fix is small (drop the `error` key from that response, since `emailStatus` already
  carries the failure, or check `success` before `error` in the client). Worth a
  LESSONS_LEARNED entry beside L-029; it is the same class of bug one layer up.
- **B-2 Wrapper duplication and contradiction.** `book.astro:451` appends "Please choose
  another time." to every server booking error, including the one that says to call
  instead (`chat.js:863`). Copy E-31 and F-02/F-03.
- **B-3 Deposit figure provenance.** The card prints `booking.deposit` from the model's
  BOOKING_READY payload. The server recomputes the figure of record from the quote lines
  (`chat.js:808-811`) and uses that in the emails and the Stripe link, but the confirm
  response (`chat.js:1148-1160`) does not return it. Normally they agree; when they do not,
  the card and the email show different deposits. Return the server figure and render that.
  D-004 territory; worth a DECISIONS addendum if adopted.
- **B-4 Empty list rendering.** `book.astro:439` renders "are: . Which would you prefer?"
  when no start times remain. Copy E-30.
- **B-5 Two welcome texts.** HTML (`book.astro:44`) and script (`:149`, `:152`) differ. E-07.
- **B-6 Two "chat ended" strings.** `book.astro:186` and `:205`. E-16.
- **B-7 Raw ISO date in the card.** `book.astro:486` and `:494` print YYYY-MM-DD while
  `:439` already formats a readable date. E-21, E-24.
- **B-8 Notice period: copy says 7, gate allows 6.** `chat.js:687` rejects only
  `daysOut < 6`; the message says "minimum 7 days"; the prompt offers dates from 7 days out
  (`chat.js:274`). Probably deliberate slack for a partial day, but decide and say so.
- **B-9 Vendor names in customer-visible errors.** `chat.js:232` and `:382`. E-33, F-08.
- **B-10 Parity and pinned strings.** `index.html` (the retained rollback) carries five of
  the strings reviewed here, and `test/chat-client-parity.test.js` compares both clients;
  four strings are pinned by name (E-18, E-24, E-27, E-29). Any change lands in
  `book.astro`, `index.html` and the test in one commit (blast-radius-grep).
- **Out of scope, noticed in passing.** The home hero reads "Smarter Cleaning. Done
  Properly." (`index.astro:35`) while the D-015 addendum records the tagline confirmed with
  Mark as "Intelligence you can trust" (`DECISIONS.md:148`). Not pursued here.

## Part E: implementation notes

- Strings by home: E-01 to E-38 are in `site/src/pages/book.astro`; F-01 is in
  `server/netlify/functions/rateLimit.js`; F-02 to F-08 are in
  `server/netlify/functions/chat.js` and `origins.js`.
- Pinned strings and where the pin is: "Based on ICC's expert guidance"
  (`test/chat-client-parity.test.js:68`), "provisionally held" (`:78`), "Pay your deposit
  securely" (`:105`, also `test/email-snippets.test.js` and `test/booking-action.test.js`
  for the email copy), "Mark will be in touch to arrange your deposit" (`:106`).
- Two proposals need a small code change rather than a string swap: the readable date in the
  card (E-21, E-24; reuse the formatter at `book.astro:439`) and the empty-list branch
  (E-30).
- F-07 is a mapping in the client from field name to plain words, not a server change.
- The assistant's own reply style is set in the system prompt (`chat.js:58-63`); the page
  copy proposed here follows the same register (warm, plain, no dashes as breaks) so the
  chrome and the replies sound like one voice.

## Part F: unslop-text pass

Scanner: `python unslop_text_scan.py docs/BOOKING_PAGE_COPY_REVIEW_2026-09-14.md`. First run:
11 findings, slop score 17, three high (bold lead-in labels in the head block, copied from the
older review-doc convention, and one quoted line carrying bold markers) and eight low
(horizontal rules between sections). Fixed by rewriting the head as plain sentences, removing
the rules and stripping the markers from the quoted line. Second run: 0 findings, score 0,
"Clean, no tells detected". A grep for U+2014 returns 0.

Structural pass, by ear: the per-element bullets are the format the brief asked for, so the
list shape is deliberate; the proposed customer copy uses contractions and one register
(the warm, plain voice the assistant prompt sets), has no exclamation marks, no "I
encountered an issue" boilerplate and no antithesis cadence; sentence lengths in the
proposed strings vary because each says one thing.

## Citations

Every `file:line` above, with the text on that line, and the command used to read it.
Line numbers are from the working tree at commit `7976d1c` on `main`, 14 September 2026.

| Claim | Path | Line | Quoted text (leading whitespace trimmed, long lines cut) | How verified |
|---|---|---|---|---|
| E-01 | site/src/pages/book.astro | 20 | `title="Book a Carpet Clean \| Intelligent Carpet Cleaning"` | awk NR==20 |
| E-02 | site/src/pages/book.astro | 21 | `description="Chat with our AI assistant for an instant, fully-explained quote, expert carpet advice, and booking across Cheltenham and Gloucestershire."` | awk NR==21 |
| E-03 | site/src/pages/book.astro | 25 | `<h1>AI Cleaning Assistant</h1>` | awk NR==25 |
| E-04 | site/src/pages/book.astro | 26 | `<p>Instant quotes, carpet advice, stain guidance, and booking. Our AI knows carpets inside out.</p>` | awk NR==26 |
| E-05 | site/src/pages/book.astro | 33 | `<div class="chat-window-name">ICC Assistant</div>` | awk NR==33 |
| E-06 | site/src/pages/book.astro | 34 | `...<span class="chat-status-dot"></span>Online [em dash] Intelligent Carpet Cleaning</div>` | awk NR==34 |
| E-07 | site/src/pages/book.astro | 44 | `<div class="msg-bubble bot" id="welcomeBubble">Hello and welcome to Intelligent Carpet Cleaning. I am here to help you with quotes, carpet advice, stain guidance, and booking.</div>` | awk NR==44 |
| E-08 | site/src/pages/book.astro | 149 | `wb.appendChild(document.createTextNode("Hi, welcome to Intelligent Carpet Cleaning. I'm the booking assistant, here to help you with quotes, carpet advice, stain guidance, and booking."));` | awk NR==149 |
| E-08 | site/src/pages/book.astro | 152 | `wb.appendChild(document.createTextNode("To get started, could you tell me about your carpet and what you need? For example, the room type, approximate size, and any concerns such as staining or heavy soiling."));` | awk NR==152 |
| E-09 | site/src/pages/book.astro | 50 | `...onclick="sendSuggestion('I need a quote for my lounge carpet')">Get a quote</button>` | awk NR==50 |
| E-09 | site/src/pages/book.astro | 51 | `...onclick="sendSuggestion('How do I identify what type of carpet I have?')">Identify my carpet</button>` | awk NR==51 |
| E-09 | site/src/pages/book.astro | 52 | `...onclick="sendSuggestion('Is professional cleaning better than a Rug Doctor hire?')">DIY vs professional</button>` | awk NR==52 |
| E-09 | site/src/pages/book.astro | 53 | `...onclick="sendSuggestion('I have a red wine stain, can you help?')">Stain advice</button>` | awk NR==53 |
| E-10 | site/src/pages/book.astro | 58 | `<textarea class="chat-input" id="chatInput" aria-label="Type your message to the carpet cleaning assistant" placeholder="Ask about quotes, carpet types, stains, or upload a photo..."...` | awk NR==58 |
| E-11 | site/src/pages/book.astro | 56 | `<label for="imageUpload" ... title="Upload carpet photo">` | awk NR==56 (title attribute is past the 230-char cut; confirmed by grep "Upload carpet photo") |
| E-11 | site/src/pages/book.astro | 64 | `<div style="flex:1;font-size:0.8rem;color:var(--text-mid);" id="imagePreviewName">Image ready to send</div>` | awk NR==64 |
| E-11 | site/src/pages/book.astro | 346 | `document.getElementById("imagePreviewName").textContent = file.name + " - ready to send";` | awk NR==346 |
| E-12 | site/src/pages/book.astro | 578 | `{type:"text",text:"Please look at this photo of my carpet and tell me what type it is, what condition it is in, and what cleaning method you would recommend."}` | awk NR==578 |
| E-13 | site/src/pages/book.astro | 195 | `appendMessage("bot","Still there? No rush at all, happy to help whenever you're ready.");` | awk NR==195 |
| E-14 | site/src/pages/book.astro | 198 | `appendMessage("bot","Just checking in again. If now isn't a good moment, feel free to come back any time and we'll pick up from wherever you like.");` | awk NR==198 |
| E-14, C15 | site/src/pages/book.astro | 179-180 | `// way the final inactivity reminder does. Refreshing the page starts a fresh` / `// conversation.` | awk NR==179, NR==180 |
| E-15 | site/src/pages/book.astro | 201 | `appendMessage("bot","I'll leave you to it for now. Come back any time you'd like a quote or to get booked in. You can also reach us directly on 01452 452356 or at hello@intelligentclean.co.uk. Take care!");` | awk NR==201 |
| E-16 | site/src/pages/book.astro | 186 | `if(input){ input.disabled=true; input.placeholder="Chat ended [em dash] refresh the page to start a new conversation."; }` | awk NR==186 |
| E-16 | site/src/pages/book.astro | 205 | `input.placeholder="Chat session ended. Refresh the page to start a new conversation.";` | awk NR==205 |
| E-17 | site/src/pages/book.astro | 619 | `appendMessage("bot","One moment, confirming your slot...");` | awk NR==619 |
| E-18 | site/src/pages/book.astro | 282 | `kbLine.appendChild(document.createTextNode("Based on ICC's expert guidance: "));` | awk NR==282 |
| E-19 | site/src/pages/book.astro | 304 | `webLine.appendChild(document.createTextNode("Looked up on the web: "));` | awk NR==304 |
| E-20 | site/src/pages/book.astro | 480 | `title.textContent = isProvisional ? "Booking received" : "Booking Confirmed";` | awk NR==480 |
| E-21 | site/src/pages/book.astro | 493 | `bub.appendChild(document.createTextNode("Your appointment is secured for "));` | awk NR==493 |
| E-21, B-7 | site/src/pages/book.astro | 439 | `const parts=booking.date.split("-");const readableDate=new Date(parts[0],parts[1]-1,parts[2]).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});appendMessage("bot","Sorry, that time has just be...` | awk NR==439 |
| E-22 | site/src/pages/book.astro | 503 | `bub.appendChild(document.createTextNode("Confirmation emails have been sent to "));` | awk NR==503 |
| E-22 | site/src/pages/book.astro | 505 | `bub.appendChild(document.createTextNode(" and to our team."));` | awk NR==505 |
| E-23 | site/src/pages/book.astro | 501 | `bub.appendChild(document.createTextNode("Your booking is recorded. If you don't receive a confirmation, or don't hear from us shortly, please call us on 01452 452356."));` | awk NR==501 |
| E-24 | site/src/pages/book.astro | 485 | `bub.appendChild(document.createTextNode("We've provisionally held "));` | awk NR==485 |
| E-24 | site/src/pages/book.astro | 491 | `: " for you. As this clean would finish later in the afternoon, Mark will confirm the time with you personally and arrange your deposit. We've emailed you a summary."));` | awk NR==491 |
| E-25 | site/src/pages/book.astro | 490 | `? " for you. As this clean would finish later in the afternoon, it needs confirming before it's final. We'll be in touch shortly to confirm the time and arrange your deposit; if you don't hear from us soon, please call us on 01452...` | awk NR==490 |
| E-26 | site/src/pages/book.astro | 517 | `a.textContent = "Add to My Calendar";` | awk NR==517 |
| E-27 | site/src/pages/book.astro | 534 | `pa.textContent = "Pay your deposit securely";` | awk NR==534 |
| E-28 | site/src/pages/book.astro | 542 | `? "Pay your deposit of " + (booking.deposit\|\|"") + " using the button above to secure your slot. Questions? Call 01452 452356."` | awk NR==542 |
| E-29 | site/src/pages/book.astro | 543 | `: "Mark will be in touch to arrange your deposit of " + (booking.deposit\|\|"") + ". Questions? Call 01452 452356.";` | awk NR==543 |
| E-31, B-1, B-2 | site/src/pages/book.astro | 451 | `appendMessage("bot","Sorry - "+bookData.error+" Please choose another time.");` | awk NR==451 |
| E-32 | site/src/pages/book.astro | 555 | `appendMessage("bot","I have all your details noted. Please call 01452 452356 or email hello@intelligentclean.co.uk to confirm your booking.");` | awk NR==555 |
| E-33 | site/src/pages/book.astro | 636-637 | `// Surface the real error so we can diagnose 403/429/500 instead of a` / `// generic "I encountered an issue" fallback.` | awk NR==636, NR==637 |
| E-33 | site/src/pages/book.astro | 638 | `appendMessage("bot","Sorry, "+d.error+" If this persists, please call 01452 452356 or email hello@intelligentclean.co.uk.");` | awk NR==638 |
| E-34 | site/src/pages/book.astro | 640 | `appendMessage("bot","Sorry, the chat service returned an error (status "+r.status+"). Please try again or call 01452 452356.");` | awk NR==640 |
| E-35 | site/src/pages/book.astro | 642 | `appendMessage("bot","I apologise, I encountered an issue. Please try again or contact us directly on 01452 452356.");` | awk NR==642 |
| E-36 | site/src/pages/book.astro | 646 | `appendMessage("bot","I am unable to connect at the moment. Please try again shortly or contact us directly.");` | awk NR==646 |
| E-37 | site/src/pages/book.astro | 627 | `appendMessage("bot","Sorry, I couldn't finish confirming that automatically. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll get your booking sorted straight away.");` | awk NR==627 |
| E-38 | site/src/pages/book.astro | 69 | `<p class="chat-fallback">Prefer to talk to a person? Call <a href="tel:01452452356">01452 452356</a> or email <a href="mailto:hello@intelligentclean.co.uk">hello@intelligentclean.co.uk</a>. We handle your details in line with our ...` | awk NR==69 |
| Part B item 3 | site/src/pages/book.astro | 86 | `.chat-status-dot{display:inline-block;width:6px;height:6px;background:#4ade80;border-radius:50%;margin-right:4px;}` | cat -n, lines 74-139 |
| Part B item 5 | site/src/pages/book.astro | 119-131 | first line `/* The chat is the conversion surface, so on a phone the text box has to be on`; last line `focused input is under 16px, and 0.9rem computes to 14.4px. */` | awk NR==119, NR==131 |
| Part B item 6 | server/netlify/functions/chat.js | 129-140 | first line `Collect in this order, one question at a time:`; last line `11. Preferred start time (choose one of the available start times for that day listed in the Hours section abo...` | awk NR==129, NR==140 |
| B-10 | site/src/pages/book.astro | 251 | `const KB_GUIDE_SLUGS={` | grep -n |
| E-05 | server/netlify/functions/chat.js | 54 | `You do not use a personal name; if it comes up, you are simply the Intelligent Carpet Cleaning booking assistant. ...` | awk NR==54 |
| Part E | server/netlify/functions/chat.js | 58 | `COMMUNICATION STYLE:` | awk NR==58 |
| E-11, E-31 | server/netlify/functions/chat.js | 63 | `Never use a dash of any kind as a mid-sentence break or to introduce a clause. This includes the em dash (--), the en...` | grep -n |
| Part B item 6 | server/netlify/functions/chat.js | 133 | `4. Full address including postcode (must be GL postcode)` | grep -n |
| C1 | server/netlify/functions/chat.js | 142 | `Once you have all details, calculate the total estimated time needed ... Tell the customer the estimated duration, total price, and the 10% deposit ...` | awk NR==142 |
| C22 | server/netlify/functions/chat.js | 150 | `The quote_lines array must list every priced item behind the quote you gave, each as {"code":"...","qty":N}, ...` | sed -n 128,160p |
| C7 | server/netlify/functions/chat.js | 206 | `const TOOLS = [ESCALATION_TOOL, WEB_SEARCH_TOOL];` | grep -n |
| F-08 | server/netlify/functions/chat.js | 232 | `return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: "Anthropic API key not configured" }) };` | awk NR==232 |
| F-08 | server/netlify/functions/chat.js | 239 | `return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };` | awk NR==239 |
| F-08 | server/netlify/functions/chat.js | 246 | `return { statusCode: originCheck.status, headers: baseHeaders, body: JSON.stringify({ error: originCheck.error }) };` | awk NR==246 |
| F-04, C18, B-8 | server/netlify/functions/chat.js | 274 | `const minBookingDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);` | awk NR==274 |
| F-05, C20 | server/netlify/functions/chat.js | 280 | `// Pre-calculate available booking dates (Mon-Sat only) for the next 8 weeks` | grep -n |
| F-08 | server/netlify/functions/chat.js | 382 | `body: JSON.stringify({ error: "Failed to contact Anthropic API", detail: err.message })` | awk NR==382 |
| F-07 | server/netlify/functions/chat.js | 671 | ``if(b[f] === undefined \|\| b[f] === null \|\| b[f] === "") return `Missing field: ${f}`;`` | grep -n |
| F-07 | server/netlify/functions/chat.js | 674 | `if(typeof b.name !== "string" \|\| b.name.length < 2 \|\| b.name.length > 120) return "Invalid name";` | grep -n |
| F-07 | server/netlify/functions/chat.js | 675-678 | `... return "Invalid phone";` / `... return "Invalid email";` / `... return "Invalid address";` / `... return "Invalid date format";` | awk NR==675..678 |
| F-04, B-8 | server/netlify/functions/chat.js | 687 | `if(daysOut < 6) return "Date too soon [em dash] minimum 7 days notice";` | awk NR==687 |
| F-05 | server/netlify/functions/chat.js | 688 | `if(daysOut > 90) return "Date too far ahead";` | awk NR==688 |
| F-06 | server/netlify/functions/chat.js | 692 | `if(!dayWindow) return "Sundays are not bookable";` | grep -n |
| F-07 | server/netlify/functions/chat.js | 697, 699 | `... return "Invalid start_time";` (both) | grep -n |
| F-07 | server/netlify/functions/chat.js | 704 | `if(!Number.isInteger(slots) \|\| slots < 1 \|\| slots > maxSlots) return "Invalid slots_needed";` | grep -n |
| F-07 | server/netlify/functions/chat.js | 711 | `if(priceNum < 30) return "Estimated price below minimum";` | grep -n |
| F-07 | server/netlify/functions/chat.js | 795 | `console.log("Booking rejected:", validationError);` | grep -n |
| B-3, C12 | server/netlify/functions/chat.js | 808 | `const serverQuote = serverQuoteForBooking(booking);` | awk NR==808 |
| B-3, C12 | server/netlify/functions/chat.js | 811 | `booking.deposit = formatGBP(serverQuote.deposit);` | awk NR==811 |
| F-02 | server/netlify/functions/chat.js | 856, 882 | `body: JSON.stringify({ error: "Time slot no longer available. Please choose another time." })` (both) | awk NR==856, NR==882 |
| F-03 | server/netlify/functions/chat.js | 863 | `body: JSON.stringify({ error: "We couldn't confirm your booking just now. Please call 01452 452356 to book." })` | awk NR==863 |
| C10 | server/netlify/functions/chat.js | 1049 | `? "Thank you for your request. As your clean would finish later in the afternoon, Mark will confirm the time wi...` | grep -n |
| C9 | server/netlify/functions/chat.js | 1142-1143 | `const operatorEmailed = markRes.ok;` / `const customerEmailed = customerRes.ok;` | grep -n |
| B-3 | server/netlify/functions/chat.js | 1148-1160 | response object keys: `success`, `provisional`, `message`, `calLink`, `depositPayUrl`, `markEmail`, `customerEmail`, `emailStatus` (no deposit figure) | sed -n 1148,1160p, then grep for keys |
| B-1 | server/netlify/functions/chat.js | 1164 | `console.error("Booking email send threw:", err.message);` | awk NR==1164 |
| B-1 | server/netlify/functions/chat.js | 1168 | `body: JSON.stringify({ success: true, provisional, message: "Booking recorded but email sending failed.", calLink, depositPayUrl: customerDepositPayUrl, error: err.message, emailStatus: { operator: fa...` | awk NR==1168 |
| F-01 | server/netlify/functions/rateLimit.js | 29 | `body: JSON.stringify({ error: "Too many requests. Please wait a little and try again, or call us on 01452 452356." }),` | awk NR==29 |
| F-08 | server/netlify/functions/origins.js | 107 | `return { ok: false, status: 403, error: "Forbidden origin" };` | awk NR==107 |
| C8, C18, item 7 | shared/config/policy.js | 26 | ``return `A ${DEPOSIT.percent}% deposit is taken at booking to secure the slot and is applied to your final bill. You receive a full refund if we cancel, or if you cancel with ${DEPOSIT.fullRefundNotice...`` | awk NR==26 |
| C23 | shared/config/pricing.js | 49 | `const deposit_rate = 0.1;` | grep -n |
| C19, C23 | shared/config/tradingHours.js | 27 | `const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];` | grep -n |
| C11, E-27 | shared/emailSnippets.js | 35 | `<a href="${safe}" ...>Pay your deposit securely</a>` | awk NR==35 |
| C24, item 7 | shared/emailSnippets.js | 36 | `<p ...>Payment is handled securely by our payment provider. We never see your card details.</p>` | grep -n |
| E-29 | shared/emailSnippets.js | 59 | `: "Mark will be in touch to arrange your deposit payment to confirm the slot.";` | awk NR==59 |
| C4 | shared/config/knowledge.js | 144 | `Your carpet-cleaning knowledge is supplied as a vetted reference document attached to this conversation. Ground your answers in that reference and only state as established fact what it supports. Wher...` | awk NR==144 |
| E-18 | test/chat-client-parity.test.js | 68 | `/Based on ICC's expert guidance/,` | grep -n |
| E-24 | test/chat-client-parity.test.js | 78 | `assert.match(bookAstro, /provisionally held/, "the held-booking copy must be present");` | awk NR==78 |
| E-27 | test/chat-client-parity.test.js | 105 | `assert.match(src, /Pay your deposit securely/, name + " must render the pay action when a link is sent");` | awk NR==105 |
| E-29 | test/chat-client-parity.test.js | 106 | `assert.match(src, /Mark will be in touch to arrange your deposit/, name + " must keep the fallback wording when no link is sent");` | awk NR==106 |
| E-03, Part B | site/src/components/Nav.astro | 40 | `<a class="nav-cta" href="/book">Get a Quote</a>` | grep -n href |
| E-03 | site/src/pages/index.astro | 38 | `<a class="btn-primary" href="/book">Chat with Our AI</a>` | awk NR==38 |
| Part B | site/src/pages/index.astro | 39 | `<a class="btn-outline" href="/book">Book a Visit</a>` | awk NR==39 |
| Out of scope note | site/src/pages/index.astro | 35 | `<h1 class="hero-title">Smarter Cleaning.<br /><span class="accent">Done Properly.</span></h1>` | grep -n |
| C23 | site/src/pages/index.astro | 46-47 | `...<div class="hero-stat-num">6</div><div class="hero-stat-label">Days a Week</div>...` / `...<div class="hero-stat-num">10%</div><div class="hero-stat-label">Deposit to Book</div>...` | grep -n |
| C21 | site/src/pages/index.astro | 74 | feature card containing `...suggests a suitable cleaning method, which our technician confirms on the day.` | sed -n 25,80p |
| C2 | site/src/pages/index.astro | 75 | feature card containing `Get a fully explained, itemised quote in real time...` | sed -n 25,80p |
| C21, C22 | site/src/pages/services.astro | 136 | `<p>Our AI assistant helps assess your carpet type, suggests a suitable method, and gives you a fully itemised price in minutes, with the method confirmed on the day.</p>` | awk NR==136 |
| E-01 | site/src/pages/services.astro | 137 | `<a class="btn-primary" href="/book">Get an Instant Quote</a>` | awk NR==137 |
| E-01 | site/src/pages/about.astro | 45 | `<a class="btn-primary" href="/book">Get a Quote &amp; Book</a>` | awk NR==45 |
| E-01 | site/src/pages/areas/[slug].astro | 145 | `<a class="btn-primary" href="/book">Get an Instant Quote</a>` | awk NR==145 |
| E-01 | site/src/pages/guides/[slug].astro | 105 | `<a class="btn-primary" href="/book">Get an Instant Quote</a>` | awk NR==105 |
| E-01 | site/src/pages/history.astro | 41 | `<a class="btn-primary" href="/book">Get an Instant Quote</a>` | awk NR==41 |
| C17, E-01 | site/src/pages/contact.astro | 75 | `<p>Prefer to speak to a person? Call <a href="tel:01452452356">01452 452356</a> or email <a href="mailto:hello@intelligentclean.co.uk">hello@intelligentclean.co.uk</a> an...` | awk NR==75 |
| C21 | site/src/pages/terms.astro | 34 | `<li>A quote given by our assistant, or otherwise before we attend, is an estimate based on the information and any photographs you provide. In the large majority of cases...` | awk NR==34 |
| C16 | site/src/pages/privacy.astro | 6 | `// ICO number ZC230232 is in (below). ...` | grep -n ZC230232 |
| C11 | DECISIONS.md | 30 | `## D-004 [em dash] Stripe for payments; no card data stored locally` | grep -n "^## D-004" |
| C3, E-22 | DECISIONS.md | 148 | `**Addendum (24 August 2026) [em dash] brand copy confirmed with Mark.** ... The About page says **"local specialist"** (replacing "a local team"; Mark is a sole operator). Experience is stated as **"over 15 years"** ...` | sed -n 148,150p |
| Part B declined | DECISIONS.md | 439 | `## D-032 [em dash] The AI assistant is the advertised booking channel; phone/email booking works but is not promoted` | grep -n "^## D-032" |
| Summary, C4 | docs/MARKETABILITY_REVIEW_2026-09.md | 14-20 | first line `1. A4 [em dash] AI-capability and competitor overclaims (High). The site promised the assistant would`; last line `with the method confirmed on the day; competitor generalisations and the no-damage promise removed.` (bold markers stripped) | awk NR>=14 && NR<=20 |
| C3 | docs/MARKETABILITY_REVIEW_2026-09.md | 52 | `- Insurance / accreditation: substantiate and add only if held; currently omitted by decision.` (bold markers stripped) | grep -n |
| B-1 | LESSONS_LEARNED.md | 133 | `` ## L-029 [em dash] `fetch` never throws on an HTTP error, so a Resend non-2xx booking send was swallowed as success `` | grep -n "^## L-029" |
| Provenance | git | n/a | `7976d1c chore: marketing skills pack, stripped subset of coreyhaines31/marketingskills`, branch `main` | git log --oneline -3; git branch --show-current |

Unverified: none knowingly. The five-string overlap with `index.html` (B-10) is a count from
`grep -c` over five fixed strings, not a full diff of the two clients.
