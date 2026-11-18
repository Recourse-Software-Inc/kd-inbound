// Follow-up engine: schedules sequences into D1, and a cron sends whatever is due.
import { now, MIN, HOUR, DAY, intoWindow, leadToken, shortBookLink, parseJSON, firstName, logEvent } from "./util.js";
import { writeMessage } from "./ai.js";
import { EMAIL, SMS, fill } from "./templates.js";
import { sendEmail, sendSms, notifySales } from "./messaging.js";

// D0–D10 AI follow-up for qualified leads who haven't booked (the in-ad cadence: D0, D1, D2, D3, D5, D7, D10).
export const PLANS = {
  // d0 email goes out 24/7 within minutes (speed-to-lead); the rest respect weekday daytime.
  // 6 emails + 2 texts over 10 days.
  followup: [
    { step: "d0", at: 15 * MIN, ch: ["email"], noWindow: true }, // after they had time to book on the page
    { step: "d0", at: 45 * MIN, ch: ["sms"] },
    { step: "d1", at: 1 * DAY, ch: ["email"] },
    { step: "d2", at: 2 * DAY, ch: ["sms"] },
    { step: "d3", at: 3 * DAY, ch: ["email"] },
    { step: "d5", at: 5 * DAY, ch: ["email"] },
    { step: "d7", at: 7 * DAY, ch: ["email"] },
    { step: "d10", at: 10 * DAY, ch: ["email"] }
  ],
  rebook: [
    { step: "r0", at: 20 * MIN, ch: ["email", "sms"] },
    { step: "r1", at: 1 * DAY, ch: ["email"] },
    { step: "r3", at: 3 * DAY, ch: ["email"] }
  ],
  recancel: [
    { step: "c0", at: 30 * MIN, ch: ["email", "sms"] },
    { step: "c3", at: 3 * DAY, ch: ["email"] }
  ],
  dq: [
    { step: "d0", at: 15 * MIN, ch: ["email"], noWindow: true }, // after they had time to book on the page
    { step: "d30", at: 30 * DAY, ch: ["email"] }
  ]
};

// Which lead stages each sequence is allowed to send in (checked again at send time).
const ELIGIBLE = { followup: ["qualified"], rebook: ["no_show"], recancel: ["cancelled"], dq: ["dq"], reminder: ["booked"] };

export async function cancelSeqs(env, leadId, seqs) {
  const q = seqs.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE messages SET status='cancelled' WHERE lead_id=? AND status='pending' AND seq IN (${q})`).bind(leadId, ...seqs).run();
}

// A reply pauses automation for a few business days instead of killing it.
export async function pauseSeqs(env, leadId, seqs, ms) {
  const q = seqs.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE messages SET send_at = MAX(send_at, ?) + ? WHERE lead_id=? AND status='pending' AND seq IN (${q})`).bind(now(), ms, leadId, ...seqs).run();
}

