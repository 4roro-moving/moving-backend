import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";
import { moverEstimateController } from "./mover-estimate.controller";
import {
  moverEstimateRequestListQuerySchema,
  moverEstimateRejectionListQuerySchema,
  moverSentEstimateIdParamSchema,
  moverSentEstimateListQuerySchema,
  rejectEstimateBodySchema,
  sendEstimateBodySchema,
  sendEstimateParamSchema,
} from "./mover-estimate.validator";

const moverEstimateRouter = Router();
const moverOnly = [authenticate, authorize("MOVER")] as const;

/*
- 2026.07.21 add 윤소정
기사 견적 요청 목록
*/
moverEstimateRouter.get(
  "/requests",
  ...moverOnly,
  validate({ query: moverEstimateRequestListQuerySchema }),
  asyncHandler(moverEstimateController.getList),
);

// 기사님이 본인의 확정 견적을 실제 이사 완료 상태로 전환
moverEstimateRouter.patch(
  "/sent/:estimateId/complete",
  ...moverOnly,
  validate({ params: moverSentEstimateIdParamSchema }),
  asyncHandler(moverEstimateController.completeSentEstimate),
);

/*
- 2026.07.30 add 윤소정
기사 견적 반려 내역 조회
*/
moverEstimateRouter.get(
  "/rejections",
  ...moverOnly,
  validate({ query: moverEstimateRejectionListQuerySchema }),
  asyncHandler(moverEstimateController.getRejections),
);

// 기사 내 견적 관리: 보낸 견적 목록
moverEstimateRouter.get(
  "/sent",
  ...moverOnly,
  validate({ query: moverSentEstimateListQuerySchema }),
  asyncHandler(moverEstimateController.getSentEstimates),
);

// 기사 내 견적 관리: 보낸 견적 상세
moverEstimateRouter.get(
  "/sent/:estimateId",
  ...moverOnly,
  validate({ params: moverSentEstimateIdParamSchema }),
  asyncHandler(moverEstimateController.getSentEstimateDetail),
);

/*
- 2026.07.24 add 윤소정
기사 견적 제안
*/
moverEstimateRouter.post(
  "/requests/:estimateRequestId",
  ...moverOnly,
  validate({
    params: sendEstimateParamSchema,
    body: sendEstimateBodySchema,
  }),
  asyncHandler(moverEstimateController.sendEstimate),
);

/*
- 2026.07.27 add 윤소정
기사 견적 반려
*/
moverEstimateRouter.post(
  "/requests/:estimateRequestId/reject",
  ...moverOnly,
  validate({
    params: sendEstimateParamSchema,
    body: rejectEstimateBodySchema,
  }),
  asyncHandler(moverEstimateController.rejectEstimate),
);

export default moverEstimateRouter;
