// scripts/supabase-auth-config.mjs: the D-046 owner step 1 (hosted Site URL + redirect
// allowlist) as one command through the Supabase Management API. The pure parts are tested
// here; `main` is exercised with a fake transport so no token and no network are needed.
// Properties under test: the refusal is a hard stop on anything but a literal
// disable_signup === true; nothing on the list already there is dropped; the printed report
// never carries a secret-shaped field; the PATCH body is exactly two fields.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MOD = pathToFileURL(path.join(__dirname, "..", "scripts", "supabase-auth-config.mjs")).href;
const load = () => import(MOD);

// The secret-bearing names in the Management API's AuthConfigResponse_Output schema
// (https://api.supabase.com/api/v1-json, read 19 Sept 2026), a representative subset.
const SECRET_FIELDS = [
  "smtp_pass", "security_captcha_secret", "hook_send_email_secrets", "hook_custom_access_token_secrets",
  "external_google_secret", "external_github_secret", "sms_twilio_auth_token", "sms_vonage_api_key",
  "sms_vonage_api_secret", "sms_messagebird_access_key", "sms_textlocal_api_key", "nimbus_oauth_client_secret",
];

function hostedLike(over = {}) {
  const c = {
    site_url: "http://localhost:3000",
    uri_allow_list: "",
    disable_signup: true,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_otp_exp: 3600,
    mailer_secure_email_change_enabled: true,
    password_min_length: 6,
    rate_limit_email_sent: 2,
    smtp_host: null,
    smtp_sender_name: null,
    mailer_subjects_recovery: "Reset Your Password",
    mailer_templates_recovery_content: null,
    rate_limit_token_refresh: 150,
  };
  for (const k of SECRET_FIELDS) c[k] = `SECRET-VALUE-${k}`;
  return Object.assign(c, over);
}

test("the four admin redirect URLs, and the preview wildcard is a single * (cannot cross . or /)", async () => {
  const m = await load();
  assert.deepStrictEqual([...m.ADMIN_REDIRECTS], [
    "https://super-frangollo-c3a14a.netlify.app/admin",
    "https://www.intelligentclean.co.uk/admin",
    "https://intelligentclean.co.uk/admin",
    "https://*--super-frangollo-c3a14a.netlify.app/admin",
  ]);
  for (const u of m.ADMIN_REDIRECTS) {
    assert.ok(!u.includes("**"), `${u}: a ** wildcard also matches an attacker's host whose path carries the suffix`);
    assert.ok(u.endsWith("/admin"), `${u}: the page always sends origin + /admin`);
    assert.ok(u.startsWith("https://"), `${u}: https only`);
  }
  assert.strictEqual(m.DEFAULT_SITE_URL, "https://super-frangollo-c3a14a.netlify.app");
  assert.strictEqual(m.PROJECT_REF, "qzcfgpfvzpynnjgriqqn");
});

test("refusal: only a literal disable_signup === true passes", async () => {
  const { refusal } = await load();
  assert.strictEqual(refusal(hostedLike()), null);
  for (const v of [false, null, undefined, "true", 1]) {
    const r = refusal(hostedLike({ disable_signup: v }));
    assert.ok(r && /sign-ups are NOT disabled/.test(r), `disable_signup=${JSON.stringify(v)} must refuse, got ${r}`);
  }
  assert.ok(/no auth config/.test(refusal(null)));
});

test("mergeAllowList keeps pre-existing entries, dedupes, appends ours in order; --replace sets exactly ours", async () => {
  const m = await load();
  const current = " http://localhost:3000/** , https://www.intelligentclean.co.uk/admin,, ";
  assert.deepStrictEqual(m.splitAllowList(current), ["http://localhost:3000/**", "https://www.intelligentclean.co.uk/admin"]);
  assert.deepStrictEqual(m.splitAllowList(null), []);
  assert.deepStrictEqual(m.mergeAllowList(current), [
    "http://localhost:3000/**",
    "https://www.intelligentclean.co.uk/admin",
    "https://super-frangollo-c3a14a.netlify.app/admin",
    "https://intelligentclean.co.uk/admin",
    "https://*--super-frangollo-c3a14a.netlify.app/admin",
  ]);
  assert.deepStrictEqual(m.mergeAllowList(current, m.ADMIN_REDIRECTS, { replace: true }), [...m.ADMIN_REDIRECTS]);
  assert.deepStrictEqual(m.mergeAllowList(""), [...m.ADMIN_REDIRECTS]);
});

test("buildPatchBody is exactly two fields; the site URL is overridable for the cutover", async () => {
  const m = await load();
  const body = m.buildPatchBody(hostedLike({ uri_allow_list: "http://localhost:3000/**" }));
  assert.deepStrictEqual(Object.keys(body).sort(), ["site_url", "uri_allow_list"]);
  assert.strictEqual(body.site_url, "https://super-frangollo-c3a14a.netlify.app");
  assert.strictEqual(body.uri_allow_list, "http://localhost:3000/**," + m.ADMIN_REDIRECTS.join(","));
  const cut = m.buildPatchBody(hostedLike(), { siteUrl: "https://www.intelligentclean.co.uk", replace: true });
  assert.strictEqual(cut.site_url, "https://www.intelligentclean.co.uk");
  assert.strictEqual(cut.uri_allow_list, m.ADMIN_REDIRECTS.join(","));
});

