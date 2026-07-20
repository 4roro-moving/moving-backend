-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('CUSTOMER', 'MOVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'NAVER', 'KAKAO');

-- CreateEnum
CREATE TYPE "public"."MoveType" AS ENUM ('SMALL', 'HOME', 'OFFICE');

-- CreateEnum
CREATE TYPE "public"."EstimateRequestStatus" AS ENUM ('PENDING', 'OPEN', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."EstimateStatus" AS ENUM ('SENT', 'CONFIRMED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."EstimateRequestHistoryType" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('ESTIMATE_REQUEST_RECEIVED', 'DESIGNATED_REQUEST_RECEIVED', 'ESTIMATE_RECEIVED', 'ESTIMATE_CONFIRMED', 'ESTIMATE_REQUEST_REJECTED', 'MOVE_DAY_REMINDER', 'ESTIMATE_EXPIRATION_REMINDER', 'REVIEW_AVAILABLE', 'REVIEW_RECEIVED', 'CHAT_MESSAGE_RECEIVED', 'ESTIMATE_REVISION_REQUESTED', 'ESTIMATE_REVISION_APPROVED', 'ESTIMATE_REVISION_REJECTED');

-- CreateEnum
CREATE TYPE "public"."ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM', 'ESTIMATE_REVISION');

-- CreateEnum
CREATE TYPE "public"."EstimateRevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "authProvider" "public"."AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "providerUserId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "public"."UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isProfileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_profiles" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mover_profiles" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "imageUrl" TEXT,
    "career" INTEGER NOT NULL DEFAULT 0,
    "shortIntro" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mover_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mover_service_areas" (
    "id" SERIAL NOT NULL,
    "moverProfileId" INTEGER NOT NULL,
    "regionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mover_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."regions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mover_service_types" (
    "id" SERIAL NOT NULL,
    "moverProfileId" INTEGER NOT NULL,
    "moveType" "public"."MoveType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mover_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estimate_requests" (
    "id" SERIAL NOT NULL,
    "customerId" UUID NOT NULL,
    "moveType" "public"."MoveType" NOT NULL,
    "moveDate" TIMESTAMP(3) NOT NULL,
    "fromZipCode" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromDetailAddress" TEXT,
    "fromRegionId" INTEGER NOT NULL,
    "toZipCode" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "toDetailAddress" TEXT,
    "toRegionId" INTEGER NOT NULL,
    "status" "public"."EstimateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "confirmedEstimateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "estimate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."designated_movers" (
    "id" SERIAL NOT NULL,
    "estimateRequestId" INTEGER NOT NULL,
    "moverId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designated_movers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estimates" (
    "id" SERIAL NOT NULL,
    "estimate_request_id" INTEGER NOT NULL,
    "mover_id" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "public"."EstimateStatus" NOT NULL DEFAULT 'SENT',
    "is_designated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estimate_request_histories" (
    "id" SERIAL NOT NULL,
    "estimateRequestId" INTEGER NOT NULL,
    "changedBy" UUID NOT NULL,
    "type" "public"."EstimateRequestHistoryType" NOT NULL,
    "previousData" JSONB,
    "changedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_request_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estimate_request_rejections" (
    "id" SERIAL NOT NULL,
    "estimate_request_id" INTEGER NOT NULL,
    "mover_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_request_rejections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."favorite_movers" (
    "id" SERIAL NOT NULL,
    "customer_id" UUID NOT NULL,
    "mover_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_movers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reviews" (
    "id" SERIAL NOT NULL,
    "customer_id" UUID NOT NULL,
    "mover_id" UUID NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "link_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_rooms" (
    "id" SERIAL NOT NULL,
    "estimate_request_id" INTEGER NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "customer_id" UUID NOT NULL,
    "mover_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sender_id" UUID NOT NULL,
    "type" "public"."ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "image_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estimate_revisions" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "requester_id" UUID NOT NULL,
    "responder_id" UUID,
    "message_id" INTEGER,
    "previous_price" INTEGER NOT NULL,
    "requested_price" INTEGER NOT NULL,
    "previous_comment" TEXT NOT NULL,
    "requested_comment" TEXT NOT NULL,
    "status" "public"."EstimateRevisionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "public"."User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProvider_providerUserId_key" ON "public"."User"("authProvider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "public"."RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "public"."RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "public"."RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "public"."customer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mover_profiles_userId_key" ON "public"."mover_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mover_profiles_nickname_key" ON "public"."mover_profiles"("nickname");

-- CreateIndex
CREATE INDEX "mover_profiles_averageRating_idx" ON "public"."mover_profiles"("averageRating");

-- CreateIndex
CREATE INDEX "mover_profiles_reviewCount_idx" ON "public"."mover_profiles"("reviewCount");

-- CreateIndex
CREATE INDEX "mover_profiles_career_idx" ON "public"."mover_profiles"("career");

-- CreateIndex
CREATE INDEX "mover_profiles_confirmedCount_idx" ON "public"."mover_profiles"("confirmedCount");

-- CreateIndex
CREATE INDEX "mover_service_areas_regionId_idx" ON "public"."mover_service_areas"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "mover_service_areas_moverProfileId_regionId_key" ON "public"."mover_service_areas"("moverProfileId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "public"."regions"("name");

-- CreateIndex
CREATE INDEX "mover_service_types_moveType_idx" ON "public"."mover_service_types"("moveType");

-- CreateIndex
CREATE UNIQUE INDEX "mover_service_types_moverProfileId_moveType_key" ON "public"."mover_service_types"("moverProfileId", "moveType");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_requests_confirmedEstimateId_key" ON "public"."estimate_requests"("confirmedEstimateId");

-- CreateIndex
CREATE INDEX "estimate_requests_customerId_idx" ON "public"."estimate_requests"("customerId");

-- CreateIndex
CREATE INDEX "estimate_requests_status_idx" ON "public"."estimate_requests"("status");

-- CreateIndex
CREATE INDEX "estimate_requests_moveType_idx" ON "public"."estimate_requests"("moveType");

-- CreateIndex
CREATE INDEX "estimate_requests_fromRegionId_idx" ON "public"."estimate_requests"("fromRegionId");

-- CreateIndex
CREATE INDEX "estimate_requests_toRegionId_idx" ON "public"."estimate_requests"("toRegionId");

-- CreateIndex
CREATE INDEX "estimate_requests_moveDate_idx" ON "public"."estimate_requests"("moveDate");

-- CreateIndex
CREATE INDEX "estimate_requests_expiresAt_idx" ON "public"."estimate_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "estimate_requests_createdAt_idx" ON "public"."estimate_requests"("createdAt");

-- CreateIndex
CREATE INDEX "designated_movers_moverId_idx" ON "public"."designated_movers"("moverId");

-- CreateIndex
CREATE UNIQUE INDEX "designated_movers_estimateRequestId_moverId_key" ON "public"."designated_movers"("estimateRequestId", "moverId");

-- CreateIndex
CREATE INDEX "estimates_mover_id_idx" ON "public"."estimates"("mover_id");

-- CreateIndex
CREATE INDEX "estimates_status_idx" ON "public"."estimates"("status");

-- CreateIndex
CREATE INDEX "estimates_created_at_idx" ON "public"."estimates"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimate_request_id_mover_id_key" ON "public"."estimates"("estimate_request_id", "mover_id");

-- CreateIndex
CREATE INDEX "estimate_request_histories_estimateRequestId_createdAt_idx" ON "public"."estimate_request_histories"("estimateRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "estimate_request_histories_changedBy_idx" ON "public"."estimate_request_histories"("changedBy");

-- CreateIndex
CREATE INDEX "estimate_request_histories_type_idx" ON "public"."estimate_request_histories"("type");

-- CreateIndex
CREATE INDEX "estimate_request_rejections_mover_id_idx" ON "public"."estimate_request_rejections"("mover_id");

-- CreateIndex
CREATE INDEX "estimate_request_rejections_estimate_request_id_idx" ON "public"."estimate_request_rejections"("estimate_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_request_rejections_estimate_request_id_mover_id_key" ON "public"."estimate_request_rejections"("estimate_request_id", "mover_id");

-- CreateIndex
CREATE INDEX "favorite_movers_mover_id_idx" ON "public"."favorite_movers"("mover_id");

-- CreateIndex
CREATE INDEX "favorite_movers_customer_id_created_at_idx" ON "public"."favorite_movers"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_movers_customer_id_mover_id_key" ON "public"."favorite_movers"("customer_id", "mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_estimate_id_key" ON "public"."reviews"("estimate_id");

-- CreateIndex
CREATE INDEX "reviews_mover_id_created_at_idx" ON "public"."reviews"("mover_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_customer_id_created_at_idx" ON "public"."reviews"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "public"."notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "public"."notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_expires_at_idx" ON "public"."notifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_estimate_id_key" ON "public"."chat_rooms"("estimate_id");

-- CreateIndex
CREATE INDEX "chat_rooms_customer_id_last_message_at_idx" ON "public"."chat_rooms"("customer_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_rooms_mover_id_last_message_at_idx" ON "public"."chat_rooms"("mover_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_estimate_request_id_mover_id_key" ON "public"."chat_rooms"("estimate_request_id", "mover_id");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_created_at_idx" ON "public"."chat_messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_is_read_idx" ON "public"."chat_messages"("room_id", "is_read");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_idx" ON "public"."chat_messages"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_revisions_message_id_key" ON "public"."estimate_revisions"("message_id");

-- CreateIndex
CREATE INDEX "estimate_revisions_chat_room_id_created_at_idx" ON "public"."estimate_revisions"("chat_room_id", "created_at");

-- CreateIndex
CREATE INDEX "estimate_revisions_estimate_id_created_at_idx" ON "public"."estimate_revisions"("estimate_id", "created_at");

-- CreateIndex
CREATE INDEX "estimate_revisions_status_idx" ON "public"."estimate_revisions"("status");

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mover_profiles" ADD CONSTRAINT "mover_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mover_service_areas" ADD CONSTRAINT "mover_service_areas_moverProfileId_fkey" FOREIGN KEY ("moverProfileId") REFERENCES "public"."mover_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mover_service_areas" ADD CONSTRAINT "mover_service_areas_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mover_service_types" ADD CONSTRAINT "mover_service_types_moverProfileId_fkey" FOREIGN KEY ("moverProfileId") REFERENCES "public"."mover_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_requests" ADD CONSTRAINT "estimate_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_requests" ADD CONSTRAINT "estimate_requests_fromRegionId_fkey" FOREIGN KEY ("fromRegionId") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_requests" ADD CONSTRAINT "estimate_requests_toRegionId_fkey" FOREIGN KEY ("toRegionId") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_requests" ADD CONSTRAINT "estimate_requests_confirmedEstimateId_fkey" FOREIGN KEY ("confirmedEstimateId") REFERENCES "public"."estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."designated_movers" ADD CONSTRAINT "designated_movers_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "public"."estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."designated_movers" ADD CONSTRAINT "designated_movers_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimates" ADD CONSTRAINT "estimates_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "public"."estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimates" ADD CONSTRAINT "estimates_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_request_histories" ADD CONSTRAINT "estimate_request_histories_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "public"."estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_request_histories" ADD CONSTRAINT "estimate_request_histories_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_request_rejections" ADD CONSTRAINT "estimate_request_rejections_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "public"."estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_request_rejections" ADD CONSTRAINT "estimate_request_rejections_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorite_movers" ADD CONSTRAINT "favorite_movers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorite_movers" ADD CONSTRAINT "favorite_movers_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_rooms" ADD CONSTRAINT "chat_rooms_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "public"."estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_rooms" ADD CONSTRAINT "chat_rooms_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_rooms" ADD CONSTRAINT "chat_rooms_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_rooms" ADD CONSTRAINT "chat_rooms_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_revisions" ADD CONSTRAINT "estimate_revisions_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_revisions" ADD CONSTRAINT "estimate_revisions_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_revisions" ADD CONSTRAINT "estimate_revisions_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_revisions" ADD CONSTRAINT "estimate_revisions_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."estimate_revisions" ADD CONSTRAINT "estimate_revisions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
