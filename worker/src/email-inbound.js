// Email Worker: Cloudflare Email Routing sends replies+<leadId>@<REPLY_DOMAIN> here.
// The reply is logged, follow-ups pause, and the AI answers from approved facts or hands off.
import PostalMime from "postal-mime";
import { converse } from "./index.js";
import { sendEmail, notifySales } from "./messaging.js";
import { logEvent } from "./util.js";

function stripQuoted(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    if (/^On .{6,200}wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From: .+/.test(l) && out.length > 0) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

export async function handleEmail(message, env, ctx) {
  // Always keep a human copy, whatever happens below.
  if (env.REPLY_FORWARD_TO) { try { await message.forward(env.REPLY_FORWARD_TO); } catch (e) { console.error("forward", e); } }

  const to = String(message.to || "");
  const m = to.match(/\+([\w-]+)@/);
  const parsed = await PostalMime.parse(message.raw);
  const from = String((parsed.from && parsed.from.address) || message.from || "").toLowerCase();

  // The From header is only trusted when the sending domain authenticated (DMARC, or SPF/DKIM pass).
  const authRes = (message.headers.get("authentication-results") || "").toLowerCase();
  const authed = /dmarc=pass/.test(authRes) || (/spf=pass/.test(authRes) && /dkim=pass/.test(authRes));

  let lead = m ? await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(m[1]).first() : null;
  if (!lead || lead.email !== from) {
    const byFrom = await env.DB.prepare("SELECT * FROM leads WHERE email=?").bind(from).first();
    if (byFrom) lead = byFrom;
    else if (lead && !authed) lead = null; // reply-to id but a different, unauthenticated sender
  }
  if (!lead) {
    await logEvent(env, null, "email_unmatched", { from, to });
    await notifySales(env, `unmatched reply from ${from}`, `Subject: ${parsed.subject || ""}\n\n${(parsed.text || "").slice(0, 3000)}`);
    return;
  }
  if (!authed) {
    // Possible spoof: never let it change state or trigger the AI. Joel decides.
    await logEvent(env, lead.id, "email_unauthenticated", { from, subject: parsed.subject });
    await notifySales(env, `reply needs you (sender not authenticated): ${lead.name}`, `From: ${from}\nSubject: ${parsed.subject || ""}\n\n${(parsed.text || "").slice(0, 3000)}`);
    return;
  }

  // Ignore auto-responders and bounces so we never loop.
  const h = (k) => (message.headers.get(k) || "").toLowerCase();
  if (h("auto-submitted") && h("auto-submitted") !== "no" || h("x-autoreply") || h("x-autorespond") || /^(mailer-daemon|postmaster)@/.test(from) || h("precedence").match(/bulk|junk|list|auto_reply/)) {
    await logEvent(env, lead.id, "email_auto_reply_ignored", { subject: parsed.subject });
    return;
  }

  const text = stripQuoted(parsed.text || (parsed.html || "").replace(/<[^>]+>/g, " "));
  if (!text) return;
  const reply = await converse(env, ctx, lead, "email", text, { subject: parsed.subject });
  if (!reply) return;
  const subject = /^re:/i.test(parsed.subject || "") ? parsed.subject : "Re: " + (parsed.subject || "your knowdrive application");
  const r = await sendEmail(env, lead, { subject, text: reply, inReplyTo: parsed.messageId || undefined });
  if (!r.ok) await logEvent(env, lead.id, "send_failed", { channel: "email", seq: "reply", error: r.error });
}
