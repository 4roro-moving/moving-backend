import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { residenceReviewService } from "./residence-review.service";
import type {
  CreateResidenceReviewInput,
  ListMyResidenceReviewQuery,
  ListResidenceReviewQuery,
  RegionIdParam,
  ResidenceReviewIdParam,
  UpdateResidenceReviewInput,
} from "./residence-review.type";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

async function getPublicResidenceReviewList(_req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.query as ListResidenceReviewQuery;
    const result = await residenceReviewService.getPublicResidenceReviewList(query);

    res.status(200).json({
      success: true,
      data: result.reviews,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getPublicResidenceReviewById(_req: Request, res: Response, next: NextFunction) {
  try {
    const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
    const review = await residenceReviewService.getPublicResidenceReviewById(residenceReviewId);

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
}

async function getRegionReviewStatistic(_req: Request, res: Response, next: NextFunction) {
  try {
    const { regionId } = res.locals.params as RegionIdParam;
    const statistic = await residenceReviewService.getRegionReviewStatistic(regionId);

    res.status(200).json({
      success: true,
      data: statistic,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyResidenceReviewList(req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.query as ListMyResidenceReviewQuery;
    const result = await residenceReviewService.getMyResidenceReviewList(getCustomerId(req), query);

    res.status(200).json({
      success: true,
      data: result.reviews,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function createResidenceReview(req: Request, res: Response, next: NextFunction) {
  try {
    const review = await residenceReviewService.createResidenceReview(
      getCustomerId(req),
      req.body as CreateResidenceReviewInput,
    );

    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
}

async function updateResidenceReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
    const review = await residenceReviewService.updateResidenceReview(
      residenceReviewId,
      getCustomerId(req),
      req.body as UpdateResidenceReviewInput,
    );

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteResidenceReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
    const result = await residenceReviewService.deleteResidenceReview(
      residenceReviewId,
      getCustomerId(req),
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export const residenceReviewController = {
  getPublicResidenceReviewList,
  getPublicResidenceReviewById,
  getRegionReviewStatistic,
  getMyResidenceReviewList,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
};
