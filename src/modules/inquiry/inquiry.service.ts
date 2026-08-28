import { InquiryCategory, type Prisma } from "@prisma/client";

import { INQUIRY_ACCESS, type InquiryAccess } from "../../constants/inquiry-access";
import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { escapeLikePattern } from "../../utils/search.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";

import { inquiryRepository } from "./inquiry.repository";
import { notificationService } from "../notification/notification.service";
import type {
  AdminListInquiryQuery,
  CreateInquiryInput,
  CreateMessageInput,
  ListInquiryQuery,
} from "./inquiry.type";

// ============================================================================
// 내부 헬퍼
// ============================================================================

type Ownership = {
  id: number;
  authorId: string;
  category: InquiryCategory;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  handledBy: string | null;
};

/** 문의를 조회하고, 없으면 404, 소유자가 아니면 403 */
async function findOwnedInquiryOrThrow(
  inquiryId: number,
  userId: string,
  db?: DbClient,
): Promise<Ownership> {
  const inquiry = (await inquiryRepository.findOwnership(inquiryId, db)) as Ownership | null;

  if (!inquiry) {
    throw new AppError("INQUIRY_NOT_FOUND");
  }

  if (inquiry.authorId !== userId) {
    throw new AppError("FORBIDDEN");
  }

  return inquiry;
}

/** 문의를 조회하고, 없으면 404 (관리자용 — 소유권 검사 없음) */
async function findInquiryOrThrow(inquiryId: number, db?: DbClient): Promise<Ownership> {
  const inquiry = (await inquiryRepository.findOwnership(inquiryId, db)) as Ownership | null;

  if (!inquiry) {
    throw new AppError("INQUIRY_NOT_FOUND");
  }

  return inquiry;
}

// ============================================================================
// 사용자 기능
// ============================================================================

/**
 * 정지 이의 제기 제한 세션 정책
 *
 * - 새 문의는 SUSPENSION_APPEAL 분류로만 생성한다.
 * - 기존 일반 문의는 조회와 답변 확인만 허용한다.
 * - SUSPENSION_APPEAL 문의에만 추가 메시지를 허용한다.
 * - 문의 종료는 허용하지 않는다.
 */
export const inquiryService = {
  /** 문의 생성 (제목+카테고리+첫 메시지, 트랜잭션) */
  async createInquiry(authorId: string, input: CreateInquiryInput, access: InquiryAccess) {
    const now = new Date();

    const inquiryId = await runTransaction((tx) =>
      inquiryRepository.createWithFirstMessage(
        {
          authorId,
          // 제한 세션에서는 클라이언트 입력과 무관하게 이의 제기 문의로 생성한다.
          category:
            access === INQUIRY_ACCESS.SUSPENSION_APPEAL
              ? InquiryCategory.SUSPENSION_APPEAL
              : input.category,
          title: input.title,
          content: input.content,
          now,
        },
        tx,
      ),
    );

    return inquiryRepository.findById(inquiryId);
  },

  /** 내 문의 목록 */
  async getMyInquiryList(authorId: string, query: ListInquiryQuery) {
    const { page, limit, status } = query;

    const where: Prisma.InquiryWhereInput = {
      authorId,
      ...(status !== undefined ? { status } : {}),
    };

    const { inquiries, totalCount } = await inquiryRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
    });

    return {
      inquiries,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /** 내 문의 상세 (조회 시 상대 메시지 읽음 처리) */
  async getMyInquiryById(inquiryId: number, userId: string) {
    await findOwnedInquiryOrThrow(inquiryId, userId);

    await inquiryRepository.markMessagesRead({ inquiryId, readerIsAdmin: false });

    return inquiryRepository.findById(inquiryId);
  },

  /** 사용자 메시지 추가 (열린 문의에만, 추가 시 status=OPEN) */
  async addUserMessage(
    inquiryId: number,
    userId: string,
    input: CreateMessageInput,
    access: InquiryAccess,
  ) {
    const now = new Date();

    await runTransaction(async (tx) => {
      // 소유권/존재 확인 (없으면 404, 남의 것이면 403)
      const inquiry = await findOwnedInquiryOrThrow(inquiryId, userId, tx);

      if (
        access === INQUIRY_ACCESS.SUSPENSION_APPEAL &&
        inquiry.category !== InquiryCategory.SUSPENSION_APPEAL
      ) {
        // 제한 세션의 기존 일반 문의는 읽기 전용으로 유지한다.
        throw new AppError("FORBIDDEN", {
          message: "정지 계정은 일반 문의에 메시지를 추가할 수 없습니다.",
        });
      }
      const ok = await inquiryRepository.addMessage(
        {
          inquiryId,
          senderId: userId,
          content: input.content,
          isAdmin: false,
          nextStatus: "OPEN",
          now,
        },
        tx,
      );

      if (!ok) {
        throw new AppError("INQUIRY_CLOSED");
      }
    });

    return inquiryRepository.findById(inquiryId);
  },

  /** 사용자 문의 종료 */
  async closeByUser(inquiryId: number, userId: string, access: InquiryAccess) {
    if (access === INQUIRY_ACCESS.SUSPENSION_APPEAL) {
      // 이의 제기 진행 중인 제한 세션에서는 문의 종료를 허용하지 않는다.
      throw new AppError("FORBIDDEN", {
        message: "정지 계정은 기존 문의를 종료할 수 없습니다.",
      });
    }

    const now = new Date();

    return runTransaction(async (tx) => {
      await findOwnedInquiryOrThrow(inquiryId, userId, tx);
      const ok = await inquiryRepository.close(inquiryId, now, tx);

      if (!ok) {
        throw new AppError("INQUIRY_CLOSED");
      }

      return inquiryRepository.findById(inquiryId, tx);
    });
  },
};

