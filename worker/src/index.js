// knowdrive inbound system — Cloudflare Worker
// HTTP API for the funnel, webhooks (Cal.com, Twilio), a cron that sends follow-ups,
// and an Email Worker handler that answers replies.
import { json, html, cors, uid, now, MIN, HOUR, DAY, leadToken, shortBookLink, checkLeadToken, hmacHex, hmacB64, safeEqual, parseJSON, logEvent, esc, clip, firstName } from "./util.js";
import { cleanAnswers, ruleScore, decide } from "./score.js";
import { scoreUseCase, handleReply, callBrief } from "./ai.js";
import { sendSignal } from "./signals.js";
import { scheduleSeq, scheduleReminders, cancelSeqs, pauseSeqs, runDue, bookUrl } from "./sequence.js";
import { sendEmail, notifySales } from "./messaging.js";
import { handleEmail } from "./email-inbound.js";

const STAGES = ["qualified", "dq", "booked", "showed", "no_show", "won", "lost", "cancelled", "direct"];
const LATE = ["booked", "showed", "won"]; // never regress these from a re-application

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return cors(env, req, new Response(null, { status: 204 }));
    let res;
    try { res = await route(req, env, ctx); }
    catch (e) { console.error(e); res = json({ error: "server error" }, 500); }
    return cors(env, req, res);
  },
  async scheduled(_evt, env, ctx) { ctx.waitUntil(runDue(env)); },
  async email(message, env, ctx) { await handleEmail(message, env, ctx); }
};

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (p === "/" && req.method === "GET") return Response.redirect(env.SITE_URL, 302); // the API has no page of its own
  if (p === "/health") return json({ ok: true, ts: now() });
  if (p === "/api/lead" && req.method === "POST") return createLead(req, env, ctx);
  if (p === "/api/lead" && req.method === "GET") return getLeadPublic(url, env);
  if (p === "/api/booked" && req.method === "POST") return bookedHint(req, env, ctx);
  if (p === "/api/precall" && req.method === "POST") return precall(req, env, ctx);
  if (p === "/hooks/cal" && req.method === "POST") return calWebhook(req, env, ctx);
  if (p === "/hooks/twilio" && req.method === "POST") return twilioWebhook(req, env, ctx);
  if (p === "/hooks/gcal" && req.method === "POST") return gcalWebhook(req, env, ctx);
  if (p === "/u") return unsubscribe(req, url, env);
  const short = p.match(/^\/b\/([\w-]+)\/(\w{10})$/);
  if (short && req.method === "GET") return shortRedirect(env, short[1], short[2]);
  if (p.startsWith("/api/admin/")) return admin(req, url, env, ctx);
  return json({ error: "not found" }, 404);
}

async function body(req, max = 20000) {
  const t = await req.text();
  if (t.length > max) throw Object.assign(new Error("too large"), { status: 413 });
  return parseJSON(t, {});
}
const getLead = (env, id) => env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
const getLeadByEmail = (env, email) => env.DB.prepare("SELECT * FROM leads WHERE email=?").bind(String(email || "").toLowerCase()).first();

