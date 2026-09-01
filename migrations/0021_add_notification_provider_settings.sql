-- Provider choices and delivery identity are operational settings, not credentials.
INSERT INTO settings (key, value) VALUES
  ('notifications.email_provider', 'resend'),
  ('notifications.email_sender_name', 'Trice Auctions'),
  ('notifications.email_sender_address', ''),
  ('notifications.email_reply_to', ''),
  ('notifications.sms_provider', 'telnyx'),
  ('notifications.sms_sender_number', ''),
  ('notifications.sms_messaging_profile_id', '')
ON CONFLICT(key) DO NOTHING;
