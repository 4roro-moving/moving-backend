/*
 * 관리자 시드 데이터
 * 참고: adminContents/terms 는 adminIds[0](= admin1) 만 사용하므로
 *       추가 관리자 순서/이메일 형식은 자유롭습니다.
 */

interface AdminSeed {
  email: string;
  name: string;
  phone: string;
}

const LEGACY_ADMINS: readonly AdminSeed[] = [
  {
    email: "admin1@test.com",
    name: "관리자",
    phone: "010-9000-0001",
  },
  {
    email: "admin2@test.com",
    name: "무빙관리자",
    phone: "010-1111-1111",
  },
];

const ADMIN_NAMES = [
  "김관리",
  "이관리",
  "박관리",
  "최관리",
  "정관리",
  "강관리",
  "조관리",
  "윤관리",
] as const;

function buildAdmins(): AdminSeed[] {
  const list: AdminSeed[] = [...LEGACY_ADMINS];

  for (let index = LEGACY_ADMINS.length + 1; index <= 10; index += 1) {
    const nameIndex = index - LEGACY_ADMINS.length - 1;

    list.push({
      email: `admin${index}@test.com`,
      name: ADMIN_NAMES[nameIndex] ?? `관리자${index}`,
      phone: `010-9000-${String(index).padStart(4, "0")}`,
    });
  }

  return list;
}

export const ADMINS = buildAdmins();
