# ICC Platform — Lessons Learned

Hard-won gotchas and how we resolved them. Read before working near the chat proxy, bookings, email, or deploy config. Each has an ID (L-NNN) so other docs and code comments can reference it.

Some entries are seeded from the existing codebase and from the sibling ASH app, where the same class of problem already bit us. They are recorded here pre-emptively so we do not relearn them.

---

## L-001 — The chat origin check fails OPEN by default
When `ALLOWED_ORIGINS` is not set, `chat.js` derives a default allowlist and lets unrecognised origins through (logging a warning) rather than returning 403. The comment is explicit: the per-IP rate limit is treated as the real defence so a 403 storm never blocks customers. The consequence is that, until `ALLOWED_ORIGINS` is set in Netlify, the rate limit is the only thing standing between an attacker and your Anthropic bill. **Set `ALLOWED_ORIGINS` to the real production origins before launch.** Verify by POSTing from a disallowed origin and confirming a 403 once strict mode is on.

## L-002 — Prompt caching only works if the cache prefix stays stable
`chat.js` sends the system prompt as two blocks: a large static block with `cache_control: ephemeral`, and a small dynamic block (assistant name, today's date, bookable dates). This is deliberate. If per-conversation or per-day content leaks into the cached block, the cache prefix changes every request and the discount evaporates. When editing the system prompt, keep anything variable in the second, uncached block. Cache hits cost roughly 10% of normal input — a large saving over a multi-message conversation.

## L-003 — Render all AI/booking output as inert text, never innerHTML
Both `index.html` and `admin.html` build AI replies and booking fields with DOM nodes (`createTextNode`) or an `escHtml`/`esc` helper, never `innerHTML`. This is the prompt-injection defence: a malicious or model-confused reply must render as text, not execute. The one intentional `innerHTML` use is the static typing-indicator markup. Do not introduce `innerHTML` for any content that originated from the model or a customer.

## L-004 — "Accepted by Resend" is not "delivered"
A 200 from the Resend API means Resend accepted the message, not that it reached the inbox. Actual delivery (delivered/bounced/blocked) lives in the Resend dashboard. Two specifics carried from the ASH app: corporate mail filters can hard-block certain content, and the sandbox sender (`onboarding@resend.dev`) has limited deliverability. Before relying on booking emails in the field, verify a real sending domain in Resend and set `OPERATOR_FROM` / `CUSTOMER_FROM` / `OPERATOR_EMAIL` to real addresses. Confirm an actual delivery, do not trust the API 200.

## L-005 — Netlify functions run in UTC; parse dates as local components
Booking dates are `YYYY-MM-DD` strings. `generateJobCardPDF` parses them into local date components (`new Date(y, m-1, d)`) precisely so the function's UTC runtime can never shift the printed day. Anywhere a date string is turned into a `Date` for display or day-of-week, parse the components explicitly rather than `new Date("YYYY-MM-DD")` (which is interpreted as UTC midnight and can render as the previous day in some timezones).

## L-006 — Only the chat path is rate-limited; bookings are not
`checkChatRateLimit` guards the AI chat path, but `check_availability` and `confirm_booking` have no rate limit and the origin check fails open (L-001). A direct POST loop could create bookings and block out calendar slots (slot-griefing) — `validateBooking` stops malformed payloads but not volume. Before real-traffic launch, add a per-IP cap or a lightweight challenge on the booking path. This is the single most important pre-launch hardening item after L-001.

## L-007 — Netlify Blobs needs explicit auth for some deploy types
`getStore` is called with `siteID` and `token` (`NETLIFY_SITE_ID` / `NETLIFY_TOKEN`) because drag-and-drop deploys do not auto-configure the Blobs context. If Blobs reads/writes start failing after a deploy, confirm those two env vars are present in Netlify. The rate-limit and booking code fail open / log on Blobs errors, so a misconfiguration can be silent — check function logs, not just the UI.

## L-008 — Don't let a JSON.parse failure silently drop content
Carried from the ASH app. The booking flow depends on parsing a `BOOKING_READY:{...}` block out of the model's reply, and stored bookings are JSON in Blobs. A truncated or malformed JSON that is caught and swallowed makes a booking silently vanish with the customer none the wiser. Keep `max_tokens` generous for any response carrying JSON, log parse failures, and surface a fallback message ("call us on 01242 279590") rather than failing silently. The client already shows a phone-number fallback on booking error — preserve that pattern as the flow grows.
