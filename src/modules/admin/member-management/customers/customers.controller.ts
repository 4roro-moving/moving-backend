import type { Request, Response } from "express";

import { sendResponse } from "../../../../utils/response.util";
import { customersService } from "./customers.service";
import type { CustomerIdParam, ListCustomerQuery } from "./customers.type";

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
};
