ALTER TABLE "estimate_revisions"
ADD COLUMN "previous_move_date" DATE,
ADD COLUMN "requested_move_date" DATE;

ALTER TABLE "estimates"
ADD COLUMN "move_date" DATE;

UPDATE "estimate_revisions" AS "revision"
SET
  "previous_move_date" = "request"."moveDate",
  "requested_move_date" = "request"."moveDate"
FROM "estimates" AS "estimate"
JOIN "estimate_requests" AS "request"
  ON "request"."id" = "estimate"."estimate_request_id"
WHERE "revision"."estimate_id" = "estimate"."id";

ALTER TABLE "estimate_revisions"
ALTER COLUMN "previous_move_date" SET NOT NULL,
ALTER COLUMN "requested_move_date" SET NOT NULL;
