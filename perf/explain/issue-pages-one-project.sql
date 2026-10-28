EXPLAIN (ANALYZE, BUFFERS)
SELECT issue.* FROM issue
WHERE issue.id IN (
  SELECT ranked.id FROM (
    SELECT i.id, ROW_NUMBER() OVER (PARTITION BY i."projectId" ORDER BY i."createdAt" DESC) AS position
    FROM issue i
    WHERE i."projectId" IN ('db800e65-f372-481f-821d-07a614e5bd65')
  ) ranked
  WHERE ranked.position <= 50
)
ORDER BY issue."createdAt" DESC;
