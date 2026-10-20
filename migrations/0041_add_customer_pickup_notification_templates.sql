-- Keep internal pickup templates and customer messages separate. Retain custom
-- internal wording while replacing the old, ambiguous admin URL placeholder.
UPDATE notification_templates SET
  subject=REPLACE(subject, '{{pickupUrl}}', '{{adminPickupUrl}}'),
  body=REPLACE(body, '{{pickupUrl}}', '{{adminPickupUrl}}')
WHERE notification_type IN ('pickup_created','pickup_rescheduled','pickup_cancelled','pickup_completed');

INSERT INTO notification_templates(notification_type,channel,subject,body) VALUES
  ('customer_pickup_created','email','Your Consignment Pickup is Scheduled','Hello {{customerName}},\n\nYour consignment pickup has been scheduled.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPickup appointments are managed by Trice Auctions. Please contact us if changes are needed.\n\nTrice Auctions'),
  ('customer_pickup_rescheduled','email','Your Consignment Pickup has been Rescheduled','Hello {{customerName}},\n\nYour consignment pickup has been rescheduled.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\nPrevious date: {{previousPickupDate}}\nPrevious time: {{previousPickupTime}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPlease contact Trice Auctions if changes are needed.'),
  ('customer_pickup_cancelled','email','Your Consignment Pickup has been Cancelled','Hello {{customerName}},\n\nYour consignment pickup has been cancelled.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPlease contact Trice Auctions if you have questions.'),
  ('customer_pickup_completed','email','Your Consignment Pickup is Completed','Hello {{customerName}},\n\nYour consignment pickup is completed.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nThank you,\nTrice Auctions')
ON CONFLICT(notification_type,channel) DO NOTHING;
