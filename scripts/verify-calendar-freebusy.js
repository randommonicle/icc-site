#!/usr/bin/env node
// Throwaway diagnostic — prove WHICH Google Calendar read path works before we
// build the cross-business clash-check slice (docs/CALENDAR_INTEGRATION.md,
// Part B, "The one gotcha"). This is the one-real-ride the design requires.
//
// The question it answers: over Mark's *shared* free/busy calendar(s), does
//   PATH 1  a service account calling freebusy.query return busy intervals,
//   PATH 2  events.list (same service account) return usable busy times, or
//   PATH 3  do we need OAuth-as-ICC (freebusy as the account that owns the
//           calendar) instead?
// The design's recommendation is PATH 1 (no token refresh); this proves it.
//
// It only READS. It never writes an event. Delete it once the path is chosen.
//
// REQUIRES (set in the shell, or `node --env-file=.env scripts/verify-calendar-freebusy.js`):
//   GCAL_CALENDAR_IDS   comma-separated calendar IDs to probe. Use Mark's SHARED
//                       calendar id(s) — that is the case the gotcha is about.
//                       A calendar id is an email address or ends
//                       @group.calendar.google.com (Google Calendar → Settings →
//                       the calendar → "Integrate calendar" → Calendar ID).
//   plus ONE OR MORE identities to test:
//   GCAL_SA_KEY_FILE    path to the service-account JSON key  -> tests PATH 1 + 2
//     (or GCAL_SA_KEY_JSON  the same JSON inline as a string)
//   GCAL_OAUTH_TOKEN    a short-lived OAuth access token for the ICC account
//                       (google-oauth playground or gcloud) -> tests PATH 3
//
// OPTIONAL:
//   GCAL_WINDOW_DAYS    how far ahead to probe (default 14)
//
// Read-only. Exit 0 if at least one path returned busy data (or a clean empty
// result), 1 if every attempted path errored or nothing was configured.

