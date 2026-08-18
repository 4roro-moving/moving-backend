import type { Request, Response } from "express";

import { getAuthenticatedUserId } from "../../utils/request-auth.util";
import { estimateRequestService } from "./estimateRequest.service";
import type {
  CancelDesignatedMoverParam,
  CreateEstimateRequestInput,
  DesignateMoverInput,
  EstimateRequestIdParam,
  ListEstimateRequestQuery,
  UpdateEstimateRequestInput,
} from "./estimateRequest.type";

export const estimateRequestController = {
  //POST /api/estimate-requests

  createEstimateRequest: async (req: Request, res: Response) => {
    const estimateRequest = await estimateRequestService.createEstimateRequest({
      customerId: getAuthenticatedUserId(req),
      input: req.body as CreateEstimateRequestInput,
    });

    res.status(201).json({
      success: true,
      data: estimateRequest,
    });
  },

  // GET /api/estimate-requests/active

  getActiveEstimateRequest: async (req: Request, res: Response) => {
    const estimateRequest = await estimateRequestService.getActiveEstimateRequest(
      getAuthenticatedUserId(req),
    );

    res.status(200).json({
      success: true,
      data: estimateRequest,
    });
  },

  // GET /api/estimate-requests

  getMyEstimateRequestList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListEstimateRequestQuery;

    const result = await estimateRequestService.getMyEstimateRequestList(
      getAuthenticatedUserId(req),
      query,
    );

    res.status(200).json({
      success: true,
      data: result.estimateRequests,
      pagination: result.pagination,
    });
  },

  // GET /api/estimate-requests/:estimateRequestId

  getEstimateRequestById: async (req: Request, res: Response) => {
    const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

    const estimateRequest = await estimateRequestService.getEstimateRequestById(
      estimateRequestId,
      getAuthenticatedUserId(req),
    );

    res.status(200).json({
      success: true,
      data: estimateRequest,
    });
  },

  // PATCH /api/estimate-requests/:estimateRequestId

  updateEstimateRequest: async (req: Request, res: Response) => {
    const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

    const estimateRequest = await estimateRequestService.updateEstimateRequest({
      estimateRequestId,
      customerId: getAuthenticatedUserId(req),
      input: req.body as UpdateEstimateRequestInput,
    });

    res.status(200).json({
      success: true,
      data: estimateRequest,
    });
  },

  /**
   * DELETE /api/estimate-requests/:estimateRequestId
   * soft cancel — status=CANCELED, isActive=false, canceledAt 설정
   * // 2026.08.03 정슬기 - [수정] soft cancel 정책 주석 보강
   */
  cancelEstimateRequest: async (req: Request, res: Response) => {
    const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

    const estimateRequest = await estimateRequestService.cancelEstimateRequest(
      estimateRequestId,
      getAuthenticatedUserId(req),
    );

    res.status(200).json({
      success: true,
      data: estimateRequest,
    });
  },

  /**
   * POST /api/estimate-requests/:estimateRequestId/designate
   */
  designateMover: async (req: Request, res: Response) => {
    const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;
    const { moverId } = req.body as DesignateMoverInput;

    const estimateRequest = await estimateRequestService.designateMover({
      estimateRequestId,
      customerId: getAuthenticatedUserId(req),
      moverId,
    });

    res.status(201).json({
      success: true,
      data: estimateRequest,
    });
  },

  /**
   * DELETE /api/estimate-requests/:estimateRequestId/designate/:moverId
   * 지정한 기사님 한 명의 지정 견적 요청을 취소
   */
  cancelDesignatedMover: async (req: Request, res: Response) => {
    const { estimateRequestId, moverId } = res.locals.params as CancelDesignatedMoverParam;

    const estimateRequest = await estimateRequestService.cancelDesignatedMover({
      estimateRequestId,
      customerId: getAuthenticatedUserId(req),
      moverId,
    });

    res.status(200).json({
      success: true,
      data: estimateRequest,
    });
  },
};
