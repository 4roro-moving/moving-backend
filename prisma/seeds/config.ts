/*
 * ============================================================================
 *  시드 규모 / 분포 설정 (single source of truth)
 * ============================================================================
 *
 *  규모를 바꾸고 싶으면 이 파일만 고치면 된다. 생성기는 전부 이 값을 참조한다.
 *
 *  프리셋
 *    dev  : 로컬 개발용. 수십 초 내 완료. 기능 확인이 목적.
 *    full : 실사용자 기반 부하/정합성 테스트용. 수 분 소요.
 *
 *  선택: SEED_PRESET 환경변수 (기본 dev)
 *    SEED_PRESET=full npm run prisma:seed
 * ============================================================================
 */

export type PresetName = "dev" | "full";

/** 결정적 난수 시드. 바꾸면 전체 데이터가 통째로 달라진다. */
export const MASTER_SEED = 20260820;

/** 공통 로그인 비밀번호 (평문). 해시는 1회만 계산해 전 계정이 공유한다. */
export const TEST_PASSWORD = "Moving123!";
export const SALT_ROUNDS = 10;

/** 앵커(고정 QA) 계정 수. 벌크와 무관하게 항상 이 수만큼 앞쪽에 배치된다. */
export const ANCHOR_CUSTOMER_COUNT = 100;
export const ANCHOR_MOVER_COUNT = 100;
export const GROUP_SIZE = 10;

/** 프로필 이미지 원본 장수 (S3 seed-src/001.webp ~ ). */
export const PROFILE_IMAGE_POOL_SIZE = 100;

/** 데이터가 분포하는 과거 기간(개월). 오늘로부터 역산. */
export const HISTORY_MONTHS = 18;

export interface SeedConfig {
  name: PresetName;

  /** 계정 수 */
  customers: number;
  movers: number;
  admins: number;

  /** 견적 요청 상태별 건수 */
  requests: {
    completed: number;
    open: number;
    expired: number;
    confirmed: number;
    canceled: number;
    pending: number;
  };

  /** COMPLETED 요청 중 리뷰가 작성된 비율 (0~1) */
  reviewWrittenRatio: number;

  /** 확정 견적으로 생성된 채팅방 중 실제 대화가 있는 비율 */
  chatActiveRatio: number;

  /** 거주후기 / 나눔 */
  residenceReviews: number;
  giveaways: number;

  /** 관리자 콘텐츠 */
  notices: number;
  faqs: number;
  inquiries: number;
  reports: number;

  /** S3 프로필 이미지 복제 여부. dev 는 건너뛴다. */
  copyProfileImages: boolean;
}

const dev: SeedConfig = {
  name: "dev",
  /*
   * 앵커 계정이 고객·기사 각 100명이라 dev 도 그보다는 많아야 한다.
   * (resolveConfig 가 이 조건을 검사한다)
   */
  customers: 300,
  movers: 150,
  admins: 10,
  requests: {
    completed: 600,
    open: 150,
    expired: 90,
    confirmed: 40,
    canceled: 35,
    pending: 12,
  },
  reviewWrittenRatio: 0.8,
  chatActiveRatio: 0.1,
  residenceReviews: 200,
  giveaways: 60,
  notices: 12,
  faqs: 15,
  inquiries: 30,
  reports: 25,
  copyProfileImages: false,
};

const full: SeedConfig = {
  name: "full",
  customers: 30_000,
  movers: 5_000,
  admins: 10,
  requests: {
    completed: 100_000,
    open: 25_000,
    expired: 15_000,
    confirmed: 7_000,
    canceled: 6_000,
    pending: 2_000,
  },
  reviewWrittenRatio: 0.8,
  chatActiveRatio: 0.1,
  residenceReviews: 20_000,
  giveaways: 6_000,
  notices: 40,
  faqs: 30,
  inquiries: 1_200,
  reports: 800,
  copyProfileImages: true,
};

const PRESETS: Record<PresetName, SeedConfig> = { dev, full };

