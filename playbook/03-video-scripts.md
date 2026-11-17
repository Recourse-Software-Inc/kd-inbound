# Two videos to record

Both use the same look as the source ad. You talk to camera for the hook. The rest is a screen recording of the funnel diagram (the `/flow/` page of the site, opened full screen; press → to step through) with a red pen-style highlight on each step as you talk.

## A. Landing-page breakdown (about 2:30) → `vslVideo` in `site/assets/config.js`

**Hook (to camera):** "If your agents answer from company data, this is how we take you from your own corpus to cited answers in production. And how to tell in two minutes whether it's worth your time."

**Problem (to camera):** "Most teams run three systems they built separately: a vector database, a file store and a chunking pipeline. Every re-index costs money. Answers drift. And when legal or a customer asks where an answer came from, there's no trail."

**What knowdrive does (Inspector screen recording):** "knowdrive stores documents, audio and video once. Every result comes back as the exact passage, cited to its file, version and byte range, or a timestamp for media. It runs on ordinary Arm CPUs, so it can run in Canada, the EU or on your own hardware. And it works with Claude, Codex, Cursor or any MCP client."

**How a design-partner build runs (diagram):** walk the five steps: fit call, pilot on your corpus, wire it into your agents, measure against what you run today, hand-off.

**Who it's for (to camera):** "This is for teams shipping retrieval or agents to customers or staff, with a real need for an audit trail or data residency. Enterprise plans start at $5,120 a month. If you're earlier than that, the application will point you to the free plan, which is the same retrieval with no card."

**CTA:** "Click below. It's a two-minute application. If it's a fit, you'll pick a time with me straight away."

## B. Thank-you page "watch before your call" (about 4:00) → `confirmVideo`

1. **Confirm and thank (15 s):** "You're booked. Here's how to get the most out of the 30 minutes."
2. **What happens on the call (45 s):** discovery, live Inspector demo on content like theirs, jurisdiction and deployment, and what a pilot would cost.
3. **Pre-frame the solution (90 s):** show one cited result end to end. Explain vectorize-once economics in plain terms: you pay to understand content once, then every agent and person reads from it.
4. **FAQs (60 s):** where data lives; nothing used to train models; works with their current models; what a pilot looks like.
5. **Homework (30 s):** "Below this video there's a box. Type the one question your AI gets wrong today, and bring anyone who owns budget or the stack."

Keep the confirmation video under 5 minutes. People watch it on their phone the night before.
