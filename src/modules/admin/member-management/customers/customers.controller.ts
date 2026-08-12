import type { Request, Response } from "express";

import { AppError } from "../../../../lib/app-error";
import { sendResponse } from "../../../../utils/response.util";
import { customersService } from "./customers.service";
import type {
  CustomerIdParam,
  ListCustomerQuery,
  UpdateCustomerStatusBody,
} from "./customers.type";

export const customersController = {
  // GET /api/admin/users
  getCustomerList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListCustomerQuery;
    const result = await customersService.getCustomerList(query);

    return sendResponse(res, 200, result.items, {
      pagination: result.pagination,
    });
  },

  // GET /api/admin/users/:id
  getCustomerDetail: async (_req: Request, res: Response) => {
    const { id } = res.locals.params as CustomerIdParam;
    const detail = await customersService.getCustomerDetail(id);

    return sendResponse(res, 200, detail);
  },

  // PATCH /api/admin/users/:id/status
  updateCustomerStatus: async (req: Request, res: Response) => {
    const { id } = res.locals.params as CustomerIdParam;
    const input = req.body as UpdateCustomerStatusBody;

    // 런타임에서는 requireActiveAdmin이 req.admin을 보장하지만,
    // TypeScript는 Express 미들웨어 실행 순서를 추론하지 못해 req.admin을 optional로 판단합니다.
    if (!req.admin) {
      throw new AppError("UNAUTHORIZED");
    }

    const result = await customersService.updateCustomerStatus({
      customerId: id,
      adminId: req.admin.id,
      input,
    });

    return sendResponse(res, 200, result);
  },
};
