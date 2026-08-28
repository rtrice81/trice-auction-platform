-- Preserve the full decision context for any future manager/admin capacity override.
-- This migration only provides audit storage; it does not enable an override workflow.
CREATE TABLE appointment_override_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('manager', 'admin')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL,
  violated_rules_json TEXT NOT NULL,
  previous_values_json TEXT NOT NULL,
  requested_values_json TEXT NOT NULL,
  capacity_context_json TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX idx_appointment_override_audits_appointment_occurred
  ON appointment_override_audits (appointment_id, occurred_at DESC, id DESC);
