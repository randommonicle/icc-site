# Google Calendar integration + Mark's sharing guide

**Status:** Design note, 25 August 2026. Prepared after the 24 Aug Mark meeting (D-027, and the cross-business clash-check in the minutes §4.3). Relates to roadmap Phase 3 / D-005 (calendar). Not built yet; this is the how.
**Why:** The booking engine must avoid double-booking Mark across both businesses. His existing commitments (Regency jobs and personal) live in one phone diary today; Intelligent's bookings need their own calendar. This note covers (A) the idiot-proof steps for Mark to share his calendar from his phone, and (B) how the booking bot connects to Google Calendar.

**Status update (2026-09-04):** reconfirmed as the plan for the cross-business clash-check (Ben). NOT built yet (A3 open). Two things to settle BEFORE building the slice: (1) enumerate EVERY calendar holding Mark's commitments and confirm whether Regency is a separate Google account/calendar or his personal diary, so no calendar becomes a double-booking blind spot; (2) prove the auth/freebusy path with a throwaway read (see Part B's gotcha) before writing the slice. Then finalise Part A's sharing guide for the chosen identity (service-account email vs `ben@`). Tracked in `NEXT_SESSION.md`.

**Status update (2026-09-05):** the share/identity target is **mark_director@intelligentclean.co.uk** (Mark's director account, D-009, the operator who does the accepting), superseding the `ben@` default used in Part A's prose below. The Mark-facing steps are canonical in `docs/MARK_CALENDAR_GUIDE.md`. The auth mechanism (OAuth-as-ICC vs a service account) is still to be verified before building (Part B). This assumes Mark's Regency/personal calendar lives in a different Google account from `mark_director@`; confirm that when he shares.

---

## Pre-build verification — do this BEFORE writing the slice

The slice stays UNBUILT until both checks below pass. Order matters: settle the
topology first (a missed calendar is a silent double-booking blind spot), then
prove the auth/read path with a real read.

### Check 1 — Mark's calendar topology (ask Mark; resolve every line)

- [ ] **Which app holds the real appointments, Google or Samsung?** Samsung
  phones default to *Samsung Calendar*, whose events do NOT sync to Google. If
  Mark's Regency jobs live only in Samsung Calendar, sharing his Google calendar
  shares an EMPTY calendar and the clash-check silently sees no Regency busy
  time. This is the highest-risk blind spot. Confirm the jobs are visible in the
  Google Calendar app (or migrate/mirror Samsung to Google first).
- [ ] **One Google account or several?** Is the Regency diary in the SAME Google
  login as his personal calendar, or a different account? Enumerate every Google
  account that holds clashable commitments.
- [ ] **Every calendar, not just one.** Within each account, list every calendar
  holding appointments that could clash with cleaning work (primary, a separate
  personal/family one, and so on). Each must be shared separately (Part A repeats).
- [ ] **mark_director@ is separate.** The design assumes Mark's personal/Regency
  calendar is a DIFFERENT Google account from mark_director@intelligentclean.co.uk
  (the share target). Confirm it is; if Regency runs on the same Workspace, the
  share target and identity change.
- [ ] **No admin lock.** If any calendar is a "work/school" (managed Workspace)
  calendar, sharing to an outside address may be blocked (Part A's "no Add
  people" case). Note which, and plan an alternative for those.

Output: a definitive list of {account, calendar name, calendar id} the
clash-check must read, plus confirmation each is shared free/busy to the chosen
identity.

**Resolved (2026-09-05, from Mark):**
- Appointments live in **Google Calendar**, not Samsung Calendar (blind spot cleared).
- Two calendars only:
  1. **Regency diary** under **talktoregency@gmail.com** (a personal Gmail; no
     admin lock). This is the external calendar the clash-check must read
     free/busy.
  2. **Intelligent Clean** under **mark_director@intelligentclean.co.uk** (there
     is no plain `mark@`; it never existed, L-015). ICC's own calendar; the bot
     writes bookings here, so no external share is needed. The GCP project and
     service account are created under this same account.
- The ICC account is a different Google account from Regency (confirmed).
- Share target: the ICC **service-account email**, once created. Mark shares
  **talktoregency@gmail.com**'s calendar free/busy to it (Part A steps, swapping
  the service-account email in for `mark_director@`).

### Check 2 — prove the read path (one-real-ride)

Needs, first: (a) Mark has shared his calendar(s) free/busy to the chosen
identity, AND (b) a GCP service account exists (new project, enable the Calendar
API, create the service account, download its JSON key), per Part B's setup list.
The read CANNOT run until both exist; a share alone is not enough.

Then run the throwaway diagnostic:

    node --env-file=.env scripts/verify-calendar-freebusy.js

with `GCAL_CALENDAR_IDS` = the shared calendar id(s) and `GCAL_SA_KEY_FILE` = the
service-account JSON key path (optionally `GCAL_OAUTH_TOKEN` to test PATH 3). It
reads only, never writes, and prints a per-path verdict (freebusy vs events.list
vs OAuth). Take the path it reports as WORKS into the build; delete the script
after.

Only once both checks pass do we build the dormant slice (Part B setup step 6).

---

## Part A. For Mark: share your calendar (from your phone, 2 minutes)

**The one thing that was going wrong:** the sharing settings do not appear when you open **calendar.google.com in the phone's web browser**. You have to use the **Google Calendar app** (the icon with the coloured "31"). Everything below is in the app.

If you don't have the app yet, install "Google Calendar" from the Play Store first (Ben set this up on your phone at the meeting).

**Steps:**

1. Open the **Google Calendar app**.
2. Tap the **three lines** (☰) in the top-left corner.
3. Scroll down and tap **Settings**.
4. Tap the name of **your calendar** (usually your name or your email address, the one your appointments are in).
5. Tap **Add people or groups** (under the "Share with specific people" heading).
6. Type in **mark_director@intelligentclean.co.uk** and tap it when it appears.
7. Where it asks for permission, choose **"See only free/busy (hide details)"**.
8. Tap **Save** (or **Send**) in the top corner.

That's it. Ben gets an email, clicks one link, and it's done.

**If you keep appointments in more than one calendar** (for example a separate personal one), do steps 4 to 8 again for each one.

**What Ben can and cannot see:** because you chose "See only free/busy," the system sees **only that you are busy at a time**, never what the appointment is, who it is with, or any note. No personal detail leaves your phone. That is deliberate.

**If step 5 has no "Add people" option:** that calendar is a work or school one that an administrator has locked. Tell Ben and he'll sort an alternative.

---

## Part B. For Ben: the technical integration

**Is there an API?** Yes. The **Google Calendar API v3**. Two methods carry this:

- **`freebusy.query`**: the availability/clash-check. One POST returns only the **busy intervals** for a set of calendars (up to 50 per query), never event details. This is the privacy-preserving way to see when Mark is busy without reading his appointments. ([reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query))
- **`events.insert`**: writes a confirmed Intelligent booking into the Intelligent calendar so it shows on Mark's phone.

### How the pieces fit ICC (Netlify functions + Supabase)

- **Supabase `jobs` stays the system of record.** Google Calendar is a *mirror* (so Mark/staff see bookings in their calendar) plus a *second clash source* (Mark's other commitments). It does not replace the existing availability logic; it layers on top of it.
- **Create the "Intelligent Clean" calendar under the ICC Google account** (the Workspace login, Mark/business-owned per D-009, Ben-administered), so the bot can write to it reliably and it can be shared back to Mark's phone. Do **not** have Mark create it; keep ownership with ICC.
- **Auth: a Google Cloud service account** (JSON key in a Netlify env var, server-side only, same secrets rule as everything else). Steps: create a GCP project, enable the Calendar API, create a service account, download its JSON key, store it in Netlify. Share the Intelligent calendar with the service account's email ("Make changes to events"). Mark shares **his** calendar with the same identity as "See only free/busy" (Part A).
- **The one gotcha (verified Aug 2026):** `freebusy.query` run **as a service account** on calendars merely *shared* to it can be unreliable (it is designed around API-key/OAuth callers). Two robust ways round it:
  1. **Fallback to `events.list`** on the shared calendars and compute busy intervals from the events. `events.list` works reliably for a service account on a shared calendar. (We only need busy times, so read minimal fields.)
  2. **Or authenticate as the ICC Workspace account via OAuth** (a one-time consent, refresh token stored server-side). That identity *owns* the Intelligent calendar and has Mark's shared, so `freebusy` behaves.
  **Recommendation:** try the service-account + `freebusy` path first (lowest maintenance, no token refresh). If it returns access errors in a spike, switch that one read to `events.list`, or fall back to OAuth-as-ICC-account. Prove which works with a throwaway read before building the slice (one-real-ride).
- **Least-privilege scopes:** `calendar.readonly` (or `calendar.freebusy`) for reading Mark's side; `calendar.events` for writing the Intelligent calendar. Not full `calendar` unless needed.
- **Node:** the `googleapis` library. Keep the service-account JSON out of git; inject via Netlify env (JSON string or base64), parse server-side.
- **Cost:** the Calendar API is free at this volume.

### Booking flow with the calendar wired in

1. A booking request comes in. The function builds candidate start slots from the **new per-day hours (D-027, 1pm last start)**, the **one-week offset**, and the **15 to 20 minute travel buffer**.
2. `freebusy.query` (or `events.list`) over **[the Intelligent calendar + Mark's shared calendar]** drops any candidate that clashes with an existing Regency job, personal commitment, or Intelligent booking.
3. On confirm, `events.insert` writes the job to the Intelligent calendar, and the Supabase `jobs` row is written as today (the source of record).

### How you (Ben) link Intelligent Clean's calendar, in order

1. Create the "Intelligent Clean" calendar under the ICC Google account; note its **calendar ID** (Settings → the calendar → "Integrate calendar" → Calendar ID).
2. GCP: new project → enable Calendar API → create a service account → download the JSON key.
3. Share the Intelligent calendar with the service account email ("Make changes to events").
4. Ask Mark to share his calendar with that same service account email as "See only free/busy" (Part A, swap Ben's email for the service-account email if you prefer the bot to read directly; sharing to Ben's account also works if you go the OAuth-as-ICC route).
5. Put the calendar ID + the service-account JSON into Netlify env; reference the calendar ID for `events.insert` and both calendar IDs for the clash-check.
6. Build the slice dormant behind the presence of the calendar env vars (the house pattern), redeploy to activate (L-018).

### References

- Share a calendar on Android: [Google Calendar Help](https://support.google.com/calendar/answer/37082?hl=en&co=GENIE.Platform%3DAndroid)
- Free/busy query: [developers.google.com](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- API reference (events.insert etc.): [developers.google.com](https://developers.google.com/workspace/calendar/api/v3/reference)
