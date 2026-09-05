# 01452 number + call-forwarding options for Mark

**Status:** research compiled 2026-09-05 from provider websites (via a research fleet). Feeds GATE 0 /
STEP 5 of [LAUNCH_CUTOVER.md](LAUNCH_CUTOVER.md) (the ICC 01452 phone) and
[LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md).

**Read before acting.** Prices drift and some figures (VAT treatment, per-minute overage) were not
published on the provider's own page. Confirm the price, the VAT position, and 01452 availability in the
provider's own number picker before committing. Two things below need an explicit check for THIS use
case: call whisper, and a real test call for connection delay.

## The requirement

A new **01452 (Gloucester)** number that simply **rings Mark's Samsung mobile**, with **minimal
post-dial delay** (he does not want callers to feel the call is bounced round the world), cheap, ideally
**rolling monthly**, and **no app** on the phone (Mark is not technical). The number should be
**business-owned** (D-009) and portable. Call volume is low-to-moderate (a handful of calls a day).

The single biggest cost driver is the **forwarding model**: a per-minute divert (cheap rental, metered
mobile leg) versus a bundled-minutes plan (slightly higher flat rental, divert effectively free at this
volume). At a realistic 200 to 500 minutes a month, bundled beats per-minute.

## Viable options (true network divert, no app)

| Provider | 01452? | Monthly (ex-VAT unless noted) | Divert to mobile | Contract | Port-out | Notes |
|---|---|---|---|---|---|---|
| **Tamar Telecommunications** | ✓ confirmed | **£5** (Startup) | **Bundled 2,000 mins** (landline + mobile), so effectively free at this volume | 30-day rolling | ✓ confirmed | Free setup. Overage ppm not published. ~4★/2,200 reviews. Best flat-rate value. |
| **Voipfone** | ✓ confirmed | **£3** | 7p/min | Rolling, no contract | Not stated on site | Pure network divert, no hardware/broadband. Explicitly claims "no delay". Cheapest if volume is genuinely tiny. |
| **Soho66** | ✓ confirmed | £2.99 (VAT not stated) | 8.5p/min | Rolling, no min term | Not stated | Same divert model as Voipfone, marginally dearer per minute. |
| **Number Supermarket** (Solo) | not verified | £14.99 (99p first 2 mo) | 500 mins incl, then 15p/min mobile | No long contract | ✓ £25 one-off | Clean single price, but dearer than Tamar for a smaller bundle. |
| **SwitchboardFREE** | not verified | from £5 +VAT | 6p/min (unlimited-divert bundle is tied to an 084, not an 01) | No contract | Not confirmed | Per-minute creep on a geographic number. |
| **Virtual Landline** | not verified | £4.50 (VAT not stated) | 5p/min out of bundle | Rolling available | Not confirmed | Cheapest headline, but VAT unknown and divert metered. |
| **Planet / PlanetNumbers** | ✓ confirmed | £12.50 | 250 mins then 5p/min | **12-month tie-in** | Not confirmed | Avoid: locked in and dearer. |

## Ruled out

- **8x8, Vonage, bOnline, CircleLoop, sipgate, Yay.com, TelcoSwitch** — per-user unified-comms
  platforms. App-centric (calls answered in an app, not a plain ring-through), often minimum terms,
  costlier. Wrong tool for "just ring my mobile".
- **eReceptionist** — could not verify anything on its own site (whole domain blocks access), reviews
  mixed. Only via a direct sales call.
- **Kall8** — US-only, offers no 01452 and would route via the US (the exact latency problem to avoid).
- **Numbers UK** — no reachable live provider by that name (dead/parked domains).
- **Numberpeople** — the "FREE" headline is a 30-day trial; then ~£2/mo but 7p/min divert.

## Recommendation

1. **Tamar Telecommunications (£5/mo +VAT, Startup)** as the primary. It is the best flat-rate value:
   01452 confirmed, 2,000 bundled minutes so the divert to Mark's mobile is effectively free at this
   volume (no per-minute anxiety), no app (lowest post-dial delay, and nothing for Mark to run),
   30-day rolling, free setup, and port-out confirmed.
2. **Voipfone (£3/mo +VAT, 7p/min)** as the alternative, and the better pick if Mark's call volume is
   genuinely tiny (a couple of short calls a day). Pure network divert, 01452 confirmed, and it is the
   only one that explicitly claims no connection delay. The trade-off is the metered mobile leg, which
   overtakes Tamar's flat £5 somewhere around 300 minutes a month.

Both are true network diverts with no app, which is the requirement that matters most for Mark.

## Confirm before committing (either provider)

- **Call whisper / announce.** Does it play Mark a one-second "Intelligent Clean call" announcement when
  the divert connects, so he knows which of his two businesses is ringing before he answers? This is not
  confirmed for either provider in the research and it is genuinely useful for a two-business owner.
  Check the provider's feature list or ask their support.
- **A real test call for delay.** No provider publishes a post-dial-delay figure. The only way to settle
  the "no hang" worry is one real test call to the new number before relying on it. Voipfone claims no
  delay; Tamar's reviews praise reliability; neither is proof.
- **VAT and 01452 stock.** Confirm the VAT-inclusive price and that an 01452 number is actually in stock
  in the provider's number picker at signup.

## Sources

Tamar https://www.tamartelecommunications.co.uk/virtual-telephone-line/ ,
Voipfone https://www.voipfone.co.uk/prices and https://www.voipfone.co.uk/services/uk-phone-numbers ,
Soho66 https://soho66.co.uk/111903/all/1/%7BTrial-page%7D-VoIP-Numbers.aspx ,
Number Supermarket https://www.numbersupermarket.co.uk/pricing/ ,
Planet https://planet.uk/numbers/local-numbers/01452-numbers/ .
