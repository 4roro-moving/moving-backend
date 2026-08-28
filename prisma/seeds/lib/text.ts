/*
 * 한국어 텍스트 생성 풀
 *
 * 기존 시드는 리뷰 본문이 8종 고정이었다. 8만 건에 8종이면 검색/목록 UI
 * 테스트가 사실상 무의미해진다. 여기서는 조합으로 수천~수만 가지를 만든다.
 *
 * 닉네임은 MoverProfile.nickname 이 unique 라 충돌 회피가 필수다.
 * 기사 5,000명을 조합만으로 채우려면 풀 크기가 충분해야 한다.
 */

import { pick, randInt, type Rng } from "./rng.js";

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
  "전",
  "홍",
  "고",
  "문",
  "양",
  "손",
  "배",
  "백",
  "허",
  "유",
  "남",
] as const;

const GIVEN_NAMES = [
  "민준",
  "서연",
  "도윤",
  "지우",
  "예준",
  "하은",
  "시우",
  "지호",
  "수아",
  "지민",
  "준우",
  "서윤",
  "건우",
  "채원",
  "우진",
  "다은",
  "선우",
  "지아",
  "현우",
  "유진",
  "동현",
  "가은",
  "성민",
  "나윤",
  "재윤",
  "소율",
  "태윤",
  "예린",
  "지훈",
  "수빈",
  "은우",
  "서아",
  "민재",
  "하윤",
  "정우",
  "예은",
  "승현",
  "지안",
  "형준",
  "다연",
] as const;

export function makeName(rng: Rng): string {
  return `${pick(rng, FAMILY_NAMES)}${pick(rng, GIVEN_NAMES)}`;
}

/* ── 기사 닉네임 (unique 보장) ────────────────────────────────────────── */

const NICK_PREFIX = [
  "빠른",
  "안전",
  "친절",
  "믿음",
  "정직",
  "든든",
  "명품",
  "프로",
  "스마트",
  "행복",
  "일등",
  "최고",
  "청춘",
  "미소",
  "번개",
  "튼튼",
  "성실",
  "특급",
  "우리",
  "가족",
] as const;

const NICK_CORE = [
  "이사",
  "운송",
  "포장이사",
  "무빙",
  "이삿짐",
  "물류",
  "익스프레스",
  "카고",
  "트럭",
  "홈무빙",
] as const;

const NICK_SUFFIX = [
  "센터",
  "서비스",
  "컴퍼니",
  "파트너",
  "하우스",
  "그룹",
  "팀",
  "코리아",
  "월드",
  "프렌즈",
] as const;

/**
 * 결정적이고 유일한 닉네임을 만든다.
 *
 * 조합 수는 20 x 10 x 10 = 2,000 이라 기사 5,000명에는 모자란다.
 * 그래서 조합이 소진되면 지역명과 번호를 덧붙인다. index 기반이라
 * 같은 index 는 항상 같은 닉네임이 되고, 충돌은 구조적으로 발생하지 않는다.
 */
export function makeMoverNickname(index: number, regionName: string): string {
  const p = NICK_PREFIX[index % NICK_PREFIX.length]!;
  const c = NICK_CORE[Math.floor(index / NICK_PREFIX.length) % NICK_CORE.length]!;
  const s =
    NICK_SUFFIX[Math.floor(index / (NICK_PREFIX.length * NICK_CORE.length)) % NICK_SUFFIX.length]!;

  const cycle = Math.floor(index / (NICK_PREFIX.length * NICK_CORE.length * NICK_SUFFIX.length));

  return cycle === 0 ? `${p}${c}${s}` : `${regionName}${p}${c}${s}${cycle}`;
}

/* ── 전화번호 (unique) ────────────────────────────────────────────────── */

/** 전화번호는 User.phone 이 unique 라 index 로 완전히 결정한다. */
export function makePhone(globalIndex: number): string {
  const body = String(globalIndex % 100_000_000).padStart(8, "0");

  return `010-${body.slice(0, 4)}-${body.slice(4)}`;
}

/* ── 주소 ─────────────────────────────────────────────────────────────── */

