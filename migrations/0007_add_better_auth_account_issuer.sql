-- Better Auth 1.7 scopes provider account identities by issuer. This
-- application only supports email/password credentials, so every existing
-- account has the stable local credential issuer.
ALTER TABLE account ADD COLUMN issuer TEXT;

UPDATE account
SET issuer = 'local:credential'
WHERE issuer IS NULL AND providerId = 'credential';

CREATE UNIQUE INDEX IF NOT EXISTS account_issuer_account_id
  ON account(issuer, accountId);
