import type { Request, RequestHandler } from "express";

import { AppError } from "../../lib/app-error";
import { estimateRequestService } from "./estimateRequest.service";
import type {
  CreateEstimateRequestInput,
  DesignateMoverInput,
  EstimateRequestIdParam,
  ListEstimateRequestQuery,
  UpdateEstimateRequestInput,
} from "./estimateRequest.type";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const estimateRequestController = {
  //POST /api/estimate-requests

  createEstimateRequest: (async (req, res, next) => {
    try {
      const estimateRequest = await estimateRequestService.createEstimateRequest({
        customerId: getCustomerId(req),
        input: req.body as CreateEstimateRequestInput,
      });

      res.status(201).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/estimate-requests/active

  getActiveEstimateRequest: (async (req, res, next) => {
    try {
      const estimateRequest = await estimateRequestService.getActiveEstimateRequest(
        getCustomerId(req),
      );

      res.status(200).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/estimate-requests

  getMyEstimateRequestList: (async (req, res, next) => {
    try {
      const query = res.locals.query as ListEstimateRequestQuery;

      const result = await estimateRequestService.getMyEstimateRequestList(
        getCustomerId(req),
        query,
      );

      res.status(200).json({
        success: true,
        data: result.estimateRequests,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/estimate-requests/:estimateRequestId

  getEstimateRequestById: (async (req, res, next) => {
    try {
      const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

      const estimateRequest = await estimateRequestService.getEstimateRequestById(
        estimateRequestId,
        getCustomerId(req),
      );

      res.status(200).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // PATCH /api/estimate-requests/:estimateRequestId

  updateEstimateRequest: (async (req, res, next) => {
    try {
      const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

      const estimateRequest = await estimateRequestService.updateEstimateRequest({
        estimateRequestId,
        customerId: getCustomerId(req),
        input: req.body as UpdateEstimateRequestInput,
      });

      res.status(200).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  /**
   * DELETE /api/estimate-requests/:estimateRequestId
   */
  cancelEstimateRequest: (async (req, res, next) => {
    try {
      const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;

      const estimateRequest = await estimateRequestService.cancelEstimateRequest(
        estimateRequestId,
        getCustomerId(req),
      );

      res.status(200).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  /**
   * POST /api/estimate-requests/:estimateRequestId/designate
   */
  designateMover: (async (req, res, next) => {
    try {
      const { estimateRequestId } = res.locals.params as EstimateRequestIdParam;
      const { moverId } = req.body as DesignateMoverInput;

      const estimateRequest = await estimateRequestService.designateMover({
        estimateRequestId,
        customerId: getCustomerId(req),
        moverId,
      });

      res.status(201).json({
        success: true,
        data: estimateRequest,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,
};
