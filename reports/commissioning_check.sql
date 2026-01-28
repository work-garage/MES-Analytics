-- Commissioning Check Script
-- Run this to verify if the site is ready for go-live

WITH gateway_status AS (
    SELECT 
        client_id, 
        MAX(created_at) as last_seen, 
        COUNT(*) as total_msgs
    FROM (
        SELECT client_id, created_at FROM ingest_weighbridge
        UNION ALL
        SELECT client_id, created_at FROM ingest_rpm_intervals
        UNION ALL
        SELECT client_id, created_at FROM ingest_packing_logs
    ) all_msgs
    GROUP BY client_id
),
ingest_health AS (
    SELECT 
        'Weighbridge' as system, 
        (SELECT COUNT(*) FROM ingest_weighbridge WHERE processed = true) as processed,
        (SELECT COUNT(*) FROM ingest_weighbridge WHERE processed = false) as pending
    UNION ALL
     SELECT 
        'RPM Sensors', 
        (SELECT COUNT(*) FROM ingest_rpm_intervals WHERE processed = true),
        (SELECT COUNT(*) FROM ingest_rpm_intervals WHERE processed = false)
     UNION ALL
     SELECT 
        'Packing Logs', 
        (SELECT COUNT(*) FROM ingest_packing_logs WHERE processed = true),
        (SELECT COUNT(*) FROM ingest_packing_logs WHERE processed = false)
)

SELECT 'GATEWAY CHECKS' as section, json_agg(gateway_status) as data FROM gateway_status
UNION ALL
SELECT 'INGEST HEALTH', json_agg(ingest_health) FROM ingest_health;
