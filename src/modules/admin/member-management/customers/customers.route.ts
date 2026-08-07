import { Router } from "express";
import { UserRole } from "@prisma/client";

import { requireActiveAdmin } from "../../../../middlewares/admin";
import { authenticate, authorize } from "../../../../middlewares/auth";
import { validate } from "../../../../middlewares/validate";
import { asyncHandler } from "../../../../utils/async-handler.util";
import { customersController } from "./customers.controller";
import { listCustomerQuerySchema } from "./customers.validator";

/**
 * 관리자 고객(회원) 라우터 (/api/admin/users)
 * 일반 고객(CUSTOMER) 목록 조회. 기사님은 /api/admin/movers 에서 별도 제공.
 */
const adminCustomerRouter = Router();

adminCustomerRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

adminCustomerRouter
  .route("/")
  .get(
    validate({ query: listCustomerQuerySchema }),
    asyncHandler(customersController.getCustomerList),
  );

export default adminCustomerRouter;