// ---------------------------------------------------------------- application
async function createLead(req, env, ctx) {
  const b = await body(req);
  const c = b.contact || {};
  if (c.website) return json({ route: "dq", leadId: "", token: "" }); // honeypot: look normal, store nothing

  const contact = {
    name: clip(String(c.name || "").trim(), 120),
    company: clip(String(c.company || "").trim(), 160),
    email: String(c.email || "").trim().toLowerCase(),
    phone: String(c.phone || "").trim(),
    smsConsent: !!c.smsConsent
  };
  if (contact.name.length < 2) return json({ error: "Please add your name.", field: "name" }, 400);
  if (contact.company.length < 2) { // the form no longer asks; use the email domain
    const base = (contact.email.split("@")[1] || "").split(".").slice(-2, -1)[0] || "";
    contact.company = base ? base.charAt(0).toUpperCase() + base.slice(1) : "-";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email) || contact.email.length > 200) return json({ error: "Please use a valid email address.", field: "email" }, 400);
  if (contact.phone && !/^\+\d{8,15}$/.test(contact.phone)) return json({ error: "Include the country code, e.g. +1 416 555 0100.", field: "phone" }, 400);
  if (!contact.phone) contact.smsConsent = false;

  const ip = req.headers.get("cf-connecting-ip") || "";
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE ip=? AND updated_at>?").bind(ip, now() - HOUR).first();
  if (ip && recent && recent.n >= Number(env.MAX_APPS_PER_IP_HOUR || 8)) return json({ error: "Too many applications from this network. Try again later." }, 429);

  // Optional Cloudflare Turnstile (set TURNSTILE_SECRET + turnstileSiteKey in site config).
  if (env.TURNSTILE_SECRET) {
    const tv = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(b.turnstile || ""), remoteip: ip }) }).then(r => r.json()).catch(() => ({ success: false }));
    if (!tv.success) return json({ error: "Please complete the verification and try again.", field: "turnstile" }, 400);
  }

  const answers = cleanAnswers(b.answers);
  const attr = cleanAttribution(b.attribution, req);
  const tz = attr.tz || (req.cf && req.cf.timezone) || "America/Toronto";
  const eventId = b.eventId ? clip(String(b.eventId), 80) : null;

  const existing = await getLeadByEmail(env, contact.email);
  // Idempotent on the browser's event id: a timed-out request that is retried returns the first result.
  if (existing && eventId && existing.last_event_id === eventId) {
    return json({ route: existing.stage === "dq" ? "dq" : "qualified", leadId: "", token: "" });
  }

  const rule = ruleScore(answers, contact.email);
  // Global hourly cap on AI scoring protects spend if the form is hammered.
  const aiRecent = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='applied' AND ts>?").bind(now() - HOUR).first();
  const aiAllowed = !aiRecent || aiRecent.n < Number(env.AI_SCORING_HOURLY_CAP || 120);
  const ai = aiAllowed && !rule.hardDQ && answers.usecase.length >= 10 ? await scoreUseCase(env, answers, contact) : null;
  const decision = decide(rule, ai ? ai.fit : null, Number(env.QUALIFY_THRESHOLD || 7));
  const t = now();
  let id, stageChanged, lead;

  if (!existing) {
    id = uid();
    await env.DB.prepare("INSERT INTO leads (id, created_at, updated_at, email, name, company, phone, sms_consent, tz, stage, score, ai_fit, ai_summary, ai_flags, ai_angle, answers, attribution, ip, last_event_id, source, qualified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, t, t, contact.email, contact.name, contact.company, contact.phone || null, contact.smsConsent ? 1 : 0, tz, decision.route, decision.total, ai ? ai.fit : null, ai ? ai.summary : null, ai ? JSON.stringify(ai.flags) : null, ai ? ai.angle : null, JSON.stringify(answers), JSON.stringify(attr), ip, eventId, "application", decision.route === "qualified" ? t : null).run();
    stageChanged = true;
  } else {
    // Re-application. Nothing here is verified, so contact details, consent and opt-outs are never
    // overwritten from a form post; the new submission is logged for review instead.
    id = existing.id;
    const late = LATE.includes(existing.stage);
    const newStage = late ? existing.stage : decision.route;
    stageChanged = newStage !== existing.stage;
    await env.DB.prepare("UPDATE leads SET stage=?, score=?, ai_fit=?, ai_summary=?, ai_flags=?, ai_angle=?, answers=?, attribution=?, updated_at=?, applications=applications+1, last_event_id=?, qualified_at=COALESCE(qualified_at, ?) WHERE id=?")
      .bind(newStage, late ? existing.score : decision.total, ai ? ai.fit : existing.ai_fit, ai ? ai.summary : existing.ai_summary, ai ? JSON.stringify(ai.flags) : existing.ai_flags, ai ? ai.angle : existing.ai_angle, late ? existing.answers : JSON.stringify(answers), JSON.stringify(attr), t, eventId, newStage === "qualified" ? t : null, id).run();
    await logEvent(env, id, "reapplied", { submitted: { name: contact.name, company: contact.company, phone: contact.phone, smsConsent: contact.smsConsent }, from: existing.stage, to: newStage });
  }
  lead = await getLead(env, id);
  await logEvent(env, id, "applied", { route: decision.route, total: decision.total, rule: rule.reasons, ai, aiAllowed });

  if (stageChanged && !LATE.includes(lead.stage)) {
    ctx.waitUntil((async () => {
      await sendSignal(env, lead, decision.route, { eventId: eventId || undefined });
      if (decision.route === "qualified") {
        await cancelSeqs(env, id, ["dq", "rebook", "recancel"]);
        await scheduleSeq(env, lead, "followup");
        await notifySales(env, `qualified: ${lead.name} (${lead.company}) score ${decision.total}`, leadDigest(env, lead, answers, rule, ai));
      } else {
        await cancelSeqs(env, id, ["followup", "rebook", "recancel"]);
        await scheduleSeq(env, lead, "dq");
      }
    })());
  }
  const route = LATE.includes(lead.stage) || lead.stage === "qualified" ? "qualified" : "dq";
  // Only a brand-new lead gets a token in the browser; re-applicants are matched by email at booking.
  return json({ route, leadId: existing ? "" : id, token: existing ? "" : await leadToken(env, id) });
}

