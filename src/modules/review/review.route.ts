import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { reviewController } from "./review.controller";
import { createReviewSchema, listMyReviewQuerySchema } from "./review.validator";

const reviewRouter = Router();

// 리뷰 기능은 고객만 사용할 수 있으므로 라우터 전체에 인증/권한 검사를 적용한다.
reviewRouter.use(authenticate, authorize("CUSTOMER"));

// 내가 작성한 리뷰 목록 조회
reviewRouter.get(
  "/me",
  validate({ query: listMyReviewQuerySchema }),
  reviewController.getMyReviewList,
);

// 리뷰 작성 가능한 견적 목록 조회
reviewRouter.get("/reviewable", reviewController.getReviewableEstimateList);
// 리뷰 작성
reviewRouter.post("/", validate({ body: createReviewSchema }), reviewController.createReview);

export default reviewRouter;
