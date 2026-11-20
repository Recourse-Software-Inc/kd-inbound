# knowdrive inbound system

An inbound client-acquisition system for knowdrive's enterprise design-partner program. It's modelled on the "Inbound System" ad breakdown: ads → AI qualification form → calendar → AI follow-up → thank-you page → closing call → new client. Qualified-lead data is fed back to the ad platforms so targeting keeps improving.

```
site/     static funnel, hosted on GitHub Pages (Recourse-Software-Inc/kd-inbound)
worker/   Cloudflare Worker: scoring, ad-platform signals, follow-ups, replies, admin API
playbook/ the 9 ad types, closing-call framework, video scripts
```

## The flow

| Step | Where | What happens |
|---|---|---|
| 01 Ad | LinkedIn / Meta / YouTube | Nine creative formats, each tagged `utm_content=<slug>` (see `playbook/01-ad-creatives.md`) |
| Landing | `site/index.html` | Breakdown video, proof, the five-step engagement, FAQ. UTMs and click IDs (fbclid, gclid, li_fat_id) are captured |
| 02 Form | `site/apply/` | One question per screen with conditional branching. Personal projects skip the qualification questions. Number keys select options and Enter continues |
| Qualified? | `worker/src/score.js` + `ai.js` | Rule score (role, use case, volume, timeline, budget against the $5,120/mo Enterprise floor, work email) plus Claude's fit read of the free-text use case. Threshold `QUALIFY_THRESHOLD` |
| DQ → resources | `site/resources/` | Free plan and resources, reordered by what they said they need. Worker emails the links (D0) and checks in at D30 |
| AI signal | `worker/src/signals.js` | Qualified, booked, showed and won are sent server-side to Meta CAPI, LinkedIn Conversions API and GA4. Event IDs match the browser pixels, so platforms de-duplicate |
| 03 Calendar | `site/book/` | Cal.com inline embed, prefilled. Also works from follow-up links (`?lid=&t=`) |
| Booked? → AI follow-up | `worker/src/sequence.js` | D0, D1, D2, D3, D5, D7 and D10 email (SMS on D0, D2 and D7 with consent; every automated text ends with "Reply STOP to opt out"). Claude writes each message from the lead's answers, with fixed fallback templates. Sent on weekdays in the lead's daytime hours. A reply pauses the sequence for 3 days; booking, unsubscribe or a hand-off to you stops it |
| Replies | `email-inbound.js`, `/hooks/twilio` | Claude answers simple questions from approved facts (`facts.js`), hands anything else to you, and honours unsubscribe/STOP |
| 04 Thank-you | `site/confirmed/` | Booked time, add-to-calendar, prep video, a "question your AI gets wrong" box, who to bring, FAQs, SMS reminder opt-in |
| Reminders | `sequence.js` | Email 24 h before (links to the thank-you page with the lead's token), SMS 1 h before. Moved on reschedule. A cancellation by the lead starts a short "pick another time" sequence; a cancellation by you only notifies you. Two hours after the start time you're asked to mark the outcome; with no answer after 24 h it becomes a no-show and a rebook sequence starts |
| 05 Closing call | `playbook/02-closing-call.md` | An AI pre-call brief is emailed to you on booking. Mark showed / won / lost in `/admin/` |
| New client | `/admin/` | Won value is sent as a Purchase conversion. A Google Ads offline-conversion CSV is available too |

## Set up (about an hour)

### 1. Cloudflare Worker
```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create kd-inbound          # paste the id into wrangler.toml
npm run db:init
# edit [vars] in wrangler.toml: SITE_URL, SITE_ORIGINS, API_URL, FROM_EMAIL, REPLY_DOMAIN
for s in TOKEN_SECRET ADMIN_TOKEN ANTHROPIC_API_KEY RESEND_API_KEY SALES_NOTIFY_EMAIL REPLY_FORWARD_TO CAL_WEBHOOK_SECRET; do npx wrangler secret put $s; done
npm run deploy
```
`TOKEN_SECRET` and `ADMIN_TOKEN` are long random strings (`openssl rand -hex 32`). The Worker refuses to issue lead links without `TOKEN_SECRET`. The Cal.com and Twilio webhooks reject everything until their secrets are set (set `DEV_INSECURE_WEBHOOKS="1"` only in local `.dev.vars`).

Optional spam protection: create a Cloudflare Turnstile widget, put the site key in `config.js` (`turnstileSiteKey`) and the secret in `TURNSTILE_SECRET`. AI scoring is also capped per hour (`AI_SCORING_HOURLY_CAP`, default 120).

### 2. Email
- **Sending:** verify `knowdrive.ai` in Resend (SPF and DKIM records in Cloudflare DNS) and set `RESEND_API_KEY`.
- **Replies:** in Cloudflare → Email → Email Routing, enable routing for `knowdrive.ai`. Add a rule sending `replies+*@knowdrive.ai` (or a catch-all for the `replies` local part) to the **kd-inbound** Worker. Add your own inbox as a verified destination and set it as `REPLY_FORWARD_TO`, so you always get a copy.

### 3. Booking calendar
Demos run on a **Google Calendar appointment schedule** on joel@recoursellm.com. Setup: `integrations/google-calendar/README.md`. Cal.com (below) is still supported if `gcalBookingUrl` is empty.

#### Cal.com (alternative)
- Create a 60-minute event, e.g. `recourse/knowdrive-demo`, and put it in `site/assets/config.js` (`calLink`, `calFallbackUrl`). **Mark the event hidden** so it isn't listed on your public Cal profile; bookings should come through the application. Anyone who books it directly still gets recorded, as a `direct` lead flagged to you, but it's never counted as a conversion.
- Settings → Developer → Webhooks: URL `https://<API_URL>/hooks/cal`, secret = `CAL_WEBHOOK_SECRET`. Triggers: Booking Created, Rescheduled, Cancelled, No-show updated.
- Optional: in the event's advanced settings, redirect on booking to `<SITE_URL>/confirmed/`. That covers people who book straight from an email client.

### 4. SMS (optional)
Twilio number or Messaging Service. Set `TWILIO_SID`, `TWILIO_TOKEN`, and `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE`. Set the number's incoming-message webhook to `https://<API_URL>/hooks/twilio`. Canadian and US long codes need carrier registration (10DLC in the US) before volume sending.

### 5. Ad platforms
| Platform | Secrets | Notes |
|---|---|---|
| Meta | `META_PIXEL_ID`, `META_CAPI_TOKEN` | Optimise campaigns for **Lead** (sent only for qualified leads); `kd_lead_dq` lets you exclude. Use `META_TEST_EVENT_CODE` while testing |
| LinkedIn | `LINKEDIN_TOKEN`, `LINKEDIN_CONV_QUALIFIED`, `_BOOKED`, `_SHOWED`, `_WON` | Create Conversions API conversion rules in Campaign Manager and paste their IDs. Set `LINKEDIN_VERSION` to a current API version |
| Google | `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | Mark `qualify_lead`, `book_call` and `close_convert_lead` as key events and import them into Google Ads. Or upload `/admin/` → Google Ads CSV as offline conversions |

Browser pixels are optional (`metaPixelId`, `linkedinPartnerId` and `ga4MeasurementId` in `config.js`). If you use them, add your cookie-consent banner.

### 6. Site (GitHub Pages)
`.github/workflows/pages.yml` publishes `site/` on every push to `main`. In repo Settings → Pages, set **Source: GitHub Actions**. Then edit `site/assets/config.js`: `apiBase`, Cal link, video URLs and resource links (resources without a URL are hidden).

**Landing video.** `vslVideo` in `config.js` is an object: it puts the knowdrive player (`site/assets/kd-vsl-player.js`, one file, no dependencies) at the top of the landing page and lets the video lead the hero. Its files live in `site/media/vsl/`: the render as HEVC, two H.264 fallbacks (the player picks what the browser can play and switches on its own if one fails), `poster.jpg`, `thumbs.jpg` (scrubber preview) and `captions.en.vtt`. To move the files to a bucket, change `base` to its URL. After a re-cut, replace the files and update `duration` and the chapter times in `config.js`; GitHub refuses files over 100 MB. The player reports `kd_vsl_play`, `kd_vsl_progress` (30 seconds watched, then 25/50/75/95 percent), `kd_vsl_complete` and end-card clicks (`kd_cta_click`, placement `vsl_end` or `vsl_end_free_plan`) through `KD.track`, so they reach the browser pixels when those are set. Set `vslVideo` to `""` to go back to the sample cited result, or to a URL string for a plain embed.

## Operating it
- **`/admin/`** (paste `ADMIN_TOKEN`) shows the funnel KPIs, a per-creative table (applied → qualified → booked → showed → won), every lead with the AI read, its message timeline, and stage buttons.
- **Edit what the AI may say:** `worker/src/facts.js`. Anything outside it is handed to you.
- **Turn AI off:** `AI_FOLLOWUPS="0"` (templates only) and `AI_REPLIES="0"` (every reply goes to you).
- **Tune qualification:** `QUALIFY_THRESHOLD` and the weights in `score.js`. Mirror any rule change in `site/assets/apply.js` (`localScore`, the offline fallback).

## Compliance notes (Canada / CASL)
- Applying is an inquiry, which gives implied consent to email about it for 6 months. Every email carries the sender's identity, postal address and a one-click unsubscribe (RFC 8058).
- SMS only goes to people who tick the unticked SMS box. STOP is honoured immediately.
- The AI says the note was drafted with an assistant if anyone asks directly, and never invents facts outside `facts.js`.

## Local development
```bash
cd worker && printf 'TOKEN_SECRET=dev\nADMIN_TOKEN=dev\nALLOW_LOCALHOST=1\nSITE_URL=http://localhost:8080\nAPI_URL=http://localhost:8787\n' > .dev.vars
npm run db:init:local && npm run dev          # API on :8787
cd ../site && python3 -m http.server 8080     # set apiBase to http://localhost:8787 in config.js
```
