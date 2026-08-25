-- Gemini embedding(1536차원)을 사용하는 raw SQL 기반 예상 견적 유사도 검색 테이블입니다.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "public"."price_prediction_vectors" (
  "id" BIGSERIAL NOT NULL,
  "move_type" VARCHAR(20) NOT NULL,
  "move_date" DATE NOT NULL,
  "from_region" VARCHAR(50) NOT NULL,
  "to_region" VARCHAR(50) NOT NULL,
  "distance_km" INTEGER NOT NULL,
  "house_size" INTEGER NOT NULL,
  "load_amount" VARCHAR(20) NOT NULL,
  "from_floor" INTEGER NOT NULL,
  "from_elevator" BOOLEAN NOT NULL,
  "to_floor" INTEGER NOT NULL,
  "to_elevator" BOOLEAN NOT NULL,
  "ladder_truck" BOOLEAN NOT NULL,
  "is_weekend" BOOLEAN NOT NULL,
  "is_peak_season" BOOLEAN NOT NULL,
  "price" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "price_prediction_vectors_pkey" PRIMARY KEY ("id")
);
