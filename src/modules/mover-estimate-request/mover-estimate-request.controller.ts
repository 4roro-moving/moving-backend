import type { Request, RequestHandler } from "express";

import { AppError } from "../../lib/app-error";
import { moverEstimateRequestService } from "./mover-estimate-request.service";
import type { MoverEstimateRequestListQuery } from "./mover-estimate-request.type";

/* 
2026.07.21 add 윤소정
*/

//로그인한 기사 ID
function getMoverId(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

//받은 견적 요청 목록 조회 함수
const getList: RequestHandler = async (req, res, next) => {
  try {
    const moverId = getMoverId(req);
    const query = res.locals.query as MoverEstimateRequestListQuery;
    const result = await moverEstimateRequestService.getList(moverId, query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const moverEstimateRequestController = {
  getList,
};
