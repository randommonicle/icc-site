# Google Business Profile - setup spec

**Status:** Ready to create. Prepared 18 June 2026. Owner: Mark / the business (D-009).
**Why:** A verified Google Business Profile is the single biggest local-SEO lever for a service-area business (D-016), alongside the area pages and customer reviews.

## Ground rules (read first)

- **Service-area business, address hidden (D-016).** ICC travels to the customer. Configure the profile as a service-area business and do not display the street address. Google verifies against the private address (11 Horsbere Road, GL3 3BT) but it is never shown publicly. Displaying a home address gives at best a marginal ranking benefit and is not worth the privacy trade-off.
- **No fabricated or unverifiable claims (L-009, D-015).** No completed-job counts, no satisfaction percentages, no star claims, no "WoolSafe approved" or any certification ICC does not hold, and no "first / best / guaranteed". State only what is true.
- **NAP consistency (D-016), with ICC's own phone.** Name and Phone must match everywhere (the site, the profile, any directory), and the Phone must be **ICC's own distinct number**, not the 01242 279590 line shared with Regency Cleaners (see the Phone field below). No address in the public NAP.
- **Owned by the business (D-009).** Create the profile under an ICC-controlled Google account (the Google Workspace login is ideal), with Ben added as a Manager, so ownership never has to be transferred later.
- **House style.** British English, no em dashes, plain honest copy.

## Profile fields

**Business name:** Intelligent Carpet Cleaning
Google requires the real-world name only. Do not add keywords such as "Cheltenham Carpet Cleaning"; that breaks Google's naming rules and risks suspension. The locality belongs in the service areas and the description, not the name.

**Primary category:** Carpet cleaning service
**Additional categories:** Upholstery cleaning service; Rug cleaning service; **Pressure washing service** (Mark, Aug 2026, wants to offer pressure washing); optionally Sanitation service for the decontamination/ozone capability.
(Add Commercial cleaning service only if Mark actively wants commercial enquiries through Google.)

**Phone:** ICC needs its **own distinct number** for the profile (decision, 18 June 2026). Do **not** reuse 01242 279590 here: that number is already the primary number on Regency Cleaners' existing Google Business Profile, and reusing it on a second cleaning business risks verification friction and cross-wired ranking/review signals. Because ICC's address is hidden (D-016), the phone is ICC's main public identifier, so it must be ICC's own. A **call-forwarding / VoIP number that rings Mark's existing phone is fine**: Mark still answers one phone, but Google sees a number unique to ICC. Provision it before the profile goes live and set it as the profile's primary number.

When the ICC number exists, use it consistently across all ICC customer-facing surfaces (NAP), replacing 01242 279590 in: `site/src/pages/{privacy,contact,book}.astro`, `server/netlify/functions/{chat,handoffs}.js` (the system prompt and the email/PDF "call us" fallbacks), and their tests (`test/{bookings-chat,escalation,handoffs}.test.js`, which assert the number, so they swap in lockstep). Also check any LocalBusiness structured data, which may hold the number in +44 format. The live `index.html` is the retained rollback and can be left. Regency keeps 01242 279590. Until ICC's number is live the site keeps 01242 279590 (it works and reaches Mark), so do not swap it to a placeholder; grep the repo for the number to find every site when the swap happens.

**Website:** https://intelligentclean.co.uk
Use the domain once it is pointed at Netlify. If the profile is created before the domain cutover, complete the website field and final verification at the cutover.

**Address:** Do not display. Choose "I deliver goods and services to my customers" and leave the address hidden after verification.

**Service areas (where you serve):**
- Core (no travel charge): Cheltenham, Gloucester, Winchcombe, Bishop's Cleeve, Prestbury, Charlton Kings, Quedgeley, Churchdown, Brockworth.
- Wider Gloucestershire (a travel surcharge applies): Tewkesbury, Stroud, Cirencester, Bourton-on-the-Water, Stow-on-the-Wold, Northleach.

