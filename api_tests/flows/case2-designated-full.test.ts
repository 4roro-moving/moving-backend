import assert from "node:assert/strict";
import { test } from "node:test";

import request from "supertest";

import app from "../../src/app";
import {
  signupAndLogin,
  createCustomerProfile,
  createMoverProfileAndGetId,
  createEstimateRequest,
  sendEstimate,
  assertNotificationReceived,
} from "../helpers/api";

/**
 * 케이스 2: 지정 견적 전체 흐름 (완료 → 리뷰까지)
 *
 * 케이스1과의 차이:
 *  - 기사를 먼저 만들어 moverId 확보 (지정 대상)
 *  - 고객이 기사 찾기 → 견적 요청 → 그 기사 지정 (designate, 201)
 *  - 지정 시 기사에게 DESIGNATED_REQUEST_RECEIVED 알림
 *
 * 나머지(견적 발송 → 확정 → 완료 → 리뷰)는 케이스1과 동일.
 * 이사일은 헬퍼의 futureDate(0)(오늘)이라 완료 처리 가능.
 */
test("케이스2: 지정 견적 → 확정 → 완료 → 리뷰", async () => {
  // 1. 기사 먼저 준비 (지정 대상이 있어야 하므로)
  const mover = await signupAndLogin("mover");
  const moverId = await createMoverProfileAndGetId(mover.token);

  // 2. 고객 준비
  const customer = await signupAndLogin("customer");
  await createCustomerProfile(customer.token);

  // 3. 고객: 기사 찾기 (목록 조회)
  const moversRes = await request(app)
    .get("/api/movers")
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(moversRes.status, 200, `기사 목록 조회 실패: ${JSON.stringify(moversRes.body)}`);

  // 4. 고객: 견적 요청 생성 → 그 기사 지정 (designate는 201)
  const requestId = await createEstimateRequest(customer.token);
  const designateRes = await request(app)
    .post(`/api/estimate-requests/${requestId}/designate`)
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ moverId });
  assert.equal(
    designateRes.status,
    201,
    `지정 실패: ${designateRes.status} ${JSON.stringify(designateRes.body)}`,
  );

  // 5. 기사: 지정 요청 알림 확인 (DESIGNATED_REQUEST_RECEIVED)
  await assertNotificationReceived(mover.token, "DESIGNATED_REQUEST_RECEIVED");

  // 6. 기사: 받은 요청 목록 확인 → 견적 발송
  const requestsRes = await request(app)
    .get("/api/estimates/requests")
    .set("Authorization", `Bearer ${mover.token}`);
  assert.equal(requestsRes.status, 200);
  const estimateId = await sendEstimate(mover.token, requestId);

  // 7. 고객: 견적 도착 알림 확인 (ESTIMATE_RECEIVED)
  await assertNotificationReceived(customer.token, "ESTIMATE_RECEIVED");

  // 8. 고객: 대기중 견적 조회
  const pendingRes = await request(app)
    .get("/api/estimates/pending")
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(pendingRes.status, 200);

  // 9. 고객: 확정
  const confirmRes = await request(app)
    .post(`/api/estimates/${estimateId}/confirm`)
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(confirmRes.status, 200, `확정 실패: ${JSON.stringify(confirmRes.body)}`);

  // 10. 기사: 확정 알림 확인 (ESTIMATE_CONFIRMED)
  await assertNotificationReceived(mover.token, "ESTIMATE_CONFIRMED");

  // 11. 기사: 이사 완료 처리 (CONFIRMED → COMPLETED)
  const completeRes = await request(app)
    .patch(`/api/estimates/sent/${estimateId}/complete`)
    .set("Authorization", `Bearer ${mover.token}`);
  assert.equal(
    completeRes.status,
    200,
    `이사완료 처리 실패: ${completeRes.status} ${JSON.stringify(completeRes.body)}`,
  );

  // 12. 고객: 리뷰 작성 가능 확인
  const reviewableRes = await request(app)
    .get("/api/reviews/reviewable")
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(reviewableRes.status, 200);
  const reviewableItems = reviewableRes.body?.data?.items ?? reviewableRes.body?.data ?? [];
  assert.ok(
    reviewableItems.length > 0,
    `리뷰 작성 가능 건이 없음: ${JSON.stringify(reviewableItems)}`,
  );

  // 13. 고객: 리뷰 작성
  const reviewRes = await request(app)
    .post("/api/reviews")
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ estimateId, rating: 5, content: "지정한 보람이 있었습니다. 매우 만족합니다." });
  assert.equal(
    reviewRes.status,
    201,
    `리뷰 작성 실패: ${reviewRes.status} ${JSON.stringify(reviewRes.body)}`,
  );
});