const ROAD_NAMES: Record<string, readonly string[]> = {
  서울: ["테헤란로", "강남대로", "세종대로", "olympic로", "왕십리로", "양재천로"],
  경기: ["판교역로", "동탄대로", "일산로", "중앙로", "덕영대로", "경수대로"],
  인천: ["송도과학로", "인주대로", "미추홀대로", "청라대로"],
  부산: ["해운대로", "중앙대로", "센텀중앙로", "동래로"],
  대구: ["동대구로", "달구벌대로", "국채보상로"],
  광주: ["상무중앙로", "무등로", "필문대로"],
  대전: ["대덕대로", "계룡로", "둔산로"],
  울산: ["삼산로", "번영로", "화합로"],
  세종: ["한누리대로", "도움로"],
  강원: ["중앙로", "경춘로", "설악로"],
  충북: ["상당로", "직지대로", "청남로"],
  충남: ["번영로", "천안대로", "충무로"],
  전북: ["백제대로", "홍산로", "전주천동로"],
  전남: ["백양로", "영산로", "무안로"],
  경북: ["중앙대로", "포항로", "경대로"],
  경남: ["창원대로", "중앙대로", "진주대로"],
  제주: ["중앙로", "연북로", "일주동로"],
};

const BUILDING_TYPES = ["아파트", "빌라", "오피스텔", "주택", "타워"] as const;

export function makeAddress(rng: Rng, regionName: string): { address: string; zipCode: string } {
  const roads = ROAD_NAMES[regionName] ?? ["중앙로"];
  const road = pick(rng, roads);
  const number = randInt(rng, 1, 350);

  return {
    address: `${regionName} ${road} ${number}`,
    zipCode: String(randInt(rng, 1000, 63999)).padStart(5, "0"),
  };
}

export function makeDetailAddress(rng: Rng): string {
  const type = pick(rng, BUILDING_TYPES);
  const dong = randInt(rng, 101, 130);
  const ho = randInt(rng, 101, 2504);

  return `${type} ${dong}동 ${ho}호`;
}

/* ── 리뷰 본문 (조합 생성) ───────────────────────────────────────────── */

const REVIEW_OPENERS_GOOD = [
  "생각보다 훨씬 만족스러웠습니다.",
  "처음 이용해봤는데 정말 좋았어요.",
  "주변 추천으로 예약했는데 탁월한 선택이었습니다.",
  "여러 곳 비교하고 골랐는데 후회 없네요.",
  "재이용 의사 100%입니다.",
  "기대 이상이었어요.",
  "친구에게도 추천했습니다.",
  "이사 스트레스가 확 줄었어요.",
] as const;

const REVIEW_BODIES_GOOD = [
  "시간 약속을 정확히 지켜주셨고 진행도 빨랐습니다",
  "포장이 꼼꼼해서 파손된 물건이 하나도 없었어요",
  "짐이 많았는데도 체계적으로 정리해 주셨습니다",
  "가구 배치까지 세심하게 도와주셨어요",
  "견적 그대로 진행되어 추가 비용이 없었습니다",
  "무거운 짐도 능숙하게 다뤄주셔서 안심됐어요",
  "엘리베이터가 없는 건물이었는데 불평 한마디 없으셨습니다",
  "사전에 필요한 준비물을 미리 알려주셔서 편했어요",
  "비 오는 날이었는데 방수 처리까지 신경 써주셨습니다",
  "청소까지 깔끔하게 마무리해 주셨어요",
  "연락이 잘 되고 응대가 빨랐습니다",
  "아이 장난감까지 하나하나 챙겨주셨어요",
] as const;

const REVIEW_CLOSERS_GOOD = [
  "다음에도 꼭 부탁드릴게요.",
  "정말 감사합니다.",
  "믿고 맡길 수 있는 분이에요.",
  "고생 많으셨습니다.",
  "다른 분들께도 추천드립니다.",
  "덕분에 편하게 이사했습니다.",
] as const;

const REVIEW_OPENERS_MID = [
  "전반적으로는 괜찮았습니다.",
  "무난했어요.",
  "나쁘지 않았습니다.",
  "기본은 하시는 것 같아요.",
] as const;

const REVIEW_BODIES_MID = [
  "다만 예정 시간보다 조금 늦게 도착하셨어요",
  "작업은 잘 해주셨지만 소통이 조금 아쉬웠습니다",
  "포장은 괜찮았는데 마무리가 살짝 아쉬웠어요",
  "가격 대비 무난한 수준이었습니다",
  "설명이 조금 더 자세했으면 좋았을 것 같아요",
] as const;

