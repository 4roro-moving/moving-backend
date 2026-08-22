-- CreateEnum
CREATE TYPE "public"."AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "public"."admin_profiles" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "admin_role" "public"."AdminRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_userId_key" ON "public"."admin_profiles"("userId");

-- CreateIndex
CREATE INDEX "admin_profiles_admin_role_idx" ON "public"."admin_profiles"("admin_role");

-- AddForeignKey
ALTER TABLE "public"."admin_profiles" ADD CONSTRAINT "admin_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
