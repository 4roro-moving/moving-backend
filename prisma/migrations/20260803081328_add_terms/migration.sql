-- CreateEnum
CREATE TYPE "public"."TermsType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MARKETING_POLICY', 'LOCATION_POLICY', 'MOVER_POLICY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."TermsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "public"."terms" (
    "id" SERIAL NOT NULL,
    "type" "public"."TermsType" NOT NULL,
    "version" TEXT NOT NULL,
    "status" "public"."TermsStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "effective_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terms_type_status_idx" ON "public"."terms"("type", "status");

-- CreateIndex
CREATE INDEX "terms_type_created_at_idx" ON "public"."terms"("type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "terms_type_version_key" ON "public"."terms"("type", "version");

-- AddForeignKey
ALTER TABLE "public"."terms" ADD CONSTRAINT "terms_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