const crypto = require("node:crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
// calendar.readonly covers both freebusy.query and events.list.
const READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- config ---------------------------------------------------------------

const calendarIds = (process.env.GCAL_CALENDAR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (calendarIds.length === 0) {
  fail(
    "Missing GCAL_CALENDAR_IDS (comma-separated calendar ids to probe).\n" +
      "Use Mark's SHARED calendar id(s). See the header of this file."
  );
}

const windowDays = Number(process.env.GCAL_WINDOW_DAYS || 14);
const timeMin = new Date();
const timeMax = new Date(timeMin.getTime() + windowDays * 24 * 60 * 60 * 1000);
const window = { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };

function loadServiceAccount() {
  let raw = process.env.GCAL_SA_KEY_JSON;
  if (!raw && process.env.GCAL_SA_KEY_FILE) {
    raw = require("node:fs").readFileSync(process.env.GCAL_SA_KEY_FILE, "utf8");
  }
  if (!raw) return null;
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    fail(`GCAL_SA_KEY_* is not valid JSON: ${e.message}`);
  }
  if (!sa.client_email || !sa.private_key) {
    fail("Service-account JSON is missing client_email / private_key.");
  }
  // Inline env values often arrive with escaped newlines; restore them.
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

// --- auth: service-account JWT -> access token ----------------------------

async function serviceAccountToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: READ_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key);
  const assertion = `${unsigned}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `token exchange failed (${res.status}): ${body.error || ""} ${body.error_description || JSON.stringify(body)}`
    );
  }
  return body.access_token;
}

// --- reads ----------------------------------------------------------------

async function freebusy(token) {
  const res = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`freebusy HTTP ${res.status}: ${JSON.stringify(body.error || body)}`);
  }
  return body.calendars || {};
}

async function eventsList(token, calId) {
  const qs = new URLSearchParams({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    fields: "items(status,start,end)",
  });
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calId)}/events?${qs}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`events.list HTTP ${res.status}: ${JSON.stringify(body.error || body)}`);
  }
  const busy = (body.items || [])
    .filter((e) => e.status !== "cancelled" && e.start && e.end)
    .map((e) => ({ start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date }));
  return busy;
}

// Did freebusy actually return usable data, or per-calendar errors?
function reportFreebusy(label, calendars) {
  let anyBusyOrClean = false;
  for (const id of calendarIds) {
    const entry = calendars[id];
    if (!entry) {
      console.log(`    ${id}: no entry returned`);
      continue;
    }
    if (entry.errors && entry.errors.length) {
      console.log(`    ${id}: ERROR ${entry.errors.map((e) => e.reason).join(", ")}`);
      continue;
    }
    anyBusyOrClean = true;
    const n = (entry.busy || []).length;
    console.log(`    ${id}: ${n} busy interval(s)` + (n ? ` e.g. ${entry.busy[0].start} -> ${entry.busy[0].end}` : " (calendar is free in window)"));
  }
  return anyBusyOrClean;
}

// --- run ------------------------------------------------------------------

(async () => {
  console.log(`Probing ${calendarIds.length} calendar(s) over ${window.timeMin} -> ${window.timeMax}\n`);

  const sa = loadServiceAccount();
  const oauthToken = process.env.GCAL_OAUTH_TOKEN || null;

  if (!sa && !oauthToken) {
    fail(
      "No identity configured. Set GCAL_SA_KEY_FILE (or GCAL_SA_KEY_JSON) to test\n" +
        "PATHS 1 & 2, and/or GCAL_OAUTH_TOKEN to test PATH 3. See the header."
    );
  }

  const verdict = { path1: null, path2: null, path3: null };

  if (sa) {
    console.log(`Service account: ${sa.client_email}`);
    let token;
    try {
      token = await serviceAccountToken(sa);
      console.log("  token exchange: OK\n");
    } catch (e) {
      console.log(`  token exchange: FAILED — ${e.message}\n`);
    }

    if (token) {
      console.log("PATH 1 — service account + freebusy.query:");
      try {
        verdict.path1 = reportFreebusy("sa-freebusy", await freebusy(token));
      } catch (e) {
        verdict.path1 = false;
        console.log(`    FAILED — ${e.message}`);
      }
      console.log("");

      console.log("PATH 2 — service account + events.list (fallback):");
      verdict.path2 = true;
      for (const id of calendarIds) {
        try {
          const busy = await eventsList(token, id);
          console.log(`    ${id}: ${busy.length} busy interval(s)` + (busy.length ? ` e.g. ${busy[0].start} -> ${busy[0].end}` : " (no events in window)"));
        } catch (e) {
          verdict.path2 = false;
          console.log(`    ${id}: FAILED — ${e.message}`);
        }
      }
      console.log("");
    }
  }

  if (oauthToken) {
    console.log("PATH 3 — OAuth-as-ICC + freebusy.query:");
    try {
      verdict.path3 = reportFreebusy("oauth-freebusy", await freebusy(oauthToken));
    } catch (e) {
      verdict.path3 = false;
      console.log(`    FAILED — ${e.message}`);
    }
    console.log("");
  }

  // --- verdict ---
  console.log("=== VERDICT ===");
  const line = (name, v) =>
    console.log(`  ${name}: ${v === null ? "not tested" : v ? "WORKS" : "does not work"}`);
  line("PATH 1 service-account freebusy", verdict.path1);
  line("PATH 2 service-account events.list", verdict.path2);
  line("PATH 3 OAuth-as-ICC freebusy", verdict.path3);

  if (verdict.path1) {
    console.log("\n-> Use PATH 1 (service account + freebusy). Lowest maintenance, matches the design's recommendation.");
    process.exit(0);
  }
  if (verdict.path2) {
    console.log("\n-> PATH 1 unreliable; use PATH 2 (service account + events.list). Compute busy intervals from events.");
    process.exit(0);
  }
  if (verdict.path3) {
    console.log("\n-> Service-account paths failed; use PATH 3 (OAuth-as-ICC). Store a refresh token server-side.");
    process.exit(0);
  }
  console.log("\n-> No path returned data. Check: is the calendar actually shared to this identity? Is the Calendar API enabled on the GCP project? Are the calendar ids correct?");
  process.exit(1);
})().catch((e) => fail(`Unexpected error: ${e.stack || e.message}`));
