# Switching on post-job review requests (D-025)

**Status: built, merged and live in production, but DORMANT.** The one-click "Mark complete & request review" admin action (email + SMS Google-review ask) sends **nothing** until the environment variables below are set. This is the exact, do-this-at-launch checklist to turn it on. It is deliberately deferred to the launch phase because it depends on Mark's Google Business Profile being live and a The SMS Works account existing.

Related: [DECISIONS.md](../DECISIONS.md) D-025 (why/how), [CLAUDE.md](../CLAUDE.md) "Post-job review requests" + the pre-launch checklist, [docs/LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md) (the Google Business Profile the review link comes from).

---

## Prerequisites (Mark-owned, out-of-repo — D-009)

### 1. The SMS Works account — for the SMS channel

1. Mark signs up at **https://thesmsworks.co.uk** using his own business email, so ICC owns the account (D-009).
2. Add credit — **£10 minimum** top-up. About **3.1p + VAT per delivered UK text**; credits never expire and only delivered texts are charged.
3. Get the API key: dashboard → **API Key**. It is a long JWT string. Treat it like a password — it is server-side only and must never be committed or put in client code.
4. Sender ID (the text's "from"): defaults to `ICCleaning`. The SMS Works allows alphanumeric senders on UK routes by default, so no registration is needed. If you want a different label it must be **4–11 characters, letters and digits only, no spaces**.

### 2. Google review link — for BOTH channels

Requires Mark's **Google Business Profile to be claimed and verified** first (see [LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md)).

- **Easiest / preferred:** in the Google Business Profile, open **"Ask for reviews" / "Get more reviews"** and copy the short share link. It looks like `https://g.page/r/XXXXXXXXXXXX/review`. Use this short form — it keeps the review **SMS to a single 160-character segment (one credit)**.
- **Alternative (canonical):** `https://search.google.com/local/writereview?placeid=<PLACE_ID>` — find the Place ID with Google's "Place ID Finder". This works but is long, so the SMS may span two segments (two credits). Prefer the `g.page` short link.

---

## Set the environment variables in Netlify

Netlify → Site settings → Environment variables → add each of these. On this site's Personal plan, add them for **all scopes** — do NOT set specific scopes (that 403s on the Personal plan; see [LESSONS_LEARNED.md](../LESSONS_LEARNED.md) L-018).

| Variable | Value | Required? |
|---|---|---|
| `GOOGLE_REVIEW_URL` | the review link from step 2 (must start `https://`) | **Yes** — with it unset the job is marked complete but nothing is sent |
| `SMSWORKS_API_KEY` | the JWT from step 1 | For the SMS channel (email still sends without it) |
| `SMS_SENDER_ID` | e.g. `ICCleaning` (4–11 alphanumeric) | Optional — defaults to `ICCleaning` |
| `SMS_PROVIDER` | `smsworks` | Optional — defaults to `smsworks` |

The **email channel** also uses these, which should already be set from the A4 work — confirm they are present: `RESEND_API_KEY`, `CUSTOMER_FROM`, `CUSTOMER_REPLY_TO`, `PUBLIC_SITE_URL`.

**Then trigger a redeploy** (Deploys → Trigger deploy → Deploy site). Netlify functions read environment variables from the deploy snapshot, so a **new deploy is required** for the functions to pick up newly-added variables. (Setting the variable alone does not take effect on the running functions.)

---

## Smoke test BEFORE any real customer

1. Create a test booking through the live site using **your own email address and mobile number**.
2. In the admin dashboard, open that job's card and click **"Mark complete & request review"** and confirm the prompt.
3. The inline result under the card should read `Job completed. Email: sent  |  Text: sent`.
4. Check the **email** arrives — subject "How did we do? Leave Intelligent Carpet Cleaning a review", with a "Leave a Google review" button.
5. Check the **text** arrives — from the sender ID (`ICCleaning`), one short line with the review link.
6. Tap the link and confirm it opens the Google review box for **Intelligent Carpet Cleaning**.
7. Remove the test job when done (`scripts/delete-booking.js`, or the admin).

If the text does not arrive: confirm `SMSWORKS_API_KEY` is set and a redeploy has run, the mobile is a real UK mobile (landlines are skipped by design), and there is credit on the SMS Works account. If the email does not arrive: confirm `GOOGLE_REVIEW_URL` and `RESEND_API_KEY` are set.

---

## How it behaves once on

- One click marks the job `completed` **and** sends both channels.
- Channels are independent and **fail-closed**: a text failing does not stop the email, and a channel is only recorded `sent` after the provider accepts it (a failure is recorded `failed`).
- **Idempotent per channel:** once a channel has sent, it is never re-sent. After the first send the button becomes **"Retry unsent"**, which only sends channels that have not gone yet — so recovering a failed text never double-sends the email.
- No valid UK mobile on file → the SMS is skipped and only the email goes. Landlines are never texted.
- **Cost:** ~3.7p inc VAT per text; roughly £1–4/month at expected volume.
- **Compliance:** a post-job review request to a customer we have just served is treated as transactional, not marketing (so no consent gate), and it is a single one-off per job. Keep it that way — do not turn it into repeated review chasing without a consent/PECR review (contrast the consent-gated re-engagement in D-008).

---

## Changing SMS provider later (e.g. to Twilio)

The gateway is isolated in `server/netlify/functions/smsProvider.js` behind `sendSms()`. To switch: add a `sendViaTwilio()` adapter, branch to it under `activeProvider() === "twilio"`, then set `SMS_PROVIDER=twilio` plus the Twilio credentials in Netlify. The review-request flow itself does not change. This is the ~20-line swap noted in D-025.
