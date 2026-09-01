CREATE TABLE notification_templates (
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  subject TEXT,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_type, channel)
);

INSERT INTO notification_templates (notification_type, channel, subject, body) VALUES
  ('confirmation', 'email', 'Your Trice Auctions Drop-Off Appointment is Confirmed', 'Hi {{first_name}},\n\nYour drop-off appointment has been scheduled for {{appointment_date}} at {{appointment_time}}.\n\nEvent: {{event_name}}\nLoad type: {{load_type}}\n\nYou can view or edit your appointment here: {{appointment_link}}\n\nThank you,\n{{business_name}}'),
  ('confirmation', 'sms', NULL, 'Trice Auctions: Your drop-off appointment is confirmed for {{appointment_date}} at {{appointment_time}}. View/edit: {{appointment_link}}'),
  ('rescheduled', 'email', 'Your Trice Auctions Drop-Off Appointment Was Rescheduled', 'Hi {{first_name}},\n\nYour drop-off appointment has been rescheduled to {{appointment_date}} at {{appointment_time}}.\n\nView your appointment: {{appointment_link}}\n\n{{business_name}}'),
  ('rescheduled', 'sms', NULL, 'Trice Auctions: Your appointment was rescheduled to {{appointment_date}} at {{appointment_time}}. View: {{appointment_link}}'),
  ('cancelled', 'email', 'Your Trice Auctions Drop-Off Appointment Was Cancelled', 'Hi {{first_name}},\n\nYour drop-off appointment on {{appointment_date}} at {{appointment_time}} has been cancelled.\n\n{{business_name}}'),
  ('cancelled', 'sms', NULL, 'Trice Auctions: Your drop-off appointment on {{appointment_date}} at {{appointment_time}} was cancelled.'),
  ('reminder_1', 'email', 'Reminder: Your Trice Auctions Drop-Off Appointment', 'Hi {{first_name}},\n\nThis is a reminder for your drop-off appointment on {{appointment_date}} at {{appointment_time}}.\n\nView appointment: {{appointment_link}}\n\n{{business_name}}'),
  ('reminder_1', 'sms', NULL, 'Trice Auctions reminder: your appointment is {{appointment_date}} at {{appointment_time}}. View: {{appointment_link}}'),
  ('reminder_2', 'email', 'Final Reminder: Your Trice Auctions Drop-Off Appointment', 'Hi {{first_name}},\n\nYour drop-off appointment is {{appointment_date}} at {{appointment_time}}.\n\nView appointment: {{appointment_link}}\n\n{{business_name}}'),
  ('reminder_2', 'sms', NULL, 'Trice Auctions final reminder: your appointment is {{appointment_date}} at {{appointment_time}}. View: {{appointment_link}}')
ON CONFLICT(notification_type, channel) DO NOTHING;
