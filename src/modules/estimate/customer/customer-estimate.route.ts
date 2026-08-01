import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";
import { customerEstimateController } from "./customer-estimate.controller";
import {
  pendingEstimateQuerySchema,
  receivedEstimateIdParamSchema,
} from "./customer-estimate.validator";

const customerEstimateRouter = Router();
const customerOnly = [authenticate, authorize("CUSTOMER")] as const;

// 2026.07.27 add 김성현
// 고객 대기 중인 견적 목록 조회
customerEstimateRouter.get(
  "/pending",
  ...customerOnly,
  validate({ query: pendingEstimateQuerySchema }),
  asyncHandler(customerEstimateController.getPendingEstimateRequests),
);

// 2026.07.24 정슬기 - [추가] 고객 받은 견적 패널 목록 API (요청 단위)
customerEstimateRouter.get(
  "/received",
  ...customerOnly,
  asyncHandler(customerEstimateController.getReceivedEstimatePanels),
);

// 2026.07.24 정슬기 - [추가] estimateId만으로 받은 견적 상세 조회 (query 없이 FE 라우트와 맞춤)
customerEstimateRouter.get(
  "/:estimateId",
  ...customerOnly,
  validate({ params: receivedEstimateIdParamSchema }),
  asyncHandler(customerEstimateController.getReceivedEstimateDetailById),
);

// 2026.07.24 정슬기 - [수정] 원격 변경사항과 견적 API 작업 충돌 병합
// estimateId 기준 확정 API (원격 PATCH confirm 로직 재사용)
customerEstimateRouter.post(
  "/:estimateId/confirm",
  ...customerOnly,
  validate({ params: receivedEstimateIdParamSchema }),
  asyncHandler(customerEstimateController.confirmReceivedEstimateById),
);

export default customerEstimateRouter;
