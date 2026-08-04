-- AlterEnum NotificationType: 콘텐츠 숨김/복구 알림
ALTER TYPE "public"."NotificationType" ADD VALUE 'CONTENT_HIDDEN';
ALTER TYPE "public"."NotificationType" ADD VALUE 'CONTENT_RESTORED';
