/*
 * 약관 + 동의 이력
 * ============================================================================
 *
 *  기존 시드는 Terms(약관 본문)만 만들고 TermsAgreement(동의 이력)는
 *  한 건도 만들지 않았다. 그래서 전 계정이 "약관에 동의한 적 없는 사용자"였다.
 *  회원가입 API 가 agreements 를 받는 구조이므로 이건 명백한 정합성 결손이다.
 *
 *  ── 규칙 ───────────────────────────────────────────────────────────────
 *   · type + version 조합은 unique
 *   · type 당 PUBLISHED 는 하나만 (구버전은 ARCHIVED)
 *   · audience 에 맞는 사용자만 동의 이력을 갖는다
 *   · 필수 약관은 전원 isAgreed=true
 *   · 선택 약관(마케팅)은 거부(false)도 기록 — "묻고 거절했음"을 남기기 위해
 *   · 동의 시각은 가입 시각과 같거나 직후
 * ============================================================================
 */

import { deriveRng, chance, randInt } from "../lib/rng.js";
import type { SeedUser } from "./users.js";

type TermsType =
  "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "MARKETING_POLICY" | "LOCATION_POLICY" | "MOVER_POLICY";

type TermsAudience = "ALL" | "CUSTOMER" | "MOVER";

interface TermsSpec {
  type: TermsType;
  title: string;
  audience: TermsAudience;
  isRequired: boolean;
  /** 과거 버전 수 (ARCHIVED 로 들어간다) */
  archivedVersions: number;
}

const TERMS_SPECS: TermsSpec[] = [
  {
    type: "TERMS_OF_SERVICE",
    title: "서비스 이용약관",
    audience: "ALL",
    isRequired: true,
    archivedVersions: 2,
  },
  {
    type: "PRIVACY_POLICY",
    title: "개인정보 처리방침",
    audience: "ALL",
    isRequired: true,
    archivedVersions: 2,
  },
  {
    type: "LOCATION_POLICY",
    title: "위치정보 이용약관",
    audience: "ALL",
    isRequired: true,
    archivedVersions: 1,
  },
  {
    type: "MARKETING_POLICY",
    title: "마케팅 정보 수신 동의",
    audience: "ALL",
    isRequired: false,
    archivedVersions: 1,
  },
  {
    type: "MOVER_POLICY",
    title: "기사님 이용 정책",
    audience: "MOVER",
    isRequired: true,
    archivedVersions: 1,
  },
];

function buildContent(title: string, version: string): string {
  return [
    `제1조 (목적)`,
    `본 ${title}(버전 ${version})은 무빙 서비스의 이용 조건 및 절차, 이용자와 회사의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.`,
    ``,
    `제2조 (정의)`,
    `1. "서비스"란 회사가 제공하는 이사 견적 비교 및 중개 서비스를 말합니다.`,
    `2. "이용자"란 본 약관에 따라 서비스를 이용하는 회원을 말합니다.`,
    `3. "기사님"이란 서비스를 통해 견적을 제출하고 이사 용역을 제공하는 회원을 말합니다.`,
    ``,
    `제3조 (약관의 효력 및 변경)`,
    `본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자와 개정 사유를 명시하여 사전에 공지합니다.`,
    ``,
    `제4조 (이용계약의 성립)`,
    `이용계약은 이용자가 본 약관에 동의하고 회원가입을 신청한 후 회사가 이를 승낙함으로써 성립합니다.`,
    ``,
    `부칙`,
    `본 약관은 게시일부터 시행합니다.`,
  ].join("\n");
}

export interface TermsResult {
  rows: {
    terms: unknown[];
    termsAgreements: unknown[];
  };
  /** 현재 게시 중인 약관 (알림·검증용) */
  publishedTermsIds: number[];
}

