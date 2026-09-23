-- Staff accounts could already own appointments before roles became additive.
-- Preserve those consignor capabilities without changing their other roles.
INSERT OR IGNORE INTO user_roles (user_id, role)
SELECT DISTINCT user_id, 'consignor'
FROM appointments
WHERE user_id IS NOT NULL;
