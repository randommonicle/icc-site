# Stripe setup — step by step (for Ben/Mark)

**Decided:** Stripe is the payment processor (D-004), reusing the D-026 mechanism
(a provider adapter + a signed webhook, dormant behind `STRIPE_SECRET_KEY`).
First slice is the **deposit pay-link**. It is built and tested in **Test mode**
first; live deposit-taking is **gated** on the `/terms` cancellation/refund terms
being signed off (LEGAL_REVIEW_TERMS_2026-09.md, T-1/T-3) and go-live.

**Ownership (D-009):** create the account under **Mark's** business email so ICC
owns it, then add Ben as a team member. Same pattern as Resend.

---

## ⚠️ One hard rule about the keys

**Never paste a Stripe secret key (`sk_test_…`, `sk_live_…`) or a webhook signing
secret (`whsec_…`) into this AI chat, an email, or a message.** They go **straight
into Netlify's environment variables** and nowhere else. I build the integration
without ever seeing the key. If a key is ever exposed, roll it in the Stripe
dashboard immediately.

---

## Part 1 — Do now (Test mode, ~10 minutes)

1. **Create the account.** Go to **https://dashboard.stripe.com/register** and
   sign up with **Mark's business email**. You do **not** need to complete full
   business activation to work in Test mode, so you can stop at the basic account.

2. **Add Ben to the team.** Settings → **Team and security** →
   **https://dashboard.stripe.com/settings/team** → invite Ben's email as an
   administrator (or Developer).

3. **Make sure you are in TEST MODE.** Top-right of the dashboard there is a
   **Test mode** toggle. It must be **on** (the dashboard shows "Test data").
   Everything below is test-only, no real money.

4. **Copy the test Secret key.** Developers → **API keys** →
   **https://dashboard.stripe.com/test/apikeys**. You will see:
   - **Publishable key** `pk_test_…` (safe, not needed for this flow).
   - **Secret key** `sk_test_…` → click **Reveal**, copy it. This is the one that
     matters, and the one that never goes in chat (see the hard rule above).

5. **Hold the key for now.** Do **not** add it to Netlify yet. I will tell you the
   exact moment to add `STRIPE_SECRET_KEY` (and the webhook secret below) once the
   dormant code is deployed, so we switch it on in test mode in one go.

6. **The webhook comes after I deploy the function.** The deposit is only "really
   paid" when Stripe tells us via a **webhook**, and Stripe needs the live URL of
   our function to send it to. So the order is: I deploy the dormant
   `stripe-webhook` function → I give you the endpoint URL → you add it at
   Developers → **Webhooks** → **https://dashboard.stripe.com/test/webhooks** →
   "Add endpoint", paste the URL, select the event **`checkout.session.completed`**
   → then copy the **Signing secret** `whsec_…` it shows.

7. **When I say go**, add these three to **Netlify → Site settings → Environment
   variables** (add for **all scopes**, never a single scope, L-018):
   - `STRIPE_SECRET_KEY` = the `sk_test_…` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` signing secret
   - `PUBLIC_SITE_URL` = the site's own origin (Test mode:
     `https://super-frangollo-c3a14a.netlify.app`; at go-live, the production
     domain). **Required:** the auto-confirm booking path does not pass a request
     origin, so the Checkout success/cancel URLs fall back to this. Without it they
     point at the production parking page and the post-payment redirect dead-ends
     (D-036).
   Then **trigger a redeploy** (Deploys → Trigger deploy). Netlify functions only
   read env vars from a fresh deploy, so the keys are inert until you redeploy.

**Test card (for when we test the flow):** `4242 4242 4242 4242`, any future
expiry, any 3-digit CVC, any postcode. Full list: **https://stripe.com/docs/testing**.

---

## Part 2 — Later, at go-live (gated, do not do yet)

Only when the `/terms` cancellation/refund terms are signed off and the site is
going live:

1. **Activate the account for live payments.** Stripe will prompt "Activate
   payments" / onboarding: business type **sole trader**, Mark's details, and a
   **bank account for payouts** (your **Revolut Pro** sort code + account number
   works fine).
2. **Get the live keys** (`sk_live_…`) and register a **live** webhook endpoint
   for the production URL, giving a live `whsec_…`.
3. Swap the Netlify env vars from the test keys to the live keys, redeploy, and do
   one real end-to-end test with a real card and a small real deposit before
   relying on it.

**Fees for the record (D-004):** UK cards ~1.5% + 20p. Revolut Merchant (~0.8% +
2p) stays a swappable alternative behind the adapter if the fee gap ever matters.

---

## What I need back from you

- Confirmation the **account exists in Test mode** and Ben is on the team.
- **Nothing else yet.** Do not send me any key. I will build against a fake Stripe,
  deploy the dormant function, give you the webhook URL, and then walk you through
  switching it on with your test keys.
