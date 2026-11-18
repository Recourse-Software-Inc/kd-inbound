// Fallback copy used when the AI writer is off, slow, or its draft fails validation.
// Same intents as ai.js INTENTS. {first} {company} {book} {free} {site} are filled in by fill().
export const EMAIL = {
  "followup:d0": { subject: "times for your demo", body: "Hi {first},\n\nThanks for applying. You're through to a 60-minute call with me, and the demo runs on your own files: bring 3-5, we load them while you watch, and every answer comes back cited to file, version and byte range.\n\nPick a time: {book}\n\nIf none of the slots work, reply with two times that do and I'll send the invite.\n\nJoel" },
  "followup:d1": { subject: "on your own files", body: "Hi {first},\n\nYou told us you need to see {show}. On the call I'll show exactly that on 3-5 of your own files, loaded while you watch.\n\n60 minutes: {book}\n\nJoel" },
  "followup:d3": { subject: "what a pilot measures", body: "Hi {first},\n\nMost teams we talk to already run a vector database or a search stack. A pilot runs next to it on your own content, and the decision rests on three measured numbers: cost per query, answer quality and citation coverage. The call is where we scope that pilot and what it would cost, so you have numbers for whoever approves it.\n\nPick a time: {book}\n\nJoel" },
  "followup:d5": { subject: "timing or fit", body: "Hi {first},\n\nOne question, since you haven't picked a time yet. Which is closest?\n\n1. Timing is off\n2. Someone else needs to be on the call\n3. Not sure it fits what we run today\n\nReply with the number and I'll take it from there. Or pick a time: {book}\n\nJoel" },
  "followup:d7": { subject: "try it first", body: "Hi {first},\n\nIf you'd rather test before we talk, the free plan gives you 500 MB and 500 searches a month, no card: {free}\n\nLoad a few files and ask the question your current setup gets wrong. Each answer shows the passage behind it.\n\nThe call stays open when you want to scope a pilot: {book}\n\nJoel" },
  "followup:d10": { subject: "last note from me", body: "Hi {first},\n\nThis is my last note about your application, so I'll stop here. When a demo on your own files is useful, the calendar stays open: {book}\n\nJoel" },
  "rebook:r0": { subject: "new time", body: "Hi {first},\n\nWe missed each other today. No problem. Same plan as before: a demo on your own files.\n\nPick a new time: {book}\n\nJoel" },
  "rebook:r1": { subject: "a better day", body: "Hi {first},\n\nIf the earlier slot was the problem, reply with a day that works this week and I'll send an invite. Or pick one directly: {book}\n\nJoel" },
  "rebook:r3": { subject: "last note", body: "Hi {first},\n\nLast note from me about the call. When a demo on {company}'s own files is useful, pick any time: {book}\n\nJoel" },
  "recancel:c0": { subject: "another time", body: "Hi {first},\n\nI saw the call was cancelled. If timing was the issue, pick another slot here: {book}\n\nIf something else changed, no reply needed. I'll send one more short note and leave it there.\n\nJoel" },
  "recancel:c3": { subject: "last note", body: "Hi {first},\n\nLast note from me about the call. Whenever a demo on your own files is useful: {book}\n\nJoel" },
  "dq:d0": { subject: "your knowdrive starting point", body: "Hi {first},\n\nThanks for applying. For where you are now, the free plan is the quickest start: 500 MB and 500 searches a month, no card, with the same cited retrieval as the enterprise plan.\n\nStart here: {free}\n\nWhen you have a production use case and a budget owner, re-apply and we'll look again: {apply}\n\nJoel" },
  "dq:d30": { subject: "a month on", body: "Hi {first},\n\nIt's been a month since you applied. If anything has moved (a production use case, a timeline, a budget owner), re-apply and we'll look again: {apply}\n\nJoel" },
  "reminder:t24h": { subject: "tomorrow's demo", body: "Hi {first},\n\nLooking forward to tomorrow. Bring 3-5 non-sensitive files; we'll load them during the call and run your questions against them.\n\nOne thing helps most: the question your AI gets wrong today. Add it here: {confirmed}\n\nThe video link is in your calendar invite. If the time no longer works, change it from the invite.\n\nJoel" },
  "reminder:tagenda": { subject: "your demo is booked", body: "Hi {first},\n\nYou're booked. Bring 3-5 non-sensitive files; we'll load them during the call and run your questions against them.\n\nOne thing helps most: the question your AI gets wrong today. Add it here, and you can opt in to a text reminder on the same page: {confirmed}\n\nThe video link is in your calendar invite. If the time no longer works, change it from the invite.\n\nJoel" }
};

// Plain ASCII only (GSM-7): no en dashes, curly quotes or emoji, or each text costs 2-3x.
export const SMS = {
  "followup:d0": "Hi {first}, Joel from knowdrive. Thanks for applying. Your 60-min call includes a demo on your files. Pick a time: {book} or reply with one that suits.",
  "followup:d2": "Hi {first}, Joel at knowdrive. Your demo slot is still open: 60 min with me, run on 3-5 of your own files. Pick a time: {book}",
  "rebook:r0": "Hi {first}, Joel at knowdrive. We missed each other today, no problem. Same plan, a demo on your own files. New time: {book}",
  "recancel:c0": "Hi {first}, Joel at knowdrive. Saw the call was cancelled. If timing was the issue, pick another slot: {book}",
  "reminder:t1h": "Hi {first}, your knowdrive demo starts in about an hour. Join from your calendar invite. Running late or need to move it? Reply here. - Joel",
  "reminder:t24h": null
};

export function fill(tpl, v) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ""));
}
