-- CreateTable
CREATE TABLE "public"."customer_service_areas" (
    "id" SERIAL NOT NULL,
    "customerProfileId" INTEGER NOT NULL,
    "regionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_service_types" (
    "id" SERIAL NOT NULL,
    "customerProfileId" INTEGER NOT NULL,
    "moveType" "public"."MoveType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_service_areas_regionId_idx" ON "public"."customer_service_areas"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_service_areas_customerProfileId_regionId_key" ON "public"."customer_service_areas"("customerProfileId", "regionId");

-- CreateIndex
CREATE INDEX "customer_service_types_moveType_idx" ON "public"."customer_service_types"("moveType");

-- CreateIndex
CREATE UNIQUE INDEX "customer_service_types_customerProfileId_moveType_key" ON "public"."customer_service_types"("customerProfileId", "moveType");

-- AddForeignKey
ALTER TABLE "public"."customer_service_areas" ADD CONSTRAINT "customer_service_areas_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "public"."customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_service_areas" ADD CONSTRAINT "customer_service_areas_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "public"."regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_service_types" ADD CONSTRAINT "customer_service_types_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "public"."customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
