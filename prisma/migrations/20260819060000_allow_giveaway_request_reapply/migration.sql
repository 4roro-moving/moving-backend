-- CANCELLED/REJECTED 이력을 유지한 채 재신청할 수 있도록
-- (giveaway_id, requester_id) 전체 unique 를 제거합니다.
DROP INDEX IF EXISTS "public"."giveaway_requests_giveaway_id_requester_id_key";

-- PENDING 또는 SELECTED 인 활성 신청만 글·유저당 1건으로 제한합니다.
CREATE UNIQUE INDEX "giveaway_requests_one_active_per_user_idx"
ON "public"."giveaway_requests" ("giveaway_id", "requester_id")
WHERE "status" IN ('PENDING', 'SELECTED');

-- 이력 포함 글·신청자 조회용 일반 인덱스.
CREATE INDEX "giveaway_requests_giveaway_id_requester_id_idx"
ON "public"."giveaway_requests" ("giveaway_id", "requester_id");
