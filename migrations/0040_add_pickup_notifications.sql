-- Extend the existing internal recipients, templates, settings, and outbox.
ALTER TABLE consignment_pickups ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointment_notification_recipients ADD COLUMN receive_pickup_created INTEGER NOT NULL DEFAULT 0 CHECK (receive_pickup_created IN (0,1));
ALTER TABLE appointment_notification_recipients ADD COLUMN receive_pickup_rescheduled INTEGER NOT NULL DEFAULT 0 CHECK (receive_pickup_rescheduled IN (0,1));
ALTER TABLE appointment_notification_recipients ADD COLUMN receive_pickup_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (receive_pickup_cancelled IN (0,1));
ALTER TABLE appointment_notification_recipients ADD COLUMN receive_pickup_completed INTEGER NOT NULL DEFAULT 0 CHECK (receive_pickup_completed IN (0,1));

INSERT INTO settings(key,value) VALUES
  ('notifications.pickup_created_enabled','1'),
  ('notifications.pickup_rescheduled_enabled','1'),
  ('notifications.pickup_cancelled_enabled','1'),
  ('notifications.pickup_completed_enabled','1')
ON CONFLICT(key) DO NOTHING;

INSERT INTO notification_templates(notification_type,channel,subject,body) VALUES
  ('pickup_created','email','New Consignment Pickup Scheduled – {{customerName}}','Trice Auctions internal consignment pickup scheduled\n\nCustomer: {{customerName}}\nConsignor number: {{consignorNumber}}\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\nContact: {{contactName}}\nPhone: {{contactPhone}}\nEstimated load: {{estimatedLoad}}\nSmalls: {{estimatedSmalls}}\nLarge / Furniture: {{estimatedLargeFurniture}}\nOutdoor: {{estimatedOutdoor}}\n\nReview pickup: {{pickupUrl}}\n\nTrice Auctions'),
  ('pickup_rescheduled','email','Consignment Pickup Rescheduled – {{customerName}}','Trice Auctions internal consignment pickup rescheduled\n\nCustomer: {{customerName}}\nConsignor number: {{consignorNumber}}\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\n\nPrevious date: {{previousPickupDate}}\nPrevious time: {{previousPickupTime}}\n\nReview pickup: {{pickupUrl}}\n\nTrice Auctions'),
  ('pickup_cancelled','email','Consignment Pickup Cancelled – {{customerName}}','Trice Auctions internal consignment pickup cancelled\n\nCustomer: {{customerName}}\nConsignor number: {{consignorNumber}}\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\nCancelled by: {{actorName}}\n\nReview pickup: {{pickupUrl}}\n\nTrice Auctions'),
  ('pickup_completed','email','Consignment Pickup Completed – {{customerName}}','Trice Auctions internal consignment pickup completed\n\nCustomer: {{customerName}}\nConsignor number: {{consignorNumber}}\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nTime: {{pickupTime}}\nAddress: {{pickupAddress}}\nCompleted at: {{completedAt}}\n\nReview pickup: {{pickupUrl}}\n\nTrice Auctions')
ON CONFLICT(notification_type,channel) DO NOTHING;
