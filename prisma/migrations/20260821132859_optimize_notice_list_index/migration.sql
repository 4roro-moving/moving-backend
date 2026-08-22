-- DropIndex
DROP INDEX "public"."notices_is_visible_is_pinned_created_at_idx";

-- CreateIndex
CREATE INDEX "notices_is_visible_is_pinned_created_at_id_idx" ON "public"."notices"("is_visible", "is_pinned", "created_at", "id");
