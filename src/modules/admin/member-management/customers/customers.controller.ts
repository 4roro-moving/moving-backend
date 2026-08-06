import type { Request, Response } from "express";

import { sendResponse } from "../../../../utils/response.util";
import { customersService } from "./customers.service";
import type { ListCustomerQuery } from "./customers.type";

export const customersController = {
  // GET /api/admin/users
  getCustomerList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListCustomerQuery;
    const result = await customersService.getCustomerList(query);

    return sendResponse(res, 200, result.items, {
      pagination: result.pagination,
    });
  },
};
