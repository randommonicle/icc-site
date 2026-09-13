// D-040 operator assistant — the read-only data facade the tool handlers get INSTEAD of
// the service-role client (Beta 4 slice 3; D-040 addendum "read-only enforcement is
// architectural, not a DB role").
//
// What a handler can do through it, and nothing else:
//   ro.from(table)                    table must be in the allowlist
//     .select("a,b,rel(c,d)")         explicit columns only, each in the table's allowlist;
//                                     ONE level of embed, only allowlisted relations and
//                                     their allowlisted columns; '*', aliases, casts, hints
//                                     (alias:col, col::text, rel!inner) all rejected
//     .eq(col, v) .gte(col, v) .lte(col, v) .order(col, opts)   col must be allowlisted
//     .limit(n)                       required; 1..MAX_LIMIT
//     await                           -> a fresh { data, error } (error reduced to
//                                        { code, message }); nothing else on the result
// Every other property access on the facade or any chain step THROWS (a Proxy get trap):
// insert / update / delete / upsert / rpc / storage / auth / channel / url / headers —
// whatever it is. The real builder lives in a closure and is never a property, so no
// reflection reaches it. Symbol keys, `constructor` and `toJSON` read as undefined so
// util.inspect / JSON.stringify / assert.deepStrictEqual do not trip the guard.
//
// This facade is the mechanism; test/module-boundary.test.js is the control that keeps
// supabaseClient.js itself out of the tools module (a facade is only as good as the
// promise that nobody bypasses it). A Postgres GRANT SELECT role was considered and
// rejected as disproportionate (D-040 addendum). CommonJS for the functions + `node --test`.

const MAX_LIMIT = 5000;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FILTERS = new Set(["eq", "gte", "lte"]);

function fail(msg) { throw new Error("readOnlyClient: " + msg); }

// Split a projection on top-level commas only ("a,b,rel(c,d)" -> ["a","b","rel(c,d)"]).
function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) fail("unbalanced parentheses in projection");
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (depth !== 0) fail("unbalanced parentheses in projection");
  out.push(cur);
  return out.map((x) => x.trim());
}

// Validate a projection against { cols:[...], rel:{ name:[...] } }; returns the
// normalised projection string PostgREST will receive.
function checkProjection(table, spec, projection) {
  if (typeof projection !== "string" || !projection.trim()) fail("select needs an explicit column list");
  const parts = [];
  for (const item of splitTopLevel(projection)) {
    if (!item) fail("empty item in projection");
    const m = /^([^(]+)\((.*)\)$/.exec(item);
    if (m) {
      const rel = m[1].trim();
      if (!IDENT.test(rel)) fail("bad relation token '" + rel + "'");
      const relCols = spec.rel && spec.rel[rel];
      if (!relCols) fail("relation '" + rel + "' is not allowlisted on " + table);
      const inner = splitTopLevel(m[2]);
      for (const c of inner) {
        if (!IDENT.test(c)) fail("bad column token '" + c + "' in " + rel + "(…)");
        if (!relCols.includes(c)) fail("column '" + rel + "." + c + "' is not allowlisted");
      }
      parts.push(rel + "(" + inner.join(",") + ")");
    } else {
      if (!IDENT.test(item)) fail("bad column token '" + item + "'");
      if (!spec.cols.includes(item)) fail("column '" + table + "." + item + "' is not allowlisted");
      parts.push(item);
    }
  }
  return parts.join(",");
}

function checkColumn(table, spec, col, method) {
  if (typeof col !== "string" || !IDENT.test(col) || !spec.cols.includes(col)) {
    fail(method + "() column '" + String(col) + "' is not allowlisted on " + table);
  }
}

// Wrap a plain object so that every property not defined on it throws.
function guard(obj, stage) {
  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "constructor" || prop === "toJSON") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      fail("'" + prop + "' is not permitted (read-only facade, " + stage + ")");
    },
    set() { fail("the facade is immutable"); },
    has(target, prop) { return Object.prototype.hasOwnProperty.call(target, prop); },
  });
}

function createReadOnlyClient(supabase, allowlist) {
  if (!supabase || typeof supabase.from !== "function") fail("a client with from() is required");
  if (!allowlist || typeof allowlist !== "object") fail("an allowlist is required");

  function chain(table, spec, state) {
    // state: { projection, ops:[{m, args}], limit }
    const step = {};
    if (!state.projection) {
      step.select = (projection) => chain(table, spec, Object.assign({}, state, { projection: checkProjection(table, spec, projection) }));
      return guard(step, table + " before select");
    }
    for (const m of FILTERS) {
      step[m] = (col, value) => {
        checkColumn(table, spec, col, m);
        return chain(table, spec, Object.assign({}, state, { ops: state.ops.concat([{ m, args: [col, value] }]) }));
      };
    }
    step.order = (col, opts) => {
      checkColumn(table, spec, col, "order");
      const o = opts && typeof opts === "object" ? { ascending: opts.ascending !== false } : undefined;
      return chain(table, spec, Object.assign({}, state, { ops: state.ops.concat([{ m: "order", args: o ? [col, o] : [col] }]) }));
    };
    step.limit = (n) => {
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) fail("limit must be an integer 1.." + MAX_LIMIT);
      return chain(table, spec, Object.assign({}, state, { limit: n }));
    };
    step.then = (onFulfilled, onRejected) => execute(table, state).then(onFulfilled, onRejected);
    return guard(step, table + " query");
  }

  async function execute(table, state) {
    if (!state.limit) fail("a .limit() is required before the query runs (" + table + ")");
    let q = supabase.from(table).select(state.projection);
    for (const op of state.ops) q = q[op.m](...op.args);
    q = q.limit(state.limit);
    const res = await q;
    const error = res && res.error
      ? { code: res.error.code == null ? null : String(res.error.code), message: String(res.error.message || "") }
      : null;
    const data = res && Array.isArray(res.data) ? res.data : (error ? null : []);
    return { data, error };
  }

  const root = {
    from(table) {
      const spec = Object.prototype.hasOwnProperty.call(allowlist, table) ? allowlist[table] : null;
      if (!spec || !Array.isArray(spec.cols)) fail("table '" + String(table) + "' is not allowlisted");
      return chain(table, spec, { projection: null, ops: [], limit: 0 });
    },
  };
  return guard(root, "client");
}

module.exports = { createReadOnlyClient, MAX_LIMIT };
