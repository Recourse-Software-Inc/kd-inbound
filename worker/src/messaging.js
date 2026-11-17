import { esc, leadToken } from "./util.js";

export async function unsubUrl(env, lead) {
  return `${env.API_URL}/u?lid=${encodeURIComponent(lead.id)}&t=${await leadToken(env, lead.id)}`;
}

// Reply-to carries the lead id so the Email Worker can thread replies (Cloudflare Email Routing).
export function replyTo(env, lead) {
  if (!env.REPLY_DOMAIN) return env.REPLY_TO || undefined;
  return `${env.REPLY_LOCAL || "replies"}+${lead.id}@${env.REPLY_DOMAIN}`;
}

function textToHtml(text) {
  const linked = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f6feb">$1</a>');
  return linked.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
}

export async function sendEmail(env, lead, { subject, text, to, inReplyTo }) {
  if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  const unsub = to ? null : await unsubUrl(env, lead);
  const footer = unsub
    ? `\n\n—\nRecourse Software Inc. · ${env.POSTAL_ADDRESS || "Ontario, Canada"}\nYou're getting this because you applied at ${env.SITE_URL}. Unsubscribe: ${unsub}`
    : "";
  const body = {
    from: env.FROM_EMAIL || "Joel at knowdrive <joel@knowdrive.ai>",
    to: [to || lead.email],
    subject,
    text: text + footer,
    html: `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:560px">${textToHtml(text)}${unsub ? `<p style="margin:26px 0 0;color:#888;font-size:12px">Recourse Software Inc. · ${esc(env.POSTAL_ADDRESS || "Ontario, Canada")}<br>You're getting this because you applied at ${esc(env.SITE_URL)}. <a href="${unsub}" style="color:#888">Unsubscribe</a></p>` : ""}</div>`,
    reply_to: to ? undefined : replyTo(env, lead),
    headers: Object.assign({},
      unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {},
      inReplyTo ? { "In-Reply-To": inReplyTo, "References": inReplyTo } : {}),
    tags: [{ name: "lead", value: lead.id.replace(/[^a-zA-Z0-9_-]/g, "") }]
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return { ok: false, error: "resend " + res.status + " " + (await res.text()).slice(0, 200) };
  return { ok: true, id: (await res.json()).id };
}

// Every automated text carries opt-out wording (CASL + carrier rules). Conversational replies may skip it.
export const SMS_OPTOUT = " Reply STOP to opt out.";
export async function sendSms(env, lead, text, { optOut = true } = {}) {
  if (optOut && !/reply stop/i.test(text)) text = text.trim() + SMS_OPTOUT;
  if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !(env.TWILIO_FROM || env.TWILIO_MESSAGING_SERVICE)) return { ok: false, error: "twilio not configured" };
  const form = new URLSearchParams({ To: lead.phone, Body: text });
  if (env.TWILIO_MESSAGING_SERVICE) form.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE); else form.set("From", env.TWILIO_FROM);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: "Basic " + btoa(env.TWILIO_SID + ":" + env.TWILIO_TOKEN), "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  if (!res.ok) return { ok: false, error: "twilio " + res.status + " " + (await res.text()).slice(0, 200) };
  return { ok: true, id: (await res.json()).sid };
}

// Internal heads-up to whoever runs sales.
export async function notifySales(env, subject, text) {
  if (!env.SALES_NOTIFY_EMAIL || !env.RESEND_API_KEY) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL || "knowdrive inbound <joel@knowdrive.ai>", to: env.SALES_NOTIFY_EMAIL.split(",").map(s => s.trim()), subject: "[inbound] " + subject, text })
  });
  if (!res.ok) console.error("notifySales", res.status);
}