export function generateTerms(admins: SeedUser[], members: SeedUser[], now: Date): TermsResult {
  const rng = deriveRng(20260820, "terms");

  const terms: unknown[] = [];
  const termsAgreements: unknown[] = [];
  const publishedTermsIds: number[] = [];

  /** audience → 현재 게시 중인 약관 목록 */
  const publishedByAudience = new Map<
    TermsAudience,
    { id: number; isRequired: boolean; publishedAt: Date }[]
  >();

  let termsId = 1;
  let agreementId = 1;

  for (const spec of TERMS_SPECS) {
    const author = admins[randInt(rng, 0, admins.length - 1)]!;

    // 과거 버전 (ARCHIVED)
    for (let v = 1; v <= spec.archivedVersions; v += 1) {
      const version = `${v}.0`;
      const publishedAt = new Date(
        now.getTime() - (spec.archivedVersions - v + 2) * 180 * 86_400_000,
      );

      terms.push({
        id: termsId,
        type: spec.type,
        version,
        status: "ARCHIVED",
        title: `${spec.title} (v${version})`,
        content: buildContent(spec.title, version),
        isRequired: spec.isRequired,
        audience: spec.audience,
        effectiveAt: publishedAt,
        publishedAt,
        authorId: author.id,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        deletedAt: null,
      });
      termsId += 1;
    }

    // 현재 버전 (PUBLISHED)
    const currentVersion = `${spec.archivedVersions + 1}.0`;
    const publishedAt = new Date(now.getTime() - 120 * 86_400_000);

    terms.push({
      id: termsId,
      type: spec.type,
      version: currentVersion,
      status: "PUBLISHED",
      title: `${spec.title} (v${currentVersion})`,
      content: buildContent(spec.title, currentVersion),
      isRequired: spec.isRequired,
      audience: spec.audience,
      effectiveAt: publishedAt,
      publishedAt,
      authorId: author.id,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      deletedAt: null,
    });

    publishedTermsIds.push(termsId);

    const list = publishedByAudience.get(spec.audience) ?? [];
    list.push({ id: termsId, isRequired: spec.isRequired, publishedAt });
    publishedByAudience.set(spec.audience, list);

    termsId += 1;

    // 다음 버전 초안 (DRAFT) — 관리자 화면 검증용
    if (spec.type === "TERMS_OF_SERVICE") {
      const draftVersion = `${spec.archivedVersions + 2}.0`;

      terms.push({
        id: termsId,
        type: spec.type,
        version: draftVersion,
        status: "DRAFT",
        title: `${spec.title} (v${draftVersion} 초안)`,
        content: buildContent(spec.title, draftVersion),
        isRequired: spec.isRequired,
        audience: spec.audience,
        effectiveAt: null,
        publishedAt: null,
        authorId: author.id,
        createdAt: new Date(now.getTime() - 10 * 86_400_000),
        updatedAt: new Date(now.getTime() - 3 * 86_400_000),
        deletedAt: null,
      });
      termsId += 1;
    }
  }

  /* ── 동의 이력 ─────────────────────────────────────────────────────── */

  const allAudience = publishedByAudience.get("ALL") ?? [];

  for (const member of members) {
    const roleAudience =
      member.role === "MOVER"
        ? (publishedByAudience.get("MOVER") ?? [])
        : (publishedByAudience.get("CUSTOMER") ?? []);

    for (const item of [...allAudience, ...roleAudience]) {
      /*
       * 약관 게시일보다 먼저 가입한 사용자는 게시일 이후에 재동의했다고 본다.
       * 반대로 나중에 가입했으면 가입 시점에 동의한 것.
       */
      const base =
        member.createdAt.getTime() > item.publishedAt.getTime()
          ? member.createdAt
          : item.publishedAt;

      const agreedAt = new Date(
        Math.min(now.getTime(), base.getTime() + randInt(rng, 0, 300) * 1_000),
      );

      /*
       * 필수 약관은 전원 동의(안 하면 가입 자체가 안 됨).
       * 선택 약관은 약 62% 만 동의하고, 나머지는 거부 이력을 남긴다.
       */
      const isAgreed = item.isRequired ? true : chance(rng, 0.62);

      termsAgreements.push({
        id: agreementId,
        userId: member.id,
        termsId: item.id,
        isAgreed,
        agreedAt,
      });
      agreementId += 1;

      /*
       * 마케팅 동의는 나중에 철회하는 사람이 있다.
       * 같은 (user, terms) 조합에 여러 행이 쌓이는 것이 정상 — unique 제약이 없다.
       */
      if (!item.isRequired && isAgreed && chance(rng, 0.08)) {
        termsAgreements.push({
          id: agreementId,
          userId: member.id,
          termsId: item.id,
          isAgreed: false,
          agreedAt: new Date(
            Math.min(now.getTime(), agreedAt.getTime() + randInt(rng, 30, 300) * 86_400_000),
          ),
        });
        agreementId += 1;
      }
    }
  }

  return {
    rows: { terms, termsAgreements },
    publishedTermsIds,
  };
}
