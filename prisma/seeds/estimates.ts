import type { EstimateRequestSeedKey } from "./estimateRequests.js";
import { PENDING_ESTIMATES } from "./pendingSeeds.js";
import { toReviewEstimates } from "./reviewSeeds.js";

/*
 * 기존 SENT/CONFIRMED 견적은 BASE에 유지하고,
 * 리뷰 시드용 CONFIRMED 견적은 reviewSeeds에서 합칩니다.
 * (리뷰 1개 = 확정 견적 1개 unique)
 */
interface EstimateSeed {
  requestKey: EstimateRequestSeedKey;
  moverEmail: string;
  price: number;
  comment: string;
  status: "SENT" | "CONFIRMED";
  isDesignated: boolean;
}

const BASE_ESTIMATES: readonly EstimateSeed[] = [
  /*
   * customer1: 받은 견적 목록 확인용
   * 아직 확정되지 않은 OPEN 견적 요청
   */
  {
    requestKey: "customer1-open-request",
    moverEmail: "mover001@test.com",
    price: 180000,
    comment: "가정 이사 경험을 바탕으로 포장부터 운반까지 안전하게 진행하겠습니다.",
    status: "SENT",
    isDesignated: true,
  },
  {
    requestKey: "customer1-open-request",
    moverEmail: "mover002@test.com",
    price: 210000,
    comment: "꼼꼼한 포장과 신속한 운반으로 편안한 이사를 도와드리겠습니다.",
    status: "SENT",
    isDesignated: false,
  },
  {
    requestKey: "customer1-open-request",
    moverEmail: "mover007@test.com",
    price: 195000,
    comment: "처음부터 마무리까지 깔끔하고 안전하게 작업하겠습니다.",
    status: "SENT",
    isDesignated: false,
  },

  /*
   * customer1: 대기 중인 견적 화면 확인용
   * OPEN 요청에 SENT 견적을 연결해 /api/estimates/pending 응답을 보장
   */
  {
    requestKey: "customer1-pending-design-request",
    moverEmail: "mover003@test.com",
    price: 360000,
    comment: "대기 중인 견적 화면 확인을 위한 가정이사 견적입니다.",
    status: "SENT",
    isDesignated: false,
  },
  {
    requestKey: "customer1-pending-design-request",
    moverEmail: "mover005@test.com",
    price: 400000,
    comment: "대기 중인 견적 카드 비교를 위한 베테랑 기사 견적입니다.",
    status: "SENT",
    isDesignated: true,
  },

  /*
   * customer2: 확정 견적 상세 확인용
   * mover2의 견적이 확정된 상태
   */
  {
    requestKey: "customer2-confirmed-request",
    moverEmail: "mover002@test.com",
    price: 480000,
    comment: "사무실 집기와 전자기기를 꼼꼼하게 포장하여 안전하게 이전하겠습니다.",
    status: "CONFIRMED",
    isDesignated: true,
  },
  {
    requestKey: "customer2-confirmed-request",
    moverEmail: "mover004@test.com",
    price: 520000,
    comment: "사무실 규모에 맞춰 작업 인원과 차량을 배정해 신속하게 진행하겠습니다.",
    status: "SENT",
    isDesignated: false,
  },
  {
    requestKey: "customer2-confirmed-request",
    moverEmail: "mover006@test.com",
    price: 500000,
    comment: "파손 위험이 있는 장비를 별도로 포장하여 안전하게 운송하겠습니다.",
    status: "SENT",
    isDesignated: false,
  },

  /*
   * customer3: 소형 이사 견적 목록 확인용
   */
  {
    requestKey: "customer3-open-small-request",
    moverEmail: "mover001@test.com",
    price: 90000,
    comment: "원룸 소형 이사를 빠르고 안전하게 진행해드리겠습니다.",
    status: "SENT",
    isDesignated: false,
  },
  {
    requestKey: "customer3-open-small-request",
    moverEmail: "mover007@test.com",
    price: 85000,
    comment: "소형 이사 전문 기사로서 깔끔하게 운반해드리겠습니다.",
    status: "SENT",
    isDesignated: true,
  },
];

/** 기존 견적 + 리뷰용 CONFIRMED 견적 + 대기중 SENT 견적 */
export const ESTIMATES: readonly EstimateSeed[] = [
  ...BASE_ESTIMATES,
  ...toReviewEstimates(),
  ...PENDING_ESTIMATES,
];