// Keep only known attribution fields, each clipped, so the stored JSON is always valid.
function cleanAttribution(a, req) {
  a = a && typeof a === "object" ? a : {};
  const touch = (x) => {
    if (!x || typeof x !== "object") return {};
    const o = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "wbraid", "gbraid", "li_fat_id", "ad_id", "creative", "landing", "referrer"]) if (x[k]) o[k] = clip(String(x[k]), 300);
    if (Number.isFinite(x.ts)) o.ts = x.ts;
    return o;
  };
  return {
    first: touch(a.first), last: touch(a.last),
    fbp: clip(String(a.fbp || ""), 120), fbc: clip(String(a.fbc || ""), 300),
    li_fat_id: clip(String(a.li_fat_id || ""), 120), gclid: clip(String(a.gclid || ""), 300),
    ga_client_id: clip(String(a.ga_client_id || ""), 60), page: clip(String(a.page || ""), 500),
    tz: clip(String(a.tz || ""), 60), ua: clip(req.headers.get("user-agent") || String(a.ua || ""), 300),
    country: (req.cf && req.cf.country) || ""
  };
}

async function shortRedirect(env, id, t10) {
  const full = await leadToken(env, id);
  if (full.slice(0, 10) !== t10) return html("<p>This link has expired.</p>", 404);
  const u = new URL(env.SITE_URL.replace(/\/$/, "") + "/book/");
  u.searchParams.set("lid", id); u.searchParams.set("t", full);
  u.searchParams.set("utm_source", "followup"); u.searchParams.set("utm_medium", "sms");
  return Response.redirect(u.toString(), 302);
}

function leadDigest(env, lead, a, rule, ai) {
  return [
    `${lead.name} · ${lead.company} · ${lead.email}${lead.phone ? " · " + lead.phone : ""}`,
    `Role ${a.role} · building ${a.building} · volume ${a.volume} · timeline ${a.timeline} · budget ${a.budget}`,
    `Stack: ${a.stack.join(", ") || "-"} · Needs: ${a.needs.join(", ") || "-"}`,
    ``, `Use case: ${a.usecase}`, ``,
    ai ? `AI fit ${ai.fit}/3: ${ai.summary}\nAngle: ${ai.angle}\nFlags: ${ai.flags.join("; ") || "-"}` : "AI fit: unavailable",
    `Rules: ${rule.reasons.join(", ")}`,
    ``, `Admin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${lead.id}`
  ].join("\n");
}

async function getLeadPublic(url, env) {
  const id = url.searchParams.get("lid");
  if (!(await checkLeadToken(env, id, url.searchParams.get("t")))) return json({ error: "invalid link" }, 403);
  const lead = await getLead(env, id);
  if (!lead) return json({ error: "not found" }, 404);
  const a = parseJSON(lead.answers, {});
  return json({ id: lead.id, name: lead.name, email: lead.email, company: lead.company, phone: lead.phone, stage: lead.stage, bookingStart: lead.booking_start, building: a.building, needs: a.needs, usecase: a.usecase });
}

// ---------------------------------------------------------------- booking
const SIGNAL_FROM = ["qualified", "no_show", "cancelled"]; // a booking from these is a new conversion

async function markBooked(env, ctx, lead, { startTime, bookingUid, eventId, source }) {
  const start = startTime ? Date.parse(startTime) : NaN;
  const t = now();
  // Atomic transition: when the browser hint and the Cal webhook race, exactly one of them wins.
  const r = await env.DB.prepare("UPDATE leads SET stage='booked', booking_start=COALESCE(?, booking_start), booking_uid=COALESCE(?, booking_uid), booked_at=COALESCE(booked_at, ?), noshow_nudged=0, updated_at=? WHERE id=? AND stage NOT IN ('booked','showed','won')")
    .bind(isNaN(start) ? null : start, bookingUid || null, t, t, lead.id).run();
  const won = r.meta && r.meta.changes === 1;
  if (!won && !isNaN(start)) {
    // Already booked: just make sure the time and uid are current.
    await env.DB.prepare("UPDATE leads SET booking_start=?, booking_uid=COALESCE(?, booking_uid), updated_at=? WHERE id=? AND stage='booked'").bind(start, bookingUid || null, t, lead.id).run();
  }
  await cancelSeqs(env, lead.id, ["followup", "rebook", "recancel", "dq"]);
  const fresh = await getLead(env, lead.id);
  if (fresh.stage === "booked" && fresh.booking_start) await scheduleReminders(env, fresh, fresh.booking_start, { moved: !won });
  await logEvent(env, lead.id, "booked", { source, startTime, bookingUid, from: lead.stage, transitioned: won });
  if (won) {
    ctx.waitUntil((async () => {
      if (SIGNAL_FROM.includes(lead.stage)) await sendSignal(env, fresh, "booked", { eventId: eventId || (bookingUid ? "bk_" + bookingUid : undefined) });
      const brief = await callBrief(env, { lead: fresh, answers: Object.assign({ stack: [], needs: [] }, parseJSON(fresh.answers, {})), precall: parseJSON(fresh.precall, {}) });
      await notifySales(env, `booked: ${fresh.name} (${fresh.company || fresh.email}) ${isNaN(start) ? "" : new Date(start).toISOString()}${lead.stage === "dq" ? " [WAS DISQUALIFIED]" : ""}${fresh.source === "direct-booking" ? " [DIRECT, never applied]" : ""}`, (brief || "No AI brief available.") + `\n\nAdmin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${fresh.id}`);
    })());
  }
}

