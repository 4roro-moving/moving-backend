import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";

import { termsRepository } from "./terms.repository";
import type { CreateTermsInput, ListTermsQuery, UpdateTermsInput } from "./terms.type";

type CreateParams = {
  authorId: string;
  input: CreateTermsInput;
};

type UpdateParams = {
  termsId: number;
  input: UpdateTermsInput;
};

/** 같은 (type, version) 조합 중복 시 Prisma 가 던지는 unique 위반 에러인지 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * 약관을 조회하고, 없거나 삭제됐으면 404 를 던진다.
 * 수정/게시/삭제 전 공통으로 존재를 보장하는 헬퍼.
 */
async function findTermsOrThrow(termsId: number) {
  const terms = await termsRepository.findById(termsId);

  if (!terms || terms.deletedAt !== null) {
    throw new AppError("TERMS_NOT_FOUND");
  }

  return terms;
}

export const termsService = {
  /**
   * 약관을 생성합니다. (관리자)
   * 생성 시 상태는 항상 DRAFT 입니다. effectiveAt(문자열) 은 Date 로 변환합니다.
   * 같은 유형에 같은 버전이 있으면 409(TERMS_VERSION_DUPLICATED).
   */
  async createTerms({ authorId, input }: CreateParams) {
    const data: Prisma.TermsUncheckedCreateInput = {
      type: input.type,
      version: input.version,
      title: input.title,
      content: input.content,
      isRequired: input.isRequired,
      authorId,
    };

    if (input.effectiveAt !== undefined) {
      data.effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    }

    try {
      return await termsRepository.create(data);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("TERMS_VERSION_DUPLICATED");
      }

      throw error;
    }
  },

  /**
   * 관리자 약관 목록을 조회합니다. (모든 상태, 페이지네이션)
   * type/status 로 필터할 수 있고, 삭제된 약관은 제외합니다.
   */
  async getTermsList(query: ListTermsQuery) {
    const { page, limit, type, status } = query;

    const where: Prisma.TermsWhereInput = { deletedAt: null };

    if (type !== undefined) {
      where.type = type;
    }

    if (status !== undefined) {
      where.status = status;
    }

    const { terms, totalCount } = await termsRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
    });

    return {
      terms,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 관리자 약관 상세를 조회합니다.
   */
  getTermsById(termsId: number) {
    return findTermsOrThrow(termsId);
  },

  /**
   * 약관을 수정합니다. DRAFT 상태만 수정할 수 있습니다.
   * type/version 은 정체성이라 수정 대상에서 제외합니다.
   */
  async updateTerms({ termsId, input }: UpdateParams) {
    const terms = await findTermsOrThrow(termsId);

    if (terms.status !== "DRAFT") {
      throw new AppError("TERMS_NOT_EDITABLE");
    }

    const data: Prisma.TermsUncheckedUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
    }

    if (input.content !== undefined) {
      data.content = input.content;
    }

    if (input.isRequired !== undefined) {
      data.isRequired = input.isRequired;
    }

    if (input.effectiveAt !== undefined) {
      data.effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    }

    return termsRepository.update(termsId, data);
  },

  /**
   * 약관을 게시합니다. DRAFT 상태만 게시할 수 있습니다.
   * 같은 유형의 기존 PUBLISHED 를 ARCHIVED 로 내리고(원자적), 대상을 PUBLISHED 로 올립니다.
   */
  async publishTerms(termsId: number) {
    const terms = await findTermsOrThrow(termsId);

    if (terms.status !== "DRAFT") {
      throw new AppError("TERMS_NOT_PUBLISHABLE");
    }

    const now = new Date();

    return runTransaction(async (tx) => {
      // 같은 유형의 현재 PUBLISHED 를 ARCHIVED 로 (한 유형에 PUBLISHED 하나 보장)
      await termsRepository.archivePublishedByType(terms.type, tx);

      // 대상을 PUBLISHED 로 게시
      return termsRepository.publish(termsId, now, tx);
    });
  },

  /**
   * 약관을 삭제합니다. DRAFT(미게시 초안)만 삭제할 수 있습니다.
   * 게시된 적 있는 약관(PUBLISHED/ARCHIVED)은 이력 보존을 위해 삭제를 막습니다.
   */
  async deleteTerms(termsId: number) {
    const terms = await findTermsOrThrow(termsId);

    if (terms.status !== "DRAFT") {
      throw new AppError("TERMS_NOT_DELETABLE");
    }

    await termsRepository.softDelete(termsId);
  },

  /**
   * 사용자 공개 약관 목록을 조회합니다. (유형별 현재 게시본)
   */
  getPublishedList() {
    return termsRepository.findPublishedList();
  },

  /**
   * 사용자 공개 약관 상세를 조회합니다. (특정 유형의 현재 게시본)
   * 게시된 약관이 없으면 404.
   */
  async getPublishedByType(type: CreateTermsInput["type"]) {
    const terms = await termsRepository.findPublishedByType(type);

    if (!terms) {
      throw new AppError("TERMS_NOT_FOUND");
    }

    return terms;
  },
};