// ============================================================================
// 관리자 기능
// ============================================================================

export const adminInquiryService = {
  /** 관리자 문의 목록 (상태 필터 + 미종료 필터) */
  async getInquiryList(query: AdminListInquiryQuery) {
    const { page, limit, status, openOnly, keyword } = query;

    const where: Prisma.InquiryWhereInput = {};

    if (keyword !== undefined) {
      where.title = {
        contains: escapeLikePattern(keyword),
        mode: "insensitive",
      };
    }

    if (status !== undefined) {
      where.status = status;
    } else if (openOnly === true) {
      where.status = { in: ["OPEN", "ANSWERED"] };
    }

    const { inquiries, totalCount } = await inquiryRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
    });

    return {
      inquiries,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /** 관리자 문의 상세 (조회 시 사용자 메시지 읽음 처리) */
  async getInquiryById(inquiryId: number) {
    await findInquiryOrThrow(inquiryId);

    await inquiryRepository.markMessagesRead({ inquiryId, readerIsAdmin: true });

    return inquiryRepository.findById(inquiryId);
  },

  /** 관리자 답변 (메시지 추가, status=ANSWERED, handledBy 지정) */
  async answer(inquiryId: number, adminId: string, input: CreateMessageInput) {
    const now = new Date();

    const result = await runTransaction(async (tx) => {
      const inquiry = await findInquiryOrThrow(inquiryId, tx);

      const ok = await inquiryRepository.addMessage(
        {
          inquiryId,
          senderId: adminId,
          content: input.content,
          isAdmin: true,
          nextStatus: "ANSWERED",
          handledBy: adminId,
          now,
        },
        tx,
      );

      if (!ok) {
        throw new AppError("INQUIRY_CLOSED");
      }

      // 답변 알림은 문의 작성자에게. DB 저장은 트랜잭션에 포함(알림 필수), SSE 는 커밋 후.
      const notification = await notificationService.createNotification(
        {
          userId: inquiry.authorId,
          type: "INQUIRY_ANSWERED",
          title: "문의에 답변이 등록되었어요",
          // FE는 suffix(inquiryAnswered)만 사용. content는 강조 fragment용이며 완성 문장을 넣지 않는다.
          content: "",
          linkUrl: `/inquiries/${String(inquiryId)}`,
          expiresAt: null,
        },
        tx,
      );

      return { authorId: inquiry.authorId, notification };
    });

    // 커밋 이후 SSE 전송
    notificationService.sendNotification(result.authorId, result.notification);

    return inquiryRepository.findById(inquiryId);
  },

  /** 관리자 문의 종료 */
  async closeByAdmin(inquiryId: number) {
    const now = new Date();

    return runTransaction(async (tx) => {
      await findInquiryOrThrow(inquiryId, tx);

      const ok = await inquiryRepository.close(inquiryId, now, tx);

      if (!ok) {
        throw new AppError("INQUIRY_CLOSED");
      }

      return inquiryRepository.findById(inquiryId, tx);
    });
  },
};
