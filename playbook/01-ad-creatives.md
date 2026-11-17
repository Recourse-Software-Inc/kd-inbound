# The 9 ad types, written for knowdrive

The source system runs nine proven formats at once and lets the qualified-lead signal decide the winners. Every ad points to the landing page with `utm_content=<slug>` so the admin's **By creative** table shows qualified rate, bookings and wins per format.

**Audience:** heads of AI/ML, CTOs and VPs of Engineering, platform and data leads at companies shipping retrieval, search or agents. LinkedIn is the primary channel (job title + company size targeting). Meta and YouTube are for retargeting and lookalikes built from the qualified-lead signal.

**Offer in every ad:** apply for a design-partner build → 30-minute fit call with the founders.

**Voice rules:** direct proof points, no hype adjectives, and no "It's not X, it's Y" contrasts. The brand is always lowercase **knowdrive**.

| # | Format | Slug (`utm_content`) | Hook (first 2 seconds) | Body beats | CTA |
|---|---|---|---|---|---|
| 1 | UGC / selfie | `ugc-selfie` | "Your agent just told a customer something. Can you show where it came from?" | Joel on phone camera. 3 beats: answers ship without sources → knowdrive returns the exact passage with file, version and byte range → we're taking on a small number of design partners. | "Apply, link below." |
| 2 | Static text | `static-text` | Large type: **"Every answer cited to file, version and byte range."** | Sub-line: "One service in place of your vector DB, file store and chunking pipeline." Small: "Runs on Arm CPUs in your jurisdiction." | "Apply for a design-partner build" |
| 3 | Green screen | `green-screen` | Joel in front of a typical RAG architecture diagram: "Count the systems in this picture." | Point to vector DB, blob store, chunker, re-index jobs. Swap the background to a single knowdrive box. "Vectorize once, read at any scale." | "See if you qualify" |
| 4 | Carousel | `carousel` | Card 1: "5 questions legal will ask about your AI" | 2: Where did this answer come from? 3: Which version of the file? 4: Where is the data stored? 5: Was our data used to train a model? 6: knowdrive answers all four by default. 7: CTA. | "Apply" |
| 5 | Podcast clip | `podcast` | A 30–45 s cut from The Brain Podcast: "Attention as a service." | Joel explains reading the exact passage behind each answer and why cost per query drops when content is vectorized once. Burned-in captions. | "Link in the description" |
| 6 | Professional | `professional` | Polished 30 s: Inspector screen recording + voiceover. "This is every passage your agent read, and where each one lives." | Show a cited result with the byte range highlighted, then audio/video search returning a timestamp. | "Apply for a design-partner build" |
| 7 | Sketchbook | `sketchbook` | Hand-drawn on paper: "Why your RAG bill keeps growing." | Draw re-chunking → re-embedding → re-indexing loops. Cross them out. Draw "vectorize once" with arrows to many readers (agents, staff, apps). | "See if you qualify" |
| 8 | Client win | `client-win` | "The RCMP is a customer of record." | Keep to what can be said publicly: customer of record, sovereign deployment on CPU. Add more wins only with written permission. | "Apply" |
| 9 | Testimonial | `testimonial` | Design partner on camera (once you have permission): "We can finally show our customers the source." | Their problem → what changed → one number (cost per query, citation coverage, or time to answer). | "Apply for a design-partner build" |

## Production notes

- **Captions on every video.** The source ad burns in 2–4-word captions. Match that; most feeds play muted.
- **Make the first frame the hook.** Text in the top third, face in the middle, captions in the lower third (clear of the platform UI).
- **Name the threshold in the ad copy, not the creative:** "Enterprise plans start at $5,120/month." This pre-qualifies before the click, and the form's budget question confirms it.
- **One variable per test.** Keep the landing page fixed while formats compete. Judge on **qualified rate and bookings**, not CTR or cost per lead.
- **Kill rule:** after about $300 spend per format, pause anything with zero qualified leads. After 10 qualified leads, rank formats by cost per booked call.

## Ad-copy primary text (LinkedIn / Meta)

> If your agents or search answer from company data, read this.
>
> Most teams run a vector database, a file store and a chunking pipeline built separately. Every re-index costs money, answers drift, and when someone asks "where did that come from?" there's no trail.
>
> knowdrive is one service: content vectorized once, every result cited to file, version and byte range, running on Arm CPUs in your jurisdiction. Works with Claude, Codex, Cursor and any MCP client.
>
> We're onboarding a small number of enterprise design partners. Enterprise plans start at $5,120/month.
>
> → 2-minute application, then a 30-minute fit call with the founders.
