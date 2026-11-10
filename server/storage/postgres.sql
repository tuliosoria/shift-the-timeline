BEGIN;
-- Apply once as a migration identity. The runtime only needs SELECT/INSERT/UPDATE/DELETE.
CREATE TABLE IF NOT EXISTS shift_records (
  kind text NOT NULL CHECK (kind IN ('room','receipt','ai','session','counter')),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 512),
  version bigint,
  data jsonb NOT NULL,
  expires_at bigint NOT NULL,
  due_at bigint,
  PRIMARY KEY (kind,key)
);
CREATE INDEX IF NOT EXISTS shift_ai_due ON shift_records (due_at,key COLLATE "C") WHERE kind='ai' AND due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS shift_expiry ON shift_records (expires_at);

CREATE TABLE IF NOT EXISTS shift_schema_version (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL
);
INSERT INTO shift_schema_version(singleton,version) VALUES(true,1) ON CONFLICT(singleton) DO NOTHING;
COMMIT;
