INSERT INTO notification_templates (notification_type, channel, subject, body) VALUES
  ('waitlisted', 'email', 'Your Trice Auctions Drop-Off Request Is Waitlisted', 'Hi {{first_name}},\n\nYour requested drop-off appointment for {{appointment_date}} is currently on the waitlist. It is not yet confirmed. We’ll notify you if it is approved.\n\nView your request: {{appointment_link}}\n\n{{business_name}}'),
  ('waitlisted', 'sms', NULL, 'Trice Auctions: Your requested drop-off on {{appointment_date}} is waitlisted and not yet confirmed. We will notify you if approved. View: {{appointment_link}}'),
  ('waitlist_confirmed', 'email', 'Your Waitlisted Trice Auctions Appointment Is Confirmed', 'Hi {{first_name}},\n\nYour waitlisted drop-off appointment has been approved and is now confirmed for {{appointment_date}}.\n\nView or edit your appointment: {{appointment_link}}\n\n{{business_name}}'),
  ('waitlist_confirmed', 'sms', NULL, 'Trice Auctions: Your waitlisted drop-off is now confirmed for {{appointment_date}}. View/edit: {{appointment_link}}'),
  ('waitlist_cancelled', 'email', 'Your Waitlisted Trice Auctions Request Was Cancelled', 'Hi {{first_name}},\n\nYour waitlisted drop-off request for {{appointment_date}} has been cancelled and was not confirmed.\n\n{{business_name}}'),
  ('waitlist_cancelled', 'sms', NULL, 'Trice Auctions: Your waitlisted drop-off request for {{appointment_date}} was cancelled and was not confirmed.')
ON CONFLICT(notification_type, channel) DO NOTHING;
