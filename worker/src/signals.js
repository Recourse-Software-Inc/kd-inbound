// Server-side conversion signals back to the ad platforms: the "positive feedback loop".
// Qualified leads, bookings, shows and wins are sent so the platforms optimise toward
// people who qualify, not toward anyone who fills in a form. Each platform is optional.
import { sha256Hex, firstName, lastName, logEvent, parseJSON, now } from "./util.js";

// stage → per-platform event names
const META_EVENT = { qualified: "Lead", dq: "kd_lead_dq", booked: "Schedule", showed: "kd_call_showed", won: "Purchase" };
const GA4_EVENT = { qualified: "qualify_lead", dq: "disqualify_lead", booked: "book_call", showed: "call_showed", won: "close_convert_lead" };
const LI_CONV = { qualified: "LINKEDIN_CONV_QUALIFIED", booked: "LINKEDIN_CONV_BOOKED", showed: "LINKEDIN_CONV_SHOWED", won: "LINKEDIN_CONV_WON" };

const norm = s => String(s || "").trim().toLowerCase();

export async function sendSignal(env, lead, stage, { eventId, value } = {}) {
  const attr = parseJSON(lead.attribution, {});
  const results = await Promise.allSettled([
    meta(env, lead, attr, stage, eventId, value),
    linkedin(env, lead, attr, stage, eventId, value),
    ga4(env, lead, attr, stage, value)
  ]);
  const summary = Object.fromEntries(["meta", "linkedin", "ga4"].map((k, i) => [k, results[i].status === "fulfilled" ? results[i].value : "error: " + (results[i].reason && results[i].reason.message)]));
  await logEvent(env, lead.id, "signal:" + stage, summary);
  return summary;
}

async function meta(env, lead, attr, stage, eventId, value) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return "skipped";
  const name = META_EVENT[stage]; if (!name) return "skipped";
  const user_data = {
    em: [await sha256Hex(norm(lead.email))],
    external_id: [await sha256Hex(lead.id)],
    fn: [await sha256Hex(norm(firstName(lead.name)))],
    client_user_agent: attr.ua || undefined,
    client_ip_address: lead.ip || undefined,
    fbc: attr.fbc || undefined,
    fbp: attr.fbp || undefined
  };
  const ln = lastName(lead.name); if (ln) user_data.ln = [await sha256Hex(norm(ln))];
  if (lead.phone) user_data.ph = [await sha256Hex(lead.phone.replace(/\D/g, ""))];
  const body = {
    data: [{
      event_name: name,
      event_time: Math.floor(now() / 1000),
      event_id: eventId || (lead.id + ":" + stage),
      action_source: stage === "showed" || stage === "won" ? "system_generated" : "website",
      event_source_url: attr.page || env.SITE_URL,
      user_data,
      custom_data: Object.assign({ lead_stage: stage, lead_score: lead.score ?? undefined }, stage === "won" ? { value: value || lead.deal_value || 0, currency: env.CURRENCY || "CAD" } : {})
    }]
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  const res = await fetch(`https://graph.facebook.com/${env.META_API_VERSION || "v21.0"}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return res.ok ? "ok" : "http " + res.status + " " + (await res.text()).slice(0, 200);
}

async function linkedin(env, lead, attr, stage, eventId, value) {
  const conv = env[LI_CONV[stage]];
  if (!env.LINKEDIN_TOKEN || !conv) return "skipped";
  const userIds = [{ idType: "SHA256_EMAIL", idValue: await sha256Hex(norm(lead.email)) }];
  if (attr.li_fat_id) userIds.push({ idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: attr.li_fat_id });
  const body = {
    conversion: conv.startsWith("urn:") ? conv : "urn:lla:llaPartnerConversion:" + conv,
    conversionHappenedAt: now(),
    eventId: eventId || (lead.id + ":" + stage),
    user: { userIds, userInfo: { firstName: firstName(lead.name), lastName: lastName(lead.name) || undefined, companyName: lead.company || undefined } }
  };
  if (stage === "won") body.conversionValue = { currencyCode: env.CURRENCY || "CAD", amount: String(value || lead.deal_value || 0) };
  const res = await fetch("https://api.linkedin.com/rest/conversionEvents", {
    method: "POST",
    headers: { authorization: "Bearer " + env.LINKEDIN_TOKEN, "content-type": "application/json", "LinkedIn-Version": env.LINKEDIN_VERSION || "202601", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body)
  });
  return res.ok ? "ok" : "http " + res.status + " " + (await res.text()).slice(0, 200);
}

async function ga4(env, lead, attr, stage, value) {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return "skipped";
  const name = GA4_EVENT[stage]; if (!name) return "skipped";
  const params = { lead_source: (attr.last && attr.last.utm_source) || (attr.first && attr.first.utm_source) || "direct", lead_score: lead.score ?? 0 };
  if (stage === "won") { params.value = value || lead.deal_value || 0; params.currency = env.CURRENCY || "CAD"; }
  const body = { client_id: attr.ga_client_id || lead.id, user_id: lead.id, events: [{ name, params }] };
  const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`, {
    method: "POST", body: JSON.stringify(body)
  });
  return res.ok ? "ok" : "http " + res.status;
}
