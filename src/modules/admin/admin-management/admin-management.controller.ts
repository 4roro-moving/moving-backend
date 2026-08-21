import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";

import { sendResponse } from "../../../utils/response.util";

import { adminManagementService } from "./admin-management.service";

import type {
  AdminIdParam,
  CreateAdminBody,
  DeactivateAdminBody,
  ListAdminQuery,
  UpdateAdminStatusBody,
} from "./admin-management.type";

export const adminManagementController = {
  // GET /api/admin/admins
  getAdminList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListAdminQuery;

    const result = await adminManagementService.getAdminList(query);

    return sendResponse(res, 200, result.items, {
      pagination: result.pagination,
    });
  },

  // GET /api/admin/admins/:id
  getAdminDetail: async (_req: Request, res: Response) => {
    const { id } = res.locals.params as AdminIdParam;

    const result = await adminManagementService.getAdminDetail(id);

    return sendResponse(res, 200, result);
  },

  // POST /api/admin/admins
  createAdmin: async (req: Request, res: Response) => {
    const input = req.body as CreateAdminBody;

    const result = await adminManagementService.createAdmin(input);

    return sendResponse(res, 201, result);
  },

  // PATCH /api/admin/admins/:id/status
  updateAdminStatus: async (req: Request, res: Response) => {
    const { id } = res.locals.params as AdminIdParam;
    const input = req.body as UpdateAdminStatusBody;

    /**
     * 런타임에서는 requireActiveAdmin이 req.admin을 보장하지만,
     * TypeScript는 Express 미들웨어 실행 순서를 추론하지 못하므로
     * Controller에서도 안전하게 확인합니다.
     */
    if (!req.admin) {
      throw new AppError("UNAUTHORIZED", {
        message: "인증이 필요합니다.",
      });
    }

    const result = await adminManagementService.updateAdminStatus({
      targetAdminId: id,
      actorAdminId: req.admin.id,
      input,
    });

    return sendResponse(res, 200, result);
  },

  // PATCH /api/admin/admins/:id/deactivate
  deactivateAdmin: async (req: Request, res: Response) => {
    const { id } = res.locals.params as AdminIdParam;
    const input = req.body as DeactivateAdminBody;

    /**
     * 런타임에서는 requireActiveAdmin이 req.admin을 보장하지만,
     * TypeScript는 Express 미들웨어 실행 순서를 추론하지 못하므로
     * Controller에서도 안전하게 확인합니다.
     */
    if (!req.admin) {
      throw new AppError("UNAUTHORIZED", {
        message: "인증이 필요합니다.",
      });
    }

    const result = await adminManagementService.deactivateAdmin({
      targetAdminId: id,
      actorAdminId: req.admin.id,
      input,
    });

    return sendResponse(res, 200, result);
  },
};
