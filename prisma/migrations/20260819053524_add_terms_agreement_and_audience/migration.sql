-- CreateEnum
CREATE TYPE "public"."TermsAudience" AS ENUM ('ALL', 'CUSTOMER', 'MOVER');

-- AlterTable
ALTER TABLE "public"."terms" ADD COLUMN     "audience" "public"."TermsAudience" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "public"."terms_agreements" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "terms_id" INTEGER NOT NULL,
    "is_agreed" BOOLEAN NOT NULL,
    "agreed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terms_agreements_terms_id_idx" ON "public"."terms_agreements"("terms_id");

-- CreateIndex
CREATE INDEX "terms_agreements_user_id_terms_id_agreed_at_idx" ON "public"."terms_agreements"("user_id", "terms_id", "agreed_at");

-- AddForeignKey
ALTER TABLE "public"."terms_agreements" ADD CONSTRAINT "terms_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."terms_agreements" ADD CONSTRAINT "terms_agreements_terms_id_fkey" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
