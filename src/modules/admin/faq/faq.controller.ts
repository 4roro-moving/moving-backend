import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";
import { faqService } from "./faq.service";
import type { CreateFaqInput, FaqIdParam, ListFaqQuery, UpdateFaqInput } from "./faq.type";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const faqController = {
  // POST /api/admin/faqs
  createFaq: async (req: Request, res: Response) => {
    const faq = await faqService.createFaq({
      authorId: getAdminId(req),
      input: req.body as CreateFaqInput,
    });

    res.status(201).json({
      success: true,
      data: faq,
    });
  },

  // GET /api/admin/faqs
  getFaqList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListFaqQuery;

    const result = await faqService.getFaqList(query);

    res.status(200).json({
      success: true,
      data: result.faqs,
      pagination: result.pagination,
    });
  },

  // GET /api/admin/faqs/:faqId
  getFaqById: async (_req: Request, res: Response) => {
    const { faqId } = res.locals.params as FaqIdParam;

    const faq = await faqService.getFaqById(faqId);

    res.status(200).json({
      success: true,
      data: faq,
    });
  },

  // PATCH /api/admin/faqs/:faqId
  updateFaq: async (req: Request, res: Response) => {
    const { faqId } = res.locals.params as FaqIdParam;

    const faq = await faqService.updateFaq({
      faqId,
      input: req.body as UpdateFaqInput,
    });

    res.status(200).json({
      success: true,
      data: faq,
    });
  },

  // DELETE /api/admin/faqs/:faqId
  deleteFaq: async (_req: Request, res: Response) => {
    const { faqId } = res.locals.params as FaqIdParam;

    await faqService.deleteFaq(faqId);

    res.status(200).json({
      success: true,
      data: { id: faqId },
    });
  },

  // GET /api/faqs  (사용자 공개 조회, 인증 불필요)
  getPublicFaqList: async (_req: Request, res: Response) => {
    const faqs = await faqService.getPublicFaqList();

    res.status(200).json({
      success: true,
      data: faqs,
    });
  },
};