async function bookedHint(req, env, ctx) {
  const b = await body(req);
  if (!(await checkLeadToken(env, b.leadId, b.token))) return json({ ok: false, note: "no valid lead token; webhook will record the booking" }, 202);
  const lead = await getLead(env, b.leadId);
  if (!lead) return json({ ok: false }, 404);
  await markBooked(env, ctx, lead, { startTime: b.startTime, bookingUid: b.bookingUid ? clip(b.bookingUid, 120) : null, eventId: b.eventId ? clip(b.eventId, 80) : null, source: "browser" });
  return json({ ok: true });
}

async function precall(req, env, ctx) {
  const b = await body(req);
  if (!(await checkLeadToken(env, b.leadId, b.token))) return json({ error: "invalid" }, 403);
  const lead = await getLead(env, b.leadId);
  if (!lead) return json({ error: "not found" }, 404);
  // Merge: the SMS opt-in and the question form post separately, so never blank out earlier answers.
  const prev = parseJSON(lead.precall, {}) || {};
  const data = { wrong: b.wrong ? clip(b.wrong, 800) : (prev.wrong || ""), team: b.team ? clip(b.team, 300) : (prev.team || ""), at: now() };
  let phone = lead.phone, consent = lead.sms_consent;
  const p = String(b.phone || "").replace(/[^\d+]/g, "");
  if (b.smsConsent) {
    if (!/^\+\d{8,15}$/.test(p)) return json({ error: "Include the country code, e.g. +1 416 555 0100.", field: "phone" }, 400);
    phone = p; consent = 1;
  }
  await env.DB.prepare("UPDATE leads SET precall=?, phone=?, sms_consent=?, updated_at=? WHERE id=?").bind(JSON.stringify(data), phone, consent, now(), lead.id).run();
  if (consent && !lead.sms_consent && lead.booking_start && lead.booking_start - HOUR > now() + 10 * MIN) {
    // Only the 1-hour text is new; the email reminders are already queued or sent.
    await env.DB.prepare("INSERT INTO messages (lead_id, seq, step, channel, send_at, created_at) VALUES (?,?,?,?,?,?)").bind(lead.id, "reminder", "t1h", "sms", lead.booking_start - HOUR, now()).run();
  }
  await logEvent(env, lead.id, "precall", data);
  if (b.wrong || b.team) ctx.waitUntil(notifySales(env, `pre-call notes: ${lead.name} (${lead.company})`, `Question their AI gets wrong:\n${data.wrong || "-"}\n\nJoining: ${data.team || "-"}`));
  return json({ ok: true });
}

