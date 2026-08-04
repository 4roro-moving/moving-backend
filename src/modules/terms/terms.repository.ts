import type { Prisma, TermsType } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

/**
 * 약관 조회에 공통으로 사용하는 select.
 */
const termsSelect = {
  id: true,
  type: true,
  version: true,
  status: true,
  title: true,
  content: true,
  isRequired: true,
  effectiveAt: true,
  publishedAt: true,
  authorId: true,
  author: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.TermsSelect;

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
        select: termsSelect,
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

  update(termsId: number, data: Prisma.TermsUncheckedUpdateInput, db: DbClient = prisma) {
    return db.terms.update({
      where: { id: termsId },
      data,
      select: termsSelect,
    });
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
   * 대상 약관을 게시(PUBLISHED)한다. 게시 시각(publishedAt)을 함께 기록한다.
   */
  publish(termsId: number, publishedAt: Date, db: DbClient = prisma) {
    return db.terms.update({
      where: { id: termsId },
      data: { status: "PUBLISHED", publishedAt },
      select: termsSelect,
    });
  },

  /**
   * 약관 삭제. DRAFT(미게시 초안)만 삭제하므로 물리 삭제한다.
   * (게시 이력이 없는 초안이라 보존 가치가 없다. 삭제 가능 여부는 service 에서 검증)
   */
  softDelete(termsId: number, db: DbClient = prisma) {
    return db.terms.update({
      where: { id: termsId },
      data: { deletedAt: new Date() },
      select: termsSelect,
    });
  },
};
