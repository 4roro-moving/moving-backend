import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { residenceReviewService } from "./residence-review.service";
import { HTTP_STATUS } from "./residence-review.type";
import type {
  CreateResidenceReviewInput,
  ListMyResidenceReviewQuery,
  ListResidenceReviewQuery,
  ResidenceReviewIdParam,
  UpdateResidenceReviewInput,
} from "./residence-review.type";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

async function getPublicResidenceReviewList(_req: Request, res: Response) {
  const query = res.locals.query as ListResidenceReviewQuery;
  const result = await residenceReviewService.getPublicResidenceReviewList(query);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result.reviews,
    pagination: result.pagination,
  });
}

async function getPublicResidenceReviewById(_req: Request, res: Response) {
  const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
  const review = await residenceReviewService.getPublicResidenceReviewById(residenceReviewId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: review,
  });
}

async function getMyResidenceReviewList(req: Request, res: Response) {
  const query = res.locals.query as ListMyResidenceReviewQuery;
  const result = await residenceReviewService.getMyResidenceReviewList(getCustomerId(req), query);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result.reviews,
    pagination: result.pagination,
  });
}

async function createResidenceReview(req: Request, res: Response) {
  const review = await residenceReviewService.createResidenceReview(
    getCustomerId(req),
    req.body as CreateResidenceReviewInput,
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: review,
  });
}

async function updateResidenceReview(req: Request, res: Response) {
  const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
  const review = await residenceReviewService.updateResidenceReview(
    residenceReviewId,
    getCustomerId(req),
    req.body as UpdateResidenceReviewInput,
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: review,
  });
}

async function deleteResidenceReview(req: Request, res: Response) {
  const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
  const result = await residenceReviewService.deleteResidenceReview(
    residenceReviewId,
    getCustomerId(req),
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
}

export const residenceReviewController = {
  getPublicResidenceReviewList,
  getPublicResidenceReviewById,
  getMyResidenceReviewList,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
};
