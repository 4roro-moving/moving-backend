import type { Prisma, TermsType } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

import type { TermsAudienceRole } from "./terms.type";

/**
 * 상세 조회용 select. 본문(content)을 포함한다.
 */
const termsSelect = {
  id: true,
  type: true,
  version: true,
  status: true,
  title: true,
  content: true,
  isRequired: true,
  audience: true,
  effectiveAt: true,
  publishedAt: true,
  authorId: true,
  author: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.TermsSelect;

/**
 * 목록 조회용 select.
 * 약관 본문은 수천 자라 목록 응답에 실을 필요가 없어 제외한다.
 * (검색은 where 에서 content 를 보지만 응답에는 포함하지 않는다)
 */
const termsListSelect = {
  id: true,
  type: true,
  version: true,
  status: true,
  title: true,
  isRequired: true,
  audience: true,
  effectiveAt: true,
  publishedAt: true,
  authorId: true,
  author: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.TermsSelect;

const agreementSelect = {
  id: true,
  termsId: true,
  isAgreed: true,
  agreedAt: true,
  terms: {
    select: {
      id: true,
      type: true,
      version: true,
      title: true,
      isRequired: true,
      audience: true,
      status: true,
    },
  },
} satisfies Prisma.TermsAgreementSelect;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.TermsWhereInput;
};

export const termsRepository = {
  create(data: Prisma.TermsUncheckedCreateInput, db: DbClient = prisma) {
    return db.terms.create({
      data,
      select: termsSelect,
    });
  },

  findById(termsId: number, db: DbClient = prisma) {
    return db.terms.findUnique({
      where: { id: termsId },
      select: termsSelect,
    });
  },

  /**
   * 관리자 목록 조회 (페이지네이션).
   * 게시일(publishedAt) 우선 내림차순, 미게시(DRAFT, null)는 맨 뒤로 정렬한다.
   * 게시일이 같거나 없으면 생성일, 그다음 id 로 결정적으로 고정한다.
   * 삭제 제외(deletedAt=null)나 type/status 필터는 service 에서 where 로 넘긴다.
   */
  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [terms, totalCount] = await Promise.all([
      db.terms.findMany({
        where,
        select: termsListSelect,
        orderBy: [
          { publishedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip,
        take,
      }),
      db.terms.count({ where }),
    ]);

    return { terms, totalCount };
  },

  /**
   * 사용자 공개 목록 조회.
   * 각 유형의 현재 게시(PUBLISHED)된 약관만, 유형 순으로 반환한다.
   * (한 유형에 PUBLISHED 는 하나만 유지되므로 유형별 현재 약관 목록이 된다.)
   */
  findPublishedList(db: DbClient = prisma) {
    return db.terms.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      select: termsSelect,
      orderBy: [{ type: "asc" }],
    });
  },

  /**
   * 사용자 공개 상세 조회.
   * 특정 유형의 현재 게시(PUBLISHED)된 약관 하나를 반환한다.
   */
  findPublishedByType(type: TermsType, db: DbClient = prisma) {
    return db.terms.findFirst({
      where: { type, status: "PUBLISHED", deletedAt: null },
      select: termsSelect,
    });
  },

  /**
   * DRAFT 상태의 약관만 수정한다.
   * 상태 검증과 수정을 하나의 쿼리로 원자적으로 처리하기 위해 updateMany 를 사용하고,
   * 변경된 행 수(count)를 반환한다. count 가 0 이면 대상이 DRAFT 가 아니거나 삭제된 것이다.
   */
  async updateDraft(
    termsId: number,
    data: Prisma.TermsUncheckedUpdateManyInput,
    db: DbClient = prisma,
  ) {
    const { count } = await db.terms.updateMany({
      where: { id: termsId, status: "DRAFT", deletedAt: null },
      data,
    });

    return count;
  },

  /**
   * 같은 유형의 현재 게시(PUBLISHED)된 약관을 모두 보관(ARCHIVED) 처리한다.
   * 새 버전을 게시하기 직전에 호출해 "한 유형에 PUBLISHED 는 하나"를 보장한다.
   * publish 와 반드시 같은 트랜잭션에서 함께 호출해야 한다(service 담당).
   */
  archivePublishedByType(type: TermsType, db: DbClient = prisma) {
    return db.terms.updateMany({
      where: { type, status: "PUBLISHED", deletedAt: null },
      data: { status: "ARCHIVED" },
    });
  },

  /**
   * DRAFT 상태의 약관만 게시(PUBLISHED)한다. 게시 시각(publishedAt)을 함께 기록한다.
   * 상태 검증과 게시를 하나의 쿼리로 원자적으로 처리하기 위해 updateMany 를 사용하고,
   * 변경된 행 수(count)를 반환한다. count 가 0 이면 대상이 DRAFT 가 아니거나 삭제된 것이다.
   */
  async publishDraft(termsId: number, publishedAt: Date, db: DbClient = prisma) {
    const { count } = await db.terms.updateMany({
      where: { id: termsId, status: "DRAFT", deletedAt: null },
      data: { status: "PUBLISHED", publishedAt },
    });

    return count;
  },

  /**
   * DRAFT 상태의 약관만 soft delete 한다(deletedAt 기록).
   * 게시된 적 있는 약관은 이력 보존을 위해 삭제하지 않으며, 물리 삭제가 아닌 soft delete 로 기록을 남긴다.
   * 상태 검증과 삭제를 하나의 쿼리로 원자적으로 처리하기 위해 updateMany 를 사용하고 count 를 반환한다.
   */
  async softDeleteDraft(termsId: number, db: DbClient = prisma) {
    const { count } = await db.terms.updateMany({
      where: { id: termsId, status: "DRAFT", deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return count;
  },

  findRequiredPublished(role: TermsAudienceRole, db: DbClient = prisma) {
    return db.terms.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        isRequired: true,
        audience: { in: ["ALL", role] },
      },
      select: { id: true, type: true, version: true, title: true },
      orderBy: [{ type: "asc" }],
    });
  },

  /**
   * 해당 역할에게 노출할, 현재 게시된 약관 전체 (필수 + 선택).
   * 회원가입 동의 화면에서 무엇을 보여줄지 결정할 때 사용한다.
   */
  findPublishedForRole(role: TermsAudienceRole, db: DbClient = prisma) {
    return db.terms.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        audience: { in: ["ALL", role] },
      },
      select: termsSelect,
      orderBy: [{ type: "asc" }],
    });
  },

  /**
   * 전달받은 id 들 중 실제로 게시되어 있고 해당 역할에 해당하는 약관만 반환한다.
   * 클라이언트가 임의의 termsId 를 보내는 것을 막기 위한 검증용이다.
   */
  findPublishedByIds(termsIds: number[], role: TermsAudienceRole, db: DbClient = prisma) {
    return db.terms.findMany({
      where: {
        id: { in: termsIds },
        status: "PUBLISHED",
        deletedAt: null,
        audience: { in: ["ALL", role] },
      },
      select: { id: true, isRequired: true },
    });
  },

  /**
   * 동의 이력을 일괄 생성한다.
   *
   * 이력은 갱신하지 않고 계속 쌓는다. 마케팅 수신처럼 동의/철회를 반복하는
   * 항목의 시점별 기록이 남아야 하기 때문이다.
   */
  createAgreements(data: Prisma.TermsAgreementUncheckedCreateInput[], db: DbClient = prisma) {
    return db.termsAgreement.createMany({ data });
  },

  /**
   * 사용자의 동의 이력 전체를 최신순으로 조회한다.
   * 약관별 최신 상태 판별은 service 에서 처리한다.
   */
  findAgreementsByUserId(userId: string, db: DbClient = prisma) {
    return db.termsAgreement.findMany({
      where: { userId },
      select: agreementSelect,
      orderBy: [{ agreedAt: "desc" }, { id: "desc" }],
    });
  },
};
