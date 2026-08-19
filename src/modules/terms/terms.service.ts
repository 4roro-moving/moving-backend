import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";

import { termsRepository } from "./terms.repository";
import type {
  CreateTermsInput,
  ListTermsQuery,
  TermsAgreementInput,
  TermsAudienceRole,
  UpdateTermsInput,
} from "./terms.type";

type CreateParams = {
  authorId: string;
  input: CreateTermsInput;
};

type UpdateParams = {
  termsId: number;
  input: UpdateTermsInput;
};

/** 같은 (type, version) 조합 중복 시 Prisma 가 던지는 unique 위반 에러인지 */
function isVersionDuplicated(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;

  return typeof target === "string"
    ? target.includes("version")
    : Array.isArray(target) && target.some((t) => String(t).includes("version"));
}

/** 같은 유형에 이미 PUBLISHED 가 있어(partial unique index) 게시가 충돌하는지 */
function isPublishConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;

  // partial unique index(terms_type_published_unique) 위반만 식별한다.
  return typeof target === "string"
    ? target.includes("published")
    : Array.isArray(target) && target.some((t) => String(t).includes("published"));
}

/**
 * 약관을 조회하고, 없거나 삭제됐으면 404 를 던진다.
 * 수정/게시/삭제 전 공통으로 존재를 보장하는 헬퍼.
 */
async function findTermsOrThrow(termsId: number, db?: DbClient) {
  const terms = await termsRepository.findById(termsId, db);

  if (!terms || terms.deletedAt !== null) {
    throw new AppError("TERMS_NOT_FOUND");
  }

  return terms;
}

/**
 * 동의 이력에서 약관(termsId)별 최신 1건만 남긴다.
 *
 * 이력은 갱신하지 않고 계속 쌓이므로(마케팅 수신 동의/철회 반복 등)
 * "현재 상태"는 가장 최근 기록으로 판단한다.
 * repository 가 agreedAt 내림차순으로 반환하므로 첫 항목이 최신이다.
 */
