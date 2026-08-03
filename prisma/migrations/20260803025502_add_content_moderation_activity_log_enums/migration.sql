-- AlterEnum LogAction: 콘텐츠 숨김/복구
ALTER TYPE "public"."LogAction" ADD VALUE 'HIDE';
ALTER TYPE "public"."LogAction" ADD VALUE 'UNHIDE';

-- AlterEnum LogTargetType: 거주 후기 / 나눔 게시글
ALTER TYPE "public"."LogTargetType" ADD VALUE 'RESIDENCE_REVIEW';
ALTER TYPE "public"."LogTargetType" ADD VALUE 'SHARING_POST';
