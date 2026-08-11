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
 * 케이스 1: 일반 견적 전체 흐름 (완료 → 리뷰까지)
 *
 * 고객 가입/프로필 → 기사 가입/프로필 → 고객 견적요청
 * → 기사 견적 확인/발송 → 고객 알림 확인 → 고객 견적조회 → 확정
 * → 기사 이사완료 처리 → 고객 리뷰 작성 가능 확인 → 리뷰 작성
 */
test("케이스1: 일반 견적 → 확정 → 완료 → 리뷰", async () => {
  // 1. 고객 준비
  const customer = await signupAndLogin("customer");
  await createCustomerProfile(customer.token);

  // 2. 기사 준비
  const mover = await signupAndLogin("mover");
  await createMoverProfileAndGetId(mover.token);

  // 3. 고객: 견적 요청
  const requestId = await createEstimateRequest(customer.token);

  // 4. 기사: 받은 요청 확인 → 견적 발송
  const requestsRes = await request(app)
    .get("/api/estimates/requests")
    .set("Authorization", `Bearer ${mover.token}`);
  assert.equal(requestsRes.status, 200);
  const estimateId = await sendEstimate(mover.token, requestId);

  // 5. 고객: 견적 도착 알림 확인 (ESTIMATE_RECEIVED)
  await assertNotificationReceived(customer.token, "ESTIMATE_RECEIVED");

  // 6. 고객: 대기중 견적 조회
  const pendingRes = await request(app)
    .get("/api/estimates/pending")
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(pendingRes.status, 200);

  // 7. 고객: 확정
  const confirmRes = await request(app)
    .post(`/api/estimates/${estimateId}/confirm`)
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(confirmRes.status, 200, `확정 실패: ${JSON.stringify(confirmRes.body)}`);

  // 8. 기사: 확정 알림 확인 (ESTIMATE_CONFIRMED)
  await assertNotificationReceived(mover.token, "ESTIMATE_CONFIRMED");

  // 9. 기사: 이사 완료 처리 (CONFIRMED → COMPLETED)
  const completeRes = await request(app)
    .patch(`/api/estimates/sent/${estimateId}/complete`)
    .set("Authorization", `Bearer ${mover.token}`);
  assert.equal(
    completeRes.status,
    200,
    `이사완료 처리 실패: ${completeRes.status} ${JSON.stringify(completeRes.body)}`,
  );

  // 10. 고객: 리뷰 작성 가능 목록에 이 건이 있나
  const reviewableRes = await request(app)
    .get("/api/reviews/reviewable")
    .set("Authorization", `Bearer ${customer.token}`);
  assert.equal(reviewableRes.status, 200);
  const reviewableItems = reviewableRes.body?.data?.items ?? reviewableRes.body?.data ?? [];
  assert.ok(
    reviewableItems.length > 0,
    `리뷰 작성 가능 건이 없음. 완료 처리가 리뷰 조건을 못 채웠을 수 있음: ${JSON.stringify(reviewableItems)}`,
  );

  // 11. 고객: 리뷰 작성
  const reviewRes = await request(app)
    .post("/api/reviews")
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ estimateId, rating: 5, content: "친절하고 꼼꼼하게 이사해 주셨습니다. 감사합니다." });
  assert.equal(
    reviewRes.status,
    201,
    `리뷰 작성 실패: ${reviewRes.status} ${JSON.stringify(reviewRes.body)}`,
  );
});
