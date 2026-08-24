-- AlterEnum NotificationType: 나눔 신청자/작성자 알림
ALTER TYPE "public"."NotificationType" ADD VALUE 'GIVEAWAY_REQUEST_RECEIVED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GIVEAWAY_REQUEST_SELECTED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GIVEAWAY_REQUEST_REJECTED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GIVEAWAY_REQUEST_CANCELED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GIVEAWAY_COMPLETED';
