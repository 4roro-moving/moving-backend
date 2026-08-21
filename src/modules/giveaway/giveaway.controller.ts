import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { giveawayImageService } from "./giveaway-image.service";
import { giveawayService } from "./giveaway.service";
import type {
  CancelGiveawayRequestParam,
  CompleteGiveawayParam,
  CreateGiveawayInput,
  CreateGiveawayRequestInput,
  GiveawayIdParam,
  GiveawayRequestIdParam,
  ListGiveawayQuery,
  ListGiveawayRequestQuery,
  ListMyGiveawayQuery,
  ListMyGiveawayRequestQuery,
  RejectGiveawayRequestParam,
  SelectGiveawayRequestParam,
  UpdateGiveawayInput,
  UpdateGiveawayRequestInput,
} from "./giveaway.type";

function getUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const giveawayController = {
  createImageUploadUrl: async (req: Request, res: Response) => {
    const data = await giveawayImageService.createUploadUrl(getUserId(req), req.body);

    res.status(201).json({
      success: true,
      data,
    });
  },

  getGiveawayList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListGiveawayQuery;
    const result = await giveawayService.listGiveaways(query);

    res.status(200).json({
      success: true,
      data: result.giveaways,
      pagination: result.pagination,
    });
  },

  getMyGiveawayList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListMyGiveawayQuery;
    const result = await giveawayService.listMyGiveaways(getUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.giveaways,
      pagination: result.pagination,
    });
  },

  getReceivedGiveawayList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListMyGiveawayQuery;
    const result = await giveawayService.listReceivedGiveaways(getUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.giveaways,
      pagination: result.pagination,
    });
  },

  getGiveawayById: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;
    const giveaway = await giveawayService.getGiveawayDetail(giveawayId, getUserId(req));

    res.status(200).json({
      success: true,
      data: giveaway,
    });
  },

  createGiveaway: async (req: Request, res: Response) => {
    const giveaway = await giveawayService.createGiveaway(
      getUserId(req),
      req.body as CreateGiveawayInput,
    );

    res.status(201).json({
      success: true,
      data: giveaway,
    });
  },

  updateGiveaway: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;
    const giveaway = await giveawayService.updateGiveaway(
      giveawayId,
      getUserId(req),
      req.body as UpdateGiveawayInput,
    );

    res.status(200).json({
      success: true,
      data: giveaway,
    });
  },

  deleteGiveaway: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;

    await giveawayService.deleteGiveaway(giveawayId, getUserId(req));

    res.status(200).json({
      success: true,
      data: null,
    });
  },

  completeGiveaway: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as CompleteGiveawayParam;
    const giveaway = await giveawayService.completeGiveaway(giveawayId, getUserId(req));

    res.status(200).json({
      success: true,
      data: giveaway,
    });
  },

  getGiveawayRequestList: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;
    const query = res.locals.query as ListGiveawayRequestQuery;
    const result = await giveawayService.listGiveawayRequests(giveawayId, getUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
    });
  },

  createGiveawayRequest: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;
    const request = await giveawayService.createGiveawayRequest(
      giveawayId,
      getUserId(req),
      req.body as CreateGiveawayRequestInput,
    );

    res.status(201).json({
      success: true,
      data: request,
    });
  },

  selectGiveawayRequest: async (req: Request, res: Response) => {
    const { giveawayId, requestId } = res.locals.params as SelectGiveawayRequestParam;
    const giveaway = await giveawayService.selectGiveawayRequest(
      giveawayId,
      requestId,
      getUserId(req),
    );

    res.status(200).json({
      success: true,
      data: giveaway,
    });
  },

  rejectGiveawayRequest: async (req: Request, res: Response) => {
    const { giveawayId, requestId } = res.locals.params as RejectGiveawayRequestParam;
    const request = await giveawayService.rejectGiveawayRequest(
      giveawayId,
      requestId,
      getUserId(req),
    );

    res.status(200).json({
      success: true,
      data: request,
    });
  },

  getMyGiveawayRequestList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListMyGiveawayRequestQuery;
    const result = await giveawayService.listMyGiveawayRequests(getUserId(req), query);

    res.status(200).json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
    });
  },

  updateGiveawayRequest: async (req: Request, res: Response) => {
    const { requestId } = res.locals.params as GiveawayRequestIdParam;
    const request = await giveawayService.updateGiveawayRequest(
      requestId,
      getUserId(req),
      req.body as UpdateGiveawayRequestInput,
    );

    res.status(200).json({
      success: true,
      data: request,
    });
  },

  cancelGiveawayRequest: async (req: Request, res: Response) => {
    const { requestId } = res.locals.params as CancelGiveawayRequestParam;
    const request = await giveawayService.cancelGiveawayRequest(requestId, getUserId(req));

    res.status(200).json({
      success: true,
      data: request,
    });
  },
};