function pickLatestByTermsId<T extends { termsId: number }>(histories: T[]): Map<number, T> {
  const latest = new Map<number, T>();

  for (const history of histories) {
    if (!latest.has(history.termsId)) {
      latest.set(history.termsId, history);
    }
  }

  return latest;
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

    // 미지정 시 스키마 기본값(ALL)을 사용한다.
    if (input.audience !== undefined) {
      data.audience = input.audience;
    }

    if (input.effectiveAt !== undefined) {
      data.effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    }

    try {
      return await termsRepository.create(data);
    } catch (error) {
      if (isVersionDuplicated(error)) {
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
    const data: Prisma.TermsUncheckedUpdateManyInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
    }

    if (input.content !== undefined) {
      data.content = input.content;
    }

    if (input.isRequired !== undefined) {
      data.isRequired = input.isRequired;
    }

    if (input.audience !== undefined) {
      data.audience = input.audience;
    }

    if (input.effectiveAt !== undefined) {
      data.effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    }

    // 상태 검증과 수정을 한 쿼리로 원자화(동시 요청 안전). 변경 행이 없으면 DRAFT 가 아니거나 없는 것.
    const count = await termsRepository.updateDraft(termsId, data);

    if (count === 0) {
      // 대상이 없는지, DRAFT 가 아니어서 막힌 것인지 구분해 에러를 반환한다.
      await findTermsOrThrow(termsId);
      throw new AppError("TERMS_NOT_EDITABLE");
    }

    return findTermsOrThrow(termsId);
  },

  /**
   * 약관을 게시합니다. DRAFT 상태만 게시할 수 있습니다.
   * 같은 유형의 기존 PUBLISHED 를 ARCHIVED 로 내리고(원자적), 대상을 PUBLISHED 로 올립니다.
   */
  async publishTerms(termsId: number) {
    const now = new Date();

    const published = await runTransaction(async (tx) => {
      const terms = await findTermsOrThrow(termsId, tx);

      await termsRepository.archivePublishedByType(terms.type, tx);

      const count = await termsRepository.publishDraft(termsId, now, tx);

      if (count === 0) {
        throw new AppError("TERMS_NOT_PUBLISHABLE");
      }

      return findTermsOrThrow(termsId, tx);
    }).catch((error) => {
      // 동시 게시로 partial unique index(한 유형에 PUBLISHED 하나) 위반 시 P2002.
      // 이미 다른 요청이 같은 유형을 게시한 상황이므로 게시 불가로 처리한다.
      if (isPublishConflict(error)) {
        throw new AppError("TERMS_NOT_PUBLISHABLE");
      }
      throw error;
    });

    return published;
  },

  /**
   * 약관을 삭제합니다. DRAFT(미게시 초안)만 삭제할 수 있습니다.
   * 게시된 적 있는 약관(PUBLISHED/ARCHIVED)은 이력 보존을 위해 삭제를 막습니다.
   */
  async deleteTerms(termsId: number) {
    // 상태 검증과 삭제를 한 쿼리로 원자화(동시 요청 안전).
    const count = await termsRepository.softDeleteDraft(termsId);

    if (count === 0) {
      // 없는지, DRAFT 가 아니어서 막힌 것인지 구분해 에러를 반환한다.
      await findTermsOrThrow(termsId);
      throw new AppError("TERMS_NOT_DELETABLE");
    }
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

  // ==========================================================================
  // 약관 동의
  // ==========================================================================

  /**
   * 회원가입 동의 화면에 노출할 약관 목록을 조회합니다.
   * 해당 역할이 대상인 게시본만(필수 + 선택) 내려줍니다.
   */
  getSignUpTerms(role: TermsAudienceRole) {
    return termsRepository.findPublishedForRole(role);
  },

  /**
   * 회원가입 시 받은 약관 동의를 검증하고 저장합니다.
   *
   * 유저 생성과 반드시 같은 트랜잭션에서 호출해야 합니다.
   * 유저는 생성됐는데 동의 이력이 없는 상태를 만들지 않기 위함입니다.
   *
   * 검증 순서
   * 1. 전달된 termsId 가 실제 게시본이고 해당 역할 대상인지 (임의 id 차단)
   * 2. 해당 역할의 필수 약관을 모두 동의했는지
   */
  async saveSignUpAgreements(
    userId: string,
    role: TermsAudienceRole,
    agreements: TermsAgreementInput[],
    db: DbClient,
  ): Promise<void> {
    const requiredTerms = await termsRepository.findRequiredPublished(role, db);

    // 게시된 필수 약관도 없고 전달된 동의도 없으면 처리할 것이 없다.
    if (requiredTerms.length === 0 && agreements.length === 0) {
      return;
    }

    if (agreements.length > 0) {
      const validTerms = await termsRepository.findPublishedByIds(
        agreements.map((agreement) => agreement.termsId),
        role,
        db,
      );
      const validTermsIds = new Set(validTerms.map((terms) => terms.id));

      const invalidIds = agreements
        .map((agreement) => agreement.termsId)
        .filter((termsId) => !validTermsIds.has(termsId));

      if (invalidIds.length > 0) {
        throw new AppError("TERMS_AGREEMENT_INVALID", {
          message: `게시되지 않았거나 대상이 아닌 약관이 포함되어 있습니다. (id: ${invalidIds.join(", ")})`,
        });
      }
    }

    const agreedTermsIds = new Set(
      agreements.filter((agreement) => agreement.isAgreed).map((agreement) => agreement.termsId),
    );

    const missingTerms = requiredTerms.filter((terms) => !agreedTermsIds.has(terms.id));

    if (missingTerms.length > 0) {
      throw new AppError("TERMS_AGREEMENT_REQUIRED", {
        message: `필수 약관에 동의해야 가입할 수 있습니다. (${missingTerms
          .map((terms) => terms.title)
          .join(", ")})`,
      });
    }

    if (agreements.length === 0) {
      return;
    }

    await termsRepository.createAgreements(
      agreements.map((agreement) => ({
        userId,
        termsId: agreement.termsId,
        isAgreed: agreement.isAgreed,
      })),
      db,
    );
  },

  /**
   * 내 약관 동의 내역을 조회합니다.
   * 이력이 쌓이므로 약관 버전별 최신 1건만 남겨 현재 상태로 보여줍니다.
   */
  async getMyAgreements(userId: string) {
    const histories = await termsRepository.findAgreementsByUserId(userId);

    return [...pickLatestByTermsId(histories).values()];
  },

  /**
   * 아직 동의하지 않은 필수 약관을 조회합니다.
   *
   * 약관을 개정하면 새 Terms 행이 생겨 termsId 가 달라지므로,
   * 별도 플래그 없이 여기서 자동으로 "재동의 필요" 대상으로 잡힙니다.
   */
  async getPendingRequiredTerms(userId: string, role: TermsAudienceRole) {
    const requiredTerms = await termsRepository.findRequiredPublished(role);

    if (requiredTerms.length === 0) {
      return [];
    }

    const histories = await termsRepository.findAgreementsByUserId(userId);
    const latest = pickLatestByTermsId(histories);

    return requiredTerms.filter((terms) => latest.get(terms.id)?.isAgreed !== true);
  },
};