Google allows up to 20 service areas. The surcharge is never shown on Google; it is quoted in the chat and the on-site quote. Listing the wider towns simply tells Google that ICC serves them, so the town list here is unaffected by the charge change below.

> **Charge model changing (24 August 2026 Mark meeting).** The flat £15 out-of-area surcharge (D-011) is being replaced by a **tiered model centred on Mark's base address** (his GL3 home, held privately per D-016, used for the distance calc only): free within ~10 miles of the base, then **£5 / £10 / £15** by distance, with **Winchcombe moving from free to ~£5**. Exact bandings and the postcode boundary are still to be set before `serviceArea.js` and the on-site quote change. Only the internal quote wording is affected; the Google service-area list above stays.

**Hours (updated at the 24 August 2026 Mark meeting; supersedes the old 09:00–16:30):** day-specific start windows with **1pm the last job start** (not the closing time), closed Sunday. Start windows:
- Monday from 09:30
- Tuesday from 10:30
- Wednesday from 09:30
- Thursday from 10:00
- Friday from 09:30
- Saturday from 09:30 *(a weekend premium applies to the price, not shown on Google)*

The last job may **start** at 1pm; the day finishes later, set by the job's length. Google's displayed opening hours should show the operating window (each day's first start to a close of the 1pm last start plus a typical job length), so set the displayed close when `shared/config/tradingHours.js` is reworked to per-day hours (see NEXT_SESSION.md, 25 Aug entry). Do not publish the GBP hours until the code hours agree, or the site will sell slots Google advertises differently. Confirm the Thursday start with Mark first.

**Description (paste as-is, about 600 of the 750-character limit):**

> Intelligent Carpet Cleaning provides professional carpet, rug and upholstery cleaning across Cheltenham, Gloucester, Winchcombe and the wider Gloucestershire area. We use a low-moisture cleaning method that is well suited to wool and natural-fibre carpets, with short drying times and no soaked carpets left behind. We give honest, expert advice on what cleaning can and cannot achieve, an accurate quote up front, and a clear price with no surprises. From a single room or staircase to a full house or a commercial floor, we treat your home with care. Book online or call us on 01242 279590.

**Services (all prices are the final price — Mark is not VAT-registered, so no VAT is added; source of truth is `shared/config/pricing.js`):**

Carpet cleaning:
- First room / call-out (up to 15m2): £75
- Medium room (15-20m2): £95
- Large room / lounge (20-30m2): £115
- Hallway: £55
- Landing: £45
- Stairs up to 13 steps: £65
- Stairs 14+ steps: £80

Upholstery:
- 2-seater sofa: £75
- 3-seater sofa: £90
- Armchair: £50

Other:
- Stain treatment: from £45
- Furniture moving: £30
- Out-of-area travel surcharge: £15 flat
- Full house packages: discount, quote on request
- Commercial: tailored pricing

A 10% deposit secures a booking. Prices are flat (Mark is not VAT-registered, so no VAT is added). On Google, enter each price as shown or omit individual prices and keep them on the site; whichever, keep them in step with `shared/config/pricing.js`.

**Attributes / service options (set only the ones that are genuinely true):**
- Online appointments: yes
- Online estimates: yes
- Serves customers at their location (onsite): yes

Skip card-payment attributes until Stripe is live (Phase 3).

**Photos (real images only, never stock or AI-generated):**
- Logo: `logo.jpg` (repo root).
- A cover photo and a handful of genuine before/after job photos once Mark can supply them.

Do not pad the profile with stock photos; honest, real images only, consistent with L-009 / D-015.

## Provisioning ICC's number (and WhatsApp)

Mark has no separate landline, so ICC's number is a **virtual number that forwards to his mobile**. The one catch: **WhatsApp does not accept every virtual number.** WhatsApp Business wants a real mobile or landline number that can receive a verification code; pure app-only VoIP numbers often fail the SMS step, but the **"Call me" voice verification works on a proper UK number that forwards to Mark**. So choose a number that (a) is a real UK number able to receive an incoming voice call (and ideally SMS), forwarded to Mark, and (b) whose provider states WhatsApp Business is supported. Test WhatsApp verification on a trial before committing.

Two viable shapes:
- **Local 01452 (Gloucester) virtual landline - chosen (18 June 2026, reconfirmed August 2026).** It matches Mark's Gloucester base (his GL3 address), and a local geographic number gives local trust and the strongest NAP signal. (Note: 01452 is Gloucester; 01242 is Cheltenham, the area of the current shared Regency number, so do not confuse the two.) Providers offering a UK virtual landline + forwarding + WhatsApp Business include Air Landline, Giant, Hoxton Mix, CircleLoop and bOnline. Roughly £5-15/month (some bill forwarding minutes separately). **Steer from the August meeting: start with the cheapest workable number to get rolling (~£1.99/month for the number, ~£5/month with call forwarding) and upgrade to a memorable premium number later if wanted.**
- **Virtual 07 mobile number** - simplest WhatsApp compatibility, forwards to his phone (e.g. CloudTalk). Slightly less "local" but perfectly normal for a tradesperson.

Avoid Google Voice (not available in the UK) and Skype Number (retired in 2025).

**Number rental recommendation (investigated Aug 2026).** For a simple, idiot-proof start (rings Mark's existing mobile, no hardware, rolling monthly, cheap), the shortlist for an 01452 Gloucester number that diverts to mobile:

| Provider | From | Notes |
|----------|------|-------|
| [Virtual Landline](https://www.virtuallandline.co.uk/) | £4.50/mo | Cheapest; unlimited inbound; divert to mobile; porting a one-off £20 + VAT. |
| [ONSIM](https://onsim.uk/area-codes/01452/) | £5/mo | 01452 virtual number diverting to any phone; a Landline SIM alternative at £10/mo. |
| [Everreach](https://everreach.co.uk/virtual-number/gloucester/) | £10 + VAT/mo | Rings the existing mobile; instant setup, no contract; more polished, pricier. |
| [TheVoIPShop](https://www.thevoipshop.co.uk/uk-phone-numbers/01452-gloucester-area-code) | £12.95/mo | Full VoIP system; more than one diverting number needs. |

**Recommendation:** start with **Virtual Landline (£4.50)** or **ONSIM (£5)** for the cheapest smooth divert-to-mobile, on a rolling monthly basis so the number can be changed. Confirm at sign-up: (1) it forwards to a UK mobile, (2) rolling / no contract, (3) if WhatsApp Business is wanted on the number, that the **"Call me" voice verification** works (test on a trial first, as pure VoIP numbers can fail WhatsApp's SMS step, see the WhatsApp note above). A memorable premium number can be ported or switched later.

**WhatsApp Business setup:** install the free **WhatsApp Business app** on Mark's phone and register it with the ICC number using the "Call me" option (the call forwards to him; he enters the code). It runs alongside his personal WhatsApp because they use different numbers, which also keeps ICC's WhatsApp separate from Regency. Once live, we can add a WhatsApp click-to-chat link to the site and a WhatsApp button on the GBP.

**Later (not for launch):** the WhatsApp Business Cloud API could route WhatsApp messages into ICC's existing AI assistant (the same brain as the website chat) via Meta plus a provider such as Twilio or 360dialog. The free Business app is the right starting point.

## Verification and go-live steps

1. Sign in to the ICC-controlled Google account and create the profile at https://business.google.com.
2. Enter the name, primary category, phone and website above.
3. For location, choose that you serve customers at their locations (service-area business) and add the service areas. Provide the private address for verification only, and choose to hide it.
4. Verify (postcard, phone, email or video, depending on what Google offers). The postcard route can take up to two weeks, so start it early.
5. After verification, confirm the address is hidden, then add the description, services, hours, attributes and photos.
6. Add Ben as a Manager (Settings, People and access) so the business retains ownership (D-009).
7. Once live, ask satisfied customers for Google reviews; the review engine is a core local-SEO lever.

## Who does what

Ben or Mark creates and verifies the profile in Google (it needs a Google login and a verification step that cannot be automated from the codebase). This document is the content to paste in.
