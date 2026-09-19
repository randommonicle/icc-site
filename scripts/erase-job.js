#!/usr/bin/env node
// Erase one job from the Postgres store, photo bytes included (UK GDPR Art.17, the jobs
// half of the A5 erasure procedure; the handoff half is the admin "Erase lead" action).
//
// Why a script and not plain SQL: deleting the jobs row cascades job_photos and
// job_assessments, but a Storage object is only removed through the Storage API, so a
// SQL delete would leave the customer's photo bytes in the bucket with nothing pointing
// at them (D-047). This runs jobPhotoStore.deleteJobPhotos FIRST, then the row.
//
// What it refuses: a job with an invoice (invoices -> jobs is ON DELETE RESTRICT on
// purpose: financial records keep for around six years, the privacy notice says so; an
// erasure request against an invoiced job is a retention question for Mark, not a delete).
// What it leaves: messages and expenses rows keep their content with job_id set to null
// (their FKs are ON DELETE SET NULL); with --with-customer the customer row goes too, but
// only when no other job references it (jobs -> customers is RESTRICT), and their
// messages cascade with it.
//
// Accepted residual (cross-agent review, GPT round 2, 19 Sept 2026): the invoice check and
// the job delete are two statements, so an invoice created between them makes the delete
// fail AFTER the photos are gone. The end state, "photo bytes erased, invoiced job kept",
// is one the operator can live with (a photo is not part of the financial record) and the
// script reports exactly that; a supabase-js client has no transaction to close the gap,
// and the window is one operator running two actions on one job in the same second.
//
// Usage (run from the checkout that holds the real .env; read-only until --delete):
//   node scripts/erase-job.js <job uuid>                        report what would go
//   node scripts/erase-job.js <job uuid> --delete               photos (objects + rows), then the job
//   node scripts/erase-job.js <job uuid> --delete --with-customer   ... and the customer when unreferenced
// Verify the requester's identity first (Art.12(6)) and keep a note of the request; the
// matching booking emails in Mark's mailbox are a separate, manual step (as for handoffs).

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { deleteJobPhotos } = require("../server/netlify/functions/jobPhotoStore.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

async function count(supabase, table, col, id) {
  const { count: n, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(col, id);
  if (error) throw new Error(`${table}: ${error.message}`);
  return n || 0;
}

// Read everything the erasure would touch. Never writes.
async function reportJob(supabase, jobId) {
  if (!UUID.test(String(jobId))) throw new Error("job id must be a uuid");
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id,created_at,status,slot_date,customer_id,customers(id,name,email)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`jobs: ${error.message}`);
  if (!job) return null;
  const customerId = job.customer_id;
  const [photos, invoices, messages, assessments, expenses, otherJobs] = await Promise.all([
    count(supabase, "job_photos", "job_id", jobId),
    count(supabase, "invoices", "job_id", jobId),
    count(supabase, "messages", "job_id", jobId),
    count(supabase, "job_assessments", "job_id", jobId),
    count(supabase, "expenses", "job_id", jobId),
    customerId ? count(supabase, "jobs", "customer_id", customerId).then((n) => n - 1) : Promise.resolve(0),
  ]);
  return {
    job: { id: job.id, created_at: job.created_at, status: job.status, slot_date: job.slot_date },
    customer: job.customers ? { id: job.customers.id, name: job.customers.name, email: job.customers.email } : null,
    photos, invoices, messages, assessments, expenses, otherJobs,
  };
}

// The erasure. Refuses (nothing deleted) when the job has an invoice. Photos (objects,
// then rows) go before the job row; the customer goes last and only when asked and
// unreferenced. Returns { ok, refused?, report, deleted }.
async function eraseJob(supabase, jobId, { withCustomer = false, log = console.log } = {}) {
  const report = await reportJob(supabase, jobId);
  if (!report) return { ok: false, refused: "no such job", report: null, deleted: {} };
  if (report.invoices > 0) return { ok: false, refused: `the job has ${report.invoices} invoice(s); invoiced jobs are financial records (about six years) and are not erased by this script`, report, deleted: {} };

  const deleted = { photos: 0, job: false, customer: false };
  const photos = await deleteJobPhotos(supabase, jobId, { log });
  if (!photos.ok) return { ok: false, refused: `photo erasure failed, nothing else deleted: ${photos.error}`, report, deleted };
  deleted.photos = photos.removed;

  const { error: jobErr } = await supabase.from("jobs").delete().eq("id", jobId);
  if (jobErr) return { ok: false, refused: `jobs delete failed (photos already erased): ${jobErr.message}`, report, deleted };
  deleted.job = true;

  if (withCustomer && report.customer) {
    if (report.otherJobs > 0) {
      log(`customer ${report.customer.id} kept: ${report.otherJobs} other job(s) reference it`);
    } else {
      const { error: custErr } = await supabase.from("customers").delete().eq("id", report.customer.id);
      if (custErr) return { ok: false, refused: `customers delete failed (job and photos already erased): ${custErr.message}`, report, deleted };
      deleted.customer = true;
    }
  }
  return { ok: true, report, deleted };
}

function formatReport(r) {
  if (!r) return "no such job";
  const lines = [
    `job ${r.job.id}: status ${r.job.status}, slot ${r.job.slot_date}, created ${r.job.created_at}`,
    r.customer ? `customer ${r.customer.id}: ${r.customer.name} <${r.customer.email}> (${r.otherJobs} other job(s))` : "customer: none",
    `photos ${r.photos} | invoices ${r.invoices} | messages ${r.messages} (kept, job_id set null) | assessments ${r.assessments} (cascade) | expenses ${r.expenses} (kept, job_id set null)`,
  ];
  if (r.invoices > 0) lines.push("REFUSED: an invoiced job is a financial record; not erased by this script.");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const jobId = (args.find((a) => !a.startsWith("--")) || "").trim();
  const del = args.includes("--delete");
  const withCustomer = args.includes("--with-customer");
  if (!UUID.test(jobId)) throw new Error("usage: node scripts/erase-job.js <job uuid> [--delete] [--with-customer]");

  // The URL and the key come from ONE source: the .env pair when the file carries both,
  // else the process pair. Mixing them is how the first hosted run failed on this machine
  // (a SUPABASE_SERVICE_ROLE_KEY for another project sits in the shell environment, and
  // it was taken with the ICC URL from .env: "Invalid API key").
  const envFile = process.env.ICC_ENV_FILE || path.join(process.cwd(), ".env");
  const env = fs.existsSync(envFile) ? loadEnv(envFile) : {};
  const fromFile = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY;
  const url = fromFile ? env.SUPABASE_URL : process.env.SUPABASE_URL;
  const key = fromFile ? env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed, both from the repo-root .env or both from the environment");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`target: ${url}`);

  if (!del) {
    console.log(formatReport(await reportJob(supabase, jobId)));
    console.log("(report only; add --delete to erase, --with-customer to erase the customer row too)");
    return;
  }
  const r = await eraseJob(supabase, jobId, { withCustomer });
  if (r.report) console.log(formatReport(r.report));
  if (!r.ok) {
    console.error(`NOT ERASED: ${r.refused}`);
    process.exitCode = 2;
    return;
  }
  console.log(`erased: ${r.deleted.photos} photo object(s) and their rows, the job row${r.deleted.customer ? ", the customer row" : ""}.`);
  console.log("Remaining manual step: the matching booking emails in Mark's mailbox (and the PDF job card attached to them).");
}

if (require.main === module) {
  // exitCode, not process.exit(): an exit right after an awaited fetch trips a libuv
  // assertion on Windows (the 18 Sept 2026 ride script found the same).
  main().catch((e) => {
    console.error("FAILED:", e.message || e);
    process.exitCode = 1;
  });
}

module.exports = { reportJob, eraseJob, formatReport };
