DROP INDEX IF EXISTS "public"."estimate_requests_customerId_idx";

CREATE INDEX IF NOT EXISTS "estimate_requests_customerId_createdAt_id_idx"
  ON "public"."estimate_requests" ("customerId", "createdAt" DESC, "id" DESC);
