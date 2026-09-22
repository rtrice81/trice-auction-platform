-- Staged role-model migration. `users.role` remains temporarily for rollback
-- compatibility; all application authorization reads `user_roles` after this migration.
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('consignor', 'employee', 'manager', 'admin', 'bidder')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_roles_role_user ON user_roles(role, user_id);

-- Preserve every existing account and map its legacy single role to an additive role.
INSERT OR IGNORE INTO user_roles (user_id, role)
SELECT id,
  CASE role
    WHEN 'customer' THEN 'consignor'
    WHEN 'employee' THEN 'employee'
    WHEN 'manager' THEN 'manager'
    WHEN 'admin' THEN 'admin'
  END
FROM users
WHERE role IN ('customer', 'employee', 'manager', 'admin');