export function resolveConfig(): SeedConfig {
  const raw = (process.env.SEED_PRESET ?? "dev").toLowerCase();

  if (raw !== "dev" && raw !== "full") {
    throw new Error(`알 수 없는 SEED_PRESET 입니다: ${raw} (dev | full)`);
  }

  const base = PRESETS[raw];

  /*
   * 앵커 계정이 벌크보다 많으면 시나리오 배정이 깨진다.
   * dev 프리셋에서 계정 수를 더 줄일 때를 대비한 방어.
   */
  if (base.customers < ANCHOR_CUSTOMER_COUNT || base.movers < ANCHOR_MOVER_COUNT) {
    throw new Error(
      `계정 수가 앵커 수보다 적습니다. customers=${base.customers}(>=${ANCHOR_CUSTOMER_COUNT}), movers=${base.movers}(>=${ANCHOR_MOVER_COUNT})`,
    );
  }

  /*
   * 리뷰 목표치를 이미지 복제 여부와 함께 로그로 보여주기 위해
   * 환경변수 오버라이드도 여기서 받는다.
   */
  const skipImages = process.env.SEED_SKIP_IMAGES === "1";

  return {
    ...base,
    copyProfileImages: base.copyProfileImages && !skipImages,
  };
}

/** 요청 총합 (파생값) */
export function totalRequests(config: SeedConfig): number {
  const r = config.requests;

  return r.completed + r.open + r.expired + r.confirmed + r.canceled + r.pending;
}

/** 작성된 리뷰 목표 수 (파생값) */
export function targetReviewCount(config: SeedConfig): number {
  return Math.round(config.requests.completed * config.reviewWrittenRatio);
}

/* ── 분포 파라미터 ─────────────────────────────────────────────────────── */

/**
 * 지역 가중치. 실서비스처럼 수도권에 편중시킨다.
 * (합이 1이 아니어도 되고, 상대 비율로만 쓰인다)
 */
export const REGION_WEIGHTS: Record<string, number> = {
  서울: 26,
  경기: 24,
  인천: 7,
  부산: 6,
  대구: 4,
  대전: 3,
  광주: 3,
  울산: 2,
  세종: 1,
  강원: 3,
  충북: 3,
  충남: 4,
  전북: 3,
  전남: 3,
  경북: 4,
  경남: 4,
  제주: 2,
};

/** 평점 J커브. index 0 = 1점 */
export const RATING_WEIGHTS = [5, 5, 10, 25, 55] as const;

/** 이사 유형 분포 */
export const MOVE_TYPE_WEIGHTS: Record<"SMALL" | "HOME" | "OFFICE", number> = {
  SMALL: 45,
  HOME: 42,
  OFFICE: 13,
};

/** 이사 유형별 견적 가격 범위(원) */
export const PRICE_RANGE: Record<"SMALL" | "HOME" | "OFFICE", [number, number]> = {
  SMALL: [200_000, 500_000],
  HOME: [500_000, 1_500_000],
  OFFICE: [1_000_000, 5_000_000],
};

/** 가입 방식 분포 */
export const AUTH_PROVIDER_WEIGHTS: Record<"LOCAL" | "GOOGLE" | "NAVER" | "KAKAO", number> = {
  LOCAL: 55,
  KAKAO: 22,
  NAVER: 15,
  GOOGLE: 8,
};

/** 월별 이사 수요 가중치 (1월 = index 0). 봄·가을 성수기. */
export const MONTH_WEIGHTS = [6, 7, 11, 12, 9, 6, 5, 6, 9, 12, 10, 7] as const;

/** 요청 1건당 견적 수 분포 (index = 견적 수) */
export const ESTIMATES_PER_REQUEST_WEIGHTS = [4, 10, 20, 26, 22, 13, 5] as const;

/** 기사가 한 요청을 반려할 확률 */
export const REJECTION_RATE = 0.06;

/** 지정 요청 비율 */
export const DESIGNATED_REQUEST_RATE = 0.18;
