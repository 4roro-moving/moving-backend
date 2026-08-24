import type { Request, Response } from "express";

import type { InquiryAccess } from "../../constants/inquiry-access";
import { AppError } from "../../lib/app-error";
import { adminInquiryService, inquiryService } from "./inquiry.service";
import type {
  AdminListInquiryQuery,
  CreateInquiryInput,
  CreateMessageInput,
  InquiryIdParam,
  ListInquiryQuery,
} from "./inquiry.type";

function getUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

/** 문의 전용 인증 미들웨어가 설정한 접근 유형을 조회한다. */
function getInquiryAccess(req: Request): InquiryAccess {
  if (!req.inquiryAccess) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.inquiryAccess;
}

// ============================================================================
// 사용자 컨트롤러
// ============================================================================

export const inquiryController = {
  // POST /api/inquiries
  createInquiry: async (req: Request, res: Response) => {
    const inquiry = await inquiryService.createInquiry(
      getUserId(req),
      req.body as CreateInquiryInput,
      getInquiryAccess(req),
    );

    res.status(201).json({ success: true, data: inquiry });
  },

  // GET /api/inquiries
  getMyInquiryList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListInquiryQuery;

    const result = await inquiryService.getMyInquiryList(getUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.inquiries,
      pagination: result.pagination,
    });
  },

  // GET /api/inquiries/:inquiryId
  getMyInquiryById: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.getMyInquiryById(inquiryId, getUserId(req));

    res.status(200).json({ success: true, data: inquiry });
  },

  // POST /api/inquiries/:inquiryId/messages
  addMessage: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.addUserMessage(
      inquiryId,
      getUserId(req),
      req.body as CreateMessageInput,
      getInquiryAccess(req),
    );

    res.status(201).json({ success: true, data: inquiry });
  },

  // PATCH /api/inquiries/:inquiryId/close
  closeInquiry: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.closeByUser(
      inquiryId,
      getUserId(req),
      getInquiryAccess(req),
    );

    res.status(200).json({ success: true, data: inquiry });
  },
};

// ============================================================================
// 관리자 컨트롤러
// ============================================================================

export const adminInquiryController = {
  // GET /api/admin/inquiries
  getInquiryList: async (_req: Request, res: Response) => {
    const query = res.locals.query as AdminListInquiryQuery;

    const result = await adminInquiryService.getInquiryList(query);

    res.status(200).json({
      success: true,
      data: result.inquiries,
      pagination: result.pagination,
    });
  },

  // GET /api/admin/inquiries/:inquiryId
  getInquiryById: async (_req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await adminInquiryService.getInquiryById(inquiryId);

    res.status(200).json({ success: true, data: inquiry });
  },

  // POST /api/admin/inquiries/:inquiryId/answer
  answer: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await adminInquiryService.answer(
      inquiryId,
      getUserId(req),
      req.body as CreateMessageInput,
    );

    res.status(201).json({ success: true, data: inquiry });
  },

  // PATCH /api/admin/inquiries/:inquiryId/close
  closeInquiry: async (_req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await adminInquiryService.closeByAdmin(inquiryId);

    res.status(200).json({ success: true, data: inquiry });
  },
};
