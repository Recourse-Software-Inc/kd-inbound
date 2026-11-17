// Funnel configuration — the only file you should need to edit to go live.
// Anything left as an empty string is hidden or skipped gracefully.
window.KD_FUNNEL = {
  // Cloudflare Worker base URL (no trailing slash), e.g. https://inbound-api.knowdrive.ai
  apiBase: "https://kd-inbound.joelauge.workers.dev",

  // Cal.com booking link for the demo call ("username/event-slug" or "team/x/event-slug").
  calLink: "recourse/knowdrive-demo",
  calOrigin: "https://cal.com",
  // Plain fallback if the embed is blocked (ad blockers, strict privacy browsers).
  calFallbackUrl: "https://cal.com/recourse/knowdrive-demo",

  // Shown on the budget question. Matches the published Enterprise floor on knowdrive.ai.
  enterpriseFloorMonthly: 5120,

  // Videos: YouTube/Vimeo embed URLs or an .mp4. Empty = branded placeholder.
  vslVideo: "",          // landing page breakdown video
  confirmVideo: "",      // thank-you page "watch before your call" video

  // Self-serve and resource links for the disqualified path.
  freePlanUrl: "https://knowdrive.ai/pricing",
  siteUrl: "https://knowdrive.ai",
  resources: [
    { tag: "Start free", title: "Free plan: 500 MB and 500 searches a month", body: "No credit card. Connect Claude, Cursor or any MCP client and test it on your own files.", url: "https://knowdrive.ai/pricing", cta: "Create a free account" },
    { tag: "Watch", title: "Inspector demo: the passage behind each answer", body: "See every retrieved passage with its source file, version and byte range.", url: "", cta: "Watch the demo" },
    { tag: "Read", title: "VORAS whitepaper", body: "Vectorize Once, Read at Any Scale. Includes an honesty-boundary section labelling every claim by evidence level.", url: "", cta: "Read the whitepaper (PDF)" },
    { tag: "Benchmark", title: "Open retrieval benchmark", body: "Same corpus, managed-cloud deployments, cost per query. MIT licensed and reproducible.", url: "", cta: "View on GitHub" }
  ],

  // Who joins the call (thank-you page).
  hosts: [
    { name: "Joel Augé", role: "Co-founder & CEO, Recourse Software" }
  ],

  // Client-side pixels (optional). Server-side events go through the Worker either way;
  // these share an event_id with the server event so platforms de-duplicate.
  metaPixelId: "",
  linkedinPartnerId: "",
  ga4MeasurementId: "",

  // Optional Cloudflare Turnstile site key (pair with TURNSTILE_SECRET on the Worker) to stop form spam.
  turnstileSiteKey: "",

  legalName: "Recourse Software Inc.",
  privacyUrl: "https://knowdrive.ai/privacy",
  contactEmail: "hello@knowdrive.ai"
};
