import type { RequestHandler } from "express";

import { getAuthenticatedUserId } from "../../../utils/request-auth.util";
import { moverEstimateRequestService, moverSentEstimateService } from "./mover-estimate.service";
import type {
  MoverEstimateRequestListQuery,
  MoverEstimateRejectionListQuery,
  MoverSentEstimateIdParam,
  MoverSentEstimateListQuery,
  RejectEstimateInput,
  SendEstimateInput,
  SendEstimateParam,
} from "./mover-estimate.type";

/*
2026.07.21 add 윤소정
*/

// =============================================================================
// 인증 사용자 ID 조회
// =============================================================================
// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================
const getList: RequestHandler = async (req, res) => {
  const moverId = getAuthenticatedUserId(req);
  const query = res.locals.query as MoverEstimateRequestListQuery;
  const result = await moverEstimateRequestService.getList(moverId, query);

  res.status(200).json({
    success: true,
    data: result,
  });
};

//기사 견적 반려 내역 조회
const getRejections: RequestHandler = async (req, res) => {
  const query = res.locals.query as MoverEstimateRejectionListQuery;
  const result = await moverEstimateRequestService.getRejections(
    getAuthenticatedUserId(req),
    query,
  );

  res.status(200).json({
    success: true,
    data: result,
  });
};

//기사 보낸 견적 조회
const getSentEstimates: RequestHandler = async (req, res) => {
  const query = res.locals.query as MoverSentEstimateListQuery;
  const result = await moverSentEstimateService.getList(getAuthenticatedUserId(req), query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

//기사 견적 상세
const getSentEstimateDetail: RequestHandler = async (req, res) => {
  const { estimateId } = res.locals.params as MoverSentEstimateIdParam;
  const result = await moverSentEstimateService.getDetail(getAuthenticatedUserId(req), estimateId);

  res.status(200).json({
    success: true,
    data: result,
  });
};

const completeSentEstimate: RequestHandler = async (req, res) => {
  const { estimateId } = res.locals.params as MoverSentEstimateIdParam;
  const result = await moverSentEstimateService.complete(getAuthenticatedUserId(req), estimateId);

  res.status(200).json({
    success: true,
    data: result,
  });
};

// 기사가 고객의 견적 요청에 견적을 전송
const sendEstimate: RequestHandler = async (req, res) => {
  const { estimateRequestId } = res.locals.params as SendEstimateParam;
  const input = req.body as SendEstimateInput;

  const estimate = await moverEstimateRequestService.sendEstimate({
    estimateRequestId,
    moverId: getAuthenticatedUserId(req),
    input,
  });

  res.status(201).json({
    success: true,
    data: estimate,
  });
};

// 기사가 고객의 견적 요청을 반려
const rejectEstimate: RequestHandler = async (req, res) => {
  const { estimateRequestId } = res.locals.params as SendEstimateParam;
  const input = req.body as RejectEstimateInput;

  const rejection = await moverEstimateRequestService.rejectEstimate({
    estimateRequestId,
    moverId: getAuthenticatedUserId(req),
    input,
  });

  res.status(201).json({
    success: true,
    data: rejection,
  });
};

export const moverEstimateController = {
  getList,
  getRejections,
  getSentEstimates,
  getSentEstimateDetail,
  completeSentEstimate,
  sendEstimate,
  rejectEstimate,
};
