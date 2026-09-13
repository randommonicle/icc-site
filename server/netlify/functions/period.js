// Shared period parser for the expenses list and the P&L (D-039), so they cannot disagree
// on what a period means. from/to are YYYY-MM-DD, treated as UTC calendar days. Default
// (both absent): the current calendar month. Semantics:
//   - date columns (expenses.incurred_on):  from <= d <= to  (inclusive both ends).
//   - timestamp columns (receipt dates):    [from 00:00Z, (to + 1 day) 00:00Z)  -- so a
//     receipt at 23:59:59Z on `to` is IN and 00:00:00Z on the next day is OUT.
// YYYY-MM-DD compares lexically the same as chronologically, so from > to is a string test.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(s) {
  if (!DATE_RE.test(String(s || ""))) return false;
  return Number.isFinite(Date.parse(s + "T00:00:00Z"));
}

function currentMonthUTC(now) {
  const d = now ? new Date(now) : new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const iso = (x) => x.toISOString().slice(0, 10);
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
}

// Returns { from, to } (YYYY-MM-DD) or { error } (a message for a 400). now is injectable
// for the tests (drives the current-month default).
function parsePeriod(qs, now) {
  const q = qs || {};
  if (!q.from && !q.to) return currentMonthUTC(now);
  if (!q.from || !q.to) return { error: "Provide both from and to (YYYY-MM-DD), or neither." };
  if (!isValidDateStr(q.from) || !isValidDateStr(q.to)) return { error: "from and to must be YYYY-MM-DD dates." };
  if (q.from > q.to) return { error: "from must be on or before to." };
  return { from: q.from, to: q.to };
}

// End-exclusive timestamp bound for a `to` date: midnight UTC of the day AFTER `to`.
function endExclusiveISO(toDateStr) {
  return new Date(Date.parse(toDateStr + "T00:00:00Z") + 24 * 60 * 60 * 1000).toISOString();
}

module.exports = { parsePeriod, endExclusiveISO, currentMonthUTC, isValidDateStr };