export async function scheduleSeq(env, lead, seq, base = now()) {
  await cancelSeqs(env, lead.id, [seq]);
  const stmts = [];
  let floor = 0;
  for (const p of PLANS[seq]) {
    let at = base + p.at;
    if (!p.noWindow) at = intoWindow(at, lead.tz);
    at = Math.max(at, floor + MIN); floor = at;
    for (const ch of p.ch) {
      if (ch === "sms" && !(lead.sms_consent && lead.phone)) continue;
      // SMS goes a few minutes after the email so they don't land at the same second.
      const sendAt = ch === "sms" ? at + 5 * MIN : at;
      stmts.push(env.DB.prepare("INSERT INTO messages (lead_id, seq, step, channel, send_at, created_at) VALUES (?,?,?,?,?,?)").bind(lead.id, seq, p.step, ch, sendAt, now()));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

export async function scheduleReminders(env, lead, startTs, { moved = false } = {}) {
  await cancelSeqs(env, lead.id, ["reminder"]);
  const t = now(); const stmts = [];
  const add = (step, ch, at) => stmts.push(env.DB.prepare("INSERT INTO messages (lead_id, seq, step, channel, send_at, created_at) VALUES (?,?,?,?,?,?)").bind(lead.id, "reminder", step, ch, at, t));
  // Booking confirmation with the prep link goes out right away (the calendar can't redirect people
  // to the thank-you page), unless this is just a time change.
  if (!moved && startTs - 30 * MIN > t) add("tagenda", "email", t + 2 * MIN);
  if (startTs - 24 * HOUR > t + 2 * HOUR) add("t24h", "email", startTs - 24 * HOUR);
  if (lead.sms_consent && lead.phone && startTs - HOUR > t + 10 * MIN) add("t1h", "sms", startTs - HOUR);
  if (stmts.length) await env.DB.batch(stmts);
}

export async function bookUrl(env, lead, seq, step, channel) {
  const u = new URL(env.SITE_URL.replace(/\/$/, "") + "/book/");
  u.searchParams.set("lid", lead.id);
  u.searchParams.set("t", await leadToken(env, lead.id));
  u.searchParams.set("utm_source", "followup");
  u.searchParams.set("utm_medium", channel);
  u.searchParams.set("utm_campaign", seq + "-" + step);
  return u.toString();
}

export async function compose(env, lead, msg) {
  const answers = parseJSON(lead.answers, {});
  const key = msg.seq + ":" + msg.step;
  const book = msg.channel === "sms" ? await shortBookLink(env, lead.id) : await bookUrl(env, lead, msg.seq, msg.step, msg.channel);
  const tok = await leadToken(env, lead.id);
  const vars = {
    first: firstName(lead.name), company: lead.company || "your team", book,
    free: env.FREE_PLAN_URL || "https://knowdrive.ai/pricing",
    apply: env.SITE_URL.replace(/\/$/, "") + "/apply/",
    confirmed: env.SITE_URL.replace(/\/$/, "") + "/confirmed/?lid=" + encodeURIComponent(lead.id) + "&t=" + tok,
    site: env.SITE_URL,
    show: showLine(answers.needs)
  };
  // AI for the persuasion sequences; fixed templates for reminders and the DQ resources email.
  if (["followup", "rebook", "recancel"].includes(msg.seq) && env.AI_FOLLOWUPS !== "0") {
    const ai = await writeMessage(env, { lead: Object.assign({}, lead, { angle: lead.ai_angle }), answers: Object.assign({ stack: [], needs: [] }, answers), seq: msg.seq, step: msg.step, channel: msg.channel, bookUrl: book });
    if (ai) return { subject: ai.subject, body: ai.body, ai: true };
  }
  if (msg.channel === "sms") { const t = SMS[key]; return t ? { body: fill(t, vars) } : null; }
  const t = EMAIL[key]; return t ? { subject: fill(t.subject, vars), body: fill(t.body, vars) } : null;
}

export async function runDue(env, limit = 12) {
  const t = now();
  const budgetEnd = t + 4 * MIN; // stop picking up work well before the next cron tick
  await noShowWatch(env, t);
  await callAlerts(env, t);
  const { results } = await env.DB.prepare("SELECT * FROM messages WHERE status='pending' AND send_at<=? ORDER BY send_at LIMIT ?").bind(t, limit).all();
  let sent = 0;
  for (const msg of results) {
    if (now() > budgetEnd) break;
    const claim = await env.DB.prepare("UPDATE messages SET status='sending', attempts=attempts+1, claimed_at=? WHERE id=? AND status='pending'").bind(now(), msg.id).run();
    if (!claim.meta || !claim.meta.changes) continue; // another invocation took it
    const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(msg.lead_id).first();
    const skip = async (why) => env.DB.prepare("UPDATE messages SET status='skipped', error=? WHERE id=?").bind(why, msg.id).run();
    if (!lead) { await skip("lead missing"); continue; }
    if (!ELIGIBLE[msg.seq].includes(lead.stage)) { await skip("stage " + lead.stage); continue; }
    if (msg.seq === "reminder" && (!lead.booking_start || lead.booking_start < t)) { await skip("no upcoming booking"); continue; }
    if (msg.channel === "email" && lead.email_unsub) { await skip("unsubscribed"); continue; }
    if (msg.channel === "sms" && (!lead.sms_consent || lead.sms_optout || !lead.phone)) { await skip("no sms consent"); continue; }
    // SMS quiet hours are strict; the 1-hour reminder is exempt because the lead chose the time.
    if (msg.channel === "sms" && msg.step !== "t1h") {
      const w = intoWindow(t, lead.tz, { start: 9, end: 20 });
      if (w > t) { await env.DB.prepare("UPDATE messages SET status='pending', send_at=? WHERE id=?").bind(w, msg.id).run(); continue; }
    }
    let c;
    try { c = await compose(env, lead, msg); } catch (e) { c = null; console.error("compose", e); }
    if (!c) { await skip("no copy for " + msg.seq + ":" + msg.step); continue; }
    const r = msg.channel === "sms" ? await sendSms(env, lead, c.body) : await sendEmail(env, lead, { subject: c.subject, text: c.body });
    if (r.ok) {
      sent++;
      await env.DB.prepare("UPDATE messages SET status='sent', sent_at=?, subject=?, body=?, error=? WHERE id=?").bind(now(), c.subject || null, c.body, c.ai ? "ai" : "template", msg.id).run();
    } else if (msg.attempts + 1 < 3) {
      await env.DB.prepare("UPDATE messages SET status='pending', send_at=?, error=? WHERE id=?").bind(now() + 15 * MIN, r.error, msg.id).run();
    } else {
      await env.DB.prepare("UPDATE messages SET status='failed', error=? WHERE id=?").bind(r.error, msg.id).run();
      await logEvent(env, lead.id, "send_failed", { seq: msg.seq, step: msg.step, channel: msg.channel, error: r.error });
    }
  }
  // Recover rows stuck in 'sending' (invocation died mid-send). Claimed >15 min ago can't still be in flight.
  await env.DB.prepare("UPDATE messages SET status='pending' WHERE status='sending' AND claimed_at < ? AND attempts < 3").bind(t - 15 * MIN).run();
  await env.DB.prepare("UPDATE messages SET status='failed', error=COALESCE(error,'stuck') WHERE status='sending' AND claimed_at < ? AND attempts >= 3").bind(t - 15 * MIN).run();
  return { due: results.length, sent };
}

// A qualified lead who left the calendar without booking: ask a human to call within the hour.
async function callAlerts(env, t) {
  const { results } = await env.DB.prepare(`SELECT * FROM leads l WHERE stage='qualified' AND qualified_at BETWEEN ? AND ? AND phone IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.lead_id=l.id AND e.type='call_alert') LIMIT 10`).bind(t - 2 * HOUR, t - 15 * MIN).all();
  for (const l of results) {
    if (intoWindow(t, "America/Toronto", { start: 9, end: 18 }) > t) continue; // only alert during your business hours
    await logEvent(env, l.id, "call_alert", {});
    await notifySales(env, `CALL NOW: ${l.name} (${l.company}) qualified but hasn't booked`, `${l.name} · ${l.phone} · ${l.email}\n${l.ai_summary || ""}\n\nThey saw the calendar ${Math.round((t - l.qualified_at) / MIN)} minutes ago and left without booking. A call in the next hour is the best chance to book them.\nAdmin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${l.id}`);
  }
}

// Cal.com only reports a no-show if the host marks it. Once the call should be over (start + 70 min),
// ask Joel to mark the outcome; at start + 3 h with no outcome, treat it as a no-show and start rebook.
async function noShowWatch(env, t) {
  const { results: ask } = await env.DB.prepare("SELECT * FROM leads WHERE stage='booked' AND booking_start < ? AND noshow_nudged=0 LIMIT 20").bind(t - 70 * MIN).all();
  for (const l of ask) {
    await env.DB.prepare("UPDATE leads SET noshow_nudged=1 WHERE id=?").bind(l.id).run();
    await notifySales(env, `mark the outcome: ${l.name} (${l.company})`, `The demo call was scheduled for ${new Date(l.booking_start).toISOString()}. Mark Showed / No-show / Won / Lost:\n${env.SITE_URL.replace(/\/$/, "")}/admin/#${l.id}\n\nIf nothing is marked within 3 hours of the start time, it will be treated as a no-show and a rebook sequence will start.`);
  }
  const { results: auto } = await env.DB.prepare("SELECT * FROM leads WHERE stage='booked' AND booking_start < ? AND noshow_nudged=1 LIMIT 20").bind(t - 3 * HOUR).all();
  for (const l of auto) {
    await env.DB.prepare("UPDATE leads SET stage='no_show', noshow_nudged=2, updated_at=? WHERE id=? AND stage='booked'").bind(t, l.id).run();
    await cancelSeqs(env, l.id, ["reminder"]);
    await scheduleSeq(env, Object.assign({}, l, { stage: "no_show" }), "rebook");
    await logEvent(env, l.id, "auto_no_show", { booking_start: l.booking_start });
  }
}

const SHOW = {
  citations: "every answer traced to the exact passage, file and version behind it",
  cost: "cost per answer on your files, against what you run today",
  sovereignty: "knowdrive running in your jurisdiction or on your own hardware",
  media: "search inside recordings and video, landing on the exact timestamp",
  agent_memory: "one shared memory your agents and staff all read from",
  consolidate: "one service in place of your vector database, file store and chunking pipeline"
};
function showLine(needs) { const n = (needs || []).find(k => SHOW[k]); return SHOW[n || "citations"]; }
