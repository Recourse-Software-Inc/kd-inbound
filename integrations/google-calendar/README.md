# Google Calendar bridge (joel@recoursellm.com)

Demos are booked through a Google Calendar **appointment schedule**. Google can't send webhooks, so this
Apps Script runs as the calendar owner, checks for changed demo bookings every minute, and posts them to
the Worker (`/hooks/gcal`), signed with `GCAL_HOOK_SECRET`.

1. **Appointment schedule** (calendar.google.com, signed in as joel@recoursellm.com → Create → Appointment schedule)
   - Title: `knowdrive demo` (the script matches on this; bookings appear as "knowdrive demo (Guest name)")
   - 30 minutes; Google Meet; booking form asks for name and email; email confirmation on
   - Copy the booking page link into `site/assets/config.js` → `gcalBookingUrl`
2. **Apps Script** (script.google.com, same account → New project)
   - Paste `Code.gs`; in Project Settings tick "Show appsscript.json" and paste `appsscript.json`
   - Project Settings → Script properties → add `HOOK_SECRET` = the value of the Worker's `GCAL_HOOK_SECRET`
   - Run `install` once and approve the permissions (read calendar events, call the Worker)
