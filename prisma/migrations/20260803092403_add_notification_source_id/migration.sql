/*
  Warnings:

  - A unique constraint covering the columns `[user_id,type,source_id]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "source_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_type_source_id_key" ON "public"."notifications"("user_id", "type", "source_id");
