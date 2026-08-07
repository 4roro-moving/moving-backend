/*
 * 고객 시드 데이터
 *
 * 기존 8명(customer1~8)의 특수 케이스는 그대로 유지하고,
 * 그 뒤로 100명이 될 때까지 자동 생성해 채웁니다.
 *
 * ⚠️ email 은 zero-padding(3자리) 형식입니다: customer001@test.com
 *    seedAdminContents 등에서 `orderBy email asc` 로 조회 후 인덱스로
 *    참조하는 코드가 있어, 문자열 정렬 == 번호 정렬이 되도록 맞췄습니다.
 *    (padding 이 없으면 customer1, customer10, customer100 ... 순으로 꼬임)
 */

export const CUSTOMER_COUNT = 100;

/** 3자리 zero-padding 번호. 1 → "001" */
export function customerNo(index: number): string {
  return String(index).padStart(3, "0");
}

export function customerEmail(index: number): string {
  return `customer${customerNo(index)}@test.com`;
}

interface CustomerSeed {
  email: string;
  name: string;
  phone: string;
}

/*
 * 이름 생성용 성/이름 풀.
 * 조합으로 다양한 한글 이름을 만들되 시드 실행마다 동일하도록
 * index 기반 결정적(deterministic) 방식으로 뽑습니다.
 */
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
  "민준",
  "서연",
  "도윤",
  "지우",
  "예준",
  "하윤",
  "주원",
  "지호",
  "지민",
  "수아",
  "건우",
  "다은",
  "우진",
  "지아",
  "현우",
  "은서",
  "선우",
  "채원",
  "유준",
  "서윤",
] as const;

function buildCustomerName(index: number): string {
  const family = FAMILY_NAMES[(index - 1) % FAMILY_NAMES.length]!;
  const given = GIVEN_NAMES[Math.floor((index - 1) / FAMILY_NAMES.length) % GIVEN_NAMES.length]!;

  return `${family}${given}`;
}

function buildCustomerPhone(index: number): string {
  // 010-1000-0001 형식 유지, 뒤 4자리에 번호를 매핑
  return `010-1000-${String(index).padStart(4, "0")}`;
}

/*
 * 기존 1~8번 고객의 이름만 원래 값으로 고정합니다.
 * (customer3 정지 등 시나리오 문서/스크린샷과의 정합성 유지)
 */
const LEGACY_NAMES: Record<number, string> = {
  1: "김고객",
  2: "이고객",
  3: "박고객",
  4: "최고객",
  5: "정고객",
  6: "강고객",
  7: "조고객",
  8: "윤고객",
};

function buildCustomers(): readonly CustomerSeed[] {
  const list: CustomerSeed[] = [];

  for (let index = 1; index <= CUSTOMER_COUNT; index += 1) {
    list.push({
      email: customerEmail(index),
      name: LEGACY_NAMES[index] ?? buildCustomerName(index),
      phone: buildCustomerPhone(index),
    });
  }

  return list;
}

export const CUSTOMERS = buildCustomers();
