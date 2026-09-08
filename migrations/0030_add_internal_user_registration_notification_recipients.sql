ALTER TABLE appointment_notification_recipients
  ADD COLUMN receive_registration INTEGER NOT NULL DEFAULT 0;