const REVIEW_CLOSERS_MID = [
  "그래도 이사 자체는 문제없이 끝났습니다.",
  "다음엔 조금 더 신경 써주시면 좋겠어요.",
  "전체적으로는 만족합니다.",
] as const;

const REVIEW_OPENERS_BAD = [
  "아쉬운 점이 많았습니다.",
  "기대했던 것과 달랐어요.",
  "다시 이용할지는 고민되네요.",
] as const;

const REVIEW_BODIES_BAD = [
  "약속 시간보다 많이 늦으셨고 연락도 잘 안 됐습니다",
  "짐 일부가 파손되었는데 안내가 없었어요",
  "견적과 다른 추가 비용을 현장에서 요구하셨습니다",
  "포장이 부실해서 직접 다시 해야 했어요",
] as const;

const REVIEW_CLOSERS_BAD = [
  "개선되었으면 합니다.",
  "다음 고객분들은 미리 확인해보세요.",
  "소통만 좀 더 되었으면 좋았을 것 같습니다.",
] as const;

/** 평점에 어울리는 리뷰 본문을 만든다. 조합 수가 수천 가지가 된다. */
export function makeReviewContent(rng: Rng, rating: number): string {
  if (rating >= 4) {
    const bodyCount = rating === 5 ? 2 : 1;
    const bodies: string[] = [];

    for (let i = 0; i < bodyCount; i += 1) {
      const body = pick(rng, REVIEW_BODIES_GOOD);

      if (!bodies.includes(body)) {
        bodies.push(body);
      }
    }

    return `${pick(rng, REVIEW_OPENERS_GOOD)} ${bodies.join(", ")}. ${pick(rng, REVIEW_CLOSERS_GOOD)}`;
  }

  if (rating === 3) {
    return `${pick(rng, REVIEW_OPENERS_MID)} ${pick(rng, REVIEW_BODIES_MID)}. ${pick(rng, REVIEW_CLOSERS_MID)}`;
  }

  return `${pick(rng, REVIEW_OPENERS_BAD)} ${pick(rng, REVIEW_BODIES_BAD)}. ${pick(rng, REVIEW_CLOSERS_BAD)}`;
}

/* ── 견적 코멘트 (서비스 검증: 20~150자) ─────────────────────────────── */

const QUOTE_OPENERS = [
  "요청하신 일정 확인했습니다.",
  "견적 요청 감사합니다.",
  "안녕하세요, 문의 주셔서 감사합니다.",
  "일정과 주소 모두 확인했습니다.",
  "해당 구간 운행 경험이 많습니다.",
] as const;

const QUOTE_BODIES = [
  "포장부터 운반, 정리까지 꼼꼼하게 도와드리겠습니다",
  "경력을 살려 파손 없이 안전하게 진행하겠습니다",
  "합리적인 가격으로 신속하게 처리해드리겠습니다",
  "전문 인력과 장비로 빠르게 마무리하겠습니다",
  "사다리차 이용이 필요하면 별도 안내드리겠습니다",
  "귀중품은 별도 포장으로 따로 관리해드립니다",
  "당일 아침에 미리 연락드리고 출발하겠습니다",
  "요청하신 시간에 맞춰 정확히 도착하겠습니다",
] as const;

const QUOTE_CLOSERS = [
  "궁금한 점은 언제든 문의 주세요.",
  "채팅으로 세부 조율 가능합니다.",
  "많은 관심 부탁드립니다.",
  "좋은 결과로 보답하겠습니다.",
] as const;

/**
 * 견적 코멘트. 서비스 검증이 20~150자라 그 범위를 반드시 지킨다.
 * 초과하면 잘라내되 문장이 어색해지지 않도록 마침표로 끝맺는다.
 */
export function makeQuoteComment(rng: Rng): string {
  const text = `${pick(rng, QUOTE_OPENERS)} ${pick(rng, QUOTE_BODIES)}. ${pick(rng, QUOTE_CLOSERS)}`;

  if (text.length <= 150) {
    return text;
  }

  return `${text.slice(0, 147).trimEnd()}...`;
}

/* ── 기사 소개글 ─────────────────────────────────────────────────────── */

