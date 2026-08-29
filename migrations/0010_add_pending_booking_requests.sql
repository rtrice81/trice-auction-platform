-- Anonymous visitors can save a short-lived booking draft while they authenticate.
-- The opaque token is held only in an HttpOnly cookie; no appointment or user ID
-- is associated with a pending request.
CREATE TABLE pending_booking_requests (
  token TEXT PRIMARY KEY,
  booking_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_booking_requests_expires_at
  ON pending_booking_requests (expires_at);
