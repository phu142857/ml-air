#!/bin/bash
set -euo pipefail
RUN_ID="8b786848-a650-42ee-9e61-e20bba5b826a"
docker exec mlair-controller sh -c "psql \"\$ML_AIR_DATABASE_URL\" -At -F '|' -c \"
SELECT 'TASK_USAGE|' || task_id || '|' ||
       COALESCE(runtime_seconds::text,'') || '|' ||
       COALESCE(cpu_seconds::text,'') || '|' ||
       COALESCE(memory_rss_peak_kb::text,'') || '|' ||
       COALESCE(disk_read_bytes::text,'') || '|' ||
       COALESCE(disk_write_bytes::text,'') || '|' ||
       COALESCE(sample_count::text,'')
FROM task_usage WHERE run_id='${RUN_ID}' ORDER BY task_id;
\""
docker exec mlair-controller sh -c "psql \"\$ML_AIR_DATABASE_URL\" -At -F '|' -c \"
SELECT 'RUN_USAGE|' || run_id || '|' ||
       COALESCE(runtime_seconds::text,'') || '|' ||
       COALESCE(cpu_seconds::text,'') || '|' ||
       COALESCE(memory_rss_peak_kb::text,'') || '|' ||
       COALESCE(disk_read_bytes::text,'') || '|' ||
       COALESCE(disk_write_bytes::text,'') || '|' ||
       COALESCE(task_count::text,'')
FROM run_usage WHERE run_id='${RUN_ID}';
\""
docker exec mlair-controller sh -c "psql \"\$ML_AIR_DATABASE_URL\" -At -F '|' -c \"
SELECT 'TASKS_COL|' || task_id || '|' ||
       COALESCE(duration_ms::text,'') || '|' ||
       COALESCE(cpu_time_seconds::text,'') || '|' ||
       COALESCE(memory_rss_kb::text,'')
FROM tasks WHERE run_id='${RUN_ID}' ORDER BY task_id;
\""
docker exec mlair-controller sh -c "psql \"\$ML_AIR_DATABASE_URL\" -At -F '|' -c \"
SELECT COUNT(*) || ' samples for train' FROM task_usage_samples
WHERE task_id='${RUN_ID}:train';
\""
