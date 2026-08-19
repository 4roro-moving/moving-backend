import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { termsService } from "./terms.service";
import type {
  CreateTermsInput,
  ListTermsQuery,
  TermsAudienceRole,
  TermsIdParam,
  UpdateTermsInput,
} from "./terms.type";
import type { TermsTypeParam } from "./terms.validator";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

function getAuthUser(req: Request): { id: string; role: TermsAudienceRole } {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  if (req.user.role === "ADMIN") {
    throw new AppError("FORBIDDEN", {
      message: "관리자 계정은 약관 동의 대상이 아닙니다.",
    });
  }

  return { id: req.user.id, role: req.user.role };
}

export const termsController = {
  // POST /api/admin/terms
  createTerms: async (req: Request, res: Response) => {
    const terms = await termsService.createTerms({
      authorId: getAdminId(req),
      input: req.body as CreateTermsInput,
    });

    res.status(201).json({
      success: true,
      data: terms,
    });
  },

  // GET /api/admin/terms
  getTermsList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListTermsQuery;

    const result = await termsService.getTermsList(query);

    res.status(200).json({
      success: true,
      data: result.terms,
      pagination: result.pagination,
    });
  },

  // GET /api/admin/terms/:termsId
  getTermsById: async (_req: Request, res: Response) => {
    const { termsId } = res.locals.params as TermsIdParam;

    const terms = await termsService.getTermsById(termsId);

    res.status(200).json({
      success: true,
      data: terms,
    });
  },

  // PATCH /api/admin/terms/:termsId
  updateTerms: async (req: Request, res: Response) => {
    const { termsId } = res.locals.params as TermsIdParam;

    const terms = await termsService.updateTerms({
      termsId,
      input: req.body as UpdateTermsInput,
    });

    res.status(200).json({
      success: true,
      data: terms,
    });
  },

  // PATCH /api/admin/terms/:termsId/publish
  publishTerms: async (_req: Request, res: Response) => {
    const { termsId } = res.locals.params as TermsIdParam;

    const terms = await termsService.publishTerms(termsId);

    res.status(200).json({
      success: true,
      data: terms,
    });
  },

  // DELETE /api/admin/terms/:termsId
  deleteTerms: async (_req: Request, res: Response) => {
    const { termsId } = res.locals.params as TermsIdParam;

    await termsService.deleteTerms(termsId);

    res.status(200).json({
      success: true,
      data: { id: termsId },
    });
  },

  // GET /api/terms  (사용자 공개 조회, 인증 불필요)
  getPublishedList: async (_req: Request, res: Response) => {
    const terms = await termsService.getPublishedList();

    res.status(200).json({
      success: true,
      data: terms,
    });
  },

  // GET /api/terms/:type  (사용자 공개 조회, 특정 유형)
  getPublishedByType: async (_req: Request, res: Response) => {
    const { type } = res.locals.params as TermsTypeParam;

    const terms = await termsService.getPublishedByType(type);

    res.status(200).json({
      success: true,
      data: terms,
    });
  },

  // GET /api/terms/me/agreements  내 약관 동의 내역 (약관 버전별 최신 상태)
  getMyAgreements: async (req: Request, res: Response) => {
    const { id } = getAuthUser(req);

    const agreements = await termsService.getMyAgreements(id);

    res.status(200).json({
      success: true,
      data: agreements,
    });
  },

  // GET /api/terms/me/pending 아직 동의하지 않은 필수 약관 (약관 개정 시 재동의 대상 포함)
  getPendingRequiredTerms: async (req: Request, res: Response) => {
    const { id, role } = getAuthUser(req);

    const terms = await termsService.getPendingRequiredTerms(id, role);

    res.status(200).json({
      success: true,
      data: terms,
    });
  },
};
