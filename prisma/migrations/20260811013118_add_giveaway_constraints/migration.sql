--- 거주 후기 평점 범위 제한 (1~5)
ALTER TABLE "public"."residence_reviews"
ADD CONSTRAINT "residence_reviews_rating_range_check"
CHECK ("rating" BETWEEN 1 AND 5);

-- 나눔 글 당 SELECTED는 최대 1건으로 제약조건 추가
CREATE UNIQUE INDEX "giveaway_requests_one_selected_per_giveaway_idx"
ON "public"."giveaway_requests" ("giveaway_id")
WHERE "status" = 'SELECTED';