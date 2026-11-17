// Fallback copy used when the AI writer is off, slow, or its draft fails validation.
// Same intents as ai.js INTENTS. {first} {company} {book} {free} {site} are filled in by fill().
export const EMAIL = {
  "followup:d0": { subject: "your knowdrive fit call", body: "Hi {first},\n\nThanks for applying. From what you described, a 30-minute fit call is the right next step: we'll look at your sources and show cited retrieval on content like yours.\n\nPick a time here: {book}\n\nJoel" },
  "followup:d1": { subject: "what you'd see on the call", body: "Hi {first},\n\nYou told us you'd need to see {show}. That's what I'll show on the call, on your own files.\n\nGrab 30 minutes: {book}\n\nJoel" },
  "followup:d2": { subject: "if you already run a vector database", body: "Hi {first},\n\nMost teams we talk to already have one. The pilot runs alongside it on your own content, so the decision rests on measured cost, answer quality and citation coverage. The call is where we scope that.\n\n{book}\n\nJoel" },
  "followup:d3": { subject: "a demo on your own files", body: "Hi {first},\n\nBring 3-5 files to the call. We load them while you watch and run your questions against them, with every passage cited to its file, version and byte range.\n\nPick a slot: {book}\n\nJoel" },
  "followup:d5": { subject: "quick question", body: "Hi {first},\n\nIs the timing off, or is something about the fit unclear? A one-line reply is plenty.\n\nOr pick a time directly: {book}\n\nJoel" },
  "followup:d7": { subject: "try it before we talk", body: "Hi {first},\n\nIf you'd rather test first, the free plan gives you 500 MB and 500 searches a month, no card: {free}\n\nWhen you want to scope a pilot, the call is the fastest route: {book}\n\nJoel" },
  "followup:d10": { subject: "closing your application", body: "Hi {first},\n\nI'll stop following up about this application. If timing changes, the link stays open: {book}\n\nJoel" },
  "rebook:r0": { subject: "missed you, pick a new time?", body: "Hi {first},\n\nLooks like we missed each other. No problem. Pick a new time here: {book}\n\nJoel" },
  "rebook:r1": { subject: "still worth 30 minutes", body: "Hi {first},\n\nThe call is the quickest way to see cited retrieval on {company}'s own kind of content. New times here: {book}\n\nJoel" },
  "rebook:r3": { subject: "door's open", body: "Hi {first},\n\nLast note from me. Whenever it suits you: {book}\n\nJoel" },
  "dq:d0": { subject: "your knowdrive starting point", body: "Hi {first},\n\nThanks for applying. For where you are right now, the free plan is the quickest way to get value: 500 MB and 500 searches a month, no card, same cited retrieval our enterprise customers use.\n\nStart here: {free}\n\nWhen you have a production use case or a budget owner, re-apply and you'll go straight to the calendar: {apply}\n\nJoel" },
  "dq:d30": { subject: "checking in", body: "Hi {first},\n\nA month on from your application. If anything has moved (a production use case, a timeline, a budget owner), re-apply and you'll skip straight to booking: {apply}\n\nJoel" },
  "recancel:c0": { subject: "want to pick another time?", body: "Hi {first},\n\nI saw the fit call was cancelled. If the timing was the problem, here's the calendar to pick another slot: {book}\n\nJoel" },
  "recancel:c3": { subject: "door's open", body: "Hi {first},\n\nLast note from me about the call. Whenever it suits you: {book}\n\nJoel" },
  "reminder:t24h": { subject: "tomorrow: your knowdrive fit call", body: "Hi {first},\n\nLooking forward to tomorrow. Bring 3-5 non-sensitive files for the demo; we'll load them during the call and run your questions against them. If you can, send me the one question your AI gets wrong today: {confirmed}\n\nThe video link is in your calendar invite. Need to move it? Use the reschedule link in that invite.\n\nJoel" }
};

export const SMS = {
  "followup:d0": "Hi {first}, Joel from knowdrive. Thanks for applying. Grab a time for your fit call here: {book} – Joel, knowdrive",
  "followup:d2": "Hi {first}, still keen to see cited retrieval on your own content? 30 min: {book} – Joel, knowdrive",
  "followup:d7": "Hi {first}, last text from me. The link stays open if timing works later: {book} – Joel, knowdrive",
  "rebook:r0": "Hi {first}, looks like we missed each other. Pick a new time here: {book} – Joel, knowdrive",
  "recancel:c0": "Hi {first}, saw the fit call was cancelled. Pick another time here if it helps: {book} – Joel, knowdrive",
  "reminder:t1h": "Hi {first}, your knowdrive fit call starts in about an hour. The video link is in your calendar invite. – Joel",
  "reminder:t24h": null
};

export function fill(tpl, v) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ""));
}
