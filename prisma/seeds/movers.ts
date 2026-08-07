/*
 * 기사님 시드 데이터
 *
 * 기존 8명(mover1~8)의 특수 케이스(경력/지역/승인상태 등)는 그대로 유지하고,
 * 9~100번은 자동 생성합니다.
 *
 * ⚠️ email 은 zero-padding(3자리): mover001@test.com
 *    (customers.ts 와 동일한 이유 — orderBy email asc 정합성)
 *
 * ⚠️ nickname / businessNumber 는 스키마상 unique 이므로 중복 없이 생성합니다.
 */

export const MOVER_COUNT = 100;

export function moverNo(index: number): string {
  return String(index).padStart(3, "0");
}

export function moverEmail(index: number): string {
  return `mover${moverNo(index)}@test.com`;
}

export type MoverMoveType = "SMALL" | "HOME" | "OFFICE";
export type MoverApprovalStatus = "APPROVED" | "PENDING" | "REJECTED";

export interface MoverSeed {
  email: string;
  name: string;
  phone: string;
  nickname: string;
  career: number;
  shortIntro: string;
  description: string;
  confirmedCount: number;
  averageRating: number;
  reviewCount: number;
  regions: readonly string[];
  moveTypes: readonly MoverMoveType[];
  businessNumber: string;
  businessName: string;
  approvalStatus: MoverApprovalStatus;
  rejectReason?: string;
}

/*
 * 기존 1~8번 기사님 — 원본 데이터 그대로 유지.
 * (mover7 REJECTED, mover8 PENDING 등 승인 시나리오 보존)
 */
const LEGACY_MOVERS: readonly MoverSeed[] = [
  {
    email: moverEmail(1),
    name: "김민수",
    phone: "010-2000-0001",
    nickname: "빠른이사",
    career: 3,
    shortIntro: "빠르고 안전한 이사를 도와드립니다.",
    description:
      "소형 이사와 가정 이사를 전문으로 합니다. 고객님의 소중한 물건을 안전하고 신속하게 운반하겠습니다.",
    confirmedCount: 18,
    averageRating: 0,
    reviewCount: 0,
    regions: ["서울", "경기", "인천"],
    moveTypes: ["SMALL", "HOME"],
    businessNumber: "101-45-67891",
    businessName: "테스트이사1",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(2),
    name: "이서준",
    phone: "010-2000-0002",
    nickname: "든든이사",
    career: 7,
    shortIntro: "든든하고 꼼꼼한 이사 서비스를 제공합니다.",
    description: "다년간의 경험을 바탕으로 포장부터 운반까지 꼼꼼하게 진행합니다.",
    confirmedCount: 42,
    averageRating: 0,
    reviewCount: 0,
    regions: ["서울", "경기"],
    moveTypes: ["HOME", "OFFICE"],
    businessNumber: "102-45-67892",
    businessName: "테스트이사2",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(3),
    name: "박지훈",
    phone: "010-2000-0003",
    nickname: "행복이사",
    career: 12,
    shortIntro: "새로운 시작을 행복하게 만들어드립니다.",
    description: "풍부한 현장 경험을 바탕으로 고객 상황에 맞는 이사 서비스를 제공합니다.",
    confirmedCount: 86,
    averageRating: 0,
    reviewCount: 0,
    regions: ["부산", "울산", "경남"],
    moveTypes: ["SMALL", "HOME", "OFFICE"],
    businessNumber: "103-45-67893",
    businessName: "테스트이사3",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(4),
    name: "최도윤",
    phone: "010-2000-0004",
    nickname: "친절이사",
    career: 5,
    shortIntro: "친절한 상담과 정직한 견적을 약속드립니다.",
    description: "고객과 충분히 소통하고 필요한 서비스만 정직하게 안내합니다.",
    confirmedCount: 29,
    averageRating: 0,
    reviewCount: 0,
    regions: ["대전", "세종", "충남", "충북"],
    moveTypes: ["SMALL", "HOME"],
    businessNumber: "104-45-67894",
    businessName: "테스트이사4",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(5),
    name: "정현우",
    phone: "010-2000-0005",
    nickname: "베테랑이사",
    career: 18,
    shortIntro: "18년 경력의 베테랑 기사입니다.",
    description: "가정 이사부터 대규모 사무실 이사까지 다양한 경험을 보유하고 있습니다.",
    confirmedCount: 154,
    averageRating: 0,
    reviewCount: 0,
    regions: ["대구", "경북", "경남"],
    moveTypes: ["HOME", "OFFICE"],
    businessNumber: "105-45-67895",
    businessName: "테스트이사5",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(6),
    name: "강우진",
    phone: "010-2000-0006",
    nickname: "안심이사",
    career: 9,
    shortIntro: "고객이 안심할 수 있는 이사를 진행합니다.",
    description: "포장과 운반 과정에서 파손이 발생하지 않도록 꼼꼼하게 작업합니다.",
    confirmedCount: 63,
    averageRating: 0,
    reviewCount: 0,
    regions: ["광주", "전남", "전북"],
    moveTypes: ["SMALL", "HOME", "OFFICE"],
    businessNumber: "106-45-67896",
    businessName: "테스트이사6",
    approvalStatus: "APPROVED",
  },
  {
    email: moverEmail(7),
    name: "조성민",
    phone: "010-2000-0007",
    nickname: "깔끔이사",
    career: 4,
    shortIntro: "처음부터 마무리까지 깔끔하게 진행합니다.",
    description: "원룸과 소형 이사를 중심으로 신속하고 깔끔한 서비스를 제공합니다.",
    confirmedCount: 24,
    averageRating: 0,
    reviewCount: 0,
    regions: ["강원", "경기", "서울"],
    moveTypes: ["SMALL", "HOME"],
    businessNumber: "107-45-67897",
    businessName: "테스트이사7",
    approvalStatus: "REJECTED",
    rejectReason: "사업자등록증 이미지가 흐릿하여 확인이 어렵습니다. 재제출 부탁드립니다.",
  },
  {
    email: moverEmail(8),
    name: "윤재현",
    phone: "010-2000-0008",
    nickname: "제주이사",
    career: 10,
    shortIntro: "제주 지역 전문 이사 기사입니다.",
    description: "제주 지역의 이동 환경을 이해하고 안전한 이사 서비스를 제공합니다.",
    confirmedCount: 71,
    averageRating: 0,
    reviewCount: 0,
    regions: ["제주"],
    moveTypes: ["SMALL", "HOME"],
    businessNumber: "108-45-67898",
    businessName: "테스트이사8",
    approvalStatus: "PENDING",
  },
];

