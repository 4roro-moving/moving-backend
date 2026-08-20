-- AlterEnum NotificationType: 신고 처리 결과 알림
ALTER TYPE "public"."NotificationType" ADD VALUE 'REPORT_RESULT';

-- CreateTable report_images
CREATE TABLE "public"."report_images" (
  "id" SERIAL NOT NULL,
  "report_id" INTEGER NOT NULL,
  "image_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_images_report_id_idx" ON "public"."report_images"("report_id");

-- AddForeignKey
ALTER TABLE "public"."report_images"
ADD CONSTRAINT "report_images_report_id_fkey"
FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
