# Google Calendar bridge (joel@recoursellm.com)

Demos are booked through a Google Calendar **appointment schedule**. Google can't send webhooks, so this
Apps Script runs as the calendar owner, checks for changed demo bookings every minute, and posts them to
the Worker (`/hooks/gcal`), signed with `GCAL_HOOK_SECRET`.

1. **Appointment schedule:** the existing "KnowDrive.ai Demo Walk-through" booking page (60 min; Mon, Wed, Thu, Fri at 9am, 1pm, 4pm).
   Its link is in `site/assets/config.js` → `gcalBookingUrl`; the script matches bookings by that title (`TITLE_PREFIX`).
   If you rename the schedule, update `TITLE_PREFIX`.
2. **Apps Script** (script.google.com, same account → New project)
   - Paste `Code.gs`; in Project Settings tick "Show appsscript.json" and paste `appsscript.json`
   - Project Settings → Script properties → add `HOOK_SECRET` = the value of the Worker's `GCAL_HOOK_SECRET`
   - Run `install` once and approve the permissions (read calendar events, call the Worker)
