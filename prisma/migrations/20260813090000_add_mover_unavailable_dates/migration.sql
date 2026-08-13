CREATE TABLE "mover_unavailable_dates" (
    "id" SERIAL NOT NULL,
    "mover_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mover_unavailable_dates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mover_unavailable_dates_mover_id_date_key"
ON "mover_unavailable_dates"("mover_id", "date");

CREATE INDEX "mover_unavailable_dates_date_idx"
ON "mover_unavailable_dates"("date");

ALTER TABLE "mover_unavailable_dates"
ADD CONSTRAINT "mover_unavailable_dates_mover_id_fkey"
FOREIGN KEY ("mover_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
