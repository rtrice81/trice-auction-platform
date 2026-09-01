-- Appointments are date-only. Preserve the nullable legacy appointment_time
-- column for existing records, but remove time placeholders from saved templates.
UPDATE notification_templates
SET
  subject = REPLACE(REPLACE(COALESCE(subject, ''), ' at {{appointment_time}}', ''), '{{appointment_time}}', ''),
  body = REPLACE(REPLACE(body, ' at {{appointment_time}}', ''), '{{appointment_time}}', ''),
  updated_at = CURRENT_TIMESTAMP
WHERE subject LIKE '%{{appointment_time}}%' OR body LIKE '%{{appointment_time}}%';
