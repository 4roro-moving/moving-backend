-- 관리자 대시보드 기간 집계 최적화
--
-- 문제: 확정/완료 건수를 셀 때 status 인덱스로 해당 상태 행을 전부 찾은 뒤
--       각 행의 힙을 열어 시각 컬럼을 확인하느라 대량의 페이지를 읽었다.
--       RDS(t4g.micro, 메모리 1GiB)에서 estimates 확정 집계 하나가 20초.
--
-- 해결: 상태로 좁힌 부분 인덱스에 시각 컬럼을 담는다.
--       Index Only Scan 이 되어 힙 접근이 사라진다.
--       (로컬 169만행 측정: 20s → 4ms, 버퍼 11,830 → 33 페이지)
--
-- 부분 인덱스라 크기가 작고, 해당 상태로 바뀔 때만 갱신되므로
-- 견적 제출처럼 잦은 쓰기에는 영향이 없다.

CREATE INDEX "estimates_confirmed_at_idx"
  ON "estimates" ("confirmed_at")
  WHERE "status" = 'CONFIRMED';

CREATE INDEX "estimate_requests_completed_at_idx"
  ON "estimate_requests" ("completedAt")
  WHERE "status" = 'COMPLETED';