test("parseArgs: flags, the site-url shape (an https origin, no path, no comma), unknown flags refused", async () => {
  const { parseArgs } = await load();
  assert.deepStrictEqual(parseArgs([]), { apply: false, replace: false, disableSignups: false, siteUrl: "https://super-frangollo-c3a14a.netlify.app", ref: "qzcfgpfvzpynnjgriqqn", help: false });
  assert.ok(parseArgs(["--disable-signups"]).disableSignups);
  assert.strictEqual(parseArgs(["--apply", "--replace", "--site-url", "https://www.intelligentclean.co.uk"]).siteUrl, "https://www.intelligentclean.co.uk");
  assert.ok(parseArgs(["--apply"]).apply);
  assert.throws(() => parseArgs(["--site-url", "https://x.example/admin"]), /no path/);
  assert.throws(() => parseArgs(["--site-url", "http://x.example"]), /https/);
  assert.throws(() => parseArgs(["--site-url", "https://a.example,https://b.example"]), /comma/);
  assert.throws(() => parseArgs(["--ref", "short"]), /20-letter/);
  assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
});

test("loadToken: environment first, then the .env line; never another key; missing is an error", async () => {
  const { loadToken } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icc-auth-config-"));
  const envFile = path.join(dir, ".env");
  try {
    fs.writeFileSync(envFile, "ANTHROPIC_API_KEY=sk-not-this\r\nSUPABASE_ACCESS_TOKEN=sbp_from_file\r\nOTHER=x\n");
    assert.strictEqual(loadToken(envFile, {}), "sbp_from_file");
    assert.strictEqual(loadToken(envFile, { SUPABASE_ACCESS_TOKEN: " sbp_from_env " }), "sbp_from_env");
    fs.writeFileSync(envFile, 'SUPABASE_ACCESS_TOKEN="sbp_quoted"\n');
    assert.strictEqual(loadToken(envFile, {}), "sbp_quoted");
    fs.writeFileSync(envFile, "ANTHROPIC_API_KEY=sk-not-this\n");
    assert.throws(() => loadToken(envFile, {}), /SUPABASE_ACCESS_TOKEN is not set in/);
    assert.throws(() => loadToken(path.join(dir, "missing.env"), {}), /no .env was found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the report prints only the named fields and never a secret value; the checks and the body are on it", async () => {
  const m = await load();
  const cfg = hostedLike({ uri_allow_list: "http://localhost:3000/**", mailer_otp_exp: 86400, mailer_templates_recovery_content: "<a href=\"{{ .TokenHash }}\">x</a>" });
  for (const k of SECRET_FIELDS) assert.ok(!m.REPORTED_FIELDS.includes(k), `${k} must not be a reported field`);
  const body = m.buildPatchBody(cfg);
  const report = m.formatReport(cfg, body, { apply: false, ref: m.PROJECT_REF });
  for (const k of SECRET_FIELDS) assert.ok(!report.includes(`SECRET-VALUE-${k}`), `the report leaked ${k}`);
  assert.ok(!report.includes("rate_limit_token_refresh"), "an unlisted field is not printed");
  assert.ok(report.includes("OK   sign-ups are disabled"));
  assert.ok(report.includes("DRY RUN, nothing sent"));
  assert.ok(report.includes("WARN mailer_otp_exp is 86400"));
  assert.ok(report.includes("WARN the recovery email template does not carry {{ .ConfirmationURL }}"));
  assert.ok(report.includes("pre-existing allowlist entries (kept unless --replace): http://localhost:3000/**"));
  assert.ok(report.includes(`  uri_allow_list: ${body.uri_allow_list}`));
  assert.ok(report.includes("  site_url:       https://super-frangollo-c3a14a.netlify.app"));
  const stopped = m.formatReport(hostedLike({ disable_signup: false }), body, { apply: true, ref: m.PROJECT_REF });
  assert.ok(stopped.includes("STOP sign-ups are NOT disabled"));
  assert.ok(m.formatReport(hostedLike(), body, { apply: true, ref: m.PROJECT_REF }).includes("PATCH body (sending now)"));
  const summary = JSON.stringify(m.summarise(cfg));
  for (const k of SECRET_FIELDS) assert.ok(!summary.includes(`SECRET-VALUE-${k}`), `summarise leaked ${k}`);
  assert.strictEqual(m.recoveryTemplateState(hostedLike()), "not customised (Supabase's own template)");
  assert.strictEqual(m.recoveryTemplateState(hostedLike({ mailer_templates_recovery_content: "<a href=\"{{ .ConfirmationURL }}\">r</a>" })), "customised, carries {{ .ConfirmationURL }}");
});

// main() with a fake transport: the sequence of calls is the contract.
async function runMain(m, argv, config, { patchResult, afterConfig } = {}) {
  const calls = [];
  const fetchImpl = async (method, url, token, body) => {
    calls.push({ method, url, body });
    assert.strictEqual(token, "sbp_test_token");
    if (method === "GET") return calls.filter((c) => c.method === "GET").length === 1 ? config : (afterConfig || { ...config, ...calls.find((c) => c.method === "PATCH").body });
    if (method === "PATCH") return patchResult || {};
    throw new Error("unexpected " + method);
  };
  const logs = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a) => logs.push(a.join(" "));
  console.error = (...a) => logs.push("ERR " + a.join(" "));
  const prevToken = process.env.SUPABASE_ACCESS_TOKEN;
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_test_token";
  try {
    const code = await m.main(argv, { fetchImpl });
    return { code, calls, out: logs.join("\n") };
  } finally {
    console.log = origLog; console.error = origErr;
    if (prevToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN; else process.env.SUPABASE_ACCESS_TOKEN = prevToken;
  }
}

test("main: a dry run is one GET and no PATCH", async () => {
  const m = await load();
  const r = await runMain(m, [], hostedLike());
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.calls.map((c) => c.method), ["GET"]);
  assert.strictEqual(r.calls[0].url, "https://api.supabase.com/v1/projects/qzcfgpfvzpynnjgriqqn/config/auth");
  assert.ok(r.out.includes("DRY RUN"));
});

test("main --apply: GET, PATCH with exactly the two fields, GET back, exit 0 when both values landed", async () => {
  const m = await load();
  const r = await runMain(m, ["--apply"], hostedLike({ uri_allow_list: "http://localhost:3000/**" }));
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.calls.map((c) => c.method), ["GET", "PATCH", "GET"]);
  assert.deepStrictEqual(r.calls[1].body, {
    site_url: "https://super-frangollo-c3a14a.netlify.app",
    uri_allow_list: "http://localhost:3000/**," + m.ADMIN_REDIRECTS.join(","),
  });
  assert.ok(r.out.includes("every value matches what was sent"));
});

