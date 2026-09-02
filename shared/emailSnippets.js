// Shared HTML snippets for transactional emails.
//
// Kept here so a snippet used by more than one email has ONE definition, not a
// divergent copy (blast-radius). Today: the deposit "pay now" button, used by the
// customer booking-confirmation email (chat.js) and the D-027 provisional-accept
// email (bookingAction.js).
//
// CommonJS to match the Netlify functions and the plain-Node `node --test` runner.

// Escape a value for an HTML attribute (defence in depth; the URL is server-built).
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A "pay your deposit" button linking to a hosted payment page (Stripe Checkout /
// Payment Link / hosted invoice, once D-004/D-026 is live).
//
// DORMANT-until-configured (the house pattern): returns "" when there is no link, so
// until the payment link is live AND the deposit amount is server-derived (never the
// AI assistant's free-text figure — see D-004 addendum / TODO(slice5x/structured-
// pricing)), the email shows no button and keeps its existing "Mark will be in touch
// to arrange your deposit" wording. Only an absolute https link renders — a customer-
// or model-supplied value, or any non-https scheme, is refused (defence in depth,
// mirroring the citation-url http(s) guard).
function depositPayButtonHtml(url) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return "";
  const safe = escapeAttr(url);
  return `
          <div style="margin:16px 0;text-align:center;">
            <a href="${safe}" style="display:inline-block;background:#1a8a7a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Pay your deposit securely</a>
            <p style="margin:8px 0 0;font-size:12px;color:#718096;">Payment is handled securely by our payment provider. We never see your card details.</p>
          </div>`;
}

// The plain-text equivalent for an email's text/plain part: the raw https link, or ""
// when there is none. Same https-only guard as the button.
function depositPayTextLine(url) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return "";
  return `Pay your deposit securely: ${url}`;
}

module.exports = { depositPayButtonHtml, depositPayTextLine };