const SHORT_INTROS = [
  "빠르고 안전한 이사를 도와드립니다.",
  "고객 만족을 최우선으로 생각합니다.",
  "10년 경력의 노하우로 모십니다.",
  "친절과 정직으로 보답하겠습니다.",
  "소중한 짐, 내 짐처럼 옮기겠습니다.",
  "합리적인 가격, 확실한 서비스.",
  "이사의 시작부터 끝까지 함께합니다.",
  "약속한 시간, 약속한 가격을 지킵니다.",
] as const;

const DESC_PARTS = [
  "소형 이사와 가정 이사를 전문으로 하고 있습니다.",
  "사무실 이사 경험이 풍부하여 업무 공백을 최소화합니다.",
  "포장 자재는 모두 자사 제공이며 추가 비용이 없습니다.",
  "귀중품과 파손 위험이 있는 물품은 별도 관리합니다.",
  "이사 후 폐기물 처리까지 함께 도와드립니다.",
  "사다리차 및 특수 장비 보유하고 있습니다.",
  "여성 고객님을 위한 여성 작업자 배치도 가능합니다.",
  "반려동물 동반 이사 경험도 다수 있습니다.",
  "당일 이사, 야간 이사 문의도 환영합니다.",
  "고객님과의 약속을 무엇보다 중요하게 생각합니다.",
] as const;

export function makeShortIntro(rng: Rng): string {
  return pick(rng, SHORT_INTROS);
}

export function makeDescription(rng: Rng, career: number): string {
  const parts: string[] = [`경력 ${career}년차 이사 전문가입니다.`];
  const used = new Set<string>();
  const count = randInt(rng, 2, 4);

  while (used.size < count) {
    used.add(pick(rng, DESC_PARTS));
  }

  parts.push(...used);
  parts.push("언제든 편하게 연락 주세요.");

  return parts.join(" ");
}

/* ── 거주후기 ─────────────────────────────────────────────────────────── */

const RESIDENCE_TITLE_PREFIX = [
  "살아본 솔직 후기",
  "여기 어때요?",
  "1년 살아본 소감",
  "이사 오길 잘했어요",
  "장단점 정리해봤습니다",
  "실거주 후기",
] as const;

const RESIDENCE_GOOD = [
  "교통이 편리해서 출퇴근이 수월합니다",
  "주변에 마트와 병원이 가까워요",
  "공원이 있어서 산책하기 좋습니다",
  "학군이 괜찮은 편이에요",
  "조용하고 치안이 좋습니다",
  "카페와 식당이 다양해요",
] as const;

const RESIDENCE_BAD = [
  "다만 주차 공간이 부족한 편입니다",
  "주말에는 차가 많이 막혀요",
  "언덕이 있어서 걸어다니기는 조금 힘듭니다",
  "물가가 다소 높은 편이에요",
  "밤에 소음이 있는 구역도 있습니다",
] as const;

export function makeResidenceReview(
  rng: Rng,
  regionName: string,
  rating: number,
): { title: string; content: string } {
  const title = `${regionName} ${pick(rng, RESIDENCE_TITLE_PREFIX)}`;

  const good = pick(rng, RESIDENCE_GOOD);
  const bad = pick(rng, RESIDENCE_BAD);

  const content =
    rating >= 4
      ? `${regionName}에 거주 중입니다. ${good}. 또 ${pick(rng, RESIDENCE_GOOD)}. ${bad}. 전반적으로는 만족하며 지내고 있어요.`
      : rating === 3
        ? `${regionName} 거주 후기입니다. ${good}. ${bad}. 장단점이 뚜렷한 편이라 생활 패턴에 따라 다를 것 같아요.`
        : `${regionName}에서 지내본 후기입니다. ${bad}. ${pick(rng, RESIDENCE_BAD)}. 다음에는 다른 지역도 고려해볼 것 같습니다.`;

  return { title, content };
}

/* ── 나눔 ─────────────────────────────────────────────────────────────── */

export const GIVEAWAY_ITEM_SLUGS = {
  책상: "desk",
  의자: "chair",
  "3인용 소파": "sofa-3",
  "1인 소파": "sofa-1",
  책장: "bookshelf",
  행거: "hanger",
  서랍장: "dresser",
  화장대: "vanity",
  전자레인지: "microwave",
  밥솥: "rice-cooker",
  선풍기: "fan",
  공기청정기: "air-purifier",
  청소기: "vacuum",
  빨래건조대: "drying-rack",
  식탁: "dining-table",
  협탁: "side-table",
  "스탠드 조명": "lamp",
  러그: "rug",
  커튼: "curtain",
  화분: "plant",
  수납박스: "storage-box",
  자전거: "bicycle",
} as const;