async function calWebhook(req, env, ctx) {
  const raw = await req.text();
  // Fail closed: without a secret, nobody can prove a booking happened.
  if (!env.CAL_WEBHOOK_SECRET && env.DEV_INSECURE_WEBHOOKS !== "1") return json({ error: "CAL_WEBHOOK_SECRET not configured" }, 401);
  if (env.CAL_WEBHOOK_SECRET) {
    const sig = req.headers.get("x-cal-signature-256") || "";
    if (!safeEqual(sig, await hmacHex(env.CAL_WEBHOOK_SECRET, raw))) return json({ error: "bad signature" }, 401);
  }
  const evt = parseJSON(raw, {});
  const type = evt.triggerEvent;
  const pl = evt.payload || {};
  const attendee = (pl.attendees || [])[0] || {};
  const email = String(attendee.email || (pl.responses && pl.responses.email && pl.responses.email.value) || "").toLowerCase();
  let lead = (pl.metadata && pl.metadata.leadId && await getLead(env, pl.metadata.leadId)) || (email && await getLeadByEmail(env, email));
  await logEvent(env, lead && lead.id, "cal:" + type, { uid: pl.uid, startTime: pl.startTime, email });

  if (!lead && (type === "BOOKING_CREATED" || type === "BOOKING_RESCHEDULED") && email) {
    // Booked straight from a calendar link without applying: record it so nothing is lost.
    const id = uid(); const t = now();
    // Stage 'direct' never counts as a conversion; markBooked flags it for you.
    await env.DB.prepare("INSERT INTO leads (id, created_at, updated_at, email, name, company, stage, tz, answers, attribution, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, t, t, email, clip(attendee.name || "", 120), "", "direct", clip(attendee.timeZone || "America/Toronto", 60), "{}", "{}", "direct-booking").run();
    lead = await getLead(env, id);
  }
  if (!lead) return json({ ok: true, note: "no matching lead" });

  if (type === "BOOKING_CREATED" || type === "BOOKING_RESCHEDULED") {
    if (type === "BOOKING_RESCHEDULED") {
      // A time move, whatever order the webhooks arrived in: never a new conversion.
      await env.DB.prepare("UPDATE leads SET stage=CASE WHEN stage IN ('showed','won') THEN stage ELSE 'booked' END, booking_start=?, booking_uid=?, noshow_nudged=0, updated_at=? WHERE id=?").bind(Date.parse(pl.startTime), pl.uid || lead.booking_uid, now(), lead.id).run();
      await cancelSeqs(env, lead.id, ["followup", "rebook", "recancel"]);
      await scheduleReminders(env, await getLead(env, lead.id), Date.parse(pl.startTime), { moved: true });
    } else {
      await markBooked(env, ctx, lead, { startTime: pl.startTime, bookingUid: pl.uid, source: "cal:" + type });
    }
  } else if (type === "BOOKING_CANCELLED") {
    if (lead.stage === "booked" && (!lead.booking_uid || !pl.uid || lead.booking_uid === pl.uid)) {
      await env.DB.prepare("UPDATE leads SET stage='cancelled', updated_at=? WHERE id=?").bind(now(), lead.id).run();
      await cancelSeqs(env, lead.id, ["reminder"]);
      const byHost = pl.cancelledBy && pl.organizer && String(pl.cancelledBy).toLowerCase() === String(pl.organizer.email || "").toLowerCase();
      if (byHost) ctx.waitUntil(notifySales(env, `you cancelled ${lead.name}'s call: no automatic follow-up sent`, `Reach out personally to rebook.\nAdmin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${lead.id}`));
      else await scheduleSeq(env, await getLead(env, lead.id), "recancel");
    }
  } else if (type === "BOOKING_NO_SHOW_UPDATED") {
    const noShow = (pl.attendees || []).some(a => a.noShow) || pl.noShowHost === false && pl.noShow === true;
    if (noShow && ["booked", "showed"].includes(lead.stage)) await setStage(env, ctx, lead, "no_show");
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------- Google Calendar appointment bookings
// An Apps Script running as the calendar owner (integrations/google-calendar/Code.gs) posts changed
// appointment events here every minute, signed with GCAL_HOOK_SECRET.
async function gcalWebhook(req, env, ctx) {
  const raw = await req.text();
  if (!env.GCAL_HOOK_SECRET) return json({ error: "GCAL_HOOK_SECRET not configured" }, 401);
  const sig = req.headers.get("x-kd-signature") || "";
  if (!safeEqual(sig, await hmacHex(env.GCAL_HOOK_SECRET, raw))) return json({ error: "bad signature" }, 401);
  const body = parseJSON(raw, {});
  const owner = String(env.GCAL_OWNER || "").toLowerCase();
  const results = [];
  for (const ev of (body.events || []).slice(0, 50)) {
    const attendee = (ev.attendees || []).find(a => a.email && a.email.toLowerCase() !== owner && !a.resource) || {};
    const email = String(attendee.email || "").toLowerCase();
    if (!email || !ev.id) { results.push({ id: ev.id, skipped: "no guest" }); continue; }
    let lead = await getLeadByEmail(env, email);
    await logEvent(env, lead && lead.id, "gcal:" + (ev.status || "updated"), { id: ev.id, start: ev.start, email });
    if (ev.status === "cancelled") {
      if (lead && lead.stage === "booked" && (!lead.booking_uid || lead.booking_uid === ev.id)) {
        await env.DB.prepare("UPDATE leads SET stage='cancelled', updated_at=? WHERE id=?").bind(now(), lead.id).run();
        await cancelSeqs(env, lead.id, ["reminder"]);
        if (ev.cancelledByOwner) ctx.waitUntil(notifySales(env, `you cancelled ${lead.name}'s call: no automatic follow-up sent`, `Reach out personally to rebook.\nAdmin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${lead.id}`));
        else await scheduleSeq(env, await getLead(env, lead.id), "recancel");
      }
      results.push({ id: ev.id, ok: "cancelled" }); continue;
    }
    const start = Date.parse(ev.start);
    if (isNaN(start)) { results.push({ id: ev.id, skipped: "no start" }); continue; }
    if (!lead) {
      const id = uid(); const t = now();
      await env.DB.prepare("INSERT INTO leads (id, created_at, updated_at, email, name, company, stage, tz, answers, attribution, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, t, t, email, clip(attendee.displayName || "", 120), "", "direct", "America/Toronto", "{}", "{}", "direct-booking").run();
      lead = await getLead(env, id);
    }
    if (lead.stage === "booked" && lead.booking_uid === ev.id) {
      if (lead.booking_start !== start) { // moved
        await env.DB.prepare("UPDATE leads SET booking_start=?, noshow_nudged=0, updated_at=? WHERE id=?").bind(start, now(), lead.id).run();
        await scheduleReminders(env, await getLead(env, lead.id), start, { moved: true });
      }
      results.push({ id: ev.id, ok: "unchanged-or-moved" }); continue;
    }
    await markBooked(env, ctx, lead, { startTime: new Date(start).toISOString(), bookingUid: ev.id, source: "gcal" });
    results.push({ id: ev.id, ok: "booked" });
  }
  return json({ ok: true, results });
}

// ---------------------------------------------------------------- stage changes (admin + webhooks)
async function setStage(env, ctx, lead, stage, value) {
  if (!STAGES.includes(stage)) throw new Error("bad stage");
  const tsCol = { qualified: "qualified_at", booked: "booked_at", showed: "showed_at", won: "won_at" }[stage];
  await env.DB.prepare(`UPDATE leads SET stage=?, deal_value=COALESCE(?, deal_value), updated_at=?${tsCol ? `, ${tsCol}=COALESCE(${tsCol}, ?)` : ""} WHERE id=?`).bind(...[stage, value ?? null, now()].concat(tsCol ? [now()] : []), lead.id).run();
  const fresh = await getLead(env, lead.id);
  await logEvent(env, lead.id, "stage", { from: lead.stage, to: stage, value });
  if (stage === "no_show") { await cancelSeqs(env, lead.id, ["reminder"]); await scheduleSeq(env, fresh, "rebook"); }
  if (stage === "qualified" && lead.stage === "dq") { await cancelSeqs(env, lead.id, ["dq"]); await scheduleSeq(env, fresh, "followup"); }
  if (["showed", "won", "lost"].includes(stage)) await cancelSeqs(env, lead.id, ["followup", "rebook", "recancel", "dq", "reminder"]);
  if (["qualified", "showed", "won"].includes(stage) && stage !== lead.stage) ctx.waitUntil(sendSignal(env, fresh, stage, { eventId: lead.id + ":" + stage, value }));
  return fresh;
}

// ---------------------------------------------------------------- SMS replies
async function twilioWebhook(req, env, ctx) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  if (!env.TWILIO_TOKEN && env.DEV_INSECURE_WEBHOOKS !== "1") return new Response("not configured", { status: 401 });
  if (env.TWILIO_TOKEN) {
    const sorted = [...params.keys()].sort().map(k => k + params.get(k)).join("");
    const expected = await hmacB64(env.TWILIO_TOKEN, env.API_URL.replace(/\/$/, "") + "/hooks/twilio" + sorted, "SHA-1");
    if (!safeEqual(req.headers.get("x-twilio-signature") || "", expected)) return new Response("bad signature", { status: 401 });
  }
  const from = params.get("From") || ""; const text = (params.get("Body") || "").trim();
  const twiml = (msg) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${esc(msg)}</Message>` : ""}</Response>`, { headers: { "content-type": "text/xml" } });
  const lead = await env.DB.prepare("SELECT * FROM leads WHERE phone=? ORDER BY updated_at DESC LIMIT 1").bind(from).first();
  if (!lead) return twiml("");
  const kw = text.toUpperCase();
  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|ARRET|ARRÊT)$/.test(kw)) {
    await env.DB.prepare("UPDATE leads SET sms_optout=1, updated_at=? WHERE id=?").bind(now(), lead.id).run();
    await env.DB.prepare("UPDATE messages SET status='cancelled' WHERE lead_id=? AND channel='sms' AND status='pending'").bind(lead.id).run();
    await logEvent(env, lead.id, "sms_optout", {});
    return twiml(""); // carrier/Twilio sends the compliance confirmation
  }
  if (/^(START|UNSTOP|YES)$/.test(kw)) { await env.DB.prepare("UPDATE leads SET sms_optout=0 WHERE id=?").bind(lead.id).run(); return twiml(""); }
  if (lead.sms_optout) { ctx.waitUntil(notifySales(env, `SMS from opted-out lead: ${lead.name}`, text)); return twiml(""); }
  return twiml(await converse(env, ctx, lead, "sms", text));
}

