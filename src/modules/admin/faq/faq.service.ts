import { Prisma } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { escapeLikePattern } from "../../../utils/search.util";

import { faqRepository } from "./faq.repository";
import type { CreateFaqInput, ListFaqQuery, UpdateFaqInput } from "./faq.type";

type CreateParams = {
  authorId: string;
  input: CreateFaqInput;
};

type UpdateParams = {
  faqId: number;
  input: UpdateFaqInput;
};

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export const faqService = {
  /**
   * FAQ를 생성합니다. (관리자)
   */
  createFaq({ authorId, input }: CreateParams) {
    return faqRepository.create({ ...input, authorId });
  },

  /**
   * 관리자 FAQ 목록을 조회합니다. (숨김 포함, 페이지네이션)
   */
  async getFaqList(query: ListFaqQuery) {
    const { page, limit, keyword, isVisible } = query;

    const where: Prisma.FaqWhereInput = {};

    if (keyword !== undefined) {
      const escapedKeyword = escapeLikePattern(keyword);

      where.OR = [
        {
          question: {
            contains: escapedKeyword,
            mode: "insensitive",
          },
        },
        {
          answer: {
            contains: escapedKeyword,
            mode: "insensitive",
          },
        },
      ];
    }

    if (isVisible !== undefined) {
      where.isVisible = isVisible;
    }

    const { faqs, totalCount } = await faqRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
    });

    return {
      faqs,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 사용자 공개 FAQ 목록을 조회합니다. (isVisible=true 만, 정렬순 전체)
   */
  getPublicFaqList() {
    return faqRepository.findPublicList();
  },

  /**
   * FAQ 상세를 조회합니다.
   */
  async getFaqById(faqId: number) {
    const faq = await faqRepository.findById(faqId);

    if (!faq) {
      throw new AppError("FAQ_NOT_FOUND");
    }

    return faq;
  },

  /**
   * FAQ를 수정합니다.
   */
  async updateFaq({ faqId, input }: UpdateParams) {
    const data: Prisma.FaqUncheckedUpdateInput = {};

    if (input.question !== undefined) {
      data.question = input.question;
    }

    if (input.answer !== undefined) {
      data.answer = input.answer;
    }

    if (input.sortOrder !== undefined) {
      data.sortOrder = input.sortOrder;
    }

    if (input.isVisible !== undefined) {
      data.isVisible = input.isVisible;
    }

    try {
      return await faqRepository.update(faqId, data);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new AppError("FAQ_NOT_FOUND");
      }
      throw error;
    }
  },

  /**
   * FAQ를 삭제합니다.
   */
  async deleteFaq(faqId: number) {
    try {
      await faqRepository.delete(faqId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new AppError("FAQ_NOT_FOUND");
      }
      throw error;
    }
  },
};
