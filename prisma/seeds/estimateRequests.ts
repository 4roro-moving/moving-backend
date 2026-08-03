import { toReviewEstimateRequests } from "./reviewSeeds.js";

/*
 * 기존 OPEN/CONFIRMED 요청은 BASE에 유지하고,
 * 리뷰 시드용 COMPLETED 요청은 reviewSeeds에서 합칩니다.
 * (Review는 estimateId FK가 필요해서 요청·견적 시드와 같이 확장)
 */
const BASE_ESTIMATE_REQUESTS = [
  {
    key: "customer1-open-request",
    customerEmail: "customer1@test.com",
    moveType: "HOME",
    moveDateOffsetDays: 21,
    expiresInDays: 7,

    fromRegion: "서울",
    fromZipCode: "06236",
    fromAddress: "서울특별시 강남구 테헤란로 123",
    fromDetailAddress: "101동 1201호",

    toRegion: "인천",
    toZipCode: "21403",
    toAddress: "인천광역시 부평구 부일로 16",
    toDetailAddress: "301동 802호",

    status: "OPEN",
    isActive: true,
  },
  {
    key: "customer2-confirmed-request",
    customerEmail: "customer2@test.com",
    moveType: "OFFICE",
    moveDateOffsetDays: 30,
    expiresInDays: 10,

    fromRegion: "서울",
    fromZipCode: "04524",
    fromAddress: "서울특별시 중구 세종대로 110",
    fromDetailAddress: "8층 801호",

    toRegion: "경기",
    toZipCode: "16508",
    toAddress: "경기도 수원시 영통구 광교중앙로 140",
    toDetailAddress: "12층 1203호",

    status: "CONFIRMED",
    isActive: false,
  },
  {
    key: "customer3-open-small-request",
    customerEmail: "customer3@test.com",
    moveType: "SMALL",
    moveDateOffsetDays: 14,
    expiresInDays: 5,

    fromRegion: "경기",
    fromZipCode: "13529",
    fromAddress: "경기도 성남시 분당구 판교역로 166",
    fromDetailAddress: "오피스텔 604호",

    toRegion: "서울",
    toZipCode: "04050",
    toAddress: "서울특별시 마포구 양화로 160",
    toDetailAddress: "원룸 302호",

    status: "OPEN",
    isActive: true,
  },
  {
    key: "customer1-pending-request",
    customerEmail: "customer1@test.com",
    moveType: "SMALL",
    moveDateOffsetDays: 18,
    expiresInDays: 7,

    fromRegion: "서울",
    fromZipCode: "07327",
    fromAddress: "서울특별시 영등포구 여의대로 108",
    fromDetailAddress: "1505호",

    toRegion: "서울",
    toZipCode: "03925",
    toAddress: "서울특별시 마포구 월드컵북로 396",
    toDetailAddress: "702호",

    status: "PENDING",
    isActive: true,
  },
  {
    key: "customer3-pending-office-request",
    customerEmail: "customer3@test.com",
    moveType: "OFFICE",
    moveDateOffsetDays: 25,
    expiresInDays: 9,

    fromRegion: "경기",
    fromZipCode: "13487",
    fromAddress: "경기도 성남시 분당구 대왕판교로 660",
    fromDetailAddress: "유스페이스1 A동 5층",

    toRegion: "서울",
    toZipCode: "06168",
    toAddress: "서울특별시 강남구 삼성로 511",
    toDetailAddress: "3층 301호",

    status: "PENDING",
    isActive: true,
  },
] as const;

const REVIEW_ESTIMATE_REQUESTS = toReviewEstimateRequests();

/** 기존 견적 요청 + 리뷰용 COMPLETED 요청 */
export const ESTIMATE_REQUESTS = [...BASE_ESTIMATE_REQUESTS, ...REVIEW_ESTIMATE_REQUESTS];

export type EstimateRequestSeedKey = (typeof ESTIMATE_REQUESTS)[number]["key"];
