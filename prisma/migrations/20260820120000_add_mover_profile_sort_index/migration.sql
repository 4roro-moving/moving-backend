-- 기존 단일 컬럼 인덱스 제거.
-- orderBy 가 항상 id asc 를 타이브레이커로 붙이므로 단일 인덱스로는 정렬을 만족하지 못해 매 조회마다 전체 정렬이 발생하는 문제가 있음 

DROP INDEX "mover_profiles_averageRating_idx";
DROP INDEX "mover_profiles_reviewCount_idx";
DROP INDEX "mover_profiles_career_idx";
DROP INDEX "mover_profiles_confirmedCount_idx";

CREATE INDEX "mover_profiles_averageRating_id_idx"
  ON "mover_profiles" ("averageRating" DESC, "id" ASC);
CREATE INDEX "mover_profiles_reviewCount_id_idx"
  ON "mover_profiles" ("reviewCount" DESC, "id" ASC);
CREATE INDEX "mover_profiles_career_id_idx"
  ON "mover_profiles" ("career" DESC, "id" ASC);
CREATE INDEX "mover_profiles_confirmedCount_id_idx"
  ON "mover_profiles" ("confirmedCount" DESC, "id" ASC);
  