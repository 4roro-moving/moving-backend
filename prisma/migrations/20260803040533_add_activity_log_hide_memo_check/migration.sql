-- HIDE 일 때 memo 는 NULL / 빈 문자열 / 공백이면 저장 불가
-- 다른 action 은 memo nullable 유지
ALTER TABLE "public"."activity_logs"
ADD CONSTRAINT "activity_logs_hide_memo_required_check"
CHECK (
  "action" <> 'HIDE'::"public"."LogAction"
  OR (
    "memo" IS NOT NULL
    AND length(btrim("memo")) > 0
  )
);
