// Funnel configuration — the only file you should need to edit to go live.
// Anything left as an empty string is hidden or skipped gracefully.
window.KD_FUNNEL = {
  // Cloudflare Worker base URL (no trailing slash), e.g. https://inbound-api.knowdrive.ai
  apiBase: "https://kd-inbound.joelauge.workers.dev",

  // Google Calendar appointment schedule (joel@recoursellm.com): the schedule's booking-page URL,
  // e.g. "https://calendar.google.com/calendar/appointments/schedules/AcZssZ...". Takes priority over Cal.com.
  gcalBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0gf1kPAv3yWcLxJZsAnNlWdsy6bORUrgOAj4_p88FemB0vtVAiXtIcO2rGv6tEx-c1QDEpR6eP",

  // Cal.com booking link for the demo call ("username/event-slug" or "team/x/event-slug").
  calLink: "",   // e.g. "joelauge/knowdrive-demo" once the event exists on YOUR Cal.com account,
  calOrigin: "https://cal.com",
  // Plain fallback if the embed is blocked (ad blockers, strict privacy browsers).
  calFallbackUrl: "",

  // Shown on the budget question. Matches the published Enterprise floor on knowdrive.ai.
  enterpriseFloorMonthly: 5120,

  // Landing page video. The object below puts the knowdrive player (assets/kd-vsl-player.js) at the top of the page.
  // A plain string still works (YouTube/Vimeo embed URL or an .mp4, in a standard player); "" shows the sample
  // cited result instead of a video.
  vslVideo: {
    title: "RAG vs knowdrive: nine differences",
    base: "media/vsl/",              // folder, or the full URL of a bucket, that holds the files named below
    duration: 241.6,                 // seconds
    aspect: "1824/1080",
    poster: "poster.jpg",
    playAt: "73.5% 78%",             // where the play button sits on the poster (x y), clear of the word "Stop."
    sources: [                       // tried in this order within each quality; the first one the browser can play wins
      { src: "builders-vsl-hevc.mp4",  type: 'video/mp4; codecs="hvc1.2.4.L120.B0, mp4a.40.2"', quality: "1080p" },
      { src: "builders-vsl-1080p.mp4", type: 'video/mp4; codecs="avc1.640029, mp4a.40.2"',      quality: "1080p" },
      { src: "builders-vsl-720p.mp4",  type: 'video/mp4; codecs="avc1.64001f, mp4a.40.2"',      quality: "720p" }
    ],
    captions: "captions.en.vtt",
    thumbs: { src: "thumbs.jpg", cols: 11, interval: 2, width: 192, height: 114 },   // scrubber preview: one frame every 2 s
    chapters: [                      // t = seconds; n = the number shown ("" intro, "=" the close)
      { t: 0,      n: "",  title: "Before you build RAG" },
      { t: 24.63,  n: "1", title: "Zero pipeline" },
      { t: 45.88,  n: "2", title: "Files stay files" },
      { t: 67.42,  n: "3", title: "Flat context cost" },
      { t: 91.79,  n: "4", title: "Multimodal, one store" },
      { t: 105.63, n: "5", title: "Governance built in" },
      { t: 121.17, n: "6", title: "Made for agents" },
      { t: 134.58, n: "7", title: "Change your mind" },
      { t: 147.38, n: "8", title: "Corpus-wide queries" },
      { t: 187.17, n: "9", title: "Multiplayer" },
      { t: 212.83, n: "=", title: "The difference" }
    ]
  },

  // Thank-you page "watch before your call" video: YouTube/Vimeo embed URL or an .mp4. Empty = branded placeholder.
  confirmVideo: "",

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
  // Google Ads (Recourse Software Inc.)
  googleAdsId: "AW-18535114464",
  googleAdsLeadLabel: "LLb5CMG4sLwdEODNnYZF",

  // Optional Cloudflare Turnstile site key (pair with TURNSTILE_SECRET on the Worker) to stop form spam.
  turnstileSiteKey: "",

  legalName: "Recourse Software Inc.",
  privacyUrl: "https://knowdrive.ai/privacy",
  contactEmail: "hello@knowdrive.ai"
};
