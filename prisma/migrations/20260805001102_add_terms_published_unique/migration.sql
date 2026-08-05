CREATE UNIQUE INDEX "terms_type_published_unique"
  ON "public"."terms" ("type")
  WHERE "status" = 'PUBLISHED' AND "deleted_at" IS NULL;
  