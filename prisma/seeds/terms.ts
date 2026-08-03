/*
 * 약관 시드 데이터.
 *
 * 각 유형별로 최소 한 개의 PUBLISHED(현재 유효) 버전을 두고,
 * 일부 유형은 버전 관리를 보여주기 위해 ARCHIVED(구버전)/DRAFT(작성 중)도 포함합니다.
 *
 * effectiveAt / publishedAt 은 시딩 시점 기준으로 계산합니다(오프셋 일수).
 */
export const TERMS_SEEDS = [
  // 서비스 이용약관 - 구버전(보관) + 현재 버전
  {
    type: "TERMS_OF_SERVICE" as const,
    version: "1.0",
    status: "ARCHIVED" as const,
    title: "서비스 이용약관 (v1.0)",
    content:
      "제1조(목적) 본 약관은 무빙 서비스의 이용 조건 및 절차에 관한 사항을 규정합니다. 본 버전은 구버전으로 효력이 종료되었습니다.",
    isRequired: true,
    effectiveOffsetDays: -180,
    publishedOffsetDays: -190,
  },
  {
    type: "TERMS_OF_SERVICE" as const,
    version: "2.0",
    status: "PUBLISHED" as const,
    title: "서비스 이용약관 (v2.0)",
    content:
      "제1조(목적) 본 약관은 무빙 서비스의 이용 조건 및 절차, 회원과 회사의 권리·의무 및 책임사항을 규정함을 목적으로 합니다. 제2조(정의) ...",
    isRequired: true,
    effectiveOffsetDays: -10,
    publishedOffsetDays: -20,
  },

  // 개인정보 처리방침 - 현재 버전
  {
    type: "PRIVACY_POLICY" as const,
    version: "1.0",
    status: "PUBLISHED" as const,
    title: "개인정보 처리방침 (v1.0)",
    content:
      "무빙은 이용자의 개인정보를 중요시하며, 개인정보 보호법 등 관련 법령을 준수합니다. 수집하는 개인정보 항목, 이용 목적, 보유 기간은 다음과 같습니다. ...",
    isRequired: true,
    effectiveOffsetDays: -10,
    publishedOffsetDays: -20,
  },

  // 위치정보 이용약관 - 현재 버전
  {
    type: "LOCATION_POLICY" as const,
    version: "1.0",
    status: "PUBLISHED" as const,
    title: "위치정보 이용약관 (v1.0)",
    content:
      "본 약관은 무빙이 제공하는 위치기반 서비스에 대하여 회사와 이용자의 권리·의무 및 책임사항을 규정합니다. ...",
    isRequired: true,
    effectiveOffsetDays: -10,
    publishedOffsetDays: -20,
  },

  // 기사님 이용 정책 - 현재 버전
  {
    type: "MOVER_POLICY" as const,
    version: "1.0",
    status: "PUBLISHED" as const,
    title: "기사님 이용 정책 (v1.0)",
    content:
      "본 정책은 무빙에 등록한 기사 회원의 서비스 이용 기준, 견적 제출 및 이행 의무, 제재 기준 등을 규정합니다. ...",
    isRequired: true,
    effectiveOffsetDays: -10,
    publishedOffsetDays: -20,
  },

  // 마케팅 정보 수신 동의 - 선택 동의, 현재 버전
  {
    type: "MARKETING_POLICY" as const,
    version: "1.0",
    status: "PUBLISHED" as const,
    title: "마케팅 정보 수신 동의 (v1.0)",
    content:
      "무빙은 이용자에게 이벤트, 혜택, 신규 서비스 등 마케팅 정보를 전송할 수 있습니다. 본 동의는 선택 사항이며 동의하지 않아도 서비스 이용에 제한이 없습니다. ...",
    isRequired: false,
    effectiveOffsetDays: -10,
    publishedOffsetDays: -20,
  },

  // 다음 개정 예정본 - 작성 중(미게시)
  {
    type: "PRIVACY_POLICY" as const,
    version: "2.0",
    status: "DRAFT" as const,
    title: "개인정보 처리방침 (v2.0, 개정 예정)",
    content:
      "개정 예정 초안입니다. 수집 항목 및 보유 기간 관련 조항을 개정할 예정입니다. 아직 게시되지 않았습니다.",
    isRequired: true,
    effectiveOffsetDays: null,
    publishedOffsetDays: null,
  },
];
