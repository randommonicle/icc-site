# ICO Registration - pre-launch action

**Status:** Action for Ben + Mark before go-live. Prepared 18 June 2026.
**Why:** The public privacy notice needs the ICO registration number, and paying the data protection fee is a legal requirement before processing customer data at any scale. Feeds the `[to confirm: ICO registration number]` slot in `site/src/pages/privacy.astro`.

## Does ICC need to register?

Yes (confirm via the ICO self-assessment). Under the Data Protection (Charges and Information) Regulations 2018, any organisation that processes personal data must pay the ICO data protection fee unless a specific exemption applies. The exemptions are narrow (for example processing only for staff administration, only for a business's own advertising and marketing, or only for accounts and records). ICC holds and processes customer personal data electronically (names, contact details, work addresses, booking records, chat enquiries), which those exemptions do not cover, so ICC must register.

Self-assessment: https://ico.org.uk/for-organisations/data-protection-fee/self-assessment/

## Fee tier

**Tier 1 (micro organisations): £40 per year** (£35 if paid by Direct Debit). Tier 1 covers a business with a maximum annual turnover of £632,000 or no more than 10 members of staff, which fits ICC comfortably.

Confirm the current fee on the ICO site at registration, as fees can change: https://ico.org.uk/for-organisations/data-protection-fee/

## What you need to hand

- **Controller:** Mark McClymont, sole trader.
- **Trading name:** Intelligent Carpet Cleaning.
- **Business address:** 11 Horsbere Road, Hucclecote, Gloucester, GL3 3BT (D-016). Given to the ICO privately. See the note below on keeping it off the public register.
- **Contact:** hello@intelligentclean.co.uk, 01242 279590.
- **Nature of business:** carpet, rug and upholstery cleaning (a service-area business).
- **Payment:** debit or credit card, or Direct Debit.

## Keep the home address off the public register

ICC runs from a home address (D-016) that is deliberately kept off the public web, and the privacy notice now identifies the controller without publishing the address (contact by email, phone, and post on request). The ICO public register normally shows a registered organisation's name and address, but **sole traders and individuals can ask the ICO not to publish their home address** on the public register. When registering, request that the address is withheld from public view so it is held for regulatory purposes only, consistent with the off-page approach in the privacy notice.

## After registering

1. You receive a **registration (reference) number** and a certificate.
2. Put the number into the privacy notice: replace `[to confirm: ICO registration number]` in `site/src/pages/privacy.astro` (the "Who we are" section). A one-line edit.
3. The registration renews **annually**, so set a reminder.

## Who does what

Ben or Mark completes and pays for the registration on the ICO site (about 15 minutes, needs a card). It cannot be automated from the codebase. Once the number is issued, dropping it into the privacy notice is a one-line change.
