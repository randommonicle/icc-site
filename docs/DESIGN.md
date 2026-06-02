# Intelligent Carpet Cleaning

## Platform Design Document

Version 0.1 (draft for review)
Prepared for Mark McClymont, Intelligent Carpet Cleaning, Cheltenham
Build lead: Ben Graham

---

## 1. Purpose of this document

This is the working design specification for the Intelligent Carpet Cleaning (ICC) platform. It describes what the platform is, how it is positioned commercially, how it is structured technically, and the order in which it should be built.

It is written to be used in two ways. First, as a build brief that can be fed directly into Claude Code phase by phase. Second, as a scope reference for Mark so the deliverables and their sequence are clear.

The document is forward looking. Some items described here are deliberately later-phase, and a few are optional. Each section marks where something is current, near term, or future, so nothing is assumed to be in the first build.

---

## 2. Vision and positioning

ICC is a one stop platform for anyone who needs carpet or upholstery cleaning. A customer should be able to arrive, get expert advice, understand why quality cleaning is worth paying for, get an accurate quote, and book and pay, all in one place.

The commercial position is premium. ICC is not competing on being the cheapest. The platform earns the higher price by demonstrating genuine expertise at the point of enquiry. The AI assistant is the core of this. It explains carpet science, fibre behaviour, soiling and stain chemistry, and the real difference between a rental machine and professional hot water extraction. A customer who understands why a cheap clean can damage a carpet is a customer who accepts a higher quote.

Three principles run through the whole design.

Expertise is the product. The AI, the content, and the history and science pages all exist to make ICC visibly more knowledgeable than any local competitor.

Everything is built to be found. SEO and AI search visibility are designed in from the structure up, not added later.

The back end is a real business tool. Mark should be able to run the operational side of the business from the admin platform, not just receive booking emails.

---

## 3. Audience and core journeys

The primary audience is domestic customers in Cheltenham, Gloucester, and the surrounding Gloucestershire towns who need carpets, rugs, or upholstery cleaned. A secondary audience is letting agents and landlords needing end of tenancy cleans.

The main customer journey is: find ICC through search or referral, ask the AI assistant a question or request a quote, optionally upload a photo of the carpet, receive an informed quote and method recommendation, book a slot, pay a deposit, receive confirmation, and after the job receive a request to leave a review.

The owner journey is: receive each new booking, see all jobs in one dashboard, track which are outstanding and which are complete, raise and track invoices, see deposits and balances paid, sync jobs to a calendar, and run marketing back to past customers.

---

## 4. Information architecture and site map

The public website is built as a proper multi page static site so each page is independently crawlable and can target its own search terms. This is a change from the current single file proof of concept and is the foundation for everything in the SEO section.

Public pages, current and near term:

Home. Positioning, the headline expertise message, primary calls to action to chat or book.

Services. Carpet cleaning, upholstery cleaning, rug cleaning, stain treatment, end of tenancy. Each with method, what is included, and indicative pricing.

Booking. The AI assistant and the booking flow, including photo upload and quote.

About us. Who Mark is, the equipment used, the standards held, and why ICC exists.

History of carpet cleaning. A genuine long form content page covering the history of carpet making and cleaning from beating and shampoo machines through to modern hot water extraction. This page is both a positioning asset and a strong piece of SEO content.

Carpet science and care guides. A small library of useful articles. Fibre types and how to identify them, why cheap cleaning damages carpets, stain by stain removal guidance, DIY versus professional. These feed the AI knowledge base and capture question style searches.

Area pages. One page each for the main towns served, for example Cheltenham, Gloucester, Tewkesbury, Stroud, Cirencester. Each with locally relevant copy. These target the local searches that matter most for a service business.

Contact. Phone, email, service area, hours.

Future public additions: customer review wall pulling from Google, before and after gallery, online instant quote calculator.

---

## 5. The AI assistant

The assistant is the differentiator and is expanded well beyond the proof of concept.

Knowledge domains, current and near term:

Carpet construction and fibre science. Wool, nylon, polypropylene, polyester, blends, pile types, and how each responds to cleaning.

Soiling and stain chemistry. Why different stains need different treatments, why some set permanently, and why wrong treatment causes damage.

Cleaning method justification. The real difference between rental machines, low moisture methods, and professional hot water extraction, framed so the customer understands the value of the higher cost option.

History and craft. Enough background to answer curious questions and reinforce ICC as the expert.

Quoting and booking logic. Room types and sizes, item counts for upholstery, condition factors, and the resulting indicative price, with photo assisted assessment through the vision capability.

The cost justification behaviour is explicit and deliberate. When a customer queries price, the assistant explains what is included, the risks of cheaper alternatives, and the longer carpet life that proper cleaning delivers, before presenting the figure. It is informative and confident, never apologetic about price, and never disparaging by name about competitors.

Future assistant capability: remembering a returning customer's previous jobs once accounts exist, proactively suggesting maintenance cleans, and answering in the context of the specific carpet on file.

