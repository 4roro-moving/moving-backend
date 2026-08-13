-- CreateEnum
CREATE TYPE "public"."GiveawayStatus" AS ENUM ('AVAILABLE', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."GiveawayRequestStatus" AS ENUM ('PENDING', 'SELECTED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."ReportTargetType" ADD VALUE 'RESIDENCE_REVIEW';
ALTER TYPE "public"."ReportTargetType" ADD VALUE 'GIVEAWAY';

-- CreateTable
CREATE TABLE "public"."residence_reviews" (
    "id" SERIAL NOT NULL,
    "author_id" UUID NOT NULL,
    "region_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residence_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."region_review_statistics" (
    "id" SERIAL NOT NULL,
    "region_id" INTEGER NOT NULL,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_review_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."giveaways" (
    "id" SERIAL NOT NULL,
    "author_id" UUID NOT NULL,
    "receiver_id" UUID,
    "region_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."GiveawayStatus" NOT NULL DEFAULT 'AVAILABLE',
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."giveaway_images" (
    "id" SERIAL NOT NULL,
    "giveaway_id" INTEGER NOT NULL,
    "image_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaway_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."giveaway_requests" (
    "id" SERIAL NOT NULL,
    "giveaway_id" INTEGER NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "public"."GiveawayRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaway_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "residence_reviews_region_id_created_at_idx" ON "public"."residence_reviews"("region_id", "created_at");

-- CreateIndex
CREATE INDEX "residence_reviews_author_id_created_at_idx" ON "public"."residence_reviews"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "residence_reviews_is_hidden_idx" ON "public"."residence_reviews"("is_hidden");

-- CreateIndex
CREATE UNIQUE INDEX "region_review_statistics_region_id_key" ON "public"."region_review_statistics"("region_id");

-- CreateIndex
CREATE INDEX "giveaways_status_created_at_idx" ON "public"."giveaways"("status", "created_at");

-- CreateIndex
CREATE INDEX "giveaways_region_id_status_created_at_idx" ON "public"."giveaways"("region_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "giveaways_author_id_created_at_idx" ON "public"."giveaways"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "giveaways_receiver_id_created_at_idx" ON "public"."giveaways"("receiver_id", "created_at");

-- CreateIndex
CREATE INDEX "giveaways_is_hidden_idx" ON "public"."giveaways"("is_hidden");

-- CreateIndex
CREATE INDEX "giveaway_images_giveaway_id_idx" ON "public"."giveaway_images"("giveaway_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_images_giveaway_id_sort_order_key" ON "public"."giveaway_images"("giveaway_id", "sort_order");

-- CreateIndex
CREATE INDEX "giveaway_requests_requester_id_status_created_at_idx" ON "public"."giveaway_requests"("requester_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "giveaway_requests_giveaway_id_status_idx" ON "public"."giveaway_requests"("giveaway_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_requests_giveaway_id_requester_id_key" ON "public"."giveaway_requests"("giveaway_id", "requester_id");

-- AddForeignKey
ALTER TABLE "public"."residence_reviews" ADD CONSTRAINT "residence_reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."residence_reviews" ADD CONSTRAINT "residence_reviews_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."region_review_statistics" ADD CONSTRAINT "region_review_statistics_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaways" ADD CONSTRAINT "giveaways_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaways" ADD CONSTRAINT "giveaways_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaways" ADD CONSTRAINT "giveaways_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaway_images" ADD CONSTRAINT "giveaway_images_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaway_requests" ADD CONSTRAINT "giveaway_requests_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giveaway_requests" ADD CONSTRAINT "giveaway_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
