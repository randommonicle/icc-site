// Money-in single source (D-041; D-026 build note 6; D-039). The invoices REGISTER and the
// PAYMENTS feed (the two-receipts model) are derived HERE so both the accounting export
// (accountingExport.js) and the operational P&L (pnl.js) compute revenue the same way. If
// they diverged, the P&L margin would not reconcile with the accountant feed — the whole
// point of D-041. Pure builders + the two DB loaders; no HTTP and no auth (the endpoints
// own those). CommonJS for the Netlify functions and the plain-Node `node --test` runner.

// The invoices register + the per-invoice deposit info the balance derivation needs.
async function loadInvoiceRows(supabase) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id,job_id,number,status,amount_ex_vat,provider,provider_invoice_id,issued_at,due_at,paid_at,created_at,jobs(slot_date,deposit_ex_vat,deposit_status,customers(name,email))")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return data || [];
}

// Every PAID deposit, including jobs whose completion invoice does not exist yet — the
// deposit is cash received regardless of the invoice.
async function loadPaidDepositRows(supabase) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,deposit_ex_vat,deposit_status,deposit_paid_at,stripe_payment_intent_id,customers(name,email)")
    .eq("deposit_status", "paid")
    .limit(2000);
  if (error) throw new Error(error.message);
  // TODO(backend-phase1/accounting-refunds): a refunded deposit (deposit_status='refunded')
  // is excluded here, so a paid-then-refunded deposit shows neither the receipt nor the
  // refund; a later slice should emit both as +/- events for period-accurate cash-in.
  return data || [];
}

// Invoices register: one row per invoice, 'overdue' derived from due_at (as the invoices
// list endpoint does — the stored status for an unpaid finalised invoice is 'sent').
function buildInvoiceRegister(invoiceRows, now) {
  const nowT = now ? new Date(now).getTime() : Date.now();
  return (invoiceRows || []).map((r) => {
    const job = r.jobs || {};
    const cust = job.customers || {};
    let status = r.status;
    if (status === "sent" && r.due_at && new Date(r.due_at).getTime() < nowT) status = "overdue";
    return {
      number: r.number || "",
      job_id: r.job_id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      status: status || "",
      amount_ex_vat: Number(r.amount_ex_vat) || 0,
      issued_at: r.issued_at || "",
      due_at: r.due_at || "",
      paid_at: r.paid_at || "",
      created_at: r.created_at || "",
    };
  });
}

// Payments feed: money-in events (two-receipts, Decision A / D-041). A paid deposit is one
// receipt (at deposit_paid_at); a paid invoice is the BALANCE (full - deposit when the
// deposit was paid, else the full amount) at paid_at. The deposit and the balance never
// overlap, so full = deposit + balance. Sorted by date for a ledger feel.
function buildPayments(paidDepositRows, invoiceRows) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const payments = [];
  for (const j of (paidDepositRows || [])) {
    const cust = j.customers || {};
    payments.push({
      date: j.deposit_paid_at || "",
      type: "deposit",
      amount: round2(Number(j.deposit_ex_vat) || 0),
      job_id: j.id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      reference: j.stripe_payment_intent_id || "",
    });
  }
  for (const r of (invoiceRows || [])) {
    if (!r.paid_at) continue; // only actual receipts, not documents
    const job = r.jobs || {};
    const cust = job.customers || {};
    const full = Number(r.amount_ex_vat) || 0;
    const depositPaid = job.deposit_status === "paid" ? (Number(job.deposit_ex_vat) || 0) : 0;
    payments.push({
      date: r.paid_at,
      type: depositPaid > 0 ? "invoice_balance" : "invoice_full",
      amount: round2(full - depositPaid),
      job_id: r.job_id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      reference: r.number || r.provider_invoice_id || "",
    });
  }
  payments.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return payments;
}

module.exports = { loadInvoiceRows, loadPaidDepositRows, buildInvoiceRegister, buildPayments };
