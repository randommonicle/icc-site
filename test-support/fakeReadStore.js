// A fake supabase-js client over CANNED ROWS for the operator-tool tests. Unlike the
// recording fake in test/read-only-client.test.js it actually executes the chain:
// eq / gte / lte filter the rows, order sorts, limit slices, and the projection is
// APPLIED (top-level and nested), so a row that carries extra columns (email, notes)
// only reaches the caller if the projection asked for them — which the real facade
// refuses. Sits behind createReadOnlyClient in the tests, so every tool's projection
// is checked by the real allowlist on the way through.
//
// tables: { name: rows[] | { error: {code, message} } }. A table absent from the map
// behaves like a missing relation (42P01), the pending-migration case.

function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function pick(row, projection) {
  if (row == null) return row;
  const out = {};
  for (const item of splitTop(projection)) {
    const m = /^([^(]+)\((.*)\)$/.exec(item);
    if (m) {
      const rel = m[1].trim();
      const v = row[rel];
      out[rel] = Array.isArray(v) ? v.map((x) => pick(x, m[2])) : (v == null ? null : pick(v, m[2]));
    } else {
      out[item] = row[item] === undefined ? null : row[item];
    }
  }
  return out;
}

function cmp(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a == null ? "" : a), sb = String(b == null ? "" : b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function fakeReadStore(tables) {
  const calls = [];
  function run(st) {
    const t = tables[st.table];
    if (t === undefined) return { data: null, error: { code: "42P01", message: 'relation "' + st.table + '" does not exist' } };
    if (t && !Array.isArray(t) && t.error) return { data: null, error: t.error };
    let rows = t.filter((r) => st.filters.every(([m, c, v]) => {
      const x = r[c];
      if (m === "eq") return String(x) === String(v);
      if (m === "gte") return cmp(x, v) >= 0;
      if (m === "lte") return cmp(x, v) <= 0;
      return false;
    }));
    if (st.order) {
      const [c, asc] = st.order;
      rows = rows.slice().sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]));
    }
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: rows.map((r) => pick(r, st.projection)), error: null };
  }
  function builder(table) {
    const st = { table, projection: null, filters: [], order: null, limit: null };
    const b = {
      select(p) { st.projection = p; return b; },
      eq(c, v) { st.filters.push(["eq", c, v]); return b; },
      gte(c, v) { st.filters.push(["gte", c, v]); return b; },
      lte(c, v) { st.filters.push(["lte", c, v]); return b; },
      order(c, o) { st.order = [c, !(o && o.ascending === false)]; return b; },
      limit(n) { st.limit = n; return b; },
      then(res, rej) { calls.push(st); return Promise.resolve(run(st)).then(res, rej); },
    };
    return b;
  }
  return { calls, from(table) { return builder(table); } };
}

module.exports = { fakeReadStore, pick };
