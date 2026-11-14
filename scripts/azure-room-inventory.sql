-- Operator-only aggregate inventory. Run with an existing authorised DB connection.
-- No participant identifiers, room codes, prompts, answers or credential values.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
WITH clock AS (
  SELECT (extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS now_ms
), records AS (
  SELECT kind, count(*) AS total,
    count(*) FILTER (WHERE expires_at > clock.now_ms) AS unexpired,
    count(*) FILTER (WHERE expires_at <= clock.now_ms) AS expired
  FROM shift_records CROSS JOIN clock GROUP BY kind
), jobs AS (
  SELECT j.data->>'status' AS status, j.expires_at,
    r.key IS NOT NULL AS room_exists, r.expires_at AS room_expires_at
  FROM shift_records j LEFT JOIN shift_records r
    ON r.kind = 'room' AND r.key = j.data->>'code'
  WHERE j.kind = 'ai' AND j.data->>'kind' = 'job'
)
SELECT jsonb_build_object(
  'observedAt', transaction_timestamp(),
  'schemaVersion', (SELECT version FROM shift_schema_version WHERE singleton),
  'records', coalesce((SELECT jsonb_object_agg(kind, jsonb_build_object(
    'total', total, 'unexpired', unexpired, 'expired', expired)) FROM records), '{}'::jsonb),
  'jobs', (SELECT jsonb_build_object(
    'total', count(*),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'inFlight', count(*) FILTER (WHERE status IN ('leased', 'provider_started')),
    'settled', count(*) FILTER (WHERE status IN ('complete', 'fallback', 'discarded')),
    'otherStatus', count(*) FILTER (WHERE status IS NULL OR status NOT IN ('pending', 'leased', 'provider_started', 'complete', 'fallback', 'discarded')),
    'unexpired', count(*) FILTER (WHERE expires_at > clock.now_ms),
    'missingRoom', count(*) FILTER (WHERE NOT room_exists),
    'expiredRoom', count(*) FILTER (WHERE room_exists AND room_expires_at <= clock.now_ms),
    'unexpiredRoom', count(*) FILTER (WHERE room_exists AND room_expires_at > clock.now_ms)
  ) FROM jobs CROSS JOIN clock),
  'recoverability', jsonb_build_object(
    'databaseBackup', 'unknown: verify the existing backup configuration separately',
    'applicationExport', 'unknown: no recovery export is established by this inventory')
) AS inventory;
COMMIT;