A practical note on knowledge management. The assistant's knowledge should live in a maintainable structured source, not be hard coded inline, so the science and history content on the website and the assistant's knowledge come from the same place and stay consistent.

---

## 6. Admin and business platform

This is the back office Mark logs into. It is the part that most clearly moves ICC from a website to a business platform, and it is the part that needs the database and backend described in section 7.

Jobs and scheduling, near term:

A single dashboard of all jobs, filterable by status: enquiry, booked, in progress, completed, cancelled.

Each job record holds customer details, address, carpet details and any uploaded photos, the AI assessment, the quote, the assigned slot, and notes.

Outstanding versus completed views so Mark can see at a glance what is coming up and what is done.

Invoicing and payments, near term to future:

Raise an invoice against a completed job, track its status as draft, sent, paid, or overdue.

Record deposits and balances. Deposit taken at booking, balance on completion.

Card payment and deposit capture through a payment provider. Stripe is the recommended route. It handles card security so no card data is ever stored on the platform, and it supports both the deposit at booking and the balance afterwards.

Bank linking is split deliberately. Card payments via Stripe cover deposits and balances and should be the first payment capability. True open banking links, reading or initiating from a bank account directly, are heavier to implement and are parked as an optional later item. They are not needed to take deposits.

Calendar synchronisation, near term to future:

Each confirmed booking writes to a calendar. The design supports multiple providers so a job can fill into Google Calendar, Microsoft or Office 365 via Outlook, and a generic calendar through an ICS feed.

In the first instance the simplest reliable version is a per booking calendar link plus an ICS file, which works with every calendar app. Full two way sync with Google and Microsoft through their APIs is the richer version and follows once accounts and authentication are in place.

Database and client management, future:

A proper client database underpins all of the above. Each customer has a record, their job history, their contact details, and their consent status for marketing.

Client curation. Past customers are a marketing asset. The platform identifies clients due a repeat clean, lapsed clients worth re-engaging, and high value clients, and supports targeted contact.

AI assisted marketing. The platform drafts re-engagement emails and seasonal campaigns, segmented by client type, with Mark approving before anything sends. This is where the AI helps on the business side, not just the customer side.

A compliance constraint applies here and is not optional. Marketing email to past customers in the UK is governed by PECR and the UK GDPR. The lawful route for existing customers is the soft opt in, which requires that the contact details were obtained during a sale, the marketing is for similar services, and every message offers a simple way to opt out. The platform must record consent status per client and honour unsubscribes automatically. This is specced in section 11.

---

## 7. Architecture and technology

This section contains the key technical decision in the document.

Current proof of concept stack: a single HTML file on Netlify, serverless functions for the AI proxy, booking storage in Netlify Blobs, and email through Resend. This is correct for what it is, a zero cost demonstrator.

It does not carry the platform described above. Invoicing, payments, calendar sync, a client database, and marketing automation need persistent relational data, authenticated access, and background processing. Netlify Blobs is a key value store and is not the right home for that.

Recommended target architecture:

A multi page static front end for the public site, either hand built HTML or a static site generator such as Astro, deployed on Netlify. This keeps the public site fast, cheap, and fully crawlable.

A proper backend and database for the business platform. A managed Postgres service such as Supabase is a strong fit. It provides the relational database, authentication for Mark's admin login, file storage for job photos, and an API, without running servers.

An API first design. The backend exposes a clean set of endpoints. The website is one client of that API. This is what makes the future field app straightforward, because the app you and Mark may build later consumes the same endpoints rather than needing a separate back end. The integration sockets you mentioned are exactly this: a documented API the app plugs into.

Serverless functions for the AI proxy and for tasks such as sending email and writing to calendars, keeping API keys server side.

The principle is that the public marketing site and the operational platform are separated cleanly, share the same database where it makes sense, and talk through an API so a second client app is a small step rather than a rebuild.

---

## 8. Integrations

Payments: Stripe. Deposits at booking, balances on completion, no card data stored locally.

Calendars: ICS feed and per booking links first, for universal compatibility. Google Calendar API and Microsoft Graph for full Outlook and Office sync later.

Email: transactional email for confirmations and review requests, and a marketing capable path for campaigns. Resend covers transactional well. Marketing volume may warrant a dedicated marketing email tool later.

Field app: the future ICC app is a client of the platform API. No separate back end. Plan the API endpoints with this in mind from the first backend build so nothing has to be retrofitted.

Future optional: SMS notifications to Mark and to customers, open banking for direct bank payments, accounting software export for invoices.

---

## 9. SEO and marketing strategy

This is designed into the structure rather than added on. For a local service business the weighting is specific, so effort is prioritised accordingly. Proximity to the searcher is the largest factor and cannot be controlled, so the strategy maximises everything that can be.

Priority one, Google Business Profile. The largest controllable lever. Claimed and verified, correct primary category of carpet cleaning service with relevant secondaries, service area set across the towns served, full description, real photos including before and after and the van, services listed with indicative prices, and regular posts. The business name must not be keyword stuffed, as that now triggers profile suspensions.

