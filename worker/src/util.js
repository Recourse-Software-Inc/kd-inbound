export const now = () => Date.now();
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

export function uid(prefix = "ld") {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return prefix + "_" + [...b].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

const enc = new TextEncoder();
export async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(secret, hash = "SHA-256") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
}
export async function hmacHex(secret, msg, hash = "SHA-256") {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, hash), enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function hmacB64(secret, msg, hash = "SHA-256") {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, hash), enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Per-lead token used in links and browser calls (no login needed, not guessable).
export async function leadToken(env, leadId) {
  if (!env.TOKEN_SECRET || String(env.TOKEN_SECRET).length < 16) throw new Error("TOKEN_SECRET missing or too short (min 16 chars)");
  return (await hmacHex(env.TOKEN_SECRET, "lead:" + leadId)).slice(0, 24);
}
// Short, SMS-safe booking link: API_URL/b/<leadId>/<first 10 token chars> → redirects to the booking page.
export async function shortBookLink(env, leadId) {
  return env.API_URL.replace(/\/$/, "") + "/b/" + leadId + "/" + (await leadToken(env, leadId)).slice(0, 10);
}
export async function checkLeadToken(env, leadId, token) {
  if (!leadId || !token) return false;
  return safeEqual(await leadToken(env, leadId), String(token));
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
export function html(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const firstName = n => (String(n || "").trim().split(/\s+/)[0] || "there").slice(0, 40);
export const lastName = n => String(n || "").trim().split(/\s+/).slice(1).join(" ");

export function parseJSON(s, d = null) { try { return s ? JSON.parse(s) : d; } catch { return d; } }

export function clip(s, n) { s = String(s ?? ""); return s.length > n ? s.slice(0, n) : s; }

// Local hour for quiet-hours logic; falls back to America/Toronto.
export function localParts(ts, tz) {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Toronto", hour: "numeric", hourCycle: "h23", weekday: "short" });
    const p = Object.fromEntries(f.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
    return { hour: Number(p.hour), weekday: p.weekday };
  } catch { return localParts(ts, "America/Toronto"); }
}
// Push a send time into the lead's weekday daytime window (default 9:00–19:00 local, Mon–Fri).
export function intoWindow(ts, tz, { start = 9, end = 19, weekends = false } = {}) {
  for (let i = 0; i < 24 * 4; i++) {
    const { hour, weekday } = localParts(ts, tz);
    const weekend = weekday === "Sat" || weekday === "Sun";
    if (hour >= start && hour < end && (weekends || !weekend)) return ts;
    ts += HOUR;
    ts -= ts % HOUR; // land on the hour
  }
  return ts;
}

export async function logEvent(env, leadId, type, data) {
  try {
    await env.DB.prepare("INSERT INTO events (lead_id, ts, type, data) VALUES (?, ?, ?, ?)").bind(leadId || null, now(), type, data ? JSON.stringify(data).slice(0, 8000) : null).run();
  } catch (e) { console.error("logEvent", e); }
}

export function allowedOrigin(env, origin) {
  const list = String(env.SITE_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin) return null;
  if (list.includes(origin)) return origin;
  if (env.ALLOW_LOCALHOST === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}
export function cors(env, req, res) {
  const o = allowedOrigin(env, req.headers.get("origin"));
  if (!o) return res;
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", o);
  h.set("vary", "origin");
  h.set("access-control-allow-headers", "content-type, authorization");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-max-age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}
