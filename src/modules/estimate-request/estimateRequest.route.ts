import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.util";
import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { estimateController } from "../estimate/estimate.controller";
import {
  confirmReceivedEstimateParamSchema,
  receivedEstimateDetailParamSchema,
  receivedEstimateRequestIdParamSchema,
} from "../estimate/estimate.validator";
import { estimateRequestController } from "./estimateRequest.controller";
import {
  createEstimateRequestSchema,
  designateMoverSchema,
  estimateRequestIdParamSchema,
  listEstimateRequestQuerySchema,
  updateEstimateRequestSchema,
} from "./estimateRequest.validator";

const estimateRequestRouter = Router();

estimateRequestRouter.use(authenticate, authorize("CUSTOMER"));

estimateRequestRouter.get(
  "/active",
  asyncHandler(estimateRequestController.getActiveEstimateRequest),
);

estimateRequestRouter
  .route("/")
  .post(
    validate({ body: createEstimateRequestSchema }),
    asyncHandler(estimateRequestController.createEstimateRequest),
  )
  .get(
    validate({ query: listEstimateRequestQuerySchema }),
    asyncHandler(estimateRequestController.getMyEstimateRequestList),
  );

estimateRequestRouter
  .route("/:estimateRequestId")
  .get(
    validate({ params: estimateRequestIdParamSchema }),
    asyncHandler(estimateRequestController.getEstimateRequestById),
  )
  .patch(
    validate({
      params: estimateRequestIdParamSchema,
      body: updateEstimateRequestSchema,
    }),
    asyncHandler(estimateRequestController.updateEstimateRequest),
  )
  .delete(
    validate({ params: estimateRequestIdParamSchema }),
    asyncHandler(estimateRequestController.cancelEstimateRequest),
  );

estimateRequestRouter.get(
  "/:estimateRequestId/estimates",
  validate({ params: receivedEstimateRequestIdParamSchema }),
  estimateController.getReceivedEstimateList,
);

/*
2026.07.23 add 김성현
받은 견적 상세 요청 처리
*/
estimateRequestRouter.get(
  "/:estimateRequestId/estimates/:estimateId",
  validate({ params: receivedEstimateDetailParamSchema }),
  estimateController.getReceivedEstimateDetail,
);

/*
2026.07.23 add 김성현
받은 견적 확정 요청 처리
*/
estimateRequestRouter.patch(
  "/:estimateRequestId/estimates/:estimateId/confirm",
  validate({ params: confirmReceivedEstimateParamSchema }),
  estimateController.confirmReceivedEstimate,
);

estimateRequestRouter.post(
  "/:estimateRequestId/designate",
  validate({
    params: estimateRequestIdParamSchema,
    body: designateMoverSchema,
  }),
  asyncHandler(estimateRequestController.designateMover),
);

export default estimateRequestRouter;