/* --- 9~100번 자동 생성용 풀 --- */

const FAMILY_NAMES = [
  "김",
  "이",
  "박",
  "최",
  "정",
  "강",
  "조",
  "윤",
  "장",
  "임",
  "한",
  "오",
  "서",
  "신",
  "권",
  "황",
  "안",
  "송",
  "류",
  "홍",
] as const;

const GIVEN_NAMES = [
  "준호",
  "성훈",
  "동현",
  "재원",
  "태양",
  "민재",
  "승우",
  "형준",
  "지환",
  "현수",
  "경민",
  "상현",
  "정우",
  "예성",
  "우빈",
  "시우",
  "하준",
  "도현",
  "규민",
  "찬영",
] as const;

const NICKNAME_ADJ = [
  "믿음",
  "번개",
  "튼튼",
  "신속",
  "정직",
  "명품",
  "프로",
  "스마트",
  "든든",
  "포근",
  "성실",
  "센스",
  "특급",
  "차분",
  "활기",
  "야무진",
  "꼼꼼",
  "우직",
  "미소",
  "한결",
] as const;

// 전 지역 그룹(권역별로 인접 지역을 묶어 현실적인 서비스 영역 구성)
const REGION_GROUPS: readonly (readonly string[])[] = [
  ["서울", "경기", "인천"],
  ["부산", "울산", "경남"],
  ["대구", "경북"],
  ["대전", "세종", "충남", "충북"],
  ["광주", "전남", "전북"],
  ["강원", "경기"],
  ["제주"],
  ["서울", "경기", "강원"],
  ["경남", "경북", "대구"],
  ["충남", "충북", "대전", "세종"],
] as const;

const MOVE_TYPE_SETS: readonly (readonly MoverMoveType[])[] = [
  ["SMALL", "HOME"],
  ["HOME", "OFFICE"],
  ["SMALL", "HOME", "OFFICE"],
  ["SMALL"],
  ["HOME"],
] as const;

function buildMoverName(index: number): string {
  const family = FAMILY_NAMES[(index - 1) % FAMILY_NAMES.length]!;
  const given = GIVEN_NAMES[Math.floor((index - 1) / FAMILY_NAMES.length) % GIVEN_NAMES.length]!;

  return `${family}${given}`;
}

function buildBusinessNumber(index: number): string {
  // 3-2-5 자리 형식. 앞 3자리를 index로 분산해 중복 방지
  const head = String(100 + index).padStart(3, "0");
  const tail = String(60000 + index).padStart(5, "0");

  return `${head}-45-${tail}`;
}

function buildGeneratedMover(index: number): MoverSeed {
  const career = ((index * 7) % 20) + 1; // 1~20년
  const confirmedCount = (index * 13) % 200; // 0~199건
  const regions = REGION_GROUPS[index % REGION_GROUPS.length]!;
  const moveTypes = MOVE_TYPE_SETS[index % MOVE_TYPE_SETS.length]!;
  const nickname = `${NICKNAME_ADJ[index % NICKNAME_ADJ.length]!}이사${moverNo(index)}`;

  return {
    email: moverEmail(index),
    name: buildMoverName(index),
    phone: `010-2000-${String(index).padStart(4, "0")}`,
    nickname,
    career,
    shortIntro: "안전하고 신뢰할 수 있는 이사 서비스를 제공합니다.",
    description:
      "고객님의 소중한 짐을 내 것처럼 여기고, 포장부터 운반, 정리까지 책임감 있게 진행합니다.",
    confirmedCount,
    averageRating: 0,
    reviewCount: 0,
    regions,
    moveTypes,
    businessNumber: buildBusinessNumber(index),
    businessName: `테스트이사${index}`,
    approvalStatus: "APPROVED",
  };
}

function buildMovers(): readonly MoverSeed[] {
  const list: MoverSeed[] = [...LEGACY_MOVERS];

  for (let index = LEGACY_MOVERS.length + 1; index <= MOVER_COUNT; index += 1) {
    list.push(buildGeneratedMover(index));
  }

  return list;
}

export const MOVERS = buildMovers();
