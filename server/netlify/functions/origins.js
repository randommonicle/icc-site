// Origin allowlist + CORS for the endpoints that spend money or write shared state.
//
// Extracted from chat.js (Beta 4 prerequisite, D-040 guardrail 4) so the operator
// assistant (operatorChat.js) shares ONE origin policy with the customer chat instead
// of forking a divergent copy (guard-the-spend-paths). The behaviour is exactly what
// chat.js had; only the home moved. rateLimit.js is the matching per-IP half.
//
// Order of precedence for the allowlist:
//   1. The ALLOWED_ORIGINS env var (comma-separated) if explicitly set — strict
//      mode: an unrecognised origin is 403'd. The site's OWN Netlify deploy
//      origins (see netlifyDeployOrigins) are ALWAYS folded in, even here, so
//      setting ALLOWED_ORIGINS to lock the public domain never 403s the
//      .netlify.app host or a deploy preview the team tests on (the L-001 safe
//      variant — strict mode without locking ourselves out).
//   2. Netlify's auto-injected URL / DEPLOY_URL / DEPLOY_PRIME_URL — these
//      always reflect the real deployed domain (production, branch deploys and
//      deploy previews), so a default-named Netlify site works without config.
//   3. A small set of common dev/prod fallbacks (fail-open mode only).
//
// When ALLOWED_ORIGINS is unset we fail OPEN with a warning rather than 403
// every customer — the per-IP rate limit is the real defence on the customer
// paths; the operator path adds requireAdmin + the atomic turn budget on top.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

function normaliseOrigins(list){
  const seen = new Set();
  const out = [];
  for(const o of list){
    if(!o) continue;
    const n = String(o).replace(/\/+$/, ""); // strip trailing slashes
    if(n && !seen.has(n)){ seen.add(n); out.push(n); }
  }
  return out;
}

// The site's own Netlify deploy origins: URL is the production / custom-domain
// host, DEPLOY_URL the unique per-deploy host, DEPLOY_PRIME_URL the branch-deploy
// / deploy-preview host. Allowed in BOTH modes so locking the public domain via
// ALLOWED_ORIGINS does not 403 the .netlify.app or a preview (L-001).
function netlifyDeployOrigins(){
  return [process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL];
}

// Reads process.env at call time (test/origins.test.js drives it directly).
function buildAllowedOrigins(){
  const explicit = process.env.ALLOWED_ORIGINS;
  if(explicit){
    const listed = explicit.split(",").map(s => s.trim()).filter(Boolean);
    // Strict mode still trusts the site's own deploy origins (L-001 safe variant).
    return normaliseOrigins(listed.concat(netlifyDeployOrigins()));
  }
  // Fail-open default: the deploy origins plus the known prod domains + localhost.
  return normaliseOrigins(netlifyDeployOrigins().concat([
    "https://intelligentclean.co.uk",
    "https://www.intelligentclean.co.uk",
    "http://localhost:8888",
    "http://localhost:3000"
  ]));
}

// The request's origin: the Origin header, else the Referer's origin, else "".
function getOrigin(event){
  const raw = event.headers.origin || event.headers.referer || "";
  if(!raw) return "";
  try { const u = new URL(raw); return u.origin; } catch(e){ return ""; }
}

// Snapshot the env-derived allowlist + mode ONCE (chat.js always did this at module
// load, so a function instance keeps one policy for its lifetime) and return the two
// per-request operations every guarded endpoint needs. opts.methods / opts.headers
// set the CORS allow lists (the operator endpoint needs Authorization); opts.log is
// a test seam for the two diagnostic lines.
function createOriginPolicy(opts){
  const o = opts || {};
  const allowed = buildAllowedOrigins();
  const strict = process.env.ALLOWED_ORIGINS ? true : false;
  const methods = o.methods || "POST, OPTIONS";
  const headers = o.headers || "Content-Type";
  const log = o.log || console.log;

  function corsHeaders(origin){
    // In strict mode echo allowed origins only. In fail-open mode echo the
    // request's origin so the browser actually accepts the response — otherwise
    // a CORS mismatch hides the real response body from the client.
    const ok = origin && allowed.includes(origin);
    let allow;
    if(ok) allow = origin;
    else if(!strict && origin) allow = origin;
    else allow = allowed[0] || "*";
    return {
      "Access-Control-Allow-Origin": allow,
      "Vary": "Origin",
      "Access-Control-Allow-Headers": headers,
      "Access-Control-Allow-Methods": methods
    };
  }

  // { ok:true } when the request may proceed. An absent origin (curl, a same-origin
  // fetch without the header) passes in both modes. In strict mode an unrecognised
  // origin is refused; in fail-open mode it is logged and let through — the rate
  // limit is the real defence and a 403 storm would be much more visible than abuse.
  function check(origin){
    if(!origin || allowed.includes(origin)) return { ok: true };
    if(strict){
      log("Rejected origin:", origin, "allowed:", allowed.join(","));
      return { ok: false, status: 403, error: "Forbidden origin" };
    }
    log("Unrecognised origin (fail-open):", origin, "allowed defaults:", allowed.join(","));
    return { ok: true, unrecognised: true };
  }

  return { allowed, strict, corsHeaders, check };
}

module.exports = { buildAllowedOrigins, getOrigin, createOriginPolicy };
