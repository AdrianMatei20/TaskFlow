EXPLAIN (ANALYZE, BUFFERS)
SELECT page.* FROM unnest(ARRAY['db800e65-f372-481f-821d-07a614e5bd65']::uuid[]) AS p(id)
CROSS JOIN LATERAL (
  SELECT i.* FROM issue i
  WHERE i."projectId" = p.id
  ORDER BY i."createdAt" DESC
  LIMIT 50
) page
ORDER BY page."createdAt" DESC;
