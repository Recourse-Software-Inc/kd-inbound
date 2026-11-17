-- D1 schema for the knowdrive inbound system
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  company       TEXT,
  phone         TEXT,
  sms_consent   INTEGER NOT NULL DEFAULT 0,
  email_unsub   INTEGER NOT NULL DEFAULT 0,
  sms_optout    INTEGER NOT NULL DEFAULT 0,
  tz            TEXT,
  stage         TEXT NOT NULL,           -- qualified | dq | booked | showed | no_show | won | lost | cancelled
  score         INTEGER,
  ai_fit        INTEGER,
  ai_summary    TEXT,
  ai_flags      TEXT,
  ai_angle      TEXT,
  answers       TEXT,                    -- JSON
  attribution   TEXT,                    -- JSON (utm, click ids, fbc/fbp, page, ua)
  booking_start INTEGER,
  booking_uid   TEXT,
  precall       TEXT,                    -- JSON
  deal_value    REAL,
  ip            TEXT,
  applications  INTEGER NOT NULL DEFAULT 1,
  last_reply_at INTEGER,
  last_event_id TEXT,
  source        TEXT,
  qualified_at  INTEGER,
  booked_at     INTEGER,
  showed_at     INTEGER,
  won_at        INTEGER,
  noshow_nudged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    TEXT NOT NULL,
  seq        TEXT NOT NULL,              -- followup | reminder | rebook | dq | reply | internal
  step       TEXT NOT NULL,              -- e.g. d0, d2, t24h
  channel    TEXT NOT NULL,              -- email | sms
  direction  TEXT NOT NULL DEFAULT 'out',
  send_at    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | skipped | failed | cancelled | received
  attempts   INTEGER NOT NULL DEFAULT 0,
  subject    TEXT,
  body       TEXT,
  error      TEXT,
  sent_at    INTEGER,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_due ON messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_msg_lead ON messages(lead_id);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT,
  ts      INTEGER NOT NULL,
  type    TEXT NOT NULL,
  data    TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);
