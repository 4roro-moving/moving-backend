import assert from "node:assert/strict";

import request from "supertest";

import app from "../../src/app";

/**
 * API 테스트 공용 헬퍼 (케이스 1~3 지원).
 *
 * 확인된 구조:
 * - 회원가입: 고객/기사 같은 body(email, password, name, phone), 경로만 다름
 * - 로그인: {email, password}, 경로 하나(/api/auth/login), 역할은 이메일로 판별
 * - 견적요청: POST /api/estimate-requests { moveType, moveDate, from, to }
 * - 지정: POST /api/estimate-requests/:id/designate { moverId }
 * - 기사 견적: POST /api/estimates/requests/:requestId { price, comment }
 * - 기사 반려: POST /api/estimates/requests/:requestId/reject { reason(10~1000자) }
 * - 고객 확정: POST /api/estimates/:estimateId/confirm
 * - 기사 이사완료: PATCH /api/estimates/sent/:estimateId/complete  ← 신규! COMPLETED 전환
 * - 리뷰 가능조회: GET /api/reviews/reviewable
 * - 리뷰 작성: POST /api/reviews { estimateId, rating(1~5), content(10자+) }
 * - 알림 조회: GET /api/notifications
 */

const PASSWORD = "Test1234!";

export function uniqueEmail(role: "customer" | "mover"): string {
  return `test-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`;
}

export function futureDate(daysAhead = 20): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** accessToken 추출 (응답 구조에 맞게 조정) */
function extractToken(body: unknown): string {
  const b = body as {
    data?: { tokens?: { accessToken?: string }; accessToken?: string };
    accessToken?: string;
  };
  const token = b?.data?.tokens?.accessToken ?? b?.data?.accessToken ?? b?.accessToken;
  if (!token) throw new Error(`토큰 없음: ${JSON.stringify(body)}`);
  return token;
}

export interface Account {
  token: string;
  email: string;
  userId?: string;
}

/** 매번 고유한 전화번호 (010 + 8자리 랜덤) */
export function uniquePhone(): string {
  const n = Math.floor(10000000 + Math.random() * 89999999); // 8자리
  return `010${n}`;
}

/** 회원가입 + 로그인 → { token, email } */
export async function signupAndLogin(role: "customer" | "mover"): Promise<Account> {
  const email = uniqueEmail(role);

  const signupRes = await request(app)
    .post(`/api/auth/signup/${role}`)
    .send({ email, password: PASSWORD, name: "테스트유저", phone: uniquePhone() });
  assert.ok(
    [200, 201].includes(signupRes.status),
    `회원가입 실패(${role}): ${signupRes.status} ${JSON.stringify(signupRes.body)}`,
  );

  const loginRes = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  assert.equal(loginRes.status, 200, `로그인 실패: ${JSON.stringify(loginRes.body)}`);

  return { token: extractToken(loginRes.body), email };
}

/** 고객 프로필 생성 (필수일 경우). 실제 body는 스키마에 맞게 조정 필요. */
export async function createCustomerProfile(token: string): Promise<void> {
  const res = await request(app)
    .post("/api/profiles/customer")
    .set("Authorization", `Bearer ${token}`)
    .send({
      regionIds: [1],
      serviceTypes: ["HOME"],
    });
  // 이미 완성/중복이면 무시, 실패 원인 파악 위해 상태만 확인
  assert.ok(
    [200, 201, 409].includes(res.status),
    `고객 프로필 생성 실패: ${res.status} ${JSON.stringify(res.body)}`,
  );
}

/** 기사 프로필 생성 + userId(moverId) 반환 */
export async function createMoverProfileAndGetId(token: string): Promise<string> {
  const createRes = await request(app)
    .post("/api/profiles/mover")
    .set("Authorization", `Bearer ${token}`)
    .send({
      nickname: `테스트기사${Date.now().toString().slice(-6)}`,
      career: 5,
      shortIntro: "성실하게 이사해 드립니다.",
      description: "10년 경력의 베테랑 기사입니다. 안전하게 모시겠습니다.",
      regionIds: [1, 9],
      serviceTypes: ["HOME"],
    });
  assert.ok(
    [200, 201].includes(createRes.status),
    `기사 프로필 생성 실패: ${createRes.status} ${JSON.stringify(createRes.body)}`,
  );

  const meRes = await request(app)
    .get("/api/profiles/mover/me")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(meRes.status, 200, "기사 프로필 조회 실패");
  const moverId = meRes.body?.data?.userId ?? meRes.body?.data?.id;
  assert.ok(moverId, `moverId 없음: ${JSON.stringify(meRes.body)}`);
  return moverId;
}

/** 고객 견적 요청 생성 → requestId */
export async function createEstimateRequest(token: string): Promise<number> {
  const res = await request(app)
    .post("/api/estimate-requests")
    .set("Authorization", `Bearer ${token}`)
    .send({
      moveType: "HOME",
      moveDate: futureDate(0),
      from: {
        zipCode: "06236",
        address: "서울특별시 강남구 테헤란로 123",
        detailAddress: "101동 1201호",
        sido: "서울",
        sigungu: "강남구",
      },
      to: {
        zipCode: "13529",
        address: "경기도 성남시 분당구 판교역로 166",
        detailAddress: "202동 303호",
        sido: "경기",
        sigungu: "성남시 분당구",
      },
    });
  assert.equal(res.status, 201, `요청 생성 실패: ${JSON.stringify(res.body)}`);
  const id = res.body?.data?.id;
  assert.ok(id, "requestId 없음");
  return id;
}

/** 기사가 요청에 견적 발송 → estimateId */
export async function sendEstimate(token: string, requestId: number): Promise<number> {
  const res = await request(app)
    .post(`/api/estimates/requests/${requestId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ price: 300000, comment: "안전하고 꼼꼼하게 이사해 드리겠습니다." });
  assert.equal(res.status, 201, `견적 발송 실패: ${JSON.stringify(res.body)}`);
  const id = res.body?.data?.id;
  assert.ok(id, "estimateId 없음");
  return id;
}

/** 알림 목록에서 특정 type 알림이 왔는지 확인 */
export async function assertNotificationReceived(token: string, type: string): Promise<void> {
  const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200, `알림 조회 실패: ${JSON.stringify(res.body)}`);
  const items = res.body?.data?.notifications ?? [];
  const found = items.some((n: { type?: string }) => n.type === type);
  assert.ok(found, `알림(${type})이 오지 않음. 받은 알림: ${JSON.stringify(items)}`);
}

export { PASSWORD };
