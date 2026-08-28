ALTER TABLE "mover_profiles"
ADD COLUMN IF NOT EXISTS "activity_base_address" TEXT,
ADD COLUMN IF NOT EXISTS "activity_base_detail_address" TEXT,
ADD COLUMN IF NOT EXISTS "activity_base_zip_code" TEXT,
ADD COLUMN IF NOT EXISTS "activity_base_latitude" DECIMAL(9, 6),
ADD COLUMN IF NOT EXISTS "activity_base_longitude" DECIMAL(10, 6);
