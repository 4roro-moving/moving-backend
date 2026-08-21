-- CreateEnum
CREATE TYPE "public"."NoticeCategory" AS ENUM ('SERVICE', 'MAINTENANCE', 'EVENT');

-- AlterTable
ALTER TABLE "public"."notices" ADD COLUMN     "category" "public"."NoticeCategory" NOT NULL DEFAULT 'SERVICE';
