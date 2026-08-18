import type { Request, Response } from "express";

import { getAuthenticatedUserId } from "../../utils/request-auth.util";
import { adminInquiryService, inquiryService } from "./inquiry.service";
import type {
  AdminListInquiryQuery,
  CreateInquiryInput,
  CreateMessageInput,
  InquiryIdParam,
  ListInquiryQuery,
} from "./inquiry.type";

// ============================================================================
// 사용자 컨트롤러
// ============================================================================

export const inquiryController = {
  // POST /api/inquiries
  createInquiry: async (req: Request, res: Response) => {
    const inquiry = await inquiryService.createInquiry(
      getAuthenticatedUserId(req),
      req.body as CreateInquiryInput,
    );

    res.status(201).json({ success: true, data: inquiry });
  },

  // GET /api/inquiries
  getMyInquiryList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListInquiryQuery;

    const result = await inquiryService.getMyInquiryList(getAuthenticatedUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.inquiries,
      pagination: result.pagination,
    });
  },

  // GET /api/inquiries/:inquiryId
  getMyInquiryById: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.getMyInquiryById(inquiryId, getAuthenticatedUserId(req));

    res.status(200).json({ success: true, data: inquiry });
  },

  // POST /api/inquiries/:inquiryId/messages
  addMessage: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.addUserMessage(
      inquiryId,
      getAuthenticatedUserId(req),
      req.body as CreateMessageInput,
    );

    res.status(201).json({ success: true, data: inquiry });
  },

  // PATCH /api/inquiries/:inquiryId/close
  closeInquiry: async (req: Request, res: Response) => {
    const { inquiryId } = res.locals.params as InquiryIdParam;

    const inquiry = await inquiryService.closeByUser(inquiryId, getAuthenticatedUserId(req));

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
      getAuthenticatedUserId(req),
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
