# ICO Registration - pre-launch action

**Status:** ✅ **REGISTERED, and now wired in.** Registration reference **ZC230232** (registered 24 August 2026, renews 23 August 2027), Tier 1, on an **annual direct debit at ~£47/year**. The number is now in the privacy notice (`site/src/pages/privacy.astro`, 1 September 2026), so this pre-launch action is complete. Prepared 18 June 2026; registered at the August 2026 Mark meeting.
**Why:** The public privacy notice needs the ICO registration number, and paying the data protection fee is a legal requirement before processing customer data at any scale. Feeds the `[to confirm: ICO registration number]` slot in `site/src/pages/privacy.astro`.

> **Note on the fee.** The Tier 1 figure below was £40/£35 when this brief was written. The registration was actually set up at **~£47/year on annual direct debit**, consistent with an ICO fee change. Confirm the exact figure on the certificate.

## Does ICC need to register?

Yes (confirm via the ICO self-assessment). Under the Data Protection (Charges and Information) Regulations 2018, any organisation that processes personal data must pay the ICO data protection fee unless a specific exemption applies. The exemptions are narrow (for example processing only for staff administration, only for a business's own advertising and marketing, or only for accounts and records). ICC holds and processes customer personal data electronically (names, contact details, work addresses, booking records, chat enquiries), which those exemptions do not cover, so ICC must register.

Self-assessment: https://ico.org.uk/for-organisations/data-protection-fee/self-assessment/

## Fee tier

**Tier 1 (micro organisations): £40 per year** (£35 if paid by Direct Debit). Tier 1 covers a business with a maximum annual turnover of £632,000 or no more than 10 members of staff, which fits ICC comfortably.

Confirm the current fee on the ICO site at registration, as fees can change: https://ico.org.uk/for-organisations/data-protection-fee/

## What you need to hand

- **Controller:** Mark McClymont, sole trader.
- **Trading name:** Intelligent Carpet Cleaning.
- **Business address:** the controller's home address (postcode GL3 3PT), given to the ICO privately (D-016). The full street address is held in the private meeting minutes, not in this public repo. Note: the ICO public register does in fact display it, see the note below.
- **Contact:** hello@intelligentclean.co.uk, 01242 279590.
- **Nature of business:** carpet, rug and upholstery cleaning (a service-area business).
- **Payment:** debit or credit card, or Direct Debit.

## Keep the home address off the public register

ICC runs from a home address (D-016) that is deliberately kept off the public web, and the privacy notice now identifies the controller without publishing the address (contact by email, phone, and post on request). The ICO public register normally shows a registered organisation's name and address, but **sole traders and individuals can ask the ICO not to publish their home address** on the public register. When registering, request that the address is withheld from public view so it is held for regulatory purposes only, consistent with the off-page approach in the privacy notice.

**Update (1 September 2026):** in practice the ICO public register for ZC230232 does display the full home address. Either the withhold was not requested at registration or the ICO did not apply it. If keeping the home address off the public register still matters to Mark, he would need to contact the ICO to ask for it to be removed. The site itself continues to keep the address off-page (D-016).

## After registering

1. You receive a **registration (reference) number** and a certificate.
2. Put the number into the privacy notice: replace `[to confirm: ICO registration number]` in `site/src/pages/privacy.astro` (the "Who we are" section). A one-line edit.
3. The registration renews **annually**, so set a reminder.

## Who does what

Ben or Mark completes and pays for the registration on the ICO site (about 15 minutes, needs a card). It cannot be automated from the codebase. Once the number is issued, dropping it into the privacy notice is a one-line change.