Priority two, a review engine built into the platform. Review recency and steady flow now matter more than total count. Because ICC owns the booking platform, a review request is built directly into the job completion flow. When Mark marks a job complete, the customer automatically receives a request with a direct link to leave a Google review. This is a permanent advantage a generic website cannot match, and it should be built early.

Priority three, NAP consistency and citations. Identical name, address, and phone everywhere, character for character. Core listings on Google, Bing Places, Apple Business Connect, Yell, Facebook, and any trade directories Mark uses.

Priority four, on page SEO, enabled by the multi page structure. Unique title and meta description per page, one clear heading per page, local terms used naturally, and structured data markup describing the business, its location, hours, service area, price range, and aggregate rating. Structured data is high value for both search and AI results.

Priority five, local and expert content. The area pages capture town level searches. The history and science pages and the care guides capture informational and question style searches, and they reinforce the premium expert positioning. This is the genuinely useful content that also performs.

Priority six, technical foundations. Static hosting gives fast load and good mobile performance by default. Add a sitemap and robots file, free HTTPS through Netlify, and register the site with Google Search Console and Bing Webmaster Tools.

Priority seven, AI search visibility. AI overviews now appear in local search results. The levers are the same foundations done well: a strong, consistent business entity, clear question and answer content with appropriate markup, and being mentioned across reviews and citations. It is disciplined fundamentals, not a separate discipline.

Marketing beyond search, future. The client curation and re-engagement capability in the admin platform is the second marketing engine. Past customers prompted for a maintenance clean at the right interval are the cheapest new revenue available, subject to the consent rules in section 11.

---

## 10. Costs, indicative

These are indicative running costs, not quotes, and depend on volume.

Domain: roughly ten pounds per year.

Hosting of the public static site on Netlify: free at this scale.

Database and backend on a managed service such as Supabase: free tier initially, then roughly twenty to twenty five US dollars per month once in real use.

AI usage through the Claude API: usage based, low at proof of concept volumes, growing with traffic.

Email: free tier initially, then modest monthly cost at marketing volumes.

Payments through Stripe: no monthly fee, a per transaction percentage and small fixed fee on each card payment.

Calendar and Search Console: free.

The one off setup you have offered to cover sits alongside these. The ongoing monthly cost is small until the platform is carrying real volume, at which point it is comfortably covered by the business it supports.

---

## 11. Data, privacy, and compliance

Marketing consent. Email marketing to past customers relies on the PECR soft opt in for existing customers, which requires that contact details were collected during a sale of a similar service and that every message carries a clear opt out. The platform records consent status per client and processes unsubscribes automatically. New marketing only consents are captured explicitly. This is a hard requirement, not a nicety.

Payment security. Card handling is delegated to Stripe. No card numbers are stored on the platform, which keeps ICC out of scope for the heaviest payment security obligations.

Personal data. Customer records, addresses, and job photos are personal data under UK GDPR. They are stored only as long as needed, access to the admin platform is authenticated, and customers can request their data or its deletion. A short privacy notice on the public site covers what is collected and why.

This section should be reviewed properly before the marketing automation and payment features go live. The principles are settled, but the specific wording of the privacy notice and the consent flows is worth a careful pass, and a data protection professional can confirm the detail if Mark wants certainty.

---

## 12. Delivery roadmap

The platform is built in phases so each one delivers something usable and the architecture grows only when needed.

Phase one, public site and findability. Convert the proof of concept to a multi page static site. Build the home, services, booking, about, history, guides, and area pages. Expand the AI knowledge base. Set up Google Business Profile, Search Console, structured data, sitemap, and citations. Build the automated review request into the existing booking flow. Outcome: a fast, expert, fully indexable site that ranks and converts.

Phase two, operational back end. Stand up the database and authenticated admin platform. Migrate bookings off Blobs into the database. Build the jobs dashboard with outstanding and completed views, job records with photos and AI assessment, and basic invoice tracking. Outcome: Mark runs the operational side from one place.

Phase three, payments and calendar. Add Stripe for deposits at booking and balances on completion. Add calendar output, ICS and links first, then Google and Microsoft sync. Outcome: money and scheduling handled end to end.

Phase four, CRM and marketing. Build the client database properly, consent tracking, client curation views, and AI assisted re-engagement campaigns with approval before sending. Outcome: the platform generates repeat business, within the compliance rules.

Phase five and beyond, the field app and optional integrations. Build the field app against the platform API. Consider SMS, open banking, and accounting export as demand justifies them.

---

## 13. Open questions to resolve before build

Confirm the domain name to register for the live site.

Confirm the full service area town list for the area pages.

Confirm Mark's preferred deposit policy, the amount or percentage taken at booking.

Confirm the calendar Mark actually uses day to day, as that sets which sync to prioritise.

Confirm whether Mark wants the field app on the near roadmap or treated as later, as it affects how much API work is front loaded.

Confirm who owns the accounts, domain, Stripe, Google Business Profile, and database, so ownership sits with Mark and the business from the start rather than needing transfer later.

---

End of document.
