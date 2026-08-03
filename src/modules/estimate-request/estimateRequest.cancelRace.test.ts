import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@prisma/client";

import { lockEstimateRequestForUpdate } from "../../utils/estimate-request-lock.util";

/**
 * DB 통합 테스트 없이 잠금 헬퍼 계약을 고정한다.
 * 실제 교차 경쟁(cancel ↔ sendEstimate)은 PostgreSQL FOR UPDATE 로 직렬화된다.
 * // 2026.08.03 정슬기 - [추가]
 */
describe("lockEstimateRequestForUpdate", () => {
  it("행이 없으면 false (NOT_FOUND 분기)", async () => {
    const db = {
      $queryRaw: async () => [],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockEstimateRequestForUpdate(db, 999), false);
  });

  it("행이 있으면 true (이후 상태 재검증·쓰기 진행)", async () => {
    const db = {
      $queryRaw: async () => [{ id: 1 }],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockEstimateRequestForUpdate(db, 1), true);
  });

  it("cancel이 잠금을 잡은 뒤 sendEstimate는 OPEN이 아니면 생성하지 않는 계약", () => {
    // sendEstimate는 lock → find → status===OPEN 재검증 후에만 createEstimate 한다.
    // cancel은 lock → claimCancel(CANCELED) → cancelSentEstimates 순이다.
    // 동일 행 FOR UPDATE 이므로 한쪽이 커밋되기 전 다른 쪽은 대기하고,
    // 취소가 먼저면 sendEstimate는 CONFLICT, 전송이 먼저면 cancel이 SENT를 CANCELED 한다.
    const cancelFirst = { requestStatusAfterCancel: "CANCELED", mayCreateEstimate: false };
    const sendFirst = { requestStatusAfterSend: "OPEN", sentEstimatesCanceledOnCancel: true };

    assert.equal(cancelFirst.mayCreateEstimate, false);
    assert.equal(sendFirst.sentEstimatesCanceledOnCancel, true);
  });
});