export type GiveawayItemName = keyof typeof GIVEAWAY_ITEM_SLUGS;

export const GIVEAWAY_ITEMS = Object.keys(GIVEAWAY_ITEM_SLUGS) as GiveawayItemName[];

export const GIVEAWAY_IMAGE_VARIANT_COUNT = 3;

const GIVEAWAY_CONDITIONS = [
  "사용감 있지만 기능은 멀쩡합니다",
  "구매한 지 1년도 안 된 제품이에요",
  "이사하면서 자리가 안 나와 내놓습니다",
  "거의 새 제품입니다",
  "작은 흠집이 있지만 사용에 지장 없어요",
  "깨끗하게 사용했습니다",
] as const;

export function giveawaySourceKey(slug: string, variant: number): string {
  return `seed-src/giveaways/${slug}-${String(variant).padStart(2, "0")}.webp`;
}

export function makeGiveaway(
  rng: Rng,
  regionName: string,
): { item: GiveawayItemName; slug: string; title: string; description: string } {
  const item = pick(rng, GIVEAWAY_ITEMS);
  const condition = pick(rng, GIVEAWAY_CONDITIONS);

  return {
    item,
    slug: GIVEAWAY_ITEM_SLUGS[item],
    title: `${item} 무료 나눔합니다`,
    description: `${regionName}에서 ${item} 나눔합니다. ${condition}. 직접 가지러 오실 수 있는 분께 드리고 싶어요. 편하신 시간 말씀해 주시면 조율하겠습니다.`,
  };
}

const GIVEAWAY_REQUEST_MESSAGES = [
  "안녕하세요! 아직 나눔 가능한가요? 오늘 저녁에 방문 가능합니다.",
  "관심 있어서 연락드려요. 주말에 가지러 갈 수 있습니다.",
  "혹시 아직 있을까요? 차량 있어서 바로 픽업 가능해요.",
  "신청합니다! 편하신 시간 알려주시면 맞추겠습니다.",
  "필요했던 물건이라 반갑네요. 내일 방문 가능할까요?",
] as const;

export function makeGiveawayRequestMessage(rng: Rng): string {
  return pick(rng, GIVEAWAY_REQUEST_MESSAGES);
}

/* ── 채팅 ─────────────────────────────────────────────────────────────── */

const CHAT_CUSTOMER = [
  "안녕하세요, 견적 확인했습니다.",
  "혹시 당일 몇 시쯤 도착하실까요?",
  "짐이 조금 늘었는데 괜찮을까요?",
  "엘리베이터 사용 예약해두면 될까요?",
  "포장 자재는 따로 준비할 게 있나요?",
  "주차는 건물 앞에 가능합니다.",
  "냉장고랑 세탁기도 같이 옮겨주시나요?",
  "감사합니다, 그때 뵙겠습니다.",
] as const;

const CHAT_MOVER = [
  "안녕하세요, 문의 감사합니다.",
  "오전 9시까지 도착 예정입니다.",
  "네, 그 정도는 문제없습니다.",
  "엘리베이터 예약해주시면 훨씬 수월합니다.",
  "포장 자재는 저희가 전부 준비해 갑니다.",
  "확인했습니다, 주차 공간 감사합니다.",
  "가전 운반도 포함되어 있으니 걱정 마세요.",
  "네, 당일 아침에 다시 연락드리겠습니다.",
] as const;

export function makeChatMessage(rng: Rng, fromCustomer: boolean): string {
  return fromCustomer ? pick(rng, CHAT_CUSTOMER) : pick(rng, CHAT_MOVER);
}

/* ── 반려 사유 ───────────────────────────────────────────────────────── */

const REJECTION_REASONS = [
  "해당 날짜에 이미 예약이 확정되어 있습니다.",
  "요청하신 지역은 현재 서비스 범위를 벗어납니다.",
  "해당 이사 유형은 취급하지 않습니다.",
  "일정 조율이 어려워 부득이하게 반려합니다.",
  "차량 정비 일정과 겹쳐 진행이 어렵습니다.",
] as const;

export function makeRejectionReason(rng: Rng): string {
  return pick(rng, REJECTION_REASONS);
}
