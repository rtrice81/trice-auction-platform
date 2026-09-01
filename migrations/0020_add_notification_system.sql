-- Transactional appointment notifications. Provider credentials remain Worker secrets.
CREATE TABLE user_notification_preferences (
  user_id INTEGER PRIMARY KEY,
  appointment_email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (appointment_email_enabled IN (0, 1)),
  appointment_sms_enabled INTEGER NOT NULL DEFAULT 0 CHECK (appointment_sms_enabled IN (0, 1)),
  sms_consent_at TEXT,
  sms_consent_source TEXT,
  sms_opted_out_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE admin_notification_preferences (
  user_id INTEGER PRIMARY KEY,
  event_operational_email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (event_operational_email_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE notification_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  appointment_id INTEGER,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);
CREATE INDEX idx_notification_jobs_due ON notification_jobs(status, scheduled_at);
CREATE INDEX idx_notification_jobs_appointment ON notification_jobs(appointment_id, status);

INSERT INTO user_notification_preferences (user_id)
SELECT id FROM users
WHERE 1 = 1
ON CONFLICT(user_id) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('notifications.first_reminder_enabled', '1'),
  ('notifications.first_reminder_offset_minutes', '10080'),
  ('notifications.second_reminder_enabled', '1'),
  ('notifications.second_reminder_offset_minutes', '1440'),
  ('notifications.email_enabled', '1'),
  ('notifications.sms_enabled', '1')
ON CONFLICT(key) DO NOTHING;
