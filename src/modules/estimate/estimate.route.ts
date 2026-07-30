import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { estimateController } from "./estimate.controller";
import {
  moverEstimateRequestListQuerySchema,
  moverEstimateRejectionListQuerySchema,
  pendingEstimateQuerySchema,
  rejectEstimateBodySchema,
  sendEstimateBodySchema,
  receivedEstimateIdParamSchema,
  sendEstimateParamSchema,
} from "./estimate.validator";

const estimateRouter = Router();

/* 
- 2026.07.21 add 윤소정
기사 견적 요청 목록
*/
estimateRouter.get(
  "/requests",
  authenticate,
  authorize("MOVER"),
  validate({ query: moverEstimateRequestListQuerySchema }),
  estimateController.getList,
);

/* 
- 2026.07.30 add 윤소정
기사 견적 반려 내역 조회
*/
estimateRouter.get(
  "/rejections",
  authenticate,
  authorize("MOVER"),
  validate({ query: moverEstimateRejectionListQuerySchema }),
  asyncHandler(estimateController.getRejections),
);

/* 
- 2026.07.24 add 윤소정
기사 견적 제안
*/
estimateRouter.post(
  "/requests/:estimateRequestId",
  authenticate,
  authorize("MOVER"),
  validate({
    params: sendEstimateParamSchema,
    body: sendEstimateBodySchema,
  }),
  estimateController.sendEstimate,
);

// 2026.07.27 add 김성현
// 고객 대기 중인 견적 목록 조회
estimateRouter.get(
  "/pending",
  authenticate,
  authorize("CUSTOMER"),
  validate({ query: pendingEstimateQuerySchema }),
  asyncHandler(estimateController.getPendingEstimateRequests),
);

/* 
- 2026.07.27 add 윤소정
기사 견적 반려
*/
estimateRouter.post(
  "/requests/:estimateRequestId/reject",
  authenticate,
  authorize("MOVER"),
  validate({
    params: sendEstimateParamSchema,
    body: rejectEstimateBodySchema,
  }),
  estimateController.rejectEstimate,
);

// 2026.07.24 정슬기 - [추가] 고객 받은 견적 패널 목록 API (요청 단위)
estimateRouter.get(
  "/received",
  authenticate,
  authorize("CUSTOMER"),
  estimateController.getReceivedEstimatePanels,
);

// 2026.07.24 정슬기 - [추가] estimateId만으로 받은 견적 상세 조회 (query 없이 FE 라우트와 맞춤)
estimateRouter.get(
  "/:estimateId",
  authenticate,
  authorize("CUSTOMER"),
  validate({ params: receivedEstimateIdParamSchema }),
  estimateController.getReceivedEstimateDetailById,
);

// 2026.07.24 정슬기 - [수정] 원격 변경사항과 견적 API 작업 충돌 병합
// estimateId 기준 확정 API (원격 PATCH confirm 로직 재사용)
estimateRouter.post(
  "/:estimateId/confirm",
  authenticate,
  authorize("CUSTOMER"),
  validate({ params: receivedEstimateIdParamSchema }),
  estimateController.confirmReceivedEstimateById,
);

export default estimateRouter;
