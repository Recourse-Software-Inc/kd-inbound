/**
 * knowdrive inbound — Google Calendar bridge
 *
 * Runs as joel@recoursellm.com. Every minute it reads appointment-schedule events that changed
 * since the last run and posts them to the Worker (/hooks/gcal), signed with a shared secret.
 * The Worker turns them into "booked", "moved" and "cancelled" in the pipeline.
 *
 * Setup (once): see README in this folder.
 */
const CONFIG = {
  WORKER_URL: 'https://kd-inbound.joelauge.workers.dev/hooks/gcal',
  TITLE_PREFIX: 'knowdrive.ai demo walk-through', // the appointment schedule's title; bookings start with it
  CALENDAR_ID: 'primary'
};

function install() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HOOK_SECRET')) throw new Error('Set the script property HOOK_SECRET first (Project Settings > Script properties).');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(1).create();
  props.deleteProperty('SYNC_TOKEN');
  sync(); // first run only stores a sync token
}

function sync() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const token = props.getProperty('SYNC_TOKEN');
    // First run (or expired token): page through once to get a sync token, report nothing.
    // Every later run gets only what changed since the previous one.
    const baseline = !token;
    let pageToken = null, nextSync = null;
    const changed = [];
    do {
      const q = { maxResults: 250, showDeleted: true, singleEvents: true };
      if (pageToken) q.pageToken = pageToken;
      if (token) q.syncToken = token;
      const res = api_('events', q);
      if (res.__gone) { props.deleteProperty('SYNC_TOKEN'); return; } // next run re-baselines
      if (!baseline) (res.items || []).forEach(ev => { if (isDemo_(ev)) changed.push(shape_(ev)); });
      pageToken = res.nextPageToken || null;
      nextSync = res.nextSyncToken || nextSync;
    } while (pageToken);
    if (changed.length) post_(changed, props.getProperty('HOOK_SECRET'));
    if (nextSync) props.setProperty('SYNC_TOKEN', nextSync);
  } finally { lock.releaseLock(); }
}

function isDemo_(ev) {
  const t = String(ev.summary || '').toLowerCase();
  // Cancelled events can arrive without a summary; keep them if they were ours (the Worker ignores unknown ids).
  return ev.status === 'cancelled' || t.indexOf(CONFIG.TITLE_PREFIX.toLowerCase()) === 0;
}

function shape_(ev) {
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  return {
    id: ev.id,
    status: ev.status,                                   // confirmed | tentative | cancelled
    start: ev.start && (ev.start.dateTime || ev.start.date),
    attendees: (ev.attendees || []).map(a => ({ email: a.email, displayName: a.displayName || '', resource: !!a.resource, responseStatus: a.responseStatus })),
    cancelledByOwner: ev.status === 'cancelled' && !!(ev.organizer && ev.organizer.self) && !(ev.attendees || []).some(a => a.email && a.email.toLowerCase() !== me && a.responseStatus === 'declined'),
    updated: ev.updated
  };
}

function post_(events, secret) {
  const body = JSON.stringify({ events: events });
  const sig = Utilities.computeHmacSha256Signature(body, secret).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  const res = UrlFetchApp.fetch(CONFIG.WORKER_URL, { method: 'post', contentType: 'application/json', payload: body, headers: { 'x-kd-signature': sig }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('Worker said ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}

function api_(path, params) {
  const qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CONFIG.CALENDAR_ID) + '/' + path + '?' + qs;
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() === 410) return { __gone: true };
  if (res.getResponseCode() >= 300) throw new Error('Calendar API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}
