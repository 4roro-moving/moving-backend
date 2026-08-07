/**
 * 대기중(pending) 견적 시드
 *
 * "대기중인 견적" = 고객이 요청을 올렸고 기사님 견적(SENT)이 도착했지만
 * 아직 확정하지 않은 상태. 프론트 /api/estimates/pending 조회 조건:
 *   EstimateRequest.isActive = true
 *   + status ∈ (PENDING, OPEN)
 *   + confirmedEstimateId = null
 *   + expiresAt > now  (만료되지 않음 → moveDate/expires 는 미래로)
 *   + 해당 요청에 SENT 견적 존재
 *
 * 고객 20명(customer011~030)에게 각 1건씩 OPEN 요청 + SENT 견적 2~3개를 부여합니다.
 * (커버리지 완료이사 시드와 고객이 겹쳐도 요청 자체는 별도 row 라 무방)
 */

import { customerEmail } from "./customers.js";
import { moverEmail, MOVER_COUNT } from "./movers.js";

/** 대기중 견적을 받을 고객 번호 범위 */
export const PENDING_CUSTOMER_START = 11;
const CHAT_SENT_ESTIMATE_START = 11;
const CHAT_SENT_ESTIMATE_END = 19;
export const PENDING_CUSTOMER_END = 30; // 총 20명

const MOVE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;

// 승인된 기사 index (7=REJECTED, 8=PENDING 제외)
const APPROVED_MOVER_INDEXES: number[] = [];
for (let i = 1; i <= MOVER_COUNT; i += 1) {
  if (i === 7 || i === 8) {
    continue;
  }
  APPROVED_MOVER_INDEXES.push(i);
}

function pickApprovedMoverEmail(offset: number): string {
  const idx = APPROVED_MOVER_INDEXES[offset % APPROVED_MOVER_INDEXES.length]!;

  return moverEmail(idx);
}

const PENDING_COMMENTS = [
  "요청하신 일정에 맞춰 안전하게 진행하겠습니다.",
  "포장부터 운반까지 꼼꼼하게 도와드리겠습니다.",
  "합리적인 가격으로 신속하게 처리해드리겠습니다.",
  "경력을 살려 파손 없이 이사해드리겠습니다.",
] as const;

const CHAT_SENT_ESTIMATE_COMMENTS = [
  "채팅 기능 확인을 위해 조율 가능한 보낸 견적입니다.",
  "일정과 주소를 확인했고 안전하게 진행 가능한 견적입니다.",
  "견적 조율과 채팅 진입 테스트를 위한 미완료 견적입니다.",
] as const;

export interface PendingRequestSeed {
  key: string;
  customerEmail: string;
  moveType: (typeof MOVE_TYPES)[number];
  moveDateOffsetDays: number;
  expiresInDays: number;
  fromRegion: string;
  fromZipCode: string;
  fromAddress: string;
  fromDetailAddress: string;
  toRegion: string;
  toZipCode: string;
  toAddress: string;
  toDetailAddress: string;
  status: "OPEN";
  isActive: true;
}

export interface PendingEstimateSeed {
  requestKey: string;
  moverEmail: string;
  price: number;
  comment: string;
  status: "SENT";
  isDesignated: boolean;
}

function buildPending(): {
  requests: PendingRequestSeed[];
  estimates: PendingEstimateSeed[];
} {
  const requests: PendingRequestSeed[] = [];
  const estimates: PendingEstimateSeed[] = [];

  for (let c = PENDING_CUSTOMER_START; c <= PENDING_CUSTOMER_END; c += 1) {
    const key = `pending-c${String(c).padStart(3, "0")}`;
    const moveType = MOVE_TYPES[c % MOVE_TYPES.length]!;

    requests.push({
      key,
      customerEmail: customerEmail(c),
      moveType,
      moveDateOffsetDays: 20 + (c % 15), // 미래 이사일
      expiresInDays: 10 + (c % 7), // 미래 만료 → 대기중 유지
      fromRegion: "서울",
      fromZipCode: "06236",
      fromAddress: "서울특별시 강남구 테헤란로 123",
      fromDetailAddress: `대기견적-${key}`,
      toRegion: "경기",
      toZipCode: "13529",
      toAddress: "경기도 성남시 분당구 판교역로 166",
      toDetailAddress: `도착-${key}`,
      status: "OPEN",
      isActive: true,
    });

    // 요청당 SENT 견적 2~3개 (기사 중복 없이)
    const estimateCount = 2 + (c % 2); // 2 or 3
    for (let j = 0; j < estimateCount; j += 1) {
      estimates.push({
        requestKey: key,
        moverEmail: pickApprovedMoverEmail(c * 3 + j),
        price: 150000 + ((c + j) % 20) * 10000,
        comment: PENDING_COMMENTS[(c + j) % PENDING_COMMENTS.length]!,
        status: "SENT",
        isDesignated: j === 0, // 첫 견적만 지정 견적으로
      });
    }
  }

  return { requests, estimates };
}

const built = buildPending();

export const PENDING_REQUESTS: readonly PendingRequestSeed[] = built.requests;
export const PENDING_ESTIMATES: readonly PendingEstimateSeed[] = [
  ...built.estimates,
  ...Array.from({ length: CHAT_SENT_ESTIMATE_END - CHAT_SENT_ESTIMATE_START + 1 }, (_, index) => {
    const seedIndex = CHAT_SENT_ESTIMATE_START + index;

    return {
      requestKey: `pending-c${String(seedIndex).padStart(3, "0")}`,
      moverEmail: moverEmail(seedIndex),
      price: 220000 + index * 10000,
      comment: CHAT_SENT_ESTIMATE_COMMENTS[index % CHAT_SENT_ESTIMATE_COMMENTS.length]!,
      status: "SENT" as const,
      isDesignated: seedIndex % 2 === 1,
    };
  }),
];