// Shared by SMS and email replies: log, pause automated follow-ups, let the AI answer or hand off.
export async function converse(env, ctx, lead, channel, text, meta = {}) {
  const t = now();
  await env.DB.prepare("INSERT INTO messages (lead_id, seq, step, channel, direction, send_at, status, body, created_at, subject) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(lead.id, "reply", "in", channel, "in", t, "received", clip(text, 4000), t, meta.subject || null).run();
  await env.DB.prepare("UPDATE leads SET last_reply_at=? WHERE id=?").bind(t, lead.id).run();
  // A person is talking now: pause automation for 3 days (it resumes unless they book, opt out or need Joel).
  await pauseSeqs(env, lead.id, ["followup", "rebook", "recancel", "dq"], 3 * DAY);
  const { results: history } = await env.DB.prepare("SELECT direction, body FROM messages WHERE lead_id=? AND status IN ('sent','received') ORDER BY created_at DESC LIMIT 6").bind(lead.id).all();
  const book = channel === "sms" ? await shortBookLink(env, lead.id) : await bookUrl(env, lead, "reply", channel, channel);
  const r = env.AI_REPLIES === "0" ? { action: "handoff", body: "", reason: "auto-replies off" } : await handleReply(env, { lead, answers: parseJSON(lead.answers, {}), channel, text, bookUrl: book, history: history.reverse() });
  await logEvent(env, lead.id, "reply:" + r.action, { channel, reason: r.reason });
  if (r.action === "unsubscribe") {
    await env.DB.prepare(`UPDATE leads SET ${channel === "sms" ? "sms_optout" : "email_unsub"}=1 WHERE id=?`).bind(lead.id).run();
    await env.DB.prepare("UPDATE messages SET status='cancelled' WHERE lead_id=? AND status='pending'").bind(lead.id).run();
    ctx.waitUntil(notifySales(env, `unsubscribed via ${channel}: ${lead.name}`, text));
    return channel === "sms" ? "Done, you won't hear from us again. – Joel, knowdrive" : "Done. You won't get any more emails from us about this.\n\nJoel";
  }
  if (r.action === "handoff" || !r.body) {
    await cancelSeqs(env, lead.id, ["followup", "rebook", "recancel", "dq"]); // Joel owns this thread now
    ctx.waitUntil(notifySales(env, `NEEDS YOU (${channel}): ${lead.name} (${lead.company})`, `${text}\n\nReason: ${r.reason}\nStage: ${lead.stage}\nAdmin: ${env.SITE_URL.replace(/\/$/, "")}/admin/#${lead.id}`));
    const hold = r.body || (channel === "sms" ? `Thanks ${firstName(lead.name)}, Joel will reply personally today or next business day.` : `Thanks ${firstName(lead.name)}. I'll answer this personally today or next business day.\n\nJoel`);
    await logOut(env, lead, channel, hold, "handoff");
    return hold;
  }
  ctx.waitUntil(notifySales(env, `AI replied (${channel}): ${lead.name}`, `THEM: ${text}\n\nUS: ${r.body}`));
  await logOut(env, lead, channel, r.body, "ai");
  return r.body;
}
async function logOut(env, lead, channel, body, note) {
  const t = now();
  await env.DB.prepare("INSERT INTO messages (lead_id, seq, step, channel, send_at, status, body, error, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(lead.id, "reply", "out", channel, t, "sent", body, note, t, t).run();
}

// ---------------------------------------------------------------- unsubscribe (link + RFC 8058 one-click)
async function unsubscribe(req, url, env) {
  const id = url.searchParams.get("lid");
  if (!(await checkLeadToken(env, id, url.searchParams.get("t")))) return html("<p>This link is invalid or expired.</p>", 400);
  if (req.method === "POST") {
    await env.DB.prepare("UPDATE leads SET email_unsub=1, updated_at=? WHERE id=?").bind(now(), id).run();
    await env.DB.prepare("UPDATE messages SET status='cancelled' WHERE lead_id=? AND channel='email' AND status='pending'").bind(id).run();
    await logEvent(env, id, "email_unsub", {});
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded") && !(await req.text()).includes("ui=1")) return new Response("ok"); // mail-client one-click
    return html(page("You're unsubscribed", "You won't get any more emails from us about your application."));
  }
  // GET shows a confirm button so link scanners can't unsubscribe people by prefetching.
  return html(page("Unsubscribe?", `<form method="post"><input type="hidden" name="ui" value="1"><button style="font:600 16px system-ui;padding:12px 20px;border-radius:10px;border:0;background:#4f8cff;color:#fff;cursor:pointer">Unsubscribe me</button></form>`));
}
const page = (h, inner) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>${h}</title><body style="font:16px/1.5 system-ui;background:#07090f;color:#e8edf6;display:grid;place-items:center;min-height:90vh;margin:0"><div style="max-width:420px;padding:24px"><h1 style="font-size:24px">${h}</h1><p style="color:#9aa6ba">${inner}</p></div>`;

// ---------------------------------------------------------------- admin
async function admin(req, url, env, ctx) {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || !safeEqual(auth, env.ADMIN_TOKEN)) return json({ error: "unauthorized" }, 401);
  const p = url.pathname.replace("/api/admin", "");

  if (p === "/leads" && req.method === "GET") {
    const stage = url.searchParams.get("stage");
    const q = stage ? env.DB.prepare("SELECT id, created_at, updated_at, name, company, email, phone, stage, score, ai_fit, ai_summary, booking_start, deal_value, attribution FROM leads WHERE stage=? ORDER BY updated_at DESC LIMIT 300").bind(stage)
                    : env.DB.prepare("SELECT id, created_at, updated_at, name, company, email, phone, stage, score, ai_fit, ai_summary, booking_start, deal_value, attribution FROM leads ORDER BY updated_at DESC LIMIT 300");
    const { results } = await q.all();
    return json({ leads: results.map(r => Object.assign(r, { attribution: parseJSON(r.attribution, {}) })) });
  }
  const m = p.match(/^\/lead\/([\w-]+)$/);
  if (m && req.method === "GET") {
    const lead = await getLead(env, m[1]);
    if (!lead) return json({ error: "not found" }, 404);
    const { results: messages } = await env.DB.prepare("SELECT * FROM messages WHERE lead_id=? ORDER BY COALESCE(sent_at, send_at)").bind(lead.id).all();
    const { results: events } = await env.DB.prepare("SELECT * FROM events WHERE lead_id=? ORDER BY ts").bind(lead.id).all();
    ["answers", "attribution", "precall", "ai_flags"].forEach(k => lead[k] = parseJSON(lead[k], lead[k]));
    return json({ lead, messages, events });
  }
  if (p === "/stage" && req.method === "POST") {
    const b = await body(req);
    const lead = await getLead(env, b.id);
    if (!lead) return json({ error: "not found" }, 404);
    if (!STAGES.includes(b.stage)) return json({ error: "bad stage" }, 400);
    const value = b.value != null && b.value !== "" ? Number(b.value) : null;
    return json({ lead: await setStage(env, ctx, lead, b.stage, value) });
  }
  if (p === "/stats" && req.method === "GET") {
    const since = now() - Number(url.searchParams.get("days") || 30) * DAY;
    const { results } = await env.DB.prepare("SELECT stage, attribution, deal_value FROM leads WHERE created_at>=?").bind(since).all();
    const order = ["applied", "qualified", "booked", "showed", "won"];
    const reached = s => ({ applied: s !== "direct", qualified: !["dq", "direct"].includes(s), booked: ["booked", "showed", "won", "lost", "no_show", "cancelled"].includes(s), showed: ["showed", "won", "lost"].includes(s), won: s === "won" });
    const funnel = Object.fromEntries(order.map(k => [k, 0]));
    const byAd = {};
    let revenue = 0;
    for (const r of results) {
      const a = parseJSON(r.attribution, {});
      const key = ((a.last && (a.last.utm_content || a.last.creative)) || (a.first && (a.first.utm_content || a.first.creative)) || "(none)").slice(0, 60);
      const row = byAd[key] = byAd[key] || Object.fromEntries(order.map(k => [k, 0]));
      for (const k of order) if (reached(r.stage)[k]) { funnel[k]++; row[k]++; }
      if (r.stage === "won") revenue += r.deal_value || 0;
    }
    const { results: msg } = await env.DB.prepare("SELECT seq, status, COUNT(*) AS n FROM messages WHERE created_at>=? GROUP BY seq, status").bind(since).all();
    return json({ funnel, byAd, revenue, messages: msg });
  }
  if (p === "/export/google-ads.csv" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, attribution, deal_value, qualified_at, booked_at, won_at FROM leads WHERE qualified_at IS NOT NULL OR booked_at IS NOT NULL OR won_at IS NOT NULL").all();
    const names = { qualified: env.GADS_CONV_QUALIFIED || "Qualified lead", booked: env.GADS_CONV_BOOKED || "Booked call", showed: env.GADS_CONV_BOOKED || "Booked call", won: env.GADS_CONV_WON || "Closed deal" };
    const lines = ["Parameters:TimeZone=UTC", "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
    // One row per conversion type, timed when that stage was first reached, so re-uploads de-duplicate.
    const fmt = ts => new Date(ts).toISOString().replace("T", " ").slice(0, 19);
    for (const r of results) {
      const a = parseJSON(r.attribution, {});
      const gclid = (a.last && a.last.gclid) || (a.first && a.first.gclid) || a.gclid;
      if (!gclid) continue;
      if (r.qualified_at) lines.push([gclid, names.qualified, fmt(r.qualified_at), "", ""].join(","));
      if (r.booked_at) lines.push([gclid, names.booked, fmt(r.booked_at), "", ""].join(","));
      if (r.won_at) lines.push([gclid, names.won, fmt(r.won_at), r.deal_value || 0, env.CURRENCY || "CAD"].join(","));
    }
    return new Response(lines.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=google-ads-offline-conversions.csv" } });
  }
  if (p === "/stop" && req.method === "POST") {
    const b = await body(req);
    await env.DB.prepare("UPDATE messages SET status='cancelled' WHERE lead_id=? AND status='pending'").bind(String(b.id || "")).run();
    await logEvent(env, b.id, "automation_stopped", {});
    return json({ ok: true });
  }
  if (p === "/test-email" && req.method === "POST") {
    // Sends one test message to SALES_NOTIFY_EMAIL through the same path as lead emails.
    const r = await sendEmail(env, { id: "test", email: env.SALES_NOTIFY_EMAIL, name: "Joel" }, { subject: "knowdrive inbound: test email", text: "This is a test from the inbound system. If you can read it, sending works.\n\nJoel", to: env.SALES_NOTIFY_EMAIL });
    return json(r, r.ok ? 200 : 502);
  }
  if (p === "/run-due" && req.method === "POST") return json(await runDue(env));
  return json({ error: "not found" }, 404);
}
