/*
  Warnings:

  - A unique constraint covering the columns `[businessNumber]` on the table `mover_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."MoverApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ReportTargetType" AS ENUM ('REVIEW', 'MOVER');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('SPAM', 'ABUSE', 'FALSE_INFO', 'INAPPROPRIATE', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."SuspensionAction" AS ENUM ('SUSPEND', 'RELEASE');

-- CreateEnum
CREATE TYPE "public"."InquiryCategory" AS ENUM ('SUSPENSION_APPEAL', 'ACCOUNT', 'SERVICE', 'ETC');

-- CreateEnum
CREATE TYPE "public"."InquiryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."NoticeAudience" AS ENUM ('ALL', 'CUSTOMER', 'MOVER');

-- CreateEnum
CREATE TYPE "public"."LogAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "public"."LogTargetType" AS ENUM ('USER', 'MOVER_PROFILE', 'REVIEW', 'ESTIMATE_REQUEST', 'ESTIMATE', 'NOTICE', 'FAQ', 'INQUIRY', 'REPORT');

-- AlterTable
ALTER TABLE "public"."mover_profiles" ADD COLUMN     "approvalStatus" "public"."MoverApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" UUID,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "businessNumber" TEXT,
ADD COLUMN     "licenseFileKey" TEXT,
ADD COLUMN     "rejectReason" TEXT;

-- AlterTable
ALTER TABLE "public"."reviews" ADD COLUMN     "is_hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."reports" (
    "id" SERIAL NOT NULL,
    "target_type" "public"."ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'PENDING',
    "handled_by" UUID,
    "handled_at" TIMESTAMP(3),
    "handler_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_suspensions" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" "public"."SuspensionAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "internal_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inquiries" (
    "id" SERIAL NOT NULL,
    "author_id" UUID NOT NULL,
    "category" "public"."InquiryCategory" NOT NULL DEFAULT 'ETC',
    "title" TEXT NOT NULL,
    "status" "public"."InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "handled_by" UUID,
    "closed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inquiry_messages" (
    "id" SERIAL NOT NULL,
    "inquiry_id" INTEGER NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notices" (
    "id" SERIAL NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience" "public"."NoticeAudience" NOT NULL DEFAULT 'ALL',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "send_notification" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."faqs" (
    "id" SERIAL NOT NULL,
    "author_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" SERIAL NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "public"."UserRole" NOT NULL,
    "action" "public"."LogAction" NOT NULL,
    "target_type" "public"."LogTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "public"."reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "public"."reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "public"."reports"("reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_target_type_target_id_reporter_id_key" ON "public"."reports"("target_type", "target_id", "reporter_id");

-- CreateIndex
CREATE INDEX "user_suspensions_user_id_created_at_idx" ON "public"."user_suspensions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_suspensions_admin_id_created_at_idx" ON "public"."user_suspensions"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_author_id_created_at_idx" ON "public"."inquiries"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_status_last_message_at_idx" ON "public"."inquiries"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "inquiry_messages_inquiry_id_created_at_idx" ON "public"."inquiry_messages"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiry_messages_sender_id_idx" ON "public"."inquiry_messages"("sender_id");

-- CreateIndex
CREATE INDEX "notices_is_visible_is_pinned_created_at_idx" ON "public"."notices"("is_visible", "is_pinned", "created_at");

-- CreateIndex
CREATE INDEX "notices_audience_idx" ON "public"."notices"("audience");

-- CreateIndex
CREATE INDEX "faqs_is_visible_sort_order_idx" ON "public"."faqs"("is_visible", "sort_order");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "public"."activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_idx" ON "public"."activity_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_actor_role_created_at_idx" ON "public"."activity_logs"("actor_role", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_target_type_target_id_idx" ON "public"."activity_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "activity_logs_action_created_at_idx" ON "public"."activity_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mover_profiles_businessNumber_key" ON "public"."mover_profiles"("businessNumber");

-- CreateIndex
CREATE INDEX "mover_profiles_approvalStatus_idx" ON "public"."mover_profiles"("approvalStatus");

-- CreateIndex
CREATE INDEX "reviews_is_hidden_idx" ON "public"."reviews"("is_hidden");

-- AddForeignKey
ALTER TABLE "public"."mover_profiles" ADD CONSTRAINT "mover_profiles_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_suspensions" ADD CONSTRAINT "user_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_suspensions" ADD CONSTRAINT "user_suspensions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inquiries" ADD CONSTRAINT "inquiries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inquiries" ADD CONSTRAINT "inquiries_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inquiry_messages" ADD CONSTRAINT "inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inquiry_messages" ADD CONSTRAINT "inquiry_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."faqs" ADD CONSTRAINT "faqs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
