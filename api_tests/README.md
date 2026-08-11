# 백엔드 API 통합 테스트 (3 케이스)

알림 로직 변경 + 이사완료 처리 추가를 반영한 견적 여정 테스트.

## 케이스

| 케이스    | 흐름                               | 검증 포인트                                          |
| --------- | ---------------------------------- | ---------------------------------------------------- |
| **case1** | 일반 견적 → 확정 → **완료 → 리뷰** | 완료 처리가 리뷰 조건(COMPLETED)을 채우는지          |
| **case2** | 지정 견적 → 확정 → 완료 → 리뷰     | 지정 알림(DESIGNATED_REQUEST_RECEIVED), isDesignated |
| **case3** | 지정 견적 → **반려** → 고객 알림   | 반려 알림(ESTIMATE_REQUEST_REJECTED)                 |

## 핵심 변화 반영

**1. 이사완료 처리가 생겼습니다 (중요)**

- `PATCH /api/estimates/sent/:estimateId/complete` (기사)
- CONFIRMED → COMPLETED 전환 (행 잠금 + compare-and-set으로 안전)
- **이제 리뷰까지 자동화 가능** — 이전엔 COMPLETED 전환이 없어 프리즈마 수동 수정이 필요했지만, 이 API로 해결됨

**2. 알림 확인 단계 추가**
각 케이스에 알림 검증 포함:

- ESTIMATE_RECEIVED (고객: 견적 도착)
- ESTIMATE_CONFIRMED (기사: 확정됨)
- DESIGNATED_REQUEST_RECEIVED (기사: 지정받음)
- ESTIMATE_REQUEST_REJECTED (고객: 반려됨)

## 확인된 API 구조

- 이사완료: `PATCH /api/estimates/sent/:estimateId/complete`
- 리뷰 가능: `GET /api/reviews/reviewable`
- 리뷰 작성: `POST /api/reviews { estimateId, rating(1~5), content(10자+) }`
- 반려: `POST /api/estimates/requests/:requestId/reject { reason(10~1000자) }`
- 알림 조회: `GET /api/notifications`

## 실행

```bash
npm install --save-dev supertest @types/supertest
npx tsx --test api_tests/flows/*.test.ts
```

## ⚠️ 실행 전 조정 (실제 응답/스키마에 맞춰야 함)

구조 분석 기반 초안이라 다음을 실제와 맞춰야 합니다:

1. **토큰 위치** (helpers): `body.data.accessToken` 가정
2. **프로필 body**: `createCustomerProfile`/`createMoverProfileAndGetId`의 필드가 실제 프로필 스키마와 맞는지 (serviceTypes, serviceRegionIds, nickname 등)
3. **견적요청 from/to**: regionId 필드가 실제 addressSchema와 맞는지
4. **moverId 위치**: 프로필 조회 응답의 userId 필드명
5. **알림 응답 구조**: `data.items` vs `data` — assertNotificationReceived에서 조정
6. **리뷰 가능 응답 구조**: items 위치
7. **알림 발송 시점**: 커밋 후 비동기면, 알림 조회 전 짧은 대기 필요할 수 있음 (SSE/트랜잭션 외 발송)

특히 7번 주의: 알림이 트랜잭션 커밋 후 발송되면, 바로 조회 시 아직 없을 수 있음. 그 경우 재시도/대기 로직 추가.

## 알림 발송 타이밍 관련

알림이 커밋 후 발송되는 구조라면, 발송~조회 사이 레이스가 있을 수 있습니다. 테스트에서 알림 확인이 간헐적으로 실패하면:

- 짧은 재시도(polling) 헬퍼로 감싸거나
- 알림 검증을 선택적으로(soft) 처리

우선 돌려보고 알림 검증이 안정적인지 확인하세요.