test("main --apply --disable-signups: disable_signup: true rides as a third field, the pre-check is skipped, the read-back must show true", async () => {
  const m = await load();
  const live = hostedLike({ disable_signup: false }); // the hosted state read on 19 Sept 2026
  const fixed = await runMain(m, ["--apply", "--disable-signups"], live);
  assert.strictEqual(fixed.code, 0);
  assert.deepStrictEqual(fixed.calls.map((c) => c.method), ["GET", "PATCH", "GET"]);
  assert.deepStrictEqual(fixed.calls[1].body, { site_url: "https://super-frangollo-c3a14a.netlify.app", uri_allow_list: m.ADMIN_REDIRECTS.join(","), disable_signup: true });
  assert.ok(fixed.out.includes("disable_signup: true"));
  const ignored = await runMain(m, ["--apply", "--disable-signups"], live, {
    afterConfig: hostedLike({ disable_signup: false, site_url: "https://super-frangollo-c3a14a.netlify.app", uri_allow_list: m.ADMIN_REDIRECTS.join(",") }),
  });
  assert.strictEqual(ignored.code, 2, "a read-back that still says false is a mismatch");
  assert.ok(ignored.out.includes("MISMATCH"));
  assert.ok(!("disable_signup" in m.buildPatchBody(live)), "without the flag the body stays two fields");
});

test("main --apply refuses (exit 2, no PATCH) when sign-ups are on, and exits 2 when the read-back differs", async () => {
  const m = await load();
  const refused = await runMain(m, ["--apply"], hostedLike({ disable_signup: false }));
  assert.strictEqual(refused.code, 2);
  assert.deepStrictEqual(refused.calls.map((c) => c.method), ["GET"]);
  assert.ok(refused.out.includes("ERR REFUSED: sign-ups are NOT disabled"));
  const drifted = await runMain(m, ["--apply"], hostedLike(), { afterConfig: hostedLike({ site_url: "http://localhost:3000" }) });
  assert.strictEqual(drifted.code, 2);
  assert.ok(drifted.out.includes("MISMATCH"));
});

test("main: a transport error surfaces as a rejection, so the runner prints FAILED and exits 1", async () => {
  const m = await load();
  const prevToken = process.env.SUPABASE_ACCESS_TOKEN;
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_test_token";
  const origLog = console.log; console.log = () => {};
  try {
    await assert.rejects(m.main([], { fetchImpl: async () => { throw new Error("GET https://api.supabase.com/... answered 401: Unauthorized"); } }), /answered 401/);
  } finally {
    console.log = origLog;
    if (prevToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN; else process.env.SUPABASE_ACCESS_TOKEN = prevToken;
  }
});
