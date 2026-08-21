-- RenameColumn
ALTER TABLE "public"."admin_profiles"
RENAME COLUMN "userId" TO "user_id";

-- RenameUniqueIndex
ALTER INDEX "public"."admin_profiles_userId_key"
RENAME TO "admin_profiles_user_id_key";

-- RenameForeignKey
ALTER TABLE "public"."admin_profiles"
RENAME CONSTRAINT "admin_profiles_userId_fkey"
TO "admin_profiles_user_id_fkey";